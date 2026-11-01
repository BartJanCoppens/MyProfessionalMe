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

export type Screen = 'map' | 'library' | 'detail' | 'projects' | 'profile' | 'team' | 'adminLib' | 'adminMap' | 'users';

// What the signed-in account may administer (from public.user_roles).
export type Access = { isSystem: boolean; domains: string[]; userId: string };
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
  cpInput: string; cpBusy: boolean; cpReply: string; cpOpsP: Op[] | null;
};
