// The preview step's registry: one preview per studio kind (StudioDef.pv). Flash plays its cards or questions; a studio
// whose rows publish as a learner format (Job aid, Case, Interactive explainer, Animated flow, Slides, Podcast, Game) shows that format's own
// learner panel over studioContent. A preview is a play-test: never saved, never counted as progress. The same panels
// show a saved studio contribution to its author and its reviewers (SavedContent), and a Presentation's file.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { explainerView } from '../fmtExplainer';
import { gameView } from '../fmtGame';
import type { GameOpts } from '../fmtGame';
import { flowView } from '../fmtMotion';
import type { ExplainerState } from '../fmtExplainer';
import { NEW_ROUND } from '../fmtRound';
import { avatarView } from '../fmtAvatar';
import { aidView, casePreview } from '../fmtVals';
import { caseHours } from '../logic/studioContent';
import type { VM } from '../model';
import { horizonView } from '../fmtHorizon';
import { podcastView } from '../fmtPodcast';
import { reelView } from '../fmtReel';
import { slidesView } from '../fmtSlides';
import type { StockLook } from '../logic/stockLooks';
import type { AidContent, AvatarContent, ExplainerContent, FormatContent, GameContent, HorizonContent, MotionContent, PodcastContent, ReelContent, SlidesContent } from '../types';
import AnimatedFlowPanel from './AnimatedFlowPanel';
import AvatarPanel from './AvatarPanel';
import GamePanel from './GamePanel';
import ExplainerPanel from './ExplainerPanel';
import PodcastPanel from './PodcastPanel';
import PresentationPanel from './PresentationPanel';
import ReelPanel from './ReelPanel';
import SlidesPanel from './SlidesPanel';
import SlidesVideo from './SlidesVideo';
import { AidPanel, CasePanel } from './FormatWork';
import { label } from './labelStyle';
import { Tag } from '../ds';
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

// The learner's reel; the answer to its check lives in this preview only, and playing or answering completes nothing.
// `drafted`: its rows were AI-drafted; voiced or drafted, the panel carries "Made with AI".
function ReelTry({ content, drafted }: { content: ReelContent; drafted: boolean }) {
  const [answer, setAnswer] = useState<number | undefined>();
  return <ReelPanel rl={reelView(content, { ro: false, done: false, takeaway: null, answer, pick: setAnswer, onEnd: () => {}, ai: drafted || content.made === 'ai' })} />;
}

// The learner's game as a play-test: a saved contribution plays on a test run (never counted), an unsaved preview on none; the
// name a game sees is "Player".
const GameTry = ({ content, contributionId, ai }: { content: GameContent; contributionId: string | null; ai?: GameOpts['ai'] }) =>
  <GamePanel gm={gameView(content, { ro: false, learningId: null, contributionId, player: 'Player', accepter: 'your counsellor', ai })} />;

// The learner's avatar as a practice run: a saved draft practises on a test run (never counted, never shared), an unsaved one says to save it first.
export const AVATAR_PREVIEW = 'Practice run · never saved to your progress, never counts';
const AvatarTry = ({ content, contributionId, ai, looks }: { content: AvatarContent; contributionId: string | null; ai?: GameOpts['ai']; looks?: StockLook[] | null }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div><Tag tone="amber">Practice run</Tag></div>
    <AvatarPanel av={avatarView(content, { ro: false, learningId: null, contributionId, counsellor: 'your counsellor', ai: ai ?? { enabled: true, live: [] }, looks })} />
  </div>
);

// A studio piece's content and what its learner panel needs: the case's hours, whether motion is off and, for a saved
// contribution, its id (a game's or an avatar's play-test is recorded against it); ai: whether the AI role can answer (a game's play-test asks it); looks: the stock looks (an avatar's video).
export type LearnerTry = { key: string; content: FormatContent; hours: number; still: boolean; contributionId?: string; ai?: GameOpts['ai']; drafted?: boolean; looks?: StockLook[] | null };
export const GAME_PLAYTEST = 'Play-test · not saved, never counts as progress';
export const REEL_PREVIEW = 'Preview · music is added in the final cut · not saved, never counts as progress';

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
      {content.kind === 'game' && <GameTry content={content} contributionId={t.contributionId ?? null} ai={t.ai} />}
      {content.kind === 'reel' && <ReelTry content={content} drafted={!!t.drafted} />}
      {content.kind === 'avatar' && <AvatarTry content={content} contributionId={t.contributionId ?? null} ai={t.ai} looks={t.looks} />}
    </>
  );
}

// The content as the learner's panel shows it, or what is still missing.
function Learner({ c }: { c: CS }) {
  const content = c.studio.content;
  if (!content) return <div style={note}>{c.studio.previewNote}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={note}>{content.kind === 'game' ? GAME_PLAYTEST : content.kind === 'avatar' ? AVATAR_PREVIEW : content.kind === 'reel' && !content.video ? REEL_PREVIEW : 'A play-test, as learners will see it: nothing is saved or counted.'}</div>
      {content.kind === 'game' && c.studio.reviewNote && <div role="status" style={{ ...note, color: '#7a5000' }}>{c.studio.reviewNote}</div>}
      <LearnerPanel t={{ key: 'preview', content, hours: caseHours(c.nw.shape ?? {}), still: c.studio.still, contributionId: c.nw.savedId, ai: c.studio.ai, drafted: c.studio.drafted, looks: c.studio.looks }} />
      {content.kind === 'slides' && !c.readOnly && <SlidesVideo content={content} title={c.nw.title} />}
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
      {t.content.kind === 'reel' && t.content.video && <div style={note}>Check the video itself: the app can't verify what it shows</div>}
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
  game: ({ c }) => <Learner c={c} />,
  reel: ({ c }) => <Learner c={c} />,
  avatar: ({ c }) => <Learner c={c} />,
};

export function Preview({ kind, c }: { kind: string; c: CS }) {
  const Kind = PREVIEWS[kind];
  return Kind ? <>{Kind({ c })}</> : <div style={note}>Preview comes with this studio</div>;
}
