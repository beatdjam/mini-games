// The beach's surfaces after SB-1360: the ground's wet vertex colours and world-metre UVs, the one material the look
// colours, and the sea's rows being fine enough to keep the foam a line. These read the built geometry, not the
// functions that fill it, so dropping the change makes them fail.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { DRY_SAND_COLOR, WET_SAND_COLOR } from '../../src/data/colors.ts';
import { lookOf } from '../../src/data/looks.ts';
import { TILE_SIZE } from '../../src/data/props.ts';
import { SAND_SURFACE, SEA_SURFACE } from '../../src/data/surfaces.ts';
import type { Prop } from '../../src/data/types.ts';
import { applyGroundColor, collectGroundTiles } from '../../src/view/look.ts';
import { buildOutdoor } from '../../src/view/outdoor.ts';
import { buildShore } from '../../src/view/shore.ts';

// Tiles over 18m x 42m: wider than one 12m repeat of the sand, and deeper than the 15m wet band.
function tiles(): Prop[] {
  const items: Prop[] = [];
  for (let x = 0; x <= 12; x += TILE_SIZE) {
    for (let z = 0; z <= 36; z += TILE_SIZE) {
      items.push({ kind: 'tile', x, z, yaw: 0, scale: 1 });
    }
  }
  return items;
}

function tileMesh(group: THREE.Object3D): THREE.Mesh {
  const found = group.getObjectByName('tile');
  if (!(found instanceof THREE.Mesh)) throw new Error('the ground plane was not built');
  return found;
}

function groundGeometry(): THREE.BufferGeometry {
  return tileMesh(buildOutdoor(tiles(), { chunk: 0, chunkMin: 0 }).group).geometry;
}

// The ATTRIBUTE of the ground: position, uv or colour.
function attribute(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute {
  const found = geometry.getAttribute(name);
  if (!(found instanceof THREE.BufferAttribute)) throw new Error(`no ${name} attribute`);
  return found;
}

test('the ground fades from the wet sand at the sea to the dry sand inland', () => {
  const geometry = groundGeometry();
  const at = attribute(geometry, 'position');
  const colors = attribute(geometry, 'color');
  const dry = new THREE.Color(DRY_SAND_COLOR);
  const wet = new THREE.Color(WET_SAND_COLOR);
  let edge = 0;
  let inland = 0;
  for (let i = 0; i < at.count; i++) {
    if (at.getZ(i) > at.getZ(edge)) edge = i;
    if (at.getZ(i) < at.getZ(inland)) inland = i;
  }
  // at the sea's edge the vertex colour is WET_SAND_COLOR / DRY_SAND_COLOR (the material's colour is the dry sand)
  expect(colors.getX(edge)).toBeCloseTo(wet.r / dry.r, 6);
  expect(colors.getY(edge)).toBeCloseTo(wet.g / dry.g, 6);
  expect(colors.getZ(edge)).toBeCloseTo(wet.b / dry.b, 6);
  // past the wet band the sand is dry: the vertex colour leaves the material's own colour alone
  expect(at.getZ(inland)).toBeLessThanOrEqual(at.getZ(edge) - SAND_SURFACE.wetBand);
  expect(colors.getX(inland)).toBeCloseTo(1, 6);
  expect(colors.getY(inland)).toBeCloseTo(1, 6);
  expect(colors.getZ(inland)).toBeCloseTo(1, 6);
});

test('the ground UV counts world metres in repeats of the sand', () => {
  const geometry = groundGeometry();
  const at = attribute(geometry, 'position');
  const uv = attribute(geometry, 'uv');
  for (let i = 0; i < at.count; i++) {
    expect(uv.getX(i)).toBeCloseTo(at.getX(i) / SAND_SURFACE.repeatM, 6);
    expect(uv.getY(i)).toBeCloseTo(at.getZ(i) / SAND_SURFACE.repeatM, 6);
  }
});

test('the look finds the one ground material and colours it', () => {
  const built = buildOutdoor(tiles(), { chunk: 0, chunkMin: 0 });
  const found = collectGroundTiles(built.group);
  expect(found).toHaveLength(1);
  expect(found[0].material).toBe(tileMesh(built.group).material);
  const look = lookOf('m1');
  applyGroundColor(look, found);
  expect(found[0].material.color.getHex()).toBe(look.groundColor);
});

test('the sea rows are finer than half the foam width, so the foam stays a line', () => {
  const shore = buildShore({ minX: -100, maxX: 100, minZ: -170, maxZ: 170 });
  const sea = shore.getObjectByName('sea');
  if (!(sea instanceof THREE.Mesh)) throw new Error('the sea was not built');
  const at = attribute(sea.geometry, 'position');
  const rows = [...new Set(Array.from({ length: at.count }, (_, i) => at.getZ(i)))].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < rows.length; i++) gap = Math.min(gap, rows[i] - rows[i - 1]);
  expect(rows.length).toBeGreaterThan(1);
  expect(gap).toBeLessThanOrEqual(SEA_SURFACE.foamWidth / 2);
});

test('the sea is a dark grey-blue and the surf a muted grey, not white', () => {
  // the colours the review asked for, written out here so a revert shows
  const water = new THREE.Color(0x3d5560);
  const foam = new THREE.Color(0x9aa5a3);
  const shore = buildShore({ minX: -100, maxX: 100, minZ: -170, maxZ: 170 });
  const sea = shore.getObjectByName('sea');
  if (!(sea instanceof THREE.Mesh)) throw new Error('the sea was not built');
  const at = attribute(sea.geometry, 'position');
  const colors = attribute(sea.geometry, 'color');
  let shoreIndex = 0;
  let farIndex = 0;
  for (let i = 0; i < at.count; i++) {
    if (at.getZ(i) < at.getZ(shoreIndex)) shoreIndex = i;
    if (at.getZ(i) > at.getZ(farIndex)) farIndex = i;
  }
  // the foam line lies at the shore (the smallest local z), the open water at the far edge
  expect(colors.getX(shoreIndex)).toBeCloseTo(foam.r, 5);
  expect(colors.getY(shoreIndex)).toBeCloseTo(foam.g, 5);
  expect(colors.getZ(shoreIndex)).toBeCloseTo(foam.b, 5);
  expect(colors.getX(farIndex)).toBeCloseTo(water.r, 5);
  expect(colors.getY(farIndex)).toBeCloseTo(water.g, 5);
  expect(colors.getZ(farIndex)).toBeCloseTo(water.b, 5);
  // the water is darker than the surf, and even the surf is not white
  const brightness = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  expect(brightness(water)).toBeLessThan(brightness(foam));
  expect(brightness(foam)).toBeLessThan(0.8);
});
