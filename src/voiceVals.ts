// The stock voices on the AI connections page (studios plan, Task 3.2): System and General Admins add the voices
// creators may choose, deactivate or reactivate them, and hear a voice's own sample while the AI voice is live. Writes go
// through the page's one write path (aiVals.write: one at a time, then the page and the live uses reload).
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { blankVoice, stockVoiceProblem } from './logic/ai';
import type { StockVoice, StockVoiceForm } from './logic/ai';
import { addStockVoice, setStockVoiceActive } from './lib/aiStore';
import { hearStockVoice, voiceLive } from './lib/voice';

type Write = (L: Logic, fn: () => Promise<unknown>, done: string) => Promise<boolean>;
type Field = ChangeEvent<HTMLInputElement>;

async function hear(L: Logic, v: StockVoice) {
  if (L.state.voiceHearing) return;
  L.setState({ voiceHearing: v.voice_id });
  try { await new Audio(await hearStockVoice(v.voice_id)).play(); } catch (err) { L.say((err as Error).message); }
  L.setState({ voiceHearing: null });
}

async function save(L: Logic, write: Write) {
  const f = L.state.voiceForm; if (!f) return;
  const problem = stockVoiceProblem(f); if (problem) { L.say(problem); return; }
  const row: StockVoiceForm = { name: f.name.trim(), voice_id: f.voice_id.trim(), language: f.language.trim(), accent: f.accent.trim() };
  if (await write(L, () => addStockVoice(row), 'Added ' + row.name + ' to the stock voices')) L.setState({ voiceForm: null });
}

export function stockVoicesVals(L: Logic, write: Write) {
  // As every AI use: live in ai_live_uses() and not switched off for this session (?live=off).
  const s = L.state, ai = L.aiOpts(), live = ai.enabled && voiceLive(ai.live), f = s.voiceForm;
  const set = (k: keyof StockVoiceForm) => (e: Field) => { const v = e.target.value; L.setState((st) => ({ voiceForm: st.voiceForm && { ...st.voiceForm, [k]: v } })); };
  return {
    loading: !s.stockVoices && !s.aiError, empty: !!s.stockVoices && !s.stockVoices.length,
    hearNote: live ? '' : 'Hear the voices once Studio voice-over is live (an ElevenLabs connection with a key, switched on)',
    rows: (s.stockVoices || []).map((v) => ({
      id: v.id, name: v.name, active: v.active,
      meta: [v.language, v.accent, 'ElevenLabs id ' + v.voice_id].filter(Boolean).join(' · '),
      state: v.active ? 'Offered to creators' : 'Not offered',
      toggleLabel: v.active ? 'Deactivate' : 'Reactivate',
      toggle: () => write(L, () => setStockVoiceActive(v.id, !v.active), v.name + (v.active ? ' is no longer offered to creators' : ' is offered to creators again')),
      canHear: live, hearing: s.voiceHearing === v.voice_id, hear: () => hear(L, v),
    })),
    add: () => L.setState({ voiceForm: blankVoice() }),
    form: f ? {
      name: f.name, voice_id: f.voice_id, language: f.language, accent: f.accent,
      setName: set('name'), setVoiceId: set('voice_id'), setLanguage: set('language'), setAccent: set('accent'),
      save: () => save(L, write), cancel: () => L.setState({ voiceForm: null }), busy: s.aiBusy,
    } : null,
  };
}
