// The preview step's registry: one preview per studio kind (StudioDef.pv). Flash plays its cards or questions; a studio
// whose rows publish as a learner format (Job aid, Case, Interactive explainer, Animated flow, Slides, Podcast, Game) shows that format's own
// learner panel over studioContent. A preview is a play-test: never saved, never counted as progress. The same panels
// show a saved studio contribution to its author and its reviewers (SavedContent), and a Presentation's file.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { explainerView } from '../fmtExplainer';
import { gameView } from '../fmtGame';
import { flowView } from '../fmtMotion';
import type { ExplainerState } from '../fmtExplainer';
import { NEW_ROUND } from '../fmtRound';
import { aidView, casePreview } from '../fmtVals';
import { caseHours } from '../logic/studioContent';
import type { VM } from '../model';
import { horizonView } from '../fmtHorizon';
import { podcastView } from '../fmtPodcast';
import { slidesView } from '../fmtSlides';
import type { AidContent, ExplainerContent, FormatContent, GameContent, HorizonContent, MotionContent, PodcastContent, SlidesContent } from '../types';
import AnimatedFlowPanel from './AnimatedFlowPanel';
import GamePanel from './GamePanel';
import ExplainerPanel from './ExplainerPanel';
import PodcastPanel from './PodcastPanel';
import PresentationPanel from './PresentationPanel';
import SlidesPanel from './SlidesPanel';
import { AidPanel, CasePanel } from './FormatWork';
import { label } from './labelStyle';
import StudioPlayTest from './StudioPlayTest';

type CS = NonNullable<VM['create']>;
const note = { fontSize: 12.5, color: '#5a6058' };

// The learner's job aid; the ticks live in this preview only.
function AidTry({ content }: { content: AidContent }) {
  const [ticks, setTicks] = useState<number[]>([]);
  return <AidPanel ja={aidView(content, ticks, setTicks, { ro: false, saved: false })} />;
}

// The learner's explainer; the step and the check's answers live in this preview only. As for the learner, the ending
// opens once the last step is seen.
function ExplainerTry({ content }: { content: ExplainerContent }) {
  const [s, setS] = useState<ExplainerState>({ ...NEW_ROUND, at: 0, seen: false });
  const ie = explainerView(content, s, (p) => setS((cur) => ({ ...cur, ...p })), { ro: false, note: '', lastSeen: false, locked: () => false, onLast: () => {}, onCheck: () => {} });
  return <ExplainerPanel ie={ie} />;
}

// A Presentation's file in its learner panel; playing it to the end completes nothing.
const DeckTry = ({ content, still }: { content: HorizonContent; still: boolean }) =>
  <PresentationPanel hz={horizonView(content, { ro: false, still, done: false, onLast: () => {} })} />;

// The learner's Animated flow; playing it and reading its text version complete nothing.
const FlowTry = ({ content, still }: { content: MotionContent; still: boolean }) =>
  <AnimatedFlowPanel fl={flowView(content, { ro: false, still, done: false, onEnd: () => {}, onRead: () => {} })} />;

// The learner's deck; playing it to the end completes nothing.
const SlidesTry = ({ content, still }: { content: SlidesContent; still: boolean }) =>
  <SlidesPanel sl={slidesView(content, { ro: false, still, done: false, onEnd: () => {} })} />;

// The learner's episode; listening to the end completes nothing.
const PodcastTry = ({ content }: { content: PodcastContent }) =>
  <PodcastPanel pc={podcastView(content, { ro: false, done: false, onEnd: () => {} })} />;

// The learner's game as a play-test: a saved contribution plays on a test run (never counted), an unsaved preview on none; the
// name a game sees is "Player".
const GameTry = ({ content, contributionId }: { content: GameContent; contributionId: string | null }) =>
  <GamePanel gm={gameView(content, { ro: false, learningId: null, contributionId, player: 'Player', accepter: 'your counsellor' })} />;

// A studio piece's content and what its learner panel needs: the case's hours, whether motion is off and, for a saved
// contribution, its id (a game's play-test is recorded against it).
export type LearnerTry = { key: string; content: FormatContent; hours: number; still: boolean; contributionId?: string };

// The format's own learner panel over the content, as a play-test: its state lives here only.
function LearnerPanel({ t }: { t: LearnerTry }) {
  const { content } = t;
  return (
    <>
      {content.kind === 'aid' && <AidTry content={content} />}
      {content.kind === 'case' && <CasePanel ce={casePreview(content, t.hours)} />}
      {content.kind === 'explainer' && <ExplainerTry content={content} />}
      {content.kind === 'motion' && <FlowTry content={content} still={t.still} />}
      {content.kind === 'horizon' && <DeckTry content={content} still={t.still} />}
      {content.kind === 'slides' && <SlidesTry content={content} still={t.still} />}
      {content.kind === 'podcast' && <PodcastTry content={content} />}
      {content.kind === 'game' && <GameTry content={content} contributionId={t.contributionId ?? null} />}
    </>
  );
}

// The content as the learner's panel shows it, or what is still missing.
function Learner({ c }: { c: CS }) {
  const content = c.studio.content;
  if (!content) return <div style={note}>{c.studio.previewNote}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={note}>A play-test, as learners will see it: nothing is saved or counted.</div>
      <LearnerPanel t={{ key: 'preview', content, hours: caseHours(c.nw.shape ?? {}), still: c.studio.still }} />
    </div>
  );
}

// A saved studio contribution's content in My contributions and Review for peers: the same panel, read only.
export function SavedContent({ t }: { t: LearnerTry | null }) {
  if (!t) return null;
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={label}>As learners will see it</div>
      <div style={note}>Try it: nothing is saved or counted.</div>
      <LearnerPanel key={t.key} t={t} />
    </div>
  );
}

const PREVIEWS: Record<string, (p: { c: CS }) => ReactNode> = {
  flash: ({ c }) => <StudioPlayTest preview={c.studio.preview} />,
  aid: ({ c }) => <Learner c={c} />,
  case: ({ c }) => <Learner c={c} />,
  explainer: ({ c }) => <Learner c={c} />,
  motion: ({ c }) => <Learner c={c} />,
  slides: ({ c }) => <Learner c={c} />,
  podcast: ({ c }) => <Learner c={c} />,
};

export function Preview({ kind, c }: { kind: string; c: CS }) {
  const Kind = PREVIEWS[kind];
  return Kind ? <>{Kind({ c })}</> : <div style={note}>Preview comes with this studio</div>;
}
