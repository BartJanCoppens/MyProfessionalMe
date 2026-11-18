// Build runners per studio id: the real work of one build step (BuildRunner, src/logic/studioBuild.ts) over the draft on
// screen, and how many of the studio's build steps its own output shows done (fitBuilt). A studio without one cannot
// build (StudioBuild says so). Each phase registers its studio here when it ships: Motion in Task 2.3, Slides in Task 3.4.
import type { BuildRunner } from './logic/studioBuild';
import type { StudioEntry } from './logic/studios';
import type { BuildCtx } from './studioDraft';
import { motionBuilt, motionRunner } from './studioMotion';
import { slidesBuilt } from './logic/slidesContent';
import { slidesRunner } from './studioSlides';

export type { BuildCtx };
export const BUILDS: Record<string, { runner: (ctx: BuildCtx) => BuildRunner; built: (items: StudioEntry[], shape: Record<string, string>) => number }> = {
  motion: { runner: motionRunner, built: motionBuilt },
  slides: { runner: slidesRunner, built: slidesBuilt },
};
