// A static scan of an AI-built game's files for what a sealed-off game must never do (ported from GameStudio's
// _shared/codeScan.ts). A second line of defence: the frame's sandbox and content security policy already block
// network access, so the scan gives readable reasons ("contacts another website") and catches attempts to leave
// the page, which no browser policy can block.
//
// ADVISORY, NOT THE BOUNDARY: this is a regex denylist and can be bypassed (string building, aliases, other
// spellings). The boundary is the frame's sandbox (no allow-same-origin), the CSP, and the host closing the frame
// on a second load. The scan only gives creators and the AI readable reasons.

export const FILE_NAMES = ['index.html', 'game.js'];
/** Characters per file. */
export const GAME_FILE_MAX: Record<string, number> = { 'index.html': 16000, 'game.js': 32000 };

const RULES: { what: string; pattern: RegExp }[] = [
  { what: 'contacts another website', pattern: /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|RTCPeerConnection/ },
  { what: 'loads code from elsewhere', pattern: /\bimport\s*\(|importScripts|<script\b[^>]*\bsrc\s*=|<link\b|@import|<i?frame\b|<object\b|<embed\b|createElement\s*\(\s*['"`](i?frame|object|embed)['"`]/i },
  { what: 'leaves the page', pattern: /\b(window|self|globalThis|frames|top|parent|opener)\s*\.\s*open\s*\(|\[\s*['"`](location|open)['"`]\s*\]|\b(self|globalThis|frames|opener)\s*\.\s*location\b|\blocation\s*\.\s*(href\s*=(?!=)|assign\s*\(|replace\s*\()|\b(top|parent|document|window)\s*\.\s*location\s*=(?!=)|(^|[^.\w])location\s*=(?!=)|<meta\b[^>]*http-equiv|<a\b[^>]*\btarget\s*=/i },
  { what: 'submits a form', pattern: /<form\b|\.submit\s*\(|requestSubmit/i },
  { what: 'uses browser storage', pattern: /document\s*\.\s*cookie|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcaches\s*\./ },
  { what: 'runs code from text', pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bset(Timeout|Interval)\s*\(\s*['"`]/ },
];

const URL_PATTERN = /\b(https?|wss?|ftp):\/\/|(^|[\s"'(=,`])\/\/[a-z0-9-]+\.[a-z]{2,}/i;

/** The files value must be an object of text under the known names: anything else could slip past the scan. */
export function filesProblems(files: unknown): string[] {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return ['The game has no code yet'];
  const problems: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    if (!FILE_NAMES.includes(name)) problems.push(`Unexpected file ${name.slice(0, 40)}: a game has index.html and game.js only`);
    else if (typeof text !== 'string') problems.push(`${name} must be text`);
  }
  return problems;
}

/** Readable problems with a game's files; empty when the scan finds nothing. */
export function scanGameFiles(files: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  if (!files['index.html']) problems.push('The game has no index.html');
  for (const [name, text] of Object.entries(files)) {
    if (typeof text !== 'string') continue;
    const max = GAME_FILE_MAX[name];
    if (max !== undefined && text.length > max) { problems.push(`${name} is too large (over ${max} characters)`); continue; }
    for (const rule of RULES) {
      const found = text.match(rule.pattern);
      if (found) problems.push(`${name} ${rule.what} (${found[0].trim().slice(0, 40)})`);
    }
    // Matched in the raw text, comments included: no comment parser for a game to trick.
    const url = text.match(URL_PATTERN);
    if (url) problems.push(`${name} contains a web address (${url[0].trim().slice(0, 40)})`);
  }
  return problems;
}
