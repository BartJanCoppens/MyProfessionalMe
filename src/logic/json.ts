// The JSON object in a model's reply (it may have words around it), or null when there is none or it is broken.
// The one reader every AI answer goes through before its own shape is checked.
export function jsonObject(raw: string): unknown | null {
  try { const m = String(raw).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
