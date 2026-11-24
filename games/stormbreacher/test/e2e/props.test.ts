import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { FORTRESS_SHUTTER_TUNE } from '../../src/data/fortress.ts';
import { MARKER_TUNE, MARKER_MODES } from '../../src/data/marker.ts';
import { blastPropIndexes } from '../../src/logic/blasts.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { draw, steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

// How many copies of a kind are drawn: the instanced meshes under the scene with that name (the chunks may split one).
function drawn(name: string): number {
  let count = 0;
  scene.traverse(child => {
    if (child instanceof THREE.InstancedMesh && child.name === name) count += child.count;
  });
  return count;
}

// How many hedgehog copies are drawn low (a broken or blast-opened one makes its copy this low).
function loweredHedgehogs(): number {
  return loweredCopies('hedgehog');
}

// How many copies of a kind are drawn low (a prop lowered by the fortress blast too).
function loweredCopies(name: string): number {
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  let count = 0;
  scene.traverse(child => {
    if (!(child instanceof THREE.InstancedMesh) || child.name !== name) return;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, matrix);
      matrix.decompose(at, turn, size);
      if (size.y < 0.5) count++;
    }
  });
  return count;
}

test('a sortie draws the low walls and the fortress walls', async () => {
  startSortie();
  steps(1);
  const map = currentGame()?.map;
  if (!map) throw new Error('the sortie has not started');
  for (const kind of ['lowWall', 'fortWall'] as const) {
    const placed = map.props.filter(prop => prop.kind === kind).length;
    expect(placed, kind).toBeGreaterThan(0);
    expect(drawn(kind), kind).toBe(placed);
  }
});

test('a blast lowers the line’s hedgehogs where they stand, with no new mesh', async () => {
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  const blast = game.blasts.find(place => place.id === 'l1-b');
  if (!blast) throw new Error('the map has no l1-b');
  const props = blastPropIndexes(game.map, blast);
  expect(props.length).toBeGreaterThan(0);
  expect(loweredHedgehogs()).toBe(0);

  blast.blasted = true;
  steps(2);
  expect(loweredHedgehogs()).toBe(props.length);
});

// Plays the opening cutscene out, so the sortie draws its rings and lights (a cutscene draws none: SB-2022).
async function endCutscene(game: NonNullable<ReturnType<typeof currentGame>>): Promise<void> {
  sendToScript(game, { kind: 'skip' });
  steps(2);
}

function setMarkerMode(mode: (typeof MARKER_MODES)[number]): void {
  MARKER_TUNE.mode = MARKER_MODES.indexOf(mode);
}

test('the pillboxes’ blast points are drawn, and not once their pillbox is down', async () => {
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  await endCutscene(game);
  const points = game.blasts.length;
  // the lines' four points, the pillboxes' four and the fortress's bomb (SB-1860); the bomb has no ring until the mid
  // boss is down, since nothing can be planted on it before
  expect(points).toBe(9);
  expect(drawn('sb-blast-points')).toBe(points - 1);
  sendToScript(game, { kind: 'wardenDown' });
  steps(1);
  expect(drawn('sb-blast-points')).toBe(points);

  // pillbox-1's two points leave the ground once its guns are down; the other rings stay
  const pillbox = game.targets.find(target => target.id === 'pillbox-1');
  if (!pillbox) throw new Error('the map has no pillbox-1');
  pillbox.hp = 0;
  steps(2);
  expect(drawn('sb-blast-points')).toBe(points - 2);
});

test('a cutscene draws no ring and no light, and they come back when it ends', async () => {
  setMarkerMode('dim');
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  steps(1);
  expect(game.script.cutscene).not.toBeNull();
  expect(drawn('sb-blast-points')).toBe(0);
  expect(drawn('sb-blast-pillars')).toBe(0);
  expect(drawn('sb-blast-diamonds')).toBe(0);
  await endCutscene(game);
  expect(drawn('sb-blast-points')).toBeGreaterThan(0);
  expect(drawn('sb-blast-pillars')).toBeGreaterThan(0);
  expect(drawn('sb-blast-diamonds')).toBeGreaterThan(0);
});

test('a light stands over every blast point of a shot pillbox and of the lines (dim), and goes with its pillbox', async () => {
  setMarkerMode('dim');
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  await endCutscene(game);
  // a point shows no light until its pillbox has been shot: the lines' four stand alone (the fortress's bomb, SB-1860,
  // waits for the mid boss), and the mech is far enough off
  game.mech.x = 0;
  game.mech.z = 166;
  steps(1);
  expect(drawn('sb-blast-pillars')).toBe(4);
  for (const state of game.pillboxes) state.shot = true;
  steps(1);
  expect(drawn('sb-blast-pillars')).toBe(8);
  expect(drawn('sb-blast-diamonds')).toBe(8);

  // pillbox-1's two lights go when its points do; the other six stay
  const pillbox = game.targets.find(target => target.id === 'pillbox-1');
  if (!pillbox) throw new Error('the map has no pillbox-1');
  pillbox.hp = 0;
  steps(2);
  expect(drawn('sb-blast-pillars')).toBe(6);
});

test('`map` draws no light on screen, and `next` draws one that moves on when its pillbox falls', async () => {
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  await endCutscene(game);
  for (const state of game.pillboxes) state.shot = true;
  game.mech.x = 22;
  game.mech.z = -40;
  setMarkerMode('map');
  steps(1);
  expect(drawn('sb-blast-points')).toBe(8); // the bomb waits for the mid boss
  expect(drawn('sb-blast-pillars')).toBe(0);
  expect(drawn('sb-blast-diamonds')).toBe(0);

  setMarkerMode('next');
  steps(1);
  expect(drawn('sb-blast-pillars')).toBe(1);
  expect(drawn('sb-blast-diamonds')).toBe(1);
  const pillbox = game.targets.find(target => target.id === 'pillbox-2');
  if (!pillbox) throw new Error('the map has no pillbox-2');
  pillbox.hp = 0;
  steps(2);
  expect(drawn('sb-blast-pillars')).toBe(1);
  setMarkerMode('dim');
});

// The first object in the scene with this name, anywhere below it.
function find(name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  scene.traverse(child => {
    if (!found && child.name === name) found = child;
  });
  return found;
}

test('the fortress blast lowers its walls where they stand, with no new mesh', async () => {
  startSortie();
  steps(1);
  draw();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  const walls = game.map.props.flatMap((prop, index) =>
    prop.kind === 'fortWall' && prop.collapse === true ? [index] : [],
  );
  // 21 pieces stand; the land wall, the side walls and the door (15) come down, and the sea wall's 6 stay
  const all = game.map.props.filter(prop => prop.kind === 'fortWall').length;
  expect(all).toBe(21);
  expect(walls.length).toBe(15);
  expect(drawn('fortWall')).toBe(all);
  expect(loweredCopies('fortWall')).toBe(0);
  game.brokenProps.push(...walls);
  steps(2);
  draw();
  expect(loweredCopies('fortWall')).toBe(walls.length);
  // the copies stay in the same instanced meshes: no draw was added
  expect(drawn('fortWall')).toBe(all);
});

test('a sortie draws every target of the map, the battery’s parts among them', async () => {
  startSortie();
  steps(1);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  const map = game.map;
  const group = find('targets');
  // the targets, and a plate for each shutter; the warning lights and the two smokes (over a suppressed muzzle and over a
  // nest) hang in the same group but are not targets
  const effects = ['sb-pillbox-warn', 'sb-pillbox-smoke', 'sb-nest-smoke'];
  const children = group?.children.filter(child => !effects.includes(child.name));
  expect(children).toHaveLength(map.targets.length + game.shutters.length);
  for (const id of ['main-gun-1', 'main-gun-2', 'magazine']) {
    expect(
      group?.children.some(child => child.name === id),
      id,
    ).toBe(true);
  }
});

test('the fortress’s gun stands on the sea wall’s top, not on the ground, once its plate is open', async () => {
  startSortie();
  steps(1);
  const group = find('targets');
  const gun = group?.children.find(child => child.name === 'fortress-gun');
  if (!gun) throw new Error('the sortie has not drawn the fortress gun');
  const place = currentGame()?.map.targets.find(target => target.id === 'fortress-gun');
  if (!place) throw new Error('the map has no fortress-gun');
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  // asleep (SB-2051): it sits sunk into the wall behind a full plate on the wall's top
  const plate = find('sb-shutter-fortress-gun');
  if (!plate) throw new Error('the sortie has not drawn the nest’s plate');
  expect(plate.visible).toBe(true);
  expect(plate.scale.y).toBe(1);
  expect(gun.position.y).toBeCloseTo((place.y ?? 0) - FORTRESS_SHUTTER_TUNE.sink, 6);
  // the flag stands: the plate rolls up and the gun rises over openSec, then it stands on the wall's top
  sendToScript(game, { kind: 'enter', area: 'fortress-approach' });
  steps(Math.round((FORTRESS_SHUTTER_TUNE.openSec / 2) * 60));
  expect(plate.visible).toBe(true);
  expect(plate.scale.y).toBeLessThan(1);
  expect(plate.scale.y).toBeGreaterThan(0);
  expect(gun.position.y).toBeGreaterThan((place.y ?? 0) - FORTRESS_SHUTTER_TUNE.sink);
  expect(gun.position.y).toBeLessThan(place.y ?? 0);
  steps(Math.round(FORTRESS_SHUTTER_TUNE.openSec * 60));
  expect(plate.visible).toBe(false);
  expect(gun.position.y).toBe(place.y);
  expect(gun.position.y).toBeGreaterThan(0);
});

test('a sortie draws the sea past the front edge and the landing craft behind the mech, and starting again leaves one of each', async () => {
  for (let sortie = 0; sortie < 2; sortie++) {
    startSortie();
    steps(1);
    // the craft and the sea are measured as drawn
    draw();
    const game = currentGame();
    if (!game) throw new Error('the sortie has not started');
    const { maxX, minX, maxZ } = game.map.bounds;
    const shores = scene.children.filter(child => child.name === 'shore');
    expect(shores).toHaveLength(1);

    const sea = find('sea');
    const craft = find('craft');
    if (!sea || !craft) throw new Error('the sea or the landing craft is not in the scene');
    const seaBox = new THREE.Box3().setFromObject(sea);
    expect(seaBox.min.z).toBeCloseTo(maxZ, 6);
    expect(seaBox.min.x).toBeLessThan(minX);
    expect(seaBox.max.x).toBeGreaterThan(maxX);

    const craftBox = new THREE.Box3().setFromObject(craft);
    expect(craftBox.min.z).toBeGreaterThanOrEqual(maxZ - 6);
    expect(craftBox.max.z).toBeGreaterThan(game.mech.z);
    expect(craftBox.max.y).toBeGreaterThan(seaBox.max.y + 1);
    // one draw a colour: the hull and the dark deck and ramp
    const meshes: THREE.Mesh[] = [];
    craft.traverse(child => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    expect(meshes).toHaveLength(2);
  }
});
