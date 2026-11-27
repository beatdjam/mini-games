import { expect, test } from 'vitest';
import * as THREE from 'three';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PLAY_BATTLE_TUNE } from '../../src/data/tune.ts';
import { newBattle } from '../../src/logic/battle.ts';
import { stream } from '../../src/logic/rng.ts';
import { buildBattle } from '../../src/view/battle/index.ts';
import { SMOKE_MESH_NAME } from '../../src/view/battle/parts.ts';

test('the battle smoke is one see-through instanced mesh of plates, not boxes', () => {
  const tune = { ...PLAY_BATTLE_TUNE, shellEvery: 0.05, smokeCubes: 10 };
  const battle = buildBattle(M1B_HAND, tune, stream('battle'), stream('craters'), { x: 0, z: 166 }, null);
  for (let i = 0; i < 60 && battle.smoke() === 0; i++) battle.step(1 / 30, { x: 0, y: 0, z: 166 });
  expect(battle.smoke()).toBeGreaterThan(0);

  const smokes: THREE.InstancedMesh[] = [];
  battle.group.traverse(object => {
    if (object.name === SMOKE_MESH_NAME) smokes.push(object as THREE.InstancedMesh);
  });
  // one mesh for all the puffs: no draw call is added
  expect(smokes).toHaveLength(1);
  const mesh = smokes[0];
  expect(mesh.count).toBe(battle.smoke());
  expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
  expect(mesh.geometry).not.toBeInstanceOf(THREE.BoxGeometry);
  const material = mesh.material as THREE.MeshBasicMaterial;
  expect(material.transparent).toBe(true);
  expect(material.depthWrite).toBe(false);
  battle.dispose();
});

test('a battle that draws the game’s own state is not moved by advance or blast', () => {
  const given = newBattle(stream('crowd'), M1B_HAND.bounds, PLAY_BATTLE_TUNE, 150);
  const before = JSON.stringify(given);
  const battle = buildBattle(
    M1B_HAND,
    PLAY_BATTLE_TUNE,
    stream('battle'),
    stream('craters'),
    { x: 0, z: 166 },
    150,
    [],
    given,
  );
  battle.advance(80, 20);
  const soldier = given.crowd.soldiers[0];
  battle.blast(soldier.x, soldier.z);
  expect(JSON.stringify(given)).toBe(before);
  battle.dispose();
});
