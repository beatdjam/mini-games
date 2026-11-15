import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { CUTSCENES, type CutsceneEvent } from '../../src/data/cutscenes.ts';
import { CRAFT_TUNE, craftSideX, craftZ } from '../../src/data/craft.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { LANDING_RIDERS, LANDING_TUNE } from '../../src/data/landing.ts';
import {
  hasCutscene,
  cutsceneElapsed,
  cutsceneEvents,
  cutsceneLine,
  cutsceneMech,
  cutscenePose,
  cutsceneSail,
  riderFall,
  sinkBlastZ,
} from '../../src/logic/cutscene.ts';
import { craftRects } from '../../src/logic/craft.ts';
import { newGame } from '../../src/logic/game.ts';
import { cameraPose } from '../../src/view/camera.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const landing = CUTSCENES.landing;
if (!landing) throw new Error('no table for landing');
const keys = landing.camera;

// The drawn mech at a second: it rides with the craft the landing brings in, and the keys are offsets from it.
function originAt(second: number) {
  const mech = cutsceneMech('landing', second);
  if (mech === null) throw new Error('the landing has no mech path');
  return mech;
}

const poseAt = (second: number) => cutscenePose('landing', second, originAt(second));

test('the camera is exactly a key at the key second', () => {
  for (const key of keys) {
    const origin = originAt(key.at);
    const pose = poseAt(key.at);
    for (let i = 0; i < 3; i++) {
      expect(pose.pos[i]).toBeCloseTo(key.pos[i] + (i === 0 ? origin.x : i === 2 ? origin.z : 0), 9);
      expect(pose.look[i]).toBeCloseTo(key.look[i] + (i === 0 ? origin.x : i === 2 ? origin.z : 0), 9);
    }
  }
});

test('between two keys the camera is between their poses, and halfway at the middle second', () => {
  const a = keys[0];
  const b = keys[1];
  const origin = originAt((a.at + b.at) / 2);
  const mid = poseAt((a.at + b.at) / 2);
  for (let i = 0; i < 3; i++) {
    const shift = i === 0 ? origin.x : i === 2 ? origin.z : 0;
    expect(mid.pos[i]).toBeCloseTo((a.pos[i] + b.pos[i]) / 2 + shift, 9);
    expect(mid.look[i]).toBeCloseTo((a.look[i] + b.look[i]) / 2 + shift, 9);
  }
  const early = poseAt(a.at + (b.at - a.at) * 0.25);
  // eased: a quarter of the time is less than a quarter of the way
  const along = (early.pos[0] - a.pos[0]) / (b.pos[0] - a.pos[0]);
  expect(along).toBeGreaterThan(0);
  expect(along).toBeLessThan(0.25);
});

test('after the end, and before the start, the camera keeps the nearest key', () => {
  const last = keys[keys.length - 1];
  expect(poseAt(last.at + 5).pos).toEqual(last.pos.map((value, i) => value + (i === 2 ? originAt(last.at).z : 0)));
  expect(poseAt(-1).pos).toEqual(keys[0].pos.map((value, i) => value + (i === 2 ? originAt(-1).z : 0)));
});

test('the last key is the game camera behind the mech at the start, and the table fits the cutscene', () => {
  const mech = newGame(M1B_HAND).mech;
  const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, 0, CAMERA_TUNE, []);
  const last = keys[keys.length - 1];
  const finalPose = poseAt(last.at);
  expect(finalPose.pos[0]).toBeCloseTo(pose.pos.x, 2);
  expect(finalPose.pos[1]).toBeCloseTo(pose.pos.y, 2);
  expect(finalPose.pos[2]).toBeCloseTo(pose.pos.z, 2);
  expect(finalPose.look[0]).toBeCloseTo(pose.look.x, 2);
  expect(finalPose.look[1]).toBeCloseTo(pose.look.y, 2);
  expect(finalPose.look[2]).toBeCloseTo(pose.look.z, 2);
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

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const inside = (box: Box, point: readonly number[]): boolean =>
  point[0] >= box.minX &&
  point[0] <= box.maxX &&
  point[1] >= box.minY &&
  point[1] <= box.maxY &&
  point[2] >= box.minZ &&
  point[2] <= box.maxZ;

test('the landing camera never cuts, and never goes into the wheelhouse or a wall of the craft, at a key or between two', () => {
  const z0 = craftZ(M1B_HAND.bounds);
  const halfW = CRAFT_TUNE.width / 2;
  const wheelhouse = wheelhouseBox();
  const stern = {
    minX: -halfW,
    maxX: halfW,
    minY: 0,
    maxY: CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight + CRAFT_TUNE.sternHeightExtra,
    minZ: z0 + CRAFT_TUNE.length - CRAFT_TUNE.wallThickness,
    maxZ: z0 + CRAFT_TUNE.length,
  };
  const wallY = CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight;
  const sideX = CRAFT_TUNE.width / 2 - CRAFT_TUNE.wallThickness / 2;
  const walls = [-sideX, sideX].map(x => ({
    minX: x - CRAFT_TUNE.wallThickness / 2,
    maxX: x + CRAFT_TUNE.wallThickness / 2,
    minY: 0,
    maxY: wallY,
    minZ: z0,
    maxZ: z0 + CRAFT_TUNE.length,
  }));
  const shifted = (box: Box, shift: number): Box => ({
    ...box,
    minZ: box.minZ + shift,
    maxZ: box.maxZ + shift,
  });
  let last: readonly number[] | null = null;
  for (let i = 0; i <= Math.round(CUTSCENE_SEC.landing / 0.05); i++) {
    const second = i * 0.05;
    // the craft and its boxes sail in with the picture
    const shift = cutsceneSail('landing', second);
    const pose = poseAt(second);
    // no cut: at 0.05 s the camera never jumps farther than it could ease in that time (the old 3.45 s cut did)
    if (last !== null) {
      const jump = Math.hypot(pose.pos[0] - last[0], pose.pos[1] - last[1], pose.pos[2] - last[2]);
      expect(jump, `the camera jumps at ${second} s`).toBeLessThan(2);
    }
    last = pose.pos;
    expect(inside(shifted(wheelhouse, shift), pose.pos), `the camera at ${second} s`).toBe(false);
    expect(inside(shifted(stern, shift), pose.pos), `the camera at ${second} s (stern)`).toBe(false);
    for (const wall of walls) {
      expect(inside(shifted(wall, shift), pose.pos), `the camera at ${second} s (wall)`).toBe(false);
    }
  }
});

test('the landing starts outside and goes into the craft without a cut, looking forward once inside', () => {
  const z = craftZ(M1B_HAND.bounds);
  const first = keys[0];
  expect(first.at).toBe(0);
  const firstPose = poseAt(0);
  // the opening key is over the sea behind the stern, its look at the middle of the player's craft
  expect(firstPose.pos[2]).toBeGreaterThan(z + cutsceneSail('landing', 0) + CRAFT_TUNE.length);
  expect(Math.abs(firstPose.look[0])).toBeLessThan(CRAFT_TUNE.width / 2);
  // no cut: no two keys are closer than half a second, so the camera eases from one to the next
  for (let i = 1; i < keys.length; i++) expect(keys[i].at - keys[i - 1].at).toBeGreaterThanOrEqual(0.5);
  // there are keys inside the hull, above the deck, and from the first of them on the camera looks forward (the ramp)
  const inside = keys.filter(key => {
    const pose = poseAt(key.at);
    const craftZAt = z + cutsceneSail('landing', key.at);
    return (
      Math.abs(pose.pos[0]) < CRAFT_TUNE.width / 2 &&
      pose.pos[2] > craftZAt &&
      pose.pos[2] < craftZAt + CRAFT_TUNE.length
    );
  });
  expect(inside.length).toBeGreaterThan(0);
  for (const key of inside) {
    const pose = poseAt(key.at);
    expect(pose.pos[1], `the key at ${key.at} s`).toBeGreaterThan(CRAFT_TUNE.deckTop);
    expect(pose.look[2], `the key at ${key.at} s looks forward`).toBeLessThan(pose.pos[2]);
    // a look to port or starboard would swing the point far off the camera's x; the ramp is ahead
    expect(Math.abs(pose.look[0] - pose.pos[0]), `the key at ${key.at} s looks ahead`).toBeLessThan(3);
  }
  // the first key is outside, so the inside keys come after the approach
  expect(keys.indexOf(inside[0])).toBeGreaterThan(0);
});

test('the keys inside the craft keep the mech out of its see-through distance', () => {
  const start = newGame(M1B_HAND).mech;
  const z = craftZ(M1B_HAND.bounds);
  const insideKeys = keys.filter(key => {
    const pose = poseAt(key.at);
    const craftZAt = z + cutsceneSail('landing', key.at);
    return (
      Math.abs(pose.pos[0]) < CRAFT_TUNE.width / 2 &&
      pose.pos[2] > craftZAt &&
      pose.pos[2] < craftZAt + CRAFT_TUNE.length
    );
  });
  expect(insideKeys.length).toBeGreaterThan(0);
  for (const key of insideKeys) {
    const origin = originAt(key.at);
    const chest = [origin.x, start.y + MECH_TUNE.chestHeight, origin.z] as const;
    const pose = poseAt(key.at);
    const distance = Math.hypot(pose.pos[0] - chest[0], pose.pos[1] - chest[1], pose.pos[2] - chest[2]);
    expect(distance, `the key at ${key.at} s`).toBeGreaterThan(MECH_TUNE.fadeDist);
    // Claude's rule for this ticket: 4 m or more, so the model has room before it would fade
    expect(distance, `the key at ${key.at} s`).toBeGreaterThanOrEqual(4);
  }
});

test('the landing sinks three craft in the row it brings in, and no blast is put in its last 1.5 seconds', () => {
  const sinks = landing.events.filter(event => event.kind === 'sink');
  const bursts = landing.events.filter(event => event.kind === 'burst');
  expect(sinks).toHaveLength(3);
  // two shells hit the craft to port and the third is the near miss at the port bow that takes the riders
  expect(bursts).toHaveLength(3);
  const nearMiss = bursts.find(event => event.kind === 'burst' && event.x === -6);
  expect(nearMiss).toBeDefined();
  // The sinking craft sail in the same row as the three, never seaward of the player's craft while they sail: no craft
  // waits behind a craft that has already reached the beach.
  const shore = craftZ(M1B_HAND.bounds);
  for (const sink of sinks) {
    if (sink.kind !== 'sink' || sink.z === undefined) throw new Error('a sinking craft has no place in the row');
    expect(sink.z).toBeLessThanOrEqual(shore);
    for (let second = 0; second <= sink.at + 1e-9; second += 0.1) {
      const craft = sink.z + cutsceneSail('landing', second);
      const player = shore + cutsceneSail('landing', second);
      expect(craft, `the craft at ${sink.x} at ${second} s`).toBeLessThanOrEqual(player + 1e-9);
    }
  }
  // the camera leaves the outside shot at 5.4 s, after every sink has gone down in it
  const turn = keys.find(key => key.at === 5.4);
  if (!turn) throw new Error('the landing has no turn-in key at 5.4 s');
  for (const sink of sinks) {
    if (sink.kind !== 'sink') throw new Error('not a sink');
    expect(sink.at + sink.sec, `the sink at ${sink.at} s`).toBeLessThanOrEqual(turn.at + 1e-9);
  }
  for (const event of landing.events) {
    if (event.kind === 'burst' || event.kind === 'sink') expect(event.at, `${event.kind}`).toBeLessThan(10.5);
  }
});

test('the blast of a sinking craft goes off inside its hull at that second', () => {
  const shore = craftZ(M1B_HAND.bounds);
  let sailing = 0;
  for (const id of ['landing', 'wave2-sinks'] as const) {
    const def = CUTSCENES[id];
    if (!def) throw new Error(`no table for ${id}`);
    for (const event of def.events) {
      if (event.kind !== 'sink') continue;
      const z0 = event.z ?? shore;
      const hullZ = z0 + cutsceneSail(id, event.at);
      const blastZ = sinkBlastZ(id, event.at, z0);
      expect(blastZ, `${id} sink at ${event.at} s`).toBeGreaterThan(hullZ);
      expect(blastZ, `${id} sink at ${event.at} s`).toBeLessThan(hullZ + CRAFT_TUNE.length);
      expect(blastZ, `${id} sink at ${event.at} s`).toBeCloseTo(hullZ + CRAFT_TUNE.length / 2, 9);
      if (cutsceneSail(id, event.at) > 0) sailing++;
    }
  }
  // the landing's sinks sail in, so their blast rides with the hull rather than staying at the row's place at the shore
  expect(sailing).toBeGreaterThan(0);
});

test('the three craft sail in together and reach the shore just before the ramps come down', () => {
  const shore = craftZ(M1B_HAND.bounds);
  const sail = landing.events.find(event => event.kind === 'sail');
  if (!sail || sail.kind !== 'sail') throw new Error('the landing has no sail event');
  expect(cutsceneSail('landing', 0)).toBe(sail.from);
  expect(shore + cutsceneSail('landing', 0)).toBeGreaterThan(shore);
  // all three share the one sail event, so they keep the same z and speed
  const sides = [
    craftSideX(M1B_HAND.bounds, -1),
    (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2,
    craftSideX(M1B_HAND.bounds, 1),
  ];
  expect(new Set(sides).size).toBe(3);
  // at the sail's end they are at the beach, before the ramp starts down
  const arrival = sail.at + sail.sec;
  expect(cutsceneSail('landing', arrival)).toBe(0);
  const ramp = landing.events.find(event => event.kind === 'ramp');
  if (!ramp || ramp.kind !== 'ramp') throw new Error('the landing has no ramp event');
  expect(arrival).toBeLessThan(ramp.at);
  expect(ramp.at - arrival).toBeLessThanOrEqual(1);
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

test('a view starts at -1 until the cutscene has played a second, and in the middle at that second', () => {
  expect(cutsceneElapsed(null)).toBe(-1);
  // only starting: the events at second 0 have not played yet (cutsceneEvents takes the events after `from`)
  expect(cutsceneElapsed({ id: 'landing', left: CUTSCENE_SEC.landing })).toBe(-1);
  expect(cutsceneElapsed({ id: 'landing', left: CUTSCENE_SEC.landing - 0.01 })).toBeCloseTo(0.01, 9);
  expect(cutsceneElapsed({ id: 'wave2-sinks', left: 2.5 })).toBeCloseTo(CUTSCENE_SEC['wave2-sinks'] - 2.5, 9);
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

test('the landing mech rides in on the deck and stands at its start once the craft is ashore', () => {
  const start = newGame(M1B_HAND).mech;
  for (let second = 0; second <= CUTSCENE_SEC.landing + 3; second += 0.05) {
    const at = cutsceneMech('landing', second);
    if (!at) throw new Error('the landing has no mech path');
    expect({ x: at.x, y: at.y, speed: at.speed }, `at ${second}`).toEqual({ x: start.x, y: start.y, speed: 0 });
    expect(at.z, `at ${second}`).toBeCloseTo(start.z + cutsceneSail('landing', second), 9);
  }
  // at the start it is a whole run of water seaward of the deck's place at the beach
  expect(cutsceneMech('landing', 0)?.z).toBeGreaterThan(start.z);
  expect(cutsceneMech('landing', CUTSCENE_SEC.landing)?.z).toBeCloseTo(start.z, 9);
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
  expect(riderFall('r4', CUTSCENE_SEC.landing, events)).toBeCloseTo(1, 9);
  expect(riderFall('r6', CUTSCENE_SEC.landing, events)).toBe(0);
});

test('each fall starts after the burst that takes it has reached the deck', () => {
  const tracers = landing.events.filter(event => event.kind === 'tracers');
  const arrivalOf = (event: Extract<CutsceneEvent, { kind: 'tracers' }>): number =>
    event.at + (event.z - LANDING_TUNE.tracer.fromZ) / LANDING_TUNE.tracer.speed;
  // The sweep's bursts and the riders they take: the first (11.0 s) takes r2 and r3, the second (11.2 s) takes r4.
  // The near shell's riders (r1 and r5) are not checked here; their fall is the shell's.
  const takes = [
    ['r2', 11.0],
    ['r3', 11.0],
    ['r4', 11.2],
  ] as const;
  for (const [id, burstAt] of takes) {
    const tracer = tracers.find(event => event.at === burstAt);
    if (!tracer) throw new Error(`the landing has no tracer at ${burstAt} s`);
    const fall = landing.events.find(event => event.kind === 'riders' && event.ids.includes(id) && event.at >= 10);
    if (!fall) throw new Error(`the landing has no sweep fall for ${id}`);
    expect(fall.at, `${id} falls before its burst reaches the deck`).toBeGreaterThan(arrivalOf(tracer));
  }
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
