import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.ts';
import { BrandMark, Icon } from '../components/Icon.tsx';
import { isNewPasswordOk, NewPasswordFields } from '../components/PasswordFields.tsx';
import { useSession, useToast } from '../state.tsx';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="brand">
          <BrandMark />
          <span>Arxiu</span>
        </div>
        <svg className="art" width="320" height="260" viewBox="0 0 320 260" aria-hidden="true">
          <rect x="40" y="60" width="180" height="220" rx="10" fill="#7A4E2D" />
          <rect x="90" y="30" width="180" height="220" rx="10" fill="#C08552" />
          <rect x="90" y="14" width="64" height="24" rx="6" fill="#C08552" />
          <rect x="140" y="80" width="180" height="220" rx="10" fill="#EAD7C3" />
          <rect x="164" y="112" width="96" height="8" rx="4" fill="#C9B49F" />
          <rect x="164" y="134" width="64" height="8" rx="4" fill="#C9B49F" />
        </svg>
        <div className="hero-text" style={{ position: 'relative', maxWidth: 380 }}>
          <h1>Els teus papers, ordenats i segurs.</h1>
          <p>Cartes, nòmines, factures i contractes escanejats, tots en un sol lloc privat.</p>
          <div className="auth-points">
            <div>
              <Icon name="lock" />
              Accés amb contrasenya, sense comptes de tercers
            </div>
            <div>
              <Icon name="shield" />
              Verificació en dos passos opcional
            </div>
            <div>
              <Icon name="mail" />
              Recuperació de contrasenya per correu
            </div>
          </div>
        </div>
      </div>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

function Heading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div>
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}

function ErrorText({ msg }: { msg: string }) {
  return msg ? (
    <p className="err" role="alert">
      {msg}
    </p>
  ) : null;
}

/* ---------- Inici de sessió ---------- */

export function Login() {
  const { setUser, refresh, notice, setNotice } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pw) return setErr('Introdueix el correu i la contrasenya.');
    setBusy(true);
    setErr('');
    try {
      const res = await api.login(email, pw);
      setNotice('');
      if (res.next === '2fa') {
        await refresh();
        navigate('/entra/verificacio', { state: { from } });
      } else {
        setUser(res.user);
        navigate(from ?? '/', { replace: true });
      }
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <Heading title="Benvingut de nou" lead="Accedeix al teu arxiu privat." />
        {notice && <p className="err" role="status">{notice}</p>}
        <div>
          <label className="lbl" htmlFor="em">
            Correu electrònic
          </label>
          <input
            id="em"
            className="field block"
            type="email"
            autoComplete="username"
            placeholder="tu@correu.cat"
            value={email}
            onChange={(e) => (setEmail(e.target.value), setErr(''))}
          />
        </div>
        <div>
          <div className="row-flex" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label className="lbl" htmlFor="pw">
              Contrasenya
            </label>
            <Link className="btn btn-link" style={{ fontSize: 13 }} to="/recupera" state={{ email }}>
              He oblidat la contrasenya
            </Link>
          </div>
          <div className="pw-wrap">
            <input
              id="pw"
              className="field block"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={pw}
              onChange={(e) => (setPw(e.target.value), setErr(''))}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={showPw ? 'Amaga la contrasenya' : 'Mostra la contrasenya'}
              aria-pressed={showPw}
              onClick={() => setShowPw(!showPw)}
            >
              <Icon name="eye" />
            </button>
          </div>
        </div>
        <ErrorText msg={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Comprovant…' : 'Inicia sessió'}
        </button>
        <p className="meta" style={{ textAlign: 'center' }}>
          Arxiu personal d'un sol usuari. No hi ha inici de sessió amb Google ni amb altres serveis.
        </p>
      </form>
    </AuthLayout>
  );
}

/* ---------- Verificació en dos passos ---------- */

export function TwoFactor() {
  const { setUser, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setErr('El codi ha de tenir 6 dígits.');
    setBusy(true);
    try {
      const res = await api.verify2fa(code.trim());
      setUser(res.user);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (error) {
      setErr((error as Error).message);
      setBusy(false);
    }
  }

  async function back() {
    await api.logout().catch(() => {});
    await refresh();
    navigate('/entra');
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="icon-tile">
          <Icon name="shieldCheck" />
        </div>
        <Heading title="Verificació en dos passos" lead="Escriu el codi de 6 dígits de la teva app d'autenticació." />
        <div>
          <label className="lbl" htmlFor="cd">
            Codi de verificació
          </label>
          <input
            id="cd"
            className="field block code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            value={code}
            onChange={(e) => (setCode(e.target.value.replace(/\D/g, '')), setErr(''))}
          />
        </div>
        <ErrorText msg={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          Verifica i entra
        </button>
        <button type="button" className="btn btn-link" style={{ alignSelf: 'center' }} onClick={back}>
          Torna a l'inici de sessió
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------- Recuperació ---------- */

export function Forgot() {
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Escriu un correu electrònic vàlid.');
    setBusy(true);
    try {
      await api.forgot(email.trim());
      if (sent) toast(`Correu reenviat a ${email}`);
      setSent(true);
      setErr('');
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <div className="icon-tile">
          <Icon name="mail" />
        </div>
        <Heading
          title="Revisa el correu"
          lead={
            <>
              Si <strong style={{ color: 'var(--ink)' }}>{email}</strong> té un compte, rebràs un enllaç en uns minuts. Mira també
              la carpeta de correu brossa.
            </>
          }
        />
        <ErrorText msg={err} />
        <div className="row-flex wrap" style={{ gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => send()} disabled={busy}>
            Reenvia el correu
          </button>
          <Link className="btn btn-link" to="/entra">
            Torna a l'inici de sessió
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={send} noValidate>
        <Heading
          title="Recupera la contrasenya"
          lead="T'enviarem un enllaç per correu per crear-ne una de nova. L'enllaç és d'un sol ús i caduca en 30 minuts."
        />
        <div>
          <label className="lbl" htmlFor="fe">
            Correu electrònic del compte
          </label>
          <input
            id="fe"
            className="field block"
            type="email"
            autoComplete="email"
            placeholder="tu@correu.cat"
            value={email}
            onChange={(e) => (setEmail(e.target.value), setErr(''))}
          />
        </div>
        <ErrorText msg={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          Envia l'enllaç
        </button>
        <Link className="btn btn-link" style={{ alignSelf: 'center' }} to="/entra">
          Torna a l'inici de sessió
        </Link>
      </form>
    </AuthLayout>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState<string | null>(null);
  const [invalid, setInvalid] = useState('');
  const [r1, setR1] = useState('');
  const [r2, setR2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .checkReset(token)
      .then((r) => setEmail(r.email))
      .catch((e) => setInvalid((e as Error).message));
  }, [token]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reset(token, r1);
      setDone(true);
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="icon-tile success">
          <Icon name="check" strokeWidth={2} />
        </div>
        <Heading
          title="Contrasenya actualitzada"
          lead="Per seguretat, s'ha tancat la sessió a tots els dispositius. Entra de nou amb la contrasenya nova."
        />
        <Link className="btn btn-primary btn-block" to="/entra">
          Inicia sessió
        </Link>
      </AuthLayout>
    );
  }

  if (invalid) {
    return (
      <AuthLayout>
        <Heading title="Enllaç no vàlid" lead={invalid} />
        <Link className="btn btn-primary btn-block" to="/recupera">
          Demana un enllaç nou
        </Link>
        <Link className="btn btn-link" style={{ alignSelf: 'center' }} to="/entra">
          Torna a l'inici de sessió
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-card" style={{ gap: 18 }} onSubmit={save} noValidate>
        <Heading title="Crea una contrasenya nova" lead={email ? `Per al compte ${email}` : '…'} />
        <NewPasswordFields value={r1} repeat={r2} onChange={setR1} onRepeat={setR2} />
        <ErrorText msg={err} />
        <button className="btn btn-primary btn-block" disabled={!email || !isNewPasswordOk(r1, r2) || busy}>
          Desa la contrasenya
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------- Primera configuració ---------- */

export function Setup() {
  const [params] = useSearchParams();
  const { setUser, status } = useSession();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [r1, setR1] = useState('');
  const [r2, setR2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (status?.configured) {
    return (
      <AuthLayout>
        <Heading title="El compte ja està creat" lead="Aquest arxiu ja té propietari. Inicia sessió per continuar." />
        <Link className="btn btn-primary btn-block" to="/entra">
          Inicia sessió
        </Link>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout>
        <Heading
          title="Configura el teu Arxiu"
          lead="Encara no hi ha cap compte. Obre l'enllaç de configuració que el servidor ha escrit al registre en arrencar, o crea el compte des del terminal amb «npm run user:create»."
        />
      </AuthLayout>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.setup(token, email, r1);
      setUser(res.user);
      navigate('/', { replace: true });
    } catch (error) {
      setErr((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" style={{ gap: 18 }} onSubmit={submit} noValidate>
        <Heading title="Crea el teu compte" lead="Serà l'únic compte d'aquest arxiu. El correu serveix per recuperar la contrasenya." />
        <div>
          <label className="lbl" htmlFor="se">
            Correu electrònic
          </label>
          <input
            id="se"
            className="field block"
            type="email"
            autoComplete="username"
            placeholder="tu@correu.cat"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <NewPasswordFields value={r1} repeat={r2} onChange={setR1} onRepeat={setR2} label="Contrasenya" />
        <ErrorText msg={err} />
        <button className="btn btn-primary btn-block" disabled={!email || !isNewPasswordOk(r1, r2) || busy}>
          Crea el compte
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------- Confirmació del correu de recuperació ---------- */

export function ConfirmEmail() {
  const [params] = useSearchParams();
  const { status, refresh } = useSession();
  const [state, setState] = useState<{ ok?: string; err?: string }>({});

  useEffect(() => {
    api
      .confirmEmail(params.get('token') ?? '')
      .then((r) => {
        setState({ ok: r.email });
        if (status?.stage === 'full') refresh();
      })
      .catch((e) => setState({ err: (e as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const target = status?.stage === 'full' ? '/ajustos' : '/entra';
  return (
    <AuthLayout>
      {!state.ok && !state.err && <div className="spinner" aria-label="Comprovant" />}
      {state.ok && (
        <>
          <div className="icon-tile success">
            <Icon name="check" strokeWidth={2} />
          </div>
          <Heading title="Correu confirmat" lead={`A partir d'ara, el correu de recuperació és ${state.ok}.`} />
        </>
      )}
      {state.err && <Heading title="No s'ha pogut confirmar" lead={state.err} />}
      {(state.ok || state.err) && (
        <Link className="btn btn-primary btn-block" to={target}>
          Continua
        </Link>
      )}
    </AuthLayout>
  );
}
