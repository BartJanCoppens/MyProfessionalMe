// View-model of the credentials wallet in My profile: confirmed and waiting credentials, what the person is working toward,
// and the form for adding an external credential (it waits for the counsellor). View as shows the viewed person's wallet, read-only.
import { monthLabel, stepProofProblem, trajectoryProgress } from './logic/trajectory';
import { credentialLook, dayLabel } from './logic/trajectoryLearner';
import { addExternalCredential, removeCredential } from './lib/trajectoryStore';
import type { CredDraft } from './types';
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

export function walletVals(c: Ctx) {
  const wallet = c.creds.map((cr) => {
    const look = credentialLook(cr, c.now, c.boss), soon = look.status === 'clarification';
    return {
      id: cr.id, name: cr.name, issuer: cr.issuer, st: look.status, stLabel: look.label, bd: soon ? '#f0dca3' : '#e1e5dc', bg: soon ? '#fdf7e6' : '#fff',
      dates: 'Earned ' + dayLabel(cr.earned_on) + ' · ' + (cr.expires_on ? 'expires ' + dayLabel(cr.expires_on) : 'does not expire') + (cr.ref ? ' · no. ' + cr.ref : ''), link: cr.link,
      // One added by mistake: the owner removes it while it waits (a confirmed one stays); not in View as.
      remove: cr.status === 'waiting' && !c.ro
        ? { label: 'Remove', run: () => act(c, () => removeCredential(cr.id), 'Removed · “' + cr.name + '” is no longer in your wallet', undefined, c.me + '|cred|' + cr.id) } : null,
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
    wallet, walletWork, hasWork: walletWork.length > 0, canAddCred: !c.ro, credForm: credForm(c),
    walletLead: 'Certifications and accreditations ' + (c.ro ? 'held by ' + c.L.subject.name : 'you hold') + '. ' + (c.ro ? '' : c.boss.charAt(0).toUpperCase() + c.boss.slice(1) + ' sees them. ') + 'They never count toward readiness.',
    addCred: () => { if (!c.L.readOnly()) c.L.setState({ credForm: { ...BLANK } }); },
  };
}
