// How an avatar speaks while presenting (studios plan, Task 3.3), copied from Horizon's avatarSpeech.ts:
// - idle: its slide is not in focus; it shows its still picture;
// - waiting: on its cue, it shows its first frame until the cue (⟨cue⟩ in the narration, or the Cue button) or a click;
// - speaking: its clip plays, with sound;
// - stopped: a click stopped it; another click starts it from the beginning;
// - done: its clip has ended; it stays on its last frame, and a click plays it again.
export type Speech = 'idle' | 'waiting' | 'speaking' | 'stopped' | 'done';

export type SpeechEvent =
  | { kind: 'arrive'; speaks: 'arrival' | 'cue' }
  | { kind: 'cue' }
  | { kind: 'click' }
  | { kind: 'ended' }
  /** The browser would not play it (no click or key on the page yet). */
  | { kind: 'refused' }
  | { kind: 'leave' };

export function speechAfter(s: Speech, e: SpeechEvent): Speech {
  switch (e.kind) {
    case 'arrive': return e.speaks === 'cue' ? 'waiting' : 'speaking';
    case 'cue': return s === 'waiting' ? 'speaking' : s;
    case 'click': return s === 'idle' ? s : s === 'speaking' ? 'stopped' : 'speaking';
    case 'ended': return s === 'speaking' ? 'done' : s;
    case 'refused': return s === 'speaking' ? 'waiting' : s;
    case 'leave': return 'idle';
  }
}
