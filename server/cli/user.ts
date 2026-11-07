/**
 * Gestió del compte des del servidor:
 *   npm run user:create        crea el compte (si encara no n'hi ha)
 *   npm run user:password      canvia la contrasenya i tanca totes les sessions
 *   npm run user:disable-2fa   desactiva la verificació en dos passos (si has perdut el mòbil)
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { checkPassword, PASSWORD_RULES_MESSAGE } from '../../shared/password.ts';
import { hashPassword } from '../auth/crypto.ts';
import { deleteAllSessions } from '../auth/sessions.ts';
import { loadConfig } from '../config.ts';
import { openDb } from '../db.ts';
import { createUser, getUser, normalizeEmail, setPassword } from '../user.ts';

const rl = createInterface({ input: stdin, output: stdout });
const db = openDb(loadConfig().dataDir);

async function askPassword(): Promise<string> {
  for (;;) {
    const pw = await rl.question('Contrasenya nova: ');
    if (!checkPassword(pw).valid) {
      console.log(PASSWORD_RULES_MESSAGE);
      continue;
    }
    if ((await rl.question('Repeteix-la: ')) !== pw) {
      console.log('No coincideixen.');
      continue;
    }
    return pw;
  }
}

const command = process.argv[2];
try {
  if (command === 'create') {
    if (getUser(db)) throw new Error('Ja hi ha un compte. Fes servir «npm run user:password» per canviar la contrasenya.');
    const email = normalizeEmail(await rl.question('Correu electrònic: '));
    if (!email) throw new Error('Correu no vàlid.');
    createUser(db, email, await hashPassword(await askPassword()));
    console.log(`Compte creat per a ${email}.`);
  } else if (command === 'password') {
    if (!getUser(db)) throw new Error('Encara no hi ha cap compte.');
    setPassword(db, await hashPassword(await askPassword()));
    deleteAllSessions(db);
    console.log('Contrasenya canviada. S’han tancat totes les sessions.');
  } else if (command === 'disable-2fa') {
    db.prepare('UPDATE user SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = 1').run();
    console.log('Verificació en dos passos desactivada.');
  } else {
    console.log('Ordres: create | password | disable-2fa');
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}
