// The preview step's registry: one preview per studio kind (StudioDef.pv). Flash plays its cards or questions; a studio
// whose rows publish as a learner format (Job aid, Case, Interactive explainer, Animated flow) shows that format's own
// learner panel over studioContent. A preview is a play-test: never saved, never counted as progress.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { explainerView } from '../fmtExplainer';
import { flowView } from '../fmtMotion';
import type { ExplainerState } from '../fmtExplainer';
import { NEW_ROUND } from '../fmtRound';
import { aidView, casePreview } from '../fmtVals';
import { caseHours } from '../logic/studioContent';
import type { VM } from '../model';
import type { AidContent, ExplainerContent, MotionContent } from '../types';
import AnimatedFlowPanel from './AnimatedFlowPanel';
import ExplainerPanel from './ExplainerPanel';
import { AidPanel, CasePanel } from './FormatWork';
import StudioPlayTest from './StudioPlayTest';

type CS = NonNullable<VM['create']>;
const note = { fontSize: 12.5, color: '#5a6058' };

// The learner's job aid; the ticks live in this preview only.
function AidTry({ content }: { content: AidContent }) {
  const [ticks, setTicks] = useState<number[]>([]);
  return <AidPanel ja={aidView(content, ticks, setTicks, { ro: false, saved: false })} />;
}

// The learner's explainer; the step and the check's answers live in this preview only.
function ExplainerTry({ content }: { content: ExplainerContent }) {
  const [s, setS] = useState<ExplainerState>({ ...NEW_ROUND, at: 0, seen: false });
  const ie = explainerView(content, s, (p) => setS((cur) => ({ ...cur, ...p })), { ro: false, note: '', lastSeen: true, locked: () => false, onLast: () => {}, onCheck: () => {} });
  return <ExplainerPanel ie={ie} />;
}

// The learner's Animated flow; playing it and reading its text version complete nothing.
const FlowTry = ({ content, still }: { content: MotionContent; still: boolean }) =>
  <AnimatedFlowPanel fl={flowView(content, { ro: false, still, done: false, onEnd: () => {}, onRead: () => {} })} />;

// The content as the learner's panel shows it, or what is still missing.
function Learner({ c }: { c: CS }) {
  const content = c.studio.content;
  if (!content) return <div style={note}>{c.studio.previewNote}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={note}>A play-test, as learners will see it: nothing is saved or counted.</div>
      {content.kind === 'aid' && <AidTry content={content} />}
      {content.kind === 'case' && <CasePanel ce={casePreview(content, caseHours(c.nw.shape ?? {}))} />}
      {content.kind === 'explainer' && <ExplainerTry content={content} />}
      {content.kind === 'motion' && <FlowTry content={content} still={c.studio.still} />}
    </div>
  );
}

const PREVIEWS: Record<string, (p: { c: CS }) => ReactNode> = {
  flash: ({ c }) => <StudioPlayTest preview={c.studio.preview} />,
  aid: ({ c }) => <Learner c={c} />,
  case: ({ c }) => <Learner c={c} />,
  explainer: ({ c }) => <Learner c={c} />,
  motion: ({ c }) => <Learner c={c} />,
};

export function Preview({ kind, c }: { kind: string; c: CS }) {
  const Kind = PREVIEWS[kind];
  return Kind ? <>{Kind({ c })}</> : <div style={note}>Preview comes with this studio</div>;
}
