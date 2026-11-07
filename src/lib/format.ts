const MS = ['gen.', 'febr.', 'març', 'abr.', 'maig', 'juny', 'jul.', 'ag.', 'set.', 'oct.', 'nov.', 'des.'];
export const MONTHS = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];

/** Data local en format AAAA-MM-DD. */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/** «2026-10-31» → «31 oct. 2026» */
export function formatDate(s: string): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${parseInt(d, 10)} ${MS[parseInt(m, 10) - 1]} ${y}`;
}

export function formatSize(b: number): string {
  if (b < 1_000_000) return `${Math.max(1, Math.round(b / 1000))} KB`;
  if (b < 1_000_000_000) return `${(b / 1_000_000).toFixed(1).replace('.', ',')} MB`;
  return `${(b / 1_000_000_000).toFixed(2).replace('.', ',')} GB`;
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 2) return 'ara mateix';
  if (min < 60) return `fa ${min} minuts`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'fa 1 hora' : `fa ${h} hores`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ahir' : `fa ${d} dies`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatDate(isoDate(d))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function countLabel(n: number) {
  return n === 1 ? '1 document' : `${n} documents`;
}

export function extLabel(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (!m) return 'DOC';
  const e = m[1].toUpperCase();
  return e === 'JPEG' ? 'JPG' : e.slice(0, 4);
}

export function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, '');
}
