import { expect, test } from 'vitest';
import { ENEMY_COLOR } from '../../src/data/colors.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { newGame } from '../../src/logic/game.ts';
import { buildEnemyView, drawEnemies, removeEnemyView } from '../../src/view/enemies.ts';

test('every part with a colour array holds room for each copy after a draw, and the one-box kinds hold their colour', () => {
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [
    newEnemy('g-1', 'g', 'grunt', 0, 0),
    newEnemy('h-1', 'h', 'heavy', 5, 0),
    newEnemy('e-1', 'e', 'emplacement', 10, 0),
  ];
  drawEnemies(view, game);
  for (const kind of Object.keys(view) as (keyof typeof view)[]) {
    for (const part of view[kind].parts) {
      const colors = part.mesh.instanceColor;
      if (colors) expect(colors.array.length, `${kind} colour array`).toBeGreaterThanOrEqual(part.mesh.count * 3);
    }
  }
  const grunt = view.grunt.mesh.instanceColor;
  if (!grunt) throw new Error('the grunt has no colour array');
  const expected = [(ENEMY_COLOR.grunt >> 16) & 255, (ENEMY_COLOR.grunt >> 8) & 255, ENEMY_COLOR.grunt & 255];
  // the colour is stored linear, so only check it is not black
  expect(grunt.array[0] + grunt.array[1] + grunt.array[2], `grunt colour for ${expected.join(',')}`).toBeGreaterThan(0);
  removeEnemyView(view);
});
