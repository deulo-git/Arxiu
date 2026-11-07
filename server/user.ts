import type { DB } from './db.ts';

export interface UserRow {
  id: 1;
  email: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  totp_last_step: number;
  lock_minutes: number;
  created_at: string;
  password_changed_at: string;
}

export interface UserDto {
  email: string;
  totpEnabled: boolean;
  lockMinutes: number;
}

export const LOCK_OPTIONS = [5, 15, 30, 60];

export function getUser(db: DB): UserRow | undefined {
  return db.prepare('SELECT * FROM user WHERE id = 1').get() as UserRow | undefined;
}

export function toDto(u: UserRow): UserDto {
  return { email: u.email, totpEnabled: !!u.totp_enabled, lockMinutes: u.lock_minutes };
}

export function createUser(db: DB, email: string, passwordHash: string) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO user (id, email, password_hash, created_at, password_changed_at) VALUES (1, ?, ?, ?, ?)',
  ).run(email, passwordHash, now, now);
}

export function setPassword(db: DB, passwordHash: string) {
  db.prepare('UPDATE user SET password_hash = ?, password_changed_at = ? WHERE id = 1').run(passwordHash, new Date().toISOString());
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254 ? e : null;
}
