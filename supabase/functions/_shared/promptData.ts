// Text going into and coming out of an AI request, the one copy the app (src/logic/items.ts and json.ts re-export it) and the `ai`
// function's game review share.

// A creator's, passage's or game's text inside a data block of an AI request; a marker inside it cannot close the block.
export const marked = (t: string, max = 600) => '<<<' + t.replace(/[<>]{3,}/g, ' ').slice(0, max) + '>>>';

// The JSON object in a model's reply (it may have words around it), or null when there is none or it is broken.
export function jsonObject(raw: string): unknown | null {
  try { const m = String(raw).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
