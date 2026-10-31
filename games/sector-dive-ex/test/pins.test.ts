// Pins what is built from a fixed seed: each sector's floors (meshes, props, enemies), the bosses, the enemies, the guns
// and the pickups, as hashes kept in __snapshots__. A refactor that should not change the looks leaves them all alone;
// a change meant to alter one updates the snapshot (npx vitest run --project sector-dive-ex -u) and says so in its PR.
// Nothing is drawn: the hashes read the geometry, the placement and the materials, not the painted pixels (those
// differ between machines), so a texture counts only by its size.
import { afterAll, beforeAll, expect, test } from 'vitest';
import * as THREE from 'three';
import { scene } from '@engine/render/render.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { ENEMY } from '../src/data/enemies.ts';
import { WEAPON_ORDER } from '../src/data/weapons.ts';
import { player } from '../src/actors/player.ts';
import { rollWeapon } from '../src/actors/weapons.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { boss, enemies } from '../src/world/entities.ts';
import { devPlainLooks } from '../src/world/looks.ts';
import { buildEnemyMesh, buildPickupMesh } from '../src/world/models.ts';
import { gunLook } from '../src/world/models/gunLooks.ts';
import type { PickupKind } from '../src/data/types.ts';
import { bootFixed, clearEnemies, enterSector, seedDice, unbootFixed } from './fixed.ts';

// FNV-1a of a string, as hex
function fnv(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
// numbers to 1/1000, so that a float a hair off on another machine does not count
const q = (a: ArrayLike<number>): string => Array.from(a, v => Math.round(v * 1000)).join(',');

const geoHashes = new Map<string, string>();
function geoHash(g: THREE.BufferGeometry): string {
  let h = geoHashes.get(g.uuid);
  if (!h) {
    const attrs = Object.keys(g.attributes)
      .sort()
      .map(n => n + ':' + q(g.attributes[n]!.array as ArrayLike<number>));
    h = fnv(attrs.join('|') + '|' + (g.index ? q(g.index.array) : '') + '|' + JSON.stringify(g.groups));
    geoHashes.set(g.uuid, h);
  }
  return h;
}
function matSig(m: THREE.Material): string {
  const o = m as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    map?: THREE.Texture | null;
    opacity: number;
  };
  const img = o.map?.image as { width?: number; height?: number } | undefined;
  return [
    m.type,
    o.color?.getHexString() ?? '',
    o.emissive?.getHexString() ?? '',
    o.opacity.toFixed(3),
    m.transparent ? 't' : '',
    m.side,
    m.blending,
    m.depthWrite ? 'w' : '',
    img ? `${img.width}x${img.height}` : '',
  ].join(',');
}
// every drawn thing under root (its kind, shape, place, instances and materials), as one hash that does not depend
// on the order the things were added in
function hashTree(root: THREE.Object3D): string {
  root.updateMatrixWorld(true);
  const rows: string[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(matSig).join(';');
    const inst = o as THREE.InstancedMesh;
    const instances = inst.isInstancedMesh ? inst.count + ':' + fnv(q(inst.instanceMatrix.array)) : '';
    rows.push(
      [o.type, o.visible ? 'v' : 'h', geoHash(m.geometry), q(o.matrixWorld.elements), instances, mats].join('|'),
    );
  });
  return rows.length + ':' + fnv(rows.sort().join('\n'));
}
// the enemies on the floor: their kinds and places
const hashEnemies = (): string =>
  enemies.length +
  ':' +
  fnv(enemies.map(e => `${e.boss ? e.kind : e.type},${Math.round(e.x * 100)},${Math.round(e.z * 100)}`).join('|'));

beforeAll(bootFixed);
afterAll(unbootFixed);

BIOMES.forEach((b, bi) => {
  test(`sector ${b.code}`, () => {
    enterSector(bi, 0);
    const first = {
      scene: hashTree(scene),
      enemies: hashEnemies(),
      at: `${Math.round(player.x)},${Math.round(player.z)}`,
    };
    enterSector(bi, 'last');
    clearEnemies();
    expect({ first, last: hashTree(scene) }).toMatchSnapshot();
  });
});

test('bosses', () => {
  // the bosses stand where the sector tests above leave the run (the last sector's lowest floor): entered here too, so
  // that the test does not lean on the order (alone, it would spawn them on the floor the run began on)
  enterSector(BIOMES.length - 1, 'last');
  clearEnemies();
  const got: Record<string, string> = {};
  BOSS_ORDER.forEach(kind => {
    seedDice();
    clearEnemies();
    spawnBoss(kind);
    const parts = [boss!.mesh, ...(boss!.extra ?? [])];
    got[kind] = parts.map(hashTree).join(' ');
  });
  clearEnemies();
  expect(got).toMatchSnapshot();
});

test('enemies, guns and pickups', () => {
  seedDice();
  const got: Record<string, string> = {};
  for (const plain of [false, true]) {
    devPlainLooks(plain);
    const p = plain ? 'plain ' : '';
    Object.keys(ENEMY).forEach(type => {
      got[`${p}enemy ${type}`] = hashTree(buildEnemyMesh(ENEMY[type]!).g);
    });
    (['bit', 'kit', 'chip'] as PickupKind[]).forEach(kind => {
      got[`${p}pickup ${kind}`] = hashTree(buildPickupMesh(kind));
    });
    WEAPON_ORDER.forEach(id => {
      const w = { ...rollWeapon(1), id };
      got[`${p}pickup weapon ${id}`] = hashTree(buildPickupMesh('weapon', w));
    });
  }
  devPlainLooks(false);
  WEAPON_ORDER.forEach(id => {
    got[`gun ${id}`] = hashTree(gunLook(id, 0));
  });
  expect(got).toMatchSnapshot();
});
