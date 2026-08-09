import { PhotoCropBox } from './driveApi';

// Renders an arbitrary image (base64, no data: prefix) onto an offscreen canvas at its
// native resolution so we can crop pixels out of it afterwards.
export async function renderImageToCanvas(base64: string, mimeType: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
  });
  img.src = `data:${mimeType};base64,${base64}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return canvas;
}

// Renders one page of a PDF (base64, no data: prefix) onto an offscreen canvas via pdfjs-dist,
// loaded dynamically so it never bloats the main app bundle. pageNumber is 1-indexed — resumes
// merged with a career-history doc or a cover sheet often don't have the photo on page 1, so the
// caller (informed by Gemini's own page-number guess) can target whichever page actually has it.
export async function renderPdfPageToCanvas(base64: string, pageNumber: number = 1): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const safePageNumber = Math.min(Math.max(1, Math.round(pageNumber) || 1), pdf.numPages);
  const page = await pdf.getPage(safePageNumber);
  const viewport = page.getViewport({ scale: 2.5 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Bakes the interactive zoom/rotation/aspect-ratio adjustments a user makes in
// ResumePhotoCropperModal into an actual cropped image, matching what the live CSS preview
// (`object-cover` + `transform: scale() rotate()` inside a fixed-size box) shows on screen.
// Without this, saving only ever persisted the untouched source image and silently discarded
// every adjustment the user made.
export async function bakeAdjustedCrop(
  dataUrl: string,
  zoomPercent: number,
  rotationDeg: number,
  aspectRatio: '3:4' | '1:1' | 'circle'
): Promise<string> {
  const img = new Image();
  // Lets cross-origin sources (e.g. an existing hotlinked avatarUrl) that send permissive CORS
  // headers still be drawn to canvas; same-origin data: URLs are unaffected either way.
  img.crossOrigin = 'anonymous';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
  });
  img.src = dataUrl;
  await loaded;

  const outW = 480;
  const outH = aspectRatio === '3:4' ? 640 : 480;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  // object-fit: cover base scale, then the same user zoom multiplier the preview applies on top.
  const coverScale = Math.max(outW / img.naturalWidth, outH / img.naturalHeight);
  const totalScale = coverScale * (zoomPercent / 100);

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(totalScale, totalScale);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}

// Renders the source file and crops out the normalized (0-1) box Gemini identified, returning the
// result as a data URL ready to use as an avatar. pageNumber only applies to PDFs (ignored for
// plain images) and should be whatever page Gemini reported the photo box was found on.
export async function renderAndCrop(fileBase64: string, mimeType: string, box: PhotoCropBox, pageNumber: number = 1): Promise<string> {
  const sourceCanvas = mimeType === 'application/pdf'
    ? await renderPdfPageToCanvas(fileBase64, pageNumber)
    : await renderImageToCanvas(fileBase64, mimeType);

  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const sx = Math.max(0, box.xMin * sw);
  const sy = Math.max(0, box.yMin * sh);
  const cropW = Math.max(1, Math.min(sw - sx, (box.xMax - box.xMin) * sw));
  const cropH = Math.max(1, Math.min(sh - sy, (box.yMax - box.yMin) * sh));

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  out.getContext('2d')!.drawImage(sourceCanvas, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/jpeg', 0.92);
}
