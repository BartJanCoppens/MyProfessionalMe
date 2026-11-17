// A narration's text as spoken, shared by the app (src/logic/narration.ts) and the `voice` edge function, so a marked
// sentence is spoken and timed the same way on both sides. Copied from Horizon's src/narrativeText.ts.
// The marks inside a passage's text: the talk moves to the next step here; a cue fires here.
export const NEXT_MARK = '⟨next⟩', CUE_MARK = '⟨cue⟩';
// When a mark falls in a step's audio or timing, in seconds from the step's start.
export type Mark = { kind: 'next' | 'cue'; at: number };
// The text without its marks, as a voice speaks it.
export const spoken = (t: string): string => t.split(NEXT_MARK).join(' ').split(CUE_MARK).join(' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
