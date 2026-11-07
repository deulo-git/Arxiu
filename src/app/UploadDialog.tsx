import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { guessCategory } from '../../shared/categories.ts';
import { uploadFile, type FileItem } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { extLabel, formatSize, isoDate } from '../lib/format.ts';
import { makeThumbnail } from '../lib/pdf.ts';
import { useLibrary, useToast } from '../state.tsx';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/*';
const MAX_BYTES = 50 * 1024 * 1024;

interface QueueItem {
  key: string;
  file: File;
  category: string;
  date: string;
  error?: string;
}

let seq = 0;

export function UploadDialog({ onClose, defaultCategory }: { onClose: () => void; defaultCategory: string }) {
  const { categories, addFiles } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const ids = categories.map((c) => c.id);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose, uploading]);

  function add(list: FileList | null | undefined) {
    const arr = Array.from(list ?? []).map<QueueItem>((file) => ({
      key: `u${++seq}`,
      file,
      category: defaultCategory !== 'all' && ids.includes(defaultCategory) ? defaultCategory : guessCategory(file.name, ids),
      date: isoDate(),
      error: file.size > MAX_BYTES ? 'Supera el límit de 50 MB' : undefined,
    }));
    if (arr.length) setQueue((q) => [...q, ...arr]);
  }

  const update = (key: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const valid = queue.filter((q) => !q.error);

  async function start() {
    if (!valid.length || uploading) return;
    setUploading(true);
    setProgress(0);
    const total = valid.reduce((a, q) => a + q.file.size, 0) || 1;
    let done = 0;
    const uploaded: FileItem[] = [];
    const failed: QueueItem[] = [];
    for (const item of valid) {
      try {
        const { thumb, pages } = await makeThumbnail(item.file);
        const f = await uploadFile(item.file, { name: item.file.name, category: item.category, date: item.date, thumb, pages }, (loaded) =>
          setProgress(Math.min(99, Math.round(((done + Math.min(loaded, item.file.size)) / total) * 100))),
        );
        uploaded.push(f);
      } catch (err) {
        failed.push({ ...item, error: (err as Error).message });
      }
      done += item.file.size;
      setProgress(Math.round((done / total) * 100));
    }
    if (uploaded.length) addFiles(uploaded);
    setUploading(false);
    if (failed.length) {
      setQueue([...failed, ...queue.filter((q) => q.error && !failed.some((f) => f.key === q.key))]);
      toast(failed.length === 1 ? `No s’ha pogut pujar «${failed[0].file.name}»` : `${failed.length} arxius no s’han pogut pujar`, true);
      return;
    }
    toast(uploaded.length === 1 ? '1 arxiu pujat correctament' : `${uploaded.length} arxius pujats correctament`);
    onClose();
    navigate('/');
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer?.files);
  };

  const label = uploading
    ? `Pujant… ${progress}%`
    : valid.length
      ? `Puja ${valid.length} ${valid.length === 1 ? 'arxiu' : 'arxius'}`
      : 'Puja';

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !uploading && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="upt" tabIndex={-1} ref={dialogRef}>
        <div className="grabber" aria-hidden="true" />
        <div className="dialog-head">
          <h2 id="upt">Puja arxius</h2>
          <button className="icon-btn" aria-label="Tanca" onClick={onClose} disabled={uploading}>
            <Icon name="close" />
          </button>
        </div>

        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <div className="icon-tile">
            <Icon name="upload" />
          </div>
          <strong>Arrossega els arxius aquí</strong>
          <span className="meta" style={{ fontSize: 13 }}>
            PDF, JPG, PNG o HEIC · fins a 50 MB per arxiu
          </span>
          <label className="btn btn-primary">
            <input className="sr" type="file" multiple accept={ACCEPT} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
            Tria arxius de l'ordinador
          </label>
        </div>

        {!queue.length && (
          <div className="pick-options">
            <label className="opt">
              <input className="sr" type="file" accept="image/*" capture="environment" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
              <span className="ic">
                <Icon name="camera" />
              </span>
              <span className="stack">
                Escaneja amb la càmera
                <span className="meta" style={{ fontWeight: 400 }}>
                  Fes una foto del paper
                </span>
              </span>
            </label>
            <label className="opt">
              <input className="sr" type="file" accept="image/*" multiple onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
              <span className="ic">
                <Icon name="image" />
              </span>
              <span className="stack">
                Tria de la galeria
                <span className="meta" style={{ fontWeight: 400 }}>
                  Fotos ja escanejades
                </span>
              </span>
            </label>
            <label className="opt">
              <input className="sr" type="file" accept={ACCEPT} multiple onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
              <span className="ic">
                <Icon name="file" />
              </span>
              <span className="stack">
                Arxius del mòbil
                <span className="meta" style={{ fontWeight: 400 }}>
                  PDF i imatges
                </span>
              </span>
            </label>
          </div>
        )}

        {queue.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>
              {valid.length === 1 ? '1 arxiu a punt' : `${valid.length} arxius a punt`}
            </span>
            {queue.map((u) => (
              <div className="queue-item" key={u.key}>
                <div className="row-flex" style={{ gap: 12 }}>
                  <span className="mini">{extLabel(u.file.name)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ell" style={{ fontSize: 14, fontWeight: 500 }}>
                      {u.file.name}
                    </div>
                    <div className="meta">{formatSize(u.file.size)}</div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Treu ${u.file.name}`}
                    disabled={uploading}
                    onClick={() => setQueue((q) => q.filter((x) => x.key !== u.key))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {u.error ? (
                  <p className="err">{u.error}</p>
                ) : (
                  <div className="queue-fields">
                    <div>
                      <label className="lbl" htmlFor={`c-${u.key}`}>
                        Categoria
                      </label>
                      <select
                        id={`c-${u.key}`}
                        className="field field-sm block"
                        value={u.category}
                        disabled={uploading}
                        onChange={(e) => update(u.key, { category: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="lbl" htmlFor={`d-${u.key}`}>
                        Data del document
                      </label>
                      <input
                        id={`d-${u.key}`}
                        className="field field-sm block"
                        type="date"
                        value={u.date}
                        disabled={uploading}
                        onChange={(e) => e.target.value && update(u.key, { date: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {uploading && (
              <div className="prog" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progrés de la pujada">
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        <div className={`dialog-actions${queue.length ? "" : " desktop-only"}`}>
          <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>
            Cancel·la
          </button>
          <button className="btn btn-primary" disabled={!valid.length || uploading} onClick={start}>
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
