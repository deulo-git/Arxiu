import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { api, setUnauthorizedHandler, type Category, type FileItem, type Person, type Prefs, type Status, type Tag, type User } from './api.ts';
import { DEFAULT_PREFS } from '../shared/prefs.ts';
import { setDefaultSort } from './lib/filters.ts';
import { makeThumbnail } from './lib/pdf.ts';
import { Icon } from './components/Icon.tsx';

/* ---------- Avisos ---------- */

interface Toast {
  msg: string;
  error?: boolean;
}

const ToastCtx = createContext<(msg: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), error ? 4200 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={say}>
      {children}
      {toast && (
        <div className={`toast${toast.error ? ' error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <Icon name={toast.error ? 'alert' : 'check'} strokeWidth={2} />
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Sessió ---------- */

interface SessionCtx {
  status: Status | null;
  setUser: (u: User | null) => void;
  refresh: () => Promise<Status>;
  /** Missatge per mostrar a la pantalla d'inici de sessió (p. ex. sessió caducada). */
  notice: string;
  setNotice: (s: string) => void;
}

const SessionContext = createContext<SessionCtx | null>(null);
export const useSession = () => useContext(SessionContext)!;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const s = await api.status();
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    refresh().catch(() => setStatus({ configured: true, stage: null, user: null }));
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setNotice('La sessió s’ha tancat per inactivitat. Torna a entrar.');
      setStatus((s) => (s ? { ...s, stage: null, user: null } : s));
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const setUser = useCallback((user: User | null) => {
    setStatus((s) => ({ configured: true, ...(s ?? {}), stage: user ? 'full' : null, user }));
  }, []);

  const value = useMemo(() => ({ status, setUser, refresh, notice, setNotice }), [status, setUser, refresh, notice]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ---------- Biblioteca ---------- */

interface LibraryCtx {
  loaded: boolean;
  files: FileItem[];
  categories: Category[];
  usedBytes: number;
  reload: () => Promise<void>;
  addFiles: (f: FileItem[]) => void;
  replaceFile: (f: FileItem) => void;
  removeFile: (id: string) => void;
  setCategories: Dispatch<SetStateAction<Category[]>>;
  catName: (id: string) => string;
  catColor: (id: string) => string;
  tags: Tag[];
  people: Person[];
  setTags: Dispatch<SetStateAction<Tag[]>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => Promise<void>;
}

const LibraryContext = createContext<LibraryCtx | null>(null);
export const useLibrary = () => useContext(LibraryContext)!;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();

  // El tema i l'ordre per defecte s'apliquen a tota l'aplicació.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
    setDefaultSort(prefs.sort);
  }, [prefs.theme, prefs.sort]);

  // Genera, en segon pla, les miniatures dels documents que no en tenen (p. ex. els importats).
  const thumbTried = useRef(new Set<string>());
  const thumbBusy = useRef(false);
  const [thumbTick, setThumbTick] = useState(0);
  useEffect(() => {
    if (!loaded || thumbBusy.current) return;
    const todo = files.filter((f) => !f.hasThumb && !thumbTried.current.has(f.id) && f.size <= 80_000_000);
    if (!todo.length) return;
    thumbBusy.current = true;
    let cancelled = false;
    (async () => {
      for (const f of todo) {
        if (cancelled) break;
        thumbTried.current.add(f.id);
        try {
          const res = await fetch(`/api/files/${f.id}/content`, { credentials: 'same-origin' });
          if (!res.ok) continue;
          const { thumb, pages } = await makeThumbnail(new File([await res.blob()], f.name, { type: f.mime }));
          if (!thumb) continue;
          const r = await api.putThumb(f.id, thumb, pages);
          setFiles((prev) => prev.map((x) => (x.id === f.id ? r.file : x)));
        } catch {
          /* es reintentarà en una altra sessió */
        }
      }
      thumbBusy.current = false;
      if (!cancelled) setThumbTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
      thumbBusy.current = false;
    };
  }, [loaded, files, thumbTick]);

  const updatePrefs = useCallback(
    async (patch: Partial<Prefs>) => {
      setPrefs((p) => ({ ...p, ...patch }));
      try {
        const res = await api.savePrefs(patch);
        setPrefs(res.prefs);
      } catch (err) {
        toast((err as Error).message, true);
      }
    },
    [toast],
  );

  const reload = useCallback(async () => {
    try {
      const [f, c, t, p, pr] = await Promise.all([api.files(), api.categories(), api.tags(), api.people(), api.prefs()]);
      setFiles(f.files);
      setCategories(c.categories);
      setTags(t.items);
      setPeople(p.items);
      setPrefs(pr.prefs);
      setLoaded(true);
    } catch (err) {
      toast((err as Error).message, true);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<LibraryCtx>(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const colors = new Map(categories.map((c) => [c.id, c.color]));
    return {
      loaded,
      files,
      categories,
      usedBytes: files.reduce((a, f) => a + f.size, 0),
      reload,
      addFiles: (nf) => setFiles((prev) => [...nf, ...prev]),
      replaceFile: (f) => setFiles((prev) => prev.map((x) => (x.id === f.id ? f : x))),
      removeFile: (id) => setFiles((prev) => prev.filter((x) => x.id !== id)),
      setCategories,
      catName: (id) => names.get(id) ?? 'Altres',
      catColor: (id) => colors.get(id) ?? '#57534e',
      tags,
      people,
      setTags,
      setPeople,
      prefs,
      updatePrefs,
    };
  }, [loaded, files, categories, tags, people, prefs, reload, updatePrefs]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

/** Text addicional pel qual es pot cercar un document: nom d'etiquetes, persones i categoria. */
export function useSearchText() {
  const { tags, people, catName } = useLibrary();
  return useMemo(() => {
    const t = new Map(tags.map((x) => [x.id, x.name]));
    const p = new Map(people.map((x) => [x.id, x.name]));
    return (f: FileItem) => [catName(f.category), ...f.tags.map((i) => t.get(i) ?? ''), ...f.people.map((i) => p.get(i) ?? '')].join(' ');
  }, [tags, people, catName]);
}
