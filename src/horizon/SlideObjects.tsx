// The objects placed freely on a slide (studios plan, Task 3.3), copied from Horizon's SlideObjects.tsx without its
// editing (select, move, resize, type): text boxes, shapes and lines, pictures, charts, Calc animations, avatars and
// cases. A Calc animation shows its poster with "Animation runs in Horizon": its program is not in the deck at all
// (cleanDeck.ts) and the player has no sandbox to run one. A case shows its last result as text (the explorer and its
// rules stay in Horizon). The `data-object`/`data-kind` attributes are what the build-in finds (buildIn.ts).
import type { CSSProperties } from 'react';
import { AvatarSpeaker, AvatarStill } from './AvatarSpeaker';
import { HeldVisual } from './HeldVisual';
import { animationBox, describe, inkCss, isLine, lineEnds, shapePath } from './objects';
import { fontOf } from './slideTheme';
import type { SlideObject } from './types';
import { Visual } from './Visual';
import { vizKey } from './vizCharts';

// How the slide in focus speaks and plays: `run` changes on each arrival; `cue` counts cues; none when not in focus.
export type Live = { run: string; cue: number } | null;

const textCss = (o: SlideObject, align: 'left' | 'center'): CSSProperties => ({ fontFamily: fontOf(o.font).css, fontSize: o.size || 24, fontWeight: o.bold ? 600 : 400, lineHeight: 1.25,
  color: inkCss(o.color, 'text'), textAlign: o.align || align, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
const fill: CSSProperties = { display: 'block', width: '100%', height: '100%' };
const note: CSSProperties = { fontSize: 13, color: 'var(--s-muted)' };

// What only Horizon runs, said on the object itself.
const RunsInHorizon = ({ what }: { what: string }) => (
  <span style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 8px', borderRadius: 999, fontSize: 12, background: 'rgba(0,0,0,.6)', color: '#fff' }}>{what} runs in Horizon</span>
);

function Animation({ o }: { o: SlideObject }) {
  const a = o.animation!, b = animationBox(o);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1c2a36', overflow: 'hidden' }}>
      <img src={a.poster} alt={a.name} draggable={false} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, display: 'block' }} />
      <RunsInHorizon what="Animation" />
    </div>
  );
}

function Case({ o }: { o: SlideObject }) {
  const c = o.case!;
  return (
    <div style={{ ...fill, overflow: 'hidden', padding: 12, boxSizing: 'border-box', border: '1px solid var(--s-line)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600 }}>{c.title}</div>
      {c.notes.map((n, k) => <div key={'n' + k} style={note}>{n}</div>)}
      {c.label && <div style={note}>{c.label}</div>}
      {c.answers.map((a, k) => <div key={'a' + k} style={{ fontSize: 14 }}>{a}</div>)}
      <div style={note}>The case as it was prepared · explore it in Horizon</div>
    </div>
  );
}

function Shape({ o }: { o: SlideObject }) {
  if (isLine(o)) {
    const [[x1, y1], [x2, y2]] = lineEnds(o).map(([x, y]) => [x - o.x, y - o.y]), mk = 'hzArrow' + o.id.replace(/\W/g, ''), stroke = inkCss(o.line, 'accent');
    return (
      <svg width={Math.max(1, o.w)} height={Math.max(1, o.h)} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden="true">
        {o.shape === 'arrow' && <defs><marker id={mk} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: stroke }} /></marker></defs>}
        <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={o.shape === 'arrow' ? `url(#${mk})` : undefined} style={{ stroke, strokeWidth: o.weight || 3, strokeLinecap: 'round' }} />
      </svg>
    );
  }
  const sw = o.line && o.line !== 'none' ? o.weight || 2 : 0;
  return (
    <>
      <svg width={o.w} height={o.h} viewBox={`${-sw / 2} ${-sw / 2} ${o.w + sw} ${o.h + sw}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
        <path d={shapePath(o.shape, o.w, o.h)} style={{ fill: inkCss(o.fill, 'accent'), stroke: inkCss(o.line), strokeWidth: sw, strokeLinejoin: 'round' }} />
      </svg>
      {o.text && <div style={{ ...textCss(o, 'center'), position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>{o.text}</div>}
    </>
  );
}

function Body({ o, media, live, hold }: { o: SlideObject; media: Record<string, string>; live: Live; hold?: boolean }) {
  switch (o.kind) {
    case 'text': return <div style={textCss(o, 'left')}>{o.text}</div>;
    case 'picture': return o.image ? <img src={o.image} alt={o.alt || ''} draggable={false} style={{ ...fill, objectFit: 'fill' }} /> : null;
    case 'chart': return o.viz ? <div style={{ ...fill, display: 'flex', alignItems: 'center' }}><HeldVisual run={live && !hold ? 'play' : 'still'}><Visual key={vizKey(o.viz) + (live?.run ?? '')} v={o.viz} still={hold} /></HeldVisual></div> : null;
    case 'animation': return <Animation o={o} />;
    case 'case': return <Case o={o} />;
    case 'avatar': return o.avatar!.live ? <div style={{ position: 'relative', ...fill }}><AvatarStill o={o} /><RunsInHorizon what="Conversation" /></div> : <AvatarSpeaker o={o} url={o.avatar!.clip ? media[o.avatar!.clip.media] ?? null : null} run={live?.run} cue={live?.cue ?? 0} />;
    default: return <Shape o={o} />;
  }
}

export function SlideObjects({ objects, media, live, hold }: { objects: SlideObject[]; media: Record<string, string>; live: Live; hold?: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {objects.map((o) => {
        const auto = o.kind === 'text', turnable = !isLine(o) && o.kind !== 'chart' && o.kind !== 'animation' && o.kind !== 'avatar';
        return (
          <div key={o.id} data-object={o.id} data-kind={o.kind} data-shape={o.kind === 'shape' ? o.shape : undefined} aria-label={o.kind === 'text' ? undefined : describe(o)}
            style={{ position: 'absolute', left: o.x, top: o.y, width: Math.max(isLine(o) ? 1 : 0, o.w), ...(auto ? { minHeight: o.h } : { height: Math.max(isLine(o) ? 1 : 0, o.h) }),
              ...(turnable && o.rotate ? { transform: `rotate(${o.rotate}deg)` } : {}), pointerEvents: o.kind === 'avatar' ? 'auto' : 'none' }}>
            <Body o={o} media={media} live={live} hold={hold} />
          </div>
        );
      })}
    </div>
  );
}
