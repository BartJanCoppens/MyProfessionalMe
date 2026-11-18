// Caption cues from the voice's own word timings (studios plan, Task 5.1): never an even spread, and no timing means no cues.
import { describe, expect, it } from 'vitest';
import { CAPTION_CHARS, captionCues, cueAt, toVtt } from './captions';

const TEXT = 'Your project is drifting. Here are three signs.';
const WORDS = [0, 0.3, 0.5, 0.9, 1.4, 1.6, 1.9, 2.2];
const CUES = [{ start: 10, end: 11.4, text: 'Your project is drifting.' }, { start: 11.4, end: 12.6, text: 'Here are three signs.' }];

describe('captionCues', () => {
  it('ends a cue at a sentence end and starts the next where its first word is spoken', () => {
    expect(captionCues(TEXT, WORDS, 10, 12.6)).toEqual(CUES);
  });
  it('ignores the marks in the text', () => {
    expect(captionCues('Your project is drifting. ⟨next⟩ Here are ⟨cue⟩ three signs.', WORDS, 10, 12.6)).toEqual(CUES);
  });
  it('keeps every cue to at most 42 characters', () => {
    const sentence = 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet.';
    const words = sentence.split(' ').map((_, i) => i * 0.4);
    const cues = captionCues(sentence, words, 0, 4)!;
    expect(sentence.length).toBeGreaterThanOrEqual(60);
    expect(cues.length).toBe(2);
    expect(cues.every((c) => c.text.length <= CAPTION_CHARS)).toBe(true);
  });
  it('gives null when the timings do not match the words: the timing is missing, never invented', () => {
    expect(captionCues(TEXT, WORDS.slice(0, 7), 10, 12.6)).toBeNull();
    expect(captionCues(TEXT, [], 10, 12.6)).toBeNull();
  });
});

describe('toVtt and cueAt', () => {
  it('writes WebVTT with the cue times', () => {
    const vtt = toVtt(CUES);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:10.000 --> 00:00:11.400\nYour project is drifting.');
    expect(toVtt([{ start: 3725.5, end: 3726, text: 'x' }])).toContain('01:02:05.500 --> 01:02:06.000');
  });
  it('finds the cue showing at a time', () => {
    expect(cueAt(CUES, 11.39)!.text).toBe('Your project is drifting.');
    expect(cueAt(CUES, 11.4)!.text).toBe('Here are three signs.');
    expect(cueAt(CUES, 9)).toBeNull();
    expect(cueAt(CUES, 12.6)).toBeNull();
  });
});
