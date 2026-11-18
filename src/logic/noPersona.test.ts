import { describe, expect, it } from 'vitest';

// Every source file, as text. Guards against fictional people creeping back in: the seeded learner (Lena Mertens),
// her counsellor, and the learner's-eye demo colleagues. The design's studio looks (Marleen, Yves, Sara) are roles now. Avatar-practice characters (AVATARS) are content, not people.
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '../../supabase/migrations/20261118170000_stock_looks.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('source code', () => {
  it('names no seeded learner, counsellor or colleague', () => {
    const hits = Object.entries(sources).filter(([, text]) => /Lena|Mertens|Thomas|Jonas|Peeters|Amira|Haddad|Sofie|Elise|Janssens|Inès|Dubois|Karel|Yusuf|Demir|Marleen|Yves|\bSara\b/.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
