import { yawToward } from '@engine/core/util.ts';
import type { Boss, BossKind, Enemy } from '../../data/types.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { isBossKind } from '../../core/rules.ts';
import { player } from '../../actors/player.ts';
import { enemies } from '../../world/entities.ts';
import { startPractice } from '../../flow/run.ts';
import { update } from '../../flow/update.ts';
import { hurtEnemy } from '../../actors/combat.ts';
const LOOK_FROM = 7.5; // how far from a boss #boss-<kind>-look stands (m)
const LOOK_TURN = 0.65; // how far a boss is turned for #boss-<kind>-look (rad)
const HOIST_VIEW_BACK = 20; // the 'wide' view of HOIST stands this far behind the middle of the room (m)...
const HOIST_VIEW_PITCH = 0.42; // ... looking up at this angle (rad)...
const HOIST_VIEW_SIDE = -3; // ... with the trolley this far off to one side (m)
const HOIST_CLOSE_X = 9; // the 'close' view stands this far to one side of the middle (m)...
const HOIST_CLOSE_Z = 7; // ... this far in front of the girder (m)...
const HOIST_CLOSE_PITCH = 0.55; // ... looking up at this angle (rad)
const HOIST_ALARM_X = 17; // the 'alarm' view stands this far to one side, under a beacon (m)...
const HOIST_ALARM_Z = 4; // ... this far in front of the girder (m)...
const HOIST_ALARM_PITCH = 1.05; // ... looking up at it (rad)
const HOIST_VIEW_NEAR = 9; // the 'drop' and 'pull' views stand this far from the magnet (m)
const HOIST_VIEW_WARN = 0.5; // 'drop' is taken this long before the load falls (s)
const HOIST_VIEW_PULL_PITCH = 0.3; // 'pull' looks up at the magnet at this angle (rad)
const HOIST_VIEW_PULL = 18; // 'pull' is taken this many frames into the pull
const HOIST_VIEW_SWING = 20; // 'swing' is taken this many frames into the swing (the load is beside the player)
const HOIST_VIEW_BARRAGE = 54; // 'barrage' is taken this many frames into it (two loads up, the first shadow dark)
const HOIST_VIEW_BARRAGE_LOADS = 2; // ... with this many loads left to hang
// HOIST's views (for screenshots), once it is in the room: wide (the whole crane from the back of the room), drop (a
// load hanging with its shadow half filled), pull (the magnet pulling), swing (a load swung round the magnet, the band
// on the floor), barrage (two loads hanging from its run past the player). The boss stands still from there.
// #boss-hoist-<view>: in the boss arena; #bld-hoist (?sector=MALL, ?pose=<view>): in a building's boss room
function hoistView(b: Enemy, view: string) {
  if (!b.boss) return;
  const h = b as Boss & {
    st: string;
    cargos: { t: number }[];
    left: number;
    dropT: number;
    goal: { x: number; z: number };
  };
  player.hp = 1e6;
  player.maxHp = 1e6;
  for (let n = 0; n < 150; n++) update(1 / 60);
  player.yaw = 0;
  player.x = b.cx;
  player.z = b.cz + HOIST_VIEW_BACK;
  player.pitch = HOIST_VIEW_PITCH;
  if (view === 'drop' || view === 'alarm' || view === 'pull' || view === 'swing' || view === 'barrage') {
    h.x = b.cx;
    h.z = b.cz;
    player.z = b.cz + HOIST_VIEW_NEAR;
    player.pitch = view === 'pull' ? HOIST_VIEW_PULL_PITCH : 0;
  }
  if (view === 'wide' || view === 'close') {
    h.x = b.cx + HOIST_VIEW_SIDE;
    h.z = b.cz - HOIST_VIEW_SIDE;
    // close: under the girder's one end, looking up at its plates, cab and cable (for the dressing)
    if (view === 'close') {
      player.x = b.cx - HOIST_CLOSE_X;
      player.z = h.z + HOIST_CLOSE_Z;
      player.pitch = HOIST_CLOSE_PITCH;
    }
  } else if (view === 'drop' || view === 'alarm') {
    h.st = 'approach';
    h.timer = 0;
    while (!h.cargos.length || h.cargos[0]!.t > HOIST_VIEW_WARN) update(1 / 60);
    // alarm: the same moment, seen from under the girder's end, where a beacon blinks red
    if (view === 'alarm') {
      player.x = b.cx - HOIST_ALARM_X;
      player.z = b.cz + HOIST_ALARM_Z;
      player.pitch = HOIST_ALARM_PITCH;
    }
  } else if (view === 'swing') {
    // (from the rush, stopped at once, so that the load, its chain and the band are made where the magnet is)
    h.st = 'rush';
    h.timer = 0;
    const warn = Math.ceil(BOSS_META.hoist.tune.swingWarn * 60);
    for (let n = 0; n <= warn + HOIST_VIEW_SWING; n++) update(1 / 60);
  } else if (view === 'barrage') {
    h.st = 'barrage';
    h.left = HOIST_VIEW_BARRAGE_LOADS;
    h.dropT = 0;
    h.goal = { x: b.cx, z: b.cz + HOIST_VIEW_NEAR + BOSS_META.hoist.tune.barrageOver };
    for (let n = 0; n < HOIST_VIEW_BARRAGE; n++) update(1 / 60);
  } else {
    h.st = 'wind';
    b.timer = 0.01;
    for (let n = 0; n < HOIST_VIEW_PULL; n++) update(1 / 60);
  }
  for (let n = 0; n < 2; n++) update(1 / 60);
  b.behave = () => {};
  const name = document.querySelector<HTMLElement>('#banner');
  if (name) name.style.visibility = 'hidden';
}
const SURGEON_VIEW_BACK = 16; // SURGEON's views stand this far from the middle of the room (m)...
const SURGEON_VIEW_SIDE = 7; // ... and this far to one side (m)
const SURGEON_VIEW_STEP = 9; // 'scalpel' and 'clamp' step this far to one side once the line and the ring stop following (m)
const SURGEON_VIEW_PITCH = 0.3; // ... looking up at this angle (rad)
const SURGEON_VIEW_FRAMES = 150; // the views wait this many frames for the arms to appear
const SURGEON_VIEW_SCALPEL = 0.4; // 'scalpel' is taken this long into the sweep (s)
const SURGEON_VIEW_CLAMP = 0.7; // 'clamp' is taken this long into the ring's filling (s)
const SURGEON_VIEW_NEEDLE = 0.2; // 'needle' is taken this long after the fan (s)
// SURGEON's views (for screenshots), once it is in the room: wide (the body and its arms at rest), scalpel (the beam
// crossing the floor), needle (the fan just after it is fired), clamp (the ring half filled, the clamp over it). The
// boss stands still from there. #boss-surgeon-<view>: in the boss arena; #bld-surgeon (?sector=HOSP, ?pose=<view>): in
// a building's boss room
function surgeonView(b: Enemy, view: string) {
  if (!b.boss) return;
  const s = b as Boss & { atk: { t: number; fired: boolean } | null };
  player.hp = 1e6;
  player.maxHp = 1e6;
  for (let n = 0; n < SURGEON_VIEW_FRAMES; n++) update(1 / 60);
  // (to one side, so that the beam and the ring do not pass through the eye)
  player.x = b.cx + SURGEON_VIEW_SIDE;
  player.z = b.cz + SURGEON_VIEW_BACK;
  player.yaw = yawToward(b.cx - player.x, b.cz - player.z);
  player.pitch = SURGEON_VIEW_PITCH;
  const kinds = ['scalpel', 'needle', 'clamp'];
  if (kinds.includes(view)) {
    b.timer = 0;
    b.patIdx = kinds.indexOf(view);
    update(1 / 60);
    // (the line and the ring follow the player until just before they act: then the player steps to one side)
    const K = BOSS_META.surgeon!.tune,
      lock = view === 'scalpel' ? K.scalpelWarn - K.scalpelLock : K.clampTrack;
    if (view !== 'needle') {
      while (s.atk && s.atk.t < lock + 0.05) update(1 / 60);
      player.x += SURGEON_VIEW_STEP;
      player.yaw = yawToward(b.cx - player.x, b.cz - player.z);
    }
    const until = () =>
      !s.atk ||
      (view === 'scalpel' ? s.atk.t > K.scalpelWarn + SURGEON_VIEW_SCALPEL : false) ||
      (view === 'clamp' ? s.atk.t > SURGEON_VIEW_CLAMP : false) ||
      (view === 'needle' ? s.atk.fired : false);
    for (let n = 0; n < SURGEON_VIEW_FRAMES * 2 && !until(); n++) update(1 / 60);
    if (view === 'needle') for (let n = 0; n < SURGEON_VIEW_NEEDLE * 60; n++) update(1 / 60);
  }
  b.behave = () => {};
  const name = document.querySelector<HTMLElement>('#banner');
  if (name) name.style.visibility = 'hidden';
}
// a boss's own views for screenshots: the poses its view knows (#boss-<kind>-<pose>), whether it can stand in a
// building's boss room too (#bld-<kind>, ?pose=<pose>), and how it is shown (run the boss on to that moment and
// stand the player there; the functions above). null: the boss has no view of its own (only #boss-<kind>-look,
// which is the same for every boss). ?pose= takes any name the view knows, so #bld-hoist also takes close and
// alarm; `poses` is only what #boss-<kind>-<pose> answers.
interface BossView {
  poses: readonly string[]; // the poses #boss-<kind>-<pose> answers
  room: boolean; // #bld-<kind> shows it in the building's boss room
  show: (b: Enemy, pose: string) => void;
}
// TITAN's views (for screenshots), standing still: wide (the first stage from in front), back (from behind), bare (the
// armour off), risen (the third stage). #boss-titan-<view>
const TITAN_VIEW_FROM = 20; // how far from it they stand (m)
const TITAN_VIEW_NEAR = 9; // the 'close' view (m)
function titanView(b: Enemy, view: string) {
  if (!b.boss) return;
  const h = b as Boss & { behave: Boss['behave']; revived: boolean; face: number; st: string; timer: number };
  player.hp = 1e6;
  player.maxHp = 1e6;
  for (let n = 0; n < 130; n++) update(1 / 60);
  h.st = 'guns'; // it stands and turns to the player
  h.timer = 1e6;
  if (view === 'bare' || view === 'risen') h.hp = h.maxHp * 0.4;
  for (let n = 0; n < 100; n++) update(1 / 60);
  if (view === 'risen') {
    hurtEnemy(h, h.maxHp, false);
    for (let n = 0; n < 400 && !h.revived; n++) update(1 / 60);
    h.st = 'guns';
    h.timer = 1e6;
  }
  player.x = b.x;
  player.z = b.z + (view === 'close' ? TITAN_VIEW_NEAR : TITAN_VIEW_FROM);
  player.yaw = 0;
  player.pitch = view === 'close' ? 0.6 : 0.2;
  h.face = view === 'back' ? Math.PI : 0;
  h.st = 'guns';
  const look = h.behave;
  h.behave = (e, dt) => {
    look(e, dt);
    h.face = view === 'back' ? Math.PI : 0;
    h.timer = 1e6;
  };
  const name = document.querySelector<HTMLElement>('#banner');
  if (name) name.style.visibility = 'hidden';
}
export const BOSS_VIEWS: Record<BossKind, BossView | null> = {
  watcher: null,
  crusher: null,
  core: null,
  phantom: null,
  trinity: null,
  bastion: null,
  titan: { poses: ['wide', 'close', 'back', 'bare', 'risen'], room: false, show: titanView },
  hoist: { poses: ['wide', 'drop', 'pull', 'swing', 'barrage'], room: true, show: hoistView },
  surgeon: { poses: ['wide', 'scalpel', 'needle', 'clamp'], room: true, show: surgeonView },
};
// dev view: #boss-phantom etc. starts boss practice against that boss
// optional depth: #boss-phantom-3 = DEPTH 3 strength; #boss-phantom-look = up close
export function showBoss(hash: string) {
  setTimeout(() => {
    const [k, d] = hash.slice(6).split('-');
    if (!isBossKind(k)) return;
    // #boss-phantom-look: the boss up close, once it has finished coming in (for screenshots of how it looks)
    if (d === 'look') {
      startPractice(k, 0);
      // (the boss comes a moment after the arena: wait for it, then run its entrance on by hand)
      const wait = setInterval(() => {
        const b = enemies.find(e => e.boss);
        if (!b) return;
        clearInterval(wait);
        player.hp = 1e6;
        player.maxHp = 1e6;
        for (let n = 0; n < 150; n++) update(1 / 60);
        // (a boss of several bodies, Trinity: its first body. They keep turning, so no turn is added)
        const at = (b.boss && b.parts?.[0]?.p) || b.mesh.position;
        player.x = at.x;
        player.z = at.z + LOOK_FROM;
        player.yaw = 0;
        player.pitch = Math.atan2(at.y - 1.6, LOOK_FROM) * 0.6;
        for (let n = 0; n < 2; n++) update(1 / 60);
        // it stands still from here, turned a little to one side so its flank shows too
        if (b.boss) b.behave = () => {};
        b.mesh.rotation.y += LOOK_TURN;
        // (its name, up big across the middle of the screen, would cover it)
        const name = document.querySelector<HTMLElement>('#banner');
        if (name) name.style.visibility = 'hidden';
      }, 200);
      return;
    }
    // #boss-<kind>-<pose>: one of the poses the boss's own view knows (see BOSS_VIEWS); the rest is practice at <depth>
    const view = BOSS_VIEWS[k];
    if (view && d && view.poses.includes(d)) {
      startPractice(k, 0);
      const wait = setInterval(() => {
        const b = enemies.find(e => e.boss);
        if (!b) return;
        clearInterval(wait);
        view.show(b, d);
      }, 200);
      return;
    }
    startPractice(k, d ? Math.max(0, +d - 1) : 0);
  }, 300);
}
