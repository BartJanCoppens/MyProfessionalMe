// A game's AI role from the platform's side (src/lib/gameRole.ts): one ask through the one AI path (use game_role), as run_id and state with the
// conversation, never a system text; the reply read as {say, action}; a failure is a failure, never another source or a scripted line.
import { describe, expect, it, vi } from 'vitest';
import { readRoleReply, roleAsker } from './gameRole';

const live = { enabled: true, live: ['game_role'] };
const req = { messages: [{ role: 'player' as const, text: 'Where were you?' }, { role: 'ai' as const, text: 'Out.' }, { role: 'player' as const, text: 'Who with?' }], state: { round: 2 } };

describe('roleAsker', () => {
  it('sends use game_role with the run, the conversation as user and assistant turns and the state as text; no system', async () => {
    const ask = vi.fn(async () => '{"say": "I signed nothing.", "action": null}');
    expect(await roleAsker('run-1', { ...live, ask })(req)).toEqual({ say: 'I signed nothing.', action: null });
    expect(ask).toHaveBeenCalledWith('game_role', { messages: [{ role: 'user', content: 'Where were you?' }, { role: 'assistant', content: 'Out.' }, { role: 'user', content: 'Who with?' }], run: { run_id: 'run-1', state: '{"round":2}' } });
    expect(Object.keys((ask.mock.calls[0] as unknown[])[1] as object)).not.toContain('system');
  });
  it('answers "not available right now" when the role is not live, without any call', async () => {
    const ask = vi.fn(async () => 'x');
    await expect(roleAsker('run-1', { enabled: true, live: [], ask })(req)).rejects.toThrow('The AI role is not available right now');
    await expect(roleAsker('run-1', { enabled: false, live: ['game_role'], ask })(req)).rejects.toThrow('The AI role is not available right now');
    expect(ask).not.toHaveBeenCalled();
  });
  it('needs a run, and says why when there is none', async () => {
    const ask = vi.fn(async () => 'x');
    await expect(roleAsker(null, { ...live, ask })(req)).rejects.toThrow(/needs a saved run/);
    expect(ask).not.toHaveBeenCalled();
  });
  it('passes on the function\'s own refusal (limit reached, finished run) as the failure, and nothing else answers', async () => {
    const ask = vi.fn(async () => { throw new Error('Daily AI limit reached (60 a day per person for this use); try again tomorrow (UTC)'); });
    await expect(roleAsker('run-1', { ...live, ask })(req)).rejects.toThrow('Daily AI limit reached (60 a day per person for this use); try again tomorrow (UTC)');
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('inside Claude Design it still goes to the function, never to window.claude', async () => {
    const design = vi.fn(async () => 'x');
    vi.stubGlobal('window', { claude: { complete: design } });
    const ask = vi.fn(async () => 'plain words');
    expect((await roleAsker('run-1', { ...live, ask })(req)).say).toBe('plain words');
    expect(design).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('readRoleReply', () => {
  it('reads {say, action}, with words around the JSON, and caps them at 1200 and 40 characters', () => {
    expect(readRoleReply('Sure: {"say": "Ask the CFO.", "action": "sighs"} done')).toEqual({ say: 'Ask the CFO.', action: 'sighs' });
    expect(readRoleReply(JSON.stringify({ say: 'x'.repeat(1300), action: 'y'.repeat(50) }))).toEqual({ say: 'x'.repeat(1200), action: 'y'.repeat(40) });
  });
  it('turns text that is not JSON into what the role says, and an empty or odd action into null', () => {
    expect(readRoleReply('I would rather not say.')).toEqual({ say: 'I would rather not say.', action: null });
    expect(readRoleReply('{"say": 3}')).toEqual({ say: '{"say": 3}', action: null });
    expect(readRoleReply('{"say": "Hm.", "action": ""}')).toEqual({ say: 'Hm.', action: null });
    expect(readRoleReply('{"say": "Hm.", "action": 5}')).toEqual({ say: 'Hm.', action: null });
    expect(readRoleReply('{"broken": ')).toEqual({ say: '{"broken":', action: null });
  });
});
