import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { CUTSCENES } from '../../src/data/cutscenes.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import type { CutsceneId } from '../../src/data/types.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { hasCutscene, cutsceneEvents, cutsceneLine, cutscenePose } from '../../src/logic/cutscene.ts';
import { newGame } from '../../src/logic/game.ts';
import { cameraPose } from '../../src/view/camera.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const landing = CUTSCENES.landing;
if (!landing) throw new Error('no table for landing');
const keys = landing.camera;

test('the camera is exactly a key at the key second', () => {
  for (const key of keys) {
    const pose = cutscenePose('landing', key.at);
    expect(pose.pos).toEqual(key.pos);
    expect(pose.look).toEqual(key.look);
  }
});

test('between two keys the camera is between their poses, and halfway at the middle second', () => {
  const a = keys[0];
  const b = keys[1];
  const mid = cutscenePose('landing', (a.at + b.at) / 2);
  for (let i = 0; i < 3; i++) {
    expect(mid.pos[i]).toBeCloseTo((a.pos[i] + b.pos[i]) / 2, 9);
    expect(mid.look[i]).toBeCloseTo((a.look[i] + b.look[i]) / 2, 9);
  }
  const early = cutscenePose('landing', a.at + (b.at - a.at) * 0.25);
  // eased: a quarter of the time is less than a quarter of the way
  const along = (early.pos[0] - a.pos[0]) / (b.pos[0] - a.pos[0]);
  expect(along).toBeGreaterThan(0);
  expect(along).toBeLessThan(0.25);
});

test('after the end, and before the start, the camera keeps the nearest key', () => {
  const last = keys[keys.length - 1];
  expect(cutscenePose('landing', last.at + 5).pos).toEqual(last.pos);
  expect(cutscenePose('landing', -1).pos).toEqual(keys[0].pos);
});

test('the last key is the game camera behind the mech at the start, and the table fits the cutscene', () => {
  const mech = newGame(M1B_HAND).mech;
  const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, 0, CAMERA_TUNE, []);
  const last = keys[keys.length - 1];
  expect(last.pos[0]).toBeCloseTo(pose.pos.x, 2);
  expect(last.pos[1]).toBeCloseTo(pose.pos.y, 2);
  expect(last.pos[2]).toBeCloseTo(pose.pos.z, 2);
  expect(last.look[0]).toBeCloseTo(pose.look.x, 2);
  expect(last.look[1]).toBeCloseTo(pose.look.y, 2);
  expect(last.look[2]).toBeCloseTo(pose.look.z, 2);
  expect(last.at).toBe(CUTSCENE_SEC.landing);
});

test('the line follows the schedule, and none shows between lines', () => {
  const [first, second, third] = landing.lines;
  expect(cutsceneLine('landing', 0)).toBeNull();
  expect(cutsceneLine('landing', first.from)).toBe(first.key);
  expect(cutsceneLine('landing', first.to)).toBeNull();
  expect(cutsceneLine('landing', second.from + 0.1)).toBe(second.key);
  expect(cutsceneLine('landing', third.from)).toBe(third.key);
  expect(cutsceneLine('landing', CUTSCENE_SEC.landing)).toBeNull();
  expect(new Set(landing.lines.map(line => line.key)).size).toBe(landing.lines.length);
});

test('every line has text in ja and en', () => {
  for (const code of ['ja', 'en']) {
    for (const line of landing.lines) expect(LANG[code].ui[line.key], `${code} lacks "${line.key}"`).toBeTruthy();
  }
});

test('an event comes once, in the frame that reaches its second', () => {
  for (const event of landing.events) {
    const step = 1 / 60;
    let count = 0;
    let last = -1;
    for (let t = step; t <= CUTSCENE_SEC.landing + 1e-9; t += step) {
      if (cutsceneEvents('landing', last, t).includes(event)) count++;
      last = t;
    }
    expect(count, `${event.kind} at ${event.at}`).toBe(1);
  }
  // exactly at the second counts, and the second before does not
  const first = landing.events[0];
  expect(cutsceneEvents('landing', first.at - 0.5, first.at)).toContain(first);
  expect(cutsceneEvents('landing', first.at, first.at + 0.5)).not.toContain(first);
});

test('the table keeps to the cutscene length, and only landing has a table', () => {
  for (const key of keys) expect(key.at).toBeLessThanOrEqual(CUTSCENE_SEC.landing);
  for (const line of landing.lines) expect(line.to).toBeLessThanOrEqual(CUTSCENE_SEC.landing);
  for (const event of landing.events) expect(event.at + event.sec).toBeLessThanOrEqual(CUTSCENE_SEC.landing);
  const played: CutsceneId[] = (['landing', 'wave2-sinks', 'beach-held'] as const).filter(hasCutscene);
  expect(played).toEqual(['landing']);
});
