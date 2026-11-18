// The Podcast format (studios plan, Task 3.5) as content: its script rows (chapters and turns) and the voice-over after them,
// the speakers of each format and one stock voice per speaker, the text cut at the voice's 5,000 characters, the 30-minute cap,
// what the script publishes as (studioContent = private.podcast_content), its hours and completion, the options that stay and
// the SQL that repeats these rules.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { latestMatch } from '../test/migrations';
import { STUDIOS } from '../studioData';
import { mediaHours } from './horizonItem';
import { ITEM_MAX } from './items';
import { CHUNK_CHARS, chunkText } from './narration';
import { CHAPTER, FORMAT_QUESTION, INTERVIEW, PODCAST_MAX_SECONDS, SOLO, TWO_HOSTS, partsOf, podcastBuilt, podcastLine, podcastProblems, podcastSeconds, podcastSteps, scriptOf, seededPodcast, speakersOf } from './podcastContent';
import { COMPLETION, completionTodo, completionText } from './record';
import { studioContent } from './studioContent';
import { itemsValid, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';
import { LONG_MAX } from './items';
import { CLIPS_MAX, boundClips, withClips } from './voiceItem';
import type { Clip, Part } from './voiceItem';
import { MEDIA } from '../data';
import type { PodMedia } from '../types';

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const def = studioById('podcast')!;
const ROWS: StudioItem[] = [['Chapter 1 · 0:00', 'Why it lands in the close'], ['Host', 'Most teams think this is a tax problem. Why is it a close problem?'], ['Guest', 'Half of the data sits in consolidation.'],
  ['Chapter 2 · 0:30', 'What to fix first'], ['Host', 'Give me the one thing to fix first.'], ['Guest', 'Entity data, then deferred taxes.']];
const TURNS = ROWS.filter((r) => !CHAPTER.test(r[0]));
const clip = (k: number, voice: string, seconds = 5 + k): Clip => ({ slide: k, text: TURNS[k][1], voice, path: FOLDER + 'voice-' + (k + 1) + '.mp3', seconds, marks: [] });
const VOICED = (host = 'EL1', guest = 'EL2'): StudioEntry[] => withClips(ROWS, TURNS.map((t, k) => clip(k, t[0] === 'Host' ? host : guest))) as StudioEntry[];
const INTERVIEW_SHAPE = { [FORMAT_QUESTION]: INTERVIEW };

describe('the script of a Podcast piece', () => {
  it('is chapter rows ("Chapter N · m:ss", then its title) and turn rows (a speaker, then the words); the voice-over is neither', () => {
    expect(itemsValid(def, [...ROWS, VOICED().at(-1)!])).toEqual([]);
    expect(scriptOf(ROWS)).toEqual({ chapters: ['Why it lands in the close', 'What to fix first'], turns: [
      { speaker: 'Host', text: 'Most teams think this is a tax problem. Why is it a close problem?', chapter: 1 }, { speaker: 'Guest', text: 'Half of the data sits in consolidation.', chapter: 1 },
      { speaker: 'Host', text: 'Give me the one thing to fix first.', chapter: 2 }, { speaker: 'Guest', text: 'Entity data, then deferred taxes.', chapter: 2 }] });
  });
  it.each([
    ['no chapter first', [ROWS[1], ROWS[0], ROWS[2]], 'Start with a chapter'],
    ['a chapter not at 0:00', [['Chapter 1 · 0:10', 'a'], ROWS[1], ROWS[2]], 'timestamp'],
    ['chapters that do not rise', [ROWS[0], ROWS[1], ['Chapter 2 · 0:00', 'b'], ROWS[2]], 'timestamp'],
    ['chapters not numbered from 1', [['Chapter 2 · 0:00', 'a'], ROWS[1], ROWS[2]], 'Number the chapters'],
    ['a chapter without a line', [ROWS[0], ROWS[1], ['Chapter 2 · 1:00', 'c']], 'has no lines'],
    ['a speaker that is not one', [ROWS[0], ROWS[1], ['Narrator', 'c']], 'is not a speaker'],
    ['three speakers', [ROWS[0], ROWS[1], ROWS[2], ['Co-host', 'd']], 'at most two speakers'],
    ['a line of marks only', [ROWS[0], ROWS[1], ['Guest', '⟨next⟩']], 'add what is said'],
  ] as [string, StudioItem[], string][])('refuses %s', (_, rows, why) => { expect(itemsValid(def, rows).join(' ')).toContain(why); });
  it('needs at least 3 rows and leaves the last place of the cap to the voice-over', () => {
    expect(itemsValid(def, ROWS.slice(0, 2))).toContain('Add at least 3 items');
    const many = Array.from({ length: ITEM_MAX.Podcast }, (_, k): StudioItem => (k ? ['Host', 'x'] : ['Chapter 1 · 0:00', 'x']));
    expect(itemsValid(def, many).join(' ')).toContain('Keep at most ' + (ITEM_MAX.Podcast - 1) + ' rows');
  });
});

describe('who speaks', () => {
  it('an interview has a host and a guest, two AI hosts a host and a co-host, a solo talk a host; the interview is the default', () => {
    expect(speakersOf({ [FORMAT_QUESTION]: INTERVIEW })).toEqual(['Host', 'Guest']);
    expect(speakersOf({ [FORMAT_QUESTION]: TWO_HOSTS })).toEqual(['Host', 'Co-host']);
    expect(speakersOf({ [FORMAT_QUESTION]: SOLO })).toEqual(['Host']);
    expect(speakersOf({})).toEqual(['Host', 'Guest']);
  });
  it('a line by a speaker the format does not have is a problem, in words', () => {
    expect(podcastProblems(VOICED(), { [FORMAT_QUESTION]: SOLO }, true)).toEqual(['A line has a speaker this format does not have: Host only']);
    expect(podcastProblems(VOICED(), { [FORMAT_QUESTION]: TWO_HOSTS }, true)).toEqual(['A line has a speaker this format does not have: Host and Co-host only']);
    expect(podcastProblems(VOICED(), INTERVIEW_SHAPE, true)).toEqual([]);
  });
});

describe('one stock voice per speaker', () => {
  const parts = (): Part[] => partsOf(ROWS);
  it('binds a clip to every turn with a voice for each speaker and a different voice for different speakers', () => {
    expect(boundClips(VOICED(), parts())).toHaveLength(4);
  });
  it('refuses two speakers in the same voice, and one speaker in two voices', () => {
    expect(boundClips(VOICED('EL1', 'EL1'), parts())).toBeNull();
    const mixed = VOICED(); const v = mixed.at(-1) as { clips: Clip[] }; v.clips[2] = { ...v.clips[2], voice: 'EL3' };
    expect(boundClips(mixed, parts())).toBeNull();
  });
  it('refuses a turn without a clip made from its present words', () => {
    const stale = VOICED(); const v = stale.at(-1) as { clips: Clip[] }; v.clips[1] = { ...v.clips[1], text: 'Words that were changed since.' };
    expect(boundClips(stale, parts())).toBeNull();
    expect(boundClips(ROWS as StudioEntry[], parts())).toBeNull();
  });
  it('lets a solo talk use one voice', () => {
    const solo = withClips([ROWS[0], ['Host', 'One.'], ['Host', 'Two.']] as StudioItem[], [{ ...clip(0, 'EL1'), text: 'One.' }, { ...clip(1, 'EL1'), text: 'Two.' }]) as StudioEntry[];
    expect(boundClips(solo, partsOf(solo))).toHaveLength(2);
  });
});

describe('the voice speaks at most 5,000 characters a call', () => {
  const sentence = 'This is one sentence of a good length. ';
  it('cuts a longer text after a sentence end, or at a space, into pieces that put the text back together', () => {
    const text = sentence.repeat(300).trim(); // about 11,700 characters
    const pieces = chunkText(text, CHUNK_CHARS);
    expect(pieces.length).toBe(3);
    expect(pieces.every((p) => p.length <= CHUNK_CHARS && p.length > 0)).toBe(true);
    expect(pieces.join(' ')).toBe(text);
    expect(pieces[0].endsWith('.')).toBe(true);
    expect(chunkText('word '.repeat(2000).trim(), 100).every((p) => p.length <= 100)).toBe(true);
  });
  it('keeps a text that fits, and cuts a word with no space only at the limit', () => {
    expect(chunkText('Short.', CHUNK_CHARS)).toEqual(['Short.']);
    expect(chunkText('x'.repeat(250), 100).map((p) => p.length)).toEqual([100, 100, 50]);
    expect(CHUNK_CHARS).toBe(5000);
  });
  it('is applied to every turn: each piece of a long turn is a part of its own, in order, with the speaker and the chapter', () => {
    const long: StudioItem[] = [ROWS[0], ['Host', sentence.repeat(300).trim()], ['Guest', 'Short.']];
    const parts = partsOf(long);
    expect(parts.map((p) => p.speaker)).toEqual(['Host', 'Host', 'Host', 'Guest']);
    expect(parts.every((p) => p.text.length <= CHUNK_CHARS)).toBe(true);
  });
  it('is never needed for a valid row (a row\'s text is far shorter than a call), which is why the SQL counts turns', () => {
    expect(LONG_MAX).toBeLessThan(CHUNK_CHARS);
  });
});

describe('studioContent for a Podcast', () => {
  it('publishes the chapters (title, start from the voiced lengths, first turn) and the script as the transcript with each turn\'s audio, as private.podcast_content does', () => {
    const c = studioContent('Podcast', VOICED(), INTERVIEW_SHAPE);
    expect(c).toEqual({ kind: 'podcast', made: 'ai', seconds: 26, chapters: [{ title: 'Why it lands in the close', start: 0, turn: 0 }, { title: 'What to fix first', start: 11, turn: 2 }],
      turns: TURNS.map((t, k) => ({ speaker: t[0], text: t[1], audio: { path: FOLDER + 'voice-' + (k + 1) + '.mp3', seconds: 5 + k, marks: [] } })) });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('has no content until every turn is voiced, in a voice per speaker', () => {
    expect(studioContent('Podcast', ROWS as StudioEntry[], INTERVIEW_SHAPE)).toBeNull();
    expect(studioContent('Podcast', VOICED('EL1', 'EL1'), INTERVIEW_SHAPE)).toBeNull();
  });
  it('is read back strictly: chapters and turns with a title or words, audio in the media folder, at most 30 minutes', () => {
    const c = studioContent('Podcast', VOICED(), INTERVIEW_SHAPE)!;
    expect(parseFormatContent({ ...c, turns: [] })).toBeNull();
    expect(parseFormatContent({ ...c, chapters: [] })).toBeNull();
    expect(parseFormatContent({ ...c, seconds: PODCAST_MAX_SECONDS + 1 })).toBeNull();
    expect(parseFormatContent({ ...c, made: 'human' })).toBeNull();
    expect(parseFormatContent({ ...c, chapters: [{ title: '', start: 0, turn: 0 }] })).toBeNull();
    expect(parseFormatContent({ ...c, turns: [{ speaker: 'Host', text: 'x', audio: { path: 'https://x.test/a.mp3', seconds: 3, marks: [] } }] })).toBeNull();
  });
});

describe('what blocks sending a Podcast', () => {
  it('an unvoiced script cannot be produced; the reason says whether the voice can be used now (no browser-voice podcast)', () => {
    expect(podcastProblems(ROWS as StudioEntry[], INTERVIEW_SHAPE, true)).toEqual(['Voice every line in Produce: an episode is always told by the AI voice, with a different voice for each speaker']);
    expect(podcastProblems(ROWS as StudioEntry[], INTERVIEW_SHAPE, false)).toEqual(['The AI voice is not switched on, so an episode cannot be produced: the browser voice only previews the script']);
  });
  it('an episode over 30 minutes is refused, in words, from the stored seconds', () => {
    const long = withClips(ROWS, TURNS.map((t, k) => clip(k, t[0] === 'Host' ? 'EL1' : 'EL2', 170))) as StudioEntry[];
    expect(podcastSeconds(long)).toBe(680);
    const rows: StudioItem[] = [ROWS[0], ...Array.from({ length: 11 }, (_, k): StudioItem => ['Host', 'Say it ' + k])];
    const over = withClips(rows, rows.slice(1).map((r, k) => ({ ...clip(0, 'EL1', 170), slide: k, text: r[1] }))) as StudioEntry[];
    expect(podcastSeconds(over)).toBe(1870);
    expect(podcastProblems(over, { [FORMAT_QUESTION]: SOLO }, true)).toEqual(['The episode runs 32 min, over the 30 min limit: shorten the script']);
  });
  it('shows the build done as far as the output goes: the script, every line voiced, the length within the limit', () => {
    expect(podcastBuilt([], INTERVIEW_SHAPE)).toBe(0);
    expect(podcastBuilt(ROWS as StudioEntry[], INTERVIEW_SHAPE)).toBe(1);
    expect(podcastBuilt(VOICED(), INTERVIEW_SHAPE)).toBe(3);
  });
});

describe('hours and completion', () => {
  it('the hours come from the total seconds through the one hours helper (0.05 h steps, at least 0.05, at most 1)', () => {
    expect([mediaHours(26), mediaHours(1800)]).toEqual([0.05, 0.5]);
    expect(podcastLine({ chapters: [{}, {}], seconds: 26 })).toBe('2 chapters · 26 s · counts 0.05 h');
  });
  it('completes itself at the end (media), the existing rule, said in words', () => {
    expect(COMPLETION.Podcast).toBe('media');
    expect(completionTodo('Podcast')).toBe('listen to the end');
    expect(completionText('Podcast', 'Sam')).toBe('Listening to the end completes it. It counts right away; no acceptance needed.');
  });
});

describe('the Podcast Studio\'s options', () => {
  it('keeps Format, Length and Who listens, says what only steers the AI draft, and drops the intro music and the transcript choice', () => {
    expect(def.qs.map((q) => [q[0], q[2] ?? ''])).toEqual([[FORMAT_QUESTION, ''], ['Length?', 'draft'], ['Who listens?', 'draft']]);
    expect(def.qs[0][1]).toEqual([INTERVIEW, TWO_HOSTS, SOLO]);
    expect(def.rows).toEqual([]);
    expect(JSON.stringify(def)).not.toMatch(/jingle|Intro music|Transcript/);
    expect(def.available).toBe(true);
    expect(def.cast).toBe('voices');
  });
  it('its own example rows are a valid script', () => {
    expect(itemsValid(def, def.items)).toEqual([]);
    expect(STUDIOS.find((s) => s.id === 'podcast')!.build).toEqual(['Writing the script', 'Voicing each speaker', 'Timing the chapters']);
  });
});

describe('the one player: stored turns, or the chapters of an episode that has no recording', () => {
  const urls = TURNS.map((_, k) => 'blob:' + k);
  it('plays a stored episode turn by turn, each turn on its own audio', () => {
    const c = studioContent('Podcast', VOICED(), INTERVIEW_SHAPE) as never;
    expect(podcastSteps(c, urls)).toEqual(TURNS.map((_, k) => ({ part: String(k), seconds: 5 + k, marks: [], audio: 'blob:' + k })));
  });
  it('plays a v3 episode as its chapters on the clock, with no audio (the seeded episodes have none)', () => {
    const c = seededPodcast(MEDIA.L42 as PodMedia);
    expect(c).toMatchObject({ kind: 'podcast', made: 'scripted', seconds: 1680, turns: [], chapters: [{ title: 'Why tenders reopen scope', start: 0, turn: 0 }, { title: 'Trading timing for scope', start: 580, turn: 1 }, { title: 'What to put in writing', start: 1155, turn: 2 }] });
    expect(podcastSteps(c, [])).toEqual([{ part: '0', seconds: 580, marks: [] }, { part: '1', seconds: 575, marks: [] }, { part: '2', seconds: 525, marks: [] }]);
  });
});

describe('the SQL repeats these rules', () => {
  const fn = (name: string) => latestMatch(new RegExp('create (?:or replace )?function private\\.' + name + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$'))[1];
  it('the chapter label, the speakers, the caps and the 30 minutes', () => {
    expect(fn('script_ok')).toContain('^Chapter ([0-9]{1,3}) · ([0-9]{1,3}):([0-5][0-9])$');
    expect(CHAPTER.source).toBe('^Chapter (\\d{1,3}) · (\\d{1,3}):([0-5]\\d)$');
    expect(fn('script_ok')).toContain("('Host', 'Guest', 'Co-host')");
    expect(latestMatch(/\('Podcast', (\d+)\)/)[1]).toBe(String(ITEM_MAX.Podcast));
    expect(latestMatch(/podcast_seconds\([^)]*\) > (\d+)/)[1]).toBe(String(PODCAST_MAX_SECONDS));
    expect(fn('voice_ok')).toContain('between 1 and ' + CLIPS_MAX);
    expect(fn('voice_ok')).toContain('between 0 and ' + (CLIPS_MAX - 1));
  });
  it('a studio episode counts its hours through media_hours; a v3 podcast keeps 0.5 h; the old name is gone', () => {
    const publish = latestMatch(/create (?:or replace )?function private\.publish_contribution\([\s\S]*?\n\$\$;/)[0];
    expect(publish).toContain("when 'Podcast' then case when c.studio is not null then private.media_hours((v_content ->> 'seconds')::numeric) else 0.5 end");
    expect(publish).not.toContain('horizon_hours');
    expect(fn('media_hours')).toContain('ceil(p_seconds / 180)');
  });
});
