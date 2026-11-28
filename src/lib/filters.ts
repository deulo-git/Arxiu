import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { FileItem } from '../api.ts';
import { daysAgo, MONTHS } from './format.ts';

export type Period = 'all' | '30' | '90' | 'year' | 'last' | 'custom';
export type Sort = 'new' | 'old' | 'name';

/** Ordre per defecte (preferència de l'usuari): si coincideix, no cal posar-lo a la URL. */
let defaultSort: Sort = 'new';
export function setDefaultSort(s: Sort) {
  defaultSort = s;
}

export function periods(): { id: Period; label: string }[] {
  const last = new Date().getFullYear() - 1;
  return [
    { id: 'all', label: 'Tot' },
    { id: '30', label: 'Últims 30 dies' },
    { id: '90', label: 'Últims 3 mesos' },
    { id: 'year', label: 'Aquest any' },
    { id: 'last', label: String(last) },
    { id: 'custom', label: 'Rang de dates' },
  ];
}

export interface Filters {
  cat: string;
  period: Period;
  from: string;
  to: string;
  q: string;
  sort: Sort;
  /** Etiquetes i persones triades; `*Mode` diu si el document ha de tenir-les totes o n'hi ha prou amb una. */
  tags: string[];
  tagMode: 'all' | 'any';
  people: string[];
  personMode: 'all' | 'any';
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

/** Categories triades (el filtre `cat` pot dur-ne diverses separades per comes). */
export const catList = (cat: string) => (cat === 'all' ? [] : cat.split(',').filter(Boolean));

/** Els filtres de la biblioteca viuen a la URL: així el botó enrere i el visor els conserven. */
function parseFilters(params: URLSearchParams): Filters {
  return {
    cat: params.get('cat') || 'all',
    period: (params.get('periode') as Period) || 'all',
    from: params.get('des') || '',
    to: params.get('fins') || '',
    q: params.get('q') || '',
    sort: (params.get('ordre') as Sort) || defaultSort,
    tags: list(params.get('etiquetes')),
    tagMode: params.get('modeEt') === 'any' ? 'any' : 'all',
    people: list(params.get('persones')),
    personMode: params.get('modePer') === 'any' ? 'any' : 'all',
  };
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const update = (patch: Partial<Filters>, opts: { replace?: boolean } = {}) => {
    // Es parteix de la URL actual (no de l'últim render): així dos clics seguits no es trepitgen.
    const current = parseFilters(new URLSearchParams(window.location.search));
    setParams(toParams({ ...current, ...patch }), { replace: opts.replace ?? true });
  };
  return { filters, update, query: toParams(filters).toString() };
}

export function toParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.cat !== 'all') p.set('cat', f.cat);
  if (f.period !== 'all') p.set('periode', f.period);
  if (f.period === 'custom' && f.from) p.set('des', f.from);
  if (f.period === 'custom' && f.to) p.set('fins', f.to);
  if (f.q) p.set('q', f.q);
  if (f.sort !== defaultSort) p.set('ordre', f.sort);
  if (f.tags.length) p.set('etiquetes', f.tags.join(','));
  if (f.tags.length > 1 && f.tagMode === 'any') p.set('modeEt', 'any');
  if (f.people.length) p.set('persones', f.people.join(','));
  if (f.people.length > 1 && f.personMode === 'any') p.set('modePer', 'any');
  return p;
}

export function applyFilters(files: FileItem[], f: Filters, extra?: (x: FileItem) => string): FileItem[] {
  let lo = '0000-00-00';
  let hi = '9999-99-99';
  const year = new Date().getFullYear();
  if (f.period === '30') lo = daysAgo(30);
  if (f.period === '90') lo = daysAgo(90);
  if (f.period === 'year') lo = `${year}-01-01`;
  if (f.period === 'last') {
    lo = `${year - 1}-01-01`;
    hi = `${year - 1}-12-31`;
  }
  if (f.period === 'custom') {
    if (f.from) lo = f.from;
    if (f.to) hi = f.to;
  }
  const q = f.q.trim().toLocaleLowerCase('ca');
  const cats = catList(f.cat);
  const matchAll = (have: string[], want: string[], mode: 'all' | 'any') =>
    want.length === 0 || (mode === 'all' ? want.every((w) => have.includes(w)) : want.some((w) => have.includes(w)));
  const result = files.filter(
    (x) =>
      (cats.length === 0 || cats.includes(x.category)) &&
      matchAll(x.tags, f.tags, f.tagMode) &&
      matchAll(x.people, f.people, f.personMode) &&
      x.date >= lo &&
      x.date <= hi &&
      (!q || `${x.name} ${extra?.(x) ?? ''}`.toLocaleLowerCase('ca').includes(q)),
  );
  result.sort((a, b) => {
    if (f.sort === 'name') return a.name.localeCompare(b.name, 'ca');
    const d = a.date.localeCompare(b.date) || a.addedAt.localeCompare(b.addedAt);
    return f.sort === 'old' ? d : -d;
  });
  return result;
}

export function useFilteredFiles(files: FileItem[], extra?: (x: FileItem) => string) {
  const ctx = useFilters();
  const list = useMemo(() => applyFilters(files, ctx.filters, extra), [files, extra, ctx.query]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...ctx, list };
}

export type Group = 'month' | 'year' | 'category' | 'none';

export function groupFiles(
  list: FileItem[],
  sort: Sort,
  group: Group,
  catName: (id: string) => string,
): { key: string; label: string; items: FileItem[] }[] {
  if (!list.length) return [];
  if (group === 'none' || sort === 'name') return [{ key: 'tots', label: sort === 'name' ? 'Per nom' : 'Documents', items: list }];
  const groups = new Map<string, { key: string; label: string; items: FileItem[] }>();
  for (const f of list) {
    let key: string;
    let label: string;
    if (group === 'category') {
      key = f.category;
      label = catName(f.category);
    } else if (group === 'year') {
      key = f.date.slice(0, 4);
      label = key;
    } else {
      key = f.date.slice(0, 7);
      label = `${MONTHS[parseInt(key.slice(5), 10) - 1]} ${key.slice(0, 4)}`;
    }
    const g = groups.get(key);
    if (g) g.items.push(f);
    else groups.set(key, { key, label, items: [f] });
  }
  return [...groups.values()];
}
