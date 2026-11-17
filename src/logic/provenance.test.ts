// Who made a piece of content, in words: one table (provenance.ts) for a studio's items, the Motion Studio's drawing and
// a published learning; no other source spells these labels out.
import { describe, expect, it } from 'vitest';
import { AI_MADE, itemsLabel, madeLabel } from './provenance';

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('provenance labels', () => {
  it('say where a studio\'s items came from, and nothing for items written or saved by hand', () => {
    expect(['ai', 'scripted', 'csv', 'manual', 'saved', undefined].map(itemsLabel)).toEqual([AI_MADE, 'Scripted from the bundle', 'Imported from a CSV', '', '', '']);
  });
  it('say who made a Motion drawing', () => {
    expect((['ai', 'scripted', 'layout'] as const).map(madeLabel)).toEqual([AI_MADE, 'Scripted · boxes and arrows', 'Not animated yet']);
  });
  it('are spelled out in one table only', () => {
    const hits = Object.entries(sources).filter(([path, text]) => !path.endsWith('/provenance.ts') && /'Made with AI'|Scripted from the bundle'|Scripted · boxes and arrows'|Not animated yet'/.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
