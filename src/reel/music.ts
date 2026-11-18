// Background music made in code (owner default: no bundled audio, so no licence to keep): an A-minor pentatonic pattern, a note
// list the compositor plays as oscillators. Calm is one long note every 2 s, Upbeat a short one every 0.5 s. Deterministic.
export type MusicKind = 'None' | 'Calm' | 'Upbeat';
export type Note = { at: number; freq: number; dur: number };

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
const PATTERN: Record<Exclude<MusicKind, 'None'>, { every: number; dur: number; step: number }> = {
  Calm: { every: 2, dur: 1.8, step: 3 },
  Upbeat: { every: 0.5, dur: 0.4, step: 2 },
};

export function musicNotes(kind: MusicKind, seconds: number): Note[] {
  if (kind === 'None') return [];
  const { every, dur, step } = PATTERN[kind], notes: Note[] = [];
  for (let k = 0; k * every < seconds; k++) {
    const at = k * every;
    notes.push({ at, freq: SCALE[(k * step + Math.floor(k / 4)) % SCALE.length], dur: Math.min(dur, seconds - at) });
  }
  return notes;
}
