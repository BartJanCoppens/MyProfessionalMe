// Background music made in code (no audio files, so no licence): a pure list of notes the compositor plays as oscillators.
import { describe, expect, it } from 'vitest';
import { musicNotes } from './music';

describe('musicNotes', () => {
  it('is nothing for None', () => expect(musicNotes('None', 10)).toEqual([]));
  it('keeps Calm inside the piece and inside 110 to 880 Hz', () => {
    const notes = musicNotes('Calm', 10);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) { expect(n.at).toBeLessThan(10); expect(n.at + n.dur).toBeLessThanOrEqual(10); expect(n.freq).toBeGreaterThanOrEqual(110); expect(n.freq).toBeLessThanOrEqual(880); }
  });
  it('plays more notes a second for Upbeat than for Calm', () => expect(musicNotes('Upbeat', 20).length).toBeGreaterThan(musicNotes('Calm', 20).length));
  it('gives the same notes for the same input', () => expect(musicNotes('Upbeat', 12)).toEqual(musicNotes('Upbeat', 12)));
});
