// The detail page's panels for the study formats of design v4: flash cards, practice exam, teach-back, the interactive
// explainer (ExplainerPanel.tsx), a course (CoursePanel.tsx), the Animated flow (AnimatedFlowPanel.tsx), each also its studio's preview, and a
// Presentation (PresentationPanel.tsx) a deck of slides (SlidesPanel.tsx), an episode (PodcastPanel.tsx) and a game (GamePanel.tsx). The work formats
// (case, stretch, webinar, job aid) are in FormatWork.tsx. They read from VM only (fmtVals.ts, fmtStudy.ts).
import type { CSSProperties, ReactNode } from 'react';
import { Button, Card, LinkButton, ProgressRing, Textarea } from '../ds';
import type { fmtVals } from '../fmtVals';
import AnimatedFlowPanel from './AnimatedFlowPanel';
import CoursePanel from './CoursePanel';
import ExplainerPanel from './ExplainerPanel';
import GamePanel from './GamePanel';
import PresentationPanel from './PresentationPanel';
import PodcastPanel from './PodcastPanel';
import ReelPanel from './ReelPanel';
import SlidesPanel from './SlidesPanel';
import { WorkPanels } from './FormatWork';
import QuestionRound from './QuestionRound';

type Det = ReturnType<typeof fmtVals>;
const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const ViewOnly = ({ note }: { note: string }) => <div style={{ fontSize: 12.5, color: '#5a6058' }}>{note}</div>;

function FlashPanel({ fl }: { fl: NonNullable<Det['fl']> }) {
  return (
    <Card title="Study the deck" subtitle={fl.sub}>
      <div style={col}>
        {fl.ro && <ViewOnly note={fl.note} />}
        {fl.active && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#5a6058' }}><span>{fl.pos}</span><span>{fl.side}</span></div>
            <button type="button" onClick={fl.flip} aria-label="Flip the card" style={{ appearance: 'none', font: 'inherit', cursor: 'pointer', minHeight: 150, borderRadius: 8, border: '1px solid ' + fl.bd, background: fl.bg, color: '#1a1d18', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 18, fontWeight: 600, lineHeight: 1.35, textWrap: 'balance', animation: 'pmFadeUp .25s ease-out' }}>{fl.face}</button>
            {fl.showRate && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="secondary" size="sm" onClick={fl.again}>Again · 10 min</Button>
                <Button variant="secondary" size="sm" onClick={fl.good}>Good · 3 days</Button>
                <Button size="sm" onClick={fl.easy}>Easy · 8 days</Button>
              </div>
            )}
            {fl.showFlip && <div style={{ fontSize: 12, color: '#5a6058' }}>Say the answer out loud, then flip the card and rate how well you knew it.</div>}
          </>
        )}
        {fl.finished && (
          <div style={{ border: '1px solid #c9e39a', background: '#f6f9ef', borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Done for today</div>
            <div style={{ fontSize: 12.5, color: '#3d423b' }}>{fl.summary}</div>
            <div><LinkButton onClick={fl.restart}>Study the deck again</LinkButton></div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ExamPanel({ ex }: { ex: NonNullable<Det['ex']> }) {
  return (
    <Card title="Practice exam" subtitle={ex.sub}>
      <div style={col}>
        {ex.ro && <ViewOnly note={ex.note} />}
        {ex.hasTrj && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, border: '1px solid #f0dca3', background: '#fdf7e6', borderRadius: 6, padding: '8px 12px' }}>
            <span><span aria-hidden="true" style={{ color: '#7a5000', fontWeight: 600 }}>◆ </span>{ex.trjText}</span>
            <LinkButton onClick={ex.openTrj ?? undefined}>Open the trajectory →</LinkButton>
          </div>
        )}
        {ex.active && <QuestionRound r={ex} />}
        {ex.finished && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <ProgressRing value={ex.frac} size={64} />
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{ex.scoreLabel}</div><div style={{ fontSize: 12.5, color: ex.verdictColor, fontWeight: 600 }}>{ex.verdict}</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={caps}>By topic</div>
              {ex.topics.map((t) => (
                <div key={t.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                  <span>{t.label}</span>
                  <span style={{ display: 'block', height: 6, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: t.w, background: t.c }} /></span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.v}</span>
                </div>
              ))}
            </div>
            <div><LinkButton onClick={ex.restart}>Try another round</LinkButton></div>
          </>
        )}
      </div>
    </Card>
  );
}

function TeachPanel({ tb }: { tb: NonNullable<Det['tb']> }) {
  return (
    <Card title="Explain it in your own words" subtitle={tb.sub}>
      <div style={col}>
        <div style={{ borderLeft: '3px solid #1a1d18', padding: '4px 12px', fontWeight: 600, textWrap: 'pretty' }}>{tb.prompt}</div>
        {tb.ro ? <ViewOnly note={tb.note} /> : (
          <>
            <Textarea value={tb.text} onChange={tb.setText} rows={6} placeholder="Write as if you are talking to the client. No notes, no copy-paste." aria-label="Your explanation" />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Button onClick={tb.send} disabled={tb.busy}>{tb.sendLabel}</Button><span style={{ fontSize: 12, color: '#5a6058' }}>{tb.count}</span></div>
          </>
        )}
        {tb.hasRes && (
          <div style={{ border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, animation: 'pmFadeUp .3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><span style={{ fontWeight: 600 }}>{tb.scoreLabel}</span><span style={{ fontSize: 12, color: '#5a6058' }}>{tb.by}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tb.crit.map((k) => <span key={k.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 9px', borderRadius: 999, border: '1px solid ' + k.bd, background: k.bg, color: k.fg }}><span aria-hidden="true">{k.mark}</span>{k.label}</span>)}
            </div>
            {tb.feedback && <div style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{tb.feedback}</div>}
            {tb.follow && <div style={{ fontSize: 12.5, textWrap: 'pretty' }}><span style={{ fontWeight: 600 }}>Follow-up question · </span>{tb.follow}</div>}
          </div>
        )}
      </div>
    </Card>
  );
}

// Nothing renders for a learning without content.
// `embed`: the panels of a learning embedded in a course (vm.embed), or null when it can no longer be played.
export function FormatPanels({ det, embed }: { det: Det; embed?: (id: string) => Det | null }) {
  const renderEmbed = (id: string): ReactNode => { const d = embed?.(id); return d ? <FormatPanels det={d} embed={embed} /> : null; };
  return (
    <>
      {det.fl && <FlashPanel fl={det.fl} />}
      {det.ex && <ExamPanel ex={det.ex} />}
      {det.tb && <TeachPanel tb={det.tb} />}
      {det.co && <CoursePanel co={det.co} renderEmbed={renderEmbed} />}
      {det.ie && <ExplainerPanel ie={det.ie} />}
      {det.af && <AnimatedFlowPanel fl={det.af} />}
      {det.hz && <PresentationPanel hz={det.hz} />}
      {det.sl && <SlidesPanel sl={det.sl} />}
      {det.pc && <PodcastPanel pc={det.pc} />}
      {det.rl && <ReelPanel rl={det.rl} />}
      {det.gm && <GamePanel key={det.gm.key} gm={det.gm} />}
      <WorkPanels det={det} />
    </>
  );
}
