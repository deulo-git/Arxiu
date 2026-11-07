import type { DB } from '../db.ts';
import { hashToken, newId, newToken } from './crypto.ts';

export type Stage = 'mfa' | 'full';

export interface SessionRow {
  id: string;
  token_hash: string;
  stage: Stage;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  user_agent: string;
  ip: string;
}

export const SESSION_COOKIE = 'arxiu_sid';
/** Temps màxim per escriure el codi de verificació després de la contrasenya. */
const MFA_WINDOW_MS = 5 * 60 * 1000;
/** No cal actualitzar `last_seen_at` a cada petició. */
const TOUCH_EVERY_MS = 20 * 1000;

export function createSession(
  db: DB,
  opts: { stage: Stage; maxDays: number; userAgent: string; ip: string },
): { token: string; session: SessionRow } {
  const token = newToken();
  const now = Date.now();
  const session: SessionRow = {
    id: newId(),
    token_hash: hashToken(token),
    stage: opts.stage,
    created_at: now,
    last_seen_at: now,
    expires_at: opts.stage === 'mfa' ? now + MFA_WINDOW_MS : now + opts.maxDays * 86_400_000,
    user_agent: opts.userAgent.slice(0, 400),
    ip: opts.ip,
  };
  db.prepare(
    `INSERT INTO sessions (id, token_hash, stage, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.token_hash,
    session.stage,
    session.created_at,
    session.last_seen_at,
    session.expires_at,
    session.user_agent,
    session.ip,
  );
  return { token, session };
}

/**
 * Retorna la sessió vàlida per al token o null. Una sessió completa caduca si
 * ha estat inactiva més minuts dels configurats a «Tancament automàtic».
 */
export function findSession(db: DB, token: string | undefined, lockMinutes: number): SessionRow | null {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  const now = Date.now();
  const idleExpired = row.stage === 'full' && now - row.last_seen_at > lockMinutes * 60_000;
  if (row.expires_at < now || idleExpired) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  return row;
}

export function touchSession(db: DB, session: SessionRow, ip: string) {
  const now = Date.now();
  if (now - session.last_seen_at < TOUCH_EVERY_MS && session.ip === ip) return;
  db.prepare('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE id = ?').run(now, ip, session.id);
  session.last_seen_at = now;
  session.ip = ip;
}

export function deleteSession(db: DB, id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function deleteAllSessions(db: DB, exceptId?: string) {
  if (exceptId) db.prepare('DELETE FROM sessions WHERE id != ?').run(exceptId);
  else db.prepare('DELETE FROM sessions').run();
}

export function purgeExpired(db: DB) {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(now - 86_400_000);
  db.prepare('DELETE FROM shares WHERE expires_at < ?').run(now - 86_400_000);
}

/** Descripció curta del dispositiu a partir del User-Agent. */
export function describeDevice(ua: string): string {
  let device = 'Ordinador';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? 'Mòbil Android' : 'Tauleta Android';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Ordinador Windows';
  else if (/Linux/.test(ua)) device = 'Ordinador Linux';

  let browser = 'Navegador';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return `${device} · ${browser}`;
}
