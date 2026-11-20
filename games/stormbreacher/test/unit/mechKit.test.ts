import { expect, test } from 'vitest';
import * as THREE from 'three';
import { PROTO_KIT_IDS, PROTO_KITS, PROTO_MATERIALS } from '../../src/data/mechProto.ts';
import { buildProtoMech, countProtoDraws, disposeProtoMech, protoMuzzle } from '../../src/view/mechProtoModel.ts';

// SB-2081: the player's kit is the three views' white machine on the common skeleton. It still costs one mesh per
// material: the new head, chest, shoulders, back, weapon and ammo feed share the same four bins.
test('the player kit is the three views’ machine: four draws, its own triangles and shapes', () => {
  const mech = buildProtoMech(8);
  const stats = countProtoDraws(mech);
  console.log(`player kit: ${stats.calls} calls, ${stats.triangles} triangles, ${stats.shapes} shapes`);
  expect(stats.calls).toBe(4);
  expect(stats.triangles).toBe(17808);
  expect(stats.shapes).toBe(192);
  disposeProtoMech(mech);
});

test('the player’s cannon has a muzzle at the barrel tip, in front of the mech', () => {
  const mech = buildProtoMech(8);
  const muzzle = protoMuzzle(mech);
  expect(muzzle).not.toBeNull();
  // the gun is held at the right of the middle and the barrels leave well ahead of the chest
  expect(muzzle!.x).toBeGreaterThan(0);
  expect(muzzle!.z).toBeLessThan(-2);
  expect(muzzle!.y).toBeGreaterThan(2);
  disposeProtoMech(mech);
});

test('every kit builds with one draw per material, and different parts make a different shape', () => {
  const triangles = new Map<string, number>();
  for (const id of PROTO_KIT_IDS) {
    const mech = buildProtoMech(8, id);
    const stats = countProtoDraws(mech);
    console.log(`${id}: ${stats.calls} calls, ${stats.triangles} triangles, ${stats.shapes} shapes`);
    expect(stats.calls).toBeLessThanOrEqual(Object.keys(PROTO_MATERIALS).length);
    expect(stats.calls).toBeGreaterThan(0);
    expect(stats.triangles).toBeGreaterThan(0);
    // one mesh per material: a kit that reuses a material cannot have split it into a second draw
    const materials = new Set<string>();
    mech.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh === true && (mesh as THREE.SkinnedMesh).isSkinnedMesh === true) {
        materials.add((mesh.material as THREE.Material).uuid);
      }
    });
    expect(materials.size).toBe(stats.calls);
    triangles.set(id, stats.triangles);
    disposeProtoMech(mech);
  }
  expect(triangles.get('sniper')).not.toBe(triangles.get('player'));
  expect(triangles.get('enemy')).not.toBe(triangles.get('player'));
});

// SB-2084: the boss is one size larger than the line machines (its kit's scale), wears its own parts (including the claw
// in the free hand) and still costs one draw per material.
test('the boss kit stands larger and wears its own parts at the same four draws', () => {
  const boss = buildProtoMech(8, 'boss');
  const stats = countProtoDraws(boss);
  console.log(`boss kit: ${stats.calls} calls, ${stats.triangles} triangles, ${stats.shapes} shapes`);
  expect(stats.calls).toBe(4);
  expect(PROTO_KITS.boss.scale).toBeGreaterThan(1);
  expect(PROTO_KITS.boss.handL).toBe('claw');
  const player = buildProtoMech(8, 'player');
  // the rig's hip sits at the kit's height, so the ratio is the kit's scale (the boss's turret reaches above its head)
  const hip = (root: THREE.Object3D): number => root.getObjectByName('root')?.position.y ?? 0;
  expect(hip(boss) / hip(player)).toBeCloseTo(PROTO_KITS.boss.scale ?? 1, 2);
  disposeProtoMech(player);
  disposeProtoMech(boss);
});
