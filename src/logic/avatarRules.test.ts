// The Avatar rules the app and the `ai` function share (supabase/functions/_shared/avatarRules.ts): the one reader of the five character
// rows and the learning points (ported from Taxatar's practiceCaseChatLearningPointWeights test: weights that do not add up to 100 are equalised).
import { describe, expect, it } from 'vitest';
import { AVATAR_ASK, CHARACTER_LABELS, DIFFICULTIES, LANGUAGES, RUN_MINUTES, RUN_TURNS, SCORINGS, characterOf, parseLearningPoints } from '../../supabase/functions/_shared/avatarRules.ts';

const point = (n: number, text: string) => ['Learning point · ' + n + ' %', text];

describe('parseLearningPoints', () => {
  it('keeps weights that add up to 100, with ids lp-1 to lp-N in row order', () => {
    expect(parseLearningPoints([['Persona', 'x'], point(30, 'a'), point(40, 'b'), point(30, 'c')])).toEqual([{ id: 'lp-1', text: 'a', weight: 30 }, { id: 'lp-2', text: 'b', weight: 40 }, { id: 'lp-3', text: 'c', weight: 30 }]);
  });
  it('equalises weights that do not add up to 100', () => {
    expect(parseLearningPoints([point(50, 'a'), point(30, 'b')]).map((p) => p.weight)).toEqual([50, 50]);
    expect(parseLearningPoints([point(30, 'a'), point(30, 'b'), point(30, 'c')]).map((p) => p.weight)).toEqual([33, 33, 33]);
  });
  it('drops a blank point row and numbers what is left', () => {
    expect(parseLearningPoints([point(50, 'a'), point(20, '  '), point(30, 'c')])).toEqual([{ id: 'lp-1', text: 'a', weight: 50 }, { id: 'lp-2', text: 'c', weight: 50 }]);
    expect(parseLearningPoints([point(100, ' ')])).toEqual([]);
  });
});

describe('characterOf', () => {
  const rows = [['Persona', ' An HR director '], ['Situation', 's'], ['Opening line', 'o'], ['Reveals if asked', ' r '], ['Hides unless probed', 'h', 'ignored']];
  it('reads the five rows, trimmed', () => {
    expect(characterOf(rows)).toEqual({ persona: 'An HR director', situation: 's', opening: 'o', reveals: 'r', hides: 'h' });
    expect(CHARACTER_LABELS).toHaveLength(5);
  });
  it('is null while a row is missing', () => {
    expect(characterOf(rows.slice(0, 4))).toBeNull();
    expect(characterOf([])).toBeNull();
  });
});

describe('the limits', () => {
  it('give the run lengths and the learner lines per run', () => {
    expect(RUN_MINUTES).toEqual([5, 10, 15]);
    expect(RUN_TURNS).toEqual({ 5: 12, 10: 24, 15: 36 });
    expect(AVATAR_ASK).toEqual({ sayChars: 1000, replyChars: 1200, maxTokens: 400 });
  });
  it('name the languages with their code and speech locale, the difficulties and the scorings', () => {
    expect(LANGUAGES).toEqual({ English: { code: 'en', speech: 'en-GB' }, Dutch: { code: 'nl', speech: 'nl-BE' }, French: { code: 'fr', speech: 'fr-BE' } });
    expect(DIFFICULTIES).toEqual(['Gentle', 'Realistic', 'Tough']);
    expect(SCORINGS).toEqual(['AI scores, counsellor confirms', 'Practice only']);
  });
});
