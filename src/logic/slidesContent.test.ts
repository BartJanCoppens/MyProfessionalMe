// The Slides format (studios plan, Task 3.4) as content: its slide rows and the voice-over after them in the items, what
// they publish as (studioContent = private.slides_content), what still blocks sending, its hours and completion, and the
// SQL that repeats these rules kept in step with the TypeScript.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { latestMatch } from '../test/migrations';
import { STUDIOS } from '../studioData';
import { mediaHours } from './horizonItem';
import { aiAssisted, itemRows, itemsFromSaved, itemsText, ITEM_MAX } from './items';
import { COMPLETION, completionTodo } from './record';
import { AI_VOICE, CAPTIONS, PRESENTER, SLIDES_MAX_SECONDS, bulletsOf, hasWords, slidesLine, slidesProblems, slidesSeconds, wantsVoice } from './slidesContent';
import { studioContent } from './studioContent';
import { itemsValid, questionsOf, stepsOf, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';
import { CLIPS_MAX, CLIP_MARKS_MAX, CLIP_SECONDS_MAX, isVoiceItem } from './voiceItem';
import type { Clip, VoiceItem } from './voiceItem';

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const def = studioById('slides')!;
// 14 words with the marks: ⟨next⟩ and ⟨cue⟩ are not spoken.
const TALK = 'A steering committee exists to take decisions ⟨next⟩ not to receive updates ⟨cue⟩ every single week.';
const ROWS: StudioItem[] = [['Why it matters ', 'Decisions · Not status updates', TALK], ['Before', 'Send the pack ahead', 'Send the pack three working days ahead.'], ['After', 'Minutes · Decision log', 'Minutes go out within a day.']];
const clip = (slide: number, text: string, seconds = 6, voice = 'EL1'): Clip => ({ slide, text, voice, path: FOLDER + 'voice-' + slide + '.mp3', seconds, marks: [{ kind: 'next', at: 2.5 }] });
const VOICE = (rows = ROWS): VoiceItem => ({ kind: 'voice', clips: rows.map((r, k) => clip(k, r[2] ?? '', 5 + k)) });
const WITH_VOICE = { [PRESENTER]: AI_VOICE };

describe('a voice-over item', () => {
  it('holds a clip per voiced slide: the slide, the words it was made from, the stored mp3, its length and its marks', () => {
    expect(isVoiceItem(VOICE())).toBe(true);
    expect(isVoiceItem({ kind: 'voice', clips: [clip(0, 'x')] })).toBe(true);
  });
  it.each([
    ['another kind', { kind: 'motion' }], ['no clips', { clips: [] }], ['an extra key', { made: 'voice' }],
    ['a slide twice', { clips: [clip(0, 'a'), clip(0, 'b')] }], ['a negative slide', { clips: [clip(-1, 'a')] }], ['a slide past the last place', { clips: [clip(CLIPS_MAX, 'a')] }],
    ['a blank text', { clips: [clip(0, '  ')] }], ['a path that is not an mp3', { clips: [{ ...clip(0, 'a'), path: FOLDER + 'a.m4a' }] }], ['a path outside the folder shape', { clips: [{ ...clip(0, 'a'), path: '../a.mp3' }] }],
    ['no seconds', { clips: [clip(0, 'a', 0)] }], ['too many seconds', { clips: [clip(0, 'a', CLIP_SECONDS_MAX + 1)] }],
    ['a mark of another kind', { clips: [{ ...clip(0, 'a'), marks: [{ kind: 'x', at: 1 }] }] }], ['a mark past the longest clip', { clips: [{ ...clip(0, 'a'), marks: [{ kind: 'cue', at: CLIP_SECONDS_MAX + 1 }] }] }],
    ['too many marks', { clips: [{ ...clip(0, 'a'), marks: Array.from({ length: CLIP_MARKS_MAX + 1 }, () => ({ kind: 'cue', at: 1 })) }] }],
    ['an extra key on a clip', { clips: [{ ...clip(0, 'a'), made: 'x' }] }], ['no voice on a clip', { clips: [{ ...clip(0, 'a'), voice: undefined }] }], ['a voice id with a space', { clips: [{ ...clip(0, 'a'), voice: 'a b' }] }],
  ])('refuses %s', (_, patch) => { expect(isVoiceItem({ ...VOICE(), ...patch })).toBe(false); });
  it('repeats private.voice_ok\'s limits', () => {
    expect(CLIPS_MAX).toBe(ITEM_MAX.Podcast - 1); // the most parts of any piece: a script's turns
    const body = latestMatch(/create (?:or replace )?function private\.voice_ok\([\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
    expect(body).toContain('<= ' + CLIP_SECONDS_MAX);
    expect(body).toContain('<= ' + CLIP_MARKS_MAX);
    expect(body).toContain("right(c ->> 'path', 4) = '.mp3'");
    expect(body).toContain('{1,64}$'); // VOICE_ID in supabase/functions/_shared/voiceRules.ts
    expect(body).toContain('between 0 and ' + (CLIPS_MAX - 1));
  });
});

describe('the slides of a Slides piece', () => {
  it('are the rows: a title, the bullets between middle dots, and the talk-over; the voice item is not a row or a question', () => {
    expect(bulletsOf(' Decisions · Not status updates ·· ')).toEqual(['Decisions', 'Not status updates']);
    const list: StudioEntry[] = [...ROWS, VOICE()];
    expect(stepsOf(list)).toEqual(ROWS);
    expect(questionsOf(list)).toEqual([]);
    expect(itemsValid(def, list)).toEqual([]);
  });
  it('need a title, a bullet and a talk-over on every slide, at least 3 slides, and at most one fewer than the cap', () => {
    expect(itemsValid(def, [ROWS[0], ROWS[1], ['After', '·', 'x']])).toEqual(['After: add at least one bullet']);
    expect(itemsValid(def, [ROWS[0], ROWS[1], ['After', 'Minutes', '']])).toEqual(['After: add the talk-over (marks are not spoken words)']);
    expect(itemsValid(def, ROWS.slice(0, 2))).toContain('Add at least 3 items');
    const many = Array.from({ length: ITEM_MAX.Slides }, (_, k): StudioItem => ['S' + k, 'b', 'say it']);
    expect(itemsValid(def, many)).toContain('Keep at most ' + (ITEM_MAX.Slides - 1) + ' slides: the voice-over takes the last place');
  });
  it('are read back with their voice-over, and a stray object of another kind is left out', () => {
    expect(itemsFromSaved('Slides', [...ROWS, VOICE()])).toEqual([...ROWS, VOICE()]);
    expect(itemsFromSaved('Slides', [...ROWS, { kind: 'x' }])).toEqual([]);
  });
  it('show reviewers a row each and one line for the voice-over, and scan the spoken words for client names', () => {
    expect(itemRows('Slides', [...ROWS, VOICE()]).at(-1)).toEqual({ front: 'Voice-over · AI voice', back: '3 slides voiced · 18 s' });
    expect(itemsText([...ROWS, VOICE()])).toContain(ROWS[2][2]);
  });
  it('count as AI-assisted when the rows were drafted by AI (provenance is the items\' how)', () => {
    expect(aiAssisted({ ai: false, items: { list: [...ROWS], how: 'ai', note: '', problems: [] } })).toBe(true);
  });
});

describe('studioContent for Slides', () => {
  it('without a voice publishes the slides at a reading pace, as private.slides_content does', () => {
    const c = studioContent('Slides', ROWS, {});
    expect(c).toEqual({ kind: 'slides', template: 'Firm template', transitions: 'Calm', made: 'scripted', seconds: 12,
      slides: [{ title: 'Why it matters', bullets: ['Decisions', 'Not status updates'], narration: TALK },
        { title: 'Before', bullets: ['Send the pack ahead'], narration: 'Send the pack three working days ahead.' },
        { title: 'After', bullets: ['Minutes', 'Decision log'], narration: 'Minutes go out within a day.' }] });
    expect(parseFormatContent(c)).toEqual(c);
    expect(wantsVoice({})).toBe(false);
  });
  it('with "AI voice" and a clip for every slide, takes each slide\'s audio and the total from the stored seconds', () => {
    const c = studioContent('Slides', [...ROWS, VOICE()], WITH_VOICE);
    expect(c).toMatchObject({ made: 'ai', seconds: 18, slides: [{ audio: { path: FOLDER + 'voice-0.mp3', seconds: 5, marks: [{ kind: 'next', at: 2.5 }] } }, { audio: { seconds: 6 } }, { audio: { seconds: 7 } }] });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('has no content while a slide has no clip made from its present talk-over (a clip for other words does not count)', () => {
    const stale = VOICE(); stale.clips[1] = clip(1, 'Words that were changed since.');
    expect(studioContent('Slides', [...ROWS, VOICE()].slice(0, 3), WITH_VOICE)).toBeNull();
    expect(studioContent('Slides', [...ROWS, stale], WITH_VOICE)).toBeNull();
  });
  it('has no content while the clips are in more than one voice, and a talk-over of marks only is not a talk-over', () => {
    const mixed = VOICE(); mixed.clips[1] = clip(1, ROWS[1][2] ?? '', 6, 'EL2');
    expect(studioContent('Slides', [...ROWS, mixed], WITH_VOICE)).toBeNull();
    expect(itemsValid(def, [ROWS[0], ROWS[1], ['After', 'Minutes', '⟨next⟩ ⟨cue⟩']])).toEqual(['After: add the talk-over (marks are not spoken words)']);
    expect(hasWords('⟨cue⟩')).toBe(false);
  });
  it('ignores the clips when the studio is not told to use the AI voice (captions only)', () => {
    expect(studioContent('Slides', [...ROWS, VOICE()], { [PRESENTER]: CAPTIONS })).toMatchObject({ made: 'scripted', seconds: 12 });
    expect(studioContent('Slides', [...ROWS, VOICE()], {})!).not.toHaveProperty('slides.0.audio');
  });
  it('carries the template and the transitions that were chosen; an unknown answer reads as the default', () => {
    expect(studioContent('Slides', ROWS, { Template: 'Minimal', Transitions: 'Slide in' })).toMatchObject({ template: 'Minimal', transitions: 'Slide in' });
    expect(studioContent('Slides', ROWS, { Template: 'Neon', Transitions: 'Spin' })).toMatchObject({ template: 'Firm template', transitions: 'Calm' });
  });
  it('is read back strictly: slides need a title, bullets and words, audio a media path, the length at most 15 minutes', () => {
    const c = studioContent('Slides', ROWS, {})!;
    expect(parseFormatContent({ ...c, slides: [] })).toBeNull();
    expect(parseFormatContent({ ...c, seconds: SLIDES_MAX_SECONDS + 1 })).toBeNull();
    expect(parseFormatContent({ ...c, template: 5 })).toBeNull();
    expect(parseFormatContent({ ...c, slides: [{ title: 'x', bullets: [], narration: 'y' }] })).toBeNull();
    expect(parseFormatContent({ ...c, slides: [{ title: 'x', bullets: ['b'], narration: 'y', audio: { path: 'https://x.test/a.mp3', seconds: 3, marks: [] } }] })).toBeNull();
  });
});

describe('what blocks sending Slides', () => {
  it('with AI voice every slide must be voiced; the reason says whether the voice can be used now', () => {
    expect(slidesProblems(ROWS, WITH_VOICE, true)).toEqual(['Voice every slide in Produce, or choose Captions only in Shape it']);
    expect(slidesProblems(ROWS, WITH_VOICE, false)).toEqual(['The AI voice is not switched on, so this cannot be sent with AI voice: choose Captions only in Shape it (the browser voice only previews the talk-over)']);
    expect(slidesProblems([...ROWS, VOICE()], WITH_VOICE, true)).toEqual([]);
    expect(slidesProblems(ROWS, {}, false)).toEqual([]);
  });
  it('a talk over 15 minutes is refused, in words', () => {
    const long: StudioItem[] = Array.from({ length: 3 }, (_, k) => ['S' + k, 'b', 'word '.repeat(900)]);
    expect(slidesSeconds(long, {})).toBeGreaterThan(SLIDES_MAX_SECONDS);
    expect(slidesProblems(long, {}, true)).toEqual(['The talk runs ' + Math.ceil(slidesSeconds(long, {}) / 60) + ' min, over the 15 min limit: shorten the talk-over or cut slides']);
  });
});

describe('hours and completion', () => {
  it('the hours come from the total seconds through the one hours helper (0.05 h steps, at least 0.05, at most 1)', () => {
    expect([mediaHours(14), mediaHours(181), mediaHours(900)]).toEqual([0.05, 0.1, 0.25]);
    expect(slidesLine({ slides: [{}, {}, {}], seconds: 14 })).toBe('3 slides · 14 s · counts 0.05 h');
  });
  it('completes itself when the last slide has finished (media)', () => {
    expect(COMPLETION.Slides).toBe('media');
    expect(completionTodo('Slides')).toBe('play every slide through');
  });
  it('is a studio with its own questions: who presents, the length, the template and the transitions; nothing that does nothing', () => {
    const qs = def.qs.map((q) => q[0]);
    expect(qs).toEqual(['Who presents?', 'Length?', 'Template', 'Transitions']);
    expect(def.qs[0][1]).toEqual([AI_VOICE, CAPTIONS]);
    expect(def.rows).toEqual([]);
    expect(STUDIOS.find((s) => s.id === 'slides')!.available).toBe(true);
  });
});

describe('the SQL repeats these rules', () => {
  const fn = (name: string) => latestMatch(new RegExp('create (?:or replace )?function private\\.' + name + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$'))[1];
  it('the pace, the 15-minute cap and the template and transition defaults', () => {
    expect(fn('own_seconds')).toContain('/ 140');
    expect(fn('slides_ok')).toContain('spoken_words(e ->> 2), 0) < 1');
    expect(fn('slides_seconds')).toContain('round(');
    expect(fn('slides_content')).toContain("'Minimal'");
    expect(fn('slides_content')).toContain("'Slide in'");
    expect(latestMatch(/slides_seconds\([^)]*\) > (\d+)/)[1]).toBe(String(SLIDES_MAX_SECONDS));
  });
  it('Slides complete themselves and count their hours from the content\'s seconds through media_hours', () => {
    expect(latestMatch(/format in \(([^)]*'Slides'[^)]*)\)/)[1]).toContain("'Slides'");
    expect(latestMatch(/when 'Slides' then private\.media_hours\(\(v_content ->> 'seconds'\)::numeric\)/)[0]).toBeTruthy();
  });
});
