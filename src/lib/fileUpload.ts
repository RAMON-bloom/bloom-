// Shared file-prep helpers used wherever a user drops a resume/CV file for AI parsing and/or
// Drive upload — both at candidate registration (CandidateFormModal) and when adding documents
// to an already-registered candidate (CandidateDetailModal).

// Vercel serverless functions reject request/response bodies above ~4.5MB before our code ever
// runs, returning a plain-text "Request Entity Too Large" page instead of JSON. Base64 inflates
// size by ~4/3, so keep raw files comfortably under that ceiling.
export const MAX_UPLOAD_FILE_BYTES = 3 * 1024 * 1024;

const COMPRESS_MAX_DIMENSION_PX = 1600;
const COMPRESS_JPEG_QUALITY = 0.72;
const COMPRESS_MAX_PDF_PAGES = 15;
// A large or complex PDF (many pages, or dense/high-entropy embedded images) can legitimately
// take a while to rasterize — measured in the ~10-20s range, not the sub-second case for a
// simple text resume. That's an acceptable wait given the alternative is rejecting the file
// outright, but it must still be bounded: give up and fall back to the original file once this
// budget is spent, so a pathological file can never hang the form indefinitely. The existing
// oversized-file skip/warning path takes it from there.
const COMPRESS_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('compression timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export const readFileAsDataUrl = (file: globalThis.File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadImageElement = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = dataUrl;
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像の圧縮に失敗しました'))), 'image/jpeg', COMPRESS_JPEG_QUALITY);
  });

async function compressImageFile(file: globalThis.File): Promise<globalThis.File> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(dataUrl);
  const scale = Math.min(1, COMPRESS_MAX_DIMENSION_PX / Math.max(img.naturalWidth, img.naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToJpegBlob(canvas);
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}

// Rasterizes each PDF page (via pdfjs-dist, already a dependency for photo-crop rendering) and
// rebuilds a new, much smaller PDF from JPEG-compressed pages (via pdf-lib). This trades away
// text-selectability for file size — reasonable for a resume, where what matters is that a
// recruiter can still read it, not that its text is copy-pasteable. Both libraries are imported
// dynamically so they never bloat the main app bundle for the common (small-file) case.
async function compressPdfFile(file: globalThis.File): Promise<{ file: globalThis.File; truncated: boolean }> {
  const [pdfjsLib, workerUrlModule, pdfLibModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('pdf-lib')
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrlModule.default;
  const { PDFDocument } = pdfLibModule;

  const srcBytes = new Uint8Array(await file.arrayBuffer());
  const srcPdf = await pdfjsLib.getDocument({ data: srcBytes }).promise;
  const outPdf = await PDFDocument.create();

  const truncated = srcPdf.numPages > COMPRESS_MAX_PDF_PAGES;
  const pageCount = Math.min(srcPdf.numPages, COMPRESS_MAX_PDF_PAGES);
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await srcPdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, COMPRESS_MAX_DIMENSION_PX / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const jpegBlob = await canvasToJpegBlob(canvas);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const jpegImage = await outPdf.embedJpg(jpegBytes);
    const outPage = outPdf.addPage([viewport.width, viewport.height]);
    outPage.drawImage(jpegImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
  }

  const outBytes = await outPdf.save();
  return { file: new File([outBytes], file.name, { type: 'application/pdf' }), truncated };
}

export interface CompressResult {
  file: globalThis.File;
  compressed: boolean;
  /** True if a PDF had more pages than COMPRESS_MAX_PDF_PAGES and the rest were dropped. */
  truncated: boolean;
}

// Compresses a file only if it's over maxBytes and of a compressible type (PDF or image); text
// files are already small, and Word docs aren't handled since re-encoding OOXML isn't practical
// here. Falls back to returning the original file untouched if compression fails or doesn't
// apply — callers should still size-check the result before use.
export async function compressFileIfOversized(file: globalThis.File, maxBytes: number): Promise<CompressResult> {
  if (file.size <= maxBytes) return { file, compressed: false, truncated: false };

  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const { file: compressedFile, truncated } = await withTimeout(compressPdfFile(file), COMPRESS_TIMEOUT_MS);
      return { file: compressedFile, compressed: true, truncated };
    }
    if (file.type.startsWith('image/')) {
      const compressedFile = await withTimeout(compressImageFile(file), COMPRESS_TIMEOUT_MS);
      return { file: compressedFile, compressed: true, truncated: false };
    }
  } catch (err) {
    console.error('File compression failed', err);
  }
  return { file, compressed: false, truncated: false };
}
