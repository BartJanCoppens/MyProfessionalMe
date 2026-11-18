// An avatar's prepared clip on a slide (studios plan, Task 3.3), copied from Horizon's AvatarSpeaker.tsx: its still
// underneath and, while it speaks (or has finished, on its last frame), its clip over it with sound. The clip comes
// from the file's own media (a data: URL); without one it shows its still. A click starts or stops it. Conversation
// avatars (LiveAvatar) are not part of the player: cleanDeck.ts leaves them out.
import { useEffect, useReducer, useRef } from 'react';
import { describe } from './objects';
import { speechAfter } from './avatarSpeech';
import type { Speech, SpeechEvent } from './avatarSpeech';
import type { SlideObject } from './types';

const fill = { display: 'block', width: '100%', height: '100%', objectFit: 'contain' } as const;

export function AvatarStill({ o }: { o: SlideObject }) {
  const a = o.avatar!;
  return a.still ? <img src={a.still} alt={describe(o)} draggable={false} style={{ ...fill, pointerEvents: 'none' }} />
    : <div role="img" aria-label={describe(o)} style={{ ...fill, display: 'grid', placeItems: 'center', fontSize: 40, color: 'var(--s-label)', border: '2px dashed var(--s-line)', borderRadius: 12 }}>◉</div>;
}

// url: the clip (a data: URL) or null; run: a new value on each arrival at its slide, none while it is not in focus; cue: cues so far.
export function AvatarSpeaker({ o, url, run, cue }: { o: SlideObject; url: string | null; run?: string; cue: number }) {
  const [st, send] = useReducer((p: { s: Speech; n: number }, e: SpeechEvent) => {
    const s = speechAfter(p.s, e);
    return { s, n: s === 'speaking' && (p.s !== 'speaking' || e.kind === 'arrive') ? p.n + 1 : p.n };
  }, { s: 'idle' as Speech, n: 0 });
  const video = useRef<HTMLVideoElement>(null), cues = useRef(cue), speaks = o.avatar?.speaks === 'cue' ? 'cue' : 'arrival';
  useEffect(() => { send(run && url ? { kind: 'arrive', speaks } : { kind: 'leave' }); }, [run, url, speaks]);
  useEffect(() => {
    if (cue === cues.current) return;
    cues.current = cue;
    if (run) send({ kind: 'cue' });
  }, [cue, run]);
  // Each start plays the clip from its beginning; a browser that will not play it unasked leaves it waiting.
  useEffect(() => {
    const v = video.current;
    if (st.s !== 'speaking' || !v) return;
    v.currentTime = 0;
    v.play()?.catch((e: Error) => { if (e?.name !== 'AbortError') send({ kind: 'refused' }); });
  }, [st.s, st.n, url]);
  useEffect(() => {
    const v = video.current;
    if (v && (st.s === 'stopped' || st.s === 'waiting' || st.s === 'idle')) { if (!v.paused) v.pause(); v.currentTime = 0; }
  }, [st.s]);
  const shown = !!url && st.s !== 'idle', clicks = !!run && !!url;
  return (
    <div data-avatar-speech={st.s} onClick={clicks ? (e) => { e.stopPropagation(); send({ kind: 'click' }); } : undefined}
      style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: clicks ? 'auto' : 'none', cursor: clicks ? 'pointer' : undefined }}>
      <AvatarStill o={o} />
      {shown && <video ref={video} src={url!} playsInline preload="auto" onEnded={() => send({ kind: 'ended' })} aria-label={describe(o) + ' speaking'}
        style={{ position: 'absolute', inset: 0, ...fill }} />}
    </div>
  );
}
