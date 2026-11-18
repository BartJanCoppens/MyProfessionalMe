// How much moves while presenting (studios plan, Task 3.3), copied from Horizon's motion.ts and flight.ts (the
// camera's easing): a presentation's Slide animation level (High builds each slide in; Low holds its visuals still) and
// World animation level (how the camera flies). Absent is Medium. With ?motion=off or reduced motion the player fades
// from slide to slide instead (usePresentation.ts).
import type { Motion, Theme } from './types';

const levelOf = (v: unknown): Motion => (v === 'high' || v === 'low' ? v : 'medium');
export const slideMotion = (t: Theme): Motion => levelOf(t.slideMotion);
export const worldMotion = (t: Theme): Motion => levelOf(t.worldMotion);

/** How long a flight takes: a short plain move at Low, `base` (1.6 s) at Medium, about 2.2 s at High. */
export const flightSeconds = (level: Motion, base = 1.6): number => (level === 'low' ? 0.5 : level === 'high' ? base * 1.375 : base);
/** How far the camera pulls back on a flight `far` slides long: on long flights at Medium, on every flight at High, never at Low. */
export function pullOf(level: Motion, far: number): number {
  const medium = far ? Math.min(350 + far * 220, 1500) : 0;
  return level === 'low' ? 0 : level === 'high' ? Math.max(350, medium) : medium;
}
/** The eye's distance in front of the world (Present mode's perspective, px): a pull of p px shows the world at EYE / (EYE + p). */
export const EYE = 1100;
/** The camera's easing (Horizon's FLIGHT_CURVE), as CSS. */
export const FLIGHT_EASING = 'cubic-bezier(0.65,0,0.35,1)';
