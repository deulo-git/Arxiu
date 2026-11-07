import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { newId } from '../auth/crypto.ts';

export interface Storage {
  filePath(id: string): string;
  thumbPath(id: string): string;
  /** Desa un flux a un arxiu temporal i en retorna la mida, el hash i els primers bytes. */
  writeTemp(stream: Readable): Promise<{ tmp: string; size: number; sha256: string; head: Buffer }>;
  commit(tmp: string, dest: string): Promise<void>;
  remove(...paths: string[]): Promise<void>;
}

export function createStorage(dataDir: string): Storage {
  const filesDir = path.join(dataDir, 'files');
  const thumbsDir = path.join(dataDir, 'thumbs');
  const tmpDir = path.join(dataDir, 'tmp');
  for (const d of [filesDir, thumbsDir, tmpDir]) mkdirSync(d, { recursive: true });

  const safe = (id: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('id invàlid');
    return id;
  };

  return {
    filePath: (id) => path.join(filesDir, safe(id)),
    thumbPath: (id) => path.join(thumbsDir, `${safe(id)}.jpg`),

    async writeTemp(stream) {
      const tmp = path.join(tmpDir, `${newId()}.part`);
      const hash = createHash('sha256');
      let size = 0;
      const headChunks: Buffer[] = [];
      let headLen = 0;
      const tap = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          size += chunk.length;
          hash.update(chunk);
          if (headLen < 32) {
            headChunks.push(chunk.subarray(0, 32 - headLen));
            headLen += Math.min(chunk.length, 32 - headLen);
          }
          cb(null, chunk);
        },
      });
      try {
        await pipeline(stream, tap, createWriteStream(tmp));
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      return { tmp, size, sha256: hash.digest('hex'), head: Buffer.concat(headChunks) };
    },

    async commit(tmp, dest) {
      await rename(tmp, dest);
    },

    async remove(...paths) {
      await Promise.all(paths.map((p) => rm(p, { force: true })));
    },
  };
}
