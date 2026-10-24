import type { BossKind, BossMeta } from './types.ts';
import { withLang } from '@engine/core/langslots.ts';
// Bosses: names, order, tuning (each boss's behaviour is in src/actors/bosses/)
// pillars: arena has pillars. hp: health at difficulty 1 (times bossDifficulty). y: body height. hitR: hit radius.
// tune: the numbers each boss's attacks use (src/actors/bosses/<name>.ts). *Enr = the value once below half health (enraged).
// Shots: [count, spread, speed] for fans, [count, speed] for rings, waves: [radius, speed, damage multiplier]. Times in seconds.
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
        pullWind: 0.7, // the magnet lights and hums this long before it pulls (s)
        pullTime: 2, // seconds it pulls
        pullSpeed: 9, // metres per second the player is moved toward the magnet (walking is 7.4, running 11.1)
        minionCap: 4, // minions alive at once, counting the crawlers a load lets out
        crawlers: 2, // crawlers out of a broken load below half health,
        crawlers1: 1, // ... and above it
        gunEvery: 1.6, // while it trails the player, the guns under the magnet fire a fan this often (s)
        gunEveryEnr: 1.2,
        gunN: 3, // bullets in a fan
        gunNEnr: 5,
        gunSpread: 0.18, // the fan's width (rad)
        gunSpeed: 15, // m/s
      },
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
      },
    },
  },
  { name: '', title: '', short: '', desc: '' },
);
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
};
