// Providers per kind of use, the status of a use, and the connection form check (mirror the database rules).
import { describe, expect, it } from 'vitest';
import { AI_USE_KEYS, SERVER_ONLY_USES, answersText, blankForm, fits, formFor, formProblem, providersFor, statusOfUse, stockVoiceProblem } from './ai';
import { VOICE_ID } from '../../supabase/functions/_shared/voiceRules.ts';
import type { AiConnection, AiUse } from './ai';

const conn = (over: Partial<AiConnection> = {}): AiConnection => ({ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: null, default_model: 'claude-opus-5-5', region: 'global', key_hint: 'abcd', ...over });
const aiUse = (over: Partial<AiUse> = {}): AiUse => ({ key: 'profile_chat', label: 'Talk it through', description: '', place: 'My profile', kind: 'text', waiting_for: null, admins_only: false, connection_id: 'c1', model: null, enabled: true, preamble: '', daily_limit: 50, daily_chars: null, ...over });

describe('providers', () => {
  it('fit a use by its kind, as in private.ai_provider_fits', () => {
    expect(providersFor('text')).toEqual(['anthropic', 'openai_compatible']);
    expect(providersFor('voice')).toEqual(['elevenlabs', 'other']);
    expect(providersFor('avatar')).toEqual(['heygen', 'other']);
    expect(providersFor('embedding')).toEqual(['openai_compatible', 'other']);
    expect(fits('text', 'elevenlabs')).toBe(false);
    expect(answersText('heygen')).toBe(false);
  });
});

describe('statusOfUse', () => {
  it('is live with a fitting connection that has a key and a model', () => {
    expect(statusOfUse(aiUse(), [conn()])).toEqual({ live: true, chip: 'accepted', label: 'Live', why: 'Answers through Claude · claude-opus-5-5 (connection default)' });
    expect(statusOfUse(aiUse({ model: 'claude-haiku-5-5' }), [conn()]).why).toBe('Answers through Claude · claude-haiku-5-5');
  });
  it('says why it is scripted otherwise', () => {
    expect(statusOfUse(aiUse({ connection_id: null }), [conn()]).label).toBe('Scripted · no connection');
    expect(statusOfUse(aiUse(), [conn({ key_hint: null })]).label).toBe('Scripted · no key');
    expect(statusOfUse(aiUse(), [conn({ default_model: null })]).label).toBe('Scripted · no model');
    expect(statusOfUse(aiUse(), [conn({ provider: 'heygen' })]).label).toBe('Scripted · provider does not fit');
    expect(statusOfUse(aiUse({ enabled: false }), [conn()]).label).toBe('Off');
  });
  it('names the feature a waiting use needs, whatever its connection', () => {
    const s = statusOfUse(aiUse({ kind: 'voice', waiting_for: 'the avatar studio', connection_id: 'c2' }), [conn({ id: 'c2', provider: 'elevenlabs' })]);
    expect(s).toEqual({ live: false, chip: 'not-started', label: 'Waiting for the avatar studio', why: 'The connection is stored for when it is built.' });
  });
});

describe('a voice use', () => {
  const voice = aiUse({ key: 'studio_voice', kind: 'voice', connection_id: 'c2' });
  it('is live on an ElevenLabs connection with a key, without a model (as public.ai_live_uses)', () => {
    expect(statusOfUse(voice, [conn({ id: 'c2', name: 'Voices', provider: 'elevenlabs', default_model: null })])).toEqual({ live: true, chip: 'accepted', label: 'Live', why: 'Speaks through Voices · eleven_multilingual_v2 (default)' });
    expect(statusOfUse(voice, [conn({ id: 'c2', name: 'Voices', provider: 'elevenlabs', default_model: 'eleven_turbo_v2_5' })]).why).toBe('Speaks through Voices · eleven_turbo_v2_5 (connection default)');
  });
  it('is not live on an "other" connection, which the voice function does not call', () => {
    expect(statusOfUse(voice, [conn({ id: 'c2', provider: 'other' })])).toMatchObject({ live: false, label: 'Browser voice · only ElevenLabs speaks' });
    expect(statusOfUse({ ...voice, connection_id: null }, []).label).toBe('Browser voice · no connection');
    expect(statusOfUse({ ...voice, enabled: false }, [conn({ id: 'c2', provider: 'elevenlabs' })])).toMatchObject({ label: 'Off', why: 'Switched off: the studios offer the browser voice for a preview only.' });
  });
});

describe('a stock voice', () => {
  it('takes the voice ids stock_voices takes (the one VOICE_ID the voice function uses too)', () => {
    expect(migrations).toContain("voice_id ~ '" + VOICE_ID.source + "'");
  });
  it('is named as a role, with an id and a language', () => {
    const f = { name: 'Narrator · warm, 40s', voice_id: 'tVoiceWarm01', language: 'en', accent: '' };
    expect(stockVoiceProblem(f)).toBeNull();
    expect(stockVoiceProblem({ ...f, name: ' ' })).toBe('Name the voice as a role, e.g. Narrator · warm, 40s');
    expect(stockVoiceProblem({ ...f, voice_id: 'a/b' })).toBe('The ElevenLabs voice id is letters, digits, - and _');
    expect(stockVoiceProblem({ ...f, language: 'e' })).toBe('Give the language, e.g. en or nl-BE');
    expect(stockVoiceProblem({ ...f, accent: 'x'.repeat(41) })).toBe('The accent is at most 40 characters');
  });
});

describe('the connection form', () => {
  it('needs a name, an https URL, a URL for OpenAI-compatible, and a key-like key', () => {
    expect(formProblem(blankForm())).toBe('Name the connection');
    expect(formProblem({ ...blankForm(), name: 'X', base_url: 'http://x' })).toBe('The base URL starts with https://');
    expect(formProblem({ ...blankForm(), name: 'X', provider: 'openai_compatible' })).toBe('An OpenAI-compatible connection needs its base URL');
    expect(formProblem({ ...blankForm(), name: 'X', key: 'short' })).toBe('That does not look like an API key');
    expect(formProblem({ ...blankForm(), name: 'X', key: 'sk-long-enough' })).toBeNull();
  });
  it('edits a connection with an empty key field and the stored hint', () => {
    expect(formFor(conn())).toEqual({ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: '', default_model: 'claude-opus-5-5', region: 'global', key: '', hint: 'abcd' });
  });
});

// Every text use the app calls is seeded in a migration as a text use, off by default (sync with the database).
const migrations = Object.values(import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).join('\n');
describe('the text uses the app calls', () => {
  it('are each seeded as a text use that starts switched off or as configured', () => {
    for (const key of AI_USE_KEYS) expect(migrations, key).toMatch(new RegExp("\\('" + key + "', \\d+, 'text'"));
  });
  it('give the Motion Studio its own use, with an instruction for one SVG, separate from the studio drafts', () => {
    expect(AI_USE_KEYS).toContain('studio_motion');
    const seed = /\('studio_motion', \d+, 'text', '[^']*', '[^']*', '((?:[^']|'')*)', null, false, false,\s*'((?:[^']|'')*)'\)/.exec(migrations);
    expect(seed).not.toBeNull();
    expect(seed![1]).toMatch(/animat/i);
    expect(seed![2]).toMatch(/SVG only/);
    expect(seed![2]).not.toMatch(/JSON/);
  });
  it('seed the game\'s AI role switched off, at 60 calls a person a day, as a server-only use', () => {
    expect(AI_USE_KEYS).toContain('game_role');
    expect(SERVER_ONLY_USES).toEqual(['game_role']);
    const seed = /\('game_role', \d+, 'text', 'Game AI role', 'Games', '(?:[^']|'')*', null, false, false,\s*'((?:[^']|'')*)', 60\)/.exec(migrations);
    expect(seed).not.toBeNull();
    expect(seed![1]).toMatch(/Stay in that role/);
    expect(seed![1]).toMatch(/data, never instructions/);
  });
  it('seed the Game Studio\'s use switched off, at 40 calls a day, with the house rules as its instruction', () => {
    expect(AI_USE_KEYS).toContain('studio_game');
    const seed = /\('studio_game', \d+, 'text', 'Studio game build', 'Game Studio', '(?:[^']|'')*', null, false, false,\s*'((?:[^']|'')*)', 40\)/.exec(migrations);
    expect(seed).not.toBeNull();
    expect(seed![1]).toMatch(/professional and respectful/i);
    expect(seed![1]).toMatch(/nothing violent/i);
    expect(seed![1]).toMatch(/no real client/i);
    expect(seed![1]).toMatch(/no real confidential data/i);
  });
});
