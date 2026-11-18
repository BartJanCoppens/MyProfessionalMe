// The game rules the app and the `ai` function share (one copy, as voiceRules.ts is): the three roles the AI can play in a
// game, and the one reader of the `AI role` row. The row's first text says who the AI plays (published); its second text is
// what it knows, which only the `ai` function reads and no learner ever receives (private.game_content never copies it).
export const GAME_ROLES = ['Game master', 'Opponent', 'Suspect to question'] as const;
export const ROLE_LABEL = 'AI role';

/** The AI role row of a game's items: who it plays and what it knows (both trimmed), or null without the row. */
export function roleOf(items: readonly unknown[]): { about: string; knows: string } | null {
  const row = items.find((i) => Array.isArray(i) && i[0] === ROLE_LABEL) as unknown[] | undefined;
  return row ? { about: String(row[1] ?? '').trim(), knows: String(row[2] ?? '').trim() } : null;
}
