// A game past its opening cutscene. A new game plays the landing cutscene with the mech on the craft's deck, and the mech
// takes no input meanwhile, so the tests that move or shoot start from here. The first step (of no length) starts the
// script; the skip ends the cutscene. The mech is put back on the sand at its old start (0, 166), so a test that teleports
// it does not have to know where the deck is.
import { M1 } from '../../src/data/missions/m1.ts';
import type { MapDef, MissionDef } from '../../src/data/types.ts';
import { newGame, sendToScript, step, type GameModel } from '../../src/logic/game.ts';

export function newPlayGame(map: MapDef, mission: MissionDef = M1): GameModel {
  const game = newGame(map, mission);
  step(game, { moveX: 0, moveZ: 0, turn: 0, jump: false, jumpHeld: false, boost: false, fire: false, sub: false }, 0);
  sendToScript(game, { kind: 'skip' });
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = 166;
  // the mech has stepped off the craft: the script puts the beach's allies out now
  sendToScript(game, { kind: 'ashore' });
  game.events = [];
  return game;
}
