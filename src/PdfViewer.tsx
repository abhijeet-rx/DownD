import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function PdfPageCanvas({ document, pageNumber, width, thumbnail = false }: {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  thumbnail?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, width / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, thumbnail ? 2 : 2.5);
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: '#ffffff',
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) console.error('Unable to render PDF page', error);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, width, thumbnail]);

  return <canvas ref={canvasRef} className={`pdf-page-canvas ${thumbnail ? 'thumbnail-canvas' : ''}`} aria-label={`PDF page ${pageNumber}`} />;
}

export default function PdfViewer({ data }: { data: Uint8Array }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [basePageWidth, setBasePageWidth] = useState(595);
  const [zoom, setZoom] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [loadError, setLoadError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    setDocument(null);
    setPageCount(0);
    setCurrentPage(1);
    setBasePageWidth(595);
    setLoadError('');
    const loadingTask = getDocument({ data: data.slice() });
    void loadingTask.promise.then((loadedDocument) => {
      setDocument(loadedDocument);
      setPageCount(loadedDocument.numPages);
      void loadedDocument.getPage(1).then((page) => setBasePageWidth(page.getViewport({ scale: 1 }).width));
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Unable to read the compiled PDF.');
    });
    return () => { void loadingTask.destroy(); };
  }, [data]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth));
    observer.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fitWidth = Math.max(180, stageWidth - 36);
  const pageWidth = fitWidth * zoom;

  function goToPage(nextPage: number) {
    const page = Math.min(pageCount || 1, Math.max(1, Math.floor(nextPage) || 1));
    setCurrentPage(page);
    pageRefs.current.get(page)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updatePageFromScroll() {
    const stage = stageRef.current;
    if (!stage) return;
    const top = stage.getBoundingClientRect().top;
    let nearestPage = currentPage;
    let nearestDistance = Number.POSITIVE_INFINITY;
    pageRefs.current.forEach((element, pageNumber) => {
      const distance = Math.abs(element.getBoundingClientRect().top - top - 16);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = pageNumber;
      }
    });
    setCurrentPage((page) => page === nearestPage ? page : nearestPage);
  }

  return <div className="pdf-viewer">
    <div className="pdf-viewer-toolbar" aria-label="PDF controls">
      <button className={`pdf-tool-button thumbnail-toggle ${showThumbnails ? 'active' : ''}`} onClick={() => setShowThumbnails((visible) => !visible)} aria-label="Toggle page thumbnails" title="Page thumbnails">▤</button>
      <span className="pdf-toolbar-divider" />
      <button className="pdf-tool-button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">‹</button>
      <input className="pdf-page-input" aria-label="Current page" type="number" min="1" max={pageCount || 1} value={currentPage} onChange={(event) => goToPage(Number(event.target.value))} />
      <span className="pdf-page-total">/ {pageCount || '…'}</span>
      <button className="pdf-tool-button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">›</button>
      <span className="pdf-toolbar-divider" />
      <button className="pdf-tool-button" onClick={() => setZoom((value) => Math.max(0.55, Math.round((value - 0.1) * 100) / 100))} aria-label="Zoom out" title="Zoom out">−</button>
      <span className="pdf-zoom-label">{Math.round(pageWidth / basePageWidth * 100)}%</span>
      <button className="pdf-tool-button" onClick={() => setZoom((value) => Math.min(2.5, Math.round((value + 0.1) * 100) / 100))} aria-label="Zoom in" title="Zoom in">+</button>
      <button className="pdf-fit-button" onClick={() => setZoom(1)} title="Fit page to preview width">Fit width</button>
    </div>
    <div className="pdf-viewer-body">
      {showThumbnails && document && <aside className="pdf-thumbnails" aria-label="PDF page thumbnails">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button className={`pdf-thumbnail ${currentPage === page ? 'selected' : ''}`} key={page} onClick={() => goToPage(page)} aria-label={`Go to page ${page}`}>
          <PdfPageCanvas document={document} pageNumber={page} width={106} thumbnail />
          <span>{page}</span>
        </button>)}
      </aside>}
      <div className="pdf-scroll-stage" ref={stageRef} onScroll={updatePageFromScroll}>
        {loadError ? <div className="pdf-viewer-message">{loadError}</div>
          : document ? <div className="pdf-pages">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <div className="pdf-page-frame" key={page} ref={(element) => { if (element) pageRefs.current.set(page, element); else pageRefs.current.delete(page); }}>
              <PdfPageCanvas document={document} pageNumber={page} width={pageWidth} />
            </div>)}
          </div>
            : <div className="pdf-viewer-message"><div className="pdf-page-skeleton" aria-hidden="true" /><span>Preparing the document preview</span></div>}
      </div>
    </div>
  </div>;
}

