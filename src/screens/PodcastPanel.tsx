// The one podcast player (studios plan, Task 3.5), for the learner on the detail page, as the Podcast Studio's preview and, read
// only, for the author and reviewers (studioPreviews.tsx): the shared step player and clock. A stored episode plays turn by turn,
// each turn's audio from a signed link (mediaStore); a v3 episode plays chapter by chapter on the clock with no audio. The chapters
// jump to their first step, the transcript is the script with the turn being said marked, and listening to the end is told once. It
// reads the view-model (fmtPodcast.ts); the step player keeps the step it is on.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Card, Hover } from '../ds';
import type { PodcastView } from '../fmtPodcast';
import { fmtTime } from '../logic/media';
import { podcastSteps } from '../logic/podcastContent';
import StepPlayer from './StepPlayer';
import type { StepAt } from './StepPlayer';
import { useAudioLinks } from './useAudioLinks';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };

export default function PodcastPanel({ pc }: { pc: PodcastView }) {
  const links = useAudioLinks(pc.paths);
  return (
    <Card title="Listen" subtitle={pc.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pc.note && <div style={muted}>{pc.note}</div>}
        {!links ? <div role="status" style={muted}>Loading the episode</div>
          : 'error' in links ? <div role="alert" style={{ ...muted, color: '#7a5000' }}>The episode could not be opened · {links.error}</div>
            : <Episode pc={pc} urls={links.urls} />}
      </div>
    </Card>
  );
}

function Episode({ pc, urls }: { pc: PodcastView; urls: string[] }) {
  const steps = useMemo(() => podcastSteps(pc.pc, urls), [pc.pc, urls]);
  return <StepPlayer steps={steps} note={pc.way} onEnd={pc.onEnd}>{(at) => <Now pc={pc} at={at} />}</StepPlayer>;
}

// The chapter a step is in: the last one that starts at or before it.
const chapterOf = (pc: PodcastView, index: number) => pc.pc.chapters.reduce((a, c, k) => (c.turn <= index ? k : a), 0);

function Now({ pc, at }: { pc: PodcastView; at: StepAt }) {
  const c = pc.pc, now = chapterOf(pc, at.index), turn = c.turns[at.index];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div data-testid="chapter-now" style={{ fontWeight: 600 }}>{c.chapters[now].title}</div>
        {turn && <div data-testid="turn-now" aria-live="polite" style={{ marginTop: 4, textWrap: 'pretty' }}>{turn.speaker + ': ' + turn.text}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...caps, paddingBottom: 4 }}>Chapters</div>
        {c.chapters.map((ch, k) => (
          <Hover key={k} as="button" type="button" data-testid="chapter" onClick={() => at.jump(ch.turn)} aria-current={k === now} hoverStyle={{ background: '#fafbf8' }}
            style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', gap: 10, padding: '8px 6px', border: 0, borderTop: '1px solid #eef0ea', background: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: k === now ? 600 : 400 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{fmtTime(ch.start)}</span><span>{ch.title}</span>
          </Hover>
        ))}
      </div>
      {c.turns.length > 0 && (
        <details>
          <summary style={caps}>Transcript</summary>
          <ol data-testid="transcript" style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c.turns.map((t, k) => <li key={k} style={{ fontWeight: k === at.index ? 600 : 400, textWrap: 'pretty' }}>{t.speaker + ': ' + t.text}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
