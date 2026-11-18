// The stock voices and stock looks on the AI connections page (studios plan, Tasks 3.2 and 5.2): System and General Admins
// add the voices and looks creators may choose, and switch them off or on again; a voice also plays its own sample while the AI
// voice is live. Both sections have one shape (rows, an add form made of fields), so one list and one drawer show them. Writes
// go through the page's one write path (aiVals.write: one at a time, then the page and the live uses reload).
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { blankVoice, stockVoiceProblem } from './logic/ai';
import type { StockVoice, StockVoiceForm } from './logic/ai';
import { blankLook, stockLookProblem } from './logic/stockLooks';
import type { StockLookForm } from './logic/stockLooks';
import { PORTRAIT_KEYS, portraitUrl } from './reel/portraits';
import type { PortraitKey } from './reel/portraits';
import { addStockLook, addStockVoice, setStockLookActive, setStockVoiceActive } from './lib/aiStore';
import { hearStockVoice, voiceOn } from './lib/voice';

type Write = (L: Logic, fn: () => Promise<unknown>, done: string) => Promise<boolean>;
type Input = ChangeEvent<HTMLInputElement | HTMLSelectElement>;
type Option = { value: string; label: string };
export type StockField = { label: string; hint?: string; placeholder?: string; value: string; set: (e: Input) => void; options?: Option[]; preview?: { src?: string; color?: string } };
// A row of either list: a look has a thumb, a voice a sample to hear.
export type StockRow = { id: string; name: string; meta: string; active: boolean; state: string; toggleLabel: string; toggle: () => Promise<boolean>; thumb?: { src: string; color: string }; hear?: { run: () => void; busy: boolean } };
const HEX = /^#[0-9a-fA-F]{6}$/;
type Spec = Omit<StockField, 'value' | 'set'>;

async function hear(L: Logic, v: StockVoice) {
  if (L.state.voiceHearing) return;
  L.setState({ voiceHearing: v.voice_id });
  try { await new Audio(await hearStockVoice(v.voice_id)).play(); } catch (err) { L.say((err as Error).message); }
  L.setState({ voiceHearing: null });
}

// A row that is offered or not offered to creators, and the link that flips it.
function toggleRow(L: Logic, write: Write, r: { id: string; name: string; active: boolean; meta: string }, flip: (active: boolean) => Promise<unknown>) {
  return { ...r, state: r.active ? 'Offered to creators' : 'Not offered', toggleLabel: r.active ? 'Deactivate' : 'Reactivate',
    toggle: () => write(L, () => flip(!r.active), r.name + (r.active ? ' is no longer offered to creators' : ' is offered to creators again')) };
}

// An add form's fields, each writing its key of the form through `update`.
function fieldsOf<F extends object>(form: F, update: (key: string, value: string) => void, specs: [keyof F & string, Spec][]): StockField[] {
  return specs.map(([k, spec]) => ({ ...spec, value: String(form[k]), set: (e: Input) => update(k, e.target.value) }));
}

async function saveWith<F>(L: Logic, write: Write, f: F | null, problem: (f: F) => string | null, add: (f: F) => Promise<unknown>, done: string, clear: () => void) {
  if (!f) return;
  const p = problem(f); if (p) { L.say(p); return; }
  if (await write(L, () => add(f), done)) clear();
}

export function stockVoicesVals(L: Logic, write: Write) {
  // As every AI use: live in ai_live_uses() and not switched off for this session (?live=off).
  const s = L.state, live = voiceOn(L.aiOpts()), f = s.voiceForm;
  const save = () => {
    const row: StockVoiceForm | null = f && { name: f.name.trim(), voice_id: f.voice_id.trim(), language: f.language.trim(), accent: f.accent.trim() };
    return saveWith(L, write, row, stockVoiceProblem, addStockVoice, 'Added ' + row?.name + ' to the stock voices', () => L.setState({ voiceForm: null }));
  };
  const update = (k: string, v: string) => L.setState((st) => ({ voiceForm: st.voiceForm && { ...st.voiceForm, [k]: v } }));
  return {
    loading: !s.stockVoices && !s.aiError, empty: !!s.stockVoices && !s.stockVoices.length,
    note: live ? '' : 'Hear the voices once Studio voice-over is live (an ElevenLabs connection with a key, switched on)',
    rows: (s.stockVoices || []).map((v): StockRow => ({
      ...toggleRow(L, write, { id: v.id, name: v.name, active: v.active, meta: [v.language, v.accent, 'ElevenLabs id ' + v.voice_id].filter(Boolean).join(' · ') }, (a) => setStockVoiceActive(v.id, a)),
      hear: live ? { run: () => hear(L, v), busy: s.voiceHearing === v.voice_id } : undefined,
    })),
    add: () => L.setState({ voiceForm: blankVoice() }),
    form: f ? {
      title: 'Add a stock voice', subtitle: 'Only stock voices from the ElevenLabs voice library: never a copy of a colleague\'s voice.', submit: 'Add voice',
      fields: fieldsOf(f, update, [
        ['name', { label: 'Name, as a role', hint: 'A role and a description, never a person\'s name.', placeholder: 'e.g. Narrator · warm, 40s' }],
        ['voice_id', { label: 'ElevenLabs voice id', placeholder: 'from the ElevenLabs voice library' }],
        ['language', { label: 'Language', placeholder: 'e.g. en or nl-BE' }],
        ['accent', { label: 'Accent (optional)', placeholder: 'e.g. British' }],
      ]),
      save, cancel: () => L.setState({ voiceForm: null }), busy: s.aiBusy,
    } : null,
  };
}

// The looks creators may choose for a Reel or an avatar: drawn portraits only; there is no upload.
export function stockLooksVals(L: Logic, write: Write) {
  const s = L.state, f = s.lookForm;
  const save = () => {
    const row: StockLookForm | null = f && { name: f.name.trim(), portrait: f.portrait, color: f.color.trim().toLowerCase(), licence: f.licence.trim() };
    return saveWith(L, write, row, stockLookProblem, addStockLook, 'Added ' + row?.name + ' to the stock looks', () => L.setState({ lookForm: null }));
  };
  const update = (k: string, v: string) => L.setState((st) => ({ lookForm: st.lookForm && { ...st.lookForm, [k]: v } }));
  return {
    loading: !s.stockLooks && !s.aiError, empty: !!s.stockLooks && !s.stockLooks.length, note: '',
    rows: (s.stockLooks || []).map((l): StockRow => ({
      ...toggleRow(L, write, { id: l.id, name: l.name, active: l.active, meta: l.licence }, (a) => setStockLookActive(l.id, a)),
      thumb: { src: portraitUrl(l.portrait), color: l.color },
    })),
    add: () => L.setState({ lookForm: blankLook() }),
    form: f ? {
      title: 'Add a stock look', subtitle: 'Only portraits drawn in code: a colleague\'s face is never used, and there is no upload.', submit: 'Add look',
      fields: fieldsOf(f, update, [
        ['name', { label: 'Name, as a role and an age', hint: 'A role and an age, never a person\'s name.', placeholder: 'e.g. HR director · 50s' }],
        ['portrait', { label: 'Portrait', options: PORTRAIT_KEYS.map((k: PortraitKey, i) => ({ value: k, label: 'Portrait ' + (i + 1) })), preview: { src: portraitUrl(f.portrait), color: HEX.test(f.color) ? f.color : undefined } }],
        ['color', { label: 'Colour', placeholder: '#2f7fc1', preview: HEX.test(f.color) ? { color: f.color } : undefined }],
        ['licence', { label: 'Licence', hint: 'Where the picture comes from.' }],
      ]),
      save, cancel: () => L.setState({ lookForm: null }), busy: s.aiBusy,
    } : null,
  };
}
