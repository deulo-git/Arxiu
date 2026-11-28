import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { guessCategory } from '../../shared/categories.ts';
import { uploadFile, type FileItem } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { extLabel, formatSize, isoDate, stripExt } from '../lib/format.ts';
import { makeThumbnail } from '../lib/pdf.ts';
import { api } from '../api.ts';
import { ChipPicker } from '../components/ChipPicker.tsx';
import { useLibrary, useToast } from '../state.tsx';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/*';
const MAX_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const NEW = '__new__';
const LAST_KEY = 'arxiu.last';

interface QueueItem {
  key: string;
  file: File;
  /** Nom sense extensió: és el que decideixes tu. */
  name: string;
  ext: string;
  /** Id de categoria, NEW (en crearé una) o '' (encara per decidir). */
  category: string;
  newCategory: string;
  date: string;
  tags: string[];
  people: string[];
  error?: string;
}

let seq = 0;

function fileExt(name: string) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? `.${m[1].toLowerCase()}` : '';
}

function tidyName(base: string) {
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function readLast(): { tags: string[]; people: string[] } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
    return { tags: Array.isArray(v.tags) ? v.tags : [], people: Array.isArray(v.people) ? v.people : [] };
  } catch {
    return { tags: [], people: [] };
  }
}

export function UploadDialog({ onClose, defaultCategory }: { onClose: () => void; defaultCategory: string }) {
  const { categories, tags, people, prefs, addFiles, setCategories, setTags, setPeople } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tried, setTried] = useState(false);
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

  function initialCategory(file: File): string {
    if (defaultCategory !== 'all' && ids.includes(defaultCategory)) return defaultCategory;
    if (prefs.uploadCategory && ids.includes(prefs.uploadCategory)) return prefs.uploadCategory;
    if (!prefs.guessCategory) return '';
    const guess = guessCategory(file.name, ids);
    // Si no hi ha cap pista al nom, millor que ho decideixis tu que no pas amagar-ho a «Altres».
    return guess === 'altres' && !/n[oò]mina|factura|rebut|contracte|carta|renda|banc|hisenda|impost|m[eè]dic|salut|informe|recepta/i.test(file.name) ? '' : guess;
  }

  function add(list: FileList | null | undefined) {
    const last = prefs.rememberLast ? readLast() : { tags: [], people: [] };
    const arr = Array.from(list ?? []).map<QueueItem>((file) => {
      const base = stripExt(file.name);
      return {
        key: `u${++seq}`,
        file,
        name: prefs.tidyName ? tidyName(base) : base,
        ext: fileExt(file.name),
        category: initialCategory(file),
        newCategory: '',
        date: isoDate(),
        tags: last.tags.filter((t) => tags.some((x) => x.id === t)),
        people: last.people.filter((p) => people.some((x) => x.id === p)),
        error: file.size > MAX_BYTES ? `Supera el límit de ${MAX_MB} MB` : undefined,
      };
    });
    if (arr.length) setQueue((q) => [...q, ...arr]);
  }

  const update = (key: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const valid = queue.filter((q) => !q.error);

  /** Què falta per decidir en un arxiu. */
  const missing = (u: QueueItem): string[] => {
    const m: string[] = [];
    if (!u.name.trim()) m.push('nom');
    if (!u.category) m.push('categoria');
    if (u.category === NEW && !u.newCategory.trim()) m.push('nom de la nova categoria');
    return m;
  };
  const incomplete = valid.some((u) => missing(u).length > 0);

  const createTag = async (name: string) => {
    const { item } = await api.addTag(name);
    setTags((t) => [...t, item]);
    return item;
  };
  const createPerson = async (name: string) => {
    const { item } = await api.addPerson(name);
    setPeople((p) => [...p, item]);
    return item;
  };

  const applyToAll = (u: QueueItem) =>
    setQueue((q) => q.map((x) => (x.error ? x : { ...x, category: u.category, newCategory: u.newCategory, tags: u.tags, people: u.people })));

  async function start() {
    setTried(true);
    if (!valid.length || uploading || incomplete) return;
    setUploading(true);
    setProgress(0);
    const total = valid.reduce((a, q) => a + q.file.size, 0) || 1;
    let done = 0;
    const uploaded: FileItem[] = [];
    const failed: QueueItem[] = [];
    // Categories noves demanades en aquesta pujada (es creen una sola vegada).
    const known = new Map(categories.map((c) => [c.name.toLocaleLowerCase('ca'), c.id]));
    const created: typeof categories = [];
    for (const item of valid) {
      try {
        let category = item.category;
        if (category === NEW) {
          const name = item.newCategory.trim();
          const hit = known.get(name.toLocaleLowerCase('ca'));
          if (hit) category = hit;
          else {
            const { category: c } = await api.addCategory(name);
            known.set(name.toLocaleLowerCase('ca'), c.id);
            created.push(c);
            category = c.id;
          }
        }
        const base = item.name.trim();
        const finalName = item.ext && !base.toLowerCase().endsWith(item.ext) ? base + item.ext : base;
        const { thumb, pages } = await makeThumbnail(item.file);
        const f = await uploadFile(
          item.file,
          { name: finalName, category, date: item.date, thumb, pages, tags: item.tags, people: item.people },
          (loaded) => setProgress(Math.min(99, Math.round(((done + Math.min(loaded, item.file.size)) / total) * 100))),
        );
        uploaded.push(f);
      } catch (err) {
        failed.push({ ...item, error: (err as Error).message });
      }
      done += item.file.size;
      setProgress(Math.round((done / total) * 100));
    }
    if (created.length) setCategories((cs) => [...cs, ...created.filter((c) => !cs.some((x) => x.id === c.id))]);
    if (uploaded.length) addFiles(uploaded);
    if (prefs.rememberLast && valid[0]) {
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ tags: valid[0].tags, people: valid[0].people }));
      } catch {
        /* sense emmagatzematge */
      }
    }
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
          className={`drop${over ? ' over' : ''}${queue.length ? ' compact' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <div className="icon-tile">
            <Icon name="upload" />
          </div>
          <strong>Arrossega els arxius aquí</strong>
          <span className="meta" style={{ fontSize: 13 }}>
            PDF, JPG, PNG o HEIC · fins a {MAX_MB} MB per arxiu
          </span>
          <label className="btn btn-primary">
            <input className="sr" type="file" multiple accept={ACCEPT} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
            {queue.length ? 'Afegeix més arxius' : "Tria arxius de l'ordinador"}
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
            {queue.map((u) => {
              const need = tried ? missing(u) : [];
              return (
                <div className="queue-item" key={u.key}>
                  <div className="row-flex" style={{ gap: 12 }}>
                    <span className="mini">{extLabel(u.file.name)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="ell meta">
                        {u.file.name} · {formatSize(u.file.size)}
                      </div>
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
                    <div className="stack" style={{ gap: 12 }}>
                      <div>
                        <label className="lbl" htmlFor={`n-${u.key}`}>
                          Nom del document
                        </label>
                        <div className="name-row">
                          <input
                            id={`n-${u.key}`}
                            className="field field-sm block"
                            value={u.name}
                            maxLength={180}
                            disabled={uploading}
                            placeholder="Ex.: Nòmina octubre 2026"
                            aria-invalid={need.includes('nom')}
                            onChange={(e) => update(u.key, { name: e.target.value })}
                          />
                          {u.ext && <span className="ext">{u.ext}</span>}
                        </div>
                        {need.includes('nom') && <p className="err">Posa un nom al document.</p>}
                      </div>
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
                            aria-invalid={need.includes('categoria')}
                            onChange={(e) => update(u.key, { category: e.target.value })}
                          >
                            <option value="" disabled>
                              Tria una categoria…
                            </option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            <option value={NEW}>+ Nova categoria…</option>
                          </select>
                          {need.includes('categoria') && <p className="err">Tria una categoria.</p>}
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
                      {u.category === NEW && (
                        <div>
                          <label className="lbl" htmlFor={`nc-${u.key}`}>
                            Nom de la nova categoria
                          </label>
                          <input
                            id={`nc-${u.key}`}
                            className="field field-sm block"
                            value={u.newCategory}
                            maxLength={60}
                            autoFocus
                            disabled={uploading}
                            placeholder="Ex.: Cotxe"
                            onChange={(e) => update(u.key, { newCategory: e.target.value })}
                          />
                          {need.includes('nom de la nova categoria') && <p className="err">Escriu el nom de la categoria.</p>}
                        </div>
                      )}
                      <ChipPicker
                        label="Etiquetes"
                        kind="tag"
                        items={tags}
                        value={u.tags}
                        onChange={(v) => update(u.key, { tags: v })}
                        onCreate={createTag}
                        placeholder="Afegeix o crea una etiqueta…"
                        disabled={uploading}
                      />
                      <ChipPicker
                        label="Persones relacionades"
                        kind="person"
                        items={people}
                        value={u.people}
                        onChange={(v) => update(u.key, { people: v })}
                        onCreate={createPerson}
                        placeholder="Afegeix o crea una persona…"
                        disabled={uploading}
                      />
                      {valid.length > 1 && (
                        <button type="button" className="btn btn-link" style={{ fontSize: 13, alignSelf: 'flex-start' }} disabled={uploading} onClick={() => applyToAll(u)}>
                          Aplica categoria, etiquetes i persones a tots els arxius
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {uploading && (
              <div className="prog" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progrés de la pujada">
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {tried && incomplete && <p className="err" role="alert">Completa el nom i la categoria de cada arxiu abans de pujar-los.</p>}
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
