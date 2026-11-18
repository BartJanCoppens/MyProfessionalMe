// The Reel format (studios plan, Task 5.5) as content: its rows (Hook, Scene N, Close, then the Check), the voice-over and the cut after
// them, the reel's clock (clips or words at 140 a minute, 0.3 s between scenes), the 90 s cap, what the rows publish as (reelContent =
// private.reel_content; the fixture is the RL case in supabase/tests/rls.sql), what a stale cut is, and the SQL that repeats these rules.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { migrationText } from '../test/migrations';
import { STUDIOS } from '../studioData';
import { AI_ONLY, studioContent } from './studioContent';
import { ITEM_MAX } from './items';
import { itemsValid, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';
import { CARDS_VOICE, CHECK_OPTIONS, NO_VOICE, PORTRAIT_VOICE, REEL_SECONDS_MAX, SCENE_GAP, TEXT_ONLY, VOICE_ALL, cutMade, reelContent, reelProblems, reelSeconds, reelTimeline, sceneRows, videoCurrent, wantsVoice } from './reelContent';
import { FORMATS, CAPTION_MODES, MUSICS, SIZE_OF, isVideoItem } from './videoItem';
import type { VideoItem } from './videoItem';
import { PRESENTER } from './slidesContent';
import type { StockLook } from './stockLooks';
import { withClips } from './voiceItem';
import type { Clip } from './voiceItem';
import { MEDIA_MAX_BYTES } from './mediaFiles';

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const def = studioById('reel')!;
const CHECK: StudioItem = ['Check', 'What should you do when you spot one?', 'Raise it this week · Wait for the next review · Ignore it'];
const SCENES: StudioItem[] = [['Hook', 'Your project is drifting. Here are three signs.', 'three signs'], ['Scene 1', 'Can you just also turns up in every steering committee.', 'Just also x3'],
  ['Scene 2', 'Hours are booked on tasks that are not in the statement of work.', 'A timesheet'], ['Scene 3', 'Deliverables keep getting one more round.', 'v7_final_FINAL'], ['Close', 'Spot one? Raise it with your engagement manager this week.', 'Talk to your EM']];
const ROWS: StudioItem[] = [...SCENES, CHECK];
const SECONDS = [4, 5, 6, 5.5, 3.5];
const LOOK: StockLook = { id: '11111111-1111-4111-8111-111111111111', name: 'HR director · 50s', portrait: 'p1', color: '#8a5a8c', licence: 'Drawn in code', active: true };
const clip = (k: number, seconds = SECONDS[k], words: number[] | null = [0, 0.5]): Clip => ({ slide: k, text: SCENES[k][1], voice: 'EL1', path: FOLDER + 'voice-' + (k + 1) + '.mp3', seconds, marks: [], ...(words && { words }) });
const VOICED = (): StudioEntry[] => withClips(ROWS, SCENES.map((_, k) => clip(k))) as StudioEntry[];
const PATHS = SCENES.map((_, k) => FOLDER + 'voice-' + (k + 1) + '.mp3');
const VOICE_SHAPE = { [PRESENTER]: CARDS_VOICE }, PORTRAIT_SHAPE = { [PRESENTER]: PORTRAIT_VOICE };
const video = (over: Partial<VideoItem> = {}, made: Partial<VideoItem['made']> = {}): VideoItem => ({ kind: 'video', path: FOLDER + 'reel-0123456789abcdef.mp4', seconds: 25.2, size: '720x1280', mime: 'video/mp4',
  made: { rows: ROWS as string[][], clips: PATHS, look: null, format: '9:16 vertical', captions: 'Burned in', music: 'Calm', ...made }, ...over });
const CUT = (over: Partial<VideoItem> = {}, made: Partial<VideoItem['made']> = {}): StudioEntry[] => [...VOICED(), video(over, made)] as StudioEntry[];
const on = { voiceOn: true, looks: [LOOK] };

describe('the rows of a Reel', () => {
  it('are a Hook, scenes and a Close, then the Check: the design example plus a Check row is 5 scenes and is valid', () => {
    expect(sceneRows(ROWS)).toHaveLength(5);
    expect(itemsValid(def, ROWS)).toEqual([]);
    expect(itemsValid(def, [...VOICED(), video()])).toEqual([]);
  });
  it.each([
    ['no Hook first', [['Scene 1', 'a', 'b'], ['Scene 2', 'c', 'd'], ['Close', 'e', 'f'], CHECK], 'Start with a Hook row'],
    ['no Close', [SCENES[0], SCENES[1], SCENES[2], CHECK], 'Add a Close row after the scenes'],
    ['scenes out of order', [SCENES[0], ['Scene 2', 'a', 'b'], SCENES[4], CHECK], 'Number the scenes Scene 1, Scene 2 and so on, in order'],
    ['two scenes', [SCENES[0], SCENES[4], CHECK], 'Use 3 to 7 scenes: a Hook, a Close and up to 5 Scene rows in between'],
    ['no on-screen text', [SCENES[0], ['Scene 1', 'a'], SCENES[4], CHECK], 'Scene 1: add on-screen text'],
    ['no check', SCENES, 'Add the check question: one question, the right answer first'],
    ['one option', [...SCENES, ['Check', 'What now?', 'Act']], 'The check needs 2 to 4 options, the right one first'],
    ['five options', [...SCENES, ['Check', 'What now?', '1 · 2 · 3 · 4 · 5']], 'The check needs 2 to 4 options, the right one first'],
    ['an empty option', [...SCENES, ['Check', 'What now?', 'a ·  · b']], 'The check needs 2 to 4 options, the right one first'],
    ['the check not last', [SCENES[0], CHECK, SCENES[1], SCENES[2], SCENES[4]], 'Put the check question last'],
    ['two checks', [...ROWS, CHECK], 'Use one check question only'],
  ] as [string, StudioItem[], string][])('refuse %s', (_n, rows, text) => {
    expect(itemsValid(def, rows)).toContain(text);
  });
  it('allow at most 8 rows, as the voice-over and the cut take the last two places of 10', () => {
    expect(ITEM_MAX.Reel).toBe(10);
    const nine: StudioItem[] = [['Hook', 'a', 'b'], ...[1, 2, 3, 4, 5, 6].map((k): StudioItem => ['Scene ' + k, 'a', 'b']), ['Close', 'a', 'b'], CHECK];
    expect(itemsValid(def, nine)).toContain('Keep at most 8 rows: the voice-over and the final cut take the last two places');
  });
});

describe('the reel\'s clock', () => {
  it('with a clip for every scene starts each scene 0.3 s after the last: 4.0, 5.0, 6.0, 5.5 and 3.5 s give 0, 4.3, 9.6, 15.9 and 21.7, 25.2 s in all', () => {
    expect(SCENE_GAP).toBe(0.3);
    expect(reelTimeline(VOICED(), VOICE_SHAPE)).toEqual([{ start: 0, seconds: 4 }, { start: 4.3, seconds: 5 }, { start: 9.6, seconds: 6 }, { start: 15.9, seconds: 5.5 }, { start: 21.7, seconds: 3.5 }]);
    expect(reelSeconds(VOICED(), VOICE_SHAPE)).toBe(25.2);
  });
  it('is null while a voiced scene has no clip made from its present words (the voice step has not run, or a row changed)', () => {
    expect(reelTimeline(ROWS, VOICE_SHAPE)).toBeNull();
    const stale = withClips(ROWS, [clip(0), { ...clip(1), text: 'Words that were changed since.' }, clip(2), clip(3), clip(4)]) as StudioEntry[];
    expect(reelTimeline(stale, VOICE_SHAPE)).toBeNull();
    expect(reelSeconds(ROWS, VOICE_SHAPE)).toBeNull();
  });
  it('with text only lasts each scene its words at 140 a minute, at least 2 s: a 14-word scene is 6 s', () => {
    const fourteen = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const rows: StudioItem[] = [['Hook', fourteen, 'a'], ['Scene 1', 'Hi', 'b'], ['Close', fourteen, 'c'], CHECK];
    expect(reelTimeline(rows, { [PRESENTER]: TEXT_ONLY })!.map((s) => s.seconds)).toEqual([6, 2, 6]);
    expect(reelTimeline(rows, {})!.map((s) => s.start)).toEqual([0, 6.3, 8.6]);
  });
  it('rounds to the millisecond, so the TypeScript and SQL clocks agree', () => {
    expect(reelSeconds(ROWS, {})).toBe(21.343);
  });
});

describe('what still blocks a reel', () => {
  it('reports a voice chosen but not on every scene, with the reason when the AI voice is not on', () => {
    expect(reelProblems(ROWS, VOICE_SHAPE, on)).toEqual([VOICE_ALL]);
    expect(reelProblems(ROWS, VOICE_SHAPE, { ...on, voiceOn: false })).toEqual([NO_VOICE]);
    expect(reelProblems(ROWS, { [PRESENTER]: TEXT_ONLY }, on)).toEqual([]);
    expect(reelProblems(VOICED(), VOICE_SHAPE, on)).toEqual([]);
  });
  it('reports a clip without word timing with its scene (it has to be voiced again)', () => {
    const old = withClips(ROWS, [clip(0), clip(1, 5, null), clip(2), clip(3), clip(4)]) as StudioEntry[];
    expect(reelProblems(old, VOICE_SHAPE, on)).toEqual(['Voice scene 2 again · its word timing is missing']);
  });
  it('reports a reel over 90 s with its length, rounded up', () => {
    expect(REEL_SECONDS_MAX).toBe(90);
    const long = withClips(ROWS, SCENES.map((_, k) => clip(k, 18.12))) as StudioEntry[];
    expect(reelProblems(long, VOICE_SHAPE, on)).toEqual(['The reel runs 92 s · at most 90 s']);
  });
  it('wants the cut only when asked (the build step 1 runs without it): no cut, a stale cut, another length, a look that is off', () => {
    const cut = { ...on, cut: true };
    expect(reelProblems(VOICED(), VOICE_SHAPE, on)).toEqual([]);
    expect(reelProblems(VOICED(), VOICE_SHAPE, cut)).toEqual(['Make the final cut in Produce']);
    expect(reelProblems(CUT(), VOICE_SHAPE, cut)).toEqual([]);
    expect(reelProblems(CUT({}, { rows: [...ROWS.slice(0, 1), ['Scene 1', 'x', 'y'], ...ROWS.slice(2)] as string[][] }), VOICE_SHAPE, cut)).toEqual(['You changed the reel after the final cut · make the final cut again']);
    expect(reelProblems(CUT({ seconds: 30 }), VOICE_SHAPE, cut)).toEqual(['The video\'s length does not match the voice-over · make the final cut again']);
    expect(reelProblems(CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, cut)).toEqual([]);
    expect(reelProblems(CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, { ...cut, looks: [{ ...LOOK, active: false }] })).toEqual(['That look is not on the stock list']);
    expect(reelProblems(CUT(), PORTRAIT_SHAPE, cut)).toEqual(['That look is not on the stock list']);
  });
});

describe('the final cut\'s item', () => {
  it('is current while the rows and the voice clips are the ones it was made from', () => {
    expect(videoCurrent(CUT(), VOICE_SHAPE)).toBe(true);
    expect(videoCurrent(VOICED(), VOICE_SHAPE)).toBe(false);
  });
  it('is stale after an edited row (the title, the on-screen text or the check) or other clips', () => {
    const edited = CUT().map((x) => (Array.isArray(x) && x[0] === 'Scene 1' ? ['Scene 1', x[1], 'Changed on-screen text'] : x)) as StudioEntry[];
    expect(videoCurrent(edited, VOICE_SHAPE)).toBe(false);
    expect(videoCurrent(CUT({}, { clips: PATHS.map((p) => p.replace('voice-', 'other-')) }), VOICE_SHAPE)).toBe(false);
  });
  it('with text only is current without clips and stale with the old voice still in it', () => {
    const text = { [PRESENTER]: TEXT_ONLY };
    expect(videoCurrent([...ROWS, video({}, { clips: [] })] as StudioEntry[], text)).toBe(true);
    expect(videoCurrent(CUT(), text)).toBe(false);
  });
  it('is made from the rows, the clips, the look (a portrait presenter only), the format, the captions and the music chosen in Produce', () => {
    expect(cutMade(VOICED(), PORTRAIT_SHAPE, { Format: '1:1 square', Captions: 'Separate file', Music: 'Upbeat' }, { Look: LOOK.id })).toEqual({ rows: ROWS, clips: PATHS, look: LOOK.id, format: '1:1 square', captions: 'Separate file', music: 'Upbeat' });
    expect(cutMade(VOICED(), VOICE_SHAPE, {}, { Look: LOOK.id })).toEqual({ rows: ROWS, clips: PATHS, look: null, format: '9:16 vertical', captions: 'Burned in', music: 'None' });
    expect(cutMade(ROWS as StudioEntry[], { [PRESENTER]: TEXT_ONLY }, {}, {}).clips).toEqual([]);
  });
  const ok = (v: unknown) => isVideoItem(v);
  it('is read strictly: exact keys, an mp4 or webm whose extension is its type, at most 90 s, one of the two sizes, a made that says what it is', () => {
    expect(ok(video())).toBe(true);
    expect(ok(video({ path: FOLDER + 'reel-0123456789abcdef.webm', mime: 'video/webm' }))).toBe(true);
    expect(ok({ ...video(), extra: 1 })).toBe(false);
    expect(ok(video({ mime: 'video/webm' }))).toBe(false);
    expect(ok(video({ path: 'x/reel.mp4' }))).toBe(false);
    expect(ok(video({ seconds: 91 }))).toBe(false);
    expect(ok(video({ seconds: 0 }))).toBe(false);
    expect(ok(video({ size: '1080x1080' }))).toBe(false); // the format says vertical
    expect(ok(video({}, { format: '16:9' as never }))).toBe(false);
    expect(ok(video({}, { captions: 'Both' as never }))).toBe(false);
    expect(ok(video({}, { music: 'Loud' as never }))).toBe(false);
    expect(ok(video({}, { look: 'HR director' }))).toBe(false);
    expect(ok(video({}, { clips: [FOLDER + 'a.m4a'] }))).toBe(false);
    expect(ok(video({}, { rows: ['a'] as never }))).toBe(false);
    expect(ok({ ...video(), made: { ...video().made, x: 1 } })).toBe(false);
  });
});

describe('what a reel publishes as', () => {
  const expected = (over: Record<string, unknown> = {}) => ({ kind: 'reel', size: '720x1280', seconds: 25.2, made: 'ai', burned: true, music: 'Calm', video: { path: FOLDER + 'reel-0123456789abcdef.mp4', mime: 'video/mp4' },
    look: { id: LOOK.id, name: LOOK.name, portrait: 'p1', color: '#8a5a8c' }, check: { q: 'What should you do when you spot one?', opts: ['Raise it this week', 'Wait for the next review', 'Ignore it'], a: 0 },
    scenes: SCENES.map((s, k) => ({ label: s[0], text: s[1], onScreen: s[2], start: [0, 4.3, 9.6, 15.9, 21.7][k], seconds: SECONDS[k], words: [0, 0.5] })), ...over });
  it('is reel content, as the RL case checks private.reel_content: the scenes on the voice clock, the cut, the look joined, the check with the right option first', () => {
    const c = reelContent(CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, [LOOK]);
    expect(c).toEqual(expected());
    expect(studioContent('Reel', CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, { looks: [LOOK] })).toEqual(c);
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('without a portrait presenter has no look, and with cards over text it is still AI made', () => {
    expect(reelContent(CUT({}, { look: LOOK.id }), VOICE_SHAPE, [LOOK])).toEqual(expected({ look: null }));
  });
  it('a text and music only reel is scripted, with no words and no look, its scenes on the reading pace', () => {
    const c = reelContent([...ROWS, video({ seconds: 21.3 }, { clips: [], music: 'None', captions: 'Separate file' })] as StudioEntry[], { [PRESENTER]: TEXT_ONLY }, [LOOK]);
    expect(c).toMatchObject({ made: 'scripted', look: null, burned: false, music: 'None', seconds: 21.343 });
    expect(c!.scenes.every((s) => s.words === null)).toBe(true);
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('has no look when it is not on the active stock list, and no content without a cut, a check or a voice on every scene', () => {
    expect(reelContent(CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, [{ ...LOOK, active: false }])!.look).toBeNull();
    expect(reelContent(VOICED(), VOICE_SHAPE, [])).toBeNull();
    expect(reelContent([...SCENES, video()] as StudioEntry[], { [PRESENTER]: TEXT_ONLY }, [])).toBeNull();
    expect(reelContent([...ROWS, video()] as StudioEntry[], VOICE_SHAPE, [])).toBeNull();
  });
  it('previews a reel that is not cut yet from the Produce answers: no video, the look and the sizes chosen', () => {
    const c = reelContent(VOICED(), PORTRAIT_SHAPE, [LOOK], { produce: { Format: '1:1 square', Captions: 'Separate file', Music: 'Upbeat' }, cast: { Look: LOOK.id } });
    expect(c).toMatchObject({ video: null, size: '1080x1080', burned: false, music: 'Upbeat', look: { id: LOOK.id }, seconds: 25.2 });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('is read back strictly', () => {
    const c = reelContent(CUT({}, { look: LOOK.id }), PORTRAIT_SHAPE, [LOOK])!;
    expect(parseFormatContent({ ...c, scenes: [] })).toBeNull();
    expect(parseFormatContent({ ...c, seconds: 91 })).toBeNull();
    expect(parseFormatContent({ ...c, check: { q: 'x', opts: ['a'], a: 0 } })).toBeNull();
    expect(parseFormatContent({ ...c, check: { ...c.check, a: 3 } })).toBeNull();
    expect(parseFormatContent({ ...c, video: { path: 'x', mime: 'video/mp4' } })).toBeNull();
    expect(parseFormatContent({ ...c, size: '10x10' })).toBeNull();
    expect(parseFormatContent({ ...c, made: 'human' })).toBeNull();
    expect(parseFormatContent({ ...c, look: { id: 'x', name: 'y', portrait: 'p9', color: '#000000' } })).toBeNull();
  });
  it('carries no takeaway of its own: the reel panel shows the one the learning holds (unchanged)', () => {
    expect(reelContent(CUT(), VOICE_SHAPE, [])).not.toHaveProperty('takeaway');
  });
});

describe('the Reel Studio\'s options', () => {
  const q = (name: string) => def.qs.find((x) => x[0] === name)!;
  it('keeps Who is it for, Tone and Length as steers of the AI draft and offers three presenters: the recorded avatar and a spoken-by-me option are gone', () => {
    expect(def.available).toBe(true);
    expect(q('Who presents?')[1]).toEqual([PORTRAIT_VOICE, CARDS_VOICE, TEXT_ONLY]);
    expect(q('Who is it for?')[2]).toBe('draft'); expect(q('Tone?')[2]).toBe('draft'); expect(q('Length?')[2]).toBe('draft');
    expect(JSON.stringify(def)).not.toMatch(/An AI avatar|My own voice-over/);
    expect(AI_ONLY[PRESENTER].options).toEqual(expect.arrayContaining([PORTRAIT_VOICE, CARDS_VOICE]));
    expect(AI_ONLY[PRESENTER].options).not.toContain(TEXT_ONLY);
  });
  it('produces in both sizes, with captions burned in or separate and music made in code; the look is cast, for the portrait presenter only', () => {
    expect(def.rows).toEqual([['Format', [...FORMATS]], ['Captions', [...CAPTION_MODES]], ['Music', [...MUSICS]]]);
    expect(def.cast).toBe('look');
    expect(def.build).toEqual(['Writing the voice-over · from your scenes · no AI', 'Voicing each scene', 'Adding visuals and captions', 'Final cut']);
    expect(CHECK_OPTIONS).toEqual({ min: 2, max: 4 });
  });
  it('has a design example that is valid with the check, and no on-screen prefix in it', () => {
    expect(itemsValid(def, def.items)).toEqual([]);
    expect(def.items.some((r) => /^On screen:/.test(r[2] ?? ''))).toBe(false);
    expect(STUDIOS.filter((s) => s.available).map((s) => s.id)).toContain('reel');
    expect(wantsVoice(VOICE_SHAPE) && wantsVoice(PORTRAIT_SHAPE) && !wantsVoice({}) && !wantsVoice({ [PRESENTER]: TEXT_ONLY })).toBe(true);
  });
});

describe('the SQL that repeats these rules (20261118180000_reel_studio.sql)', () => {
  const sql = migrationText('20261118180000_reel_studio.sql');
  it('has the clock, the cap, the item limits, the Produce values and the sizes', () => {
    expect(sql).toContain('secs + 0.3');
    expect(sql).toContain('v_secs > ' + REEL_SECONDS_MAX);
    expect(sql).toMatch(/\('Reel', 10\)/);
    expect(sql).toContain('between 3 and 7');
    expect(sql).toContain("private.item_max('Reel') - 2");
    expect(sql).toContain('cardinality(private.reel_options(p_text)) between 2 and 4');
    for (const v of [...FORMATS, ...CAPTION_MODES, ...MUSICS]) expect(sql).toContain("'" + v + "'");
    for (const [f, s] of Object.entries(SIZE_OF)) expect(sql).toContain("('" + f + "', '" + s + "')");
    expect(sql).toContain('52428800');
    expect(MEDIA_MAX_BYTES).toBe(52428800);
    expect(sql).toContain("e ->> 'mime' = 'video/mp4' and right(e ->> 'path', 4) = '.mp4'");
    expect(sql).toContain("e ->> 'mime' = 'video/webm' and right(e ->> 'path', 5) = '.webm'");
  });
  it('has the presenters, the stock look test and the texts the studio shows', () => {
    for (const t of [PORTRAIT_VOICE, CARDS_VOICE]) expect(sql).toContain("'" + t + "'");
    expect(sql).toContain('l.active and l.id::text');
    for (const t of [VOICE_ALL, 'Voice scene %s again · its word timing is missing', 'The reel runs %s s · at most 90 s', 'Make the final cut in Produce', 'You changed the reel after the final cut · make the final cut again',
      'That look is not on the stock list', 'The video file is not the type or size it claims', 'Add the check question: one question, the right answer first']) expect(sql).toContain(t);
    expect(sql).toContain("The video''s length does not match the voice-over · make the final cut again");
  });
  it('deletes media_voice and gives no table, policy or grant', () => {
    expect(sql).toContain("delete from public.ai_uses where key = 'media_voice'");
    expect(sql).toContain("place = 'Create & share · Slides, Podcast and Reel studios'");
    expect(sql).not.toMatch(/create table|create policy|grant /i);
  });
});
