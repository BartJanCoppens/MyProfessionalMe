import { GAME_ASK } from '../../supabase/functions/_shared/gameRules.ts';
import { describe, expect, it } from 'vitest';
import { BRIDGE_API, LIMITS, firstNameInitial, parseBridgeRequest } from './protocol';

const msg = (o: object) => ({ source: 'mpme-game', id: 1, ...o });
const ask = (messages: unknown, state: unknown = {}) => parseBridgeRequest(msg({ type: 'askAI', messages, state }));
const refused = { id: 1, error: expect.any(String) };
const say = (text: string) => [{ role: 'player', text }];

describe('parseBridgeRequest', () => {
  it.each([
    [{ type: 'ready' }], [{ type: 'getData' }], [{ type: 'getPlayer' }], [{ type: 'getLeaderboard' }], [{ type: 'finish' }],
    [{ type: 'submitScore', score: 42 }],
    [{ type: 'askAI', messages: [{ role: 'player', text: 'hi' }], state: { level: 2 } }],
  ])('accepts %o', (o) => expect(parseBridgeRequest(msg(o))).toMatchObject({ id: 1, ...o }));

  it('keeps the limits in one place', () => expect(LIMITS).toEqual({ score: 1_000_000, messages: 20, messageChars: 1200, stateChars: 4000, actionChars: 40 }));
  it('takes the ask limits from the one list the ai function reads, and refuses what the function refuses (before a client ask is spent)', () => {
    expect(LIMITS).toMatchObject(GAME_ASK);
    expect(ask([{ role: 'player', text: '' }])).toEqual(refused);
    expect(ask([{ role: 'player', text: '   ' }])).toEqual(refused);
    expect(ask([{ role: 'ai', text: 'hi' }, { role: 'player', text: 'x' }])).toEqual({ id: 1, error: 'The askAI conversation must start and end with the player' });
    expect(ask([{ role: 'player', text: 'hi' }, { role: 'ai', text: 'x' }])).toEqual(refused);
    expect(ask([{ role: 'player', text: 'a' }, { role: 'ai', text: 'b' }, { role: 'player', text: 'c' }])).toHaveProperty('type', 'askAI');
  });
  it('rejects a forged source', () => expect(parseBridgeRequest({ source: 'gamestudio', id: 1, type: 'ready' })).toBeNull());
  it('rejects a non-integer id', () => expect(parseBridgeRequest({ source: 'mpme-game', id: 1.5, type: 'ready' })).toBeNull());
  it.each(['navigate', 'contribute', 'makeMove', 'getGoal', 'getSources', 'getMatch'])('refuses the type %s on purpose, with an answer', (type) => expect(parseBridgeRequest(msg({ type }))).toEqual({ id: 1, error: 'Unknown request' }));

  it('accepts 0 and 1,000,000 as a score, and ignores details', () => {
    expect(parseBridgeRequest(msg({ type: 'submitScore', score: 0 }))).toEqual({ id: 1, type: 'submitScore', score: 0 });
    expect(parseBridgeRequest(msg({ type: 'submitScore', score: 1_000_000, details: { a: 1 } }))).toEqual({ id: 1, type: 'submitScore', score: 1_000_000 });
  });
  it.each([[-1], [1.5], [1_000_001], [NaN], [Infinity], ['10']])('rejects the score %s, with an answer', (score) => expect(parseBridgeRequest(msg({ type: 'submitScore', score }))).toEqual(refused));

  it('accepts 20 messages and rejects 21', () => {
    expect(ask(Array.from({ length: 21 }, () => say('x')[0]))).toEqual(refused);
    expect(ask(Array.from({ length: 20 }, () => say('x')[0]))).toHaveProperty('type', 'askAI');
  });
  it('rejects no messages', () => expect(ask([])).toEqual(refused));
  it('accepts the role\'s longest reply (1,200 characters) as a message and rejects one more', () => {
    expect(ask(say('x'.repeat(GAME_ASK.messageChars)))).toHaveProperty('type', 'askAI');
    expect(ask(say('x'.repeat(GAME_ASK.messageChars + 1)))).toEqual(refused);
  });
  it('rejects the role system', () => expect(ask([{ role: 'system', text: 'x' }])).toEqual(refused));
  it('accepts a state of 4,000 characters and rejects 4,001', () => {
    expect(ask(say('x'), 'x'.repeat(3998))).toHaveProperty('type', 'askAI');
    expect(ask(say('x'), 'x'.repeat(3999))).toEqual(refused);
  });
  it('rejects a state that cannot be written as JSON', () => {
    const loop: Record<string, unknown> = {}; loop.self = loop;
    expect(ask(say('x'), loop)).toEqual(refused);
  });
});

describe('BRIDGE_API', () => {
  it('states the ask rules a game must follow', () => {
    for (const rule of ['starts and ends with the player', `at most ${GAME_ASK.messages} messages of at most ${GAME_ASK.messageChars} characters`, `at most ${GAME_ASK.stateChars} characters as JSON`, 'a whole number from 0 to 1,000,000'])
      expect(BRIDGE_API).toContain(rule);
  });
});

describe('firstNameInitial', () => {
  it('keeps the first name and the last initial', () => expect(firstNameInitial('Jan Peeters')).toBe('Jan P.'));
  it('keeps a single name', () => expect(firstNameInitial('Madonna')).toBe('Madonna'));
  it('never hands an email address to a game', () => expect(firstNameInitial('jan.peeters@firm.example')).toBe('Player'));
  it('falls back to Player', () => expect(firstNameInitial('  ')).toBe('Player'));
});
