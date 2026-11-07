import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Carrega pdf.js només quan cal (és gran). */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      },
    );
  }
  return pdfjsPromise;
}

const tasks = new WeakMap<PDFDocumentProxy, { destroy(): Promise<void> }>();

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

/** Allibera el document i el seu worker. */
export function closePdf(doc: PDFDocumentProxy) {
  tasks.get(doc)?.destroy().catch(() => {});
}

/** Dibuixa una pàgina a un canvas amb l'amplada indicada (en píxels CSS). */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  await page.render({ canvas, viewport }).promise;
}

const THUMB_WIDTH = 360;

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.78));
}

/**
 * Prepara una miniatura JPEG (i el nombre de pàgines per als PDF) abans de pujar.
 * Si el navegador no pot llegir el format (p. ex. HEIC fora de Safari), torna null.
 */
export async function makeThumbnail(file: File): Promise<{ thumb: Blob | null; pages: number | null }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  try {
    if (isPdf) {
      const doc = await openPdf(await file.arrayBuffer());
      const canvas = document.createElement('canvas');
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: THUMB_WIDTH / page.getViewport({ scale: 1 }).width });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
      const pages = doc.numPages;
      const thumb = await canvasToJpeg(canvas);
      closePdf(doc);
      return { thumb, pages };
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { thumb: null, pages: 1 };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { thumb: await canvasToJpeg(canvas), pages: 1 };
  } catch {
    return { thumb: null, pages: isPdf ? null : 1 };
  }
}
