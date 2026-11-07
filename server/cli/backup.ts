/**
 * Còpia de seguretat completa: base de dades (còpia coherent amb VACUUM INTO),
 * documents i miniatures, en un .tar.gz. Conserva les còpies dels últims N dies.
 *
 *   node server/cli/backup.ts <carpeta-destí> [dies=14]
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { openDb } from '../db.ts';

const dest = path.resolve(process.argv[2] || 'backups');
const keepDays = Number(process.argv[3]) || 14;
const { dataDir } = loadConfig();
mkdirSync(dest, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const work = path.join(dataDir, 'tmp', `backup-${stamp}`);
mkdirSync(work, { recursive: true });

try {
  const db = openDb(dataDir);
  db.exec(`VACUUM INTO '${path.join(work, 'arxiu.db').replace(/'/g, "''")}'`);
  db.close();

  for (const d of ['files', 'thumbs']) mkdirSync(path.join(dataDir, d), { recursive: true });
  const archive = path.join(dest, `arxiu-${stamp}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', work, 'arxiu.db', '-C', dataDir, 'files', 'thumbs']);
  chmodSync(archive, 0o600);
  console.log(`Còpia creada: ${archive} (${(statSync(archive).size / 1048576).toFixed(1)} MB)`);

  const limit = Date.now() - keepDays * 86_400_000;
  for (const name of readdirSync(dest)) {
    const p = path.join(dest, name);
    if (/^arxiu-.*\.tar\.gz$/.test(name) && statSync(p).mtimeMs < limit) {
      rmSync(p);
      console.log(`Còpia antiga eliminada: ${name}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
