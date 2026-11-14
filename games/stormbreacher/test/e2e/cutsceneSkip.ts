// A cutscene takes no skip for CUTSCENE_SKIP_GUARD_SEC after it starts, so the tests that skip one wait that out first.
import { currentGame } from '../../src/app/play.ts';
import { CUTSCENE_SEC, CUTSCENE_SKIP_GUARD_SEC } from '../../src/data/script.ts';

export function pastSkipGuard(): boolean {
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  const cutscene = game.script.cutscene;
  return cutscene !== null && CUTSCENE_SEC[cutscene.id] - cutscene.left >= CUTSCENE_SKIP_GUARD_SEC + 0.1;
}
