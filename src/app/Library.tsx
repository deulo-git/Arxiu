import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { api, downloadUrl, thumbUrl, type FileItem } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { countLabel, formatDate, formatSize } from '../lib/format.ts';
import { groupByMonth, periods, toParams, useFilteredFiles, type Period, type Sort } from '../lib/filters.ts';
import { useLibrary, useToast } from '../state.tsx';
import type { ShellContext } from './Shell.tsx';

type Mode = 'grid' | 'list';

function readMode(): Mode {
  try {
    return localStorage.getItem('arxiu.mode') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function Library() {
  const { files, categories, loaded, catName, setCategories, reload } = useLibrary();
  const { openUpload } = useOutletContext<ShellContext>();
  const { filters, update, list, query } = useFilteredFiles(files);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [q, setQ] = useState(filters.q);
  const toast = useToast();
  const navigate = useNavigate();

  // La cerca s'aplica mentre escrius, però la URL s'actualitza amb una mica de retard.
  useEffect(() => {
    const t = window.setTimeout(() => q !== filters.q && update({ q }), 200);
    return () => window.clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('arxiu.mode', m);
    } catch {
      /* sense emmagatzematge */
    }
  };

  const current = categories.find((c) => c.id === filters.cat);
  const title = filters.cat === 'all' ? 'Tots els documents' : current?.name ?? 'Categoria';
  const groups = groupByMonth(list, filters.sort);
  const docLink = (f: FileItem) => ({ pathname: `/document/${f.id}`, search: query });
  const clear = () => (setQ(''), update({ period: 'all', from: '', to: '', q: '', cat: 'all' }));

  async function renameCat() {
    if (!current) return;
    const name = window.prompt('Nom nou de la categoria', current.name)?.trim();
    if (!name || name === current.name) return;
    try {
      const { category } = await api.renameCategory(current.id, name);
      setCategories(categories.map((c) => (c.id === category.id ? category : c)));
      toast('Categoria reanomenada');
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  async function deleteCat() {
    if (!current) return;
    if (!window.confirm(`Vols eliminar la categoria «${current.name}»? Els seus documents passaran a «Altres».`)) return;
    try {
      await api.deleteCategory(current.id);
      await reload();
      navigate({ pathname: '/', search: toParams({ ...filters, cat: 'all' }).toString() }, { replace: true });
      toast(`Categoria «${current.name}» eliminada`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="toolbar desktop-only">
        <div className="search">
          <label className="sr" htmlFor="q">
            Cerca documents
          </label>
          <Icon name="search" />
          <input id="q" className="field block" type="search" placeholder="Cerca per nom…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr" htmlFor="so">
          Ordena
        </label>
        <select id="so" className="field" style={{ minWidth: 190 }} value={filters.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
          <option value="new">Més recents primer</option>
          <option value="old">Més antics primer</option>
          <option value="name">Nom (A–Z)</option>
        </select>
        <div className="seg" role="group" aria-label="Vista">
          <button className={`icon-btn${mode === 'grid' ? ' on' : ''}`} aria-label="Vista en quadrícula" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}>
            <Icon name="grid" />
          </button>
          <button className={`icon-btn${mode === 'list' ? ' on' : ''}`} aria-label="Vista en llista" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            <Icon name="list" />
          </button>
        </div>
      </div>

      <div className="row-flex wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>
            {countLabel(list.length)}
          </p>
        </div>
        {current && !current.fixed && (
          <div className="row-flex" style={{ gap: 4 }}>
            <button className="icon-btn" aria-label={`Canvia el nom de ${current.name}`} title="Canvia el nom" onClick={renameCat}>
              <Icon name="edit" />
            </button>
            <button className="icon-btn" aria-label={`Elimina la categoria ${current.name}`} title="Elimina la categoria" onClick={deleteCat}>
              <Icon name="trash" />
            </button>
          </div>
        )}
      </div>

      {/* Mòbil: cerca, categories en xips i període en desplegable */}
      <div className="stack mobile-only" style={{ gap: 14 }}>
        <div className="search">
          <label className="sr" htmlFor="mq">
            Cerca documents
          </label>
          <Icon name="search" />
          <input id="mq" className="field block" type="search" placeholder="Cerca per nom…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 44 }} />
        </div>
        <div className="chips-scroll">
          {[{ id: 'all', name: 'Tots' }, ...categories].map((c) => (
            <button key={c.id} className={`chip${filters.cat === c.id ? ' on' : ''}`} aria-pressed={filters.cat === c.id} onClick={() => update({ cat: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="row-flex" style={{ gap: 10 }}>
          <span className="muted" style={{ display: 'flex' }}>
            <Icon name="calendar" size={20} />
          </span>
          <label className="sr" htmlFor="mp">
            Període
          </label>
          <select id="mp" className="field block field-sm" value={filters.period === 'custom' ? 'all' : filters.period} onChange={(e) => update({ period: e.target.value as Period })}>
            {periods()
              .filter((p) => p.id !== 'custom')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === 'all' ? 'Qualsevol data' : p.label}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="periods desktop-only">
        <Icon name="calendar" />
        {periods().map((p) => (
          <button key={p.id} className={`chip${filters.period === p.id ? ' on' : ''}`} aria-pressed={filters.period === p.id} onClick={() => update({ period: p.id })}>
            {p.label}
          </button>
        ))}
      </div>
      {filters.period === 'custom' && (
        <div className="range desktop-only">
          <div>
            <label className="lbl" htmlFor="df">
              Des de
            </label>
            <input id="df" className="field" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div>
            <label className="lbl" htmlFor="dt">
              Fins a
            </label>
            <input id="dt" className="field" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
          </div>
          <button className="btn btn-link" style={{ minHeight: 44 }} onClick={clear}>
            Neteja filtres
          </button>
        </div>
      )}

      {!loaded && (
        <div className="center-screen" style={{ minHeight: 240 }}>
          <div className="spinner" aria-label="Carregant documents" />
        </div>
      )}

      {loaded && list.length === 0 && (
        <div className="panel empty">
          <Icon name="folder" strokeWidth={1.5} />
          <strong style={{ fontSize: 17 }}>{files.length ? 'Cap document coincideix amb els filtres' : 'Encara no hi ha cap document'}</strong>
          <p className="muted" style={{ fontSize: 14 }}>
            {files.length ? 'Prova un altre període o una altra categoria.' : 'Puja el primer: un PDF o una foto d’un paper.'}
          </p>
          <div className="row-flex wrap" style={{ gap: 10, justifyContent: 'center' }}>
            {files.length > 0 && (
              <button className="btn btn-ghost" onClick={clear}>
                Neteja filtres
              </button>
            )}
            <button className="btn btn-primary" onClick={openUpload}>
              Puja arxius
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="stack grid-groups" style={{ gap: 28 }}>
          {groups.map((g) => (
            <section key={g.key} className={`stack${mode === 'list' ? ' mobile-groups' : ''}`} style={{ gap: 12 }}>
              <h2 className="group-label">{g.label}</h2>
              {mode === 'grid' && (
                <div className="grid">
                  {g.items.map((f) => (
                    <Link key={f.id} className="card" to={docLink(f)} aria-label={`Obre ${f.name}`}>
                      <div className="thumb">
                        {f.hasThumb ? (
                          <img src={thumbUrl(f)} alt="" loading="lazy" />
                        ) : (
                          <div className="sheet" aria-hidden="true">
                            <div className="bar" style={{ width: '60%', background: 'var(--bar-strong)' }} />
                            <div className="bar" />
                            <div className="bar" />
                            <div className="bar" style={{ width: '80%' }} />
                            <div className="bar" />
                            <div className="bar" style={{ width: '45%' }} />
                          </div>
                        )}
                        <span className="badge">{f.type}</span>
                      </div>
                      <div className="card-body">
                        <span className="ell name">{f.name}</span>
                        <span className="meta">
                          {formatDate(f.date)} · {formatSize(f.size)}
                        </span>
                        <span className="tag" style={{ alignSelf: 'flex-start' }}>
                          {catName(f.category)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {/* Mòbil: sempre llista d'elements */}
              <div className="items">
                {g.items.map((f) => (
                  <Link key={f.id} className="item" to={docLink(f)}>
                    <span className="mini">{f.hasThumb ? <img src={thumbUrl(f)} alt="" loading="lazy" /> : f.type}</span>
                    <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="ell" style={{ fontSize: 14, fontWeight: 500 }}>
                        {f.name}
                      </span>
                      <span className="meta">
                        {formatDate(f.date)} · {formatSize(f.size)}
                      </span>
                    </span>
                    <span className="tag" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {catName(f.category)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {mode === 'list' && (
            <div className="table">
              <div className="trow head">
                <span>Nom</span>
                <span>Categoria</span>
                <span>Data</span>
                <span>Mida</span>
                <span style={{ textAlign: 'right' }}>Accions</span>
              </div>
              {list.map((f) => (
                <div className="trow" key={f.id}>
                  <Link className="row-name" to={docLink(f)}>
                    <span className="mini">{f.type}</span>
                    <span className="ell">{f.name}</span>
                  </Link>
                  <span>
                    <span className="tag">{catName(f.category)}</span>
                  </span>
                  <span className="meta" style={{ fontSize: 13 }}>
                    {formatDate(f.date)}
                  </span>
                  <span className="meta" style={{ fontSize: 13 }}>
                    {formatSize(f.size)}
                  </span>
                  <span className="row-flex" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <a className="icon-btn" aria-label={`Descarrega ${f.name}`} href={downloadUrl(f)} download>
                      <Icon name="download" />
                    </a>
                    <Link className="icon-btn" aria-label={`Obre ${f.name}`} to={docLink(f)}>
                      <Icon name="eye" />
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
