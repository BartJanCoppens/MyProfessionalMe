// AI connections view-model (Administration, System Admins only), split out of Logic.renderVals(). The data lives in
// Supabase (src/lib/aiStore.ts) and is loaded into AppState when the page opens; keys go to Vault and never come back.
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import type { Logic } from './model';
import { answersText, blankForm, fits, formFor, formProblem, KIND_LABEL, KINDS, PREAMBLE_MAX, PROVIDER_KEYS, PROVIDERS, statusOfUse, aiUseEditProblem } from './logic/ai';
import type { AiForm, AiProvider, AiUse } from './logic/ai';
import { deleteConnection, loadAiAdmin, loadLiveUses, saveConnection, setKey, testConnection, updateUse } from './lib/aiStore';

type Field = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
const times = (n: number) => n + (n === 1 ? ' call' : ' calls');

// Which uses the app may call now; everyone signed in. A failure keeps the scripted replies.
export async function refreshAiLive(L: Logic) {
  try { const live = await loadLiveUses(); L.setState({ aiLive: live }); } catch { L.setState({ aiLive: [] }); }
}

// The page's data. Only a System Admin loads it (RLS returns nothing to anyone else).
export async function loadAiPage(L: Logic) {
  if (!L.access.isSystem) return;
  try { const d = await loadAiAdmin(); L.setState({ aiAdmin: d, aiError: null }); } catch (err) { L.setState({ aiError: (err as Error).message }); }
}

// One write at a time; afterwards the page and the live list reload, so labels everywhere follow at once.
async function write(L: Logic, fn: () => Promise<unknown>, done: string) {
  if (L.state.aiBusy) return false;
  L.setState({ aiBusy: true });
  let ok = true;
  try { await fn(); L.say(done); } catch (err) { ok = false; L.say((err as Error).message); }
  await Promise.all([loadAiPage(L), refreshAiLive(L)]);
  L.setState({ aiBusy: false });
  return ok;
}

async function saveForm(L: Logic) {
  const f = L.state.aiForm; if (!f) return;
  const problem = formProblem(f); if (problem) { L.say(problem); return; }
  await write(L, async () => {
    const id = await saveConnection(f);
    // Saved: a retry after a failed key edits this connection instead of adding a second one.
    L.setState((s) => ({ aiForm: s.aiForm && { ...s.aiForm, id } }));
    if (f.key.trim()) await setKey(id, f.key);
    L.setState({ aiForm: null });
  }, (f.id ? 'Saved ' : 'Added ') + f.name.trim() + (f.key.trim() ? ' · key stored in the vault' : ''));
}

async function saveUseEdit(L: Logic) {
  const e = L.state.aiUseEdit; if (!e) return;
  const problem = aiUseEditProblem(e); if (problem) { L.say(problem); return; }
  const label = L.state.aiAdmin?.uses.find((u) => u.key === e.key)?.label || e.key;
  if (await write(L, () => updateUse(e.key, { preamble: e.preamble.trim(), daily_limit: Number(e.limit) }), label + ' · instruction and daily limit saved')) L.setState({ aiUseEdit: null });
}

async function test(L: Logic, id: string) {
  L.setState((s) => ({ aiTests: { ...s.aiTests, [id]: { ok: null, text: 'Testing' } } }));
  let r: { ok: boolean; text: string };
  try { const out = await testConnection(id); r = out.ok ? { ok: true, text: 'Connection works · ' + out.model } : { ok: false, text: out.error || 'The test failed' }; }
  catch (err) { r = { ok: false, text: (err as Error).message }; }
  L.setState((s) => ({ aiTests: { ...s.aiTests, [id]: r } }));
}

export function aiVals(L: Logic) {
  const s = L.state;
  return { navAi: s.screen === 'adminAi', goAi: () => L.go('adminAi'), showAi: L.access.isSystem, ai: s.screen === 'adminAi' && L.access.isSystem ? aiScreen(L) : null };
}

function aiScreen(L: Logic) {
  const s = L.state, a = s.aiAdmin, conns = a?.connections || [], uses = a?.uses || [], usage = a?.usage || { uses: {}, top: [] };
  const status = (u: AiUse) => statusOfUse(u, conns);
  const live = uses.filter((u) => status(u).live);
  const f = s.aiForm;
  const set = (k: keyof AiForm) => (e: Field) => { const v = e.target.value; L.setState((st) => ({ aiForm: st.aiForm && { ...st.aiForm, [k]: v } })); };
  const p = f ? PROVIDERS[f.provider] : null;

  const connections = conns.map((c) => {
    const usedBy = uses.filter((u) => u.connection_id === c.id).map((u) => u.label);
    const t = s.aiTests[c.id];
    return {
      id: c.id, name: c.name, provider: PROVIDERS[c.provider].label,
      meta: [c.base_url || (c.provider === 'anthropic' ? 'api.anthropic.com' : ''), c.default_model ? 'default model ' + c.default_model : 'no default model', c.region || ''].filter(Boolean).join(' · '),
      keyLabel: c.key_hint ? 'Key ····' + c.key_hint : 'No key stored', hasKey: !!c.key_hint,
      usedBy: usedBy.length ? 'Serves ' + usedBy.join(', ') : 'Serves no use yet',
      canTest: answersText(c.provider) && !!c.key_hint, testNote: answersText(c.provider) ? (c.key_hint ? '' : 'Store a key to test it') : 'Stored for later · the app does not call it yet',
      testing: t?.ok === null, testText: t ? t.text : '', testTone: !t || t.ok === null ? 'neutral' : t.ok ? 'green' : 'orange',
      test: () => test(L, c.id),
      edit: () => L.setState({ aiForm: formFor(c) }),
      confirming: s.aiConfirm === c.id,
      remove: () => L.setState({ aiConfirm: c.id }),
      cancelRemove: () => L.setState({ aiConfirm: null }),
      confirmRemove: () => { L.setState({ aiConfirm: null }); write(L, () => deleteConnection(c.id), 'Removed ' + c.name + ' and its key' + (usedBy.length ? ' · ' + usedBy.join(', ') + ' now use the scripted reply' : '')); },
    };
  });

  const groups = KINDS.map((kind) => ({
    kind, label: KIND_LABEL[kind],
    uses: uses.filter((u) => u.kind === kind).map((u) => {
      const st = status(u), c = conns.find((x) => x.id === u.connection_id);
      return {
        key: u.key, label: u.label, place: u.place, description: u.description, adminsOnly: u.admins_only ? 'Admins only' : '',
        status: st.chip, statusLabel: st.label, why: st.why, waiting: !!u.waiting_for,
        connOptions: [{ value: '', label: 'No connection' }].concat(conns.filter((x) => fits(kind, x.provider)).map((x) => ({ value: x.id, label: x.name + (x.key_hint ? '' : ' (no key)') }))),
        connValue: u.connection_id || '',
        setConn: (e: Field) => { const v = e.target.value || null; write(L, () => updateUse(u.key, { connection_id: v }), u.label + (v ? ' · uses ' + (conns.find((x) => x.id === v)?.name || 'the connection') : ' · no connection')); },
        // Uncontrolled: the field keeps what is typed and saves when it loses focus or on Enter.
        model: u.model || '', modelKey: u.key + '|' + (u.model || ''), modelPlaceholder: c?.default_model ? c.default_model + ' (default)' : 'model id',
        saveModel: (e: FocusEvent<HTMLInputElement>) => {
          const v = e.target.value.trim() || null; if (v === (u.model || null)) return;
          write(L, () => updateUse(u.key, { model: v }), u.label + ' · ' + (v ? 'model ' + v : 'connection default model'));
        },
        modelKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); },
        enabled: u.enabled, toggle: () => write(L, () => updateUse(u.key, { enabled: !u.enabled }), u.label + (u.enabled ? ' switched off' : ' switched on')),
        usageLine: u.waiting_for ? '' : times(usage.uses[u.key]?.today || 0) + ' today · ' + (usage.uses[u.key]?.week || 0) + ' in 7 days · limit ' + u.daily_limit + ' a day per person',
        instruction: u.preamble ? 'Instruction: ' + (u.preamble.length > 90 ? u.preamble.slice(0, 88) + '…' : u.preamble) : 'No fixed instruction',
        editInstruction: () => L.setState({ aiUseEdit: { key: u.key, preamble: u.preamble, limit: String(u.daily_limit) } }),
      };
    }),
  })).filter((g) => g.uses.length);

  return {
    lead: 'Store the API keys of the AI providers and choose which connection serves each place the app uses AI. Keys go into the Supabase vault: nobody can read them back, only their last four characters. A use that is not live keeps its scripted reply, labelled as scripted.',
    loading: !a && !s.aiError, error: s.aiError, retry: () => { L.setState({ aiError: null }); loadAiPage(L); }, busy: s.aiBusy,
    summary: a ? live.length + ' of ' + uses.length + ' uses live · ' + conns.length + ' connection' + (conns.length === 1 ? '' : 's') : '',
    designNote: typeof window !== 'undefined' && window.claude?.complete ? 'Inside Claude Design its own model answers first; these settings apply everywhere else.' : '',
    connections, noConnections: !!a && !conns.length,
    addConnection: () => L.setState({ aiForm: blankForm() }),
    groups,
    usageTop: usage.top.map((x) => ({ name: x.name, calls: times(x.calls) })), usageNote: 'Calls in the last 7 days (UTC), all uses. Messages and replies are never stored.',
    useEdit: s.aiUseEdit ? {
      title: (uses.find((u) => u.key === s.aiUseEdit!.key)?.label || '') + ' · instruction and limit',
      preamble: s.aiUseEdit.preamble, limit: s.aiUseEdit.limit, count: s.aiUseEdit.preamble.length + ' of ' + PREAMBLE_MAX + ' characters',
      setPreamble: (e: Field) => { const v = e.target.value; L.setState((st) => ({ aiUseEdit: st.aiUseEdit && { ...st.aiUseEdit, preamble: v } })); },
      setLimit: (e: Field) => { const v = e.target.value; L.setState((st) => ({ aiUseEdit: st.aiUseEdit && { ...st.aiUseEdit, limit: v } })); },
      save: () => saveUseEdit(L), cancel: () => L.setState({ aiUseEdit: null }), busy: s.aiBusy,
    } : null,
    form: f && p ? {
      title: f.id ? 'Edit ' + (f.name || 'connection') : 'Add a connection',
      name: f.name, provider: f.provider, base_url: f.base_url, default_model: f.default_model, region: f.region, key: f.key,
      setName: set('name'), setUrl: set('base_url'), setModel: set('default_model'), setRegion: set('region'), setKey: set('key'),
      setProvider: (e: Field) => { const v = e.target.value as AiProvider; L.setState((st) => ({ aiForm: st.aiForm && { ...st.aiForm, provider: v } })); },
      providerOptions: PROVIDER_KEYS.map((k) => ({ value: k, label: PROVIDERS[k].label })), providerNote: p.note,
      urlLabel: f.provider === 'openai_compatible' ? 'Base URL' : 'Base URL (optional)', urlPlaceholder: p.url || 'https://…',
      modelPlaceholder: p.model ? 'e.g. ' + p.model : 'optional',
      keyLabel: f.hint ? 'Replace the key (stored key ends ····' + f.hint + ')' : 'API key',
      keyHint: 'Stored in the vault when you save; this field then clears. Leave it empty to keep the stored key.',
      save: () => saveForm(L), cancel: () => L.setState({ aiForm: null }), busy: s.aiBusy,
    } : null,
  };
}
