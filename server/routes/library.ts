import type { FastifyInstance, FastifyReply } from 'fastify';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import yazl from 'yazl';
import { FALLBACK_CATEGORY } from '../../shared/categories.ts';
import { fail, requireAuth } from '../app.ts';
import { hashToken, newId, newToken } from '../auth/crypto.ts';
import { tx } from '../db.ts';
import { cleanFileName, contentDisposition, detectType, isIsoDate, isJpeg } from '../files/types.ts';

interface FileRow {
  id: string;
  name: string;
  category_id: string;
  doc_date: string;
  added_at: string;
  size: number;
  mime: string;
  kind: string;
  pages: number | null;
  sha256: string;
  has_thumb: number;
}

interface CategoryRow {
  id: string;
  name: string;
  position: number;
}

const MAX_THUMB_BYTES = 512 * 1024;

function toFileDto(f: FileRow) {
  return {
    id: f.id,
    name: f.name,
    category: f.category_id,
    date: f.doc_date,
    addedAt: f.added_at,
    size: f.size,
    mime: f.mime,
    kind: f.kind,
    type: typeLabel(f),
    pages: f.pages,
    hasThumb: !!f.has_thumb,
  };
}

function typeLabel(f: FileRow) {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WEBP',
    'image/gif': 'GIF',
    'image/heic': 'HEIC',
    'image/heif': 'HEIF',
  };
  return map[f.mime] ?? 'DOC';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slugify(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'categoria'
  );
}

export async function libraryRoutes(app: FastifyInstance) {
  const { db, config, storage } = app.deps;

  const getFile = (id: string) => db.prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined;
  const mustFile = (id: string) => getFile(id) ?? fail(404, 'Aquest document no existeix.');
  const categoryExists = (id: string | undefined) => !!id && !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);

  const sendFile = (reply: FastifyReply, f: FileRow, disposition: 'inline' | 'attachment', cache: string) => {
    const p = storage.filePath(f.id);
    if (!existsSync(p)) fail(404, "No s'ha trobat el contingut del document.");
    return reply
      .type(f.mime)
      .header('content-length', statSync(p).size)
      .header('content-disposition', contentDisposition(disposition, f.name))
      .header('cache-control', cache)
      .send(createReadStream(p));
  };

  await app.register(async (api) => {
    api.addHook('preHandler', requireAuth);

    /* ---------- Categories ---------- */

    api.get('/api/categories', async () => {
      const rows = db.prepare('SELECT id, name, position FROM categories ORDER BY position, created_at').all() as unknown as CategoryRow[];
      return { categories: rows.map((c) => ({ id: c.id, name: c.name, fixed: c.id === FALLBACK_CATEGORY })) };
    });

    api.post('/api/categories', async (request) => {
      const name = String((request.body as { name?: unknown })?.name ?? '').trim().slice(0, 60);
      if (!name) fail(400, 'Escriu un nom per a la categoria.');
      const exists = db.prepare('SELECT 1 FROM categories WHERE lower(name) = lower(?)').get(name);
      if (exists) fail(409, 'Ja hi ha una categoria amb aquest nom.');
      let id = slugify(name);
      while (categoryExists(id)) id = `${slugify(name)}-${newId().slice(0, 4).toLowerCase()}`;
      const pos = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM categories').get() as { p: number }).p;
      db.prepare('INSERT INTO categories (id, name, position, created_at) VALUES (?, ?, ?, ?)').run(id, name, pos, new Date().toISOString());
      return { category: { id, name, fixed: false } };
    });

    api.patch<{ Params: { id: string } }>('/api/categories/:id', async (request) => {
      const name = String((request.body as { name?: unknown })?.name ?? '').trim().slice(0, 60);
      if (!name) fail(400, 'Escriu un nom per a la categoria.');
      if (!categoryExists(request.params.id)) fail(404, 'Aquesta categoria no existeix.');
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, request.params.id);
      return { category: { id: request.params.id, name, fixed: request.params.id === FALLBACK_CATEGORY } };
    });

    api.delete<{ Params: { id: string } }>('/api/categories/:id', async (request) => {
      const { id } = request.params;
      if (id === FALLBACK_CATEGORY) fail(400, 'Aquesta categoria no es pot eliminar.');
      if (!categoryExists(id)) fail(404, 'Aquesta categoria no existeix.');
      const moved = tx(db, () => {
        const r = db.prepare('UPDATE files SET category_id = ? WHERE category_id = ?').run(FALLBACK_CATEGORY, id);
        db.prepare('DELETE FROM categories WHERE id = ?').run(id);
        return Number(r.changes);
      });
      return { ok: true, moved };
    });

    /* ---------- Documents ---------- */

    api.get('/api/files', async () => {
      const rows = db.prepare('SELECT * FROM files ORDER BY doc_date DESC, added_at DESC').all() as unknown as FileRow[];
      const used = rows.reduce((a, f) => a + f.size, 0);
      return { files: rows.map(toFileDto), usedBytes: used };
    });

    api.post('/api/files', async (request) => {
      const fields: Record<string, string> = {};
      let upload: Awaited<ReturnType<typeof storage.writeTemp>> | null = null;
      let originalName = '';
      let thumb: Buffer | null = null;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname === 'file' && !upload) {
              originalName = part.filename;
              upload = await storage.writeTemp(part.file);
              if (part.file.truncated) fail(413, `L'arxiu supera el límit de ${Math.round(config.maxUploadBytes / 1048576)} MB.`);
            } else if (part.fieldname === 'thumb' && !thumb) {
              const buf = await part.toBuffer();
              if (buf.length <= MAX_THUMB_BYTES && isJpeg(buf)) thumb = buf;
            } else {
              part.file.resume();
            }
          } else {
            fields[part.fieldname] = String(part.value ?? '');
          }
        }
        if (!upload) fail(400, 'No s’ha rebut cap arxiu.');
        if (upload.size === 0) fail(400, "L'arxiu és buit.");
        const type = detectType(upload.head);
        if (!type) fail(415, 'Format no admès. Puja un PDF o una imatge (JPG, PNG, HEIC o WEBP).');

        const id = newId();
        const category = categoryExists(fields.category) ? fields.category : FALLBACK_CATEGORY;
        const date = isIsoDate(fields.date) ? fields.date : today();
        const pagesNum = Number(fields.pages);
        const pages = Number.isInteger(pagesNum) && pagesNum > 0 && pagesNum < 100000 ? pagesNum : type.kind === 'image' ? 1 : null;
        const name = cleanFileName(fields.name || originalName);

        const shaValue = upload.sha256;
        await storage.commit(upload.tmp, storage.filePath(id));
        upload = null;
        if (thumb) await writeFile(storage.thumbPath(id), thumb);
        db.prepare(
          `INSERT INTO files (id, name, category_id, doc_date, added_at, size, mime, kind, pages, sha256, has_thumb)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, name, category, date, new Date().toISOString(), statSync(storage.filePath(id)).size, type.mime, type.kind, pages, shaValue, thumb ? 1 : 0);
        return { file: toFileDto(getFile(id)!) };
      } finally {
        if (upload) await storage.remove(upload.tmp);
      }
    });

    api.patch<{ Params: { id: string } }>('/api/files/:id', async (request) => {
      const f = mustFile(request.params.id);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const next = { name: f.name, category: f.category_id, date: f.doc_date };
      if (body.name !== undefined) next.name = cleanFileName(String(body.name));
      if (body.category !== undefined) {
        if (!categoryExists(String(body.category))) fail(400, 'Aquesta categoria no existeix.');
        next.category = String(body.category);
      }
      if (body.date !== undefined) {
        if (!isIsoDate(body.date)) fail(400, 'Data no vàlida.');
        next.date = body.date;
      }
      db.prepare('UPDATE files SET name = ?, category_id = ?, doc_date = ? WHERE id = ?').run(next.name, next.category, next.date, f.id);
      return { file: toFileDto(getFile(f.id)!) };
    });

    api.delete<{ Params: { id: string } }>('/api/files/:id', async (request) => {
      const f = mustFile(request.params.id);
      db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
      await storage.remove(storage.filePath(f.id), storage.thumbPath(f.id));
      return { ok: true };
    });

    api.get<{ Params: { id: string }; Querystring: { download?: string } }>('/api/files/:id/content', async (request, reply) => {
      const f = mustFile(request.params.id);
      return sendFile(reply, f, request.query.download ? 'attachment' : 'inline', 'private, max-age=86400');
    });

    api.get<{ Params: { id: string } }>('/api/files/:id/thumb', async (request, reply) => {
      const f = mustFile(request.params.id);
      const p = storage.thumbPath(f.id);
      if (!f.has_thumb || !existsSync(p)) fail(404, 'Sense miniatura.');
      return reply.type('image/jpeg').header('cache-control', 'private, max-age=86400').send(createReadStream(p));
    });

    /* ---------- Enllaços per compartir ---------- */

    api.post<{ Params: { id: string } }>('/api/files/:id/shares', async (request) => {
      const f = mustFile(request.params.id);
      const hours = Number((request.body as { hours?: unknown } | undefined)?.hours) || config.shareHours;
      if (hours < 1 || hours > 24 * 30) fail(400, 'Durada no vàlida.');
      const token = newToken(24);
      const now = Date.now();
      const id = newId();
      const expiresAt = now + hours * 3_600_000;
      db.prepare('INSERT INTO shares (id, token_hash, file_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
        id,
        hashToken(token),
        f.id,
        now,
        expiresAt,
      );
      return { share: { id, url: `${config.publicUrl}/s/${token}`, createdAt: now, expiresAt } };
    });

    api.get<{ Params: { id: string } }>('/api/files/:id/shares', async (request) => {
      const f = mustFile(request.params.id);
      const rows = db
        .prepare('SELECT id, created_at, expires_at FROM shares WHERE file_id = ? AND expires_at > ? ORDER BY created_at DESC')
        .all(f.id, Date.now()) as { id: string; created_at: number; expires_at: number }[];
      return { shares: rows.map((s) => ({ id: s.id, createdAt: s.created_at, expiresAt: s.expires_at })) };
    });

    api.delete<{ Params: { id: string } }>('/api/shares/:id', async (request) => {
      db.prepare('DELETE FROM shares WHERE id = ?').run(request.params.id);
      return { ok: true };
    });

    /* ---------- Còpia de seguretat ---------- */

    api.get('/api/export', async (_request, reply) => {
      const files = db
        .prepare('SELECT f.*, c.name AS category_name FROM files f JOIN categories c ON c.id = f.category_id ORDER BY f.doc_date')
        .all() as unknown as (FileRow & { category_name: string })[];
      const zip = new yazl.ZipFile();
      const used = new Set<string>();
      for (const f of files) {
        const p = storage.filePath(f.id);
        if (!existsSync(p)) continue;
        const folder = f.category_name.replace(/[\\/:*?"<>|]/g, '_');
        let entry = `Arxiu/${folder}/${f.doc_date} ${f.name}`;
        for (let n = 2; used.has(entry.toLowerCase()); n++) entry = `Arxiu/${folder}/${f.doc_date} (${n}) ${f.name}`;
        used.add(entry.toLowerCase());
        zip.addFile(p, entry, { compress: f.kind !== 'image' });
      }
      zip.end();
      return reply
        .type('application/zip')
        .header('content-disposition', contentDisposition('attachment', `arxiu-${today()}.zip`))
        .send(zip.outputStream);
    });
  });

  /* ---------- Enllaç públic ---------- */
  app.get<{ Params: { token: string } }>(
    '/s/:token',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const row = db
        .prepare('SELECT s.expires_at, f.* FROM shares s JOIN files f ON f.id = s.file_id WHERE s.token_hash = ?')
        .get(hashToken(request.params.token)) as (FileRow & { expires_at: number }) | undefined;
      if (!row || row.expires_at < Date.now()) {
        return reply.code(410).type('text/html; charset=utf-8').send(expiredPage());
      }
      reply.header('x-robots-tag', 'noindex');
      return sendFile(reply, row, 'inline', 'private, no-store');
    },
  );
}

function expiredPage() {
  return `<!doctype html><html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enllaç caducat · Arxiu</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FAF6F1;color:#2B1F16;font-family:system-ui,sans-serif;padding:16px">
<div style="max-width:420px;text-align:center"><h1 style="font-size:22px">Aquest enllaç ja no és vàlid</h1>
<p style="color:#6E5A4A;line-height:1.5">Els enllaços compartits caduquen al cap d'un temps o es poden revocar. Demana a qui te l'ha enviat que en generi un de nou.</p></div></body></html>`;
}
