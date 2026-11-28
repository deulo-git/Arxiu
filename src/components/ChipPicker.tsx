import { useId, useMemo, useState } from 'react';
import { Pill } from './Pill.tsx';

export interface PickItem {
  id: string;
  name: string;
  color: string;
}

/**
 * Selector múltiple: tria elements existents o crea'n de nous escrivint el nom.
 * `onCreate` ha de crear l'element (p. ex. via l'API) i tornar-lo.
 */
export function ChipPicker({
  label,
  kind,
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  disabled,
}: {
  label: string;
  kind: 'tag' | 'person';
  items: PickItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<PickItem>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const q = text.trim().toLocaleLowerCase('ca');
  const matches = items.filter((i) => !value.includes(i.id) && (!q || i.name.toLocaleLowerCase('ca').includes(q)));
  const exact = items.find((i) => i.name.toLocaleLowerCase('ca') === q);
  const canCreate = !!q && !exact;

  const add = (itemId: string) => {
    onChange([...value, itemId]);
    setText('');
    setError('');
  };

  async function create() {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const item = await onCreate(name);
      onChange([...value, item.id]);
      // Si mentrestant has començat a escriure una altra cosa, no t'ho esborrem.
      setText((t) => (t.trim() === name ? '' : t));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (exact && !value.includes(exact.id)) add(exact.id);
    else if (canCreate) void create();
    else if (matches.length === 1) add(matches[0].id);
  }

  return (
    <div className="picker">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {value.length > 0 && (
        <div className="pills" style={{ marginBottom: 8 }}>
          {value.map((v) => {
            const it = byId.get(v);
            return it ? <Pill key={v} kind={kind} name={it.name} color={it.color} onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== v))} /> : null;
          })}
        </div>
      )}
      <input
        id={id}
        className="field field-sm block"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        maxLength={60}
        onChange={(e) => (setText(e.target.value), setError(''), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
      />
      {error && <p className="err" style={{ marginTop: 4 }}>{error}</p>}
      {open && !disabled && (matches.length > 0 || canCreate) && (
        <div className="suggest" role="listbox" aria-label={label}>
          {matches.slice(0, 30).map((m) => (
            <button key={m.id} type="button" role="option" aria-selected="false" className="sug" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m.id)}>
              <Pill kind={kind} name={m.name} color={m.color} small />
            </button>
          ))}
          {canCreate && (
            <button type="button" className="sug create" onMouseDown={(e) => e.preventDefault()} onClick={create} disabled={busy}>
              + Crea «{text.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
