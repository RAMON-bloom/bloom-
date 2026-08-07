// Vite resolves any import ending in "?url" to the served asset's URL string.
// TypeScript doesn't know this convention by default, so declare it for the
// pdfjs-dist worker script we load this way in ResumePhotoCropperModal.
declare module '*?url' {
  const url: string;
  export default url;
}
