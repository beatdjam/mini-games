// The screens the game can be in. Only the title for now; 'briefing', 'play' and the rest come with the prototype.
export type GameState = 'title';

// What a state means to the game, kept one per state in data/states.ts.
export interface StateDef {
  playing: boolean;
}
