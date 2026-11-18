// The Avatar rules the app and the `ai` function share (one copy, as gameRules.ts is): the five character rows, the learning points, the
// limits of a run and what a reply may be. The character's last two rows, what it reveals if asked and what it hides unless probed, are read
// only by the `ai` function (the character's turn); no learner receives them (private.avatar_content never copies them).
// Learning-point weights and their equalising are ported from Taxatar's parseLearningPoints (supabase/functions/practice-chat/scoringPrompt.ts).
export const CHARACTER_LABELS = ['Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed'] as const;
export const POINT_LABEL = /^Learning point · (\d+) %$/;
export const RUN_MINUTES = [5, 10, 15] as const;
/** The learner's lines in one run, by its minutes. */
export const RUN_TURNS: Record<5 | 10 | 15, number> = { 5: 12, 10: 24, 15: 36 };
/** The codes a guard writes on a turn it held (public.avatar_add_turns takes exactly these; the guards themselves are Task 6.3). */
export const GUARD_CODES = ['empty', 'too_long', 'meta_or_injection', 'offensive', 'classifier_meta', 'classifier_injection', 'classifier_offensive',
  'out_ai_admission', 'out_meta', 'out_joke', 'out_refusal', 'out_format', 'out_classifier'] as const;
/** The minutes a run lasts are its length and this many more (public.avatar_run_context: time_up). */
export const RUN_GRACE_MINUTES = 5;
/** What a learner may say and the character may reply (characters), and the most tokens of a reply. */
export const AVATAR_ASK = { sayChars: 1000, replyChars: 1200, maxTokens: 400 };
export const LANGUAGES = { English: { code: 'en', speech: 'en-GB' }, Dutch: { code: 'nl', speech: 'nl-BE' }, French: { code: 'fr', speech: 'fr-BE' } } as const;
export const DIFFICULTIES = ['Gentle', 'Realistic', 'Tough'] as const;
export const SCORINGS = ['AI scores, counsellor confirms', 'Practice only'] as const;

type Row = [label: string, text: string, text2?: string];
const rowsOf = (items: readonly unknown[]) => items.filter((i): i is Row => Array.isArray(i));

/** The five character rows of an avatar's items, trimmed, or null while one is missing. */
export function characterOf(items: readonly unknown[]): { persona: string; situation: string; opening: string; reveals: string; hides: string } | null {
  const rows = rowsOf(items), text = (label: string) => { const r = rows.find((x) => x[0] === label); return r ? String(r[1] ?? '').trim() : null; };
  const [persona, situation, opening, reveals, hides] = CHARACTER_LABELS.map(text);
  return persona === null || situation === null || opening === null || reveals === null || hides === null ? null : { persona, situation, opening, reveals, hides };
}

/** The learning points in row order, a blank one dropped, with ids lp-1 to lp-N. Weights that do not add up to 100 are equalised. */
export function parseLearningPoints(items: readonly unknown[]): { id: string; text: string; weight: number }[] {
  const points = rowsOf(items).flatMap((r) => { const m = POINT_LABEL.exec(r[0]), text = String(r[1] ?? '').trim(); return m && text ? [{ text, weight: parseInt(m[1], 10) }] : []; })
    .map((p, k) => ({ id: 'lp-' + (k + 1), ...p }));
  return points.reduce((n, p) => n + p.weight, 0) === 100 ? points : points.map((p) => ({ ...p, weight: Math.round(100 / points.length) }));
}
