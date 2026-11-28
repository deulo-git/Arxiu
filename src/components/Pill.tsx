import type { CSSProperties } from 'react';

/** Etiqueta de color. El color només es fa servir com a mescla, així es llegeix bé en mode clar i fosc. */
export function Pill({ name, color, kind = 'tag', small, onRemove }: { name: string; color: string; kind?: 'tag' | 'person' | 'cat'; small?: boolean; onRemove?: () => void }) {
  return (
    <span className={`pill ${kind}${small ? ' small' : ''}`} style={{ '--c': color } as CSSProperties}>
      {kind === 'person' && <span className="dot" aria-hidden="true" />}
      {kind === 'tag' && <span className="hash" aria-hidden="true">#</span>}
      <span className="ell">{name}</span>
      {onRemove && (
        <button type="button" className="x" aria-label={`Treu ${name}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
