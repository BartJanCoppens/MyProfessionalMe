// The Avatar's guards around the one provider call of the role-play path (rolePlay.ts hands `call` and `count` in, so the path stays one): the persona's ask
// and the input classifier's run in parallel, then the reply goes through the post-filter and the output classifier. A hold is recorded in `state` and the
// reply is dropped (the call answers empty text; playAvatarTurn stores the substitute line instead, never the held reply). The classifiers fail open and are
// logged without content when they do not answer (a PoC shortcut, docs/decisions.md); the patterns always run. The patterns and verdict readers are
// _shared/avatarGuard.ts. Tested in src/lib/aiAvatarTurn.test.ts.
import { inputClassifierAsk, outputClassifierAsk, postfilterReply, readInputVerdict, readOutputVerdict } from '../_shared/avatarGuard.ts';
import type { GuardCode } from '../_shared/avatarGuard.ts';
import { AVATAR_ASK } from '../_shared/avatarRules.ts';
import { inputChars } from './core.ts';
import type { Ask, Outcome } from './core.ts';

export const GUARD_TIMEOUT_MS = { input: 4000, output: 1500 };
export const OUTPUT_CLASSIFIER_MIN_CHARS = 40;
export type GuardState = { held: GuardCode | null };

/** The count with the characters of the two classifier asks a turn may add (the output one at its cap): one count covers all three calls, under the use's own limits. */
const classifierChars = (say: string) => inputChars(inputClassifierAsk(say)) + inputChars(outputClassifierAsk('x'.repeat(AVATAR_ASK.replyChars)));
export const guardedCount = (count: (chars: number) => Promise<'ok' | 'limit' | 'error'>, say: string) => (chars: number) => count(chars + classifierChars(say));

// One classifier call: its verdict, or null when it does not answer in time or at all (fail open, logged without content).
async function verdictOf(call: (ask: Ask) => Promise<Outcome>, ask: Ask, read: (raw: string) => GuardCode | null, layer: string, ms: number): Promise<GuardCode | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  const out = await Promise.race([call(ask), timeout]).finally(() => clearTimeout(timer));
  if (!out || !out.ok) { console.warn(JSON.stringify({ guard: 'classifier_unavailable', layer })); return null; }
  return read(out.text);
}

/** `call`, guarded for the learner's line `say` (sanitised): the persona and the input classifier together, then the reply's two layers. */
export function guardedCall(call: (ask: Ask) => Promise<Outcome>, say: string, state: GuardState): (ask: Ask) => Promise<Outcome> {
  return async (ask) => {
    const [persona, input] = await Promise.all([call(ask), verdictOf(call, inputClassifierAsk(say), readInputVerdict, 'input', GUARD_TIMEOUT_MS.input)]);
    const hold = (code: GuardCode): Outcome => { state.held = code; console.log(JSON.stringify({ guard: code })); return { ok: true, text: '', cut: false }; };
    if (input) return hold(input);
    if (!persona.ok || persona.cut) return persona;
    const post = postfilterReply(persona.text);
    if (post) return hold(post);
    const output = persona.text.trim().length >= OUTPUT_CLASSIFIER_MIN_CHARS ? await verdictOf(call, outputClassifierAsk(persona.text), readOutputVerdict, 'output', GUARD_TIMEOUT_MS.output) : null;
    return output ? hold(output) : persona;
  };
}
