// The stock voices on the AI connections page (studios plan, Task 3.2): System and General Admins list, add, deactivate
// and reactivate the voices creators may choose, and hear a voice's sample only while the AI voice is live. A General
// Admin sees this section only. The stores are mocked; the database rules are in supabase/tests/rls.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/aiStore';
import * as voice from './lib/voice';
import { loadAiPage } from './aiVals';
import { domainAdmin, flush, generalAdmin, harness, member, stubWindow, systemAdmin } from './test/harness';
import type { AiAdmin, StockVoice } from './logic/ai';

vi.mock('./lib/aiStore', () => ({
  loadAiAdmin: vi.fn(), loadLiveUses: vi.fn(async () => []), saveConnection: vi.fn(), setKey: vi.fn(), deleteConnection: vi.fn(), updateUse: vi.fn(), testConnection: vi.fn(), askAi: vi.fn(),
  loadStockVoices: vi.fn(), addStockVoice: vi.fn(async () => {}), setStockVoiceActive: vi.fn(async () => {}),
}));
vi.mock('./lib/voice', async (orig) => ({ ...(await orig<typeof import('./lib/voice')>()), hearStockVoice: vi.fn(async () => 'data:audio/mpeg;base64,AAA') }));

const VOICES: StockVoice[] = [
  { id: 'v1', name: 'Narrator · warm, 40s', voice_id: 'tVoiceWarm01', language: 'en', accent: 'British', active: true },
  { id: 'v2', name: 'Interviewer · calm', voice_id: 'tVoiceCalm02', language: 'nl', accent: null, active: false },
];
const admin = (): AiAdmin => ({ connections: [], uses: [], usage: { uses: {}, top: [] } });
const page = (access = systemAdmin(), state = {}) => harness({ access, state: { screen: 'adminAi', aiAdmin: access.isSystem ? admin() : null, stockVoices: VOICES, ...state } });
const ev = (value: string) => ({ target: { value } }) as never;
const played = vi.fn(async () => {});

beforeEach(() => {
  stubWindow(); vi.clearAllMocks();
  vi.mocked(store.loadAiAdmin).mockResolvedValue(admin()); vi.mocked(store.loadStockVoices).mockResolvedValue(VOICES);
  vi.stubGlobal('Audio', vi.fn(function (this: { play: typeof played }) { this.play = played; }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('who manages stock voices', () => {
  it('a General Admin gets the page with the stock voices only', () => {
    const h = page(generalAdmin());
    expect(h.vm()).toMatchObject({ showAi: true, navAi: true });
    const ai = h.vm().ai!;
    expect(ai.system).toBe(false);
    expect(ai.voices.rows.map((r) => r.name)).toEqual(['Narrator · warm, 40s', 'Interviewer · calm']);
    h.L().go('map'); h.L().go('adminAi');
    expect(h.state.screen).toBe('adminAi');
  });
  it('a Domain Admin or a member does not', () => {
    for (const access of [domainAdmin(['Audit']), member()]) {
      const h = harness({ access });
      expect(h.vm().showAi).toBe(false);
      h.L().go('adminAi');
      expect(h.state.screen).toBe('map');
    }
  });
  it('loads the voices for System and General Admins, and the connections for the System Admin only', async () => {
    const ga = page(generalAdmin(), { stockVoices: null });
    expect(ga.vm().ai!.voices.loading).toBe(true);
    await loadAiPage(ga.L());
    expect(ga.state.stockVoices).toEqual(VOICES);
    expect(store.loadAiAdmin).not.toHaveBeenCalled();
    const sa = page(systemAdmin(), { stockVoices: null, aiAdmin: null });
    await loadAiPage(sa.L());
    expect(store.loadAiAdmin).toHaveBeenCalledTimes(1);
    expect(sa.state.stockVoices).toEqual(VOICES);
  });
});

describe('the stock voices', () => {
  it('show each voice as a role with its language, accent and provider id, and whether it is offered', () => {
    const [a, b] = page().vm().ai!.voices.rows;
    expect(a).toMatchObject({ name: 'Narrator · warm, 40s', meta: 'en · British · ElevenLabs id tVoiceWarm01', state: 'Offered to creators', toggleLabel: 'Deactivate' });
    expect(b).toMatchObject({ meta: 'nl · ElevenLabs id tVoiceCalm02', state: 'Not offered', toggleLabel: 'Reactivate' });
  });
  it('deactivates and reactivates a voice, then reloads', async () => {
    const h = page(generalAdmin());
    await h.vm().ai!.voices.rows[0].toggle(); await flush();
    expect(store.setStockVoiceActive).toHaveBeenCalledWith('v1', false);
    expect(h.lastToast()).toBe('Narrator · warm, 40s is no longer offered to creators');
    await h.vm().ai!.voices.rows[1].toggle(); await flush();
    expect(store.setStockVoiceActive).toHaveBeenCalledWith('v2', true);
    expect(store.loadStockVoices).toHaveBeenCalled();
  });
  it('adds a voice named as a role, with a provider id and a language, and says what is missing', async () => {
    const h = page();
    h.vm().ai!.voices.add();
    const f = () => h.vm().ai!.voices.form!;
    await f().save();
    expect(h.lastToast()).toBe('Name the voice as a role, e.g. Narrator · warm, 40s');
    f().setName(ev('Coach · bright, 20s')); f().setVoiceId(ev('bad id')); await f().save();
    expect(h.lastToast()).toBe('The ElevenLabs voice id is letters, digits, - and _');
    f().setVoiceId(ev('tVoiceBright3')); f().setLanguage(ev('fr')); f().setAccent(ev(' Parisian ')); await f().save(); await flush();
    expect(store.addStockVoice).toHaveBeenCalledWith({ name: 'Coach · bright, 20s', voice_id: 'tVoiceBright3', language: 'fr', accent: 'Parisian' });
    expect(h.state.voiceForm).toBeNull();
    expect(h.lastToast()).toBe('Added Coach · bright, 20s to the stock voices');
  });
  it('offers "Hear the voice" only while the AI voice is live, and plays the sample', async () => {
    expect(page().vm().ai!.voices.rows[0].canHear).toBe(false);
    expect(page().vm().ai!.voices.hearNote).toBe('Hear the voices once Studio voice-over is live (an ElevenLabs connection with a key, switched on)');
    const h = page(generalAdmin(), { aiLive: ['studio_voice'] });
    const row = h.vm().ai!.voices.rows[0];
    expect(row.canHear).toBe(true);
    expect(h.vm().ai!.voices.hearNote).toBe('');
    await row.hear(); await flush();
    expect(voice.hearStockVoice).toHaveBeenCalledWith('tVoiceWarm01');
    expect(played).toHaveBeenCalled();
    expect(h.state.voiceHearing).toBeNull();
  });
  it('says why a sample did not play', async () => {
    vi.mocked(voice.hearStockVoice).mockRejectedValueOnce(new Error('ElevenLabs has no sample of that voice'));
    const h = page(systemAdmin(), { aiLive: ['studio_voice'] });
    await h.vm().ai!.voices.rows[0].hear(); await flush();
    expect(h.lastToast()).toBe('ElevenLabs has no sample of that voice');
  });
});
