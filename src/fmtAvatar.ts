// The Avatar panel as view-model (studios plan, Task 6.6): one view for the seeded practice learnings (L38 to L41: brief, skill bars, the quiz completes them) and
// for a studio scenario (live practice), on the learner's page and as the Avatar Studio's preview (a test run on a saved draft, none on an unsaved one). A run is
// never a progress write: the learning completes by its quiz (completionVals.ts), the AI's score is advice and the counsellor's confirmation a note.
import { AVATARS } from './data';
import { liveOn } from './lib/ai';
import type { CompleteOpts } from './lib/ai';
import { endAvatarRun, sayToCharacter, scoreAvatarRun, shareAvatarRun, startAvatarRun, withdrawAvatarRun } from './lib/avatarStore';
import type { RunTarget } from './lib/runTarget';
import { liveVideoOf } from './logic/stockLooks';
import type { StockLook } from './logic/stockLooks';
import type { Item, Logic } from './model';
import type { RunDeps } from './avatar/useAvatarRun';
import { contentOf } from './fmtShared';
import type { PortraitKey } from './reel/portraits';
import type { AvatarContent, AvatarSpec } from './types';
import { LANGUAGES } from '../supabase/functions/_shared/avatarRules.ts';

type Ai = Pick<CompleteOpts, 'enabled' | 'live' | 'ask'>;
/** learningId: the learner's scenario (a real run); contributionId: a saved draft's practice (a test run); neither: an unsaved preview. looks: to know whether the look has live video. */
export type AvatarOpts = { ro: boolean; learningId: string | null; contributionId: string | null; counsellor: string; ai: Ai; looks?: StockLook[] | null };
type Skill = { name: string; w: string; val: string; color: string; tgt: string };

export const PRACTICE_NEEDS_AI = 'Practice needs AI: a System Admin switches on Avatar practice';
export const SEEDED_NOTE = 'Live practice comes with scenarios made in the Avatar Studio · the quiz below completes this learning';
export const PRIVACY_NOTE = 'Runs are private until you share one. The avatar scores the conversation; your counsellor sees scores and the transcript, never the recording.';

export const bindDeps = (ai: Ai, target: RunTarget | null): RunDeps => ({
  start: () => (target ? startAvatarRun(target) : Promise.reject(new Error('Nothing to practise on yet'))), say: (id, text) => sayToCharacter(id, text, ai),
  end: endAvatarRun, score: scoreAvatarRun, share: shareAvatarRun, withdraw: withdrawAvatarRun,
});

// The seeded learnings' best score per skill (the catalogue's own numbers, as before).
function skillsOf(a: AvatarSpec): Skill[] {
  const best = a.skills.map((_s, k) => Math.max(0, ...a.attempts.map((x) => x[1][k])));
  return a.skills.map((name, k) => ({ name, w: (best[k] / 5 * 100) + '%', val: best[k] ? best[k] + ' / 5' : '—', color: best[k] >= a.target ? '#86BC25' : '#e0a100', tgt: (a.target / 5 * 100) + '%' }));
}

const base = (o: AvatarOpts) => ({ ro: o.ro, test: !o.learningId, counsellor: o.counsellor, learningId: o.learningId, contributionId: o.contributionId });
const live = (o: AvatarOpts, id: string) => liveOn(o.ai, id);

export function seededView(a: AvatarSpec, o: AvatarOpts) {
  return { ...base(o), key: o.learningId ?? '', seeded: true as const, persona: a.persona, role: a.role, initials: a.initials, brief: a.brief, sub: 'Practice scenario · the quiz completes this learning',
    skills: skillsOf(a), points: [] as { text: string; weight: number }[], look: null as { portrait: PortraitKey; color: string } | null, opening: '', language: 'English' as keyof typeof LANGUAGES,
    scored: false, minutes: 0, conversation: false, video: false, voice: false, note: SEEDED_NOTE, deps: bindDeps(o.ai, null) };
}

export function avatarView(c: AvatarContent, o: AvatarOpts) {
  const look = o.looks?.find((l) => l.id === c.look?.id), target: RunTarget | null = o.ro ? null : o.learningId ? { learningId: o.learningId } : o.contributionId ? { contributionId: o.contributionId } : null;
  return { ...base(o), key: (o.learningId ?? o.contributionId ?? '') + (o.ro ? ':ro' : ''), seeded: false as const, persona: c.counterpart || 'The character', role: c.counterpart, initials: 'AI', brief: c.situation,
    sub: c.minutes + ' minutes · ' + c.language + ' · ' + c.difficulty + ' · ' + (look ? liveVideoOf(look) : 'Portrait only') + ' · Made with AI',
    skills: [] as Skill[], points: c.points.map((p) => ({ text: p.text, weight: p.weight })), look: c.look ? { portrait: c.look.portrait, color: c.look.color } : null, opening: c.opening,
    language: c.language, scored: c.scoring === 'AI scores, counsellor confirms', minutes: c.minutes, conversation: live(o, 'avatar_conversation'),
    video: live(o, 'avatar_video') && !!look?.heygen_avatar_id, voice: live(o, 'avatar_voice') && !!c.voice, note: '', deps: bindDeps(o.ai, target) };
}
export type AvatarVals = ReturnType<typeof seededView> | ReturnType<typeof avatarView>;

export function avatarVals(L: Logic, it: Item): AvatarVals | null {
  const o: AvatarOpts = { ro: L.subject.readOnly, learningId: it.id, contributionId: null, counsellor: L.counsellorFirst(), ai: L.aiOpts(), looks: L.state.stockLooks };
  const seeded = AVATARS[it.id], content = contentOf(it.id, 'avatar');
  return seeded ? seededView(seeded, o) : content ? avatarView(content, o) : null;
}
