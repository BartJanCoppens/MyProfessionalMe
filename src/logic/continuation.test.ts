// A long file is written in parts: when an answer reaches its length limit the next call continues where it stopped (ported from
// GameStudio's _shared/continuation.ts). The parts are joined without the repeat a model puts at the seam.
import { describe, expect, it } from 'vitest';
import { USE_LIMITS } from '../../supabase/functions/_shared/aiGuard.ts';
import { MAX_PARTS, continueText, joinContinuation } from './continuation';
import { GAME_FILE_MAX } from './gameScan';

describe('joinContinuation', () => {
  it('appends the next part', () => expect(joinContinuation('const a = 1;\n', 'const b = 2;\n')).toBe('const a = 1;\nconst b = 2;\n'));
  it('drops a repeat of 20 or more characters at the seam', () => {
    const repeat = 'function render() { draw(); }';
    expect(joinContinuation('let x = 1;\n' + repeat, repeat + '\nrender();')).toBe('let x = 1;\n' + repeat + '\nrender();');
  });
  it('keeps a short overlap of 3 characters: it is a coincidence, not a repeat', () => expect(joinContinuation('var a = b;', 'b;\nvar c;')).toBe('var a = b;b;\nvar c;'));
  it('drops a fence the model opened again, and a closing one', () => {
    expect(joinContinuation('abc', '```js\ndef\n```')).toBe('abcdef\n');
    expect(joinContinuation('', '```html\n<main></main>\n```')).toBe('<main></main>\n');
  });
});

describe('continueText', () => {
  it('hands the model what is written so far and asks for only the rest', () => {
    const t = continueText('const a = 1;');
    expect(t).toContain('<written_so_far>\nconst a = 1;\n</written_so_far>');
    expect(t).toMatch(/Continue it from exactly where it stops/);
  });
});

describe('the parts', () => {
  it('are at most 4 per file, and enough for a full game.js', () => {
    expect(MAX_PARTS).toBe(4);
    // About 3 characters of code to a token: the parts of one file hold more than the file may.
    expect(MAX_PARTS * USE_LIMITS.studio_game.maxTokens * 3).toBeGreaterThanOrEqual(GAME_FILE_MAX['game.js']);
  });
});
