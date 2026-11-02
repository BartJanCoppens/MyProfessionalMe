// @vitest-environment jsdom
// The AI connections screen over a live view-model: connections with key hints only, the key field that clears after
// saving, the uses grouped by kind with status, connection, model and on/off, and the instruction-and-limit editor.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import * as store from '../lib/aiStore';
import { cfg, person, systemAdmin } from '../test/harness';
import type { AppState } from '../types';
import type { AiAdmin } from '../logic/ai';
import AiConnectionsScreen from './AiConnections';

vi.mock('../lib/aiStore', () => ({
  loadAiAdmin: vi.fn(), loadLiveUses: vi.fn(async () => []), saveConnection: vi.fn(async () => 'c9'), setKey: vi.fn(async () => {}),
  deleteConnection: vi.fn(async () => {}), updateUse: vi.fn(async () => {}), testConnection: vi.fn(async () => ({ ok: true, model: 'claude-opus-5-5' })), askAi: vi.fn(),
}));

const data = (): AiAdmin => ({
  connections: [{ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: null, default_model: 'claude-opus-5-5', region: 'global', key_hint: 'abcd' }],
  uses: [
    { key: 'profile_chat', label: 'Talk it through', description: 'Profile chat', place: 'My profile', kind: 'text', waiting_for: null, admins_only: false, connection_id: 'c1', model: null, enabled: true, preamble: 'Only discuss learning.', daily_limit: 50 },
    { key: 'kb_answer', label: 'Test retrieval answer', description: 'Answers tests', place: 'Knowledge library', kind: 'text', waiting_for: null, admins_only: true, connection_id: null, model: null, enabled: true, preamble: '', daily_limit: 50 },
    { key: 'avatar_video', label: 'Avatar video', description: 'Talking avatar', place: 'Library', kind: 'avatar', waiting_for: 'the avatar studio', admins_only: false, connection_id: null, model: null, enabled: true, preamble: '', daily_limit: 50 },
  ],
  usage: { uses: { profile_chat: { today: 2, week: 5 } }, top: [{ name: 'Robin Test', calls: 5 }] },
});

let current: AppState;
function Live() {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'adminAi', aiAdmin: data() }));
  useEffect(() => { current = st; });
  const refs = { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } };
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, refs, systemAdmin(), person(), async () => {}).renderVals();
  return <>{vm.ai && <AiConnectionsScreen ai={vm.ai} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const click = async (name: string | RegExp) => { await act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[0]); }); };
const row = (key: string) => document.querySelector('[data-use="' + key + '"]') as HTMLElement;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(store.loadAiAdmin).mockResolvedValue(data()); });
afterEach(cleanup);

describe('the AI connections screen', () => {
  it('lists connections with the key hint only and the uses by kind', () => {
    render(<Live />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('AI connections');
    expect(screen.getByText('Key ····abcd')).toBeTruthy();
    expect(screen.getByText('1 of 3 uses live · 1 connection')).toBeTruthy();
    expect(screen.getByText('Text and assistants')).toBeTruthy();
    expect(screen.getByText('Avatars')).toBeTruthy();
    expect(within(row('profile_chat')).getByText('Live')).toBeTruthy();
    expect(within(row('profile_chat')).getByText('2 calls today · 5 in 7 days · limit 50 a day per person')).toBeTruthy();
    expect(within(row('kb_answer')).getByText('Scripted · no connection')).toBeTruthy();
    expect(within(row('avatar_video')).getByText('Waiting for the avatar studio')).toBeTruthy();
    expect(screen.getByText('Robin Test')).toBeTruthy();
  });
  it('adds a connection with a key in a password field that is gone after saving', async () => {
    render(<Live />);
    await click('+ Add connection');
    const key = screen.getByPlaceholderText('Paste the API key') as HTMLInputElement;
    expect(key.type).toBe('password');
    fireEvent.change(screen.getByPlaceholderText('e.g. Mistral EU'), { target: { value: 'Claude two' } });
    fireEvent.change(key, { target: { value: 'sk-ant-new-key-9876' } });
    await click('Save');
    expect(store.setKey).toHaveBeenCalledWith('c9', 'sk-ant-new-key-9876');
    expect(screen.queryByPlaceholderText('Paste the API key')).toBeNull();
    expect(current.aiForm).toBeNull();
    expect(JSON.stringify(current)).not.toContain('sk-ant-new-key-9876');
  });
  it('tests a connection', async () => {
    render(<Live />);
    await click('Test');
    expect(store.testConnection).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Connection works · claude-opus-5-5')).toBeTruthy();
  });
  it('sets the connection, model and on/off of a use', async () => {
    render(<Live />);
    await act(async () => { fireEvent.change(within(row('kb_answer')).getByLabelText('Connection for Test retrieval answer'), { target: { value: 'c1' } }); });
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { connection_id: 'c1' });
    const model = within(row('kb_answer')).getByLabelText('Model for Test retrieval answer');
    fireEvent.change(model, { target: { value: 'claude-haiku-5-5' } });
    await act(async () => { fireEvent.blur(model); });
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { model: 'claude-haiku-5-5' });
    await act(async () => { fireEvent.click(within(row('kb_answer')).getByRole('button', { name: 'Off' })); });
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { enabled: false });
  });
  it('only offers connections whose provider fits the use', () => {
    render(<Live />);
    const opts = within(within(row('avatar_video')).getByLabelText('Connection for Avatar video')).getAllByRole('option').map((o) => o.textContent);
    expect(opts).toEqual(['No connection']);
  });
  it('edits the fixed instruction and daily limit of a use', async () => {
    render(<Live />);
    expect(within(row('profile_chat')).getByText('Instruction: Only discuss learning.')).toBeTruthy();
    await act(async () => { fireEvent.click(within(row('profile_chat')).getByRole('button', { name: 'Instruction and limit' })); });
    fireEvent.change(screen.getByLabelText('Calls per person per day'), { target: { value: '10' } });
    await click('Save');
    expect(store.updateUse).toHaveBeenCalledWith('profile_chat', { preamble: 'Only discuss learning.', daily_limit: 10 });
  });
  it('removes a connection after confirming', async () => {
    render(<Live />);
    await click('Remove');
    expect(screen.getByText('Remove it and its key?')).toBeTruthy();
    await click('Remove');
    expect(store.deleteConnection).toHaveBeenCalledWith('c1');
  });
});
