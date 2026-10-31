import type { RunKind } from '../data/types.ts';

// what each kind of run does: save = it makes a checkpoint and shows the suspend button;
// rewards = its boss down gives the rewards and the progress (chips, bits, the next shortcut)
export const RUN_KINDS: Record<RunKind, { save: boolean; rewards: boolean }> = {
  dive: { save: true, rewards: true },
  practice: { save: false, rewards: false },
};
