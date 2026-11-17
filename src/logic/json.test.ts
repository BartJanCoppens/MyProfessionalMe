import { describe, expect, it } from 'vitest';
import { jsonObject } from './json';

describe('jsonObject', () => {
  it('reads the object out of a reply with words around it', () => {
    expect(jsonObject('Here you go: {"a": 1} Hope it helps')).toEqual({ a: 1 });
  });
  it('is null, never a throw, for text without an object or with broken JSON', () => {
    expect(jsonObject('no object here')).toBeNull();
    expect(jsonObject('{not json}')).toBeNull();
    expect(jsonObject(undefined as unknown as string)).toBeNull();
  });
});
