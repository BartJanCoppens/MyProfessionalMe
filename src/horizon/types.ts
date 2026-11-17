// The .horizon format as the player reads it (studios plan, Task 3.3), copied from Horizon's src/types.ts and
// src/offline.ts (the owner's own project; S7: copy, never import across repos). Only what presenting draws is kept;
// every deck from a file goes through cleanDeck.ts first, which drops anything else: comments, the AI chat, versions,
// source documents, a Calc animation's program and payload, conversation avatars' setup, and every link that leaves the
// file (pictures, clips and audio must be data: URLs).

export type PresetType = 'bars' | 'trend' | 'flow' | 'orbit' | 'timeline' | 'counter' | 'network' | 'pyramid' | 'tree' | 'circles';
export type VizType = PresetType | 'custom';
export type LayoutId = 'auto' | 'title' | 'statement' | 'visualRight' | 'visualLeft' | 'headline' | 'focus' | 'columns' | 'quote' | 'fallback' | 'blank';
export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'line' | 'arrow';
/** A slide-theme colour (follows the slide's theme) or a fixed colour (#rrggbb). */
export type ObjectInk = 'accent' | 'accent2' | 'light' | 'tint' | 'text' | 'muted' | 'surface' | 'none' | `#${string}`;
export type Motion = 'high' | 'medium' | 'low';

export interface VizItem { label: string; value?: number; note?: string; more?: (number | null)[] }
/** A chart or, `custom`, an original animated SVG (sanitised whenever it is drawn: SafeSvg). */
export interface Viz { type: VizType; items: VizItem[]; center?: string; suffix?: string; series?: string[]; svg?: string }

/** An avatar's prepared clip: its still picture and its clip (a key in the deck's `media`), when it speaks. */
export interface SlideAvatar { name: string; speaks: 'arrival' | 'cue'; still?: string; clip?: { media: string; seconds: number } }
/** An animation from Horizon Calc: only its name and its poster (a PNG data URL) are kept; its program never runs here. */
export interface SlideAnimation { name: string; poster: string }
/** A case's last result as plain text (Horizon's CaseShot); the explorer itself is not part of the player. */
export interface CaseShot { title: string; label: string; facts: string[]; answers: string[]; notes: string[] }

/** An object placed freely on a slide, in slide pixels (800 × 450). */
export interface SlideObject {
  id: string;
  kind: 'text' | 'shape' | 'picture' | 'chart' | 'animation' | 'avatar' | 'case';
  x: number; y: number; w: number; h: number;
  rotate?: number;
  text?: string; size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; font?: string; color?: ObjectInk;
  shape?: ShapeKind; flipX?: boolean; flipY?: boolean; fill?: ObjectInk; line?: ObjectInk; weight?: number;
  image?: string; alt?: string;
  viz?: Viz;
  animation?: SlideAnimation;
  avatar?: SlideAvatar;
  case?: CaseShot;
}

export interface Frame {
  id: string;
  x: number; y: number;
  next: string[];
  title: string; body: string;
  viz: Viz | null;
  image?: string | null; imageAlt?: string; imageBlend?: boolean;
  /** The slide theme's key (SLIDE in slideTheme.ts) or 'custom'. */
  theme?: string;
  titleFont?: string; bodyFont?: string; titleScale?: number; bodyScale?: number;
  layout?: LayoutId;
  tag?: string;
  hue?: number;
  objects?: SlideObject[];
  section?: { frames: Frame[]; theme: Theme };
}

export interface Theme {
  canvas: string; canvasCustom: string; slide: string; slideCustom: string;
  hue?: number | null;
  slideMotion?: Motion;
  worldMotion?: Motion;
}

export type PassageAudio = { key: string; seconds: number; marks: { kind: 'next' | 'cue'; at: number }[] };
/** One passage of a narrative: the words told on a slide (with ⟨next⟩ and ⟨cue⟩ marks) and, once voiced, its audio. */
export interface Passage { id: string; part: string; text: string; audio?: PassageAudio }
export interface Narrative { id: string; name: string; passages: Passage[]; pace?: number }

/** A presentation as the player shows it. `media`: clips and voices by key, as data: URLs. */
export interface Deck { title: string; theme: Theme; frames: Frame[]; narratives: Narrative[]; media: Record<string, string> }
