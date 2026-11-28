import { PALETTE } from '../../shared/colors.ts';

/** Triar un color de la paleta (o un de personalitzat). */
export function ColorPicker({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const custom = !PALETTE.some((c) => c.hex === value.toLowerCase());
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {PALETTE.map((c) => (
        <button
          key={c.hex}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.hex}
          aria-label={c.name}
          title={c.name}
          className={`swatch${value.toLowerCase() === c.hex ? ' on' : ''}`}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
      <label className={`swatch custom${custom ? ' on' : ''}`} title="Color personalitzat" style={custom ? { background: value } : undefined}>
        <input className="sr" type="color" value={value || '#a8643a'} onChange={(e) => onChange(e.target.value)} aria-label="Color personalitzat" />
        {!custom && <span aria-hidden="true">+</span>}
      </label>
    </div>
  );
}
