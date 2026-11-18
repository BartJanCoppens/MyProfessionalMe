// Media files (Studios Phase 3): accepted kinds, size per kind, the one path shape, and the bucket that mirrors them.
import { describe, expect, it } from 'vitest';
import { MEDIA_KINDS, MEDIA_MAX_BYTES, MEDIA_PATH, mediaFileName, mediaKind, mediaPath, mediaProblem, SOURCE_KINDS, sourceProblem } from './mediaFiles';
import { latestMatch, migrationText } from '../test/migrations';

const MB = 1024 * 1024;
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e', CONTRIBUTION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('the path of a media file', () => {
  it('is <user>/<contribution>/<file>, built in one place', () => {
    expect(mediaPath(USER, CONTRIBUTION, 'narration.mp3')).toBe(USER + '/' + CONTRIBUTION + '/narration.mp3');
    expect(MEDIA_PATH.test(mediaPath(USER, CONTRIBUTION, 'deck.horizon'))).toBe(true);
  });
  it('makes any file name safe: spaces, slashes and other characters become dashes, no leading dot, the extension kept', () => {
    expect(mediaFileName('My deck (final).horizon')).toBe('My-deck-final-.horizon');
    expect(mediaFileName('../../etc/x.mp3')).toBe('-..-etc-x.mp3');
    expect(mediaFileName('a'.repeat(150) + '.mp3')).toBe('a'.repeat(96) + '.mp3');
  });
  it('refuses a contribution that is not saved yet, or a user id that is not one', () => {
    expect(() => mediaPath(USER, '', 'a.mp3')).toThrow('Save the contribution before adding files');
    expect(() => mediaPath('nobody', CONTRIBUTION, 'a.mp3')).toThrow('Sign in again to add files');
  });
});

describe('what may be uploaded', () => {
  it('knows the kind by its extension, in any case', () => {
    expect(mediaKind('deck.horizon')?.mime).toBe('application/json');
    expect(mediaKind('Voice.MP3')?.mime).toBe('audio/mpeg');
    expect(mediaKind('voice.m4a')?.mime).toBe('audio/mp4');
    expect(mediaKind('photo.gif')).toBeUndefined();
  });
  it('allows a .horizon file up to 50 MB and audio up to 25 MB per file', () => {
    expect(mediaProblem('deck.horizon', 50 * MB)).toBeNull();
    expect(mediaProblem('deck.horizon', 50 * MB + 1)).toBe('A Horizon presentation is at most 50 MB · this one is 50.0 MB');
    expect(mediaProblem('part.mp3', 25 * MB)).toBeNull();
    expect(mediaProblem('part.mp3', 26 * MB)).toBe('An audio file is at most 25 MB · this one is 26.0 MB');
  });
  it('allows a video (a studio reel) up to 50 MB, as mp4 or webm, and refuses a .mov', () => {
    expect(mediaKind('reel.mp4')?.mime).toBe('video/mp4');
    expect(mediaKind('reel.webm')?.mime).toBe('video/webm');
    expect(mediaProblem('reel.mp4', 50 * MB)).toBeNull();
    expect(mediaProblem('reel.mp4', 51 * MB)).toBe('A video is at most 50 MB · this one is 51.0 MB');
    expect(mediaProblem('reel.mov', 10)).toMatch(/^Only /);
  });
  it('names the accepted kinds for any other file, and refuses an empty one', () => {
    expect(mediaProblem('photo.gif', 10)).toBe('Only .horizon, .mp3, .m4a, .mp4 and .webm files can be added');
    expect(mediaProblem('part.mp3', 0)).toBe('The file is empty');
  });
});

describe('the bucket mirrors the rules', () => {
  const bucket = latestMatch(/insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)\s+values \('media', 'media', (\w+), (\d+), array\[([^\]]*)\]\)/);
  it('is private and its size limit is the largest kind', () => {
    expect(bucket[1]).toBe('false');
    expect(Number(bucket[2])).toBe(MEDIA_MAX_BYTES);
    expect(Math.max(...Object.values(MEDIA_KINDS).map((k) => k.maxBytes))).toBe(MEDIA_MAX_BYTES);
  });
  it('accepts every kind the app uploads', () => {
    const types = Array.from(bucket[3].matchAll(/'([^']*)'/g), (x) => x[1]);
    for (const k of Object.values(MEDIA_KINDS)) expect(types).toContain(k.mime);
  });
  it('and the database checks the same path shape', () => {
    const sql = latestMatch(/create (?:or replace )?function private\.media_path_ok\([\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
    expect(sql).toContain("'" + MEDIA_PATH.source.replaceAll('\\/', '/') + "'");
  });
});

describe('a trajectory plan\'s source documents (PDF)', () => {
  it('accepts a PDF up to 20 MB', () => {
    expect(SOURCE_KINDS.pdf).toEqual({ label: 'A PDF', mime: 'application/pdf', maxBytes: 20 * MB });
    expect(sourceProblem('syllabus.pdf', 5 * MB)).toBeNull();
    expect(sourceProblem('Syllabus.PDF', 5 * MB)).toBeNull();
  });
  it('says why not', () => {
    expect(sourceProblem('syllabus.pdf', 21 * MB)).toBe('A PDF is at most 20 MB · this one is 21.0 MB');
    expect(sourceProblem('notes.docx', 10)).toBe('Only .pdf files can be added as sources');
    expect(sourceProblem('syllabus.pdf', 0)).toBe('The file is empty');
  });
  it('is not a contribution file: contributions take no PDF', () => {
    expect(mediaProblem('x.pdf', 10)).not.toBeNull();
    expect(Object.keys(MEDIA_KINDS)).not.toContain('pdf');
  });
  it('is in the bucket\'s type list', () => {
    expect(migrationText('_trajectory_plans.sql')).toMatch(/update storage\.buckets set allowed_mime_types = allowed_mime_types \|\| 'application\/pdf'/);
  });
});
