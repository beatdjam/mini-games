// The sortie's sound: turns a frame's events (and the hostile bullets that appeared this frame) into the table's sounds,
// then plays them with the engine's synth. It only reads the game; the state in logic/ never knows a sound exists.
import { audioNow, noiseBurst, sweepTone } from '@engine/audio/index.ts';
import { createRng, type Rng } from '@engine/core/index.ts';
import { SOUND_AMBIENT, SOUND_DISTANCE, SOUND_FRAME_LIMIT, SOUND_LAYERS, type SoundName } from '../data/sounds.ts';
import { isHostileBullet, type Bullet, type GameEvent, type GameModel } from '../logic/game.ts';

// A place on the ground the sound comes from.
export interface SoundPoint {
  x: number;
  z: number;
}

// The target boxes the plan needs: a destroyed target's sound comes from its middle.
export interface SoundTarget {
  id: string;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// What one frame says to the sound layer. `hostile` is the hostile bullets that were not in the last frame.
export interface SoundInput {
  events: readonly GameEvent[];
  mech: SoundPoint;
  targets: readonly SoundTarget[];
  hostile: readonly SoundPoint[];
}

// One sound to play, with the distance's effect already worked into gain and pitch.
export interface SoundCue {
  name: SoundName;
  gain: number;
  pitch: number;
}

// How distance changes a sound: nearer than `near` is full and unmuffled, `far` and beyond is the quietest and lowest.
export function soundMix(distance: number): { gain: number; pitch: number } {
  const t = Math.min(1, Math.max(0, (distance - SOUND_DISTANCE.near) / (SOUND_DISTANCE.far - SOUND_DISTANCE.near)));
  return {
    gain: 1 + (SOUND_DISTANCE.minGain - 1) * t,
    pitch: 1 + (SOUND_DISTANCE.farPitch - 1) * t,
  };
}

const distanceOf = (a: SoundPoint, b: SoundPoint): number => Math.hypot(a.x - b.x, a.z - b.z);
const centreOf = (target: SoundTarget): SoundPoint => ({
  x: (target.box.minX + target.box.maxX) / 2,
  z: (target.box.minZ + target.box.maxZ) / 2,
});

// The sounds a frame asks for, in the order the events came, each kind cut to SOUND_FRAME_LIMIT. Pure: it reads the
// input only, so the unit tests can count what a sequence of events plays without starting audio.
export function planSounds(input: SoundInput): SoundCue[] {
  const asked: { name: SoundName; at: SoundPoint }[] = [];
  const ask = (name: SoundName, at: SoundPoint): void => {
    asked.push({ name, at });
  };
  for (const event of input.events) {
    switch (event.kind) {
      case 'shot':
        ask(event.weapon === 'heavyGun' ? 'heavyGun' : 'autocannon', event);
        break;
      case 'hit':
        // A hit on the mech is the metal sound here as well as in `damaged`: the frame's one sound survives the limit,
        // and the hit is reported even during a cutscene, when `damaged` is not.
        if (event.mech) ask('mechHit', input.mech);
        else if (event.target !== null || event.enemy !== null) ask('impactArmor', event);
        else ask('impactDirt', event);
        break;
      case 'damaged':
        ask('mechHit', input.mech);
        break;
      case 'destroyed': {
        const target = input.targets.find(candidate => candidate.id === event.id);
        ask('explosionLarge', target ? centreOf(target) : input.mech);
        break;
      }
      case 'enemyDown':
      case 'propDestroyed':
      case 'allyDown':
        ask('explosionSmall', event);
        break;
      case 'mineBlast':
        ask('explosionLarge', event);
        break;
      case 'planted':
        ask('charge', event);
        break;
      case 'blast':
        ask('explosionLarge', event);
        break;
      case 'shellWarn':
        ask('shellWarn', event);
        break;
      case 'shellLand':
        ask('shellLand', event);
        break;
      case 'downed':
        ask('downed', input.mech);
        break;
      case 'script':
        if (event.event.kind === 'radio') ask('radio', input.mech);
        break;
      default:
        break;
    }
  }
  for (const shot of input.hostile) ask('enemyGun', shot);

  const played: Record<string, number> = {};
  const cues: SoundCue[] = [];
  for (const { name, at } of asked) {
    const count = (played[name] ?? 0) + 1;
    played[name] = count;
    if (count > SOUND_FRAME_LIMIT[name]) continue;
    cues.push({ name, ...soundMix(distanceOf(at, input.mech)) });
  }
  return cues;
}

// Plays one sound from the table, with the distance's gain on every layer's volume and its pitch on every frequency.
export function playSound(cue: SoundCue): void {
  const layers = SOUND_LAYERS[cue.name];
  if (!layers) return;
  const now = audioNow();
  for (const layer of layers) {
    const at = now + (layer.at ?? 0);
    if (layer.kind === 'tone') {
      sweepTone(at, layer.type, layer.f0 * cue.pitch, layer.f1 * cue.pitch, layer.dur, layer.vol * cue.gain, layer.att);
    } else {
      noiseBurst(at, layer.dur, layer.vol * cue.gain, layer.type, layer.f0 * cue.pitch, layer.f1 * cue.pitch, layer.q);
    }
  }
}

// The ambience's clock and the next time a wave or a distant shot is due (s since the sortie began).
let ambientTime = 0;
let nextWave = 0;
let nextBoom = 0;
// The hostile bullets already heard. A fresh shot is a new object, so a hit that removes an old one cannot hide a new
// one the way a count would.
let heardHostile = new WeakSet<Bullet>();
// The ambience draws from its own fixed-seed generator: it must not touch the game's stream, and a fixed seed keeps a
// sortie's beach the same every run.
let ambientRng: Rng = createRng(SOUND_AMBIENT.seed);

const randomBetween = (range: { min: number; max: number }): number => ambientRng.rand(range.min, range.max);

// Puts the ambience back to the start of a sortie and forgets the bullets of the last one.
export function resetSound(): void {
  ambientTime = 0;
  nextWave = 0;
  nextBoom = SOUND_AMBIENT.firstBoom;
  ambientRng = createRng(SOUND_AMBIENT.seed);
  heardHostile = new WeakSet();
}

// The beach while the sortie runs. It is driven from update, so a pause, the result and the title stop it by not calling
// this; nothing is scheduled far ahead that would sound after the screen has gone. Exported for the unit test.
export function stepAmbient(dt: number): void {
  ambientTime += dt;
  if (ambientTime >= nextWave) {
    playSound({ name: 'wave', gain: SOUND_AMBIENT.waveGain, pitch: SOUND_AMBIENT.wavePitch });
    nextWave = ambientTime + randomBetween(SOUND_AMBIENT.waveEvery);
  }
  if (ambientTime >= nextBoom) {
    const mix = soundMix(randomBetween(SOUND_AMBIENT.boomDistance));
    playSound({ name: 'distantBoom', gain: mix.gain * SOUND_AMBIENT.boomGain, pitch: mix.pitch });
    nextBoom = ambientTime + randomBetween(SOUND_AMBIENT.boomEvery);
  }
}

// One frame of the sortie's sound: the frame's events, the enemy shots that appeared, and the ambience.
export function soundFrame(game: GameModel, dt: number): void {
  const hostile: SoundPoint[] = [];
  for (const bullet of game.bullets) {
    if (!isHostileBullet(bullet) || heardHostile.has(bullet)) continue;
    heardHostile.add(bullet);
    hostile.push({ x: bullet.x, z: bullet.z });
  }
  for (const cue of planSounds({ events: game.events, mech: game.mech, targets: game.targets, hostile })) {
    playSound(cue);
  }
  stepAmbient(dt);
}
