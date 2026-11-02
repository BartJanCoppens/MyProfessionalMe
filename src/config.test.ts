// URL overrides of the prototype's props (FT-CFG-*), and the seed-data helpers the stores rely on.
import { describe, expect, it } from 'vitest';
import { readConfig } from './config';
import { isoDate, ragOptLabel, slugify, STAGE_FR, STAGES, yamlList, yq } from './data';

describe('readConfig', () => {
  it('defaults to the Consulting growth map with everything on', () => {
    expect(readConfig('')).toEqual({ businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation', showMarks: true, liveAssistant: true, motion: true });
  });
  it('reads line, screen, view and switches from the URL', () => {
    expect(readConfig('?bl=Audit&screen=team&view=radar&marks=off&live=0&motion=no')).toEqual({ businessLine: 'Audit', startScreen: 'team', homeView: 'radar', showMarks: false, liveAssistant: false, motion: false });
    expect(readConfig('?bl=Tax+%26+Legal').businessLine).toBe('Tax & Legal');
    expect(readConfig('?marks=yes&motion=FALSE')).toMatchObject({ showMarks: true, motion: false });
  });
  it('ignores unknown values', () => {
    expect(readConfig('?bl=Advisory&screen=detail&view=globe')).toMatchObject({ businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation' });
  });
  it('opens Create & share from the URL', () => {
    expect(readConfig('?screen=create').startScreen).toBe('create');
  });
  it('accepts every admin screen (the app still checks the role)', () => {
    expect(['adminLib', 'adminMap', 'adminKb', 'users'].map((s) => readConfig('?screen=' + s).startScreen)).toEqual(['adminLib', 'adminMap', 'adminKb', 'users']);
  });
});

describe('seed-data helpers', () => {
  it('keep the stage shares summing to one, one per stage', () => {
    expect(STAGE_FR).toHaveLength(STAGES.length);
    expect(STAGE_FR.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
  it('slugify names for file paths', () => {
    expect(slugify('Opérating model & cost — v2!')).toBe('operating-model-cost-v2');
    expect(slugify('***')).toBe('item');
    expect(slugify('x'.repeat(80))).toHaveLength(60);
  });
  it('turn short dates into ISO dates, defaulting the year to 2026', () => {
    expect(isoDate('3 Mar')).toBe('2026-03-03');
    expect(isoDate('28 Oct 2027')).toBe('2027-10-28');
  });
  it('quote YAML values only when needed', () => {
    expect(yq('plain')).toBe('plain');
    expect(yq('a: b')).toBe('"a: b"');
    expect(yamlList(['a', 'b, c'])).toBe('[a, "b, c"]');
  });
  it('label a RAG option, or echo an unknown one', () => {
    expect(ragOptLabel('gen', 'haiku')).toBe('Claude Haiku');
    expect(ragOptLabel('gen', 'other')).toBe('other');
  });
});
