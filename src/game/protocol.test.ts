import { describe, expect, it } from 'vitest';
import { LIMITS, firstNameInitial, parseBridgeRequest } from './protocol';

const msg = (o: object) => ({ source: 'mpme-game', id: 1, ...o });
const ask = (messages: unknown, state: unknown = {}) => parseBridgeRequest(msg({ type: 'askAI', messages, state }));
const say = (text: string) => [{ role: 'player', text }];

describe('parseBridgeRequest', () => {
  it.each([
    [{ type: 'ready' }], [{ type: 'getData' }], [{ type: 'getPlayer' }], [{ type: 'getLeaderboard' }], [{ type: 'finish' }],
    [{ type: 'submitScore', score: 42 }],
    [{ type: 'askAI', messages: [{ role: 'player', text: 'hi' }], state: { level: 2 } }],
  ])('accepts %o', (o) => expect(parseBridgeRequest(msg(o))).toMatchObject({ id: 1, ...o }));

  it('keeps the limits in one place', () => expect(LIMITS).toEqual({ score: 1_000_000, messages: 20, messageChars: 1000, stateChars: 4000 }));
  it('rejects a forged source', () => expect(parseBridgeRequest({ source: 'gamestudio', id: 1, type: 'ready' })).toBeNull());
  it('rejects a non-integer id', () => expect(parseBridgeRequest({ source: 'mpme-game', id: 1.5, type: 'ready' })).toBeNull());
  it.each(['navigate', 'contribute', 'makeMove', 'getGoal', 'getSources', 'getMatch'])('drops the type %s on purpose', (type) => expect(parseBridgeRequest(msg({ type }))).toBeNull());

  it('accepts 0 and 1,000,000 as a score, and ignores details', () => {
    expect(parseBridgeRequest(msg({ type: 'submitScore', score: 0 }))).toEqual({ id: 1, type: 'submitScore', score: 0 });
    expect(parseBridgeRequest(msg({ type: 'submitScore', score: 1_000_000, details: { a: 1 } }))).toEqual({ id: 1, type: 'submitScore', score: 1_000_000 });
  });
  it.each([[-1], [1.5], [1_000_001], [NaN], [Infinity], ['10']])('rejects the score %s', (score) => expect(parseBridgeRequest(msg({ type: 'submitScore', score }))).toBeNull());

  it('accepts 20 messages and rejects 21', () => {
    expect(ask(Array.from({ length: 20 }, () => say('x')[0]))).not.toBeNull();
    expect(ask(Array.from({ length: 21 }, () => say('x')[0]))).toBeNull();
  });
  it('rejects no messages', () => expect(ask([])).toBeNull());
  it('accepts 1,000 characters and rejects 1,001', () => {
    expect(ask(say('x'.repeat(1000)))).not.toBeNull();
    expect(ask(say('x'.repeat(1001)))).toBeNull();
  });
  it('rejects the role system', () => expect(ask([{ role: 'system', text: 'x' }])).toBeNull());
  it('accepts a state of 4,000 characters and rejects 4,001', () => {
    expect(ask(say('x'), 'x'.repeat(3998))).not.toBeNull();
    expect(ask(say('x'), 'x'.repeat(3999))).toBeNull();
  });
  it('rejects a state that cannot be written as JSON', () => {
    const loop: Record<string, unknown> = {}; loop.self = loop;
    expect(ask(say('x'), loop)).toBeNull();
  });
});

describe('firstNameInitial', () => {
  it('keeps the first name and the last initial', () => expect(firstNameInitial('Jan Peeters')).toBe('Jan P.'));
  it('keeps a single name', () => expect(firstNameInitial('Madonna')).toBe('Madonna'));
  it('never hands an email address to a game', () => expect(firstNameInitial('jan.peeters@firm.example')).toBe('Player'));
  it('falls back to Player', () => expect(firstNameInitial('  ')).toBe('Player'));
});
