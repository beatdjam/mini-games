// The hand written course, in chapter order. Generated drills are added in core/content/catalog.ts.
import type { Level } from '../types.ts';
import { MOVE_LEVELS } from './01-move.ts';
import { EDIT_LEVELS } from './02-edit.ts';
import { OPERATOR_LEVELS } from './03-operators.ts';
import { YANK_LEVELS } from './04-yank.ts';
import { FIND_LEVELS } from './05-find.ts';
import { MORE_MOVE_LEVELS } from './06-more-move.ts';
import { VISUAL_LEVELS } from './07-visual.ts';
import { PRACTICE_LEVELS } from './08-practice.ts';
import { TEXT_OBJECT_LEVELS } from './09-text-objects.ts';

export const LEVELS: Level[] = [
  ...MOVE_LEVELS,
  ...EDIT_LEVELS,
  ...OPERATOR_LEVELS,
  ...YANK_LEVELS,
  ...FIND_LEVELS,
  ...MORE_MOVE_LEVELS,
  ...VISUAL_LEVELS,
  ...PRACTICE_LEVELS,
  ...TEXT_OBJECT_LEVELS,
];
