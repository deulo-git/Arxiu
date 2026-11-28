import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { openDb, type DB } from '../server/db.ts';
import { currentStep, totpAt } from '../server/auth/crypto.ts';
import type { Mail } from '../server/mail.ts';

const PASSWORD = 'Contrasenya-Segura-1';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

let dir: string;
let db: DB;
let app: FastifyInstance;
let mails: Mail[];
let cookie = '';

function cookieFrom(res: { headers: Record<string, unknown> }) {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const sid = list.find((c: string) => c.startsWith('arxiu_sid='));
  return sid ? sid.split(';')[0] : cookie;
}

async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, payload, headers: { 'x-arxiu': '1', cookie } });
  cookie = cookieFrom(res);
  return res;
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = '----arxiu' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const { body, contentType } = multipart(fields, file);
  return app.inject({ method: 'POST', url: '/api/files', payload: body, headers: { 'x-arxiu': '1', cookie, 'content-type': contentType } });
}

async function setup() {
  const token = app.setupToken!;
  return call('POST', '/api/auth/setup', { token, email: 'jo@exemple.cat', password: PASSWORD });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'arxiu-test-'));
  db = openDb(dir);
  mails = [];
  cookie = '';
  app = await buildApp({
    config: loadConfig({ dataDir: dir, publicUrl: 'http://arxiu.test', smtpUrl: '' }),
    db,
    logger: false,
    mailer: { send: async (m) => void mails.push(m) },
  });
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('salut', () => {
  it('respon a /api/health sense sessió', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('compte i sessió', () => {
  it('crea el compte amb el token de configuració només una vegada', async () => {
    expect((await call('GET', '/api/auth/status')).json()).toMatchObject({ configured: false, stage: null });
    const bad = await call('POST', '/api/auth/setup', { token: 'x', email: 'jo@exemple.cat', password: PASSWORD });
    expect(bad.statusCode).toBe(403);
    const weak = await call('POST', '/api/auth/setup', { token: app.setupToken, email: 'jo@exemple.cat', password: 'curta' });
    expect(weak.statusCode).toBe(400);
    expect((await setup()).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/status')).json()).toMatchObject({ configured: true, stage: 'full', user: { email: 'jo@exemple.cat' } });
    expect((await setup()).statusCode).toBe(409);
  });

  it('rebutja peticions sense capçalera anti-CSRF', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.cat', password: 'x' } });
    expect(res.statusCode).toBe(403);
  });

  it('inicia i tanca sessió', async () => {
    await setup();
    await call('POST', '/api/auth/logout');
    expect((await call('GET', '/api/files')).statusCode).toBe(401);
    expect((await call('POST', '/api/auth/login', { email: 'jo@exemple.cat', password: 'incorrecta' })).statusCode).toBe(401);
    const ok = await call('POST', '/api/auth/login', { email: 'JO@exemple.cat', password: PASSWORD });
    expect(ok.json()).toMatchObject({ next: 'app' });
    expect((await call('GET', '/api/files')).statusCode).toBe(200);
  });

  it('demana el codi de verificació quan el 2FA està actiu', async () => {
    await setup();
    const { secret } = (await call('POST', '/api/account/2fa/setup')).json();
    expect((await call('POST', '/api/account/2fa/enable', { code: '000000' })).statusCode).toBe(400);
    const enable = await call('POST', '/api/account/2fa/enable', { code: totpAt(secret, currentStep()) });
    expect(enable.json().user.totpEnabled).toBe(true);

    await call('POST', '/api/auth/logout');
    expect((await call('POST', '/api/auth/login', { email: 'jo@exemple.cat', password: PASSWORD })).json()).toMatchObject({ next: '2fa' });
    expect((await call('GET', '/api/files')).statusCode).toBe(401);
    // El codi ja fet servir per activar-lo no es pot reutilitzar.
    expect((await call('POST', '/api/auth/2fa', { code: totpAt(secret, currentStep()) })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/2fa', { code: totpAt(secret, currentStep() + 1) })).statusCode).toBe(200);
    expect((await call('GET', '/api/files')).statusCode).toBe(200);
  });

  it('restableix la contrasenya amb un enllaç d’un sol ús', async () => {
    await setup();
    await call('POST', '/api/auth/logout');
    expect((await call('POST', '/api/auth/forgot', { email: 'altre@exemple.cat' })).statusCode).toBe(200);
    expect(mails).toHaveLength(0);
    await call('POST', '/api/auth/forgot', { email: 'jo@exemple.cat' });
    await new Promise((r) => setTimeout(r, 10));
    expect(mails).toHaveLength(1);
    const token = /token=([\w-]+)/.exec(mails[0].text)![1];
    expect((await call('POST', '/api/auth/reset/check', { token })).json()).toEqual({ email: 'jo@exemple.cat' });
    const next = 'Una-Altra-Contrasenya-2';
    expect((await call('POST', '/api/auth/reset', { token, password: next })).statusCode).toBe(200);
    expect((await call('POST', '/api/auth/reset', { token, password: next })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/login', { email: 'jo@exemple.cat', password: PASSWORD })).statusCode).toBe(401);
    expect((await call('POST', '/api/auth/login', { email: 'jo@exemple.cat', password: next })).statusCode).toBe(200);
  });

  it('tanca la sessió per inactivitat', async () => {
    await setup();
    db.prepare('UPDATE sessions SET last_seen_at = ?').run(Date.now() - 16 * 60_000);
    expect((await call('GET', '/api/files')).statusCode).toBe(401);
  });
});

describe('documents', () => {
  beforeEach(async () => {
    await setup();
  });

  it('puja, llista, edita, descarrega i elimina un PDF', async () => {
    const res = await upload({ category: 'nomines', date: '2026-10-31', pages: '2' }, { name: 'Nòmina octubre.pdf', data: PDF, type: 'application/pdf' });
    expect(res.statusCode).toBe(200);
    const file = res.json().file;
    expect(file).toMatchObject({ name: 'Nòmina octubre.pdf', category: 'nomines', date: '2026-10-31', type: 'PDF', pages: 2 });

    const list = (await call('GET', '/api/files')).json();
    expect(list.files).toHaveLength(1);
    expect(list.usedBytes).toBe(PDF.length);

    const patched = await call('PATCH', `/api/files/${file.id}`, { category: 'factures', date: '2026-09-01' });
    expect(patched.json().file).toMatchObject({ category: 'factures', date: '2026-09-01' });
    expect((await call('PATCH', `/api/files/${file.id}`, { date: '2026-02-31' })).statusCode).toBe(400);

    const content = await call('GET', `/api/files/${file.id}/content?download=1`);
    expect(content.headers['content-type']).toBe('application/pdf');
    expect(String(content.headers['content-disposition'])).toContain("filename*=UTF-8''N%C3%B2mina");
    expect(content.rawPayload.equals(PDF)).toBe(true);

    expect((await call('DELETE', `/api/files/${file.id}`)).statusCode).toBe(200);
    expect((await call('GET', '/api/files')).json().files).toHaveLength(0);
  });

  it('rebutja formats no admesos encara que diguin ser PDF', async () => {
    const res = await upload({}, { name: 'virus.pdf', data: Buffer.from('<html><script>alert(1)</script>'), type: 'application/pdf' });
    expect(res.statusCode).toBe(415);
  });

  it('gestiona categories i mou els documents a «Altres» en eliminar-ne una', async () => {
    const cat = (await call('POST', '/api/categories', { name: 'Cotxe' })).json().category;
    expect(cat.id).toBe('cotxe');
    expect((await call('POST', '/api/categories', { name: 'cotxe' })).statusCode).toBe(409);
    const file = (await upload({ category: 'cotxe' }, { name: 'ITV.pdf', data: PDF, type: 'application/pdf' })).json().file;
    expect(file.category).toBe('cotxe');
    expect((await call('DELETE', '/api/categories/cotxe')).json()).toMatchObject({ moved: 1 });
    expect((await call('GET', '/api/files')).json().files[0].category).toBe('altres');
    expect((await call('DELETE', '/api/categories/altres')).statusCode).toBe(400);
  });

  it('comparteix amb un enllaç temporal que es pot revocar', async () => {
    const file = (await upload({}, { name: 'Factura.pdf', data: PDF, type: 'application/pdf' })).json().file;
    const share = (await call('POST', `/api/files/${file.id}/shares`, { hours: 24 })).json().share;
    expect(share.url).toMatch(/^http:\/\/arxiu\.test\/s\//);
    const pub = await app.inject({ method: 'GET', url: new URL(share.url).pathname });
    expect(pub.statusCode).toBe(200);
    expect(pub.rawPayload.equals(PDF)).toBe(true);
    await call('DELETE', `/api/shares/${share.id}`);
    expect((await app.inject({ method: 'GET', url: new URL(share.url).pathname })).statusCode).toBe(410);
  });

  it('exporta tots els documents en un .zip', async () => {
    await upload({ category: 'factures', date: '2026-01-02' }, { name: 'Llum.pdf', data: PDF, type: 'application/pdf' });
    const res = await call('GET', '/api/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(res.rawPayload.includes(Buffer.from('Arxiu/Factures/2026-01-02 Llum.pdf'))).toBe(true);
  });

  it('relaciona documents amb etiquetes i persones', async () => {
    const tag = (await call('POST', '/api/tags', { name: 'Urgent' })).json().item;
    const person = (await call('POST', '/api/people', { name: 'Anna', notes: 'Filla' })).json().item;
    expect(tag.color).toMatch(/^#[0-9a-f]{6}$/);
    expect((await call('POST', '/api/tags', { name: 'urgent' })).statusCode).toBe(409);
    expect((await call('POST', '/api/people', { name: '  ' })).statusCode).toBe(400);

    const file = (
      await upload({ tags: JSON.stringify([tag.id, 'inexistent']), people: JSON.stringify([person.id]) }, { name: 'Rebut.pdf', data: PDF, type: 'application/pdf' })
    ).json().file;
    expect(file.tags).toEqual([tag.id]);
    expect(file.people).toEqual([person.id]);
    expect((await call('GET', '/api/files')).json().files[0]).toMatchObject({ tags: [tag.id], people: [person.id] });

    const patched = (await call('PATCH', `/api/files/${file.id}`, { name: 'Rebut llum.pdf', tags: [], people: [person.id] })).json().file;
    expect(patched).toMatchObject({ name: 'Rebut llum.pdf', tags: [], people: [person.id] });

    // Eliminar la persona la desvincula del document.
    expect((await call('DELETE', `/api/people/${person.id}`)).json()).toMatchObject({ unlinked: 1 });
    expect((await call('GET', '/api/files')).json().files[0].people).toEqual([]);
  });

  it('fusiona etiquetes i canvia colors de categoria', async () => {
    const a = (await call('POST', '/api/tags', { name: 'Hisenda' })).json().item;
    const b = (await call('POST', '/api/tags', { name: 'Impostos', color: '#0369a1' })).json().item;
    expect(b.color).toBe('#0369a1');
    const file = (await upload({ tags: JSON.stringify([a.id]) }, { name: 'Renda.pdf', data: PDF, type: 'application/pdf' })).json().file;
    expect((await call('POST', `/api/tags/${a.id}/merge`, { into: b.id })).statusCode).toBe(200);
    expect((await call('GET', '/api/files')).json().files.find((f: { id: string }) => f.id === file.id).tags).toEqual([b.id]);

    const cats = (await call('GET', '/api/categories')).json().categories;
    expect(cats.every((c: { color: string }) => /^#[0-9a-f]{6}$/.test(c.color))).toBe(true);
    expect((await call('PATCH', '/api/categories/cartes', { color: 'vermell' })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/categories/cartes', { color: '#B91C1C', name: 'Correspondència' })).json().category).toMatchObject({ color: '#b91c1c', name: 'Correspondència' });
    const order = cats.map((c: { id: string }) => c.id).reverse();
    await call('PUT', '/api/categories/order', { ids: order });
    expect((await call('GET', '/api/categories')).json().categories.map((c: { id: string }) => c.id)).toEqual(order);
  });

  it('desa preferències validades', async () => {
    expect((await call('GET', '/api/prefs')).json().prefs).toMatchObject({ theme: 'auto', view: 'grid', shareHours: 24 });
    const res = await call('PUT', '/api/prefs', { theme: 'dark', view: 'raro', shareHours: 72, showTags: false });
    expect(res.json().prefs).toMatchObject({ theme: 'dark', view: 'grid', shareHours: 72, showTags: false });
    expect((await call('GET', '/api/prefs')).json().prefs).toMatchObject({ theme: 'dark', shareHours: 72 });
  });

  it("desa la miniatura d'un document sense (importat) i en llegeix les pàgines", async () => {
    const file = (await upload({}, { name: 'Sense miniatura.pdf', data: PDF, type: 'application/pdf' })).json().file;
    expect(file.hasThumb).toBe(false);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    const put = (body: Buffer, type: string) =>
      app.inject({ method: 'PUT', url: `/api/files/${file.id}/thumb?pages=3`, payload: body, headers: { 'x-arxiu': '1', cookie, 'content-type': type } });
    expect((await put(Buffer.from('no és un jpeg'), 'image/jpeg')).statusCode).toBe(415);
    const ok = await put(jpeg, 'image/jpeg');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().file).toMatchObject({ hasThumb: true, pages: 3 });
    const got = await call('GET', `/api/files/${file.id}/thumb`);
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(jpeg)).toBe(true);
  });
});
