// A broken pillbox sinks into the sand and leans toward the land over PILLBOX_BREAK.sec, and the second one down brings
// the radio line, the flag and cp1 (SB-1550).
import { afterAll, beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { PILLBOX_BREAK } from '../../src/data/pillbox.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { sendToScript } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

const WRECK_SCALE_Y = 0.35; // view/world.ts's WRECK_SCALE_Y, which a broken target ends at

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

afterAll(() => {
  LOOP.maxDt = 0.05; // the page's own clock again
});

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// A heavy-gun shot from the pillbox's side, as a player would make it: the health is left at 1 and the shot starts just
// outside the box, so the game's own hit reports `destroyed` (sendToScript is not called).
function breakFromSide(id: string): void {
  const current = game();
  const target = current.targets.find(entry => entry.id === id);
  if (!target) throw new Error(`the map has no ${id}`);
  target.hp = 1;
  const { box } = target;
  current.bullets.push({
    weapon: 'heavyGun',
    x: box.minX - 0.5,
    y: (box.minY + box.maxY) / 2,
    z: (box.minZ + box.maxZ) / 2,
    dx: 1,
    dy: 0,
    dz: 0,
    left: WEAPONS.heavyGun.range,
  });
}

function meshOf(id: string): THREE.Mesh {
  const mesh = scene.getObjectByName(id);
  if (!(mesh instanceof THREE.Mesh)) throw new Error(`the scene has no mesh ${id}`);
  return mesh;
}

test('a broken pillbox sinks and leans, and the second brings the radio, the flag and cp1', () => {
  startSortie();
  // the test owns the clock from here: drawn frames add no time, and every step is one of the game's own
  LOOP.maxDt = 0;
  runSystems(1 / 60); // the start cue puts the landing cutscene up
  sendToScript(game(), { kind: 'skip' });
  runSystems(1 / 60);
  expect(game().script.cutscene).toBeNull();

  breakFromSide('pillbox-1');
  runSystems(1 / 60);
  expect(game().targets.find(target => target.id === 'pillbox-1')?.hp).toBe(0);

  // the frame it broke: still nearly whole, and not yet sunk
  const mesh = meshOf('pillbox-1');
  expect(mesh.scale.y).toBeGreaterThan(WRECK_SCALE_Y);
  expect(Math.abs(mesh.position.y)).toBeLessThan(PILLBOX_BREAK.sink * 0.1);

  // PILLBOX_BREAK.sec of the game's time: fully down, fully sunk, fully leaning
  const steps = Math.ceil(PILLBOX_BREAK.sec * 60) + 1;
  for (let i = 0; i < steps; i++) runSystems(1 / 60);
  expect(mesh.scale.y).toBeCloseTo(WRECK_SCALE_Y);
  expect(mesh.position.y).toBeCloseTo(-PILLBOX_BREAK.sink);
  expect(mesh.rotation.x).toBeCloseTo(-PILLBOX_BREAK.lean);

  // it stays down: two more frames with its health still gone do not sink it again
  runSystems(1 / 60);
  runSystems(1 / 60);
  expect(mesh.scale.y).toBeCloseTo(WRECK_SCALE_Y);
  expect(mesh.position.y).toBeCloseTo(-PILLBOX_BREAK.sink);

  // the second one down fires cp1: the radio line, the flag and the checkpoint
  breakFromSide('pillbox-2');
  runSystems(1 / 60);
  expect(game().targets.find(target => target.id === 'pillbox-2')?.hp).toBe(0);
  expect(game().radio?.line).toBe('m1.pillboxes-down');
  expect(game().script.flags).toContain('pillboxes-down');
  expect(game().checkpoint?.id).toBe('cp1');

  // a pillbox already down when a sortie starts (a checkpoint or a suspend brings one back) is drawn fully down at
  // once: it does not sink again
  startSortie();
  runSystems(1 / 60);
  sendToScript(game(), { kind: 'skip' });
  const restored = game().targets.find(target => target.id === 'pillbox-1');
  if (!restored) throw new Error('the map has no pillbox-1');
  restored.hp = 0;
  runSystems(1 / 60);
  const restoredMesh = meshOf('pillbox-1');
  expect(restoredMesh.scale.y).toBeCloseTo(WRECK_SCALE_Y);
  expect(restoredMesh.position.y).toBeCloseTo(-PILLBOX_BREAK.sink);
  expect(restoredMesh.rotation.x).toBeCloseTo(-PILLBOX_BREAK.lean);
});
