import { describe, expect, it } from 'vitest';
import tiny from './fixtures/tiny-game.json';
import { BRIDGE_SCRIPT } from './bridgeScript';
import { CSP, buildSrcdoc } from './srcdoc';

describe('buildSrcdoc', () => {
  it('puts the CSP meta first in head, before any style and before the bridge', () => {
    const doc = buildSrcdoc({ 'index.html': '<!doctype html><html><head><style>p{color:red}</style></head><body><p>hi</p></body></html>', 'game.js': 'GameStudio.ready();' });
    expect(doc).toMatch(/^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/);
    const csp = doc.indexOf('Content-Security-Policy');
    expect(csp).toBeLessThan(doc.indexOf('<style'));
    expect(csp).toBeLessThan(doc.indexOf(BRIDGE_SCRIPT.slice(0, 40)));
  });
  it('inlines the bridge before game.js', () => {
    const doc = buildSrcdoc({ 'index.html': '<p></p>', 'game.js': 'GameStudio.ready();' });
    expect(doc.indexOf('GameStudio.ready();')).toBeGreaterThan(doc.indexOf(BRIDGE_SCRIPT.slice(0, 40)));
  });
  it('wraps a body-only index.html in a full document', () => {
    const doc = buildSrcdoc({ 'index.html': '<p>only body</p>' });
    expect(doc).toMatch(/^<!doctype html>/i);
    expect(doc).toMatch(/<body>[\s\S]*<p>only body<\/p>[\s\S]*<\/body>/);
  });
  it('keeps a closing script tag inside game.js from ending the script early', () => {
    const doc = buildSrcdoc({ 'index.html': '<p></p>', 'game.js': 'const s = "</script><img src=x>";' });
    expect(doc).not.toContain('"</script><img');
    expect(doc).toContain('<\\/script');
  });
  it('produces no web address for the tiny game', () => expect(buildSrcdoc(tiny.files)).not.toMatch(/https?:\/\//));
});

describe('the content security policy', () => {
  it.each(["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", 'img-src data:', "webrtc 'block'"])('contains %s', (part) => expect(CSP).toContain(part));
});

describe('buildSrcdoc with hostile markup', () => {
  it('builds its own head: the platform’s is first even when <header> comes before <head>', () => {
    const doc = buildSrcdoc({ 'index.html': '<header>x</header><head><title>t</title></head><body><p>b</p></body>' });
    expect(doc.slice(0, 120)).toMatch(/^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/i);
  });
  it('removes the author’s own http-equiv metas and base tags', () => {
    const doc = buildSrcdoc({ 'index.html': '<head><meta http-equiv="refresh" content="0;url=x"><base href="x"></head><body><base href="y"></body>' });
    expect(doc).not.toMatch(/http-equiv="refresh"|<base/i);
    expect(doc.match(/http-equiv/gi)).toHaveLength(1);
  });
});
