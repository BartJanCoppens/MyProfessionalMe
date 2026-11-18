import { BRIDGE_SCRIPT } from './bridgeScript';

// The page a game runs as (ported from GameStudio's bridge/srcdoc.ts): its files inlined, the bridge before
// its code, and a content security policy that allows no network, no forms, no outside fonts or images.
// The frame's sandbox does the rest.

export type GameFiles = { 'index.html'?: string; 'game.js'?: string };

export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; webrtc 'block'";

/** Text inside <script> can't close its own element. */
const inScript = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The author's head and body content, without anything that could override the platform's policy or base URL. */
function authorParts(index: string): { head: string; body: string } {
  const strip = (s: string) => s.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
  const head = index.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const bodyMatch = index.match(/<body(?:\s[^>]*)?>([\s\S]*)<\/body>/i);
  const body = bodyMatch
    ? bodyMatch[1]
    : index.replace(/<head(?:\s[^>]*)?>[\s\S]*?<\/head>/i, '').replace(/<!doctype[^>]*>|<\/?(html|head|body)(?:\s[^>]*)?>/gi, '');
  return { head: strip(head), body: strip(body) };
}

/**
 * The full page for a game. The platform builds the document itself, so its policy is always the first
 * element of the one real <head>, before any of the author's markup.
 */
export function buildSrcdoc(files: GameFiles): string {
  const author = authorParts(files['index.html'] ?? '');
  return [
    '<!doctype html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<script>${inScript(BRIDGE_SCRIPT)}</script>`,
    author.head,
    '</head><body>',
    author.body,
    files['game.js'] ? `<script>${inScript(files['game.js'])}</script>` : '',
    '</body></html>',
  ].join('\n').replace(/^<!doctype html><html><head>\n/, '<!doctype html><html><head>');
}
