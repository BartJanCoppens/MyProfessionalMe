// The Horizon player (studios plan, Task 3.3; owner decisions S8–S10): a .horizon file from the media bucket, read
// (readDeck.ts) and presented in the page along its route (usePresentation.ts, Stage.tsx). The learner goes slide by
// slide (buttons, or the arrow keys on the stage), or plays the file's narration on the shared step player, which moves
// the slides at its ⟨next⟩ marks and sets off avatars at its ⟨cue⟩ marks. The file is the only thing fetched (a signed
// URL, mediaStore.mediaText); everything it shows comes from inside it. Reaching the last slide calls onLast.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Button } from '../ds';
import { mediaText } from '../lib/mediaStore';
import StepPlayer from '../screens/StepPlayer';
import type { StepAt } from '../screens/StepPlayer';
import { deckNarration } from './narrationOf';
import type { DeckNarration } from './narrationOf';
import { readDeck } from './readDeck';
import { Stage } from './Stage';
import type { Deck } from './types';
import { usePresentation } from './usePresentation';
import type { Presentation } from './usePresentation';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
type Props = { path: string; still: boolean; onLast?: () => void };

export default function HorizonPlayer({ path, still, onLast }: Props) {
  const [got, setGot] = useState<{ path: string; deck?: Deck; error?: string } | null>(null);
  useEffect(() => {
    let on = true;
    mediaText(path).then((t) => readDeck(t)).then((deck) => on && setGot({ path, deck }), (e: Error) => on && setGot({ path, error: e.message }));
    return () => { on = false; };
  }, [path]);
  if (!got || got.path !== path) return <div role="status" style={muted}>Loading the presentation</div>;
  if (!got.deck) return <div role="alert" style={{ ...muted, color: '#7a5000' }}>{got.error}</div>;
  return <Presenting key={path} deck={got.deck} still={still} onLast={onLast} />;
}

function Presenting({ deck, still, onLast }: { deck: Deck; still: boolean; onLast?: () => void }) {
  const p = usePresentation(deck, { still, onLast }), narration = useMemo(() => deckNarration(deck), [deck]);
  const [narrated, setNarrated] = useState(false), f = p.step.frame;
  const waits = !!f.objects?.some((o) => o.kind === 'avatar' && o.avatar?.speaks === 'cue' && o.avatar.clip && deck.media[o.avatar.clip.media]);
  const key = (e: KeyboardEvent) => {
    if (narrated) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); p.next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); p.previous(); }
    else if (e.key === 'e' || e.key === 'E') p.cue();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="region" aria-label="Presentation" tabIndex={0} onKeyDown={key} style={{ outline: 'none' }}><Stage deck={deck} p={p} /></div>
      <div aria-live="polite" style={{ fontSize: 13, fontWeight: 500 }}>{p.place}{f.title ? ' · ' + f.title : ''}</div>
      {narrated && narration ? <Narrated n={narration} p={p} /> : (
        <div style={row}>
          <Button size="sm" variant="secondary" onClick={p.previous} disabled={p.first} aria-label="Previous slide">Previous</Button>
          <Button size="sm" onClick={p.next} disabled={p.last} aria-label="Next slide">Next</Button>
          {waits && <Button size="sm" variant="secondary" onClick={p.cue}>Cue the avatar</Button>}
          <span style={muted}>{p.last ? 'End of the presentation' : 'Arrow keys work on the slide too'}</span>
        </div>
      )}
      {narration && <div><Button size="sm" variant="secondary" onClick={() => setNarrated(!narrated)}>{narrated ? 'Present it yourself' : 'Play the narration'}</Button></div>}
      {hasClips(deck) && <div style={muted}>The avatars’ clips were made with AI in Horizon.</div>}
    </div>
  );
}

const hasClips = (deck: Deck) => {
  const all = (F: Deck['frames']): boolean => F.some((f) => f.objects?.some((o) => o.avatar?.clip && deck.media[o.avatar.clip.media]) || (f.section && all(f.section.frames)));
  return all(deck.frames);
};

// The narration on the shared step player; what it shows is the slide the talk is on, and the passage's words.
function Narrated({ n, p }: { n: DeckNarration; p: Presentation }) {
  const note = n.way === 'voice' ? 'Narrated with an AI voice, made in Horizon · ' + n.name
    : 'No voice in the file: the narration runs at ' + n.pace + ' words a minute, without sound · ' + n.name;
  return <StepPlayer steps={n.steps} note={note} onEnd={() => p.show(p.route[p.route.length - 1].frame.id)}>{(at) => <Follow at={at} n={n} p={p} />}</StepPlayer>;
}

// A step shows its slide; past its ⟨next⟩ mark, the next step's slide; each ⟨cue⟩ passed is one cue.
function Follow({ at, n, p }: { at: StepAt; n: DeckNarration; p: Presentation }) {
  const ahead = at.marks.some((m) => m.kind === 'next') ? n.steps[at.index + 1]?.part : undefined, part = ahead ?? at.step.part;
  const cues = at.marks.filter((m) => m.kind === 'cue').length;
  const pres = useRef(p);
  useLayoutEffect(() => { pres.current = p; });
  // Only when the step or its mark changes the slide, and once per cue passed.
  useEffect(() => { pres.current.show(part); }, [part]);
  useEffect(() => { if (cues) pres.current.cue(); }, [cues, at.index]);
  return <div style={{ fontSize: 13, textWrap: 'pretty' }}>{n.captions[at.index]}</div>;
}
