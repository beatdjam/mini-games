// The sound layer is pure about what to play: a frame of events becomes a list of sounds, cut per kind, with the
// distance's gain and pitch already applied. Nothing here starts audio.
import { expect, test } from 'vitest';
import { SOUND_DISTANCE, SOUND_FRAME_LIMIT } from '../../src/data/sounds.ts';
import type { GameEvent } from '../../src/logic/game.ts';
import { planSounds, soundMix, type SoundTarget } from '../../src/view/sound.ts';

const MECH = { x: 0, z: 0 };

const shot = (weapon: 'autocannon' | 'heavyGun'): GameEvent => ({
  kind: 'shot',
  x: MECH.x,
  y: 0,
  z: MECH.z,
  dx: 0,
  dy: 0,
  dz: 1,
  weapon,
});

const hit = (target: string | null, mech = false): GameEvent => ({
  kind: 'hit',
  x: MECH.x,
  y: 0,
  z: MECH.z,
  weapon: 'autocannon',
  target,
  prop: null,
  enemy: null,
  mech,
});

const target = (id: string, x: number): SoundTarget => ({
  id,
  box: { minX: x, maxX: x, minZ: 0, maxZ: 0 },
});

test('a frame maps its events to the table’s sounds', () => {
  const events: GameEvent[] = [
    shot('autocannon'),
    shot('heavyGun'),
    hit('pillbox'),
    hit(null),
    hit(null, true),
    { kind: 'destroyed', id: 'pillbox' },
    { kind: 'enemyDown', id: 'e', x: 10, z: 0 },
    { kind: 'mineBlast', x: 0, z: 20, hit: false },
    { kind: 'shellWarn', x: 0, z: 30, radius: 4 },
    { kind: 'shellLand', x: 0, z: 30, hit: false },
    { kind: 'damaged', amount: 10, fromX: 0, fromZ: 1 },
    { kind: 'downed' },
    { kind: 'script', event: { kind: 'radio', line: 'radio.test', time: 0 } },
  ];
  const names = planSounds({ events, mech: MECH, targets: [target('pillbox', 40)], hostile: [{ x: 0, z: 50 }] }).map(
    cue => cue.name,
  );
  expect(names).toEqual([
    'autocannon',
    'heavyGun',
    'impactArmor',
    'impactDirt',
    'mechHit',
    'explosionLarge',
    'explosionSmall',
    'shellWarn',
    'shellLand',
    'downed',
    'radio',
    'enemyGun',
  ]);
  // a mine blast is the big explosion too, and the per-frame limit leaves one big blast when two land together
  expect(
    planSounds({ events: [{ kind: 'mineBlast', x: 0, z: 20, hit: false }], mech: MECH, targets: [], hostile: [] }).map(
      cue => cue.name,
    ),
  ).toEqual(['explosionLarge']);
});

test('a hit on the mech plays the metal sound once, even with its damaged event', () => {
  const metal: GameEvent[] = [hit(null, true), { kind: 'damaged', amount: 10, fromX: 0, fromZ: 1 }];
  // The bullet's hit and the damage it does are the same blow; the per-frame limit leaves one metal sound.
  expect(planSounds({ events: metal, mech: MECH, targets: [], hostile: [] }).map(cue => cue.name)).toEqual(['mechHit']);
  // A mine or a mortar shell hurts the mech without a hit event, so the damaged event still plays it.
  expect(
    planSounds({
      events: [{ kind: 'damaged', amount: 10, fromX: 0, fromZ: 1 }],
      mech: MECH,
      targets: [],
      hostile: [],
    }).map(cue => cue.name),
  ).toEqual(['mechHit']);
});

test('the same sound in one frame is cut to the table’s limit', () => {
  const events: GameEvent[] = [
    ...Array.from({ length: 5 }, () => shot('autocannon')),
    ...Array.from({ length: 5 }, () => hit(null)),
  ];
  const cues = planSounds({
    events,
    mech: MECH,
    targets: [],
    hostile: Array.from({ length: 5 }, (_, i) => ({ x: i, z: 0 })),
  });
  const count = (name: string): number => cues.filter(cue => cue.name === name).length;
  expect(count('autocannon')).toBe(SOUND_FRAME_LIMIT.autocannon);
  expect(count('impactDirt')).toBe(SOUND_FRAME_LIMIT.impactDirt);
  expect(count('enemyGun')).toBe(SOUND_FRAME_LIMIT.enemyGun);
  expect(cues).toHaveLength(SOUND_FRAME_LIMIT.autocannon + SOUND_FRAME_LIMIT.impactDirt + SOUND_FRAME_LIMIT.enemyGun);
});

test('the farther a sound is, the lower its level', () => {
  expect(soundMix(SOUND_DISTANCE.near).gain).toBe(1);
  expect(soundMix(SOUND_DISTANCE.far).gain).toBeCloseTo(SOUND_DISTANCE.minGain);
  expect(soundMix(100).gain).toBeLessThan(soundMix(SOUND_DISTANCE.near).gain);
  expect(soundMix(100).gain).toBeGreaterThan(soundMix(SOUND_DISTANCE.far).gain);
});

test('the farther a sound is, the lower its pitch', () => {
  expect(soundMix(SOUND_DISTANCE.near).pitch).toBe(1);
  expect(soundMix(SOUND_DISTANCE.far).pitch).toBeCloseTo(SOUND_DISTANCE.farPitch);
  expect(soundMix(SOUND_DISTANCE.far).pitch).toBeLessThan(soundMix(SOUND_DISTANCE.near).pitch);
});

test('a destroyed target far from the mech plays quieter than one at the mech', () => {
  const event: GameEvent = { kind: 'destroyed', id: 'far' };
  const near = planSounds({ events: [event], mech: MECH, targets: [target('far', MECH.x)], hostile: [] });
  const far = planSounds({ events: [event], mech: MECH, targets: [target('far', SOUND_DISTANCE.far)], hostile: [] });
  expect(far[0].gain).toBeLessThan(near[0].gain);
  expect(far[0].pitch).toBeLessThan(near[0].pitch);
});
