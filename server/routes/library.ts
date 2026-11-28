import type { FastifyInstance, FastifyReply } from 'fastify';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import yazl from 'yazl';
import { FALLBACK_CATEGORY } from '../../shared/categories.ts';
import { colorAt, isColor } from '../../shared/colors.ts';
import { fail, requireAuth } from '../app.ts';
import { hashToken, newId, newToken } from '../auth/crypto.ts';
import { tx, type DB } from '../db.ts';
import { loadPrefs } from './organize.ts';
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
  color: string;
}

const categoryDto = (c: CategoryRow) => ({ id: c.id, name: c.name, color: c.color, fixed: c.id === FALLBACK_CATEGORY });

/** Etiquetes o persones d'un conjunt de documents: { fileId → [id, …] }. */
function linksFor(db: DB, table: 'file_tags' | 'file_people', col: 'tag_id' | 'person_id') {
  const rows = db.prepare(`SELECT file_id, ${col} AS other FROM ${table}`).all() as { file_id: string; other: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.file_id);
    if (list) list.push(r.other);
    else map.set(r.file_id, [r.other]);
  }
  return map;
}

/** Llegeix una llista d'ids (JSON o array) i descarta els que no existeixen. */
function idList(db: DB, table: 'tags' | 'people', raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`);
  return [...new Set(list.map(String))].filter((id) => exists.get(id)).slice(0, 50);
}

const MAX_THUMB_BYTES = 512 * 1024;

function toFileDto(f: FileRow, tags: string[] = [], people: string[] = []) {
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
    tags,
    people,
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

  const fileDto = (f: FileRow) => {
    const tags = db.prepare('SELECT tag_id FROM file_tags WHERE file_id = ?').all(f.id) as { tag_id: string }[];
    const people = db.prepare('SELECT person_id FROM file_people WHERE file_id = ?').all(f.id) as { person_id: string }[];
    return toFileDto(f, tags.map((t) => t.tag_id), people.map((p) => p.person_id));
  };
  const setLinks = (fileId: string, tags: string[] | null, people: string[] | null) => {
    if (tags) {
      db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId);
      const ins = db.prepare('INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)');
      tags.forEach((t) => ins.run(fileId, t));
    }
    if (people) {
      db.prepare('DELETE FROM file_people WHERE file_id = ?').run(fileId);
      const ins = db.prepare('INSERT INTO file_people (file_id, person_id) VALUES (?, ?)');
      people.forEach((p) => ins.run(fileId, p));
    }
  };

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
      const rows = db.prepare('SELECT id, name, position, color FROM categories ORDER BY position, created_at').all() as unknown as CategoryRow[];
      return { categories: rows.map(categoryDto) };
    });

    api.post('/api/categories', async (request) => {
      const body = (request.body ?? {}) as { name?: unknown; color?: unknown };
      const name = String(body.name ?? '').trim().slice(0, 60);
      if (!name) fail(400, 'Escriu un nom per a la categoria.');
      const exists = db.prepare('SELECT 1 FROM categories WHERE lower(name) = lower(?)').get(name);
      if (exists) fail(409, 'Ja hi ha una categoria amb aquest nom.');
      let id = slugify(name);
      while (categoryExists(id)) id = `${slugify(name)}-${newId().slice(0, 4).toLowerCase()}`;
      const pos = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM categories').get() as { p: number }).p;
      const n = (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n;
      const color = isColor(body.color) ? body.color.toLowerCase() : colorAt(n);
      db.prepare('INSERT INTO categories (id, name, position, color, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, pos, color, new Date().toISOString());
      return { category: categoryDto({ id, name, position: pos, color }) };
    });

    // Reordena les categories: rep tots els ids en l'ordre desitjat.
    api.put('/api/categories/order', async (request) => {
      const ids = (request.body as { ids?: unknown } | undefined)?.ids;
      if (!Array.isArray(ids)) fail(400, 'Ordre no vàlid.');
      const upd = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
      tx(db, () => ids.map(String).filter(categoryExists).forEach((id, i) => upd.run(i, id)));
      return { ok: true };
    });

    api.patch<{ Params: { id: string } }>('/api/categories/:id', async (request) => {
      const body = (request.body ?? {}) as { name?: unknown; color?: unknown };
      const cur = db.prepare('SELECT id, name, position, color FROM categories WHERE id = ?').get(request.params.id) as CategoryRow | undefined;
      if (!cur) fail(404, 'Aquesta categoria no existeix.');
      let name = cur.name;
      if (body.name !== undefined) {
        name = String(body.name).trim().slice(0, 60);
        if (!name) fail(400, 'Escriu un nom per a la categoria.');
        if (db.prepare('SELECT 1 FROM categories WHERE lower(name) = lower(?) AND id != ?').get(name, cur.id)) fail(409, 'Ja hi ha una categoria amb aquest nom.');
      }
      let color = cur.color;
      if (body.color !== undefined) {
        if (!isColor(body.color)) fail(400, 'Color no vàlid.');
        color = body.color.toLowerCase();
      }
      db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(name, color, cur.id);
      return { category: categoryDto({ ...cur, name, color }) };
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
      const tags = linksFor(db, 'file_tags', 'tag_id');
      const people = linksFor(db, 'file_people', 'person_id');
      return { files: rows.map((f) => toFileDto(f, tags.get(f.id) ?? [], people.get(f.id) ?? [])), usedBytes: used };
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
        setLinks(id, idList(db, 'tags', fields.tags), idList(db, 'people', fields.people));
        return { file: fileDto(getFile(id)!) };
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
      tx(db, () => {
        db.prepare('UPDATE files SET name = ?, category_id = ?, doc_date = ? WHERE id = ?').run(next.name, next.category, next.date, f.id);
        setLinks(f.id, body.tags !== undefined ? idList(db, 'tags', body.tags) : null, body.people !== undefined ? idList(db, 'people', body.people) : null);
      });
      return { file: fileDto(getFile(f.id)!) };
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

    // La web genera la miniatura (només el navegador sap dibuixar PDF i imatges) i la desa aquí.
    // Serveix per als documents que s'han importat sense passar per la pujada de la web.
    api.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_THUMB_BYTES }, (_req, body, done) => done(null, body));
    api.put<{ Params: { id: string }; Querystring: { pages?: string } }>('/api/files/:id/thumb', async (request) => {
      const f = mustFile(request.params.id);
      const buf = request.body;
      if (!Buffer.isBuffer(buf) || !isJpeg(buf)) fail(415, 'La miniatura ha de ser un JPEG.');
      await writeFile(storage.thumbPath(f.id), buf);
      const pagesNum = Number(request.query.pages);
      const pages = Number.isInteger(pagesNum) && pagesNum > 0 && pagesNum < 100000 ? pagesNum : f.pages;
      db.prepare('UPDATE files SET has_thumb = 1, pages = ? WHERE id = ?').run(pages, f.id);
      return { file: fileDto(getFile(f.id)!) };
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
      const hours = Number((request.body as { hours?: unknown } | undefined)?.hours) || loadPrefs(db).shareHours;
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
