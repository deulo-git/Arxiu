import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, downloadUrl, type Share } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { formatDate, formatDateTime, formatSize } from '../lib/format.ts';
import { useFilteredFiles } from '../lib/filters.ts';
import { useLibrary, useToast } from '../state.tsx';
import { DocumentPreview } from './DocumentPreview.tsx';

export function Viewer() {
  const { id } = useParams();
  const { files, categories, loaded, replaceFile, removeFile } = useLibrary();
  const { list, query } = useFilteredFiles(files);
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [newShare, setNewShare] = useState<Share | null>(null);

  const file = files.find((f) => f.id === id);
  const idx = list.findIndex((f) => f.id === id);
  const back = { pathname: '/', search: query };
  const go = (fid: string) => navigate({ pathname: `/document/${fid}`, search: query }, { replace: true });

  useEffect(() => {
    setConfirmDel(false);
    setNewShare(null);
    setShares([]);
    if (id) api.shares(id).then((r) => setShares(r.shares)).catch(() => {});
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft' && idx > 0) go(list[idx - 1].id);
      if (e.key === 'ArrowRight' && idx >= 0 && idx < list.length - 1) go(list[idx + 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!loaded) return <div className="spinner" aria-label="Carregant" />;
  if (!file) {
    return (
      <div className="panel empty">
        <strong>Aquest document no existeix</strong>
        <p className="muted">Potser s'ha eliminat.</p>
        <Link className="btn btn-primary" to={back}>
          Torna als documents
        </Link>
      </div>
    );
  }

  async function patch(p: { category?: string; date?: string }, msg: string) {
    try {
      const { file: f } = await api.updateFile(file!.id, p);
      replaceFile(f);
      toast(msg);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  async function del() {
    try {
      await api.deleteFile(file!.id);
      removeFile(file!.id);
      navigate(back, { replace: true });
      toast(`«${file!.name}» eliminat`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  async function share() {
    try {
      const { share: s } = await api.createShare(file!.id, 24);
      setNewShare(s);
      setShares((prev) => [s, ...prev]);
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share && matchMedia('(pointer: coarse)').matches) {
        await nav.share({ title: file!.name, url: s.url }).catch(() => {});
      } else {
        await navigator.clipboard?.writeText(s.url!).then(
          () => toast('Enllaç temporal copiat (caduca en 24 h)'),
          () => toast('Enllaç creat (caduca en 24 h)'),
        );
      }
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  async function revoke(sid: string) {
    try {
      await api.revokeShare(sid);
      setShares((prev) => prev.filter((s) => s.id !== sid));
      if (newShare?.id === sid) setNewShare(null);
      toast('Enllaç revocat');
    } catch (err) {
      toast((err as Error).message, true);
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-flex wrap" style={{ gap: 12, justifyContent: 'space-between' }}>
        <Link className="btn btn-ghost" to={back}>
          <Icon name="back" />
          <span className="desktop-only">Tots els documents</span>
          <span className="mobile-only">Torna</span>
        </Link>
        {idx >= 0 && (
          <div className="row-flex" style={{ gap: 6 }}>
            <span className="meta" style={{ fontSize: 13, marginRight: 6 }}>
              {idx + 1} de {list.length}
            </span>
            <button className="icon-btn" aria-label="Document anterior" disabled={idx <= 0} onClick={() => go(list[idx - 1].id)}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" aria-label="Document següent" disabled={idx >= list.length - 1} onClick={() => go(list[idx + 1].id)}>
              <Icon name="next" />
            </button>
          </div>
        )}
      </div>

      <div className="viewer">
        <div className="stage">
          <DocumentPreview file={file} />
        </div>
        <aside className="side">
          <div className="panel stack" style={{ gap: 16 }}>
            <div>
              <span className="badge" style={{ display: 'inline-block', marginBottom: 8 }}>
                {file.type}
              </span>
              <h1 style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, wordBreak: 'break-word' }}>{file.name}</h1>
              <p className="meta" style={{ marginTop: 4, fontSize: 13 }}>
                {formatSize(file.size)}
                {file.pages && file.kind === 'pdf' ? ` · ${file.pages} ${file.pages === 1 ? 'pàgina' : 'pàgines'}` : ''} · pujat el {formatDate(file.addedAt)}
              </p>
            </div>
            <div className="row-flex" style={{ gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={share}>
                <Icon name="share" />
                Comparteix
              </button>
              <a className="btn btn-primary" style={{ flex: 1 }} href={downloadUrl(file)} download>
                <Icon name="download" strokeWidth={2} />
                Descarrega
              </a>
            </div>
            {newShare?.url && (
              <div className="share-box">
                <label className="lbl" htmlFor="shl" style={{ margin: 0 }}>
                  Enllaç temporal · caduca el {formatDateTime(newShare.expiresAt)}
                </label>
                <input id="shl" className="field field-sm block" readOnly value={newShare.url} onFocus={(e) => e.target.select()} />
                <p className="meta">Qualsevol persona amb l'enllaç podrà veure el document fins que caduqui.</p>
              </div>
            )}
            {shares.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="lbl" style={{ margin: 0 }}>
                  Enllaços actius
                </span>
                {shares.map((s) => (
                  <div key={s.id} className="row-flex" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="meta">Caduca el {formatDateTime(s.expiresAt)}</span>
                    <button className="btn btn-link" style={{ fontSize: 13 }} onClick={() => revoke(s.id)}>
                      Revoca
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="stack" style={{ borderTop: '1px solid var(--divider)', paddingTop: 16, gap: 14 }}>
              <div>
                <label className="lbl" htmlFor="vc">
                  Categoria
                </label>
                <select id="vc" className="field block" value={file.category} onChange={(e) => patch({ category: e.target.value }, 'Categoria actualitzada')}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="vd">
                  Data del document
                </label>
                <input
                  id="vd"
                  className="field block"
                  type="date"
                  defaultValue={file.date}
                  key={file.id + file.date}
                  onBlur={(e) => e.target.value && e.target.value !== file.date && patch({ date: e.target.value }, 'Data actualitzada')}
                />
              </div>
            </div>
          </div>
          {!confirmDel ? (
            <button className="btn btn-danger btn-block" onClick={() => setConfirmDel(true)}>
              <Icon name="trash" />
              Elimina el document
            </button>
          ) : (
            <div className="panel confirm" role="alertdialog" aria-labelledby="cdt">
              <strong id="cdt" style={{ fontSize: 14, color: 'var(--danger)' }}>
                Segur que vols eliminar-lo?
              </strong>
              <p className="muted" style={{ fontSize: 13 }}>
                Aquesta acció no es pot desfer.
              </p>
              <div className="row-flex" style={{ gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} autoFocus>
                  Cancel·la
                </button>
                <button className="btn btn-danger-solid" onClick={del}>
                  Elimina
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
