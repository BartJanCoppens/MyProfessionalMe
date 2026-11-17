// Who made a piece of content, in words (studios rule: "Made with AI" where AI made it, EU AI Act Art. 50, and
// "Scripted" where it did not). The one table of these labels: a studio's items (how), the Motion Studio's drawing (made)
// and a published learning (AiMadeTag) read it.
export const AI_MADE = 'Made with AI';
export const PROVENANCE = { ai: AI_MADE, scripted: 'Scripted from the bundle', csv: 'Imported from a CSV' } as const;
