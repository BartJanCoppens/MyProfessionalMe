// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameFrame, LEFT_MESSAGE } from './GameFrame';

afterEach(cleanup);

const FILES = { 'index.html': '<p>game</p>', 'game.js': 'GameStudio.ready();' };
const ask = (type: string, extra: object = {}) => ({ source: 'mpme-game', id: 1, type, ...extra });

function setup(props: Partial<React.ComponentProps<typeof GameFrame>> = {}) {
  const onScore = vi.fn(async () => {});
  const onFinished = vi.fn();
  let current = { files: FILES, data: { q: 1 }, runId: 'run-1' as string | null, test: false, player: 'Jan P.', onScore, leaderboard: null, askAI: null, onFinished, ...props };
  const view = render(<GameFrame {...current} />);
  let posted: ReturnType<typeof vi.spyOn>;
  const frame = () => {
    const el = view.container.querySelector('iframe') as HTMLIFrameElement;
    posted = vi.spyOn(el.contentWindow!, 'postMessage').mockImplementation(() => {});
    return el;
  };
  const iframe = frame();
  /** The game's window sends `data`; resolves to what the platform answered (undefined: nothing). */
  const send = async (data: unknown, source?: unknown, origin = 'null') => {
    const el = view.container.querySelector('iframe') as HTMLIFrameElement;
    if (!vi.isMockFunction(el.contentWindow!.postMessage)) frame();
    const spy = el.contentWindow!.postMessage as unknown as ReturnType<typeof vi.fn>;
    const before = spy.mock.calls.length;
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data, origin, source: (source ?? el.contentWindow) as Window })); await new Promise((r) => setTimeout(r, 5)); });
    return spy.mock.calls.length > before ? spy.mock.calls[spy.mock.calls.length - 1][0] : undefined;
  };
  const rerender = (next: Partial<typeof current>) => { current = { ...current, ...next }; view.rerender(<GameFrame {...current} />); };
  return { iframe, send, onScore, onFinished, posted: posted!, rerender };
}

describe('GameFrame', () => {
  it('is sealed: sandbox allow-scripts only, no allow attribute, no referrer', () => {
    const { iframe } = setup();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.hasAttribute('allow')).toBe(false);
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('srcdoc')).toContain('Content-Security-Policy');
  });

  it('answers a message from the frame’s window', async () => {
    const { send } = setup();
    expect(await send(ask('getData'))).toMatchObject({ source: 'mpme-host', id: 1, ok: true, value: { q: 1 } });
    expect(await send(ask('getPlayer'))).toMatchObject({ ok: true, value: { name: 'Jan P.' } });
  });

  it('gives no answer to a message from another window', async () => {
    const { send } = setup();
    expect(await send(ask('getData'), window)).toBeUndefined();
  });

  it('gives no answer to a message from the right window with the wrong origin', async () => {
    const { send } = setup();
    expect(await send(ask('getData'), undefined, 'https://evil.example')).toBeUndefined();
  });

  it('gives no answer to a message that does not parse', async () => {
    const { send } = setup();
    expect(await send({ source: 'mpme-game', id: 1, type: 'navigate' })).toBeUndefined();
  });

  it('shows LEFT_MESSAGE on a second load and answers nothing after', async () => {
    const { iframe, posted } = setup();
    const gameWindow = iframe.contentWindow!;
    fireEvent.load(iframe);
    expect(screen.queryByText(LEFT_MESSAGE)).toBeNull();
    fireEvent.load(iframe);
    expect(screen.getByText(LEFT_MESSAGE)).toBeTruthy();
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: ask('getData'), origin: 'null', source: gameWindow })); await new Promise((r) => setTimeout(r, 5)); });
    expect(posted).not.toHaveBeenCalled();
  });

  it('counts a load that fires right after the commit, before passive effects, as the first', async () => {
    // Outside act, passive effects run in a later task; a mutation observer fires in between, like a real first load.
    const flag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    flag.IS_REACT_ACT_ENVIRONMENT = false;
    const container = document.body.appendChild(document.createElement('div'));
    // jsdom loads a srcdoc frame by itself, later; only the loads this test fires count.
    container.addEventListener('load', (e) => { if (e.isTrusted) e.stopPropagation(); }, true);
    const root = createRoot(container);
    const seen = new MutationObserver(() => {
      const el = container.querySelector('iframe');
      if (el) { seen.disconnect(); el.dispatchEvent(new Event('load')); }
    });
    seen.observe(container, { childList: true, subtree: true });
    root.render(<GameFrame files={FILES} data={null} runId={null} test={false} player="Player" onScore={async () => {}} leaderboard={null} askAI={null} onFinished={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).not.toContain(LEFT_MESSAGE);
    container.querySelector('iframe')!.dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toContain(LEFT_MESSAGE);
    root.unmount();
    container.remove();
    flag.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('answers a second submitScore with an error', async () => {
    const { send, onScore } = setup();
    expect(await send(ask('submitScore', { score: 5 }))).toMatchObject({ ok: true, value: { saved: true } });
    expect(await send(ask('submitScore', { score: 6 }))).toMatchObject({ ok: false, error: 'The score was already submitted' });
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore).toHaveBeenCalledWith(5);
  });

  it('does not save without a run', async () => {
    const { send, onScore } = setup({ runId: null });
    expect(await send(ask('submitScore', { score: 5 }))).toMatchObject({ ok: true, value: { saved: false } });
    expect(onScore).not.toHaveBeenCalled();
  });

  it('does not save a test play, even with a run', async () => {
    const { send, onScore } = setup({ test: true });
    expect(await send(ask('submitScore', { score: 5 }))).toMatchObject({ ok: true, value: { saved: false } });
    expect(onScore).not.toHaveBeenCalled();
  });

  it('tells the game when saving failed, and does not report a finish after it', async () => {
    const { send, onFinished } = setup({ onScore: async () => { throw new Error('Offline'); } });
    expect(await send(ask('submitScore', { score: 5 }))).toMatchObject({ ok: false, error: 'Offline' });
    await send(ask('finish'));
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('reports the finish with the submitted score', async () => {
    const { send, onFinished } = setup();
    await send(ask('submitScore', { score: 9 }));
    await send(ask('finish'));
    expect(onFinished).toHaveBeenCalledWith(9);
  });

  it('refuses askAI when the game has no AI role', async () => {
    const { send } = setup();
    expect(await send(ask('askAI', { messages: [{ role: 'player', text: 'hi' }], state: {} }))).toMatchObject({ ok: false, error: 'This game has no AI role' });
  });

  it('passes askAI to the injected role and answers its reply', async () => {
    const reply = { say: 'Hello', action: null };
    const askAI = vi.fn(async () => reply);
    const { send } = setup({ askAI });
    expect(await send(ask('askAI', { messages: [{ role: 'player', text: 'hi' }], state: { s: 1 } }))).toMatchObject({ ok: true, value: reply });
    expect(askAI).toHaveBeenCalledWith({ messages: [{ role: 'player', text: 'hi' }], state: { s: 1 } });
  });

  it('shows a game only first names and initials, never an email', async () => {
    expect(await setup({ player: 'jan.peeters@firm.example' }).send(ask('getPlayer'))).toMatchObject({ value: { name: 'Player' } });
    cleanup();
    const rows = [{ rank: 1, name: 'Jan Smith', score: 9, seconds: 30 }];
    expect(await setup({ leaderboard: async () => rows }).send(ask('getLeaderboard'))).toMatchObject({ value: [{ rank: 1, name: 'Jan S.', score: 9, seconds: 30 }] });
  });

  it('limits getLeaderboard to 30 calls per run', async () => {
    const { send } = setup({ leaderboard: async () => [] });
    for (let i = 0; i < 30; i++) await send(ask('getLeaderboard'));
    expect(await send(ask('getLeaderboard'))).toMatchObject({ ok: false, error: 'Limit reached' });
  });

  it('refuses getLeaderboard without one, and answers the injected rows', async () => {
    expect(await setup().send(ask('getLeaderboard'))).toMatchObject({ ok: false, error: 'This game has no leaderboard' });
    cleanup();
    const rows = [{ rank: 1, name: 'Jan P.', score: 9, seconds: 30 }];
    expect(await setup({ leaderboard: async () => rows }).send(ask('getLeaderboard'))).toMatchObject({ ok: true, value: rows });
  });

  it('says so when there is no code', () => {
    render(<GameFrame files={null} data={null} runId={null} test={false} player="Player" onScore={async () => {}} leaderboard={null} askAI={null} onFinished={() => {}} />);
    expect(screen.getByText('This game has no code yet.')).toBeTruthy();
  });
});

describe('a new run', () => {
  it('accepts a score in a new test run, which saves nothing', async () => {
    const { send, rerender, onScore } = setup({ test: true, runId: 't1' });
    expect(await send(ask('submitScore', { score: 1 }))).toMatchObject({ ok: true, value: { saved: false } });
    rerender({ runId: 't2' });
    expect(await send(ask('submitScore', { score: 2 }))).toMatchObject({ ok: true, value: { saved: false } });
    expect(onScore).not.toHaveBeenCalled();
  });
  it('accepts a score in a preview again after the files change', async () => {
    const { send, rerender } = setup({ runId: null });
    await send(ask('submitScore', { score: 1 }));
    rerender({ files: { ...FILES, 'game.js': 'GameStudio.ready(); // edited' } });
    expect(await send(ask('submitScore', { score: 2 }))).toMatchObject({ ok: true });
  });
  it('accepts a score again', async () => {
    const { send, rerender } = setup();
    await send(ask('submitScore', { score: 1 }));
    expect(await send(ask('submitScore', { score: 2 }))).toMatchObject({ ok: false });
    rerender({ runId: 'run-2' });
    expect(await send(ask('submitScore', { score: 2 }))).toMatchObject({ ok: true });
  });
});
