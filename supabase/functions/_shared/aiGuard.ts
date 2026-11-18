// Guard rails both AI edge functions (`ai`, `voice`) apply to what leaves them, and their one error answer. Pure, so Vitest tests them through
// src/lib/aiCore.test.ts and src/lib/voiceCore.test.ts.

// An error answer: { error } with the status.
export const fail = (status: number, error: string) => Response.json({ error }, { status });

// Per-use ceilings on one answer, for the uses that write long text (the Game Studio's files, in parts). Every other use keeps the
// default of 2048 tokens and 30 s. One call stays under the 150 s request limit of Supabase edge functions (confirm the plan's limit at deploy).
export const USE_LIMITS: Record<string, { maxTokens: number; timeoutMs: number }> = { studio_game: { maxTokens: 8000, timeoutMs: 110_000 } };

export type Provider = 'anthropic' | 'openai_compatible' | 'elevenlabs' | 'heygen' | 'other';

// Removes the key from any text that leaves a function (a provider may echo part of it in an error).
export function scrub(text: string, key: string) {
  return key && key.length >= 4 ? text.split(key).join('[key]') : text;
}
// The database (ai_count_call) refuses a call beyond the use's daily limits with this message.
export const isLimitError = (message: string | undefined) => /daily ai limit reached/i.test(message || '');
