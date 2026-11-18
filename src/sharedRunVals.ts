// The practice runs people shared with the signed-in person (Task 6.4): the second kind of row of "Waiting for you". The AI scored the run, the counsellor
// confirms with a note; a confirmation is a note, never completion, and a confirmed run leaves the list. Like the approvals queue, these belong to the signed-in person, whoever is being viewed.
import type { Logic } from './model';
import { confirmAvatarRun, sharedAvatarRuns, sharedRunTurns } from './lib/avatarStore';
import type { SharedRun } from './lib/avatarStore';
import { NOTE_MAX } from '../supabase/functions/_shared/avatarScore.ts';
import { fmtDate } from './logic/contribution';
import { BUSY, commentBox, first, initialsOf } from './queueHelpers';

const noteKey = (runId: string) => 'run|' + runId;

export const reloadShared = (L: Logic) => sharedAvatarRuns().then((sharedRuns) => L.setState({ sharedRuns, sharedError: null }), (err) => L.setState({ sharedError: (err as Error).message }));

async function confirm(L: Logic, r: SharedRun) {
  const key = noteKey(r.runId), note = (L.state.decideNote[key] || '').trim();
  if (note.length > NOTE_MAX) { L.say('Keep the note to ' + NOTE_MAX + ' characters'); return; }
  if (BUSY.has(key)) return;
  BUSY.add(key);
  try {
    await confirmAvatarRun(r.runId, note);
    L.setState((s) => { const { [key]: _sent, ...rest } = s.decideNote; return { decideNote: rest }; });
    L.say('Confirmed · ' + first(r.name) + ' sees your note');
    await reloadShared(L);
  } catch (err) { L.say((err as Error).message); }
  finally { BUSY.delete(key); }
}

export function sharedRunRows(L: Logic) {
  return (L.state.sharedRuns || []).map((r) => ({
    key: noteKey(r.runId), runId: r.runId, initials: initialsOf(r.name), name: r.name, sub: 'Shared ' + fmtDate(r.sharedAt),
    headline: 'Avatar practice shared · ' + r.title + ' · ' + r.score.overall + ' · ' + r.score.band, score: r.score,
    loadTurns: () => sharedRunTurns(r.runId),
    prompt: 'Confirm the AI’s reading · your note goes to ' + first(r.name), ...commentBox(L, noteKey(r.runId), NOTE_MAX), confirm: () => confirm(L, r),
  }));
}
