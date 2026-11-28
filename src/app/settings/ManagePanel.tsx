import { useState, type FormEvent } from 'react';
import { PALETTE } from '../../../shared/colors.ts';
import { ColorPicker } from '../../components/ColorPicker.tsx';
import { Icon } from '../../components/Icon.tsx';

export interface ManageItem {
  id: string;
  name: string;
  color: string;
  notes?: string;
}

interface Props {
  title: string;
  intro: string;
  /** Text del botó i del camp de nom en afegir. */
  addLabel: string;
  placeholder: string;
  empty: string;
  items: ManageItem[];
  counts: Map<string, number>;
  withNotes?: boolean;
  /** Id que no es pot eliminar. */
  fixedId?: string;
  avatar?: boolean;
  onAdd: (name: string, color: string, notes: string) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; color?: string; notes?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove?: (id: string, dir: -1 | 1) => Promise<void>;
  onMerge?: (id: string, into: string) => Promise<void>;
  deleteHint: (item: ManageItem, count: number) => string;
}

/** Llista editable (categories, etiquetes o persones): nom, color, notes, ordre, fusió i eliminació. */
export function ManagePanel(p: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[p.items.length % PALETTE.length].hex);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await p.onAdd(name.trim(), color, notes);
      setName('');
      setNotes('');
      setColor(PALETTE[(p.items.length + 1) % PALETTE.length].hex);
    } catch {
      /* el missatge ja l'ha mostrat qui crida */
    } finally {
      setBusy(false);
    }
  }

  const shown = p.items.filter((i) => !q.trim() || i.name.toLocaleLowerCase('ca').includes(q.trim().toLocaleLowerCase('ca')));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="panel">
        <div>
          <h2>{p.title}</h2>
          <p className="meta" style={{ fontSize: 13, marginTop: 4 }}>
            {p.intro}
          </p>
        </div>
        <form className="stack" style={{ gap: 12 }} onSubmit={add}>
          <div className="row-flex" style={{ gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="lbl" htmlFor={`add-${p.title}`}>
                {p.addLabel}
              </label>
              <input id={`add-${p.title}`} className="field block" maxLength={60} placeholder={p.placeholder} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={!name.trim() || busy}>
              <Icon name="plus" strokeWidth={2} />
              Afegeix
            </button>
          </div>
          {p.withNotes && (
            <input className="field block" maxLength={500} placeholder="Notes (opcional): parentiu, DNI, qualsevol cosa útil" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
          <ColorPicker value={color} onChange={setColor} label="Color" />
        </form>
      </section>

      <section className="panel list" style={{ padding: 0 }}>
        {p.items.length > 6 && (
          <div style={{ padding: '14px 16px 0' }}>
            <label className="sr" htmlFor={`q-${p.title}`}>
              Cerca
            </label>
            <input id={`q-${p.title}`} className="field field-sm block" type="search" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {p.items.length === 0 && <p className="muted" style={{ padding: 20, fontSize: 14 }}>{p.empty}</p>}
        {shown.map((it) => {
          const idx = p.items.findIndex((x) => x.id === it.id);
          return <ManageRow key={it.id} item={it} count={p.counts.get(it.id) ?? 0} index={idx} last={p.items.length - 1} props={p} />;
        })}
      </section>
    </div>
  );
}

function ManageRow({ item, count, index, last, props: p }: { item: ManageItem; count: number; index: number; last: number; props: Props }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [mergeInto, setMergeInto] = useState('');

  const saveName = async () => {
    const n = name.trim();
    if (!n) return setName(item.name);
    if (n !== item.name) await p.onUpdate(item.id, { name: n }).catch(() => setName(item.name));
  };

  return (
    <div className="mrow">
      <div className="row-flex" style={{ gap: 10 }}>
        <button
          className={p.avatar ? 'avatar big' : 'swatch'}
          style={{ background: item.color }}
          aria-label={`Color i opcions de ${item.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {p.avatar ? item.name.slice(0, 1).toUpperCase() : null}
        </button>
        <label className="sr" htmlFor={`n-${item.id}`}>
          Nom
        </label>
        <input
          id={`n-${item.id}`}
          className="field field-sm mname"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
        />
        <span className="meta nowrap">{count === 1 ? '1 doc.' : `${count} docs.`}</span>
        {p.onMove && (
          <span className="row-flex desktop-only">
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Puja ${item.name}`} disabled={index <= 0} onClick={() => p.onMove!(item.id, -1)}>
              <Icon name="up" />
            </button>
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Baixa ${item.name}`} disabled={index >= last} onClick={() => p.onMove!(item.id, 1)}>
              <Icon name="down" />
            </button>
          </span>
        )}
        <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Opcions de ${item.name}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="edit" />
        </button>
      </div>
      {open && (
        <div className="stack" style={{ gap: 12, paddingTop: 12 }}>
          <ColorPicker value={item.color} onChange={(c) => p.onUpdate(item.id, { color: c })} label={`Color de ${item.name}`} />
          {p.withNotes && (
            <div>
              <label className="lbl" htmlFor={`no-${item.id}`}>
                Notes
              </label>
              <input
                id={`no-${item.id}`}
                className="field field-sm block"
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (item.notes ?? '') && p.onUpdate(item.id, { notes })}
              />
            </div>
          )}
          <div className="row-flex wrap" style={{ gap: 10 }}>
            {p.onMove && (
              <span className="row-flex mobile-only" style={{ gap: 6 }}>
                <button className="btn btn-ghost" disabled={index <= 0} onClick={() => p.onMove!(item.id, -1)}>
                  <Icon name="up" /> Puja
                </button>
                <button className="btn btn-ghost" disabled={index >= last} onClick={() => p.onMove!(item.id, 1)}>
                  <Icon name="down" /> Baixa
                </button>
              </span>
            )}
            {p.onMerge && p.items.length > 1 && (
              <span className="row-flex" style={{ gap: 6 }}>
                <label className="sr" htmlFor={`m-${item.id}`}>
                  Fusiona amb
                </label>
                <select id={`m-${item.id}`} className="field field-sm" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                  <option value="">Fusiona amb…</option>
                  {p.items
                    .filter((x) => x.id !== item.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
                <button
                  className="btn btn-ghost"
                  disabled={!mergeInto}
                  onClick={async () => {
                    const target = p.items.find((x) => x.id === mergeInto);
                    if (target && window.confirm(`Vols fusionar «${item.name}» dins de «${target.name}»? «${item.name}» desapareixerà i els seus documents passaran a «${target.name}».`)) {
                      await p.onMerge!(item.id, mergeInto);
                    }
                  }}
                >
                  <Icon name="merge" /> Fusiona
                </button>
              </span>
            )}
            {item.id !== p.fixedId && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (window.confirm(`Eliminar «${item.name}»? ${p.deleteHint(item, count)}`)) await p.onDelete(item.id);
                }}
              >
                <Icon name="trash" /> Elimina
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
