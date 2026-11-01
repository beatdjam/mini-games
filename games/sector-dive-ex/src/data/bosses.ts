import type { BossKind, BossMeta } from './types.ts';
import type { WatcherTune } from '../actors/bosses/watcher.ts';
import type { CrusherTune } from '../actors/bosses/crusher.ts';
import type { CoreTune } from '../actors/bosses/core.ts';
import type { PhantomTune } from '../actors/bosses/phantom.ts';
import type { TrinityTune } from '../actors/bosses/trinity.ts';
import type { BastionTune } from '../actors/bosses/bastion.ts';
import type { HoistTune } from '../actors/bosses/hoist.ts';
import type { SurgeonTune } from '../actors/bosses/surgeon.ts';
import type { TitanTune } from '../actors/bosses/titan.ts';
import { withLang } from '@engine/core/langslots.ts';
// Bosses: names, order, tuning (each boss's behaviour is in src/actors/bosses/)
// pillars: arena has pillars. hp: health at difficulty 1 (times bossDifficulty). y: body height. hitR: hit radius.
// tune: the numbers each boss's attacks use (src/actors/bosses/<name>.ts). *Enr = the value once below half health (enraged).
// Shots: [count, spread, speed] for fans, [count, speed] for rings, waves: [radius, speed, damage multiplier]. Times in seconds.
// each boss's numbers, as its own file reads them (the types are in src/actors/bosses/<name>.ts)
export interface BossTunes {
  watcher: WatcherTune;
  crusher: CrusherTune;
  core: CoreTune;
  phantom: PhantomTune;
  trinity: TrinityTune;
  bastion: BastionTune;
  hoist: HoistTune;
  surgeon: SurgeonTune;
  titan: TitanTune;
}
type BossMetas = { [K in BossKind]: Omit<BossMeta, 'tune'> & { tune: BossTunes[K] } };
// (withLang gives the whole table one type: every tune would be Record<string, any>. Each tune is checked where it
// is written (satisfies), so this puts its kind's type back for the code that reads it)
export const BOSS_META = withLang<BossMeta, 'name' | 'title' | 'short' | 'desc', BossKind>(
  {
    watcher: {
      pillars: true,
      hp: 1300,
      y: 3.2,
      hitR: 2.4,
      tune: {
        drones: [
          [0.75, 2],
          [0.4, 3],
        ],
        patTime: [3.4, 2.8, 3.4],
        enrTime: 0.85,
        ringShots: 3,
        ringGap: 0.75,
        ringN: 18,
        ringNEnr: 22,
        ringSpeed: 8.5,
        fanShots: 3,
        fanShotsEnr: 4,
        fanGap: 0.55,
        fanN: 5,
        fanSpread: 0.14,
        fanSpeed: 16,
        spiralTime: 2.6,
        spiralGap: 0.08,
        spiralArms: 2,
        spiralArmsEnr: 3,
        spiralSpeed: 9,
      } satisfies WatcherTune,
    },
    crusher: {
      pillars: true,
      hp: 1800,
      y: 1.6,
      hitR: 2.4,
      tune: {
        walk: 3.2,
        walkFan: [3, 0.14, 14],
        walkFireFirst: 0.5,
        walkFire: 1.1,
        walkFireEnr: 0.8,
        pick: [0.5, 0.8],
        tele: 0.8,
        teleEnr: 0.5,
        slamTime: 1.0,
        volleyTele: 0.4,
        chargeTime: 3,
        chargeSpeed: 24,
        chargeHitR: 2.5,
        chargeDmg: 2.2,
        chargeKnock: 3,
        chainTele: 0.6,
        stun: 1.6,
        stunMul: 1.5,
        hitWave: [11, 18, 1.4],
        jump: 5,
        slamMove: 7,
        slamWave: [12, 24, 1.5],
        secondDelay: 0.45,
        secondWave: [6, 24, 1.5],
        afterSlam: 1.3,
        volleyN: 6,
        volleyNEnr: 9,
        volleySpeed: 6,
        afterVolley: 1.4,
      } satisfies CrusherTune,
    },
    core: {
      pillars: false,
      hp: 2400,
      y: 2.6,
      hitR: 2.3,
      tune: {
        patTime: [7.5, 3.2, 2.2],
        beams: 2,
        beamsEnr: 3,
        beamWarm: 1.2,
        beamSpin: 0.6,
        beamSpinEnr: 0.85,
        beamSpinWarm: 0.15,
        beamWidth: 0.75,
        beamDmg: 1.3,
        fanGap: 1.4,
        fan: [3, 0.2, 13],
        ringShots: 3,
        ringGap: 0.8,
        ring: [20, 7],
        ringEnr: [14, 11],
        minionCap: 6,
        minions: 2,
        minionsEnr: 3,
        burstN: 5,
        burstSpeed: 5,
      } satisfies CoreTune,
    },
    phantom: {
      pillars: true,
      hp: 1100,
      y: 2.2,
      hitR: 1.6,
      tune: {
        spots: [
          [5, 5],
          [14, 5],
          [5, 10],
          [14, 10],
          [10, 5],
          [5, 14],
          [14, 14],
        ],
        warpRing: [10, 8],
        aim: 1.3,
        aimEnr: 1.0,
        shotSpeed: 62,
        shotDmg: 2.4,
        secondGap: 0.55,
        vanish: 0.45,
        idle: 2.2,
        idleEnr: 1.6,
        droneEvery: 3,
        droneCap: 2,
        drones: 2,
      } satisfies PhantomTune,
    },
    trinity: {
      pillars: false,
      hp: 1700,
      y: 2.2,
      hitR: 1.4,
      tune: {
        firstFire: 1.2,
        firstRing: 5,
        firstRam: 4,
        orbitR: 7.5,
        orbitREnr: 5.5,
        orbitSpeed: 0.55,
        orbitSpeedEnr: 0.8,
        fire: 0.65,
        fireEnr: 0.45,
        fan: [3, 0.16, 14],
        ringEvery: 5.5,
        ringEveryEnr: 4,
        ring: [8, 7.5],
        ramDur: 1.4,
        ramEvery: 3.2,
        ramDmg: 2,
      } satisfies TrinityTune,
    },
    bastion: {
      pillars: false,
      hp: 1500,
      y: 2.4,
      hitR: 2.0,
      tune: {
        turretsFirst: 4,
        turrets: 2,
        turretsEnr: 3,
        turretR: 8,
        open: 12,
        openMul: 1.5,
        ring: [16, 7],
        ringOpen: [24, 9],
        ringEvery: 3,
        ringEveryOpen: 2,
        enrShots: 3,
        enrSpeed: 5,
      } satisfies BastionTune,
    },
    hoist: {
      pillars: false,
      hp: 1500,
      y: 4.8, // the magnet's middle above the floor
      hitR: 1.9,
      tune: {
        chase: 6, // the trolley closes on the player this fast along each axis (m/s)
        approach: 7, // ... and this fast when it goes to drop a load
        approachMax: 1.3, // it stops after this long even if it has not caught up (s)
        stopNear: 1, // ... or when it is this near (m)
        first: 1.6, // the first attack comes this long after the fight starts (s)
        gap: 2.6, // chasing time between attacks (s)
        gapEnr: 1.8,
        shadowR: 2.2, // the ring on the floor, and what the load crushes (m)
        warn: 1.2, // seconds from the load hanging to its fall
        fallG: 35, // the load's fall (m/s^2)
        dropDmg: 2.2, // multiplier on the boss's damage
        rushSpeed: 14, // the trolley closes on the player this fast along each axis to swing a load (m/s; running is 11.1)
        rushMax: 1.2, // ... and gives up after this long (s)
        swingWarn: 0.8, // the load comes down and the band fills this long before it swings (s)
        swingR: 4.5, // the load swings this far from under the magnet (m)
        swingW: 1.1, // half the band's width: it hits where |distance from the magnet - swingR| < swingW (m)
        swingTime: 1.8, // seconds it swings
        swingTurns: 0.8, // turns a second
        swingTurnsEnr: 1.1,
        swingDmg: 1.8, // multiplier on the boss's damage
        pullWind: 0.7, // the magnet lights and hums this long before it pulls (s)
        pullTime: 2, // seconds it pulls
        pullSpeed: 9, // metres per second the player is moved toward the magnet (walking is 7.4, running 11.1)
        barrageN: 3, // loads dropped one after another
        barrageNEnr: 4,
        barrageEvery: 0.35, // seconds from one load hanging to the next (s)
        barrageWarn: 1, // each load's warning (s)
        barrageOver: 4, // the trolley runs this far past the player (m)
        minionCap: 4, // minions alive at once, counting the crawlers a load lets out
        crawlers: 2, // crawlers out of a broken load below half health,
        crawlers1: 1, // ... and above it
        gunEvery: 1.6, // while it trails the player, the guns under the magnet fire a fan this often (s)
        gunEveryEnr: 1.2,
        gunN: 3, // bullets in a fan
        gunNEnr: 5,
        gunSpread: 0.18, // the fan's width (rad)
        gunSpeed: 15, // m/s
      } satisfies HoistTune,
    },
    surgeon: {
      pillars: false,
      hp: 1500,
      y: 7, // the body's middle above the floor
      hitR: 1.8,
      tune: {
        turn: 0.7, // the body turns toward the player this fast (rad/s)
        first: 2.4, // the first attack comes this long after the fight starts (s)
        gap: 2.4, // seconds from the start of one attack to the start of the next
        gapEnr: 1.7,
        armHp: 0.11, // an arm's hit points, as a share of the body's at the same depth
        armR: 3.6, // an arm's end hangs this far from the body's axis at rest (m)...
        armY: 4.4, // ... and this high above the floor
        armEase: 7, // an arm's end closes on the place it is held to at this rate (per second)
        armGrow: 0.4, // a new arm grows to size over this long (s)
        scalpelWarn: 0.9, // seconds of the red line on the floor before the beam
        scalpelSweep: 0.8, // seconds the beam takes to cross its arc
        scalpelArc: 1.22, // the arc it crosses (rad: 70 degrees)
        scalpelLock: 0.3, // the line stops following the player this long before the beam (s)
        scalpelDmg: 1.4, // multiplier on the boss's damage
        scalpelW: 0.6, // the beam hurts what is within this of its line (m)
        scalpelReach: 5, // the line runs this far past the player (m)...
        scalpelMin: 14, // ... but at least this long
        needleN: 5, // needles in a fan
        needleNEnr: 7,
        needleStep: 0.09, // between two needles (rad)
        needleSpeed: 22, // m/s
        needleSize: 0.6, // a thin bullet
        needleWind: 0.5, // the arm takes aim this long before it fires (s)
        clampR: 2, // the ring on the floor, and what the clamp slams (m)
        clampWarn: 1.0, // seconds from the ring appearing to the slam
        clampTrack: 0.4, // the ring follows the player for this long, then stays (s)
        clampDmg: 2, // multiplier on the boss's damage
        clampHold: 0.4, // the clamp stays down this long (s)
        ringN: 14, // bullets in the ring the body fires when it has no arm
        ringSpeed: 8,
        medics: 2, // repair drones called in the second phase
        minionCap: 4, // minions alive at once, not counting the arms
        wreckG: 35, // what falls when it is down falls at this (m/s^2)
      } satisfies SurgeonTune,
    },
    // the numbers are a first try, to be settled by playing it and by the sim
    titan: {
      pillars: false,
      hp: 3000,
      y: 5.5, // the body's middle above the floor (world/models/bosses/titan.ts TITAN_MID)
      hitR: 3.4,
      tune: {
        bodyR: 2.2, // what it walks with (m)
        walk: [3, 5.5, 2.2], // by stage (m/s; walking is 7.4)
        turn: [0.9, 1.6, 1.2], // by stage: slow enough in the first to get round it (rad/s)
        gap: [2.4, 1.8, 1.2], // seconds of walking between two attacks, by stage
        armourMul: 0.25, // first stage: what a hit from in front does
        backMul: 1.5, // ... and from behind, on the reactor
        backCos: -0.2, // the player is behind it below this (the cosine of the angle from where it faces)
        stompTime: 1.1, // seconds from lifting a foot to the stomp
        stompLift: 1.6, // how far it rises (m)
        stompWave: [14, 24, 1.6],
        gunsTime: 0.7, // it takes aim this long
        gunsFan: [5, 0.5, 16],
        gunsHoming: 3, // homing rounds with the fan
        gunsHomingSpeed: 9,
        walkFire: 1.6, // while it walks, a fan this often
        walkFan: [3, 0.25, 15],
        grabWind: 0.8, // the arms go back this long before it lunges
        lungeTime: 0.5, // seconds it lunges
        lungeSpeed: 20, // m/s (running is 11.1)
        grabR: 5.2, // it catches the player this close (m)
        grabDmg: 1.2, // multiplier on the boss's damage
        holdTime: 0.8, // seconds it holds the player
        holdAt: 4.2, // its hands are this far in front of it (m)
        holdEase: 10, // the player is drawn to them at this rate (per second)
        throwDist: 8, // how far it throws (m)
        throwDmg: 1.5, // multiplier on the boss's damage
        fallTime: 3, // seconds it lies still at no health
        riseTime: 1.6, // seconds it takes to get up
        reviveHp: 0.25, // the share of its health the third stage has
        chainN: 7, // blasts in a chain
        chainEvery: 0.28, // seconds between them
        chainStep: 3.2, // each is this far on from the last, toward the player (m)
        chainWave: [9, 4.5, 1.3],
        quakeTime: 0.9, // seconds from lifting a foot to the quake
        quakeWave: [16, 30, 1.6],
        quakeSecond: 0.6, // the second wave comes this long after the first (s)
        quakeRing: [16, 7],
      } satisfies TitanTune,
    },
  },
  { name: '', title: '', short: '', desc: '' },
) as BossMetas;
// the bosses in the order BOSS_META lists them (the base's practice list, the dev views). (Object.keys gives strings:
// they are the keys of a Record<BossKind, ...>)
export const BOSS_ORDER = Object.keys(BOSS_META) as BossKind[];
// bosses: health at the D1 boss (x1.33 base) times hpMul, growing by `growth` per depth after that
// (sliding down to `lateGrowth` across GROWTH_SLIDE in src/data/progress.ts)
export const BOSS_TUNE = {
  hpMul: 1.3,
  growth: 1.85,
  lateGrowth: 1.25, // as DEPTH_HP_LATE (1.24, then 1.27 from 2026-10-18; the same as the rooms' from 2026-10-23: a dive
  // stuck at a milestone was nearly always stopped by its boss)
  introTime: 2.0, // seconds a boss takes to appear (invulnerable, name shown)
  phaseTime: 1.2, // seconds of invulnerability when it drops below half health
  // the shares of its own health at which a boss changes phase, in order: below the first is the second phase
  // (today one boundary: the second phase below half)
  phases: [0.5],
  patternCount: 3, // attack patterns a boss with a pat / pt clock cycles through (nextPattern's default)
  // bits a boss is worth before the bossDifficulty multiplier: it drops bitsKept of them and the rest come from
  // its depth's enemies (actors/combat.ts killBits)
  bits: 45,
  bitsKept: 0.4,
};
