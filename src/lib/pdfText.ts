// The one adapter for pdf.js: the text of a PDF, page by page, read in the browser. The library and its worker are loaded on first
// use (a lazy import), so the main bundle does not carry them. Eval and font loading are off: the file is an admin's own upload,
// but it is still untrusted input. The library is injectable so tests never load it.
type TextItem = { str?: unknown };
type PdfPage = { getTextContent(): Promise<{ items: TextItem[] }> };
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
export type PdfLib = { getDocument(src: { data: Uint8Array; isEvalSupported: boolean; disableFontFace: boolean }): { promise: Promise<PdfDocument> } };

const PASSWORD = 'This PDF is password-protected · remove the password and upload it again';
const UNREADABLE = 'This PDF could not be read';
const NO_READER = 'The PDF reader could not load · reload the page';

async function loadLib(): Promise<PdfLib> {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib as unknown as PdfLib;
}

// The text of the first `maxPages` pages (one string per page, items joined with spaces) and the page count of the whole file.
export async function readPdfText(file: Blob, opts: { maxPages?: number; lib?: PdfLib; load?: () => Promise<PdfLib> } = {}): Promise<{ pages: string[]; totalPages: number }> {
  let lib = opts.lib;
  try { lib ??= await (opts.load ?? loadLib)(); } catch (err) { console.error('pdf.js failed to load', err); throw new Error(NO_READER); }
  let doc: PdfDocument | null = null;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, opts.maxPages ?? doc.numPages); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((i) => (typeof i.str === 'string' ? i.str : '')).filter(Boolean).join(' '));
    }
    return { pages, totalPages: doc.numPages };
  } catch (err) {
    throw new Error((err as Error).name === 'PasswordException' ? PASSWORD : UNREADABLE);
  } finally {
    await doc?.destroy().catch(() => {});
  }
}
