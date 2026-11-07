export interface DetectedType {
  mime: string;
  kind: 'pdf' | 'image';
  /** Extensió curta per mostrar a la insígnia (PDF, JPG, PNG…). */
  label: string;
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * Detecta el tipus real a partir dels primers bytes. Només s'accepten PDF i
 * imatges habituals: així mai no se serveix HTML o SVG pujat des del mateix origen.
 */
export function detectType(head: Buffer): DetectedType | null {
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', kind: 'pdf', label: 'PDF' };
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image', label: 'JPG' };
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', kind: 'image', label: 'PNG' };
  }
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', kind: 'image', label: 'WEBP' };
  }
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString('latin1'))) {
    return { mime: 'image/gif', kind: 'image', label: 'GIF' };
  }
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    if (HEIF_BRANDS.has(brand)) {
      const heic = brand.startsWith('he');
      return { mime: heic ? 'image/heic' : 'image/heif', kind: 'image', label: heic ? 'HEIC' : 'HEIF' };
    }
  }
  return null;
}

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** Neteja el nom: sense rutes, caràcters de control ni longitud excessiva. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || 'document';
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Capçalera Content-Disposition amb el nom en UTF-8 (RFC 6266 / 5987). */
export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
