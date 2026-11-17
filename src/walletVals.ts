// View-model of the credentials wallet in My profile: confirmed and waiting credentials, what the person is working toward,
// the form for adding an external credential (it waits for the counsellor) and the renewal form (from 30 days before
// expiry). A superseded credential (replaced by its confirmed renewal) is hidden; a waiting renewal is not listed on its
// own: the credential it renews says so. View as shows the viewed person's wallet, read-only.
import { monthLabel, stepProofProblem, trajectoryProgress } from './logic/trajectory';
import type { Credential } from './logic/trajectory';
import { canRenew, credentialLook, dayLabel } from './logic/trajectoryLearner';
import { addExternalCredential, removeCredential, submitRenewal } from './lib/trajectoryStore';
import type { CredDraft, RenewDraft } from './types';
import { act, enrolmentOf, openTrajectory, visibleTo } from './trajectoryCtx';
import type { Ctx } from './trajectoryCtx';

let adding = false;
const BLANK: CredDraft = { name: '', issuer: '', earned: '', expires: '', link: '', ref: '' };

// The first thing wrong with the form, as the database would refuse it, or null.
function problemWith(f: CredDraft): string | null {
  if (!f.name.trim()) return 'Add the credential name';
  if (f.name.trim().length > 160) return 'The credential name is too long';
  if (!f.issuer.trim()) return 'Add who issued it';
  if (f.issuer.trim().length > 120) return 'The issuer is too long';
  if (!f.earned) return 'Add the date you earned it';
  if (!f.link.trim() && !f.ref.trim()) return 'Add a link or the certificate number';
  if (f.expires && f.expires < f.earned) return 'The expiry date is before the date you earned it';
  return stepProofProblem('check', { link: f.link, ref: f.ref });
}

function credForm(c: Ctx) {
  const f = c.L.state.credForm;
  if (!f || c.ro) return null;
  const submit = () => {
    const why = problemWith(f);
    if (why) return c.L.say(why);
    if (adding) return;
    adding = true;
    return act(c, () => addExternalCredential({ name: f.name, issuer: f.issuer, earned_on: f.earned, expires_on: f.expires || null, link: f.link, ref: f.ref }),
      'Added · ' + c.boss + ' confirms it', () => c.L.setState({ credForm: null })).finally(() => { adding = false; });
  };
  return { ...f, set: (field: keyof CredDraft, value: string) => c.L.setState((s) => ({ credForm: { ...(s.credForm ?? BLANK), [field]: value } })), submit, cancel: () => c.L.setState({ credForm: null }) };
}

// The first thing wrong with a renewal, as submit_renewal would refuse it, or null. today: yyyy-mm-dd (UTC).
function renewProblem(f: RenewDraft, external: boolean, today: string): string | null {
  if (!f.link.trim() && !f.ref.trim()) return 'Add a link or the certificate number';
  const proof = stepProofProblem('check', { link: f.link, ref: f.ref });
  if (proof) return proof;
  if (external && !f.expires) return 'Add the new expiry date';
  if (external && f.expires <= today) return 'The new expiry date must be after today';
  return null;
}

// The open renewal form, for a credential that may still be renewed; never in View as.
function renewForm(c: Ctx, renewing: Map<string, Credential>) {
  const f = c.L.state.renewForm, cr = f && c.creds.find((x) => x.id === f.id);
  if (!f || !cr || c.ro || renewing.has(cr.id) || !canRenew(cr, c.now)) return null;
  const external = !cr.trajectory_id, today = c.now.toISOString().slice(0, 10);
  const submit = () => {
    const why = renewProblem(f, external, today);
    if (why) return c.L.say(why);
    return act(c, () => submitRenewal(cr.id, { link: f.link, ref: f.ref, expires: external ? f.expires : null }),
      'Sent · ' + c.boss + ' confirms your renewal', () => c.L.setState({ renewForm: null }), c.me + '|renew|' + cr.id);
  };
  return {
    name: cr.name, hint: c.L.state.trjs.find((t) => t.id === cr.trajectory_id)?.renewal.trim() ?? '', needsExpiry: external,
    expiryNote: external ? '' : 'The new expiry date is set when ' + c.boss + ' confirms.', link: f.link, ref: f.ref, expires: f.expires,
    set: (field: 'link' | 'ref' | 'expires', value: string) => c.L.setState((s) => (s.renewForm ? { renewForm: { ...s.renewForm, [field]: value } } : {})),
    submit, cancel: () => c.L.setState({ renewForm: null }),
  };
}

const removeAction = (c: Ctx, id: string, label: string, done: string) => ({ label, run: () => act(c, () => removeCredential(id), done, undefined, c.me + '|cred|' + id) });

export function walletVals(c: Ctx) {
  const renewing = new Map(c.creds.filter((cr) => cr.status === 'waiting' && cr.renewal_of).map((cr) => [cr.renewal_of!, cr]));
  const wallet = c.creds.filter((cr) => !cr.superseded_at && !(cr.status === 'waiting' && cr.renewal_of)).map((cr) => {
    const renewal = renewing.get(cr.id), look = credentialLook(cr, c.now, c.boss, !!renewal), soon = look.status === 'clarification';
    return {
      id: cr.id, name: cr.name, issuer: cr.issuer, st: look.status, stLabel: look.label, bd: soon ? '#f0dca3' : '#e1e5dc', bg: soon ? '#fdf7e6' : '#fff',
      dates: 'Earned ' + dayLabel(cr.earned_on) + ' · ' + (cr.expires_on ? 'expires ' + dayLabel(cr.expires_on) : 'does not expire') + (cr.ref ? ' · no. ' + cr.ref : ''), link: cr.link,
      // One added by mistake, or a renewal: the owner removes it while it waits (a confirmed one stays); not in View as.
      remove: c.ro ? null : cr.status === 'waiting' ? removeAction(c, cr.id, 'Remove', 'Removed · “' + cr.name + '” is no longer in your wallet')
        : renewal ? removeAction(c, renewal.id, 'Remove renewal', 'Renewal removed · “' + cr.name + '” keeps its current dates') : null,
      renew: !c.ro && !renewal && canRenew(cr, c.now)
        ? { label: 'Renew', run: () => { if (!c.L.readOnly()) c.L.setState({ renewForm: { id: cr.id, link: '', ref: '', expires: '' } }); } } : null,
    };
  });
  const walletWork = visibleTo(c).flatMap((t) => {
    const e = enrolmentOf(c, t);
    if (!e) return [];
    const pg = trajectoryProgress(t, e, c.byId);
    return [{ id: t.id, name: t.name, barW: Math.round(pg.reqDone / Math.max(1, pg.reqN) * 100) + '%', prog: pg.reqDone + ' of ' + pg.reqN + ' required steps',
      sub: (t.credential || t.issuer) + ' · ' + (e.status === 'requested' ? 'waiting for ' + c.boss : 'expected ' + monthLabel(e.start_month + t.months)), open: () => openTrajectory(c.L, t.id, 'profile') }];
  });
  return {
    wallet, walletWork, hasWork: walletWork.length > 0, canAddCred: !c.ro, credForm: credForm(c), renewForm: renewForm(c, renewing),
    walletLead: 'Certifications and accreditations ' + (c.ro ? 'held by ' + c.L.subject.name : 'you hold') + '. ' + (c.ro ? '' : c.boss.charAt(0).toUpperCase() + c.boss.slice(1) + ' sees them. ') + 'They never count toward readiness.',
    addCred: () => { if (!c.L.readOnly()) c.L.setState({ credForm: { ...BLANK } }); },
  };
}
