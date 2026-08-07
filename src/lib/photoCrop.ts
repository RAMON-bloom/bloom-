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

// Renders page 1 of a PDF (base64, no data: prefix) onto an offscreen canvas via pdfjs-dist,
// loaded dynamically so it never bloats the main app bundle.
export async function renderPdfPageToCanvas(base64: string): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Renders the source file and crops out the normalized (0-1) box Gemini identified,
// returning the result as a data URL ready to use as an avatar.
export async function renderAndCrop(fileBase64: string, mimeType: string, box: PhotoCropBox): Promise<string> {
  const sourceCanvas = mimeType === 'application/pdf'
    ? await renderPdfPageToCanvas(fileBase64)
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
