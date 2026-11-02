// Providers per kind of use, the status of a use, and the connection form check (mirror the database rules).
import { describe, expect, it } from 'vitest';
import { answersText, blankForm, fits, formFor, formProblem, providersFor, statusOfUse } from './ai';
import type { AiConnection, AiUse } from './ai';

const conn = (over: Partial<AiConnection> = {}): AiConnection => ({ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: null, default_model: 'claude-opus-5-5', region: 'global', key_hint: 'abcd', ...over });
const aiUse = (over: Partial<AiUse> = {}): AiUse => ({ key: 'profile_chat', label: 'Talk it through', description: '', place: 'My profile', kind: 'text', waiting_for: null, admins_only: false, connection_id: 'c1', model: null, enabled: true, preamble: '', daily_limit: 50, ...over });

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
