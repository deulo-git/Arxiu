export interface CategorySeed {
  id: string;
  name: string;
}

/** Categoria on van a parar els documents sense categoria. No es pot eliminar. */
export const FALLBACK_CATEGORY = 'altres';

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { id: 'cartes', name: 'Cartes' },
  { id: 'nomines', name: 'Nòmines' },
  { id: 'factures', name: 'Factures' },
  { id: 'contractes', name: 'Contractes' },
  { id: 'banc', name: 'Banc i impostos' },
  { id: 'salut', name: 'Salut' },
  { id: FALLBACK_CATEGORY, name: 'Altres' },
];

/** Endevina la categoria a partir del nom de l'arxiu. */
export function guessCategory(fileName: string, available?: string[]): string {
  const s = fileName.toLowerCase();
  let id = FALLBACK_CATEGORY;
  if (/n[oò]mina/.test(s)) id = 'nomines';
  else if (/factura|rebut/.test(s)) id = 'factures';
  else if (/contracte/.test(s)) id = 'contractes';
  else if (/carta/.test(s)) id = 'cartes';
  else if (/renda|banc|hisenda|impost/.test(s)) id = 'banc';
  else if (/m[eè]dic|salut|informe|recepta/.test(s)) id = 'salut';
  if (available && !available.includes(id)) return available.includes(FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : available[0];
  return id;
}
