// Narration shared by Slides, Podcast and Horizon (copied from Horizon's narrativeText.ts and narrativeRun.ts): the
// ⟨next⟩ and ⟨cue⟩ marks, the text as spoken, and the steps a narration runs in, from its voice or at a pace.
import { describe, expect, it } from 'vitest';
import { CUE_MARK, narrationSteps, NEXT_MARK, ownMarks, ownSeconds, PACE, runLength, spoken } from './narration';

describe('marks and the spoken text', () => {
  it('drops the marks and tidies the spaces they leave', () => {
    expect(NEXT_MARK).toBe('⟨next⟩');
    expect(CUE_MARK).toBe('⟨cue⟩');
    expect(spoken('Revenue rises ⟨cue⟩ . Then ⟨next⟩ costs  follow.')).toBe('Revenue rises. Then costs follow.');
    expect(spoken(' ⟨next⟩ ')).toBe('');
  });
});

describe('timing at a pace', () => {
  it('gives a passage its words\' time at the pace (140 words a minute), at least 2 seconds', () => {
    expect(PACE).toBe(140);
    expect(ownSeconds(Array(140).fill('word').join(' '))).toBe(60);
    expect(ownSeconds(Array(70).fill('w').join(' '), 70)).toBe(60);
    expect(ownSeconds('Hi')).toBe(2);
  });
  it('puts each mark at its word\'s place', () => {
    const text = Array(14).fill('a').join(' ') + ' ⟨cue⟩ ' + Array(14).fill('b').join(' ') + ' ⟨next⟩ end';
    expect(ownMarks(text)).toEqual([{ kind: 'cue', at: 6 }, { kind: 'next', at: 12 }]);
  });
});

describe('narrationSteps', () => {
  const parts = [
    { part: 's1', text: 'Opening words ⟨cue⟩ here.', audio: { url: 'blob:one', seconds: 3.2, marks: [{ kind: 'cue' as const, at: 1.1 }] } },
    { part: 's2', text: 'No audio yet for this one.' },
    { part: 's3', text: ' ⟨next⟩ ' },
  ];
  it('with the voice: each voiced part is a step with its audio, its seconds and its marks; the others are skipped and counted', () => {
    expect(narrationSteps(parts, 'voice')).toEqual({ steps: [{ part: 's1', seconds: 3.2, marks: [{ kind: 'cue', at: 1.1 }], audio: 'blob:one' }], skipped: 2 });
  });
  it('in your own words: every part with words is timed at the pace, without audio', () => {
    const r = narrationSteps(parts, 'own');
    expect(r.skipped).toBe(1);
    expect(r.steps.map((s) => [s.part, s.audio])).toEqual([['s1', undefined], ['s2', undefined]]);
    expect(r.steps[1].seconds).toBeCloseTo((6 / PACE) * 60 < 2 ? 2 : (6 / PACE) * 60);
    expect(r.steps[0].marks).toEqual([{ kind: 'cue', at: (2 / PACE) * 60 }]);
  });
  it('a run lasts the sum of its steps', () => {
    expect(runLength([{ part: 'a', seconds: 2, marks: [] }, { part: 'b', seconds: 3.5, marks: [] }])).toBe(5.5);
  });
});
