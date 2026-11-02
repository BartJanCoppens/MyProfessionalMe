// AI connections and the places AI is used: providers, which provider fits which kind of use, and the status the
// admin page shows per use. Mirrors private.ai_provider_fits() and public.ai_live_uses() in the database.

export type AiProvider = 'anthropic' | 'openai_compatible' | 'elevenlabs' | 'heygen' | 'other';
export type AiKind = 'text' | 'embedding' | 'voice' | 'avatar';
// The text uses the app calls today; each has a scripted fallback.
export type AiUseKey = 'profile_chat' | 'curriculum_copilot' | 'learners_eye' | 'kb_answer' | 'draft_outline';

export type AiConnection = { id: string; name: string; provider: AiProvider; base_url: string | null; default_model: string | null; region: string | null; key_hint: string | null; updated_at?: string };
export type AiUse = {
  key: string; label: string; description: string; place: string; kind: AiKind; waiting_for: string | null; admins_only: boolean;
  connection_id: string | null; model: string | null; enabled: boolean;
  // The fixed instruction the ai function sends first, and calls per person per day.
  preamble: string; daily_limit: number;
};
// Calls per use today and over the last 7 days (UTC), and the five heaviest users this week. No content.
export type AiUsage = { uses: Record<string, { today: number | null; week: number | null }>; top: { name: string; calls: number }[] };
export type AiAdmin = { connections: AiConnection[]; uses: AiUse[]; usage: AiUsage };
// The instruction-and-limit editor of one use.
export type AiUseEdit = { key: string; preamble: string; limit: string };
// The connection form. key is the new key typed in, never a stored one; it is cleared when the form closes.
export type AiForm = { id: string | null; name: string; provider: AiProvider; base_url: string; default_model: string; region: string; key: string; hint: string | null };

// label, what it covers, placeholder for the base URL, example model
export const PROVIDERS: Record<AiProvider, { label: string; note: string; url: string; model: string }> = {
  anthropic: { label: 'Anthropic (Claude)', note: 'Messages API. Processing is global or US only; no EU-only option on the direct API.', url: 'https://api.anthropic.com (default)', model: 'claude-opus-5-5' },
  openai_compatible: { label: 'OpenAI-compatible', note: 'Chat completions at a base URL: OpenAI, Azure OpenAI (EU regions) or EU-hosted services such as Mistral.', url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  elevenlabs: { label: 'ElevenLabs (voices)', note: 'Key stored for the voice uses; the app does not call it yet.', url: '', model: '' },
  heygen: { label: 'HeyGen (avatars)', note: 'Key stored for the avatar uses; the app does not call it yet.', url: '', model: '' },
  other: { label: 'Other', note: 'Key stored for a future use; the app does not call it.', url: '', model: '' },
};
export const PROVIDER_KEYS = Object.keys(PROVIDERS) as AiProvider[];
const FITS: Record<AiKind, AiProvider[]> = {
  text: ['anthropic', 'openai_compatible'],
  embedding: ['openai_compatible', 'other'],
  voice: ['elevenlabs', 'other'],
  avatar: ['heygen', 'other'],
};
export const KIND_LABEL: Record<AiKind, string> = { text: 'Text and assistants', embedding: 'Embeddings', voice: 'Voices', avatar: 'Avatars' };
export const KINDS = Object.keys(KIND_LABEL) as AiKind[];

export const fits = (kind: AiKind, provider: AiProvider) => FITS[kind].includes(provider);
export const providersFor = (kind: AiKind) => FITS[kind];
export const answersText = (p: AiProvider) => FITS.text.includes(p);

export type UseStatusInfo = { live: boolean; chip: 'accepted' | 'in-progress' | 'not-started' | 'clarification'; label: string; why: string };

// What a use does now. Live: the app calls it with this connection. Anything else: the app keeps its scripted reply
// (text uses) or the feature does not exist yet (waiting).
export function statusOfUse(u: AiUse, conns: AiConnection[]): UseStatusInfo {
  const c = conns.find((x) => x.id === u.connection_id) || null;
  if (u.waiting_for) return { live: false, chip: 'not-started', label: 'Waiting for ' + u.waiting_for, why: c ? 'The connection is stored for when it is built.' : 'Nothing calls it yet.' };
  if (!u.enabled) return { live: false, chip: 'not-started', label: 'Off', why: 'Switched off: the app uses its scripted reply.' };
  if (!c) return { live: false, chip: 'clarification', label: 'Scripted · no connection', why: 'Choose a connection to make it live.' };
  if (!fits(u.kind, c.provider)) return { live: false, chip: 'clarification', label: 'Scripted · provider does not fit', why: PROVIDERS[c.provider].label + ' cannot serve this use.' };
  if (!c.key_hint) return { live: false, chip: 'clarification', label: 'Scripted · no key', why: 'Store a key on ' + c.name + '.' };
  const model = u.model || c.default_model;
  if (!model) return { live: false, chip: 'clarification', label: 'Scripted · no model', why: 'Set a model here or a default model on ' + c.name + '.' };
  return { live: true, chip: 'accepted', label: 'Live', why: 'Answers through ' + c.name + ' · ' + model + (u.model ? '' : ' (connection default)') };
}

export const PREAMBLE_MAX = 4000;
// Checks the instruction and limit of a use; null when fine.
export function aiUseEditProblem(e: AiUseEdit): string | null {
  if (!/^\d{1,5}$/.test(e.limit.trim()) || Number(e.limit) > 10000) return 'The daily limit is a whole number from 0 to 10000';
  if (e.preamble.length > PREAMBLE_MAX) return 'The instruction is at most ' + PREAMBLE_MAX + ' characters';
  return null;
}

// Checks a connection form before saving; null when fine.
export function formProblem(f: AiForm): string | null {
  if (!f.name.trim()) return 'Name the connection';
  if (f.base_url.trim() && !/^https:\/\/\S+$/.test(f.base_url.trim())) return 'The base URL starts with https://';
  if (f.provider === 'openai_compatible' && !f.base_url.trim()) return 'An OpenAI-compatible connection needs its base URL';
  if (f.key && (f.key.trim().length < 8 || /\s/.test(f.key.trim()))) return 'That does not look like an API key';
  return null;
}

export const blankForm = (): AiForm => ({ id: null, name: '', provider: 'anthropic', base_url: '', default_model: '', region: '', key: '', hint: null });
export const formFor = (c: AiConnection): AiForm => ({ id: c.id, name: c.name, provider: c.provider, base_url: c.base_url || '', default_model: c.default_model || '', region: c.region || '', key: '', hint: c.key_hint });
