/** Preferències de l'arxiu (es desen al servidor, així valen per a tots els dispositius). */
export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  view: 'grid' | 'list';
  sort: 'new' | 'old' | 'name';
  group: 'month' | 'year' | 'category' | 'none';
  showTags: boolean;
  showPeople: boolean;
  /** Endevina la categoria a partir del nom de l'arxiu en pujar. */
  guessCategory: boolean;
  /** Categoria per defecte en pujar ('' = la que estiguis mirant). */
  uploadCategory: string;
  /** Neteja el nom de l'arxiu proposat (guions baixos → espais, sense extensió). */
  tidyName: boolean;
  /** Recorda etiquetes i persones de l'última pujada. */
  rememberLast: boolean;
  /** Durada per defecte dels enllaços per compartir (hores). */
  shareHours: number;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'auto',
  view: 'grid',
  sort: 'new',
  group: 'month',
  showTags: true,
  showPeople: true,
  guessCategory: true,
  uploadCategory: '',
  tidyName: true,
  rememberLast: false,
  shareHours: 24,
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);

export function sanitizePrefs(input: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const hours = Number(p.shareHours);
  return {
    theme: oneOf(p.theme, ['auto', 'light', 'dark'], base.theme),
    view: oneOf(p.view, ['grid', 'list'], base.view),
    sort: oneOf(p.sort, ['new', 'old', 'name'], base.sort),
    group: oneOf(p.group, ['month', 'year', 'category', 'none'], base.group),
    showTags: bool(p.showTags, base.showTags),
    showPeople: bool(p.showPeople, base.showPeople),
    guessCategory: bool(p.guessCategory, base.guessCategory),
    uploadCategory: typeof p.uploadCategory === 'string' ? p.uploadCategory.slice(0, 80) : base.uploadCategory,
    tidyName: bool(p.tidyName, base.tidyName),
    rememberLast: bool(p.rememberLast, base.rememberLast),
    shareHours: Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : base.shareHours,
  };
}
