import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATEGORIES } from '../shared/categories.ts';
import { colorAt } from '../shared/colors.ts';

export type DB = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE user (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    totp_last_step INTEGER NOT NULL DEFAULT 0,
    lock_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TEXT NOT NULL,
    password_changed_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    stage TEXT NOT NULL CHECK (stage IN ('mfa', 'full')),
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('reset', 'email')),
    data TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    doc_date TEXT NOT NULL,
    added_at TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    kind TEXT NOT NULL,
    pages INTEGER,
    sha256 TEXT NOT NULL,
    has_thumb INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX files_date ON files(doc_date);
  CREATE INDEX files_category ON files(category_id);

  CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '';

  CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX tags_name ON tags(lower(name));

  CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX people_name ON people(lower(name));

  CREATE TABLE file_tags (
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
  );
  CREATE INDEX file_tags_tag ON file_tags(tag_id);

  CREATE TABLE file_people (
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, person_id)
  );
  CREATE INDEX file_people_person ON file_people(person_id);

  CREATE TABLE prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'arxiu.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      if (version === 0) seedCategories(db);
      if (version === 1) colorCategories(db);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function seedCategories(db: DB) {
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT INTO categories (id, name, position, created_at) VALUES (?, ?, ?, ?)');
  DEFAULT_CATEGORIES.forEach((c, i) => insert.run(c.id, c.name, i, now));
}

/** Dona un color a les categories que ja existien abans de poder-ne triar. */
function colorCategories(db: DB) {
  const rows = db.prepare('SELECT id FROM categories ORDER BY position, created_at').all() as { id: string }[];
  const set = db.prepare('UPDATE categories SET color = ? WHERE id = ?');
  rows.forEach((r, i) => set.run(colorAt(i), r.id));
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
