import { existsSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface Config {
  isProd: boolean;
  port: number;
  host: string;
  dataDir: string;
  publicUrl: string;
  cookieSecure: boolean;
  maxUploadBytes: number;
  sessionMaxDays: number;
  shareHours: number;
  smtpUrl: string;
  mailFrom: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const port = num(env.PORT, 3000);
  const publicUrl = (env.PUBLIC_URL || (isProd ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/+$/, '');
  return {
    isProd,
    port,
    host: env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    publicUrl,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : publicUrl.startsWith('https://'),
    maxUploadBytes: num(env.MAX_UPLOAD_MB, 50) * 1024 * 1024,
    sessionMaxDays: num(env.SESSION_MAX_DAYS, 30),
    shareHours: num(env.SHARE_HOURS, 24),
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || 'Arxiu <arxiu@localhost>',
    ...overrides,
  };
}
