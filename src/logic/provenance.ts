// Who made a piece of content, in words (studios rule: "Made with AI" where AI made it, EU AI Act Art. 50, and
// "Scripted" where it did not). The one table of these labels: a studio's items (itemsLabel), the Motion Studio's drawing
// (madeLabel) and a published learning (AiMadeTag) read it.
import type { Made } from './motionSvg';

export const AI_MADE = 'Made with AI';
export const PROVENANCE = {
  ai: AI_MADE, scripted: 'Scripted from the bundle', csv: 'Imported from a CSV', // a studio's items (DraftItems.how)
  flow: 'Scripted · boxes and arrows', layout: 'Not animated yet', // a Motion drawing made without AI, or not animated yet
} as const;
const ITEMS: readonly string[] = ['ai', 'scripted', 'csv'];
// Where a studio's items came from; nothing for items written or saved by hand.
export const itemsLabel = (how: string | undefined) => (how && ITEMS.includes(how) ? PROVENANCE[how as 'ai' | 'scripted' | 'csv'] : '');
// Who made a Motion drawing: AI, the scripted flow of boxes and arrows, or nobody yet (the layout).
export const madeLabel = (made: Made) => PROVENANCE[made === 'scripted' ? 'flow' : made];
