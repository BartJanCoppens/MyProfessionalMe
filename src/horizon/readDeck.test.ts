// Reading a .horizon file (studios plan, Task 3.3; Review Focus 6): the Horizon e2e fixture, the reasons a file is refused
// before it is stored, and the cleaning that keeps only what presenting draws, with every link that leaves the file dropped.
import { describe, expect, it } from 'vitest';
import garden from './fixtures/Garden tour.horizon?raw';
import { HORIZON_VERSION, deckProblem, deckSummary, readDeck } from './readDeck';
import { routeOf } from './route';
import { crafted, HOSTILE_SVG, MP3, PNG } from '../test/horizonDecks';

describe('the Horizon fixture (Garden tour)', () => {
  it('reads its title, three slides along the route and no narration', () => {
    const deck = readDeck(garden);
    expect(deck.title).toBe('Garden tour');
    expect(routeOf(deck.frames).map((s) => s.frame.id)).toEqual(['g1', 'g2', 'g3']);
    expect(deckSummary(deck)).toEqual({ title: 'Garden tour', slides: 3, seconds: 0 });
    expect(deck.frames[1].viz).toEqual({ type: 'bars', items: [{ label: 'Sun', value: 40 }, { label: 'Shade', value: 15 }] });
  });
});

describe('a file is refused before it is stored, with a reason', () => {
  it('when it is not a .horizon file, or over 50 MB', () => {
    expect(deckProblem('deck.pptx', 10)).toBe('Add a .horizon file made in Horizon');
    expect(deckProblem('deck.horizon', 50 * 1024 * 1024 + 1)).toBe('A Horizon presentation is at most 50 MB · this one is 50.0 MB');
    expect(deckProblem('deck.horizon', 0)).toBe('The file is empty');
    expect(deckProblem('Garden tour.horizon', 900)).toBeNull();
  });
  it('when it is not JSON', () => {
    expect(() => readDeck('<html>')).toThrow('This file is not JSON, so it is not a Horizon presentation');
    expect(() => readDeck('[1,2]')).toThrow('This file does not say it is a Horizon presentation');
  });
  it('when it does not say format: horizon', () => {
    expect(() => readDeck(JSON.stringify({ version: 1, frames: [] }))).toThrow('This file does not say it is a Horizon presentation');
    expect(() => readDeck(JSON.stringify({ format: 'pptx', version: 1, frames: [] }))).toThrow('This file does not say it is a Horizon presentation');
  });
  it('when it was made with a newer Horizon than this player reads', () => {
    expect(HORIZON_VERSION).toBe(1);
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 2, frames: [{ id: 'a', title: 'A' }] })))
      .toThrow('Made with a newer Horizon (file version 2) · this player reads version 1');
  });
  it('when it has no slides to present', () => {
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: [] }))).toThrow('This presentation has no slides');
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, title: 'x' }))).toThrow('This presentation has no slides');
  });
});

describe('cleaning (Review Focus 6)', () => {
  const deck = readDeck(JSON.stringify(crafted));
  const [a, b] = deck.frames, objects = a.objects!;
  it('drops pictures that are not data: images, on slides and in objects', () => {
    expect(a.image).toBeNull();
    expect(b.image).toBe(PNG);
    expect(objects.find((o) => o.kind === 'picture' && o.id === 'p1')!.image).toBeUndefined();
    expect(objects.find((o) => o.id === 'p2')!.image).toBe(PNG);
  });
  it('keeps a Calc animation\'s name and poster only: its program and data are gone', () => {
    const anim = objects.find((o) => o.kind === 'animation')!;
    expect(anim.animation).toEqual({ name: 'Bar race', poster: PNG });
    expect(JSON.stringify(deck)).not.toContain('postMessage');
  });
  it('keeps media only as data: audio and video, and an avatar\'s still only as a data: image', () => {
    expect(Object.keys(deck.media)).toEqual(['clip1', 'voice1', 'voice2']);
    expect(objects.find((o) => o.kind === 'avatar')!.avatar).toEqual({ name: 'Host', speaks: 'cue', still: PNG, clip: { media: 'clip1', seconds: 4 } });
    expect(deck.media.voice1).toBe(MP3);
  });
  it('keeps a custom drawing as text, to be sanitised whenever it is drawn', () => {
    expect(b.viz).toEqual({ type: 'custom', items: [], svg: HOSTILE_SVG });
  });
  it('keeps only known colours and themes, so nothing can load through a style', () => {
    expect(deck.theme).toEqual({ canvas: 'night', canvasCustom: '#1c2a36', slide: 'custom', slideCustom: '#1c2a36', hue: 150 });
    expect(objects.find((o) => o.id === 's1')).toMatchObject({ fill: 'accent', line: '#ff0000' });
    expect(objects.find((o) => o.id === 's1')!.color).toBeUndefined();
  });
  it('keeps routes only to slides that are there, and a narrative\'s passages with their marks', () => {
    expect(a.next).toEqual(['b']);
    expect(deck.narratives).toEqual([{ id: 'n1', name: 'Short tour', pace: 140, passages: [
      { id: 'p1', part: 'a', text: 'Hello ⟨next⟩ and on.', audio: { key: 'voice1', seconds: 3, marks: [{ kind: 'next', at: 1 }] } },
      { id: 'p2', part: 'b', text: 'The end ⟨cue⟩ now.', audio: { key: 'voice2', seconds: 2.5, marks: [{ kind: 'cue', at: 1 }] } },
    ] }]);
  });
  it('summarises the route and the narration: two slides, told by the voice in 5.5 s', () => {
    expect(deckSummary(deck)).toEqual({ title: 'Crafted', slides: 2, seconds: 5.5 });
  });
  it('tells a narration in its own words when a passage has no voice here, as Horizon does (140 words a minute, 2 s at least)', () => {
    const silent = { ...crafted, media: { clip1: crafted.media.clip1, voice1: MP3 } };
    expect(deckSummary(readDeck(JSON.stringify(silent))).seconds).toBe(4);
  });
});
