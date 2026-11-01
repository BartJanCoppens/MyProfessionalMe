import { describe, expect, it } from 'vitest';
import { BUNDLES0, RAG_PRESETS } from '../data';
import { importBundle, okfFiles, parseOkf, rankHits, retrieve, tarBytes } from './okf';

const b2 = BUNDLES0.find((b) => b.id === 'B2')!;

describe('okfFiles and parseOkf', () => {
  it('round-trips the bundle name and tags through the index file', () => {
    const files = okfFiles(b2);
    const idx = parseOkf(files[0].front + '\n' + files[0].body);
    expect(files[0].path).toBe('index.md');
    expect(idx.fm).toMatchObject({ type: 'bundle', title: b2.name, tags: b2.tags });
  });
  it('writes one file per concept, source and retrieval profile', () => {
    const files = okfFiles(b2);
    expect(files).toHaveLength(1 + b2.concepts.length + b2.sources.length + b2.models.length);
    for (const f of files) expect(parseOkf(f.front + '\n' + f.body).fm.type).toBe(f.type);
  });
  it('marks client and licensed sources as excluded from retrieval', () => {
    const b1 = BUNDLES0.find((b) => b.id === 'B1')!;
    const client = okfFiles(b1).find((f) => f.path.startsWith('sources/delcroix'))!;
    expect(parseOkf(client.front).fm).toMatchObject({ sensitivity: 'client', retrieval: 'excluded', passages: '0' });
  });
  it('reads files with Windows line endings or a byte-order mark', () => {
    expect(parseOkf('\uFEFF---\r\ntype: concept\r\ntitle: A\r\n---\r\nBody').fm).toEqual({ type: 'concept', title: 'A' });
  });
  it('reads a file without frontmatter, or with unclosed frontmatter, as plain text', () => {
    expect(parseOkf('# Just a heading')).toEqual({ fm: {}, body: '# Just a heading' });
    expect(parseOkf('---\ntitle: x\nno end')).toEqual({ fm: {}, body: '---\ntitle: x\nno end' });
    expect(parseOkf('')).toEqual({ fm: {}, body: '' });
  });
});

describe('importBundle', () => {
  it('builds a bundle from OKF files and skips files without a type', () => {
    const files = okfFiles(b2).map((f) => ({ file: f.path.split('/').pop()!, text: f.front + '\n' + f.body })).concat([{ file: 'notes.md', text: 'no frontmatter here' }]);
    const r = importBundle(files, 'tax.cit', 'B9');
    expect(r.skipped).toBe(1);
    expect(r.bundle).toMatchObject({ id: 'B9', name: b2.name, topic: 'tax.cit', access: 'admins', status: 'reindex' });
    expect(r.bundle.concepts).toHaveLength(b2.concepts.length);
  });
});

describe('tarBytes', () => {
  const tar = tarBytes('kb', [{ path: 'index.md', front: '---\ntype: bundle\n---\n', body: '# Hi\n' }], 0);
  it('pads to 512-byte blocks and ends with two empty blocks', () => {
    expect(tar.length % 512).toBe(0);
    expect(tar.slice(tar.length - 1024).every((x) => x === 0)).toBe(true);
  });
  it('writes a valid ustar header checksum', () => {
    const hd = tar.slice(0, 512), stored = parseInt(new TextDecoder().decode(hd.slice(148, 154)), 8);
    const sum = Array.from(hd).reduce((a, x, i) => a + (i >= 148 && i < 156 ? 32 : x), 0);
    expect(stored).toBe(sum);
    expect(new TextDecoder().decode(hd.slice(0, 11))).toBe('kb/index.md');
  });
});

describe('retrieval', () => {
  const b1 = BUNDLES0.find((b) => b.id === 'B1')!;
  it('never returns passages from client or licensed sources', () => {
    const hits = retrieve(BUNDLES0, 'delcroix engagement files facilitator guide four colours');
    for (const h of hits) expect(h.src).not.toMatch(/Delcroix engagement files|Four Colours facilitator guide/);
  });
  it('keeps at most top-k passages above the threshold', () => {
    const loose = { ...RAG_PRESETS.broad, id: 'm', def: true, topk: '3', thresh: '0.55' };
    const strict = { ...loose, thresh: '0.80' };
    const q = 'cost-to-serve customers logistics wholesale operating model';
    expect(rankHits([b1], loose, q).length).toBeLessThanOrEqual(3);
    expect(rankHits([b1], strict, q).length).toBeLessThanOrEqual(rankHits([b1], loose, q).length);
  });
});
