import type { GameReviewStatus } from './logic/gameContent';
import type { DraftItems } from './logic/items';
import type { BuildStepState } from './logic/studioBuild';
import type { CreateData } from './logic/contribution';
import type { Trajectory } from './logic/trajectory';
import type { TrjMine } from './logic/trajectoryLearner';
import type { Depth, TrjPlanState } from './logic/trajectoryPlan';
import type { QueueRow } from './lib/recordStore';
import type { SharedRun } from './lib/avatarStore';
import type { RosterRow } from './lib/attendanceStore';
import type { AiAdmin, AiForm, AiUseEdit, StockVoice, StockVoiceForm } from './logic/ai';
import type { StockLook, StockLookForm } from './logic/stockLooks';
import type { HorizonItem } from './logic/horizonItem';
import type { RunMark } from './logic/narration';
import type { PortraitKey } from './reel/portraits';
// id, title, dom, lvl, format, source, hours, cpd, due, why
export type Learn = [string, string, string, number, string, string, number, number, string, string];
// learning id, stage, obligation
export type Mapping = [string, string, string];

export type Project = {
  id: string; client: string; name: string; role: string; period: string; hours: number; lead: string; evaluator: string; evalDate: string; overall: string;
  summary: string;
  // [dimension, rating 0..2, comment]
  dims: [string, number, string][] | null;
  quote: string;
  // [learning id, advice]
  advice: [string, string][];
};

export type Test = {
  id: string; name: string; provider: string; date: string; headline: string; unit: string;
  bars: ([string, number] | [string, number, string])[];
  reading: string;
  sugg: [string, string][];
};

export type Ambition = { id: string; text: string; horizon: string; doms: string[]; ids?: string[]; from: string };
export type Interest = { label: string; dom: string; ids?: string[] };

export type AvatarSpec = {
  persona: string; role: string; initials: string; brief: string; skills: string[]; target: number;
  // [date, score per skill (0..5), coach note]
  attempts: [string, number[], string][];
};
// One multiple-choice question, as in a reel's check: the question, the options and the right option's index.
export type QuizQ = { q: string; opts: string[]; a: number };

// A change to one audience's mappings, from a signal, the copilot or a drag.
export type Op = { op: 'add' | 'remove' | 'setOb'; aud: string; lid: string; stage?: string; ob?: string };
export type Signal = { id: string; kind: string; st: string; op: Op; evidence: string; quote: string };
export type Persona = [string, string, string, string, Record<string, string | null>];
// ai: written by AI (false: the scripted reading)
export type Read = { text: string; fix: string; ai?: boolean };

export type CloudKey = 'proj' | 'pers' | 'amb';
export type CloudMeta = {
  label: string; long: string; laneLabel: string; laneSub: string; color: string; text: string; wash: string;
  anchor: number; frac: number; screen: Screen; goLabel: string;
};

export type Screen = 'map' | 'library' | 'detail' | 'projects' | 'profile' | 'team' | 'approvals' | 'create' | 'adminLib' | 'adminMap' | 'adminKb' | 'users' | 'adminAi' | 'trajectory';

// What the signed-in account may administer (from public.user_roles).
// isGeneral: General Admin, edits all content (catalogue, every curriculum audience, all bundles); of accounts, only resets passwords (not a System Admin's).
export type Access = { isSystem: boolean; isGeneral?: boolean; domains: string[]; userId: string };
// Catalogue entry metadata: owning business line (null = firm-wide) and publication status.
// The admin library form; numbers stay text while typing. line '' = firm-wide.
export type LearnForm = { id: string | null; title: string; domain: string; level: string; format: string; source: string; hours: string; cpd: string; why: string; line: string; status: LearnMeta['status'] };
// The v3 episodes' chapters and reels (seeded; they play on the step player as podcastSteps and seededReel give them)
export type PodMedia = { kind: 'pod'; by: string; len: string; dur: number; ch: [number, string][] };
export type ReelMedia = { kind: 'reel'; by: string; len: string; dur: number; caps: string[]; take: string; q: string; opts: string[]; a: number };
export type Media = PodMedia | ReelMedia;
// Interactive content of the v4 formats. Teach-back patterns are stored as strings and compiled when read.
export type FlashContent = { kind: 'flash'; total: number; due: number; next: string; cards: [string, string][] };
export type ExamQuestion = { t: string; q: string; o: string[]; a: number; why: string };
export type ExamContent = { kind: 'exam'; bank: number; real: string; qs: ExamQuestion[] };
// evidence: the creator said it can count as trajectory evidence (Case Studio); absent on cases made before the studio.
export type CaseContent = { kind: 'case'; brief: string; deliv: string[]; rubric: string[]; reviewer: string; evidence?: boolean };
export type TeachContent = { kind: 'teach'; prompt: string; crit: [string, RegExp | null][] };
export type StretchContent = { kind: 'stretch'; brief: string; checks: string[] };
export type WebinarContent = { kind: 'webinar'; mon: string; day: string; time: string; when: string; speakers: string; agenda: string[] };
export type AidContent = { kind: 'aid'; items: string[] };
// Studio content (studios plan Tasks 2.2 and 2.3): a clickable step-through with an optional three-question check, and an animated flow.
export type ExplainerContent = { kind: 'explainer'; style: string; depth: string; steps: { label: string; text: string; svg?: string }[]; check?: ExamQuestion[]; end: string };
// made: who animated the drawing ('ai' shows as Made with AI, 'scripted' as Scripted), see src/logic/motionSvg.ts.
export type MotionContent = { kind: 'motion'; stages: { label: string; text: string }[]; svg: string; alt: string; seconds: number; made: 'ai' | 'scripted' };
// A Horizon presentation (studios plan, Task 3.3): its .horizon file in the media bucket and the summary read from it.
export type HorizonContent = HorizonItem;
// A deck with a talk-over per slide (studios plan, Task 3.4): each slide's bullets and talk-over, the stored audio of an AI voice when
// every slide has it (audio.path is the file the published learning names), the total seconds, the template and transitions
// chosen, and who told it ('ai': the AI voice; 'scripted': captions at a reading pace). svg: a drawing for the slide, drawn only through SafeSvg.
export type SlidesContent = { kind: 'slides'; slides: { title: string; bullets: string[]; svg?: string; narration: string; audio?: { path: string; seconds: number; marks: RunMark[] } }[];
  seconds: number; template: string; transitions: string; made: 'ai' | 'scripted' };
// A podcast episode: its chapters (the start in seconds and the index of the chapter's first turn), the script as its transcript
// (each turn with its stored audio when the AI voice told it) and who told it. A v3 episode has chapters only (no recording).
export type PodcastContent = { kind: 'podcast'; seconds: number; made: 'ai' | 'scripted'; chapters: { title: string; start: number; turn: number }[];
  turns: { speaker: string; text: string; audio?: { path: string; seconds: number; marks: RunMark[] } }[] };
// A game (studios plan, Task 4.2): what getData() gives the game (GameData), who the AI plays (never what it knows), the leaderboard
// chosen, the game's two files (run only in the sealed frame, src/game) and who made it ('ai': a game is always built by the AI).
export type GameData = { concept: string; win: string; rounds: { text: string; answer: string }[] };
export type GameContent = GameData & { kind: 'game'; role: { kind: 'Game master' | 'Opponent' | 'Suspect to question'; about: string } | null;
  leaderboard: 'Firm-wide' | 'My team only' | 'None'; files: { 'index.html': string; 'game.js': string }; made: 'ai' };
// A reel (studios plan, Task 5.3): its scenes on the reel's clock (words: when each spoken word starts, in seconds from the scene's
// start, or null for a scene nobody voiced), the rendered video when there is one, the stock look, the music, the creator's check
// question (a, the right option in written order) and who made it ('ai' shows as Made with AI, 'scripted' as Scripted).
export type ReelContent = { kind: 'reel'; size: '720x1280' | '1080x1080'; seconds: number; scenes: { label: string; text: string; onScreen: string; start: number; seconds: number; words: number[] | null }[];
  video: { path: string; mime: 'video/mp4' | 'video/webm' } | null; burned: boolean; look: { id: string; name: string; portrait: PortraitKey; color: string } | null;
  music: 'None' | 'Calm' | 'Upbeat'; check: { q: string; opts: string[]; a: number }; made: 'ai' | 'scripted' };
// An avatar (studios plan, Task 6.1): the character a learner practises with, as learners may know it (never what it reveals if asked or hides unless
// probed), the learning points it scores on, the quiz that completes the learning (options right-first, a = 0: the panel rotates them), the stock look
// and voice, the run, and who made it.
export type AvatarContent = { kind: 'avatar'; persona: string; situation: string; opening: string; points: { id: string; text: string; weight: number }[];
  quiz: { q: string; opts: string[]; a: 0 }[]; look: { id: string; name: string; portrait: PortraitKey; color: string } | null; voice: { id: string; name: string } | null;
  language: 'English' | 'Dutch' | 'French'; difficulty: 'Gentle' | 'Realistic' | 'Tough'; minutes: 5 | 10 | 15; scoring: 'AI scores, counsellor confirms' | 'Practice only';
  counterpart: string; made: 'ai' | 'scripted' };
export type FormatContent = AvatarContent | FlashContent | ExamContent | CaseContent | TeachContent | StretchContent | WebinarContent | AidContent | ExplainerContent | MotionContent | HorizonContent | SlidesContent | PodcastContent | GameContent | ReelContent;
// aiMade: AI made it (learnings.ai_made, set when a contribution is published); learners see "Made with AI".
export type LearnMeta = { line: string | null; status: 'published' | 'review' | 'draft'; content?: FormatContent | null; aiMade?: boolean };
export type View = 'constellation' | 'radar' | 'road';
export type Sel = { type: 'node'; id: string; dom: string } | { type: 'hub'; id: string } | { type: 'cloud'; id: CloudKey } | { type: 'cert' } | null;

export type ChatMsg = { role: 'assistant' | 'user'; text: string };
export type Proposal = {
  interests: { label: string; domain: string }[];
  ambition: { text: string; horizon?: string; domains?: string[] } | null;
};
export type AvatarState = { initials: string; bg: string; photo: string | null };

export type AppState = {
  screen: Screen; view: View; sel: Sel; detailId: string | null; origin: Screen;
  libQ: string; libOb: string; libLevel: string; libFormat: string; libDom: string;
  teamTab: string; adminQ: string; adminStatus: string; drawerOpen: boolean; importQ: string;
  blState: string | null; maps: Record<string, Mapping[]>; pending: Record<string, boolean>; mapSel: string | null; overStage: string | null;
  toast: string | null; noteOpen: boolean; myRating: string;
  projSel: string; clouds: Record<CloudKey, boolean>;
  // The certification layer of the growth map: shown or not, and the trajectory the radar highlights.
  certOn: boolean; certFocus: string | null;
  // The assistant chat and its proposal belong to one person (chatFor), never to whoever is viewed next.
  chatInput: string; chatBusy: boolean; proposal: Proposal | null; chatFor: string | null;
  // Avatar edits shown before the save round-trips, for the person being edited.
  avatarEdit: { userId: string; initials?: string; bg?: string; photo?: string | null } | null;
  chat: ChatMsg[];
  // curriculum mapping: lens, selected audience and stage, signals handled, learner's-eye reads, copilot
  mapLens: string; mapAud: string | null; mapStage: string | null; sigDone: Record<string, boolean>; sigAll: boolean;
  // certification trajectories (admin): the tab, the trajectory and step being edited (step by id), and the audience and stage about to be mapped
  trjs: Trajectory[]; trjUsed: string[] | null; trjDelete: string | null; mapMode: 'learn' | 'traj'; trjSel: string | null; trjStep: string | null; trjAud: string; trjStage: string;
  // trajectory plans (admin, Phase 7): the plan record and sources loaded per trajectory id, and the Trajectory AI's state (the trajectory it is working on, and its last failure)
  trjPlans: Record<string, TrjPlanState>; trjAi: { busy: string | null; error: string | null; drafting?: { done: number; total: number } | null };
  // the "Build with AI" panel beside the trajectory editor (it shows the selected trajectory): open, the message being typed, the module being asked about or edited, the bundle search, and Start over waiting for its second click
  trjPanel: { open: boolean; say: string; focus: string | null; editing: string | null; kbq: string; confirm: boolean; applying: boolean };
  // certification trajectories (learner): the page being viewed and where it was opened from, the subject's enrolments and credentials,
  // the proof being typed per step (key subject|trajectory|step), the external credential being added and the renewal being typed
  trjView: string | null; trjOrigin: Screen; trjMine: TrjMine | null; trjLeave: string | null; stepDraft: Record<string, StepDraft>; credForm: CredDraft | null; renewForm: RenewDraft | null;
  reads: Record<string, Read>; readBusy: boolean;
  // growth map: the domain zoomed into (domain key), or null for all domains
  zoom: string | null;
  // the reel panel's check: the option picked per reel this session and whose it is
  answers: Record<string, number>; answersFor: string | null;
  // admin library: the learning being added or edited in the drawer
  libForm: LearnForm | null;
  // Knowledge library (admin): bundles are in memory this session, like the learning catalogue
  bundles: Bundle[]; kbSel: string; kbOpen: boolean; kbTopic: string; kbSearch: string; kbTagF: string | null; kbSort: string; kbTab: string; kbFile: string;
  kbModel: string | null; kbTestModel: string | null; kbTagIn: string; kbValid: [boolean, string][] | null; kbEdit: boolean; kbAdd: { conn: string; name: string; sens: string };
  kbQ: string; kbBusy: boolean; kbAnswerAi: boolean; kbHits: { text: string; src: string; score: number; disp?: number }[] | null; kbAnswer: string;
  cpInput: string; cpBusy: boolean; cpReply: string; cpOpsP: Op[] | null;
  // Create & share: the signed-in person's own work (not the viewed person's), loaded from Supabase.
  create: CreateData | null; createError: string | null; createBusy: boolean; createTab: string; contribSel: string | null; revSel: string | null;
  // rubric ticks and comments per review (contribution|step|slot), the New form, the contribution being edited
  revChecks: Record<string, boolean[]>; revComment: Record<string, string>; nw: NewDraft; editing: string | null; nwKb: string[]; nwKbQ: string; nwAiBusy: boolean;
  // Create & share > New: the Studios hub, the studio or the upload form, and the studio's step (the draft itself is `nw`).
  studio: StudioState;
  polForm: { lines: string[]; formats: string[]; domains: string[]; audiences: string[]; peers: string; expert: boolean; quality: boolean };
  // Learning record (F2): the learner's evidence being typed for one learning (key subject|learning), before it is saved.
  evDraft: { key: string; note: string; link: string; ref: string } | null;
  // Decisions (F2, F3): the comment being written per submission (key person|learning).
  decideNote: Record<string, string>;
  // Certifications tab: the "talk first" comment being written per waiting row (key person|trajectory|step or start); a key is the open field.
  trjTalk: Record<string, string>;
  // Approvals (F3): what waits for the signed-in person (not the viewed one), from waiting_submissions().
  queue: QueueRow[] | null; queueError: string | null;
  // Practice runs shared with the signed-in person (Task 6.4), the second kind of row of the queue.
  sharedRuns: SharedRun[] | null; sharedTotal: number; sharedError: string | null;
  // Completion per type (v0.7.2): the classroom feedback being written and the avatar quiz's picks, for one learning of
  // one person (key subject|learning), so View as never shows another person's draft.
  fbDraft: { key: string; rating: number | null; text: string } | null;
  quiz: { key: string; picks: Record<number, number>; checked: boolean } | null;
  // v4 formats: what is being done on one learning of one person (key subject|learning): the flash deck, the exam round, the explanation.
  fmt: FmtDraft | null;
  // Classroom attendance (admins): the signed-in admin's roster for one learning, ticks not saved yet and the search.
  att: { learningId: string; rows: RosterRow[] | null; error: string | null; picks: Record<string, boolean>; q: string; busy: boolean } | null;
  // AI: the uses the app may call now (everyone), and per use whether the last attempt was answered by AI or fell back.
  // The AI connections page (System Admin): its data, the connection form (with a typed key until it is saved) and test results.
  aiLive: string[]; aiOut: Record<string, 'ai' | 'scripted'>;
  aiAdmin: AiAdmin | null; aiError: string | null; aiBusy: boolean; aiForm: AiForm | null; aiConfirm: string | null; aiUseEdit: AiUseEdit | null; aiTests: Record<string, { ok: boolean | null; text: string }>;
  // Stock voices (System and General Admins, same page): the list, the add form, and the voice whose sample is loading.
  stockVoices: StockVoice[] | null; voiceForm: StockVoiceForm | null; voiceHearing: string | null;
  stockLooks: StockLook[] | null; lookForm: StockLookForm | null;
};

export type StepDraft = { link: string; ref: string; note: string };
export type CredDraft = { name: string; issuer: string; earned: string; expires: string; link: string; ref: string };
// The renewal of credential `id`: a link or certificate number, and the new expiry (external credentials only).
export type RenewDraft = { id: string; link: string; ref: string; expires: string };

// What a draft made from a placeholder step carries (Studios Phase 7): which placeholder it is for, and what the plan says about the module (goals, depth,
// passages of its cited sources, their labels). A draft opened again from My contributions has the placeholder only (no goals, no passages).
export type DraftBrief = { trajectoryId: string; stepId: string; goals: string[]; depth: Depth; passages: string[]; sources: string[] };
// The New content form. line and aud are '' for none; type is the format; lvl stays text for the select; outline and
// sources come from Draft with AI.
export type NewDraft = { line: string; aud: string; type: string; title: string; dom: string; lvl: string; stage: string; take: string; outline: string[]; sources: string[]; ai: boolean; aiNote: string; items?: DraftItems;
  // Generic studios (Task 1.2): the Shape answers (question to answer), the Produce choices (row label to option), the picked stock look and voices
  // (role label to stock name) and the build steps' state. A studio's rows live in `items` like every format's.
  shape?: Record<string, string>; produce?: Record<string, string>; cast?: Record<string, string>; build?: BuildStepState[];
  // The placeholder step this draft is the material for, with its module's brief (see DraftBrief).
  brief?: DraftBrief;
  // The row this draft was saved as while it is on screen (a studio check saves it); the studio and the upload form both continue it.
  // A new draft (blankDraft) has none.
  savedId?: string;
  // Which new draft this is (blankDraft gives each form its own): a long job tells its draft from a fresh form by it (sameDraft).
  key?: string;
  // The server's house-rules verdict on the built game, as this session last read it: undefined not known, null none yet (studioGame.ts).
  gameReview?: GameReviewStatus | null;
  // What that verdict was for (reviewBasis): an edit of the title, rows or answers it read makes it stale on screen, as the server's hash will say.
  gameReviewFor?: string };

// Knowledge library: retrieval models and bundles
export type RagPreset = { name: string; embed: string; chunk: string; overlap: string; topk: string; hybrid: number; thresh: string; rerank: boolean; gen: string; temp: string; cite: string };
export type RagModel = RagPreset & { id: string; def: boolean };
// name, connector, size, chunks, last sync, sensitivity (public, internal, client, licensed)
export type BundleSource = [string, string, string, number, string, string];
// slug, kind, title, summary, body, related slugs, tags, source indexes
export type Concept = [string, string, string, string, string, string[], string[], number[]];
export type Bundle = {
  id: string; name: string; owner: string; topic: string; topics2: string[]; desc: string; access: string; fresh: string; status: string; updated: string; usedBy: number;
  tags: string[]; sugg: [string, number][]; models: RagModel[]; sources: BundleSource[]; chunks: [number, string][]; concepts: Concept[];
  line?: string | null; // owning business line; null = firm-wide (General and System Admins edit it)
};

// Per-format progress kept in learner_learnings.detail (a JSON object; save_learning's p_detail, the owner only).
export type DetailOf = {
  flash: { due: Record<string, string> };   // card id -> ISO date it is next due
  exam: { best: number };                    // best score, in percent
  case: Record<string, never>;
  teach: { text: string; score?: number; ai?: boolean };
  stretch: { checks: number[] };             // indexes of the ticked checkpoints
  webinar: { registered: boolean };
  aid: { ticks: number[] };                  // indexes of the ticked items
  explainer: { last: boolean; best?: number }; // the last step seen; the check's best score, in percent
  motion: { played?: boolean; read?: boolean }; // played to the end; the text version read
  horizon: { last?: boolean };                 // the last slide of the route reached
  slides: { last?: boolean };                  // the last slide finished playing
  podcast: { last?: boolean };                 // the last chapter or turn finished playing
};
export type LearningDetail = Partial<DetailOf[keyof DetailOf]>;

// A teach-back check: which criteria are met, short feedback and a follow-up question (empty when scripted). by: who checked it.
export type TeachResult = { score: number; hits: boolean[]; feedback: string; follow: string; by: 'keyword' | 'ai' };
// Session state of the v4 formats for one learning (null fields: not started, read from the saved detail).
export type FmtDraft = {
  key: string;
  flip: boolean; queue: number[] | null; at: number; again: number; good: number; due: Record<string, string> | null;
  qAt: number; pick: number | null; checked: boolean; picks: Record<number, number>;
  text: string | null; busy: boolean; res: TeachResult | null;
  seen: boolean; // the explainer's last step was reached in this session (its completion is saved once)
};

// `id` is the open studio (Flash card & Exam Studio when absent); `step` indexes visibleSteps of that studio.
// check: what the automatic check ran on (key, see createVals) and the reasons it failed (none: passed).
export type StudioState = { view: 'hub' | 'studio' | 'form'; step: number; id?: string; check?: { key: string; reasons: string[] } };
