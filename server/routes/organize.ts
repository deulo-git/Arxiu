import type { FastifyInstance } from 'fastify';
import { colorAt, isColor } from '../../shared/colors.ts';
import { DEFAULT_PREFS, sanitizePrefs, type Prefs } from '../../shared/prefs.ts';
import { fail, requireAuth } from '../app.ts';
import { newId } from '../auth/crypto.ts';
import { tx, type DB } from '../db.ts';

export function loadPrefs(db: DB): Prefs {
  const rows = db.prepare('SELECT key, value FROM prefs').all() as { key: string; value: string }[];
  const raw: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      raw[r.key] = JSON.parse(r.value);
    } catch {
      /* valor malmès: s'ignora */
    }
  }
  return sanitizePrefs(raw, DEFAULT_PREFS);
}

interface Spec {
  table: 'tags' | 'people';
  link: 'file_tags' | 'file_people';
  linkCol: 'tag_id' | 'person_id';
  noun: string;
  nounThe: string;
}

/** Etiquetes i persones tenen el mateix comportament: nom únic, color i (a les persones) notes. */
export async function organizeRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  await app.register(async (api) => {
    api.addHook('preHandler', requireAuth);

    api.get('/api/prefs', async () => ({ prefs: loadPrefs(db) }));

    api.put('/api/prefs', async (request) => {
      const next = sanitizePrefs(request.body, loadPrefs(db));
      tx(db, () => {
        const up = db.prepare('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        for (const [k, v] of Object.entries(next)) up.run(k, JSON.stringify(v));
      });
      return { prefs: next };
    });

    const crud = (path: string, spec: Spec) => {
      const { table, link, linkCol, noun, nounThe } = spec;
      const withNotes = table === 'people';
      const dto = (r: { id: string; name: string; color: string; notes?: string }) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        ...(withNotes ? { notes: r.notes ?? '' } : {}),
      });
      const get = (id: string) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as { id: string; name: string; color: string; notes?: string } | undefined;
      const must = (id: string) => get(id) ?? fail(404, `${noun[0].toUpperCase()}${noun.slice(1)} no existeix.`);
      const cleanName = (v: unknown) => {
        const name = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) fail(400, `Escriu un nom per a ${nounThe}.`);
        return name;
      };
      const dup = (name: string, exceptId = '') => {
        if (db.prepare(`SELECT 1 FROM ${table} WHERE lower(name) = lower(?) AND id != ?`).get(name, exceptId)) {
          fail(409, `Ja hi ha ${noun} amb aquest nom.`);
        }
      };

      api.get(path, async () => {
        const rows = db.prepare(`SELECT * FROM ${table} ORDER BY name COLLATE NOCASE`).all() as unknown as Parameters<typeof dto>[0][];
        return { items: rows.map(dto) };
      });

      api.post(path, async (request) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const name = cleanName(body.name);
        dup(name);
        const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
        const color = isColor(body.color) ? body.color.toLowerCase() : colorAt(n);
        const notes = withNotes ? String(body.notes ?? '').slice(0, 500) : '';
        const id = newId();
        if (withNotes) db.prepare('INSERT INTO people (id, name, color, notes, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, color, notes, new Date().toISOString());
        else db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, name, color, new Date().toISOString());
        return { item: dto(get(id)!) };
      });

      api.patch<{ Params: { id: string } }>(`${path}/:id`, async (request) => {
        const cur = must(request.params.id);
        const body = (request.body ?? {}) as Record<string, unknown>;
        const name = body.name !== undefined ? cleanName(body.name) : cur.name;
        dup(name, cur.id);
        let color = cur.color;
        if (body.color !== undefined) {
          if (!isColor(body.color)) fail(400, 'Color no vàlid.');
          color = body.color.toLowerCase();
        }
        if (withNotes) {
          const notes = body.notes !== undefined ? String(body.notes).slice(0, 500) : (cur.notes ?? '');
          db.prepare('UPDATE people SET name = ?, color = ?, notes = ? WHERE id = ?').run(name, color, notes, cur.id);
        } else {
          db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, cur.id);
        }
        return { item: dto(get(cur.id)!) };
      });

      api.delete<{ Params: { id: string } }>(`${path}/:id`, async (request) => {
        const cur = must(request.params.id);
        const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${link} WHERE ${linkCol} = ?`).get(cur.id) as { n: number }).n;
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(cur.id);
        return { ok: true, unlinked: n };
      });

      // Fusiona un element dins d'un altre (p. ex. dues etiquetes que volien dir el mateix).
      api.post<{ Params: { id: string } }>(`${path}/:id/merge`, async (request) => {
        const from = must(request.params.id);
        const into = must(String((request.body as { into?: unknown } | undefined)?.into ?? ''));
        if (from.id === into.id) fail(400, 'Tria un element diferent.');
        tx(db, () => {
          db.prepare(`INSERT OR IGNORE INTO ${link} (file_id, ${linkCol}) SELECT file_id, ? FROM ${link} WHERE ${linkCol} = ?`).run(into.id, from.id);
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(from.id);
        });
        return { ok: true };
      });
    };

    crud('/api/tags', { table: 'tags', link: 'file_tags', linkCol: 'tag_id', noun: 'una etiqueta', nounThe: "l'etiqueta" });
    crud('/api/people', { table: 'people', link: 'file_people', linkCol: 'person_id', noun: 'una persona', nounThe: 'la persona' });
  });
}
