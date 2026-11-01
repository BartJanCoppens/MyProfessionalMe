import { describe, expect, it } from 'vitest';

// Every source file, as text. Guards against the seeded persona (Lena Mertens) or her counsellor creeping back in.
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('source code', () => {
  it('names no seeded learner or counsellor', () => {
    const hits = Object.entries(sources).filter(([, text]) => /Lena|Mertens|Thomas/.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
