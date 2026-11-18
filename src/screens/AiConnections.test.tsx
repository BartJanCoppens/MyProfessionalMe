// @vitest-environment jsdom
// The AI connections screen over a live view-model: connections with key hints only, the key field that clears after
// saving, the uses grouped by kind with status, connection, model and on/off, the instruction-and-limit editor, and the
// stock voices (System and General Admins) with their add form, (de)activation and sample.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import * as store from '../lib/aiStore';
import * as voice from '../lib/voice';
import { cfg, generalAdmin, person, systemAdmin } from '../test/harness';
import type { AppState } from '../types';
import type { AiAdmin, StockVoice } from '../logic/ai';
import type { StockLook } from '../logic/stockLooks';
import AiConnectionsScreen from './AiConnections';

vi.mock('../lib/aiStore', () => ({
  loadAiAdmin: vi.fn(), loadLiveUses: vi.fn(async () => []), saveConnection: vi.fn(async () => 'c9'), setKey: vi.fn(async () => {}),
  deleteConnection: vi.fn(async () => {}), updateUse: vi.fn(async () => {}), testConnection: vi.fn(async () => ({ ok: true, model: 'claude-opus-5-5' })), askAi: vi.fn(),
  loadStockVoices: vi.fn(async () => []), addStockVoice: vi.fn(async () => {}), setStockVoiceActive: vi.fn(async () => {}),
  loadStockLooks: vi.fn(async () => []), addStockLook: vi.fn(async () => {}), setStockLookActive: vi.fn(async () => {}), updateStockLook: vi.fn(async () => {}),
}));
vi.mock('../lib/voice', async (orig) => ({ ...(await orig<typeof import('../lib/voice')>()), hearStockVoice: vi.fn(async () => 'data:audio/mpeg;base64,AAA') }));

const data = (): AiAdmin => ({
  connections: [{ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: null, default_model: 'claude-opus-5-5', region: 'global', key_hint: 'abcd' }],
  uses: [
    { key: 'profile_chat', label: 'Talk it through', description: 'Profile chat', place: 'My profile', kind: 'text', waiting_for: null, admins_only: false, connection_id: 'c1', model: null, enabled: true, preamble: 'Only discuss learning.', daily_limit: 50, daily_chars: null },
    { key: 'kb_answer', label: 'Test retrieval answer', description: 'Answers tests', place: 'Knowledge library', kind: 'text', waiting_for: null, admins_only: true, connection_id: null, model: null, enabled: true, preamble: '', daily_limit: 50, daily_chars: null },
    { key: 'avatar_video', label: 'Avatar video', description: 'Talking avatar', place: 'Library', kind: 'avatar', waiting_for: null, admins_only: false, connection_id: null, model: null, enabled: true, preamble: '', daily_limit: 10, daily_chars: null, daily_seconds: 1800 },
    { key: 'studio_voice', label: 'Studio voice-over', description: 'Reads narration', place: 'Create & share', kind: 'voice', waiting_for: null, admins_only: false, connection_id: null, model: null, enabled: false, preamble: '', daily_limit: 50, daily_chars: 30000 },
  ],
  usage: { uses: { profile_chat: { today: 2, week: 5 } }, top: [{ name: 'Robin Test', calls: 5 }] },
});

const VOICES: StockVoice[] = [{ id: 'v1', name: 'Narrator · warm, 40s', voice_id: 'tVoiceWarm01', language: 'en', accent: 'British', active: true }];
const LOOKS: StockLook[] = [{ id: 'l1', name: 'CFO · 40s', portrait: 'p2', color: '#2f7fc1', licence: 'Drawn in code for MyProfessionalMe · no real person · no third-party image', active: true, heygen_avatar_id: null, heygen_voice_id: null }];
let current: AppState;
function Live({ access = systemAdmin(), live = [] as string[], admin = data(), looks = LOOKS }: { access?: ReturnType<typeof systemAdmin>; live?: string[]; admin?: AiAdmin; looks?: StockLook[] }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'adminAi', aiAdmin: access.isSystem ? admin : null, stockVoices: VOICES, stockLooks: looks, aiLive: live }));
  useEffect(() => { current = st; });
  const refs = { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } };
  const conf = { ...cfg, liveAssistant: true };
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), conf, refs, access, person(), async () => {}).renderVals();
  return <>{vm.ai && <AiConnectionsScreen ai={vm.ai} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const click = async (name: string | RegExp) => { await act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[0]); }); };
const row = (key: string) => document.querySelector('[data-use="' + key + '"]') as HTMLElement;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(store.loadAiAdmin).mockResolvedValue(data()); vi.mocked(store.loadStockVoices).mockResolvedValue(VOICES); vi.mocked(store.loadStockLooks).mockResolvedValue(LOOKS); });
afterEach(cleanup);

describe('the AI connections screen', () => {
  it('lists connections with the key hint only and the uses by kind', () => {
    render(<Live />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('AI connections');
    expect(screen.getByText('Key ····abcd')).toBeTruthy();
    expect(screen.getByText('1 of 4 uses live · 1 connection')).toBeTruthy();
    expect(screen.getByText('Text and assistants')).toBeTruthy();
    expect(screen.getByText('Avatars')).toBeTruthy();
    expect(within(row('profile_chat')).getByText('Live')).toBeTruthy();
    expect(within(row('profile_chat')).getByText('2 calls today · 5 in 7 days · limit 50 a day per person')).toBeTruthy();
    expect(within(row('kb_answer')).getByText('Scripted · no connection')).toBeTruthy();
    expect(within(row('avatar_video')).getByText('Portrait only · no connection')).toBeTruthy();
    expect(within(row('avatar_video')).getByText('0 calls today · 0 in 7 days · limit 10 a day per person · 1800 seconds a day')).toBeTruthy();
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

describe('the stock looks', () => {
  it('shows each look with its drawn portrait and licence, and no upload control', () => {
    render(<Live />);
    const section = screen.getByRole('region', { name: 'Stock looks' });
    expect(within(section).getByText('CFO · 40s')).toBeTruthy();
    expect(within(section).getByAltText('Portrait of CFO · 40s')).toBeTruthy();
    expect(within(section).getByText(/Drawn in code for MyProfessionalMe/)).toBeTruthy();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
  it('lets a General Admin add a look and switch one off', async () => {
    render(<Live access={generalAdmin()} />);
    const section = screen.getByRole('region', { name: 'Stock looks' });
    await act(async () => { fireEvent.click(within(section).getByRole('button', { name: 'Deactivate' })); });
    expect(store.setStockLookActive).toHaveBeenCalledWith('l1', false);
    await click('+ Add look');
    fireEvent.change(screen.getByLabelText('Name, as a role and an age'), { target: { value: 'Auditor · 40s' } });
    fireEvent.change(screen.getByLabelText('Portrait'), { target: { value: 'p3' } });
    await click('Add look');
    expect(store.addStockLook).toHaveBeenCalledWith(expect.objectContaining({ name: 'Auditor · 40s', portrait: 'p3', color: '#2f7fc1' }));
  });
});

describe('the stock voices', () => {
  it('lists the voices with their state, and offers a sample only while the voice is live', async () => {
    const { unmount } = render(<Live />);
    const section = screen.getByRole('region', { name: 'Stock voices' });
    expect(within(section).getByText('Narrator · warm, 40s')).toBeTruthy();
    expect(within(section).getByText('en · British · ElevenLabs id tVoiceWarm01')).toBeTruthy();
    expect(within(section).getByText('Offered to creators')).toBeTruthy();
    expect(within(section).queryByRole('button', { name: 'Hear the voice' })).toBeNull();
    expect(within(section).getByText(/Hear the voices once Studio voice-over is live/)).toBeTruthy();
    unmount();
    vi.stubGlobal('Audio', vi.fn(function (this: { play: () => Promise<void> }) { this.play = async () => {}; }));
    render(<Live live={['studio_voice']} />);
    await click('Hear the voice');
    expect(voice.hearStockVoice).toHaveBeenCalledWith('tVoiceWarm01');
    vi.unstubAllGlobals();
  });
  it('adds a voice in the drawer and deactivates one', async () => {
    render(<Live />);
    await click('+ Add voice');
    fireEvent.change(screen.getByLabelText('Name, as a role'), { target: { value: 'Coach · bright, 20s' } });
    fireEvent.change(screen.getByLabelText('ElevenLabs voice id'), { target: { value: 'tVoiceBright3' } });
    await click('Add voice');
    expect(store.addStockVoice).toHaveBeenCalledWith({ name: 'Coach · bright, 20s', voice_id: 'tVoiceBright3', language: 'en', accent: '' });
    await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Stock voices' })).getByRole('button', { name: 'Deactivate' })); });
    expect(store.setStockVoiceActive).toHaveBeenCalledWith('v1', false);
  });
  it('shows a General Admin the stock voices only', () => {
    render(<Live access={generalAdmin()} />);
    expect(screen.getByRole('region', { name: 'Stock voices' })).toBeTruthy();
    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Add connection' })).toBeNull();
    expect(screen.queryByText('Text and assistants')).toBeNull();
  });
  it('edits a voice use\'s daily limits only: it has no instruction, and beyond the limit the browser voice is offered', async () => {
    render(<Live />);
    expect(within(row('studio_voice')).queryByText('No fixed instruction')).toBeNull();
    await act(async () => { fireEvent.click(within(row('studio_voice')).getByRole('button', { name: 'Daily limits' })); });
    expect(screen.queryByLabelText('Fixed instruction')).toBeNull();
    expect(screen.getByText('Beyond either limit the studios offer the browser voice, which is not saved, until tomorrow (UTC).')).toBeTruthy();
    expect(screen.queryByText(/gets the scripted reply/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Characters per person per day'), { target: { value: '12000' } });
    await click('Save');
    expect(store.updateUse).toHaveBeenCalledWith('studio_voice', { daily_limit: 50, daily_chars: 12000 });
  });
  it('edits the seconds of live video a day for an avatar use, as sessions and seconds, with no instruction', async () => {
    render(<Live />);
    await act(async () => { fireEvent.click(within(row('avatar_video')).getByRole('button', { name: 'Daily limits' })); });
    expect(screen.queryByLabelText('Fixed instruction')).toBeNull();
    expect(screen.queryByLabelText('Characters per person per day')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sessions per person per day'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Seconds a day per person'), { target: { value: '1200' } });
    await click('Save');
    expect(store.updateUse).toHaveBeenCalledWith('avatar_video', { daily_limit: 8, daily_seconds: 1200 });
  });
  it('says the HeyGen connection is the live video avatar and its key stays on the server', async () => {
    const d = data(); d.connections.push({ id: 'c3', name: 'HeyGen', provider: 'heygen', base_url: null, default_model: null, region: null, key_hint: 'wxyz' });
    render(<Live admin={d} />);
    expect(screen.getByText(/The live video avatar · the key stays on the server/)).toBeTruthy();
  });
  it('lists a look as Live video when it has a HeyGen avatar, else Portrait only; a General Admin adds one with its avatar id', async () => {
    render(<Live access={generalAdmin()} looks={[...LOOKS, { ...LOOKS[0], id: 'l2', name: 'HR director · 50s', heygen_avatar_id: '11111111-2222-4333-8444-555555555555' }]} />);
    expect(screen.getAllByText(/^Portrait only/).length).toBe(1);
    expect(screen.getAllByText(/^Live video/).length).toBe(1);
    await click('+ Add look');
    fireEvent.change(screen.getByLabelText('Name, as a role and an age'), { target: { value: 'Auditor · 40s' } });
    fireEvent.change(screen.getByLabelText('HeyGen avatar id (optional)'), { target: { value: '11111111-2222-4333-8444-555555555556' } });
    await click('Add look');
    expect(store.addStockLook).toHaveBeenCalledWith(expect.objectContaining({ name: 'Auditor · 40s', heygen_avatar_id: '11111111-2222-4333-8444-555555555556', heygen_voice_id: '' }));
  });
  it('refuses a HeyGen id that is not a uuid', async () => {
    render(<Live access={generalAdmin()} />);
    await click('+ Add look');
    fireEvent.change(screen.getByLabelText('Name, as a role and an age'), { target: { value: 'Auditor · 40s' } });
    fireEvent.change(screen.getByLabelText('HeyGen avatar id (optional)'), { target: { value: 'abc' } });
    await click('Add look');
    expect(store.addStockLook).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/HeyGen avatar id is a uuid/);
  });
  it('edits a look\'s HeyGen ids in the same drawer: only those two fields, saved as an update; empty clears live video', async () => {
    render(<Live access={generalAdmin()} />);
    await click('Edit live video');
    expect(screen.queryByLabelText('Name, as a role and an age')).toBeNull();
    fireEvent.change(screen.getByLabelText('HeyGen avatar id (optional)'), { target: { value: '11111111-2222-4333-8444-555555555555' } });
    await click('Save');
    expect(store.updateStockLook).toHaveBeenCalledWith('l1', { heygen_avatar_id: '11111111-2222-4333-8444-555555555555', heygen_voice_id: '' });
    expect(store.addStockLook).not.toHaveBeenCalled();
  });
  it('a voice needs an avatar and ids are uuids, when editing too', async () => {
    render(<Live access={generalAdmin()} />);
    await click('Edit live video');
    fireEvent.change(screen.getByLabelText('HeyGen voice id (optional)'), { target: { value: '66666666-7777-4888-8999-000000000000' } });
    await click('Save');
    expect(store.updateStockLook).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/voice goes with a HeyGen avatar/);
  });
  it('the voices have no edit', () => {
    render(<Live access={generalAdmin()} />);
    expect(screen.getAllByRole('button', { name: 'Edit live video' })).toHaveLength(1);
  });
});
