import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { CUTSCENES } from '../../src/data/cutscenes.ts';
import { CRAFT_TUNE, craftZ } from '../../src/data/craft.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { LANDING_RIDERS } from '../../src/data/landing.ts';
import {
  hasCutscene,
  cutsceneEvents,
  cutsceneLine,
  cutsceneMech,
  cutscenePose,
  riderFall,
} from '../../src/logic/cutscene.ts';
import { craftRects } from '../../src/logic/craft.ts';
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

// The wheelhouse's box in the map's coordinates, from the craft's table (its middle is fromStern in front of the stern).
function wheelhouseBox() {
  const z = craftZ(M1B_HAND.bounds) + (CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern);
  return {
    minX: -CRAFT_TUNE.wheelhouse.w / 2,
    maxX: CRAFT_TUNE.wheelhouse.w / 2,
    minY: CRAFT_TUNE.hullTop,
    maxY: CRAFT_TUNE.hullTop + CRAFT_TUNE.wheelhouse.h,
    minZ: z - CRAFT_TUNE.wheelhouse.d / 2,
    maxZ: z + CRAFT_TUNE.wheelhouse.d / 2,
  };
}

type Box = ReturnType<typeof wheelhouseBox>;

const inside = (box: Box, point: readonly number[]): boolean =>
  point[0] >= box.minX &&
  point[0] <= box.maxX &&
  point[1] >= box.minY &&
  point[1] <= box.maxY &&
  point[2] >= box.minZ &&
  point[2] <= box.maxZ;

test('the landing camera never goes into the wheelhouse, at a key or between two', () => {
  const box = wheelhouseBox();
  for (let i = 0; i <= Math.round(CUTSCENE_SEC.landing / 0.05); i++) {
    const second = i * 0.05;
    const pose = cutscenePose('landing', second);
    expect(inside(box, pose.pos), `the camera at ${second} s`).toBe(false);
  }
});

test('the landing cuts from the sea outside the craft to the deck inside at 3.45 seconds', () => {
  const outside = keys.find(key => key.at === 3.4);
  const within = keys.find(key => key.at === 3.45);
  if (!outside || !within) throw new Error('the landing has no cut at 3.4 and 3.45');
  expect(within.at - outside.at).toBeCloseTo(0.05, 9);
  expect(within.pos).not.toEqual(outside.pos);
  const z = craftZ(M1B_HAND.bounds);
  // outside: over the sea past the craft's stern
  expect(outside.pos[2]).toBeGreaterThan(z + CRAFT_TUNE.length);
  // inside: over the deck, within the hull's width and length
  expect(Math.abs(within.pos[0])).toBeLessThan(CRAFT_TUNE.width / 2);
  expect(within.pos[2]).toBeGreaterThan(z);
  expect(within.pos[2]).toBeLessThan(z + CRAFT_TUNE.length);
  expect(within.pos[1]).toBeGreaterThan(CRAFT_TUNE.deckTop);
});

test('the keys inside the craft keep the mech out of its see-through distance', () => {
  const start = newGame(M1B_HAND).mech;
  const chest = [start.x, start.y + MECH_TUNE.chestHeight, start.z] as const;
  const z = craftZ(M1B_HAND.bounds);
  const insideKeys = keys.filter(
    key => Math.abs(key.pos[0]) < CRAFT_TUNE.width / 2 && key.pos[2] > z && key.pos[2] < z + CRAFT_TUNE.length,
  );
  expect(insideKeys.length).toBeGreaterThan(0);
  for (const key of insideKeys) {
    const distance = Math.hypot(key.pos[0] - chest[0], key.pos[1] - chest[1], key.pos[2] - chest[2]);
    expect(distance, `the key at ${key.at} s`).toBeGreaterThan(MECH_TUNE.fadeDist);
    // Claude's rule for this ticket: 4 m or more, so the model has room before it would fade
    expect(distance, `the key at ${key.at} s`).toBeGreaterThanOrEqual(4);
  }
});

test('the landing sinks two craft to port, out at sea, and no blast is put in its last 1.5 seconds', () => {
  // the two craft of the row that the outside shot watches go down (the near craft beside the player's has no z: it
  // begins where the player's craft does, and the 6 s key turns to it)
  const sinks = landing.events.filter(event => event.kind === 'sink' && event.z !== undefined);
  const bursts = landing.events.filter(event => event.kind === 'burst');
  expect(sinks).toHaveLength(2);
  // two shells hit the craft to port and the third is the near miss beside the player's craft that takes the riders
  expect(bursts).toHaveLength(3);
  const nearMiss = bursts.find(event => event.kind === 'burst' && event.x < 0 && event.z < 175 + CRAFT_TUNE.length);
  expect(nearMiss).toBeDefined();
  for (const sink of sinks) {
    if (sink.kind !== 'sink') throw new Error('not a sink');
    expect(sink.z ?? 0).toBeGreaterThan(M1B_HAND.bounds.maxZ);
  }
  const near = landing.events.filter(event => event.kind === 'sink' && event.z === undefined);
  expect(near).toHaveLength(1);
  for (const event of landing.events) {
    if (event.kind === 'burst' || event.kind === 'sink') expect(event.at, `${event.kind}`).toBeLessThan(10.5);
  }
});

test('the two new landing lines have text in ja and en', () => {
  for (const code of ['ja', 'en']) {
    for (const key of ['cutscene.landing.shell', 'cutscene.landing.sweep']) {
      expect(LANG[code].ui[key], `${code} lacks "${key}"`).toBeTruthy();
    }
  }
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

test('every table keeps to its cutscene length, and all three cutscenes have one', () => {
  for (const id of ['landing', 'wave2-sinks', 'beach-held'] as const) {
    const def = CUTSCENES[id];
    if (!def) throw new Error(`no table for ${id}`);
    for (const key of def.camera) expect(key.at, `${id} camera`).toBeLessThanOrEqual(CUTSCENE_SEC[id]);
    for (const line of def.lines) {
      expect(line.from, `${id} line`).toBeLessThan(line.to);
      expect(line.to, `${id} line`).toBeLessThanOrEqual(CUTSCENE_SEC[id]);
    }
    for (const event of def.events) {
      const sec = 'sec' in event ? event.sec : 0;
      expect(event.at + sec, `${id} ${event.kind}`).toBeLessThanOrEqual(CUTSCENE_SEC[id]);
    }
    expect(hasCutscene(id)).toBe(true);
  }
});

test('a relative key is built from where the mech stands, and an absolute one is not', () => {
  const table = CUTSCENES['wave2-sinks'];
  if (!table) throw new Error('no table for wave2-sinks');
  const [first, second] = table.camera;
  expect(first.rel).toBe(true);
  expect(second.rel).toBeUndefined();
  const mech = { x: 13, z: -22 };
  const pose = cutscenePose('wave2-sinks', first.at, mech);
  expect(pose.pos).toEqual([first.pos[0] + 13, first.pos[1], first.pos[2] - 22]);
  expect(pose.look).toEqual([first.look[0] + 13, first.look[1], first.look[2] - 22]);
  // the absolute key keeps the map's coordinates wherever the mech is
  expect(cutscenePose('wave2-sinks', second.at, mech).pos).toEqual(second.pos);
  // between a relative and an absolute key the camera is between the two built poses
  const mid = cutscenePose('wave2-sinks', (first.at + second.at) / 2, mech);
  expect(mid.pos[0]).toBeCloseTo((pose.pos[0] + second.pos[0]) / 2, 9);
  expect(mid.pos[2]).toBeCloseTo((pose.pos[2] + second.pos[2]) / 2, 9);
  // the last key is relative too: it moves with the mech
  const last = table.camera[table.camera.length - 1];
  expect(cutscenePose('wave2-sinks', last.at, { x: 0, z: 0 }).pos[2]).toBe(last.pos[2]);
  expect(cutscenePose('wave2-sinks', last.at, { x: 0, z: 30 }).pos[2]).toBe(last.pos[2] + 30);
  expect(() => cutscenePose('wave2-sinks', 0)).toThrow();
});

test('the new tables have their lines in ja and en, one after another', () => {
  for (const id of ['wave2-sinks', 'beach-held'] as const) {
    const def = CUTSCENES[id];
    if (!def) throw new Error(`no table for ${id}`);
    expect(def.lines).toHaveLength(2);
    expect(def.lines[0].to).toBeLessThanOrEqual(def.lines[1].from);
    for (const code of ['ja', 'en']) {
      for (const line of def.lines) expect(LANG[code].ui[line.key], `${code} lacks "${line.key}"`).toBeTruthy();
    }
  }
});

test('the craft that wave2-sinks sinks lie at sea, and the battery collapse names real targets', () => {
  const sea = M1B_HAND.bounds.maxZ;
  const sinks = (CUTSCENES['wave2-sinks']?.events ?? []).filter(event => event.kind === 'sink');
  expect(sinks).toHaveLength(4);
  for (const sink of sinks) expect((sink.kind === 'sink' ? sink.z : 0) ?? 0).toBeGreaterThan(sea);
  const ids = M1B_HAND.targets.map(target => target.id);
  for (const event of CUTSCENES['beach-held']?.events ?? []) {
    if (event.kind === 'collapse') for (const id of event.targets) expect(ids).toContain(id);
  }
});

const rampEvent = landing.events.find(event => event.kind === 'ramp');
if (!rampEvent || rampEvent.kind !== 'ramp') throw new Error('landing has no ramp event');

test('the landing mech stands on the deck the whole time, where the new game puts it', () => {
  const start = newGame(M1B_HAND).mech;
  for (let second = 0; second <= CUTSCENE_SEC.landing + 3; second += 0.05) {
    const at = cutsceneMech('landing', second);
    if (!at) throw new Error('the landing has no mech path');
    expect(at, `at ${second}`).toEqual({ x: start.x, y: start.y, z: start.z, speed: 0 });
  }
});

test('the ramp is down before the cutscene ends, so the player can walk off the deck', () => {
  expect(rampEvent.at + rampEvent.sec).toBeCloseTo(10.8, 6);
  expect(rampEvent.at + rampEvent.sec).toBeLessThan(CUTSCENE_SEC.landing);
});

test('only the landing has a mech path, and its keys are in time order inside the cutscene', () => {
  expect(cutsceneMech('wave2-sinks', 1)).toBeNull();
  expect(cutsceneMech('beach-held', 1)).toBeNull();
  const keys = CUTSCENES.landing?.mech ?? [];
  expect(keys.length).toBeGreaterThanOrEqual(1);
  keys.forEach((key, i) => {
    expect(key.at).toBeLessThanOrEqual(CUTSCENE_SEC.landing);
    if (i > 0) expect(key.at).toBeGreaterThan(keys[i - 1].at);
  });
});

test('the six riders stand on the deck, clear of the mech and the wheelhouse', () => {
  expect(LANDING_RIDERS).toHaveLength(6);
  expect(new Set(LANDING_RIDERS.map(rider => rider.id)).size).toBe(LANDING_RIDERS.length);
  const [deck] = craftRects(M1B_HAND.bounds);
  const start = newGame(M1B_HAND).mech;
  const wheelhouseFront =
    craftZ(M1B_HAND.bounds) + CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern - CRAFT_TUNE.wheelhouse.d / 2;
  for (const rider of LANDING_RIDERS) {
    expect(Math.abs(rider.x - deck.x), `${rider.id} x`).toBeLessThanOrEqual(deck.halfW);
    expect(Math.abs(rider.z - deck.z), `${rider.id} z`).toBeLessThanOrEqual(deck.halfD);
    expect(rider.z, `${rider.id} wheelhouse`).toBeLessThan(wheelhouseFront);
    const away = Math.hypot(rider.x - start.x, rider.z - start.z);
    expect(away, `${rider.id} mech`).toBeGreaterThan(MECH_TUNE.radius);
  }
  for (const id of ['r2', 'r3']) {
    const rider = LANDING_RIDERS.find(entry => entry.id === id);
    if (!rider) throw new Error(`the landing has no rider "${id}"`);
    expect(Math.hypot(rider.x - start.x, rider.z - start.z), `${id} from the mech`).toBeGreaterThanOrEqual(2.5);
  }
});

test('a rider stands before its event, falls smoothly over sec, and stays down', () => {
  const events = landing.events;
  const event = events.find(entry => entry.kind === 'riders' && entry.ids.includes('r1'));
  if (!event || event.kind !== 'riders') throw new Error('no riders event names r1');
  expect(riderFall('r1', event.at - 0.1, events)).toBe(0);
  expect(riderFall('r1', event.at, events)).toBe(0);
  expect(riderFall('r1', event.at + event.sec, events)).toBeCloseTo(1, 9);
  expect(riderFall('r1', event.at + event.sec + 5, events)).toBeCloseTo(1, 9);
  let last = 0;
  for (let second = event.at; second <= event.at + event.sec; second += event.sec / 20) {
    const fall = riderFall('r1', second, events);
    expect(fall).toBeGreaterThanOrEqual(last);
    last = fall;
  }
  expect(riderFall('nobody', event.at + event.sec, events)).toBe(0);
});

test('every fall in the table names a rider that rides', () => {
  const ids = new Set(LANDING_RIDERS.map(rider => rider.id));
  for (const event of landing.events) {
    if (event.kind !== 'riders') continue;
    expect(event.sec).toBeGreaterThan(0);
    for (const id of event.ids) expect(ids, `the table names "${id}"`).toContain(id);
  }
});

test('the near shell takes r1 and r5, the sweep takes r2, r3 and r4, and r6 stands', () => {
  const events = landing.events;
  expect(riderFall('r1', 6.9, events)).toBeGreaterThan(0);
  expect(riderFall('r5', 7.3, events)).toBeCloseTo(1, 9);
  expect(riderFall('r1', 7.3, events)).toBeCloseTo(1, 9);
  expect(riderFall('r2', 11.9, events)).toBeCloseTo(1, 9);
  expect(riderFall('r3', 11.9, events)).toBeCloseTo(1, 9);
  expect(riderFall('r4', 11.9, events)).toBeCloseTo(1, 9);
  expect(riderFall('r6', CUTSCENE_SEC.landing, events)).toBe(0);
});

test('the tracers come only after the ramp is down and nothing blows up in the last half second', () => {
  const ramp = landing.events.find(event => event.kind === 'ramp');
  if (!ramp || ramp.kind !== 'ramp') throw new Error('landing has no ramp event');
  const down = ramp.at + ramp.sec;
  const tracers = landing.events.filter(event => event.kind === 'tracers');
  expect(tracers.length).toBeGreaterThan(0);
  for (const event of tracers) {
    expect(event.at, 'a tracer before the ramp is down').toBeGreaterThan(down);
    expect(event.at, 'a tracer in the last half second').toBeLessThan(CUTSCENE_SEC.landing - 0.5);
  }
  for (const event of landing.events) {
    if (event.kind === 'burst')
      expect(event.at, 'a blast in the last half second').toBeLessThan(CUTSCENE_SEC.landing - 0.5);
  }
});
