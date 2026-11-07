import { useId } from 'react';
import { checkPassword, STRENGTH_LABELS } from '../../shared/password.ts';
import { Icon } from './Icon.tsx';

/** Contrasenya nova + repetició, amb indicador de seguretat i requisits. */
export function NewPasswordFields({
  value,
  repeat,
  onChange,
  onRepeat,
  label = 'Contrasenya nova',
}: {
  value: string;
  repeat: string;
  onChange: (v: string) => void;
  onRepeat: (v: string) => void;
  label?: string;
}) {
  const id = useId();
  const c = checkPassword(value);
  const level = `l${c.score}`;
  const mismatch = !!repeat && repeat !== value;
  return (
    <>
      <div>
        <label className="lbl" htmlFor={`${id}-1`}>
          {label}
        </label>
        <input
          id={`${id}-1`}
          className="field block"
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="sb-row" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`sb ${c.score >= n ? level : ''}`} />
          ))}
          <span className="sb-label">{STRENGTH_LABELS[c.score]}</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <Req ok={c.length}>Mínim 12 caràcters</Req>
        <Req ok={c.mixedCase}>Majúscules i minúscules</Req>
        <Req ok={c.digitOrSymbol}>Almenys un número o símbol</Req>
      </div>
      <div>
        <label className="lbl" htmlFor={`${id}-2`}>
          Repeteix la contrasenya
        </label>
        <input
          id={`${id}-2`}
          className="field block"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => onRepeat(e.target.value)}
        />
      </div>
      {mismatch && (
        <p className="err" role="alert">
          Les contrasenyes no coincideixen.
        </p>
      )}
    </>
  );
}

function Req({ ok, children }: { ok: boolean; children: string }) {
  return (
    <div className={`req${ok ? ' ok' : ''}`}>
      <Icon name="check" strokeWidth={2} />
      {children}
      <span className="sr">{ok ? ' (complert)' : ' (pendent)'}</span>
    </div>
  );
}

export function isNewPasswordOk(value: string, repeat: string) {
  return checkPassword(value).valid && value === repeat;
}
