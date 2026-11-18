// What a draft is saved as (fieldsOf): a studio that `savesProduce` (the Avatar: the database reads its run, language, difficulty and cast) saves its
// Shape answers, Produce answers and cast together inside `shape`; every other studio's shape is its Shape answers only.
import { describe, expect, it } from 'vitest';
import { blankDraft, fieldsOf } from './createSave';
import { noItems } from './logic/items';

const draft = (type: string, over = {}) => ({ ...blankDraft(null, 'Consulting'), type, title: 'T', ...over, items: noItems() });

describe('fieldsOf', () => {
  it('saves an avatar draft\'s Produce answers and cast inside its shape', () => {
    const f = fieldsOf(draft('Avatar', { shape: { 'How long is a run?': '10 minutes' }, produce: { Language: 'Dutch', Difficulty: 'Tough' }, cast: { Look: 'look-1' } }), [], 'avatar');
    expect(f.shape).toEqual({ 'How long is a run?': '10 minutes', Language: 'Dutch', Difficulty: 'Tough', Look: 'look-1' });
  });
  it('leaves a Reel draft\'s shape as its Shape answers only', () => {
    const f = fieldsOf(draft('Reel', { shape: { 'Who presents?': 'Text and music only' }, produce: { Format: '9:16 vertical' }, cast: { Look: 'look-1' } }), [], 'reel');
    expect(f.shape).toEqual({ 'Who presents?': 'Text and music only' });
  });
  it('saves no shape for an avatar draft with no answers, and none outside a studio', () => {
    expect(fieldsOf(draft('Avatar'), [], 'avatar').shape).toBeNull();
    expect(fieldsOf(draft('Reel', { shape: { a: 'b' } }), [], null).shape).toBeNull();
  });
});
