import { describe, expect, it } from 'vitest';
import { BRIDGE_SCRIPT } from './bridgeScript';

type Fake = Record<string, unknown>;
const run = (extra: Fake = {}) => {
  const fake: Fake = { addEventListener: () => {}, parent: { postMessage: () => {} }, ...extra };
  new Function('window', 'document', 'MutationObserver', BRIDGE_SCRIPT)(fake, fake.document, fake.MutationObserver);
  return fake;
};

describe('the injected bridge', () => {
  it('removes WebRTC before game code runs (the content security policy does not cover it)', () => {
    const fake = run({ RTCPeerConnection: class {}, webkitRTCPeerConnection: class {}, RTCDataChannel: class {} });
    expect(fake.RTCPeerConnection).toBeUndefined();
    expect(fake.webkitRTCPeerConnection).toBeUndefined();
    expect(fake.RTCDataChannel).toBeUndefined();
  });

  it('removes frames a game inserts', () => {
    let callback: ((records: { addedNodes: unknown[] }[]) => void) | null = null;
    const removed: string[] = [];
    run({
      document: { documentElement: {} },
      MutationObserver: class { constructor(cb: typeof callback) { callback = cb; } observe() {} },
    });
    const frame = { nodeName: 'IFRAME', remove: () => removed.push('iframe'), querySelectorAll: () => [] };
    const div = { nodeName: 'DIV', remove: () => removed.push('div'), querySelectorAll: () => [{ nodeName: 'EMBED', remove: () => removed.push('embed') }] };
    callback!([{ addedNodes: [frame, div] }]);
    expect(removed).toEqual(['iframe', 'embed']);
  });

  it('makes window.open() return null', () => expect((run().open as () => unknown)()).toBeNull());

  it('offers exactly the seven calls, frozen', () => {
    const api = run().GameStudio as object;
    expect(Object.keys(api).sort()).toEqual(['askAI', 'finish', 'getData', 'getLeaderboard', 'getPlayer', 'ready', 'submitScore']);
    expect(Object.isFrozen(api)).toBe(true);
  });

  it('posts the platform’s source name and answers only from the parent', async () => {
    const posted: unknown[] = [];
    let listener: ((e: { source: unknown; data: unknown }) => void) | null = null;
    const parent = { postMessage: (m: unknown) => posted.push(m) };
    const fake = run({ parent, addEventListener: (_: string, cb: typeof listener) => { listener = cb; } });
    const answer = (fake.GameStudio as { submitScore: (s: number) => Promise<unknown> }).submitScore(7);
    expect(posted).toEqual([{ source: 'mpme-game', id: 1, type: 'submitScore', score: 7 }]);
    listener!({ source: {}, data: { source: 'mpme-host', id: 1, ok: true, value: 'forged' } });
    listener!({ source: parent, data: { source: 'mpme-host', id: 1, ok: true, value: { saved: true } } });
    expect(await answer).toEqual({ saved: true });
  });
});
