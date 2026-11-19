// A course block as the screen shows it (E-learning Studio). Task 1.3 makes the edit view; the player (Task 1.4) adds the learner's answers to the same view.
import { KIND_NAME } from './logic/courseContent';
import type { BlockKind, CourseBlock } from './logic/courseContent';
import { missingOf } from './logic/courseEdit';

export type BlockView = { id: string; kind: BlockKind; name: string; block: CourseBlock; missing: string | null; on: boolean; pick: () => void };
export type BlockMode = 'edit' | 'play';

// `on`: the block is selected in the editor; `pick` selects it. `missing` is what the creator still has to write, in their words.
export const blockView = (b: CourseBlock, o: { on: boolean; pick: () => void }): BlockView =>
  ({ id: b.id, kind: b.block, name: KIND_NAME[b.block], block: b, missing: missingOf(b), ...o });
