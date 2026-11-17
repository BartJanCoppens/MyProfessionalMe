// Media files (Studios Phase 3): accepted kinds, size per kind, the one path shape, and the bucket that mirrors them.
import { describe, expect, it } from 'vitest';
import { MEDIA_KINDS, MEDIA_MAX_BYTES, MEDIA_PATH, mediaFileName, mediaKind, mediaPath, mediaProblem } from './mediaFiles';
import { latestMatch } from '../test/migrations';

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
  it('names the accepted kinds for any other file, and refuses an empty one', () => {
    expect(mediaProblem('photo.gif', 10)).toBe('Only .horizon, .mp3 and .m4a files can be added');
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
