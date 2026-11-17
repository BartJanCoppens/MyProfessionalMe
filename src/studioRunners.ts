// Build runners per studio id: the real work of one build step (BuildRunner, src/logic/studioBuild.ts).
// Phase 1 has none: no available studio has a build. Each later phase registers its runner here when its studio ships.
import type { BuildRunner } from './logic/studioBuild';

export const BUILD_RUNNERS: Record<string, BuildRunner> = {};
