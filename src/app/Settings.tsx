import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { api, type SessionInfo } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { isNewPasswordOk } from '../components/PasswordFields.tsx';
import { PASSWORD_RULES_MESSAGE } from '../../shared/password.ts';
import { relativeTime } from '../lib/format.ts';
import { useLibrary, useSession, useToast } from '../state.tsx';

export function Settings() {
  const { status, setUser } = useSession();
  const { files } = useLibrary();
  const { logout } = useOutletContext<{ logout: () => void }>();
  const user = status!.user!;
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div className="settings">
      <div>
        <h1 className="page-title">
          <span className="desktop-only">Seguretat i compte</span>
          <span className="mobile-only">Ajustos</span>
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          Gestiona l'accés al teu arxiu.
        </p>
      </div>

      <ChangePassword />

      <section className="panel" style={{ gap: 18 }}>
        <h2>Protecció de l'accés</h2>
        <TwoFactorSetting />
        <div className="setting">
          <div>
            <strong>Tancament automàtic</strong>
            <p className="meta">Tanca la sessió després d'un temps sense activitat.</p>
          </div>
          <label className="sr" htmlFor="al">
            Temps d'inactivitat
          </label>
          <select
            id="al"
            className="field"
            value={user.lockMinutes}
            onChange={async (e) => {
              try {
                const res = await api.saveSettings(Number(e.target.value));
                setUser(res.user);
                toast('Tancament automàtic actualitzat');
              } catch (err) {
                toast((err as Error).message, true);
              }
            }}
          >
            <option value={5}>5 minuts</option>
            <option value={15}>15 minuts</option>
            <option value={30}>30 minuts</option>
            <option value={60}>1 hora</option>
          </select>
        </div>
        <RecoveryEmail email={user.email} />
      </section>

      <Sessions />

      <section className="panel setting" style={{ flexDirection: 'row' }}>
        <div>
          <h2>Còpia de seguretat</h2>
          <p className="meta">Descarrega tots els documents en un arxiu .zip, ordenats per categoria.</p>
        </div>
        <a
          className="btn btn-ghost"
          href="/api/export"
          download
          onClick={() => toast(`Preparant l’arxiu .zip amb ${files.length} documents`)}
          aria-disabled={!files.length}
        >
          <Icon name="download" />
          Exporta-ho tot
        </a>
      </section>

      <button
        className="btn btn-ghost btn-block mobile-only"
        style={{ color: 'var(--danger)' }}
        onClick={() => {
          logout();
          navigate('/entra');
        }}
      >
        Tanca la sessió
      </button>
    </div>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [s0, setS0] = useState('');
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!s0) return setErr('Escriu la contrasenya actual.');
    if (s1 !== s2) return setErr('Les contrasenyes noves no coincideixen.');
    if (!isNewPasswordOk(s1, s2)) return setErr(PASSWORD_RULES_MESSAGE);
    setBusy(true);
    try {
      await api.changePassword(s0, s1);
      setS0('');
      setS1('');
      setS2('');
      setErr('');
      toast('Contrasenya actualitzada. S’han tancat les altres sessions.');
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Canvia la contrasenya</h2>
      <input type="text" autoComplete="username" hidden readOnly />
      <div className="cols3">
        <div>
          <label className="lbl" htmlFor="s0">
            Actual
          </label>
          <input id="s0" className="field block" type="password" autoComplete="current-password" value={s0} onChange={(e) => setS0(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="s1">
            Nova
          </label>
          <input id="s1" className="field block" type="password" autoComplete="new-password" value={s1} onChange={(e) => setS1(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="s2">
            Repeteix la nova
          </label>
          <input id="s2" className="field block" type="password" autoComplete="new-password" value={s2} onChange={(e) => setS2(e.target.value)} />
        </div>
      </div>
      <p className="meta">Mínim 12 caràcters, amb majúscules, minúscules i almenys un número o símbol.</p>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy}>
        Actualitza la contrasenya
      </button>
    </form>
  );
}

function TwoFactorSetting() {
  const { status, setUser } = useSession();
  const toast = useToast();
  const enabled = status!.user!.totpEnabled;
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  async function toggle() {
    setErr('');
    if (enabled) return setDisabling(!disabling);
    if (setup) return setSetup(null);
    try {
      const r = await api.setup2fa();
      setSetup(r);
      setCode('');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.enable2fa(code);
      setUser(r.user);
      setSetup(null);
      toast('Verificació en dos passos activada');
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.disable2fa(pw);
      setUser(r.user);
      setDisabling(false);
      setPw('');
      toast('Verificació en dos passos desactivada');
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  const on = enabled || !!setup;
  return (
    <>
      <div className="setting" style={{ flexWrap: 'nowrap' }}>
        <div>
          <strong>Verificació en dos passos</strong>
          <p className="meta">Demana un codi d'una app d'autenticació en cada inici de sessió.</p>
        </div>
        <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={enabled} aria-label="Verificació en dos passos" onClick={toggle}>
          <span />
        </button>
      </div>
      {setup && (
        <form className="stack" style={{ gap: 14, padding: 16, borderRadius: 12, background: 'var(--surface-200)' }} onSubmit={enable}>
          <p style={{ fontSize: 14 }}>
            1. Escaneja aquest codi QR amb una app d'autenticació (Google Authenticator, Aegis, 1Password…).
          </p>
          <div className="qr">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`} alt="Codi QR per configurar la verificació en dos passos" />
          </div>
          <div>
            <p className="meta" style={{ marginBottom: 6 }}>
              Si no pots escanejar-lo, escriu aquesta clau:
            </p>
            <div className="secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</div>
          </div>
          <div>
            <label className="lbl" htmlFor="tc">
              2. Escriu el codi de 6 dígits que mostra l'app
            </label>
            <input
              id="tc"
              className="field code"
              style={{ maxWidth: 240 }}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => (setCode(e.target.value.replace(/\D/g, '')), setErr(''))}
            />
          </div>
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
          <div className="row-flex" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={code.length !== 6}>
              Activa
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
              Cancel·la
            </button>
          </div>
        </form>
      )}
      {disabling && (
        <form className="stack" style={{ gap: 12, padding: 16, borderRadius: 12, background: 'var(--surface-200)' }} onSubmit={disable}>
          <div>
            <label className="lbl" htmlFor="dp">
              Per desactivar-la, escriu la contrasenya
            </label>
            <input id="dp" className="field block" type="password" autoComplete="current-password" value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} />
          </div>
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
          <div className="row-flex" style={{ gap: 8 }}>
            <button className="btn btn-danger" disabled={!pw}>
              Desactiva
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDisabling(false)}>
              Cancel·la
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function RecoveryEmail({ email }: { email: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.changeEmail(next, pw);
      setOpen(false);
      setNext('');
      setPw('');
      toast(`T’hem enviat un correu a ${next} per confirmar el canvi`);
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  return (
    <>
      <div className="setting">
        <div>
          <strong>Correu de recuperació</strong>
          <p className="meta">{email}</p>
        </div>
        <button className="btn btn-ghost" aria-expanded={open} onClick={() => (setOpen(!open), setErr(''))}>
          Canvia
        </button>
      </div>
      {open && (
        <form className="stack" style={{ gap: 12, padding: 16, borderRadius: 12, background: 'var(--surface-200)' }} onSubmit={submit}>
          <div className="cols3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label className="lbl" htmlFor="ne">
                Correu nou
              </label>
              <input id="ne" className="field block" type="email" autoComplete="email" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label className="lbl" htmlFor="np">
                Contrasenya
              </label>
              <input id="np" className="field block" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
          </div>
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
          <p className="meta">Rebràs un enllaç al correu nou. El canvi no s'aplica fins que el confirmis.</p>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!next || !pw}>
            Envia la confirmació
          </button>
        </form>
      )}
    </>
  );
}

function Sessions() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api.sessions().then((r) => setSessions(r.sessions)).catch(() => {});
  }, []);

  async function close(s: SessionInfo) {
    try {
      await api.closeSession(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      toast(`Sessió tancada a ${s.device}`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  return (
    <section className="panel" style={{ gap: 14 }}>
      <h2>Sessions obertes</h2>
      <div>
        {sessions.map((s) => (
          <div className="session-row" key={s.id}>
            <div>
              <strong style={{ fontSize: 14, fontWeight: 500 }}>{s.current ? `Aquest dispositiu · ${s.device.split(' · ')[1]}` : s.device}</strong>
              <p className="meta" style={{ fontSize: 13, marginTop: 2 }}>
                {s.ip} · {s.current ? 'ara mateix' : relativeTime(s.lastSeenAt)}
              </p>
            </div>
            {s.current ? (
              <span className="tag" style={{ background: 'var(--success-soft)', color: 'var(--success-ink)' }}>
                Aquesta sessió
              </span>
            ) : (
              <button className="btn btn-ghost" onClick={() => close(s)}>
                Tanca
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
