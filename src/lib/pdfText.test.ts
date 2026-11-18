// The pdf.js adapter with the library injected: the options it opens a document with, the page cap and the two refusals in words.
import { describe, expect, it, vi } from 'vitest';
import { readPdfText } from './pdfText';
import type { PdfLib } from './pdfText';

const fakeLib = (pageCount: number, fail?: Error) => {
  const getDocument = vi.fn(() => ({
    promise: fail ? Promise.reject(fail) : Promise.resolve({
      numPages: pageCount,
      getPage: async (n: number) => ({ getTextContent: async () => ({ items: [{ str: 'Page' }, { str: String(n) }, { notText: true }] }) }),
      destroy: async () => {},
    }),
    destroy: async () => {},
  }));
  return { lib: { getDocument } as unknown as PdfLib, getDocument };
};
const blob = new Blob([new Uint8Array([1, 2, 3])]);

describe('readPdfText', () => {
  it('opens the document with eval and font loading off, and joins the text items of a page with spaces', async () => {
    const { lib, getDocument } = fakeLib(2);
    const out = await readPdfText(blob, { lib });
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false, disableFontFace: true, data: expect.any(Uint8Array) }));
    expect(out).toEqual({ pages: ['Page 1', 'Page 2'], totalPages: 2 });
  });
  it('reads at most maxPages and still reports the total', async () => {
    const out = await readPdfText(blob, { lib: fakeLib(450).lib, maxPages: 400 });
    expect(out.pages).toHaveLength(400);
    expect(out.totalPages).toBe(450);
  });
  it('asks for the password to be removed', async () => {
    const err = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    await expect(readPdfText(blob, { lib: fakeLib(1, err).lib })).rejects.toThrow('This PDF is password-protected · remove the password and upload it again');
  });
  it('says any other failure in one sentence', async () => {
    await expect(readPdfText(blob, { lib: fakeLib(1, new Error('Invalid PDF structure')).lib })).rejects.toThrow('This PDF could not be read');
  });
});
