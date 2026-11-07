import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkPassword, PASSWORD_RULES_MESSAGE } from '../../shared/password.ts';
import { fail } from '../app.ts';
import { hashPassword, hashToken, newToken, verifyPassword, verifyTotp } from '../auth/crypto.ts';
import { createSession, deleteAllSessions, deleteSession, SESSION_COOKIE } from '../auth/sessions.ts';
import { tx } from '../db.ts';
import { resetPasswordMail } from '../mail.ts';
import { createUser, getUser, normalizeEmail, setPassword, toDto } from '../user.ts';

const RESET_TTL_MS = 30 * 60 * 1000;
// Hash fictici per igualar el temps de resposta quan el correu no coincideix.
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);

const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

type Body = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string, maxAgeSec?: number) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: app.deps.config.cookieSecure,
    maxAge: maxAgeSec,
  });
}

function clientInfo(request: FastifyRequest) {
  return { userAgent: str(request.headers['user-agent']), ip: request.ip };
}

export async function authRoutes(app: FastifyInstance) {
  const { db, config, mailer } = app.deps;

  app.get('/status', async (request) => {
    const user = getUser(db);
    const stage = request.session?.stage ?? null;
    return {
      configured: !!user,
      stage,
      user: user && stage === 'full' ? toDto(user) : null,
    };
  });

  app.post('/setup', strict, async (request, reply) => {
    const body = (request.body ?? {}) as Body;
    if (getUser(db) || !app.setupToken) fail(409, 'El compte ja està creat.');
    if (str(body.token) !== app.setupToken) fail(403, "L'enllaç de configuració no és vàlid.");
    const email = normalizeEmail(body.email);
    if (!email) fail(400, 'Escriu un correu electrònic vàlid.');
    const password = str(body.password);
    if (!checkPassword(password).valid) fail(400, PASSWORD_RULES_MESSAGE);
    createUser(db, email, await hashPassword(password));
    app.setupToken = null;
    const { token } = createSession(db, { stage: 'full', maxDays: config.sessionMaxDays, ...clientInfo(request) });
    setSessionCookie(app, reply, token, config.sessionMaxDays * 86400);
    return { user: toDto(getUser(db)!) };
  });

  app.post('/login', strict, async (request, reply) => {
    const body = (request.body ?? {}) as Body;
    const email = normalizeEmail(body.email);
    const password = str(body.password);
    if (!email || !password) fail(400, 'Introdueix el correu i la contrasenya.');
    const user = getUser(db);
    const ok = await verifyPassword(password, user && user.email === email ? user.password_hash : DUMMY_HASH);
    if (!user || user.email !== email || !ok) fail(401, 'El correu o la contrasenya no són correctes.');
    if (request.session) deleteSession(db, request.session.id);
    const stage = user.totp_enabled ? 'mfa' : 'full';
    const { token } = createSession(db, { stage, maxDays: config.sessionMaxDays, ...clientInfo(request) });
    setSessionCookie(app, reply, token, stage === 'full' ? config.sessionMaxDays * 86400 : undefined);
    return { next: stage === 'mfa' ? '2fa' : 'app', user: stage === 'full' ? toDto(user) : null };
  });

  app.post('/2fa', strict, async (request, reply) => {
    const body = (request.body ?? {}) as Body;
    const session = request.session;
    const user = getUser(db);
    if (!session || session.stage !== 'mfa' || !user?.totp_secret) fail(401, 'La sessió ha caducat. Torna a iniciar sessió.');
    const step = verifyTotp(user.totp_secret, str(body.code));
    if (step === null || step <= user.totp_last_step) fail(400, 'El codi no és correcte o ha caducat.');
    const { token } = tx(db, () => {
      db.prepare('UPDATE user SET totp_last_step = ? WHERE id = 1').run(step);
      deleteSession(db, session.id);
      return createSession(db, { stage: 'full', maxDays: config.sessionMaxDays, ...clientInfo(request) });
    });
    setSessionCookie(app, reply, token, config.sessionMaxDays * 86400);
    return { user: toDto(user) };
  });

  app.post('/logout', async (request, reply) => {
    if (request.session) deleteSession(db, request.session.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** El client avisa que hi ha activitat (per al tancament automàtic per inactivitat). */
  app.post('/ping', async (request) => {
    if (!request.session || request.session.stage !== 'full') fail(401, 'Cal iniciar sessió.');
    return { ok: true };
  });

  app.post('/forgot', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    const email = normalizeEmail(body.email);
    if (!email) fail(400, 'Escriu un correu electrònic vàlid.');
    const user = getUser(db);
    // Sempre la mateixa resposta: no revelem si el correu té compte.
    if (user && user.email === email) {
      const token = newToken();
      const now = Date.now();
      db.prepare("DELETE FROM tokens WHERE kind = 'reset'").run();
      db.prepare("INSERT INTO tokens (token_hash, kind, created_at, expires_at) VALUES (?, 'reset', ?, ?)").run(
        hashToken(token),
        now,
        now + RESET_TTL_MS,
      );
      const url = `${config.publicUrl}/restableix?token=${token}`;
      mailer.send(resetPasswordMail(email, url)).catch((err) => request.log.error(err, 'No s’ha pogut enviar el correu'));
    }
    return { ok: true };
  });

  const findResetToken = (token: string) => {
    const row = db
      .prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'reset'")
      .get(hashToken(token)) as { token_hash: string; expires_at: number; used_at: number | null } | undefined;
    if (!row || row.used_at || row.expires_at < Date.now()) return null;
    return row;
  };

  app.post('/reset/check', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    const user = getUser(db);
    if (!user || !findResetToken(str(body.token))) fail(400, "L'enllaç no és vàlid o ha caducat. Demana'n un de nou.");
    return { email: user.email };
  });

  app.post('/reset', strict, async (request, reply) => {
    const body = (request.body ?? {}) as Body;
    const row = findResetToken(str(body.token));
    if (!row || !getUser(db)) fail(400, "L'enllaç no és vàlid o ha caducat. Demana'n un de nou.");
    const password = str(body.password);
    if (!checkPassword(password).valid) fail(400, PASSWORD_RULES_MESSAGE);
    const hash = await hashPassword(password);
    tx(db, () => {
      setPassword(db, hash);
      db.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
      deleteAllSessions(db);
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/confirm-email', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    const row = db
      .prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'email'")
      .get(hashToken(str(body.token))) as { token_hash: string; data: string; expires_at: number; used_at: number | null } | undefined;
    if (!row || row.used_at || row.expires_at < Date.now() || !getUser(db)) fail(400, "L'enllaç no és vàlid o ha caducat.");
    tx(db, () => {
      db.prepare('UPDATE user SET email = ? WHERE id = 1').run(row.data);
      db.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    });
    return { email: row.data };
  });
}
