// An uploaded document into the passages the Trajectory AI may cite (Phase 7): pure. The caps are the ones of
// trajectory_plan_sources in 20261118230000_trajectory_plans.sql (planSources.test.ts pins them) and of the media rules.
import { injectionFlags } from '../../supabase/functions/_shared/avatarGuard.ts';
import type { InjectionFlag } from '../../supabase/functions/_shared/avatarGuard.ts';
import { blockedTerm } from './contribution';
import { SOURCE_KINDS } from './mediaFiles';

export const SOURCE_CAPS = { bytes: SOURCE_KINDS.pdf.maxBytes, pages: 400, chars: 400_000, passages: 600, passageChars: 1200, target: 900 } as const;

// Marks kept in a source's flags beside the injection flags: the document was read only up to the pages cap, or the text caps.
export const CUT_PAGES = 'cut_pages', CUT_TEXT = 'cut_text';

// Where to cut a text longer than a passage: the last paragraph break, else sentence end, else space in the first `target`
// characters (not before half of it); else the first one up to the limit; else the limit. Paragraph breaks are '\n'.
const BOUNDARIES: RegExp[] = [/\n/g, /[.!?…](?= )/g, / /g];
function cutAt(text: string): number {
  const { target, passageChars } = SOURCE_CAPS;
  for (const re of BOUNDARIES) {
    const at = [...text.slice(0, passageChars + 1).matchAll(re)].map((m) => m.index + (re === BOUNDARIES[1] ? 1 : 0));
    const before = at.filter((i) => i >= target / 2 && i <= target).pop();
    const after = at.find((i) => i > target && i <= passageChars);
    if (before ?? after) return (before ?? after)!;
  }
  return passageChars;
}

// Paragraphs (blank-line separated) with their own whitespace collapsed, joined by '\n'.
const tidy = (page: string) => page.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

function pagePassages(page: string): string[] {
  const out: string[] = [];
  let rest = tidy(page);
  while (rest.replace(/\n/g, ' ').length > SOURCE_CAPS.passageChars) {
    const at = cutAt(rest);
    out.push(rest.slice(0, at)); rest = rest.slice(at).replace(/^[\s]+/, '');
  }
  if (rest) out.push(rest);
  return out.map((t) => t.replace(/\n/g, ' ').trim()).filter(Boolean);
}

// The passages [page, text] of the pages (page numbers from 1), stopping at the caps with cut: true. chars: the stored text.
export function toPassages(pages: string[]): { passages: [number, string][]; chars: number; cut: boolean } {
  const passages: [number, string][] = [];
  let chars = 0, full = false;
  for (let n = 0; n < Math.min(pages.length, SOURCE_CAPS.pages) && !full; n++) {
    for (const text of pagePassages(pages[n])) {
      full = passages.length >= SOURCE_CAPS.passages || chars + text.length > SOURCE_CAPS.chars;
      if (full) break;
      passages.push([n + 1, text]); chars += text.length;
    }
  }
  return { passages, chars, cut: full || pages.length > SOURCE_CAPS.pages };
}

// A client's name refuses the document; text that reads like instructions to an AI is only flagged (it is treated as data anyway).
export function scanSource(passages: [number, string][]): { refusal: string | null; flags: InjectionFlag[] } {
  const text = passages.map((p) => p[1]).join('\n');
  const term = blockedTerm(text);
  return {
    refusal: term ? `This document names a client (${term}) · upload only documents the firm may use for training` : null,
    flags: injectionFlags(text),
  };
}
