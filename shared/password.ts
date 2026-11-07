export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordCheck {
  length: boolean;
  mixedCase: boolean;
  digitOrSymbol: boolean;
  /** 0 (buida) a 4 (forta) */
  score: number;
  valid: boolean;
}

export function checkPassword(pw: string): PasswordCheck {
  const length = pw.length >= MIN_PASSWORD_LENGTH;
  const mixedCase = /\p{Ll}/u.test(pw) && /\p{Lu}/u.test(pw);
  const digitOrSymbol = /[^\p{L}]/u.test(pw);
  let score = pw ? Number(length) + Number(mixedCase) + Number(digitOrSymbol) + Number(pw.length >= 16) : 0;
  if (pw && score === 0) score = 1;
  return { length, mixedCase, digitOrSymbol, score, valid: length && mixedCase && digitOrSymbol };
}

export const STRENGTH_LABELS = ['', 'Feble', 'Acceptable', 'Bona', 'Forta'];

export const PASSWORD_RULES_MESSAGE =
  'La contrasenya ha de tenir almenys 12 caràcters, majúscules i minúscules, i almenys un número o símbol.';
