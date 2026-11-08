// The game's state and the entry for updating it by one frame. Nothing here reads three or the DOM, so a test runs it
// in node without a page.

export interface GameModel {
  time: number; // seconds since the sortie began
  // the mech, the enemies and the script's state join here later
}

// A new sortie.
export function newGame(): GameModel {
  return { time: 0 };
}

// One frame.
export function step(game: GameModel, dt: number): void {
  game.time += dt;
  // the input joins the arguments in SB-025 and SB-030
}
