export interface User {
  email: string;
  totpEnabled: boolean;
  lockMinutes: number;
}

export interface Category {
  id: string;
  name: string;
  fixed: boolean;
}

export interface FileItem {
  id: string;
  name: string;
  category: string;
  date: string;
  addedAt: string;
  size: number;
  mime: string;
  kind: 'pdf' | 'image';
  type: string;
  pages: number | null;
  hasThumb: boolean;
}

export interface Status {
  configured: boolean;
  stage: 'mfa' | 'full' | null;
  user: User | null;
}

export interface SessionInfo {
  id: string;
  device: string;
  ip: string;
  lastSeenAt: number;
  createdAt: number;
  current: boolean;
}

export interface Share {
  id: string;
  url?: string;
  createdAt: number;
  expiresAt: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Es crida quan el servidor diu que la sessió ja no és vàlida. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-arxiu': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, data.error || 'No s’ha pogut completar l’acció.');
  }
  return data as T;
}

const get = <T,>(url: string) => request<T>('GET', url);
const post = <T,>(url: string, body: unknown = {}) => request<T>('POST', url, body);

export const api = {
  status: () => get<Status>('/api/auth/status'),
  setup: (token: string, email: string, password: string) => post<{ user: User }>('/api/auth/setup', { token, email, password }),
  login: (email: string, password: string) => post<{ next: 'app' | '2fa'; user: User | null }>('/api/auth/login', { email, password }),
  verify2fa: (code: string) => post<{ user: User }>('/api/auth/2fa', { code }),
  logout: () => post('/api/auth/logout'),
  ping: () => post('/api/auth/ping'),
  forgot: (email: string) => post('/api/auth/forgot', { email }),
  checkReset: (token: string) => post<{ email: string }>('/api/auth/reset/check', { token }),
  reset: (token: string, password: string) => post('/api/auth/reset', { token, password }),
  confirmEmail: (token: string) => post<{ email: string }>('/api/auth/confirm-email', { token }),

  changePassword: (current: string, next: string) => post('/api/account/password', { current, next }),
  saveSettings: (lockMinutes: number) => request<{ user: User }>('PUT', '/api/account/settings', { lockMinutes }),
  setup2fa: () => post<{ secret: string; uri: string; qrSvg: string }>('/api/account/2fa/setup'),
  enable2fa: (code: string) => post<{ user: User }>('/api/account/2fa/enable', { code }),
  disable2fa: (password: string) => post<{ user: User }>('/api/account/2fa/disable', { password }),
  changeEmail: (email: string, password: string) => post('/api/account/email', { email, password }),
  sessions: () => get<{ sessions: SessionInfo[] }>('/api/account/sessions'),
  closeSession: (id: string) => request('DELETE', `/api/account/sessions/${id}`),

  categories: () => get<{ categories: Category[] }>('/api/categories'),
  addCategory: (name: string) => post<{ category: Category }>('/api/categories', { name }),
  renameCategory: (id: string, name: string) => request<{ category: Category }>('PATCH', `/api/categories/${id}`, { name }),
  deleteCategory: (id: string) => request<{ moved: number }>('DELETE', `/api/categories/${id}`),

  files: () => get<{ files: FileItem[]; usedBytes: number }>('/api/files'),
  updateFile: (id: string, patch: Partial<Pick<FileItem, 'name' | 'category' | 'date'>>) =>
    request<{ file: FileItem }>('PATCH', `/api/files/${id}`, patch),
  deleteFile: (id: string) => request('DELETE', `/api/files/${id}`),
  shares: (id: string) => get<{ shares: Share[] }>(`/api/files/${id}/shares`),
  createShare: (id: string, hours: number) => post<{ share: Share }>(`/api/files/${id}/shares`, { hours }),
  revokeShare: (id: string) => request('DELETE', `/api/shares/${id}`),
};

export const contentUrl = (f: FileItem) => `/api/files/${f.id}/content`;
export const downloadUrl = (f: FileItem) => `/api/files/${f.id}/content?download=1`;
export const thumbUrl = (f: FileItem) => `/api/files/${f.id}/thumb`;

export interface UploadMeta {
  name: string;
  category: string;
  date: string;
  pages?: number | null;
  thumb?: Blob | null;
}

/** Puja un arxiu amb XHR per poder mostrar el progrés. */
export function uploadFile(file: File, meta: UploadMeta, onProgress: (loaded: number) => void): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('name', meta.name);
    form.append('category', meta.category);
    form.append('date', meta.date);
    if (meta.pages) form.append('pages', String(meta.pages));
    if (meta.thumb) form.append('thumb', meta.thumb, 'thumb.jpg');
    form.append('file', file, meta.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('x-arxiu', '1');
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let data: { file?: FileItem; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* resposta no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve(data.file);
      else {
        if (xhr.status === 401) onUnauthorized?.();
        reject(new ApiError(xhr.status, data.error || `No s’ha pogut pujar «${meta.name}».`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Sense connexió amb el servidor.'));
    xhr.send(form);
  });
}
