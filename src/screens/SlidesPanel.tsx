// A deck's panel (studios plan, Task 3.4), for the learner on the detail page, as the Slides Studio's preview and, read only, for
// the author and reviewers (studioPreviews.tsx): one slide at a time on the shared step player (Horizon plays its narration on the
// same one), each slide's stored audio played with it (a signed link per file, mediaStore), or the words at a reading pace when
// there is no voice. The bullets build in at the talk-over's ⟨cue⟩ marks; "Calm" fades between slides, "Slide in" slides the
// next one in with Horizon's easing, and with motion off both are a fade. Playing the last slide to its end is told once. It reads
// the view-model (fmtSlides.ts); the step player keeps the slide it is on.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SlidesView } from '../fmtSlides';
import { FADE_IN, FLIGHT_EASING } from '../horizon/motion';
import { PACE, narrationSteps, spoken } from '../logic/narration';
import type { NarrationPart } from '../logic/narration';
import SafeSvg from './SafeSvg';
import StepPlayer from './StepPlayer';
import { AudioGate } from './AudioGate';
import type { StepAt } from './StepPlayer';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const FLY_SECONDS = 0.9;

export default function SlidesPanel({ sl }: { sl: SlidesView }) {
  return (
    <AudioGate title="Play the deck" subtitle={sl.sub} note={sl.note} paths={sl.paths} loading="Loading the voice-over" failed="The voice-over could not be opened">
      {(urls) => <Deck sl={sl} urls={urls} />}
    </AudioGate>
  );
}

function Deck({ sl, urls }: { sl: SlidesView; urls: string[] }) {
  // One step per slide (its index is the step's part), timed by its audio or by its words at the reading pace.
  const steps = useMemo(() => narrationSteps(sl.slides.map((s, k): NarrationPart => ({ part: String(k), text: s.narration,
    audio: s.audio && urls[k] ? { url: urls[k], seconds: s.audio.seconds, marks: s.audio.marks } : null })), sl.voiced ? 'voice' : 'own', PACE).steps, [sl, urls]);
  return <StepPlayer steps={steps} note={sl.way} onEnd={sl.onEnd}>{(at) => <Slide sl={sl} at={at} />}</StepPlayer>;
}

// What a slide shows as it moves in: the fade, or the flight with Horizon's easing (never with motion off).
const arrival = (sl: SlidesView): string | undefined => (sl.transitions === 'Slide in' && !sl.still ? 'pmFlyIn ' + FLY_SECONDS + 's ' + FLIGHT_EASING : FADE_IN);

function Slide({ sl, at }: { sl: SlidesView; at: StepAt }) {
  const s = sl.slides[+at.step.part], firm = sl.template === 'Firm template';
  // A talk-over with cues builds its bullets in, one per cue; without cues all of them show.
  const cues = at.step.marks.some((m) => m.kind === 'cue'), shown = cues ? 1 + at.marks.filter((m) => m.kind === 'cue').length : s.bullets.length;
  return (
    <div>
      <div key={at.index} data-testid="slide" data-template={sl.template} style={{ animation: at.index ? arrival(sl) : undefined, border: '1px solid #e1e5dc', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        {firm && <div aria-hidden="true" style={{ height: 6, background: '#86BC25' }} />}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 150 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: firm ? '#4c7a10' : '#1a1d18' }}>{s.title}</h3>
          {s.svg && <SafeSvg svg={s.svg} label={s.title} />}
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
            {s.bullets.slice(0, shown).map((b, k) => <li key={k}>{b}</li>)}
          </ul>
        </div>
      </div>
      <div aria-live="polite" style={{ ...muted, marginTop: 8, textWrap: 'pretty' }}>{spoken(s.narration)}</div>
    </div>
  );
}
