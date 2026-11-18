// Guard rails both AI edge functions (`ai`, `voice`) apply to what leaves them, and their one error answer. Pure, so Vitest tests them through
// src/lib/aiCore.test.ts and src/lib/voiceCore.test.ts.

// An error answer: { error } with the status.
export const fail = (status: number, error: string) => Response.json({ error }, { status });
// EU AI Act Art. 50 marking, as Taxatar's: on every answer the voice or the avatar made.
export const AI_HEADER = { 'X-AI-Generated': 'true' } as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Per-use ceilings on one answer, for the uses that write long text (the Game Studio's files, in parts). Every other use keeps the
// default of 2048 tokens and 30 s. One call stays under the 150 s request limit of Supabase edge functions (confirm the plan's limit at deploy).
export const USE_LIMITS: Record<string, { maxTokens: number; timeoutMs: number }> = { studio_game: { maxTokens: 5000, timeoutMs: 110_000 } };
// A part that times out keeps no text, so the budget per part is what one call can surely write in the time: about 5000 tokens in 110 s (measure at deploy); MAX_PARTS (src/logic/continuation.ts) times this fits a full game.js.
// Uses only the `ai` function answers, each with its own request shape (a run, not a system text): the AI role's and the character's hidden text is read
// by the database for the run. Never Claude Design, never the generic answer path (readAsk refuses them).
export const SERVER_ONLY_USES: readonly string[] = ['game_role', 'avatar_conversation'];
// Uses with no scripted answer: a reached daily limit does not fall back to a script for them (a role is AI or it is not offered).
export const NO_SCRIPT = ['studio_game', ...SERVER_ONLY_USES];

export type Provider = 'anthropic' | 'openai_compatible' | 'elevenlabs' | 'heygen' | 'other';

// Removes the key from any text that leaves a function (a provider may echo part of it in an error).
export function scrub(text: string, key: string) {
  return key && key.length >= 4 ? text.split(key).join('[key]') : text;
}
// The database (ai_count_call) refuses a call beyond the use's daily limits with this message.
export const isLimitError = (message: string | undefined) => /daily ai limit reached/i.test(message || '');
