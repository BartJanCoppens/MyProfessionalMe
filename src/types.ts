import type { CreateData } from './logic/contribution';
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

// A change to one audience's mappings, from a signal, the copilot or a drag.
export type Op = { op: 'add' | 'remove' | 'setOb'; aud: string; lid: string; stage?: string; ob?: string };
export type Signal = { id: string; kind: string; st: string; op: Op; evidence: string; quote: string };
export type Persona = [string, string, string, string, Record<string, string | null>];
export type Read = { text: string; fix: string };

export type CloudKey = 'proj' | 'pers' | 'amb';
export type CloudMeta = {
  label: string; long: string; laneLabel: string; laneSub: string; color: string; text: string; wash: string;
  anchor: number; frac: number; screen: Screen; goLabel: string;
};

export type Screen = 'map' | 'library' | 'detail' | 'projects' | 'profile' | 'team' | 'create' | 'adminLib' | 'adminMap' | 'adminKb' | 'users';

// What the signed-in account may administer (from public.user_roles).
// isGeneral: General Admin, edits all content (catalogue, every curriculum audience, all bundles) but no users.
export type Access = { isSystem: boolean; isGeneral?: boolean; domains: string[]; userId: string };
// Catalogue entry metadata: owning business line (null = firm-wide) and publication status.
// The admin library form; numbers stay text while typing. line '' = firm-wide.
export type LearnForm = { id: string | null; title: string; domain: string; level: string; format: string; source: string; hours: string; cpd: string; why: string; line: string; status: LearnMeta['status'] };
// Podcast and reel players (design v3)
export type PodMedia = { kind: 'pod'; by: string; len: string; dur: number; ch: [number, string][] };
export type ReelMedia = { kind: 'reel'; by: string; len: string; dur: number; caps: string[]; take: string; q: string; opts: string[]; a: number };
export type Media = PodMedia | ReelMedia;
// owner: whose app playback started in; the clock stops when the viewed person changes
export type MediaState = { playing: string | null; owner?: string | null; pos: Record<string, number>; speed: string };
export type LearnMeta = { line: string | null; status: 'published' | 'review' | 'draft' };
export type View = 'constellation' | 'radar' | 'road';
export type Sel = { type: 'node'; id: string; dom: string } | { type: 'hub'; id: string } | { type: 'cloud'; id: CloudKey } | null;

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
  projSel: string; clouds: Record<CloudKey, boolean>; share: Record<string, string>;
  // The assistant chat and its proposal belong to one person (chatFor), never to whoever is viewed next.
  chatInput: string; chatBusy: boolean; proposal: Proposal | null; chatFor: string | null;
  // Avatar edits shown before the save round-trips, for the person being edited.
  avatarEdit: { userId: string; initials?: string; bg?: string; photo?: string | null } | null;
  chat: ChatMsg[];
  // curriculum mapping: lens, selected audience and stage, signals handled, learner's-eye reads, copilot
  mapLens: string; mapAud: string | null; mapStage: string | null; sigDone: Record<string, boolean>;
  reads: Record<string, Read>; readBusy: boolean;
  // growth map: the domain zoomed into (domain key), or null for all domains
  zoom: string | null;
  // podcast and reel players: what plays, positions this session, podcast speed; reel answers and whose they are
  media: MediaState; answers: Record<string, number>; answersFor: string | null;
  // admin library: the learning being added or edited in the drawer
  libForm: LearnForm | null;
  // Knowledge library (admin): bundles are in memory this session, like the learning catalogue
  bundles: Bundle[]; kbSel: string; kbOpen: boolean; kbTopic: string; kbSearch: string; kbTagF: string | null; kbSort: string; kbTab: string; kbFile: string;
  kbModel: string | null; kbTestModel: string | null; kbTagIn: string; kbValid: [boolean, string][] | null; kbEdit: boolean; kbAdd: { conn: string; name: string; sens: string };
  kbQ: string; kbBusy: boolean; kbHits: { text: string; src: string; score: number; disp?: number }[] | null; kbAnswer: string;
  cpInput: string; cpBusy: boolean; cpReply: string; cpOpsP: Op[] | null;
  // Create & share: the signed-in person's own work (not the viewed person's), loaded from Supabase.
  create: CreateData | null; createError: string | null; createBusy: boolean; createTab: string; contribSel: string | null; revSel: string | null;
  // rubric ticks and comments per review (contribution|step|slot), the New form, the contribution being edited
  revChecks: Record<string, boolean[]>; revComment: Record<string, string>; nw: NewDraft; editing: string | null; nwKb: string[]; nwAiBusy: boolean;
  polForm: { topic: string; peers: string; expert: boolean; quality: boolean };
};

// The New content form. topic is a topicKey; lvl stays text for the select; outline and sources come from Draft with AI.
export type NewDraft = { topic: string; type: string; title: string; dom: string; lvl: string; stage: string; take: string; outline: string[]; sources: string[]; ai: boolean; aiNote: string };

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
