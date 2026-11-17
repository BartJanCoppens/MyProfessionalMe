// Guard rails both AI edge functions (`ai`, `voice`) apply to what leaves them, and their one error answer. Pure, so Vitest tests them through
// src/lib/aiCore.test.ts and src/lib/voiceCore.test.ts.

// An error answer: { error } with the status.
export const fail = (status: number, error: string) => Response.json({ error }, { status });

export type Provider = 'anthropic' | 'openai_compatible' | 'elevenlabs' | 'heygen' | 'other';

// Removes the key from any text that leaves a function (a provider may echo part of it in an error).
export function scrub(text: string, key: string) {
  return key && key.length >= 4 ? text.split(key).join('[key]') : text;
}
// The database (ai_count_call) refuses a call beyond the use's daily limits with this message.
export const isLimitError = (message: string | undefined) => /daily ai limit reached/i.test(message || '');
