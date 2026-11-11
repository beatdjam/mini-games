import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { DUMMY_TUNE, FCS_TUNE, FEEL_TUNE, MECH_TUNE, MOVE_TUNE, type FcsKind } from '../../src/data/tune.ts';
import { fireRay } from '../../src/logic/fire.ts';
import { newFcs, spreadDir, stepFcs } from '../../src/logic/fcs.ts';
import { DUMMY_HEIGHT, dummyBox, spawnDummies, stepDummies } from '../../src/logic/dummies.ts';
import { newMech, stepMech, type MechInput } from '../../src/logic/mech.ts';

const DEG = Math.PI / 180;
const FRAMES = 300; // 5 s at 60 steps a second
const CHEST = MECH_TUNE.chestHeight; // the chest above the feet (m)
// The dummy's home in front of the mech (m). At this distance the 2 m dummy fills most of the 1.5 degree spread cone,
// and the dummy's 10 m circle plus the aim's 6 degree offset stays inside hard's 20 degree break cone.
const DISTANCE = 42;
const OFFSET = 6; // how far the aim is turned from the dummy's centre (deg)

interface Rates {
  shots: number;
  hits: number;
  rate: number;
}

// A still mech fires at one circling dummy for 5 s; the aim line stays at what was 6 degrees from its centre. The
// dummy moves, so the aim assist's reach and follow speed matter (a still dummy makes soft's pull and hard's lock
// race on the same clock, where the values above let soft start hitting first).
function run(kind: FcsKind): Rates {
  const list = spawnDummies(createRng(42));
  const dummy = list[0];
  dummy.move = 'circle';
  dummy.homeX = 0;
  dummy.homeZ = -DISTANCE;
  dummy.x = 0;
  dummy.z = -DISTANCE;
  dummy.phase = 0;

  const mech = newMech();
  const state = newFcs();
  const spreadRng = createRng(99);
  const toCentre = { dx: dummy.x, dy: dummy.y + DUMMY_HEIGHT / 2 - CHEST, dz: dummy.z };
  const a = OFFSET * DEG;
  const aim = {
    ox: 0,
    oy: CHEST,
    oz: 0,
    dx: toCentre.dx * Math.cos(a) - toCentre.dz * Math.sin(a),
    dy: toCentre.dy,
    dz: toCentre.dx * Math.sin(a) + toCentre.dz * Math.cos(a),
  };
  const input: MechInput = {
    moveX: 0,
    moveZ: 0,
    turn: 0,
    jump: false,
    jumpHeld: false,
    boost: false,
    fire: true,
  };
  const tune = FCS_TUNE[kind];
  let shots = 0;
  let hits = 0;

  for (let frame = 0; frame < FRAMES; frame++) {
    const events = stepMech(mech, input, 1 / 60, MOVE_TUNE, FEEL_TUNE.fireRate);
    const targets = [
      { id: dummy.id, box: dummyBox(dummy), cx: dummy.x, cy: dummy.y + DUMMY_HEIGHT / 2, cz: dummy.z, alive: true },
    ];
    const result = stepFcs(state, kind, tune, aim, { x: mech.x, y: mech.y + CHEST, z: mech.z }, targets, 1 / 60);
    for (const event of events) {
      if (event.kind !== 'fire') continue;
      shots++;
      const dir = spreadDir(result.shotDir, tune.spread, spreadRng);
      const hit = fireRay(mech.x, mech.y + CHEST, mech.z, dir.dx, dir.dy, dir.dz, tune.range, [dummyBox(dummy)]);
      if (hit >= 0) hits++;
    }
    stepDummies(list, 1 / 60, DUMMY_TUNE);
  }
  return { shots, hits, rate: shots > 0 ? hits / shots : 0 };
}

test('the three kinds hit moving dummies more often in the order manual, soft, hard', () => {
  const manual = run('manual');
  const soft = run('soft');
  const hard = run('hard');
  expect(manual.rate).toBeLessThan(soft.rate);
  expect(soft.rate).toBeLessThan(hard.rate);
  expect(hard.rate).toBeGreaterThan(0.9);
});

test('the same run twice gives the same numbers', () => {
  expect(run('hard')).toEqual(run('hard'));
});
