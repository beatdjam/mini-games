// The sound layer is pure about what to play: a frame of events becomes a list of sounds, cut per kind, with the
// distance's gain and pitch already applied. Nothing here starts audio: the frame and the ambience run against a
// stand-in synth that only records what it was asked to play.
import { beforeEach, expect, test, vi } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { SOUND_AMBIENT, SOUND_DISTANCE, SOUND_FRAME_LIMIT } from '../../src/data/sounds.ts';
import type { Bullet, GameEvent, GameModel } from '../../src/logic/game.ts';
import { planSounds, resetSound, soundFrame, soundMix, stepAmbient, type SoundTarget } from '../../src/view/sound.ts';

const synth = vi.hoisted(() => ({
  tones: [] as { type: string; f0: number; dur: number }[],
  noises: [] as { f0: number; dur: number }[],
}));

vi.mock('@engine/audio/index.ts', () => ({
  audioNow: () => 0,
  sweepTone: (_t: number, type: string, f0: number, _f1: number, dur: number) => {
    synth.tones.push({ type, f0, dur });
  },
  noiseBurst: (_t: number, dur: number, _vol: number, _type: string, f0: number) => {
    synth.noises.push({ f0, dur });
  },
}));

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

beforeEach(() => {
  synth.tones.length = 0;
  synth.noises.length = 0;
  resetSound();
});

const enemyBullet = (): Bullet => ({ x: 6, y: 1, z: 4, dx: 0, dy: 0, dz: 1, left: 10, enemy: 'grunt' });
// Only the fields soundFrame reads: the frame's events, the bullets, the mech and the targets.
const fakeGame = (bullets: Bullet[]): GameModel =>
  ({ bullets, events: [], mech: MECH, targets: [] }) as unknown as GameModel;

test('one enemy bullet is heard once, however many frames it lives', () => {
  const game = fakeGame([enemyBullet()]);
  soundFrame(game, 0);
  soundFrame(game, 0);
  // the enemy gun is the only sound with a tone here; the ambience's wave is noise only and its far gun is not due yet
  expect(synth.tones).toHaveLength(1);
  expect(synth.tones[0].type).toBe('sine');
});

test('the ambience keeps its interval and starts again from its seed', () => {
  const dt = 1 / 60;
  const run = () => {
    resetSound();
    synth.tones.length = 0;
    synth.noises.length = 0;
    const waves: number[] = [];
    const booms: number[] = [];
    let now = 0;
    const step = (span: number): void => {
      const tonesBefore = synth.tones.length;
      const noisesBefore = synth.noises.length;
      stepAmbient(span);
      now += span;
      // the wave is five low-pass noise layers; the far gun is one tone and two longer noise layers
      const added = synth.noises.slice(noisesBefore);
      if (added.length === 5 && added.every(call => call.dur === 0.9)) waves.push(now);
      if (synth.tones.length > tonesBefore) booms.push(now);
    };
    step(0);
    for (let i = 0; i < 600; i++) step(dt);
    return { waves, booms };
  };

  const first = run();
  // the first wave comes at once, then at the generator's first wave interval from SOUND_AMBIENT.seed
  expect(first.waves[0]).toBe(0);
  const firstGap = createRng(SOUND_AMBIENT.seed).rand(SOUND_AMBIENT.waveEvery.min, SOUND_AMBIENT.waveEvery.max);
  // the clock moves in whole frames, so the wave comes at the first frame at or after the drawn interval
  expect(Math.abs(first.waves[1] - first.waves[0] - firstGap)).toBeLessThanOrEqual(dt);
  for (let i = 1; i < first.waves.length; i++) {
    const gap = first.waves[i] - first.waves[i - 1];
    expect(gap).toBeGreaterThanOrEqual(SOUND_AMBIENT.waveEvery.min - dt);
    expect(gap).toBeLessThanOrEqual(SOUND_AMBIENT.waveEvery.max + dt);
  }
  // the first distant shot is due firstBoom after the sortie starts (again, at the first frame at or after it)
  expect(Math.abs(first.booms[0] - SOUND_AMBIENT.firstBoom)).toBeLessThanOrEqual(dt);
  // resetSound puts the clock and the generator back, so a second run sounds the same
  expect(run()).toEqual(first);
});
