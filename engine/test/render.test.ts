import { expect, test } from 'vitest';
import * as THREE from 'three';

import { buildViewmodel, disposeTree } from '../src/render/render.ts';
import { at, ballGeo, boxGeo, cylGeo } from '../src/render/parts.ts';
import {
  buildParts,
  defineMaterial,
  defineTexture,
  material,
  ownMaterial,
  texture,
  texturesReady,
} from '../src/render/materials.ts';
import { burst, clearFx, fireball, parts, updateBalls } from '../src/render/fx.ts';
import { T, activeTileGrid, setTileWorld } from '../src/world/tiles.ts';
import { addDecks, addRamps, addWalls, wallTiles, wedgeGeo } from '../src/render/tilemesh.ts';
import {
  WINDOW_ORDER,
  buildBackdrop,
  buildOutsideBlocks,
  buildWindowPanes,
  keepOutOfPanes,
  seenThrough,
} from '../src/render/windows.ts';
import { mergeParts } from '../src/render/merge.ts';
import { hideInFog } from '../src/render/fogcull.ts';
import { mergeFlat } from '../src/render/mergeflat.ts';
import { batcher } from '../src/render/batch.ts';
import { chunkInstances, cullChunks } from '../src/render/chunks.ts';
import {
  block,
  canvasTex,
  grain,
  grime,
  paintRand,
  paintTex,
  poolTex,
  smudge,
  soil,
  stripes,
  words,
} from '../src/render/paint.ts';
import { eq, near, ok, worldFromRows } from './helpers.ts';

test('tilemesh: walls round the floor, one box per deck and per cover tile, a wedge per ramp', () => {
  const was = activeTileGrid().world;
  // a ring of wall round a floor with a deck (=), a ramp (>) and a cover tile (c)
  setTileWorld(worldFromRows(['#####', '#.=>#', '#c..#', '#####']));
  try {
    const tex = new THREE.Texture(),
      group = new THREE.Group();
    expect(wallTiles().length, 'every wall tile touches the floor here').toBe(14);
    addWalls(tex, wallTiles(), 6, group);
    addDecks({ top: tex, side: tex, cover: tex, coverTint: 0x808080 }, group);
    addRamps(tex, tex, 0, group);
    const [walls, decks, cover, wedge] = group.children as THREE.InstancedMesh[];
    expect([walls!.count, decks!.count, cover!.count]).toEqual([14, 1, 1]);
    expect(
      decks!.geometry.groups.map(g => g.materialIndex),
      'two groups: the sides and the top',
    ).toEqual([0, 1]);
    expect((decks!.material as THREE.Material[]).length, 'two materials for the two groups').toBe(2);
    expect(group.children.length, 'the ramp is one mesh').toBe(4);
    expect(wedge!.isInstancedMesh).toBeFalsy();
  } finally {
    setTileWorld(was);
  }
  // the slope and the end (two quads), then the sides: one triangle each, or two quads a slice
  expect(wedgeGeo(0).index!.count).toBe(6 + 6 + 3 + 3);
  expect(wedgeGeo(8).index!.count).toBe(6 + 6 + 8 * 2 * 6);
});

// ---------- render / ui ----------
test('render: viewmodel from parts, fx', () => {
  const g = buildViewmodel(
    {
      tip: [0, 0, -1],
      pos: [0.3, -0.3, -0.5],
      flash: 0.1,
      parts: [
        ['box', 0.1, 0.1, 0.5, 'a', 0, 0, 0],
        ['cyl', 0.05, 0.4, 'b', 0, 0, -0.3],
      ],
    },
    { a: 0x333333, b: 0xff0000 },
    ['b'],
  );
  eq(g.children.length, 4, '2 parts + tip + flash');
  near(g.userData.tip.position.z, -1);
  ok(!g.userData.flash.visible);
  burst(0, 1, 0, 0xffffff, 5, 3, 0.5);
  ok(parts.filter(p => p.life > 0).length >= 5, 'particles alive');
  fireball(0, 1, 0, 3, 0xff0000);
  updateBalls(0.6);
  clearFx();
  ok(
    parts.every(p => p.life <= 0),
    'clearFx',
  );
});

test('parts: box, cylinder and ball geometry are made once per size, at places and turns a mesh', () => {
  const b = boxGeo(1, 2, 3);
  eq(boxGeo(1, 2, 3), b, 'a box is kept per size');
  ok(b.userData.shared, 'a kept box is shared');
  ok(boxGeo(1, 2, 4) !== b, 'another size is another box');
  const c = cylGeo(0.5, 0.5, 2, 8);
  ok(c instanceof THREE.BufferGeometry, 'a cylinder is a geometry');
  eq(cylGeo(0.5, 0.5, 2, 8), c, 'a cylinder is kept per size');
  const s = ballGeo(1, 0);
  ok(s instanceof THREE.BufferGeometry, 'a ball is a geometry');
  eq(ballGeo(1, 0), s, 'a ball is kept per size');
  const geo = boxGeo(1, 1, 1),
    mat = new THREE.MeshBasicMaterial();
  const m = at(geo, mat, 1, 2, 3);
  eq(m.geometry, geo, 'the mesh has the geometry it was given');
  near(m.position.x, 1, 1e-9, 'x');
  near(m.position.y, 2, 1e-9, 'y');
  near(m.position.z, 3, 1e-9, 'z');
  eq(m.rotation.x, 0, 'no turn in x');
  eq(m.rotation.y, 0, 'no turn in y');
  eq(m.rotation.z, 0, 'no turn in z');
  near(at(geo, mat, 0, 0, 0, 'x').rotation.z, Math.PI / 2, 1e-9, 'laid along x');
  near(at(geo, mat, 0, 0, 0, 'z').rotation.x, Math.PI / 2, 1e-9, 'laid along z');
});

// ---- materials and part models ----
// a 1 x 1 PNG
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
test('materials: textures from a drawing or an image, materials with a glow, shared or own', async () => {
  defineTexture('t.panel', {
    src: (g, size) => {
      g.fillStyle = '#ff0000';
      g.fillRect(0, 0, size, size);
    },
    size: 32,
  });
  defineTexture('t.eyes', { src: (g, size) => g.clearRect(0, 0, size, size), repeat: false });
  defineTexture('t.photo', { src: PIXEL_PNG });
  expect(() => defineTexture('t.panel', { src: () => {} })).toThrow(/texture defined twice: t.panel/);
  const panel = texture('t.panel');
  ok(panel === texture('t.panel'), 'made once, then shared');
  const img = panel.image as HTMLCanvasElement;
  eq(img.width, 32, 'the canvas side');
  eq(Array.from(img.getContext('2d')!.getImageData(5, 5, 1, 1).data).join(), '255,0,0,255', 'drawn once');
  eq(panel.wrapS, THREE.RepeatWrapping, 'repeats by default');
  eq(texture('t.eyes').wrapS, THREE.ClampToEdgeWrapping, 'repeat: false');
  const photo = texture('t.photo');
  await texturesReady();
  eq((photo.image as HTMLImageElement).width, 1, 'the image is loaded');
  expect(() => texture('t.none')).toThrow(/unknown texture t.none/);

  defineMaterial('m.body', { map: 't.panel', glow: 't.eyes', emissiveIntensity: 0.4 });
  defineMaterial('m.flat', { color: 0x00ff00, lit: false, opacity: 0.5 });
  const body = material('m.body') as THREE.MeshLambertMaterial;
  ok(body instanceof THREE.MeshLambertMaterial && body === material('m.body'), 'one shared Lambert material');
  ok(body.userData.shared, 'marked shared: disposeTree keeps it');
  ok(body.map === panel && body.emissiveMap === texture('t.eyes'), 'surface and glow textures');
  eq(body.emissive.getHex(), 0xffffff, 'a glow texture glows white unless told otherwise');
  eq(body.emissiveIntensity, 0.4);
  const flat = material('m.flat');
  ok(flat instanceof THREE.MeshBasicMaterial && flat.transparent && flat.opacity === 0.5, 'unlit, see-through');
  eq((flat as THREE.MeshBasicMaterial).color.getHex(), 0x00ff00);
  const mine = ownMaterial('m.body') as THREE.MeshLambertMaterial;
  ok(mine !== body && !mine.userData.shared && mine.map === panel, 'an own copy with the shared textures');
  mine.emissiveIntensity = 3;
  eq(body.emissiveIntensity, 0.4, 'flashing the own copy leaves the shared one alone');
  // disposing a mesh with an own material frees the material, not the shared texture
  let freed = 0;
  const keep = panel.dispose;
  panel.dispose = () => {
    freed++;
  };
  disposeTree(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mine));
  panel.dispose = keep;
  eq(freed, 0, 'the texture stays');
  expect(() => material('m.none')).toThrow(/unknown material m.none/);
  expect(() => defineMaterial('m.body', {})).toThrow(/material defined twice/);
});
test('materials: buildParts makes a model of parts, sharing geometry, with its own materials when asked', () => {
  defineMaterial('m.armor', { color: 0x334455 });
  defineMaterial('m.light', { color: 0xffaa00, lit: false });
  const parts = [
    { shape: 'box' as const, size: [1, 0.6, 1.2], mat: 'm.armor', pos: [0, 0.5, 0] as [number, number, number] },
    {
      shape: 'cylinder' as const,
      size: [0.1, 0.8],
      mat: 'm.armor',
      pos: [0.6, 0.5, 0] as [number, number, number],
      rot: [0, 0, Math.PI / 2] as [number, number, number],
    },
    { shape: 'sphere' as const, size: [0.1], mat: 'm.light', pos: [0, 0.6, -0.6] as [number, number, number] },
    { shape: 'cylinder' as const, size: [0.1, 0.2, 0.5], mat: 'm.armor' },
    { shape: 'cone' as const, size: [0.2, 0.4], mat: 'm.light' },
    { shape: 'tetra' as const, size: [0.3], mat: 'm.armor' },
    { shape: 'octa' as const, size: [0.3], mat: 'm.armor' },
    { shape: 'ico' as const, size: [0.3], mat: 'm.armor' },
  ];
  const a = buildParts(parts),
    b = buildParts(parts, { own: true });
  eq(a.group.children.length, parts.length, 'one mesh per part');
  const m0 = a.group.children[0] as THREE.Mesh,
    m1 = a.group.children[1] as THREE.Mesh;
  eq(m0.position.y, 0.5, 'placed');
  near(m1.rotation.z, Math.PI / 2, 1e-9, 'turned');
  ok(m0.material === material('m.armor'), 'shared materials by default');
  eq(a.mats.length, 0);
  ok((b.group.children[0] as THREE.Mesh).geometry === m0.geometry, 'the same shape and size share one geometry');
  ok(m0.geometry.userData.shared, 'kept by disposeTree');
  eq(b.mats.length, 2, 'own: one material per name');
  ok((b.group.children[0] as THREE.Mesh).material === b.mats[0], 'the first name first');
  ok((b.group.children[1] as THREE.Mesh).material === b.mats[0], 'parts with the same name share it');
  ok(b.mats[0] !== material('m.armor'), 'not the shared one');
  expect(() => buildParts([{ shape: 'box', size: [1, 1, 1], mat: 'm.none' }])).toThrow(/unknown material m.none/);
  expect(() => buildParts([{ shape: 'blob' as never, size: [1], mat: 'm.armor' }])).toThrow(/unknown part shape blob/);
});
test('windows: a pane into a place marks its own value, puts the far depth back there, and the place is copied to it', () => {
  const face = { i: 2, j: 3, di: 1, dj: 0, rects: [[0, 0.5, 1, 1]] as [number, number, number, number][] },
    [mark, far, seal] = buildWindowPanes([{ ...face, into: 3 }], 6)!.children as THREE.InstancedMesh[],
    view = (buildWindowPanes([face], 6)!.children[0] as THREE.InstancedMesh).material as THREE.MeshBasicMaterial,
    mm = mark!.material as THREE.MeshBasicMaterial,
    fm = far!.material as THREE.ShaderMaterial,
    sm = seal!.material as THREE.MeshBasicMaterial;
  expect(mm.stencilRef).not.toBe(view.stencilRef);
  expect(mm.stencilRef & 3, 'none of the bits of the view out: the backdrop is not drawn there').toBe(0);
  expect(
    [fm.colorWrite, fm.fog, fm.depthWrite, fm.depthFunc, fm.stencilFunc, fm.stencilRef],
    'the fog colour where the copy has nothing',
  ).toEqual([true, true, true, THREE.AlwaysDepth, THREE.EqualStencilFunc, mm.stencilRef]);
  expect(far!.renderOrder).toBeGreaterThan(mark!.renderOrder);
  expect(far!.renderOrder).toBeLessThan(WINDOW_ORDER + 1);
  expect(sm.stencilRef, 'not sealed: the see-through things of the copy come after').not.toBe(mm.stencilRef);
  // the copy of a place: the same geometry and pictures, drawn only there, after the far depth, in the same order
  const tex = new THREE.Texture(),
    src = new THREE.Group(),
    wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: tex })),
    glass = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true })),
    many = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4),
    clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  wall.position.set(1, 2, 3);
  wall.renderOrder = 1;
  src.add(wall, glass, new THREE.Line(), many);
  const copy = seenThrough(src, 3, clip),
    [cw, cg, cm] = copy.children as THREE.Mesh[],
    cwm = cw!.material as THREE.MeshBasicMaterial;
  expect(copy.children.length, 'meshes only').toBe(3);
  expect(cw!.geometry).toBe(wall.geometry);
  expect(cwm).not.toBe(wall.material);
  expect(cwm.map).toBe(tex);
  expect(cw!.position.toArray()).toEqual([1, 2, 3]);
  expect([cwm.stencilWrite, cwm.stencilFunc, cwm.stencilRef]).toEqual([true, THREE.EqualStencilFunc, mm.stencilRef]);
  expect(cwm.clippingPlanes).toEqual([clip]);
  expect(cw!.renderOrder).toBeGreaterThan(far!.renderOrder);
  expect(cw!.renderOrder).toBeLessThan(WINDOW_ORDER + 1);
  expect(cw!.renderOrder, 'their order kept').toBeGreaterThan(cg!.renderOrder);
  expect((cm as THREE.InstancedMesh).count).toBe(4);
  expect((cm as THREE.InstancedMesh).instanceMatrix).toBe(many.instanceMatrix);
  expect((wall.material as THREE.MeshBasicMaterial).stencilWrite, 'the place itself as it was').toBe(false);
  // the place's own see-through things are not drawn there (behind the wall, they would be seen over the copy)
  keepOutOfPanes(src);
  const gm = glass.material as THREE.MeshBasicMaterial;
  expect([gm.stencilWrite, gm.stencilFunc, gm.stencilRef, gm.stencilFuncMask & mm.stencilRef]).toEqual([
    true,
    THREE.EqualStencilFunc,
    0,
    mm.stencilRef,
  ]);
  expect(gm.stencilFuncMask & view.stencilRef, 'still drawn in the view out').toBe(0);
  expect((wall.material as THREE.MeshBasicMaterial).stencilWrite, 'solid things are drawn over').toBe(false);
});
test('windows: panes on the faces mark the stencil, the backdrop is drawn only there and stays round the eye', () => {
  expect(buildWindowPanes([], 6)).toBeNull();
  // two panes on the -x face of tile (2, 3), seen from the floor at (3, 3)
  const face = {
      i: 2,
      j: 3,
      di: 1,
      dj: 0,
      rects: [
        [0, 0.5, 0.5, 1],
        [0.5, 0.5, 1, 1],
      ] as [number, number, number, number][],
    },
    [panes, seal] = buildWindowPanes([face], 6)!.children as THREE.InstancedMesh[];
  expect(panes!.count).toBe(2);
  expect(panes!.renderOrder).toBe(WINDOW_ORDER);
  const m = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3();
  panes!.getMatrixAt(0, m);
  m.decompose(p, q, s);
  expect(p.x, 'just in front of the face, toward the floor').toBeCloseTo(3 * T + 0.02);
  expect(p.y, 'the lower half of the face').toBeCloseTo(1.5);
  expect(s.x).toBeCloseTo(T / 2);
  expect(s.y).toBeCloseTo(3);
  // its front toward the floor (+x); the face's left as seen from there is toward +z
  expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).x).toBeCloseTo(1);
  expect(p.z, 'the left pane').toBeCloseTo(3.5 * T + T / 4);
  const pm = panes!.material as THREE.MeshBasicMaterial;
  expect([pm.colorWrite, pm.stencilWrite, pm.stencilZPass]).toEqual([false, true, THREE.ReplaceStencilOp]);
  // the same panes again once the view out is drawn: only their depth, where the stencil is marked, so what is drawn
  // after (the see-through things of the floor) is not seen in the window from behind the wall
  const sm = seal!.material as THREE.MeshBasicMaterial;
  expect(seal!.count).toBe(panes!.count);
  expect(seal!.renderOrder).toBeGreaterThan(WINDOW_ORDER + 3);
  expect([sm.colorWrite, sm.depthWrite, sm.depthFunc, sm.stencilFunc]).toEqual([
    false,
    true,
    THREE.AlwaysDepth,
    THREE.EqualStencilFunc,
  ]);
  expect(sm.stencilRef, 'the seal and the view out keep to what the panes mark for the view').toBe(pm.stencilRef);
  // a pane in a deep wall marks another value; its opening on the wall's far side, a tile back, turns that into the
  // view's (drawn over all, after the panes), so only a look straight through the wall sees out
  const [deepPane, opening] = buildWindowPanes([{ ...face, deep: T }], 6)!.children as THREE.InstancedMesh[],
    dm = deepPane!.material as THREE.MeshBasicMaterial,
    om = opening!.material as THREE.MeshBasicMaterial;
  expect(dm.stencilRef).not.toBe(pm.stencilRef);
  expect([om.stencilFunc, om.stencilRef, om.stencilZPass, om.depthTest]).toEqual([
    THREE.EqualStencilFunc,
    dm.stencilRef,
    THREE.IncrementStencilOp,
    false,
  ]);
  expect(dm.stencilRef + 1).toBe(pm.stencilRef);
  opening!.getMatrixAt(0, m);
  m.decompose(p, q, s);
  expect(p.x, "the wall's far face").toBeCloseTo(2 * T + 0.02);
  expect(opening!.renderOrder).toBeGreaterThan(WINDOW_ORDER);
  expect(opening!.renderOrder).toBeLessThan(WINDOW_ORDER + 1);
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(7, 2, -5);
  cam.updateMatrixWorld();
  // (where a part of it goes, the eye being at cam)
  const placed = (m: THREE.Mesh) => {
    m.onBeforeRender(
      {} as THREE.WebGLRenderer,
      new THREE.Scene(),
      cam,
      m.geometry,
      m.material as THREE.Material,
      {} as THREE.Group,
    );
    return m.position.toArray();
  };
  // the band alone: one cylinder round the eye
  const bare = buildBackdrop(new THREE.Texture(), 100, 80).children as THREE.Mesh[];
  expect(bare.length, 'the band and the floor under it (depth only)').toBe(2);
  expect((bare[1]!.material as THREE.Material).colorWrite).toBe(false);
  const back = bare[0]!,
    bm = back.material as THREE.MeshBasicMaterial;
  expect(back.renderOrder).toBe(WINDOW_ORDER + 1);
  expect([bm.depthFunc, bm.stencilFunc, bm.fog]).toEqual([THREE.AlwaysDepth, THREE.EqualStencilFunc, false]);
  expect(placed(back)).toEqual([7, 2, -5]);
  // closed above and below: a lid at the band's top edge, and the ground at groundY, drawn over the band
  const ground = new THREE.Texture(),
    closed = buildBackdrop(new THREE.Texture(), 100, 80, {
      sky: 0x112233,
      ground: { map: ground, tile: 64, clear: 30, fade: 150, haze: 0x445566 },
    }),
    [band, lid, , floor] = closed.children as THREE.Mesh[];
  closed.groundY = -22; // (24 m under the eye)
  expect(placed(band!)).toEqual([7, 2, -5]);
  const bandMat = band!.material as THREE.Material;
  expect([bandMat.depthTest, bandMat.depthFunc, bandMat.depthWrite], 'the band leaves its depth').toEqual([
    true,
    THREE.AlwaysDepth,
    true,
  ]);
  expect(placed(lid!)).toEqual([7, 42, -5]);
  expect((lid!.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x112233);
  expect(floor!.renderOrder).toBe(WINDOW_ORDER + 2);
  const fm = floor!.material as THREE.ShaderMaterial;
  expect([fm.depthTest, fm.depthWrite, fm.stencilFunc]).toEqual([false, false, THREE.EqualStencilFunc]);
  // drawn shrunk toward the eye: its edge as far as the band, just under the horizon; the picture by the true metres
  const [fx, fy, fz] = placed(floor!),
    out = fm.uniforms.reachOut!.value as number,
    shrink = floor!.scale.x / out;
  expect([fx, fz]).toEqual([7, -5]);
  expect(fy).toBeCloseTo(2 - 24 * shrink);
  expect(Math.hypot(out, 24) * shrink).toBeCloseTo(100);
  expect((Math.atan2(24, out) * 180) / Math.PI).toBeLessThan(1);
  expect([fm.uniforms.tile!.value, fm.uniforms.clear!.value, fm.uniforms.fade!.value]).toEqual([64, 30, 150]);
  expect(ground.wrapS, 'the ground repeats').toBe(THREE.RepeatWrapping);
});
test('windows: the buildings out there are only the faces asked for and the roof, each face in its own light', () => {
  const facade = new THREE.Texture(),
    roof = new THREE.Texture(),
    group = buildOutsideBlocks(
      [{ x0: 0, z0: 0, x1: 16, z1: 16, top: 28, sides: [1, 3], facade: 0, roof: 0 }],
      {
        facades: [facade],
        storey: [16, 14],
        roofs: [roof],
        roofTile: 16,
        light: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [1, 1, 1],
        ],
        roofLight: [0.5, 0.5, 0.5],
        haze: 0x445566,
        clear: 40,
        fade: 140,
        reach: 400,
      },
      100,
    );
  const [walls, top] = group.children as THREE.Mesh[],
    pos = walls!.geometry.getAttribute('position'),
    uv = walls!.geometry.getAttribute('uv'),
    tint = walls!.geometry.getAttribute('tint');
  expect(pos.count, 'two faces of two triangles').toBe(12);
  expect(top!.geometry.getAttribute('position').count, 'the roof').toBe(6);
  // the first face asked for: side 1, at x = x0, in side 1's light; the picture repeats 16 m across, 14 m up
  expect([pos.getX(0), pos.getX(2)]).toEqual([0, 0]);
  expect([tint.getX(0), tint.getY(0), tint.getZ(0)]).toEqual([0, 1, 0]);
  expect(Math.max(...Array.from({ length: 6 }, (_, k) => uv.getY(k)))).toBeCloseTo(2);
  expect(Math.max(...Array.from({ length: 6 }, (_, k) => uv.getX(k)))).toBeCloseTo(1);
  // the second: side 3, at z = z0
  expect([pos.getZ(6), pos.getZ(8)]).toEqual([0, 0]);
  expect(top!.geometry.getAttribute('position').getY(0)).toBe(28);
  const m = walls!.material as THREE.ShaderMaterial;
  expect(walls!.renderOrder).toBe(WINDOW_ORDER + 3);
  expect([m.depthTest, m.depthWrite, m.stencilFunc]).toEqual([true, true, THREE.EqualStencilFunc]);
  // drawn shrunk toward the eye: a block `reach` away comes inside the band
  expect(m.uniforms.shrink!.value * 400).toBeLessThan(100);
  expect(facade.wrapS).toBe(THREE.RepeatWrapping);
});
test('paint: the same seed paints the same picture; the strokes cover the canvas or the size given', () => {
  const pixels = (t: THREE.CanvasTexture) => {
    const c = t.image as HTMLCanvasElement;
    return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
  };
  const art = (g: CanvasRenderingContext2D, rand: () => number) => {
    g.fillStyle = '#556677';
    g.fillRect(0, 0, 64, 64);
    grime(g, rand, 20, '#fff', '#000');
    grain(g, rand, 30);
    stripes(g, [0, 40, 64, 10], 8, '#ff0', '#000', 'rgba(0,0,0,.3)');
    block(g, 4, 4, 20, 12, '#884422');
    soil(g, rand, 64, 64, 32);
    words(g, 'A', 32, 20, 10, 0.5);
  };
  const a = paintTex(7, art, 64),
    b = paintTex(7, art, 64),
    c = paintTex(8, art, 64);
  expect((a.image as HTMLCanvasElement).width).toBe(64);
  expect(pixels(a)).toEqual(pixels(b));
  expect(pixels(a)).not.toEqual(pixels(c));
  expect(paintRand(3)()).toBe(paintRand(3)());
  expect(paintTex(1, () => {}, 32, true).wrapS).toBe(THREE.RepeatWrapping);
  expect((canvasTex(80, 20, () => {}).image as HTMLCanvasElement).height).toBe(20);
  expect(poolTex(), 'one picture for all the pools').toBe(poolTex());
  // a smudge near one edge runs on round the other edge (the next tile)
  const wrap = canvasTex(32, 32, g => smudge(g, 1, 16, 6, 6, '255,0,0', 1)),
    edge = (wrap.image as HTMLCanvasElement).getContext('2d')!.getImageData(31, 16, 1, 1).data;
  expect(edge[3]).toBeGreaterThan(0);
  // grain only over the size given
  const part = canvasTex(32, 32, g => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 32, 32);
      grain(g, paintRand(1), 80, 16, 16);
    }),
    pg = (part.image as HTMLCanvasElement).getContext('2d')!;
  expect(Array.from(pg.getImageData(20, 20, 1, 1).data), 'outside: as painted').toEqual([128, 128, 128, 255]);
});

test('merge: the parts that move together become one mesh per material; what is kept moves on its own', () => {
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    blue = new THREE.MeshBasicMaterial({ color: 0x0000ff }),
    box = new THREE.BoxGeometry(1, 1, 1),
    part = (mat: THREE.Material, x: number) => {
      const m = new THREE.Mesh(box, mat);
      m.position.x = x;
      return m;
    },
    root = new THREE.Group(),
    group = new THREE.Group(), // a group of parts, moved: its parts join the root's
    arm = new THREE.Group(), // kept: turned by an animation
    line = new THREE.LineSegments(new THREE.EdgesGeometry(box)); // not a plain mesh: left as it is
  group.position.y = 2;
  group.add(part(red, 0), part(blue, 1));
  arm.add(part(red, 0), part(red, 1));
  root.add(part(red, 3), part(blue, 4), group, arm, line);
  const box0 = new THREE.Box3().setFromObject(root);
  mergeParts(root, [arm]);
  const meshes = root.children.filter(c => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  expect(
    meshes.map(m => m.material).sort((a, b) => (a === red ? -1 : b === red ? 1 : 0)),
    'one per material',
  ).toEqual([red, blue]);
  expect(root.children).toContain(arm);
  expect(root.children).toContain(line);
  expect(arm.children.length, 'under the kept arm, its own parts joined').toBe(1);
  expect(new THREE.Box3().setFromObject(root).equals(box0), 'the same shape where it was').toBe(true);
  expect(box.attributes.position!.count, "the parts' shared shape untouched").toBe(24);
});
test('fogcull: a thing past the fog (and its reach) is hidden, one in it shown; without a fog all are shown', () => {
  const at = (x: number) => {
      const mesh = new THREE.Group();
      mesh.position.set(x, 0, 0);
      return { mesh };
    },
    near = at(10),
    edge = at(42),
    far = at(60),
    eye = new THREE.Vector3(0, 1.6, 0);
  hideInFog([near, edge, far], eye, new THREE.Fog(0, 4, 40), 3);
  expect([near.mesh.visible, edge.mesh.visible, far.mesh.visible]).toEqual([true, true, false]);
  hideInFog([near, edge, far], eye, null, 3);
  expect(far.mesh.visible, 'no fog: shown again').toBe(true);
});

test('chunks: copies split by where they stand; only chunks in view and short of `far` are shown', () => {
  const group = new THREE.Group(),
    m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 4),
    at = new THREE.Matrix4(),
    kept = new THREE.Group();
  // two copies in the chunk at the origin, one 20 m along x, one 100 m along x (chunks of 10 m)
  [1, 3, 21, 101].forEach((x, n) => m.setMatrixAt(n, at.makeTranslation(x, 0, 1)));
  group.add(m, kept);
  const chunks = chunkInstances(group, 10);
  expect(chunks.length).toBe(3);
  expect(chunks.map(c => (c.root.children[0] as THREE.InstancedMesh).count).sort()).toEqual([1, 1, 2]);
  expect(group.children.includes(m), 'the whole mesh is gone').toBe(false);
  expect(group.children.includes(kept), 'what is not an instanced mesh stays').toBe(true);
  const first = chunks.find(c => c.box.min.x < 5)!;
  expect([first.box.min.x, first.box.max.x]).toEqual([0.5, 3.5]);
  // a camera at x 10 looking along +x: the chunk behind it is hidden, and the one 100 m off is past `far`
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  cam.position.set(10, 0, 1);
  cam.lookAt(200, 0, 1);
  cullChunks(chunks, group, cam, 50);
  const shown = (x: number) => chunks.find(c => c.box.min.x <= x && c.box.max.x >= x)!.root.visible;
  expect([shown(2), shown(21), shown(101)]).toEqual([false, true, false]);
  // `keep` can hide one more
  cullChunks(chunks, group, cam, 500, box => box.min.x < 50);
  expect([shown(21), shown(101)]).toEqual([true, false]); // a light mesh (fewer triangles in all than minTris) is left whole
  const g2 = new THREE.Group(),
    light = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 2);
  [1, 21].forEach((x, n) => light.setMatrixAt(n, at.makeTranslation(x, 0, 1)));
  g2.add(light);
  expect(chunkInstances(g2, 10, 5).length, '4 triangles: not split').toBe(0);
  expect(g2.children.includes(light)).toBe(true);
});
test('batch: one instanced mesh per kind, each thing where it was put', () => {
  const group = new THREE.Group(),
    b = batcher(group);
  let made = 0;
  const box = (): [THREE.BufferGeometry, THREE.Material] => {
    made++;
    return [new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()];
  };
  b.put('box', box, 1, 2, 3);
  b.put('box', box, 4, 0, 0, Math.PI / 2);
  b.put('box', box, 0, 0, 0, 0, 0, [2, 1, 1]);
  b.put('plane', () => [new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()], 0, 5, 0);
  b.done();
  expect(made, 'make runs once per kind').toBe(1);
  const meshes = group.children as THREE.InstancedMesh[];
  expect(meshes.map(m => m.count)).toEqual([3, 1]);
  const m = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3();
  meshes[0]!.getMatrixAt(0, m);
  expect(p.setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3]);
  meshes[0]!.getMatrixAt(2, m);
  m.decompose(p, q, sc);
  expect(sc.x).toBeCloseTo(2);
});
test('mergeflat: coloured things that stand still become one mesh per group; textured or see-through ones stay', () => {
  const box = new THREE.BoxGeometry(1, 1, 1),
    inst = (mat: THREE.Material, n: number, x: number) => {
      const m = new THREE.InstancedMesh(box, mat, n);
      for (let k = 0; k < n; k++) m.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, k * 2, 0));
      return m;
    },
    root = new THREE.Group(),
    sub = new THREE.Group(), // shown and hidden by itself: what is under it is joined under it
    red = inst(new THREE.MeshBasicMaterial({ color: 0xff0000 }), 3, 0),
    blue = inst(new THREE.MeshBasicMaterial({ color: 0x0000ff }), 2, 5),
    pic = inst(new THREE.MeshBasicMaterial({ map: new THREE.Texture() }), 2, 9),
    glass = inst(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }), 2, 12);
  // (every copy its own colour, as three.js wants once one has: white, grey, white)
  [0xffffff, 0x808080, 0xffffff].forEach((c, k) => red.setColorAt(k, new THREE.Color(c)));
  sub.add(inst(new THREE.MeshBasicMaterial({ color: 0x00ff00 }), 1, 0), inst(new THREE.MeshBasicMaterial(), 1, 2));
  root.add(red, blue, pic, glass, sub);
  mergeFlat(root);
  const joined = root.children.find(
    c => !(c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.Mesh).isMesh,
  ) as THREE.Mesh;
  expect(root.children).toContain(pic);
  expect(root.children).toContain(glass);
  expect(root.children).not.toContain(red);
  expect((joined.material as THREE.MeshBasicMaterial).vertexColors).toBe(true);
  expect(joined.geometry.getAttribute('position').count, 'all five copies').toBe(5 * 36);
  const col = joined.geometry.getAttribute('color');
  expect([col.getX(0), col.getZ(0)], 'red').toEqual([1, 0]);
  expect(col.getX(36), "the second red, times its copy's colour").toBeCloseTo(new THREE.Color(0x808080).r);
  expect(sub.children.length, 'joined under the group they were in').toBe(1);
});

test('windows: a box out there may stand on another (bottom), go without its roof, show its underside; faces turned out', () => {
  const tex = new THREE.Texture(),
    group = buildOutsideBlocks(
      [{ x0: 0, z0: 0, x1: 4, z1: 4, bottom: 8, top: 16, sides: [0], facade: 0, roof: 0, noRoof: true, under: true }],
      {
        facades: [tex],
        storey: [16, 32],
        roofs: [tex],
        roofTile: 16,
        light: [
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ],
        roofLight: [1, 1, 1],
        haze: 0,
        clear: 20,
        fade: 140,
        reach: 400,
      },
      100,
    );
  const mesh = group.children[0] as THREE.Mesh,
    pos = mesh.geometry.getAttribute('position'),
    uv = mesh.geometry.getAttribute('uv');
  expect(pos.count, 'one face and the underside, no roof').toBe(12);
  const ys = Array.from({ length: pos.count }, (_, k) => pos.getY(k));
  expect([Math.min(...ys), Math.max(...ys)]).toEqual([8, 16]);
  // the storeys go from the ground up: the face starts a quarter of the way up the picture
  expect(Math.min(...Array.from({ length: 6 }, (_, k) => uv.getY(k)))).toBeCloseTo(8 / 32);
  // each triangle's front is outward: the face toward +x, the underside down
  const normal = (t: number) => {
    const [a, b, c] = [0, 1, 2].map(n => new THREE.Vector3().fromBufferAttribute(pos, t * 3 + n));
    return new THREE.Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!)).normalize();
  };
  expect(normal(0).x).toBeCloseTo(1);
  expect(normal(2).y).toBeCloseTo(-1);
  expect((mesh.material as THREE.Material).side).toBe(THREE.FrontSide);
});
