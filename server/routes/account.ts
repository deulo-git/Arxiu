import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { checkPassword, PASSWORD_RULES_MESSAGE } from '../../shared/password.ts';
import { fail, requireAuth } from '../app.ts';
import { hashPassword, hashToken, newToken, newTotpSecret, totpUri, verifyPassword, verifyTotp } from '../auth/crypto.ts';
import { deleteAllSessions, deleteSession, describeDevice, type SessionRow } from '../auth/sessions.ts';
import { confirmEmailMail } from '../mail.ts';
import { getUser, LOCK_OPTIONS, normalizeEmail, setPassword, toDto } from '../user.ts';

type Body = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function accountRoutes(app: FastifyInstance) {
  const { db, config, mailer } = app.deps;
  app.addHook('preHandler', requireAuth);
  const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

  const user = () => getUser(db)!;

  app.post('/password', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    if (!(await verifyPassword(str(body.current), user().password_hash))) fail(400, 'La contrasenya actual no és correcta.');
    const next = str(body.next);
    if (!checkPassword(next).valid) fail(400, PASSWORD_RULES_MESSAGE);
    setPassword(db, await hashPassword(next));
    // Tanca la resta de sessions: si algú coneixia la contrasenya antiga, en queda fora.
    deleteAllSessions(db, request.session!.id);
    return { ok: true };
  });

  app.put('/settings', async (request) => {
    const body = (request.body ?? {}) as Body;
    const lock = Number(body.lockMinutes);
    if (!LOCK_OPTIONS.includes(lock)) fail(400, 'Valor no vàlid.');
    db.prepare('UPDATE user SET lock_minutes = ? WHERE id = 1').run(lock);
    return { user: toDto(user()) };
  });

  app.post('/2fa/setup', async () => {
    const u = user();
    if (u.totp_enabled) fail(409, 'La verificació en dos passos ja està activada.');
    const secret = newTotpSecret();
    db.prepare('UPDATE user SET totp_secret = ? WHERE id = 1').run(secret);
    const uri = totpUri(secret, u.email);
    const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, color: { dark: '#2B1F16', light: '#FFFFFF' } });
    return { secret, uri, qrSvg };
  });

  app.post('/2fa/enable', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    const u = user();
    if (!u.totp_secret || u.totp_enabled) fail(409, 'Torna a començar la configuració.');
    const step = verifyTotp(u.totp_secret, str(body.code));
    if (step === null) fail(400, 'El codi no és correcte. Comprova l’hora del mòbil i torna-ho a provar.');
    db.prepare('UPDATE user SET totp_enabled = 1, totp_last_step = ? WHERE id = 1').run(step);
    return { user: toDto(user()) };
  });

  app.post('/2fa/disable', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    if (!(await verifyPassword(str(body.password), user().password_hash))) fail(400, 'La contrasenya no és correcta.');
    db.prepare('UPDATE user SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = 1').run();
    return { user: toDto(user()) };
  });

  app.post('/email', strict, async (request) => {
    const body = (request.body ?? {}) as Body;
    const email = normalizeEmail(body.email);
    if (!email) fail(400, 'Escriu un correu electrònic vàlid.');
    if (!(await verifyPassword(str(body.password), user().password_hash))) fail(400, 'La contrasenya no és correcta.');
    const token = newToken();
    const now = Date.now();
    db.prepare("DELETE FROM tokens WHERE kind = 'email'").run();
    db.prepare("INSERT INTO tokens (token_hash, kind, data, created_at, expires_at) VALUES (?, 'email', ?, ?, ?)").run(
      hashToken(token),
      email,
      now,
      now + 86_400_000,
    );
    await mailer.send(confirmEmailMail(email, `${config.publicUrl}/confirma-correu?token=${token}`));
    return { ok: true };
  });

  app.get('/sessions', async (request) => {
    const rows = db
      .prepare("SELECT * FROM sessions WHERE stage = 'full' ORDER BY last_seen_at DESC")
      .all() as unknown as SessionRow[];
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        device: describeDevice(s.user_agent),
        ip: s.ip,
        lastSeenAt: s.last_seen_at,
        createdAt: s.created_at,
        current: s.id === request.session!.id,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    if (request.params.id === request.session!.id) fail(400, 'Per tancar aquesta sessió, fes servir «Tanca la sessió».');
    deleteSession(db, request.params.id);
    return { ok: true };
  });
}
