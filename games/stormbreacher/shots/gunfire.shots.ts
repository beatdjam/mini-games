// Screenshots of the look of a shot (SB-1450): the mech firing over its shoulder, a shot landing on the seawall, and
// pillbox 1 firing back at the mech from 23 m. Each frame is picked by the effects themselves: the shot steps the game
// until the parts it shows are there (gunfireCounts) and throws if they do not come in time. npm run shots. Not a test:
// it is not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the
// pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera, drawStats } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript, type GameModel } from '../src/logic/game.ts';
import { currentGunfireView, drawGunfire, gunfireCounts, type GunfireView } from '../src/view/gunfire.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const SETTLE_FRAMES = 70; // frames the camera is given to follow a moved mech
const DRAW_FRAMES = 2; // frames drawn after the state is set, so the picture is the one the effects were drawn in
const MAX_STEPS = 300; // the most frames a shot waits for its effects (5 s); it throws after that
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

// Where the mech stands (m). +z is the sea; the B line's hedgehog rows run at z 131..143, 82..93 and 11..23, so the strip
// between 93 and 131 is open beach.
const FIRE_AT = { x: 5, z: 126 } as const;
const IMPACT_AT = { x: 0, z: -56 } as const; // the seawall's seaward face runs at z -65, so the wall is 9 m ahead
const ENEMY_MEET = { x: -42, z: 6 } as const; // 23 m from pillbox 1, 23 deg to its right, so the two do not overlap
const ENEMY_TARGET = 'pillbox-1'; // the pillbox that fires at the mech
// The impact's camera: 6 m out from the wall, to the side and a little above, so the sparks and the puff are in front.
const IMPACT_EYE = { side: 4, up: 1, back: 4.5 } as const;

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game(): GameModel {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

function gunfire(): GunfireView {
  const view = currentGunfireView();
  if (!view) throw new Error('the gunfire view has not been built');
  return view;
}

async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await frame();
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

// The main weapon's key (KEY_DEFAULTS), so the shot goes through the same input the player's does.
const fireKey = (type: 'keydown' | 'keyup'): boolean =>
  window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyJ', bubbles: true }));

// Keeps the mech alive and the beach quiet while the hand-run frames pass: no shell is to land in a picture.
function repair(): void {
  const current = game();
  current.armor = MECH_TUNE.armor;
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
  current.battery.on = false;
}

// Holds the game still: the drawn frames add no time (LOOP.maxDt = 0), so only the frames stepped by hand move it.
function hold(): () => void {
  const maxDt = LOOP.maxDt;
  LOOP.maxDt = 0;
  return () => {
    LOOP.maxDt = maxDt;
  };
}

// Steps the game by hand, one frame at a time, until `done` says the effects are there. Throws at the limit, so a shot
// never saves a picture that does not show what it is named for.
function stepUntil(done: () => boolean): void {
  for (let i = 0; i < MAX_STEPS; i++) {
    if (done()) return;
    repair();
    runSystems(1 / 60);
  }
  if (!done()) throw new Error(`the effects did not show in ${MAX_STEPS} frames`);
}

async function picture(name: string): Promise<void> {
  await frames(DRAW_FRAMES);
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// Puts the mech somewhere and lets the camera catch up before the loop is held. The strip it stands in may wake the
// script's own waves (the B line's nests); those and their shots are cleared after the settle, so a picture shows only
// the effect it is named for.
async function place(x: number, z: number, yaw = 0): Promise<void> {
  const g = game();
  g.mech.x = x;
  g.mech.y = 0;
  g.mech.z = z;
  g.mech.yaw = yaw;
  g.bullets.length = 0;
  g.enemies.length = 0;
  repair();
  await frames(SETTLE_FRAMES);
  g.bullets.length = 0;
  g.enemies.length = 0;
  repair();
}

// Where the latest impact's puff is, so the camera can be put by the point the shot really landed on.
function impactPoint(): { x: number; y: number; z: number } {
  const puff = gunfire().smokeSlots.find(slot => slot.live);
  if (!puff) throw new Error('no impact has been made');
  return { x: puff.x, y: puff.y, z: puff.z };
}

// Takes the sortie's own camera away and puts it by hand, then draws the gunfire once more so the bands and the flashes
// turn to the new camera. The game stays held, so nothing moved or aged by the extra frames.
async function pictureFrom(
  eye: { x: number; y: number; z: number },
  at: { x: number; y: number; z: number },
): Promise<void> {
  await frame();
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(at.x, at.y, at.z);
  drawGunfire(gunfire(), game().bullets, 0);
  await frame();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('gunfire', async () => {
  startSortie();
  // the landing covers the screen; pass it over so the shots show the game's own camera on the beach
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  repair();
  await frames(SETTLE_FRAMES);

  if (wanted('gunfire-fire')) {
    await place(FIRE_AT.x, FIRE_AT.z);
    const release = hold();
    try {
      // the shot's own frame: one step fires, spawns the muzzle's flash and draws the bullet's band, no more
      fireKey('keydown');
      runSystems(1 / 60);
      fireKey('keyup');
      stepUntil(() => {
        const counts = gunfireCounts(gunfire());
        return counts.flashes > 0 && counts.tracers > 0;
      });
      console.log(`gunfire-fire: ${drawStats()}`);
      await picture('gunfire-fire');
    } finally {
      release();
    }
  }

  if (wanted('gunfire-impact')) {
    await place(IMPACT_AT.x, IMPACT_AT.z);
    const release = hold();
    try {
      // fire into the seawall and step until its sparks and puff are there, then a few frames more for their spread
      fireKey('keydown');
      stepUntil(() => {
        const counts = gunfireCounts(gunfire());
        return counts.sparks > 0 && counts.smoke > 0;
      });
      fireKey('keyup');
      for (let i = 0; i < 2; i++) {
        repair();
        runSystems(1 / 60);
      }
      const hit = impactPoint();
      await pictureFrom({ x: hit.x + IMPACT_EYE.side, y: hit.y + IMPACT_EYE.up, z: hit.z + IMPACT_EYE.back }, hit);
      await picture('gunfire-impact');
    } finally {
      const play = systems.find(system => system.name === 'sb-play');
      if (play) play.enabled = true;
      release();
    }
  }

  if (wanted('gunfire-enemy')) {
    // the pillbox must stand and see the mech: a broken or facing-away one does not fire
    await place(ENEMY_MEET.x, ENEMY_MEET.z);
    const release = hold();
    try {
      // the frame the pillbox fires, then a few frames more so the shot's band stands clear of the muzzle's flash
      stepUntil(
        () =>
          gunfireCounts(gunfire()).flashes > 0 &&
          game().bullets.some(bullet => 'pillbox' in bullet && bullet.pillbox === ENEMY_TARGET),
      );
      for (let i = 0; i < 4; i++) {
        repair();
        runSystems(1 / 60);
      }
      await picture('gunfire-enemy');
      console.log(`gunfire-enemy: ${drawStats()}`);
    } finally {
      release();
    }
  }
});
