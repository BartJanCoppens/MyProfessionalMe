import { describe, expect, it } from 'vitest';
import { STUDIOS, STUDIO_STEPS, STOCK_LOOKS } from '../studioData';
import { itemsValid, studioById, visibleSteps } from './studios';
import type { StudioItem } from './studios';

const def = (id: string) => studioById(id)!;
const ITEMS = (id: string) => def(id).items as StudioItem[];

describe('studio definitions', () => {
  it('has the ten design studios, each with questions and produce rows (flash: both too)', () => {
    expect(STUDIOS.map((s) => s.id)).toEqual(['avatar', 'reel', 'podcast', 'game', 'slides', 'motion', 'explainer', 'aid', 'flash', 'case']);
    for (const s of STUDIOS) { expect(s.qs.length).toBeGreaterThan(0); expect(s.rows.length).toBeGreaterThan(0); expect(s.items.length).toBeGreaterThanOrEqual(s.min); }
    expect(def('avatar').qs).toHaveLength(4);
    expect(def('reel').build).toEqual(['Writing the voice-over', 'Recording the avatar take', 'Adding visuals and captions', 'Final cut']);
  });
  it('names a learning format per studio and only flash is available in Phase 1', () => {
    expect(STUDIOS.map((s) => s.format)).toEqual(['Avatar', 'Reel', 'Podcast', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Flash cards', 'Case exercise']);
    expect(def('flash').alsoFormats).toEqual(['Practice exam']);
    expect(STUDIOS.filter((s) => s.available).map((s) => s.id)).toEqual(['flash']);
  });
  it('names no person: examples and stock looks use roles', () => {
    const text = JSON.stringify([STUDIOS, STOCK_LOOKS]);
    expect(text).not.toMatch(/Marleen|Pieter|\bSara\b|Yves/);
    expect(STOCK_LOOKS.map((l) => l.role)).toEqual(['HR director · 50s', 'CFO · 40s', 'Consultant · 30s', 'Engineer · 50s']);
  });
  it('finds a studio by id', () => { expect(studioById('reel')?.name).toBe('Reel Studio'); expect(studioById('nope')).toBeUndefined(); });
});

describe('visibleSteps', () => {
  it('gives the four v4 steps for Flash and six for Reel', () => {
    expect(visibleSteps(def('flash'))).toEqual(STUDIO_STEPS);
    expect(visibleSteps(def('reel'))).toEqual(STUDIO_STEPS);
  });
  it('drops Shape without questions and Produce without rows and cast', () => {
    const bare = { ...def('reel'), qs: [], rows: [], cast: null };
    expect(visibleSteps(bare)).toEqual(['Idea & sources', 'Draft', 'Preview & test', 'Check & send']);
    expect(visibleSteps({ ...bare, rows: def('reel').rows })).toContain('Produce');
    expect(visibleSteps({ ...bare, cast: 'look' })).toContain('Produce');
  });
});

describe('itemsValid', () => {
  it('accepts every design example', () => { for (const s of STUDIOS) expect(itemsValid(s, ITEMS(s.id)), s.id).toEqual([]); });
  it('refuses avatar learning points not summing to 100', () => {
    const items = ITEMS('avatar').map((i): StudioItem => (i[0] === 'Learning point · 40 %' ? ['Learning point · 30 %', i[1]] : i));
    expect(itemsValid(def('avatar'), items).join(' ')).toMatch(/100/);
  });
  it('refuses an avatar without a persona and a reel scene without on-screen text', () => {
    expect(itemsValid(def('avatar'), ITEMS('avatar').filter((i) => i[0] !== 'Persona')).join(' ')).toMatch(/Persona/);
    const reel = ITEMS('reel').map((i, k): StudioItem => (k === 1 ? [i[0], i[1], ' '] : i));
    expect(itemsValid(def('reel'), reel).join(' ')).toMatch(/on-screen/i);
  });
  it('refuses podcast chapters without rising timestamps', () => {
    const items = ITEMS('podcast').map((i, k): StudioItem => (k === 2 ? ['Chapter 3 · 2:00', i[1], i[2] ?? ''] : i));
    expect(itemsValid(def('podcast'), items).join(' ')).toMatch(/timestamp/i);
    expect(itemsValid(def('podcast'), ITEMS('podcast').map((i, k): StudioItem => (k === 0 ? ['Chapter 1', i[1], i[2] ?? ''] : i))).join(' ')).toMatch(/timestamp/i);
  });
  it('refuses a game without concept or rounds, a case without criteria, too few items', () => {
    expect(itemsValid(def('game'), ITEMS('game').filter((i) => i[0] !== 'Concept')).join(' ')).toMatch(/Concept/);
    expect(itemsValid(def('game'), ITEMS('game').slice(0, 2)).join(' ')).toMatch(/Round/);
    expect(itemsValid(def('case'), ITEMS('case').filter((i) => i[0] !== 'Criterion')).join(' ')).toMatch(/Criterion/);
    expect(itemsValid(def('aid'), ITEMS('aid').slice(0, 2)).join(' ')).toMatch(/at least 4/);
  });
  it('refuses blank text on any studio', () => {
    expect(itemsValid(def('motion'), ITEMS('motion').map((i, k): StudioItem => (k === 0 ? [i[0], ''] : i))).length).toBeGreaterThan(0);
  });
});
