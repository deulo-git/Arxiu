import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, type Category, type FileItem, type Status, type User } from './api.ts';
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
  setCategories: (c: Category[]) => void;
  catName: (id: string) => string;
}

const LibraryContext = createContext<LibraryCtx | null>(null);
export const useLibrary = () => useContext(LibraryContext)!;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();

  const reload = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([api.files(), api.categories()]);
      setFiles(f.files);
      setCategories(c.categories);
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
    };
  }, [loaded, files, categories, reload]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
