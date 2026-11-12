// A game past its opening cutscene. A new game plays the landing cutscene, and the mech takes no input meanwhile, so the
// tests that move or shoot start from here. The first step (of no length) starts the script; the skip ends the cutscene.
import { M1 } from '../../src/data/missions/m1.ts';
import type { MapDef, MissionDef } from '../../src/data/types.ts';
import { newGame, sendToScript, step, type GameModel } from '../../src/logic/game.ts';

export function newPlayGame(map: MapDef, mission: MissionDef = M1): GameModel {
  const game = newGame(map, mission);
  step(game, { moveX: 0, moveZ: 0, turn: 0, jump: false, jumpHeld: false, boost: false, fire: false, sub: false }, 0);
  sendToScript(game, { kind: 'skip' });
  game.events = [];
  return game;
}
