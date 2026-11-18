// Admin: delete a trajectory nobody used (curriculum mapping). The database decides what "used" means
// (private.trajectory_in_use: ever enrolled, or a credential); here are the ask-first step and the result.
import { deleteTrajectory } from './lib/trajectoryStore';
import type { Logic } from './model';
import type { Trajectory } from './logic/trajectory';

async function remove(L: Logic, t: Trajectory) {
  L.setState({ trjDelete: null });
  if (L.readOnly()) return;
  const { error } = await deleteTrajectory(t.id);
  if (error) {
    L.setState((s) => ({ trjUsed: s.trjUsed && s.trjUsed.concat([t.id]) }));
    L.say(error);
    return;
  }
  L.setState((s) => {
    // the next one in the list; one this admin cannot see falls back to the first they can (trajectoryAdminVals)
    const left = s.trjs.filter((x) => x.id !== t.id), at = s.trjs.findIndex((x) => x.id === t.id);
    return { trjs: left, trjSel: s.trjSel === t.id ? (left[at] ?? left[at - 1] ?? left[0])?.id ?? null : s.trjSel, trjStep: null };
  });
  L.say('Deleted “' + t.name + '”');
}

export const trajectoryDeleteVals = (L: Logic, t: Trajectory) => ({
  // Unknown (the list did not load) counts as in use: the database refuses a used one anyway, but the screen must not offer it.
  canDelete: !L.subject.readOnly && L.state.trjUsed !== null && !L.state.trjUsed.includes(t.id),
  deleteAsk: L.state.trjDelete === t.id ? 'Delete “' + t.name + '”? This cannot be undone.' : '',
  askDelete: () => L.setState({ trjDelete: t.id }),
  cancelDelete: () => L.setState({ trjDelete: null }),
  confirmDelete: () => remove(L, t),
});
