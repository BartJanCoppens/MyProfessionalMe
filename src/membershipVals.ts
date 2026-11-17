// My team: the Industries & technologies chip editor for one counsellee. A change goes through Logic.persist (View as
// refuses it, and shows plain chips), then reloads that person; one change per person and audience at a time.
import { AUD_INFO } from './data';
import { setAudience } from './lib/membershipStore';
import type { Member } from './logic/team';
import type { Logic } from './model';
import { decideRow } from './teamTrjVals';

export type MembershipVm = { name: string; audiences: string[] | undefined; canEdit: boolean; toggle: (audience: string, on: boolean) => Promise<void> };

export function memberMembership(L: Logic, m: Member, reload: (userId: string) => Promise<void>): MembershipVm {
  const first = m.name.split(' ')[0];
  return {
    name: m.name, audiences: m.audiences, canEdit: !L.subject.readOnly,
    toggle: (audience, on) => decideRow(L, m.id + '|aud|' + audience, m.id, reload, () => setAudience(m.id, audience, on),
      (AUD_INFO[audience]?.name ?? audience) + (on ? ' added for ' : ' removed for ') + first)(),
  };
}
