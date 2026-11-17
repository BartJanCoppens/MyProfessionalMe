// What the media adapter sends to Supabase Storage, and the sentences it turns refusals into. The client is a fake.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, op } from '../test/fakeSupabase';
import { mediaUrl, removeContributionMedia, removeMedia, uploadMedia } from './mediaStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e', CONTRIBUTION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PATH = USER + '/' + CONTRIBUTION + '/narration.mp3';
beforeEach(() => {
  db.reset();
  db.client.auth.getSession.mockImplementation(async () => ({ data: { session: { user: { id: USER } } } }));
});
const blob = (bytes: number) => new Blob([new Uint8Array(bytes)]);

describe('uploading', () => {
  it('puts the file at the path of its contribution with the type of its kind, and returns the path', async () => {
    db.answer(() => ({ data: { path: PATH } }));
    expect(await uploadMedia(CONTRIBUTION, blob(10), 'narration.mp3')).toBe(PATH);
    const [call] = db.calls;
    expect(call.table).toBe('storage:media');
    expect(call.steps).toEqual([['upload', [PATH, expect.any(Blob), { contentType: 'audio/mpeg', upsert: true }]]]);
  });
  it('checks the size before sending anything', async () => {
    await expect(uploadMedia(CONTRIBUTION, blob(26 * 1024 * 1024), 'narration.mp3')).rejects.toThrow('An audio file is at most 25 MB');
    expect(db.calls).toHaveLength(0);
  });
  it('asks to sign in again without a session', async () => {
    db.client.auth.getSession.mockImplementation(async () => ({ data: { session: null } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'narration.mp3')).rejects.toThrow('Sign in again to add files');
  });
  it('says why Storage refused, in words', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy', statusCode: '403' } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'a.mp3')).rejects.toThrow('Not allowed · files change only while your contribution is a draft or has changes requested');
    db.answer(() => ({ error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'a.mp3')).rejects.toThrow('The file is too large · at most 50 MB');
    db.answer(() => ({ error: { message: 'mime type audio/wav is not supported', statusCode: '415' } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'a.mp3')).rejects.toThrow('This kind of file is not accepted');
    db.answer(() => ({ error: { message: 'Object not found', statusCode: '404' } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'a.mp3')).rejects.toThrow('Object not found');
    db.answer(() => ({ error: { message: 'Something else broke' } }));
    await expect(uploadMedia(CONTRIBUTION, blob(10), 'a.mp3')).rejects.toThrow('Something else broke');
  });
});

describe('reading', () => {
  it('signs a URL for the path, for an hour unless told otherwise', async () => {
    db.answer(() => ({ data: { signedUrl: 'https://x/sign/media/a?token=t' } }));
    expect(await mediaUrl(PATH)).toBe('https://x/sign/media/a?token=t');
    expect(await mediaUrl(PATH, 60)).toBe('https://x/sign/media/a?token=t');
    expect(db.calls.map((c) => c.steps)).toEqual([[['createSignedUrl', [PATH, 3600]]], [['createSignedUrl', [PATH, 60]]]]);
  });
  it('says a file it may not read is not there, as Storage does', async () => {
    db.answer(() => ({ error: { message: 'Object not found', statusCode: '404' } }));
    await expect(mediaUrl(PATH)).rejects.toThrow('This file is not there, or not open to you');
    db.answer(() => ({ data: {} }));
    await expect(mediaUrl(PATH)).rejects.toThrow('This file is not there, or not open to you');
    db.answer(() => ({ error: { message: 'The object exceeded the maximum allowed size' } }));
    await expect(mediaUrl(PATH)).rejects.toThrow('The object exceeded the maximum allowed size');
  });
});

describe('removing', () => {
  it('removes the one path', async () => {
    db.answer(() => ({ data: [{ name: PATH }] }));
    await removeMedia(PATH);
    expect(db.calls[0].steps).toEqual([['remove', [[PATH]]]]);
  });
  it('says so when nothing was removed (another person\'s file, or one in review)', async () => {
    db.answer(() => ({ data: [] }));
    await expect(removeMedia(PATH)).rejects.toThrow('Not removed · only files of your own draft, or one with changes requested, can be removed');
  });
});

describe('removing all files of a contribution', () => {
  const FOLDER = USER + '/' + CONTRIBUTION;
  it('lists the contribution\'s folder and removes every file in it', async () => {
    db.answer((c) => (op(c) === 'list' ? { data: [{ name: 'a.mp3' }, { name: 'deck.horizon' }] } : { data: [{}, {}] }));
    await removeContributionMedia(CONTRIBUTION);
    expect(db.calls.map((c) => c.steps)).toEqual([[['list', [FOLDER, { limit: 1000 }]]], [['remove', [[FOLDER + '/a.mp3', FOLDER + '/deck.horizon']]]]]);
  });
  it('removes nothing when there are no files', async () => {
    db.answer(() => ({ data: [] }));
    await removeContributionMedia(CONTRIBUTION);
    expect(db.calls.map(op)).toEqual(['list']);
  });
  it('says so when not every file was removed', async () => {
    db.answer((c) => (op(c) === 'list' ? { data: [{ name: 'a.mp3' }, { name: 'b.mp3' }] } : { data: [{}] }));
    await expect(removeContributionMedia(CONTRIBUTION)).rejects.toThrow('Not removed · only files of your own draft, or one with changes requested, can be removed');
  });
});

