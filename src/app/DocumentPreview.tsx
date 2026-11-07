import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { contentUrl, downloadUrl, type FileItem } from '../api.ts';
import { closePdf, openPdf, renderPage } from '../lib/pdf.ts';
import { stripExt } from '../lib/format.ts';

/** Mostra el document: imatges directament i PDF pàgina a pàgina amb pdf.js. */
export function DocumentPreview({ file }: { file: FileItem }) {
  if (file.kind === 'pdf') return <PdfPreview file={file} />;
  return <ImagePreview file={file} />;
}

function Fallback({ file, msg }: { file: FileItem; msg: string }) {
  return (
    <div className="paper">
      <strong style={{ fontSize: 15 }}>{stripExt(file.name)}</strong>
      <p className="muted" style={{ fontSize: 14 }}>
        {msg}
      </p>
      <a className="btn btn-ghost" href={downloadUrl(file)} download style={{ alignSelf: 'center' }}>
        Descarrega l'arxiu
      </a>
    </div>
  );
}

function ImagePreview({ file }: { file: FileItem }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [file.id]);
  if (broken) return <Fallback file={file} msg="Aquest navegador no pot mostrar aquest format d'imatge (p. ex. HEIC)." />;
  return <img className="doc" src={contentUrl(file)} alt={file.name} onError={() => setBroken(true)} />;
}

function PdfPreview({ file }: { file: FileItem }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(560);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setError('');
    fetch(contentUrl(file), { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.arrayBuffer();
      })
      .then((buf) => openPdf(buf))
      .then((d) => {
        loaded = d;
        if (cancelled) closePdf(d);
        else setDoc(d);
      })
      .catch(() => !cancelled && setError("No s'ha pogut obrir el PDF."));
    return () => {
      cancelled = true;
      if (loaded) closePdf(loaded);
    };
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.min(760, Math.floor(entry.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="stack" style={{ width: '100%', alignItems: 'center', gap: 20 }}>
      {error && <Fallback file={file} msg={error} />}
      {!doc && !error && <div className="spinner" aria-label="Carregant el document" />}
      {doc &&
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={`${file.id}-${i}`} doc={doc} page={i + 1} width={width} total={doc.numPages} />
        ))}
    </div>
  );
}

function PdfPage({ doc, page, width, total }: { doc: PDFDocumentProxy; page: number; width: number; total: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(page <= 2);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (visible && ref.current) renderPage(doc, page, ref.current, width).catch(() => {});
  }, [doc, page, width, visible]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Pàgina ${page} de ${total}`}
      style={{ width, aspectRatio: visible ? undefined : '1 / 1.414' }}
    />
  );
}
