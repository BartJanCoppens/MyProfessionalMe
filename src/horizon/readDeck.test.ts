// Reading a .horizon file (studios plan, Task 3.3; Review Focus 6): the Horizon e2e fixture, the reasons a file is refused
// before it is stored, and the cleaning that keeps only what presenting draws, with every link that leaves the file dropped.
import { describe, expect, it } from 'vitest';
import garden from './fixtures/Garden tour.horizon?raw';
import { HORIZON_VERSION, deckProblem, deckSummary, deckText, readDeck } from './readDeck';
import { deckNarration } from './narrationOf';
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
    expect(deck.theme).toEqual({ canvas: 'night', canvasCustom: '#1c2a36', slide: 'custom', slideCustom: '#1c2a36', hue: 150, world: 'globe' });
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

const deckOf = (frame: object, top: object = {}) => JSON.stringify({ format: 'horizon', version: 1, title: 'T', frames: [{ id: 'a', x: 0, y: 0, next: [], title: 'A', body: '', viz: null, ...frame }], ...top });
const told = (key: string) => ({ narratives: { items: [{ id: 'n', name: 'n', passages: [{ id: 'p', part: 'a', text: 'Hello there', audio: { key, seconds: 3, marks: [] } }] }] }, media: {} });

describe('keys that are on every object are not data (Review Focus 6)', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('a voice keyed %s that is not in the file\'s media is not found, so the narration is in its own words', (key) => {
    const deck = readDeck(deckOf({}, told(key)));
    expect(deck.media[key]).toBeUndefined();
    const n = deckNarration(deck)!;
    expect(n.way).toBe('own');
    expect(n.steps.every((s) => !s.audio)).toBe(true);
  });
  it('a voice that is in the media under such a key is data like any other', () => {
    const raw = JSON.parse(deckOf({}, told('constructor')));
    raw.media = { constructor: MP3 };
    expect(deckNarration(readDeck(JSON.stringify(raw)))!.way).toBe('voice');
  });
  it.each(['constructor', '__proto__', 'toString'])('a slide theme or colour named %s falls back to the defaults', (name) => {
    const deck = readDeck(deckOf({ theme: name, objects: [{ id: 's', kind: 'shape', x: 0, y: 0, w: 1, h: 1, fill: name }] }, { theme: { slide: name } }));
    expect(deck.theme.slide).toBe('nocturne');
    expect(deck.frames[0].theme).toBeUndefined();
    expect(deck.frames[0].objects![0].fill).toBeUndefined();
  });
});

describe('the client-name scan sees everything the slides show', () => {
  it('walks case, chart, picture, animation, avatar, drawing and slide texts, and the narration', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>SVGWORD</text></svg>';
    const deck = readDeck(deckOf({ imageAlt: 'IMGALT', image: PNG, viz: { type: 'custom', items: [], center: 'CENTERWORD', svg }, objects: [
      { id: 'c', kind: 'case', x: 0, y: 0, w: 10, h: 10, case: { title: 'CASEWORD', shot: { label: 'LABELWORD', facts: ['FACTWORD'], notes: ['NOTEWORD'], answers: [{ text: 'ANSWORD' }] } } },
      { id: 'ch', kind: 'chart', x: 0, y: 0, w: 10, h: 10, viz: { type: 'trend', items: [{ label: 'CHARTLABEL', value: 1, note: 'CHARTNOTE' }], series: ['S1', 'SERIESWORD'], suffix: 'SUFFIXWORD' } },
      { id: 'p', kind: 'picture', x: 0, y: 0, w: 10, h: 10, image: PNG, alt: 'ALTWORD' },
      { id: 'an', kind: 'animation', x: 0, y: 0, w: 10, h: 10, animation: { name: 'ANIMWORD', poster: PNG } },
      { id: 'av', kind: 'avatar', x: 0, y: 0, w: 10, h: 10, avatar: { look: { name: 'AVATARWORD' }, speaks: 'arrival' } },
    ] }, told('k')));
    const t = deckText(deck);
    for (const w of ['IMGALT', 'CENTERWORD', 'SVGWORD', 'CASEWORD', 'LABELWORD', 'FACTWORD', 'NOTEWORD', 'ANSWORD', 'CHARTLABEL', 'CHARTNOTE', 'SERIESWORD', 'SUFFIXWORD', 'ALTWORD', 'ANIMWORD', 'AVATARWORD', 'Hello there']) expect(t, w).toContain(w);
  });
  it('does not read ids, data: addresses or media keys as words', () => {
    const t = deckText(readDeck(deckOf({ id: 'slide-ID', image: PNG }, { media: { 'KEYWORD': MP3 } })));
    expect(t).not.toContain('slide-ID');
    expect(t).not.toContain('KEYWORD');
    expect(t).not.toContain('base64');
  });
});

describe('limits (a file that is too deep or too big is refused with a reason)', () => {
  const nest = (depth: number): object => depth === 0 ? { id: 'leaf', title: 'x' } : { id: 's' + depth, title: 'x', section: { frames: [nest(depth - 1)] } };
  it('allows sections three deep', () => { expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: [nest(3)] }))).not.toThrow(); });
  it('refuses sections four deep, and 20000 deep, in words (no stack overflow)', () => {
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: [nest(4)] }))).toThrow('Sections inside sections go at most 3 deep');
    let s = '{"id":"z","title":"x"}';
    for (let i = 0; i < 20000; i++) s = '{"id":"s' + i + '","title":"x","section":{"frames":[' + s + ']}}';
    expect(() => readDeck('{"format":"horizon","version":1,"frames":[' + s + ']}')).toThrow(/at most 3 deep|not JSON/);
  });
  it('refuses more than 1000 slides in all, and more than 100 objects on a slide', () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: 'f' + i, title: 'x' }));
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: many }))).toThrow('at most 1000 slides');
    const objects = Array.from({ length: 101 }, (_, i) => ({ id: 'o' + i, kind: 'text', x: 0, y: 0, w: 1, h: 1, text: 'x' }));
    expect(() => readDeck(deckOf({ title: 'Crowded', objects }))).toThrow('“Crowded” has more than 100 objects');
  });
  it('refuses two slides with the same id, in different sections too', () => {
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: [{ id: 'a', title: 'x' }, { id: 'a', title: 'y' }] }))).toThrow('Two slides share the id “a”');
    expect(() => readDeck(JSON.stringify({ format: 'horizon', version: 1, frames: [{ id: 'a', title: 'x', section: { frames: [{ id: 'a', title: 'y' }] } }] }))).toThrow('Two slides share the id “a”');
  });
});

describe('what only Horizon runs is said, not silently dropped', () => {
  it('keeps a conversation avatar as a placeholder and marks 3D worlds and the fallback stage as flat', () => {
    const deck = readDeck(deckOf({ layout: 'fallback', objects: [{ id: 'av', kind: 'avatar', x: 0, y: 0, w: 10, h: 10, avatar: { mode: 'live', look: { name: 'Guide' }, speaks: 'arrival' } }] }, { theme: { world: 'globe' } }));
    expect(deck.frames[0].objects![0].avatar).toEqual({ name: 'Guide', speaks: 'arrival', live: true });
    expect(deck.flat).toBe(true);
    expect(readDeck(deckOf({})).flat).toBe(false);
    expect(readDeck(deckOf({}, { theme: { world: 'surface' } })).flat).toBe(false);
  });
});
