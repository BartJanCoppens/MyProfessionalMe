import { GAME_ASK } from '../../supabase/functions/_shared/gameRules.ts';
// The messages a game in the sealed-off frame may send the platform, and their limits.
// Anything that doesn't parse is ignored: a game can ask, never instruct.
// Ported from GameStudio's bridge/protocol.ts; the API text is BRIDGE_API (ported from its gameModel.ts).

export type AskRole = { messages: { role: 'player' | 'ai'; text: string }[]; state: unknown };
export type RoleReply = { say: string; action: string | null };
export type LeaderRow = { rank: number; name: string; score: number; seconds: number };

export type BridgeRequest = { id: number } & (
  | { type: 'ready' | 'getData' | 'getPlayer' | 'getLeaderboard' | 'finish' }
  | { type: 'submitScore'; score: number }
  | ({ type: 'askAI' } & AskRole)
);

export type BridgeAnswer = { id: number } & ({ ok: true; value: unknown } | { ok: false; error: string });
export type BridgeResponse = { source: 'mpme-host' } & BridgeAnswer;

export const GAME_SOURCE = 'mpme-game';
export const HOST_SOURCE = 'mpme-host';

export const LIMITS = { score: 1_000_000, ...GAME_ASK };

/** The API generated games are told about (the Game Studio's AI) and the platform implements. */
export const BRIDGE_API = `window.GameStudio (always available; every method returns a Promise):
- GameStudio.ready(): call once when the game has loaded.
- GameStudio.getData(): the game's content ({ concept, win, rounds: [{ text, answer }] }).
- GameStudio.getPlayer(): { name } (first name and initial).
- GameStudio.submitScore(score): the player's final score (a whole number from 0 to ${LIMITS.score.toLocaleString('en-US')}, higher is better; round a percentage first, a decimal is rejected). Call once.
- GameStudio.getLeaderboard(): [{ rank, name, score, seconds }] (top 10), only if the game has a leaderboard.
- GameStudio.askAI({ messages: [{ role: 'player' | 'ai', text }], state }): the AI role's reply { say, action }. Games with an AI role only. Rules (a request that breaks one is rejected with an error, so wrap every call in try/catch): the conversation starts and ends with the player (never begin with an 'ai' turn, even when you send only the last few messages); at most ${GAME_ASK.messages} messages of at most ${GAME_ASK.messageChars} characters each (a reply's say is at most that long, so it can be sent back); state is a small object of at most ${GAME_ASK.stateChars} characters as JSON describing where the player is.
- GameStudio.finish(): the player is done; the platform shows the results.`;

const SIMPLE = ['ready', 'getData', 'getPlayer', 'getLeaderboard', 'finish'] as const;

const jsonLength = (v: unknown) => { try { return JSON.stringify(v ?? null).length; } catch { return Infinity; } };
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LIMITS.score;

/** A request with a valid id that cannot be served: the game gets this as its error (never silence). */
export type BridgeRefusal = { id: number; error: string };

function parseAsk(id: number, m: Record<string, unknown>): BridgeRequest | string {
  const list = m.messages;
  if (!Array.isArray(list) || !list.length) return 'askAI needs messages: a list starting with the player';
  if (list.length > LIMITS.messages) return `askAI takes at most ${LIMITS.messages} messages: send the last ones, starting and ending with the player`;
  const messages: AskRole['messages'] = [];
  for (const x of list) {
    const row = x as { role?: unknown; text?: unknown } | null;
    if (!row || (row.role !== 'player' && row.role !== 'ai') || typeof row.text !== 'string' || !row.text.trim()) return "Each askAI message is { role: 'player' | 'ai', text } with some text";
    if (row.text.length > LIMITS.messageChars) return `An askAI message is too long (at most ${LIMITS.messageChars} characters)`;
    messages.push({ role: row.role, text: row.text });
  }
  // As the ai function: the player speaks first and last (it refuses anything else, which would spend a client ask).
  if (messages[0].role !== 'player' || messages[messages.length - 1].role !== 'player') return 'The askAI conversation must start and end with the player';
  if (jsonLength(m.state) > LIMITS.stateChars) return `The askAI state is too large (at most ${LIMITS.stateChars} characters as JSON)`;
  return { id, type: 'askAI', messages, state: m.state ?? null };
}

/** null: not from a game of ours or no usable id (dropped); a refusal: answered with ok: false. */
export function parseBridgeRequest(raw: unknown): BridgeRequest | BridgeRefusal | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.source !== GAME_SOURCE || typeof m.id !== 'number' || !Number.isInteger(m.id)) return null;
  const id = m.id;
  if ((SIMPLE as readonly unknown[]).includes(m.type)) return { id, type: m.type as (typeof SIMPLE)[number] };
  if (m.type === 'submitScore') return isScore(m.score) ? { id, type: 'submitScore', score: m.score } : { id, error: `The score must be a whole number from 0 to ${LIMITS.score.toLocaleString('en-US')}` };
  if (m.type === 'askAI') { const r = parseAsk(id, m); return typeof r === 'string' ? { id, error: r } : r; }
  return { id, error: 'Unknown request' };
}

/** What a game may show of a person: "Jan Smith" → "Jan S.". Never an email address. */
export function firstNameInitial(fullName: string): string {
  if (fullName.includes('@')) return 'Player';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Player';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
