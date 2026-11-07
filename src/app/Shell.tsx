import { useEffect, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
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

export function Shell() {
  const { categories, files, usedBytes, setCategories } = useLibrary();
  const { setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { filters } = useFilters();
  const [upload, setUpload] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');
  useActivityPing();

  const inLibrary = location.pathname === '/';
  const inSettings = location.pathname === '/ajustos';
  const counts = new Map<string, number>();
  files.forEach((f) => counts.set(f.category, (counts.get(f.category) ?? 0) + 1));

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
        <div className="brand" style={{ padding: '0 8px', gap: 10 }}>
          <BrandMark />
          <span>Arxiu</span>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => setUpload(true)}>
          <Icon name="upload" strokeWidth={2} />
          Puja arxius
        </button>
        <div className="stack" style={{ gap: 2 }}>
          <button className={`nav${inLibrary && filters.cat === 'all' ? ' on' : ''}`} onClick={() => goCat('all')}>
            <Icon name="doc" />
            Tots els documents<span className="n">{files.length}</span>
          </button>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <div className="nav-heading">
            <span>Categories</span>
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
          {adding && (
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
          {categories.map((c) => (
            <button key={c.id} className={`nav${inLibrary && filters.cat === c.id ? ' on' : ''}`} onClick={() => goCat(c.id)}>
              <Icon name="folder" />
              <span className="ell">{c.name}</span>
              <span className="n">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="meta" style={{ padding: '0 12px 10px' }}>
            {formatSize(usedBytes)} utilitzats
          </div>
          <Link className={`nav${inSettings ? ' on' : ''}`} to="/ajustos">
            <Icon name="lock" />
            Seguretat i compte
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
          <Icon name="lock" />
          Ajustos
        </Link>
      </nav>

      {upload && <UploadDialog onClose={() => setUpload(false)} defaultCategory={filters.cat} />}
    </div>
  );
}
