import { useState, type CSSProperties } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Pill } from '../components/Pill.tsx';
import { catList, periods, type Filters } from '../lib/filters.ts';
import { formatDate } from '../lib/format.ts';
import { useLibrary } from '../state.tsx';

type Update = (patch: Partial<Filters>) => void;

/** Quants filtres (sense comptar la cerca ni l'ordre) hi ha actius. */
export function activeCount(f: Filters) {
  return catList(f.cat).length + f.tags.length + f.people.length + (f.period !== 'all' ? 1 : 0);
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function Mode({ value, onChange, label }: { value: 'all' | 'any'; onChange: (v: 'all' | 'any') => void; label: string }) {
  return (
    <div className="seg mode" role="group" aria-label={label}>
      <button className={`mode-btn${value === 'all' ? ' on' : ''}`} aria-pressed={value === 'all'} onClick={() => onChange('all')} title="El document ha de tenir-les totes">
        Totes
      </button>
      <button className={`mode-btn${value === 'any' ? ' on' : ''}`} aria-pressed={value === 'any'} onClick={() => onChange('any')} title="N'hi ha prou amb una">
        Qualsevol
      </button>
    </div>
  );
}

interface Option {
  id: string;
  name: string;
  color: string;
  count: number;
}

function Group({
  title,
  kind,
  options,
  selected,
  onToggle,
  mode,
  onMode,
}: {
  title: string;
  kind: 'cat' | 'tag' | 'person';
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  mode?: 'all' | 'any';
  onMode?: (v: 'all' | 'any') => void;
}) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q.trim() || o.name.toLocaleLowerCase('ca').includes(q.trim().toLocaleLowerCase('ca')));
  return (
    <div className="fgroup" role="group" aria-label={title}>
      <div className="fhead">
        <span>{title}</span>
        {selected.length > 0 && <span className="fcount">{selected.length}</span>}
      </div>
      {mode && onMode && selected.length > 1 && (
        <div className="row-flex" style={{ gap: 8 }}>
          <span className="meta">Ha de coincidir amb</span>
          <Mode value={mode} onChange={onMode} label={`Coincidència de ${title.toLowerCase()}`} />
        </div>
      )}
      {options.length > 10 && (
        <input className="field field-sm block" type="search" placeholder={`Cerca ${title.toLowerCase()}…`} aria-label={`Cerca ${title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="fopts">
        {options.length === 0 && <p className="meta">Encara no n'hi ha.</p>}
        {shown.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button key={o.id} className={`fopt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onToggle(o.id)}>
              <Pill kind={kind} name={o.name} color={o.color} small />
              <span className="n">{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Panell de filtres: categories, persones i etiquetes amb selecció múltiple. */
export function FilterPanel({ filters, update, onClose }: { filters: Filters; update: Update; onClose: () => void }) {
  const { files, categories, tags, people } = useLibrary();
  const cats = catList(filters.cat);
  const count = (pick: (f: (typeof files)[number]) => string[]) => {
    const m = new Map<string, number>();
    files.forEach((f) => pick(f).forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)));
    return m;
  };
  const catCounts = count((f) => [f.category]);
  const tagCounts = count((f) => f.tags);
  const personCounts = count((f) => f.people);
  const n = activeCount(filters);

  return (
    <section className="panel fpanel" aria-label="Filtres">
      <div className="row-flex" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 16 }}>Filtres</h2>
        <div className="row-flex" style={{ gap: 6 }}>
          {n > 0 && (
            <button className="btn btn-link" onClick={() => update({ cat: 'all', tags: [], people: [], period: 'all', from: '', to: '' })}>
              Neteja filtres
            </button>
          )}
          <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Tanca els filtres" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="fgrid">
        <Group
          title="Categories"
          kind="cat"
          options={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, count: catCounts.get(c.id) ?? 0 }))}
          selected={cats}
          onToggle={(id) => {
            const next = toggle(cats, id);
            update({ cat: next.length ? next.join(',') : 'all' });
          }}
        />
        <Group
          title="Persones"
          kind="person"
          options={people.map((p) => ({ id: p.id, name: p.name, color: p.color, count: personCounts.get(p.id) ?? 0 }))}
          selected={filters.people}
          onToggle={(id) => update({ people: toggle(filters.people, id) })}
          mode={filters.personMode}
          onMode={(v) => update({ personMode: v })}
        />
        <Group
          title="Etiquetes"
          kind="tag"
          options={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: tagCounts.get(t.id) ?? 0 }))}
          selected={filters.tags}
          onToggle={(id) => update({ tags: toggle(filters.tags, id) })}
          mode={filters.tagMode}
          onMode={(v) => update({ tagMode: v })}
        />
      </div>
    </section>
  );
}

/** Fila amb els filtres actius, cadascun es pot treure amb un clic. */
export function ActiveFilters({ filters, update, shown, onClear }: { filters: Filters; update: Update; shown: number; onClear: () => void }) {
  const { files, categories, tags, people, catColor } = useLibrary();
  const cats = catList(filters.cat);
  const chips: { key: string; label: string; kind: string; color?: string; remove: () => void }[] = [];
  for (const id of cats) {
    const c = categories.find((x) => x.id === id);
    if (c) chips.push({ key: `c${id}`, kind: 'Categoria', label: c.name, color: catColor(id), remove: () => update({ cat: cats.filter((x) => x !== id).join(',') || 'all' }) });
  }
  for (const id of filters.people) {
    const p = people.find((x) => x.id === id);
    if (p) chips.push({ key: `p${id}`, kind: 'Persona', label: p.name, color: p.color, remove: () => update({ people: filters.people.filter((x) => x !== id) }) });
  }
  for (const id of filters.tags) {
    const t = tags.find((x) => x.id === id);
    if (t) chips.push({ key: `t${id}`, kind: 'Etiqueta', label: `#${t.name}`, color: t.color, remove: () => update({ tags: filters.tags.filter((x) => x !== id) }) });
  }
  if (filters.period !== 'all') {
    const label =
      filters.period === 'custom'
        ? [filters.from && `des del ${formatDate(filters.from)}`, filters.to && `fins al ${formatDate(filters.to)}`].filter(Boolean).join(' ') || 'Rang de dates'
        : periods().find((p) => p.id === filters.period)?.label ?? '';
    chips.push({ key: 'period', kind: 'Període', label, remove: () => update({ period: 'all', from: '', to: '' }) });
  }
  if (!chips.length && !filters.q) return null;
  return (
    <div className="active-filters" aria-live="polite">
      <span className="meta" style={{ fontSize: 13 }}>
        {shown} de {files.length} documents
      </span>
      {chips.map((c) => (
        <span key={c.key} className="achip" style={c.color ? ({ '--c': c.color } as CSSProperties) : undefined}>
          <span className="k">{c.kind}:</span> {c.label}
          <button aria-label={`Treu el filtre ${c.kind.toLowerCase()} ${c.label}`} onClick={c.remove}>
            ×
          </button>
        </span>
      ))}
      <button className="btn btn-link" style={{ fontSize: 13 }} onClick={onClear}>
        Neteja-ho tot
      </button>
    </div>
  );
}
