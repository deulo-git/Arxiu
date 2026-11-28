/**
 * Importació massiva de documents des d'una carpeta, per l'API de l'Arxiu
 * (serveix per al servidor local i, més endavant, per al del VPS).
 *
 *   npm run import:scan -- "C:\Users\nom\Documents\Personal"   llista els arxius → importar/manifest.json
 *   npm run import:taxonomy                                      mostra categories, etiquetes i persones que ja hi ha
 *   npm run import:apply -- importar/pla.json                    resum del que es faria (no puja res)
 *   npm run import:apply -- importar/pla.json --yes              puja de debò
 *
 * Variables opcionals: ARXIU_URL (per defecte http://localhost:3000), ARXIU_EMAIL, ARXIU_PASSWORD.
 * Si no hi són, les demana per pantalla (la contrasenya no es mostra ni es desa).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';

const BASE = (process.env.ARXIU_URL || 'http://localhost:3000').replace(/\/+$/, '');
const WORK = 'importar';
const MANIFEST = path.join(WORK, 'manifest.json');
const DONE = path.join(WORK, 'fet.json');
const EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);

/* ---------- Utilitats ---------- */

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, enc, cb) {
      if (!muted) process.stdout.write(chunk, enc);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('ca').replace(/\s+/g, ' ').trim();
const isIsoDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* ---------- Client de l'API ---------- */

class Client {
  cookie = '';

  async call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(BASE + url, {
      method,
      headers: {
        'x-arxiu': '1',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const sid = res.headers.getSetCookie().find((c) => c.startsWith('arxiu_sid='));
    if (sid) this.cookie = sid.split(';')[0];
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data as T;
  }

  async login() {
    const email = process.env.ARXIU_EMAIL || (await ask('Correu de l\'Arxiu: '));
    const password = process.env.ARXIU_PASSWORD || (await ask('Contrasenya: ', true));
    const r = await this.call<{ next: string }>('POST', '/api/auth/login', { email, password });
    if (r.next === '2fa') await this.call('POST', '/api/auth/2fa', { code: await ask('Codi de verificació (2FA): ') });
  }
}

interface Named {
  id: string;
  name: string;
}

/* ---------- scan ---------- */

async function walk(dir: string, root: string, out: { path: string; size: number; mtime: string }[], skipped: string[]) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await walk(full, root, out, skipped);
    } else if (entry.isFile()) {
      const rel = path.relative(root, full);
      if (!EXTS.has(path.extname(entry.name).toLowerCase())) {
        skipped.push(rel);
        continue;
      }
      const st = await stat(full);
      out.push({ path: rel, size: st.size, mtime: st.mtime.toISOString().slice(0, 10) });
    }
  }
}

async function scan(folder: string | undefined) {
  if (!folder) throw new Error('Indica la carpeta: npm run import:scan -- "C:\\ruta\\a\\la\\carpeta"');
  const root = path.resolve(folder);
  if (!existsSync(root)) throw new Error(`No existeix la carpeta: ${root}`);
  const files: { path: string; size: number; mtime: string }[] = [];
  const skipped: string[] = [];
  await walk(root, root, files, skipped);
  files.sort((a, b) => a.path.localeCompare(b.path, 'ca'));
  const items = files.map((f) => ({
    path: f.path,
    name: path.basename(f.path),
    folders: path.dirname(f.path) === '.' ? [] : path.dirname(f.path).split(path.sep),
    size: f.size,
    modified: f.mtime,
  }));
  writeJson(MANIFEST, { root, count: items.length, items });
  console.log(`${items.length} arxius admesos trobats a ${root}`);
  const folders = new Map<string, number>();
  items.forEach((i) => folders.set(i.folders.join(' / ') || '(arrel)', (folders.get(i.folders.join(' / ') || '(arrel)') ?? 0) + 1));
  for (const [f, n] of folders) console.log(`  ${String(n).padStart(4)}  ${f}`);
  if (skipped.length) console.log(`\nS'han ignorat ${skipped.length} arxius d'altres formats (Word, Excel, etc.). Primers: ${skipped.slice(0, 5).join(', ')}`);
  console.log(`\nLlista desada a ${MANIFEST}`);
}

/* ---------- taxonomy ---------- */

async function taxonomy(c: Client) {
  const [cats, tags, people] = await Promise.all([
    c.call<{ categories: Named[] }>('GET', '/api/categories'),
    c.call<{ items: Named[] }>('GET', '/api/tags'),
    c.call<{ items: Named[] }>('GET', '/api/people'),
  ]);
  console.log(
    JSON.stringify({ categories: cats.categories.map((x) => x.name), tags: tags.items.map((x) => x.name), people: people.items.map((x) => x.name) }, null, 2),
  );
}

/* ---------- apply ---------- */

interface PlanItem {
  /** Ruta relativa a `root`, tal com surt al manifest. */
  path: string;
  /** Nom del document (sense extensió, o amb). */
  name: string;
  category: string;
  /** AAAA-MM-DD; si falta, la data de modificació de l'arxiu. */
  date?: string;
  tags?: string[];
  people?: string[];
  /** Per saltar-se un arxiu del pla. */
  skip?: boolean;
}
interface Plan {
  root: string;
  items: PlanItem[];
}

async function apply(file: string | undefined, yes: boolean) {
  if (!file) throw new Error('Indica el pla: npm run import:apply -- importar/pla.json');
  const plan = readJson<Plan | null>(file, null);
  if (!plan?.root || !Array.isArray(plan.items)) throw new Error(`El pla ${file} no té el format esperat ({ root, items: [...] }).`);

  // Validacions abans de tocar res.
  const problems: string[] = [];
  const items = plan.items.filter((i) => !i.skip);
  for (const it of items) {
    const full = path.join(plan.root, it.path);
    if (!existsSync(full)) problems.push(`No existeix: ${it.path}`);
    if (!it.name?.trim()) problems.push(`Sense nom: ${it.path}`);
    if (!it.category?.trim()) problems.push(`Sense categoria: ${it.path}`);
    if (it.date !== undefined && !isIsoDate(it.date)) problems.push(`Data no vàlida («${it.date}»): ${it.path}`);
  }
  if (problems.length) {
    console.log('El pla té problemes; corregeix-los abans de continuar:\n  ' + problems.slice(0, 30).join('\n  '));
    if (problems.length > 30) console.log(`  … i ${problems.length - 30} més`);
    process.exit(1);
  }

  const c = new Client();
  await c.login();
  const [cats, tagsR, peopleR] = await Promise.all([
    c.call<{ categories: Named[] }>('GET', '/api/categories'),
    c.call<{ items: Named[] }>('GET', '/api/tags'),
    c.call<{ items: Named[] }>('GET', '/api/people'),
  ]);
  const catMap = new Map(cats.categories.map((x) => [slug(x.name), x.id]));
  const tagMap = new Map(tagsR.items.map((x) => [slug(x.name), x.id]));
  const personMap = new Map(peopleR.items.map((x) => [slug(x.name), x.id]));

  const needed = {
    categories: new Set(items.map((i) => i.category.trim()).filter((n) => !catMap.has(slug(n)))),
    tags: new Set(items.flatMap((i) => i.tags ?? []).map((n) => n.trim()).filter((n) => n && !tagMap.has(slug(n)))),
    people: new Set(items.flatMap((i) => i.people ?? []).map((n) => n.trim()).filter((n) => n && !personMap.has(slug(n)))),
  };
  const done = readJson<Record<string, string>>(DONE, {});
  const pending = items.filter((i) => !done[i.path]);

  console.log(`Pla: ${items.length} documents (${items.length - pending.length} ja pujats abans, ${pending.length} per pujar)`);
  console.log(`Es crearan: ${needed.categories.size} categories nous, ${needed.tags.size} etiquetes noves, ${needed.people.size} persones noves`);
  if (needed.categories.size) console.log('  Categories: ' + [...needed.categories].join(', '));
  if (needed.people.size) console.log('  Persones:   ' + [...needed.people].join(', '));
  if (needed.tags.size) console.log('  Etiquetes:  ' + [...needed.tags].join(', '));
  if (!yes) {
    console.log('\nNo s\'ha pujat res. Afegeix --yes per pujar de debò.');
    return;
  }

  const ensure = async (kind: 'cat' | 'tag' | 'person', name: string) => {
    const map = kind === 'cat' ? catMap : kind === 'tag' ? tagMap : personMap;
    const key = slug(name);
    const hit = map.get(key);
    if (hit) return hit;
    const url = kind === 'cat' ? '/api/categories' : kind === 'tag' ? '/api/tags' : '/api/people';
    const r = await c.call<{ category?: Named; item?: Named }>('POST', url, { name: name.trim() });
    const id = (r.category ?? r.item)!.id;
    map.set(key, id);
    return id;
  };

  let ok = 0;
  const failed: string[] = [];
  for (const [n, it] of pending.entries()) {
    const full = path.join(plan.root, it.path);
    try {
      const categoryId = await ensure('cat', it.category);
      const tagIds = await Promise.all((it.tags ?? []).filter((t) => t.trim()).map((t) => ensure('tag', t)));
      const personIds = await Promise.all((it.people ?? []).filter((p) => p.trim()).map((p) => ensure('person', p)));
      const ext = path.extname(full).toLowerCase();
      const base = it.name.trim();
      const name = base.toLowerCase().endsWith(ext) ? base : base + ext;
      const date = it.date ?? (await stat(full)).mtime.toISOString().slice(0, 10);

      const form = new FormData();
      form.append('name', name);
      form.append('category', categoryId);
      form.append('date', date);
      if (tagIds.length) form.append('tags', JSON.stringify([...new Set(tagIds)]));
      if (personIds.length) form.append('people', JSON.stringify([...new Set(personIds)]));
      form.append('file', new Blob([await readFile(full)]), name);
      const r = await c.call<{ file: { id: string } }>('POST', '/api/files', form);
      done[it.path] = r.file.id;
      writeJson(DONE, done); // es desa a cada pas: si s'atura, es pot reprendre sense duplicar
      ok++;
      console.log(`[${n + 1}/${pending.length}] ✓ ${name}`);
    } catch (err) {
      failed.push(`${it.path}: ${(err as Error).message}`);
      console.log(`[${n + 1}/${pending.length}] ✗ ${it.path} — ${(err as Error).message}`);
    }
  }
  console.log(`\nFet: ${ok} pujats, ${failed.length} amb error.`);
  if (failed.length) {
    console.log(failed.join('\n'));
    console.log('\nPots tornar a executar l\'ordre: els que ja s\'han pujat no es dupliquen.');
    process.exitCode = 1;
  }
}

/* ---------- main ---------- */

const [cmd, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => !a.startsWith('--'));
try {
  if (cmd === 'scan') await scan(args[0]);
  else if (cmd === 'taxonomy') {
    const c = new Client();
    await c.login();
    await taxonomy(c);
  } else if (cmd === 'apply') await apply(args[0], rest.includes('--yes'));
  else {
    console.log('Ús: import.ts scan <carpeta> | taxonomy | apply <pla.json> [--yes]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
}
