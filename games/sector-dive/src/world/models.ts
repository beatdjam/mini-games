import type { EnemyDef, Laser, PickupKind, Weapon } from '../data/types.ts';
import * as THREE from 'three';
import { V3, basicMat, dynGroup, lineMat } from '@engine/render/render.ts';
import { RARITY, WEAPONS } from '../data/weapons.ts';
import { COLOR } from '../data/colors.ts';
import { edges, geoCache } from './render.ts';
// ================= models =================
// the three.js models of enemies and pickups, and the aimed laser line; entities.ts makes the entity objects around them

// The trooper: boxes on joints. The group's origin is at the hips (def.y above the feet) and it faces +z like the others.
// rig = the joints its walk / aim animation turns (poseHumanoid in src/actors/enemies.ts); body = the upper body (it looks
// around while idle)
function buildHumanoid(def: EnemyDef, mat: THREE.Material) {
  const g = new THREE.Group();
  const part = (key: string, parent: THREE.Object3D, x: number, y: number, z: number, m: THREE.Material = mat) => {
    const o = new THREE.Mesh(geoCache[key], m),
      l = new THREE.LineSegments(edges(key), lineMat(def.color));
    o.position.set(x, y, z);
    l.position.copy(o.position);
    parent.add(o, l);
    return o;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const upper = joint(g, 0, 0, 0);
  part('hTorso', upper, 0, 0.4, 0);
  const neck = joint(upper, 0, 0.78, 0);
  part('hHead', neck, 0, 0.16, 0);
  const visor = new THREE.Mesh(geoCache.hVisor, basicMat(COLOR.mag));
  visor.position.set(0, 0.18, 0.18);
  neck.add(visor);
  const armL = joint(upper, -0.42, 0.68, 0),
    armR = joint(upper, 0.42, 0.68, 0);
  part('hArm', armL, 0, -0.3, 0);
  part('hArm', armR, 0, -0.3, 0);
  part('hGun', armR, 0, -0.66, 0.1, basicMat(0x1d2935)); // along the forearm: points forward when the arm is raised
  const legL = joint(g, -0.17, 0, 0),
    legR = joint(g, 0.17, 0, 0);
  part('hLeg', legL, 0, -0.5, 0);
  part('hLeg', legR, 0, -0.5, 0);
  g.userData.rig = { upper, neck, armL, armR, legL, legR };
  return { g, body: upper };
}
export function buildEnemyMesh(def: EnemyDef) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x10161d, emissive: def.color, emissiveIntensity: 0.4 });
  if (def.humanoid) {
    const h = buildHumanoid(def, mat);
    return { g: h.g, mat, body: h.body };
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(geoCache[def.geo], mat);
  g.add(body, new THREE.LineSegments(edges(def.geo), lineMat(def.color)));
  if (def.geo === 'cyl') {
    const head = new THREE.Mesh(geoCache.chip, basicMat(def.color));
    head.position.y = 1.1;
    g.add(head);
  }
  if (def.shield) {
    const plate = new THREE.Mesh(geoCache.shieldPlate, basicMat(0x2b5f8f)),
      edge = new THREE.LineSegments(edges('shieldPlate'), lineMat(COLOR.shield));
    plate.position.set(0, 0.1, 0.75);
    edge.position.copy(plate.position);
    g.add(plate, edge);
    g.userData.shield = [plate, edge];
  }
  if (def.sniper) {
    const eye = new THREE.Mesh(geoCache.chip, basicMat(COLOR.mag));
    eye.scale.setScalar(0.5);
    eye.position.set(0, 0.7, 0.25);
    g.add(eye);
  }
  return { g, mat, body };
}
// the model of a pickup (a weapon drop takes the weapon `w`); the caller places it
export function buildPickupMesh(kind: PickupKind, w?: Weapon): THREE.Object3D {
  let mesh: THREE.Object3D;
  if (kind === 'bit') mesh = new THREE.Mesh(geoCache.bit, basicMat(COLOR.amber));
  else if (kind === 'kit') {
    mesh = new THREE.Group();
    mesh.add(
      new THREE.Mesh(geoCache.cross1, basicMat(COLOR.lime)),
      new THREE.Mesh(geoCache.cross2, basicMat(COLOR.lime)),
      new THREE.LineSegments(edges('chipOuter'), lineMat(COLOR.lime)),
    );
  } else if (kind === 'chip') {
    mesh = new THREE.Group();
    mesh.add(
      new THREE.Mesh(geoCache.chip, basicMat(COLOR.amber)),
      new THREE.LineSegments(edges('chipOuter'), lineMat(COLOR.amber)),
    );
  } else {
    const col = WEAPONS[w!.id].color; // a weapon drop always carries its weapon
    mesh = new THREE.Group();
    mesh.add(
      new THREE.Mesh(geoCache.wbox, basicMat(col)),
      new THREE.LineSegments(edges('wbox'), lineMat(RARITY[w!.r].hex)),
    );
    mesh.scale.setScalar(1 + w!.r * 0.15);
  }
  return mesh;
}

// ---- aimed laser line (sniper enemy, Phantom) ----
export function makeLaser(color: number): Laser {
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]);
  const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  l.visible = false;
  l.frustumCulled = false;
  dynGroup.add(l);
  return l;
}
export function setLaser(l: Laser, a: number[], b: number[], op: number) {
  const p = l.geometry.attributes.position;
  p.setXYZ(0, a[0], a[1], a[2]);
  p.setXYZ(1, b[0], b[1], b[2]);
  p.needsUpdate = true;
  l.material.opacity = op;
  l.visible = true;
}
