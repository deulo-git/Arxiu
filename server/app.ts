import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.ts';
import type { DB } from './db.ts';
import { createMailer, type Mailer } from './mail.ts';
import { findSession, purgeExpired, SESSION_COOKIE, touchSession, type SessionRow } from './auth/sessions.ts';
import { newToken } from './auth/crypto.ts';
import { createStorage, type Storage } from './files/storage.ts';
import { getUser } from './user.ts';
import { authRoutes } from './routes/auth.ts';
import { accountRoutes } from './routes/account.ts';
import { libraryRoutes } from './routes/library.ts';

export interface Deps {
  config: Config;
  db: DB;
  mailer: Mailer;
  storage: Storage;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
    /** Token d'un sol ús per crear el compte quan encara no n'hi ha cap. */
    setupToken: string | null;
  }
  interface FastifyRequest {
    session: SessionRow | null;
  }
}

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export async function requireAuth(request: FastifyRequest) {
  if (!request.session || request.session.stage !== 'full') fail(401, 'Cal iniciar sessió.');
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export async function buildApp(opts: { config: Config; db: DB; mailer?: Mailer; logger?: boolean }): Promise<FastifyInstance> {
  const { config, db } = opts;
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.isProd ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const mailer = opts.mailer ?? createMailer(config.smtpUrl, config.mailFrom, app.log);
  const storage = createStorage(config.dataDir);
  app.decorate('deps', { config, db, mailer, storage });
  app.decorate('setupToken', null);
  app.decorateRequest('session', null);

  if (!getUser(db)) {
    app.setupToken = newToken(18);
    app.log.warn(`Encara no hi ha cap compte. Crea'l a: ${config.publicUrl}/configura?token=${app.setupToken}`);
  }

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 2, fields: 10, fieldSize: 4096 },
  });

  app.addHook('onRequest', async (request) => {
    const url = request.url;
    if (!url.startsWith('/api/')) return;
    // Defensa CSRF: un formulari d'un altre lloc no pot afegir capçaleres pròpies.
    if (UNSAFE.has(request.method) && request.headers['x-arxiu'] !== '1') fail(403, 'Petició no permesa.');
    const user = getUser(db);
    const session = findSession(db, request.cookies[SESSION_COOKIE], user?.lock_minutes ?? 15);
    if (session) {
      if (session.stage === 'full' && url !== '/api/auth/status') touchSession(db, session, request.ip);
      request.session = session;
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) reply.header('content-security-policy', HTML_CSP);
    if (request.url.startsWith('/api/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; validation?: unknown }, request, reply) => {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_FILES_LIMIT') {
      return reply.code(413).send({ error: `L'arxiu supera el límit de ${Math.round(config.maxUploadBytes / 1048576)} MB.` });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err.statusCode === 429) return reply.code(429).send({ error: "Massa intents. Espera uns minuts i torna-ho a provar." });
    if (err.validation || (err.statusCode && err.statusCode < 500)) {
      return reply.code(err.statusCode ?? 400).send({ error: 'Dades no vàlides.' });
    }
    request.log.error(err);
    return reply.code(500).send({ error: "S'ha produït un error inesperat." });
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(libraryRoutes);

  // Aplicació web compilada (npm run build).
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (existsSync(path.join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header('cache-control', 'public, max-age=31536000, immutable');
      },
    });
    app.setNotFoundHandler((request, reply: FastifyReply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/s/')) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'No trobat.' });
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'No trobat.' }));
  }

  purgeExpired(db);
  const timer = setInterval(() => purgeExpired(db), 60 * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));

  return app;
}
