// Whether a text learners read repeats what an author keeps back (the Game's AI role knows, the Avatar's Reveals and Hides): the one rule, repeated by
// private.text_echoes. Case-insensitive (JavaScript's toLowerCase and Postgres' lower() can differ for a few Unicode letters, decisions.md; JavaScript counts UTF-16
// units and Postgres characters, so an emoji counts for two here). A hidden text shorter than ECHO_MIN is too common to look for. `whole`: the hidden text as a
// whole is inside the shown one (the Game). Otherwise any part of it of ECHO_WINDOW characters is (the Avatar), or all of it when it is shorter than that.
export const ECHO_MIN = 12;
export const ECHO_WINDOW = 24;

export function textEchoes(hidden: string, shown: string, whole: boolean): boolean {
  const h = hidden.toLowerCase(), t = shown.toLowerCase(), size = whole ? h.length : Math.min(ECHO_WINDOW, h.length);
  if (h.length < ECHO_MIN) return false;
  for (let i = 0; i + size <= h.length; i++) if (t.includes(h.slice(i, i + size))) return true;
  return false;
}
