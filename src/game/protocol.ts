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

export const LIMITS = { score: 1_000_000, messages: 20, messageChars: 1000, stateChars: 4000 };

/** The API generated games are told about (the Game Studio's AI) and the platform implements. */
export const BRIDGE_API = `window.GameStudio (always available; every method returns a Promise):
- GameStudio.ready(): call once when the game has loaded.
- GameStudio.getData(): the game's content (the game's content: { concept, win, rounds: [{ text, answer }] }).
- GameStudio.getPlayer(): { name } (first name and initial).
- GameStudio.submitScore(score): the player's final score (a whole number from 0 to 1,000,000, higher is better). Call once.
- GameStudio.getLeaderboard(): [{ rank, name, score, seconds }] (top 10), only if the game has a leaderboard.
- GameStudio.askAI({ messages: [{ role: 'player' | 'ai', text }], state }): the AI role's reply { say, action }. state: a small object describing where the player is. Games with an AI role only.
- GameStudio.finish(): the player is done; the platform shows the results.`;

const SIMPLE = ['ready', 'getData', 'getPlayer', 'getLeaderboard', 'finish'] as const;

const jsonLength = (v: unknown) => { try { return JSON.stringify(v ?? null).length; } catch { return Infinity; } };
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LIMITS.score;

function parseAsk(id: number, m: Record<string, unknown>): BridgeRequest | null {
  const list = m.messages;
  if (!Array.isArray(list) || !list.length || list.length > LIMITS.messages) return null;
  const messages: AskRole['messages'] = [];
  for (const x of list) {
    const row = x as { role?: unknown; text?: unknown } | null;
    if (!row || (row.role !== 'player' && row.role !== 'ai') || typeof row.text !== 'string' || row.text.length > LIMITS.messageChars) return null;
    messages.push({ role: row.role, text: row.text });
  }
  if (jsonLength(m.state) > LIMITS.stateChars) return null;
  return { id, type: 'askAI', messages, state: m.state ?? null };
}

export function parseBridgeRequest(raw: unknown): BridgeRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.source !== GAME_SOURCE || typeof m.id !== 'number' || !Number.isInteger(m.id)) return null;
  const id = m.id;
  if ((SIMPLE as readonly unknown[]).includes(m.type)) return { id, type: m.type as (typeof SIMPLE)[number] };
  if (m.type === 'submitScore') return isScore(m.score) ? { id, type: 'submitScore', score: m.score } : null;
  if (m.type === 'askAI') return parseAsk(id, m);
  return null;
}

/** What a game may show of a person: "Jan Smith" → "Jan S.". Never an email address. */
export function firstNameInitial(fullName: string): string {
  if (fullName.includes('@')) return 'Player';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Player';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
