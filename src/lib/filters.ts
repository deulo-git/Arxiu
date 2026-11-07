import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { FileItem } from '../api.ts';
import { daysAgo, MONTHS } from './format.ts';

export type Period = 'all' | '30' | '90' | 'year' | 'last' | 'custom';
export type Sort = 'new' | 'old' | 'name';

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
}

/** Els filtres de la biblioteca viuen a la URL: així el botó enrere i el visor els conserven. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: Filters = {
    cat: params.get('cat') || 'all',
    period: (params.get('periode') as Period) || 'all',
    from: params.get('des') || '',
    to: params.get('fins') || '',
    q: params.get('q') || '',
    sort: (params.get('ordre') as Sort) || 'new',
  };
  const update = (patch: Partial<Filters>, opts: { replace?: boolean } = {}) => {
    const next = { ...filters, ...patch };
    setParams(toParams(next), { replace: opts.replace ?? true });
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
  if (f.sort !== 'new') p.set('ordre', f.sort);
  return p;
}

export function applyFilters(files: FileItem[], f: Filters): FileItem[] {
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
  const list = files.filter(
    (x) => (f.cat === 'all' || x.category === f.cat) && x.date >= lo && x.date <= hi && (!q || x.name.toLocaleLowerCase('ca').includes(q)),
  );
  list.sort((a, b) => {
    if (f.sort === 'name') return a.name.localeCompare(b.name, 'ca');
    const d = a.date.localeCompare(b.date) || a.addedAt.localeCompare(b.addedAt);
    return f.sort === 'old' ? d : -d;
  });
  return list;
}

export function useFilteredFiles(files: FileItem[]) {
  const ctx = useFilters();
  const list = useMemo(() => applyFilters(files, ctx.filters), [files, ctx.query]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...ctx, list };
}

export function groupByMonth(list: FileItem[], sort: Sort): { key: string; label: string; items: FileItem[] }[] {
  if (sort === 'name') return list.length ? [{ key: 'nom', label: 'Per nom', items: list }] : [];
  const groups: { key: string; label: string; items: FileItem[] }[] = [];
  for (const f of list) {
    const k = f.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) {
      g = { key: k, label: `${MONTHS[parseInt(k.slice(5), 10) - 1]} ${k.slice(0, 4)}`, items: [] };
      groups.push(g);
    }
    g.items.push(f);
  }
  return groups;
}
