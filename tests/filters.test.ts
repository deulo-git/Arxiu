import { describe, expect, it } from 'vitest';
import { applyFilters, catList, type Filters } from '../src/lib/filters.ts';
import type { FileItem } from '../src/api.ts';

const base: Filters = { cat: 'all', period: 'all', from: '', to: '', q: '', sort: 'new', tags: [], tagMode: 'all', people: [], personMode: 'all' };
const file = (id: string, category: string, tags: string[], people: string[], date = '2026-01-01'): FileItem => ({
  id, name: id, category, date, addedAt: date, size: 1, mime: 'application/pdf', kind: 'pdf', type: 'PDF', pages: 1, hasThumb: false, tags, people,
});
const files = [
  file('a', 'salut', ['sanitat', 'urgent'], ['anna']),
  file('b', 'salut', ['sanitat'], ['pere']),
  file('c', 'factures', ['urgent'], ['anna', 'pere']),
  file('d', 'factures', [], []),
];
const ids = (f: Partial<Filters>) => applyFilters(files, { ...base, ...f }).map((x) => x.id).sort();

describe('filtres', () => {
  it('sense filtres ho torna tot', () => expect(ids({})).toEqual(['a', 'b', 'c', 'd']));
  it('etiquetes: «totes» redueix, «qualsevol» amplia', () => {
    expect(ids({ tags: ['sanitat', 'urgent'] })).toEqual(['a']);
    expect(ids({ tags: ['sanitat', 'urgent'], tagMode: 'any' })).toEqual(['a', 'b', 'c']);
  });
  it('persones: diverses a la vegada', () => {
    expect(ids({ people: ['anna', 'pere'] })).toEqual(['c']);
    expect(ids({ people: ['anna', 'pere'], personMode: 'any' })).toEqual(['a', 'b', 'c']);
  });
  it('combina categories, persones i etiquetes', () => {
    expect(ids({ cat: 'salut,factures', tags: ['urgent'], people: ['anna'] })).toEqual(['a', 'c']);
    expect(ids({ cat: 'factures', tags: ['sanitat'] })).toEqual([]);
  });
  it('llegeix la llista de categories', () => {
    expect(catList('all')).toEqual([]);
    expect(catList('salut,factures')).toEqual(['salut', 'factures']);
  });
});
