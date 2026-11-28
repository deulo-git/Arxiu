import { useEffect, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.ts';
import { BrandMark, Icon } from '../components/Icon.tsx';
import { formatSize } from '../lib/format.ts';
import { toParams, useFilters } from '../lib/filters.ts';
import { useLibrary, useSession, useToast } from '../state.tsx';
import { UploadDialog } from './UploadDialog.tsx';

export interface ShellContext {
  openUpload: () => void;
}

/** Avisa el servidor quan hi ha activitat, perquè el tancament per inactivitat compti el temps real d'ús. */
function useActivityPing() {
  useEffect(() => {
    let active = false;
    const mark = () => (active = true);
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = window.setInterval(() => {
      if (active) {
        active = false;
        api.ping().catch(() => {});
      }
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(timer);
    };
  }, []);
}

/** Secció del menú lateral que es pot plegar; l'estat es recorda al navegador. */
function useCollapsed(key: string) {
  const k = `arxiu.fold.${key}`;
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(k) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(k, f ? '0' : '1');
      } catch {
        /* sense emmagatzematge */
      }
      return !f;
    });
  return [folded, toggle] as const;
}

function FoldTitle({ label, folded, onToggle }: { label: string; folded: boolean; onToggle: () => void }) {
  return (
    <button className="fold-title" aria-expanded={!folded} onClick={onToggle}>
      <Icon name={folded ? 'next' : 'down'} size={16} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export function Shell() {
  const { categories, files, usedBytes, setCategories, tags, people } = useLibrary();
  const { setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { filters } = useFilters();
  const [upload, setUpload] = useState(false);
  const [adding, setAdding] = useState(false);
  const [catFold, toggleCat] = useCollapsed('categories');
  const [peopleFold, togglePeople] = useCollapsed('people');
  const [tagFold, toggleTag] = useCollapsed('tags');
  const [newCat, setNewCat] = useState('');
  useActivityPing();

  // Drecera de la PWA («Puja un document»): /?pujar=1 obre directament el diàleg.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('pujar')) {
      setUpload(true);
      const next = new URLSearchParams(params);
      next.delete('pujar');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const inLibrary = location.pathname === '/';
  const inSettings = location.pathname === '/ajustos';
  const counts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const personCounts = new Map<string, number>();
  files.forEach((f) => {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    f.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
    f.people.forEach((p) => personCounts.set(p, (personCounts.get(p) ?? 0) + 1));
  });
  const goFilter = (patch: { tag?: string; person?: string }) =>
    navigate({ pathname: '/', search: toParams({ ...filters, cat: 'all', tag: '', person: '', ...patch }).toString() });

  const goCat = (cat: string) => {
    const p = toParams({ ...filters, cat });
    navigate({ pathname: '/', search: p.toString() });
  };

  async function addCat(e: FormEvent) {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    try {
      const { category } = await api.addCategory(name);
      setCategories([...categories, category]);
      setAdding(false);
      setNewCat('');
      goCat(category.id);
      toast(`Categoria «${name}» creada`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/entra', { replace: true });
    toast('Sessió tancada');
  }

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navegació principal">
        <Link className="brand" to="/" aria-label="Arxiu: ves a l'inici" style={{ padding: '0 8px', gap: 10, color: 'inherit', textDecoration: 'none' }}>
          <BrandMark />
          <span>Arxiu</span>
        </Link>
        <button className="btn btn-primary btn-block" onClick={() => setUpload(true)}>
          <Icon name="upload" strokeWidth={2} />
          Puja arxius
        </button>
        <div className="stack" style={{ gap: 2 }}>
          <div className="nav-heading">
            <FoldTitle label="Categories" folded={catFold} onToggle={toggleCat} />
            <button
              className="icon-btn"
              style={{ width: 32, height: 32 }}
              aria-label="Nova categoria"
              aria-expanded={adding}
              onClick={() => (setAdding(!adding), setNewCat(''))}
            >
              <Icon name="plus" strokeWidth={2} />
            </button>
          </div>
          {adding && !catFold && (
            <form className="row-flex" style={{ gap: 6, padding: '0 4px 8px' }} onSubmit={addCat}>
              <label className="sr" htmlFor="nc">
                Nom de la categoria
              </label>
              <input
                id="nc"
                className="field field-sm"
                placeholder="Ex.: Cotxe"
                autoFocus
                maxLength={60}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <button className="btn btn-primary" style={{ minHeight: 40, padding: '0 12px' }}>
                Afegeix
              </button>
            </form>
          )}
          {!catFold && categories.map((c) => (
            <button key={c.id} className={`nav${inLibrary && filters.cat === c.id ? ' on' : ''}`} onClick={() => goCat(c.id)}>
              <span className="cat-ico" style={{ color: c.color, display: 'flex' }}>
                <Icon name="folder" />
              </span>
              <span className="ell">{c.name}</span>
              <span className="n">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
        {people.length > 0 && (
          <div className="stack" style={{ gap: 2 }}>
            <div className="nav-heading">
              <FoldTitle label="Persones" folded={peopleFold} onToggle={togglePeople} />
            </div>
            {!peopleFold && people.map((p) => (
              <button key={p.id} className={`nav${inLibrary && filters.person === p.id ? ' on' : ''}`} onClick={() => goFilter({ person: p.id })}>
                <span className="avatar" style={{ background: p.color }} aria-hidden="true">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="ell">{p.name}</span>
                <span className="n">{personCounts.get(p.id) ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="stack" style={{ gap: 2 }}>
            <div className="nav-heading">
              <FoldTitle label="Etiquetes" folded={tagFold} onToggle={toggleTag} />
            </div>
            {!tagFold && tags.map((t) => (
              <button key={t.id} className={`nav${inLibrary && filters.tag === t.id ? ' on' : ''}`} onClick={() => goFilter({ tag: t.id })}>
                <span style={{ color: t.color, fontWeight: 700, width: 20, textAlign: 'center' }} aria-hidden="true">
                  #
                </span>
                <span className="ell">{t.name}</span>
                <span className="n">{tagCounts.get(t.id) ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
          <div className="meta" style={{ padding: '0 12px 10px' }}>
            {formatSize(usedBytes)} utilitzats
          </div>
          <Link className={`nav${inSettings ? ' on' : ''}`} to="/ajustos">
            <Icon name="gear" />
            Configuració
          </Link>
          <button className="nav" onClick={logout}>
            <Icon name="logout" />
            Tanca la sessió
          </button>
        </div>
      </nav>

      <main className="main">
        <Outlet context={{ openUpload: () => setUpload(true), logout } satisfies ShellContext & { logout: () => void }} />
      </main>

      <nav className="tabbar" aria-label="Navegació">
        <Link className={`tab${!inSettings ? ' on' : ''}`} to={{ pathname: '/', search: toParams(filters).toString() }}>
          <Icon name="folder" />
          Arxius
        </Link>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button className="fab" aria-label="Puja un document" onClick={() => setUpload(true)}>
            <Icon name="plus" strokeWidth={2} />
          </button>
        </div>
        <Link className={`tab${inSettings ? ' on' : ''}`} to="/ajustos">
          <Icon name="gear" />
          Ajustos
        </Link>
      </nav>

      {upload && <UploadDialog onClose={() => setUpload(false)} defaultCategory={filters.cat} />}
    </div>
  );
}
