// Screenshots of the blasts and the warned shells on a raised face (SB-1700): the seawall's top, where the battery's
// secondary guns reach. A ring or a blast drawn at the ground's height would sit inside the wall, 6 m under the mech's
// feet. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../src/app/boot.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { BARRAGES } from '../src/data/hazards.ts';
import { step, sendToScript, type GameInput } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SEAWALL_TOP = { x: 35, z: -70, y: 6 }; // the mech's stand on the seawall, as #view-allies' button puts it (m)
const BATTERY = BARRAGES.battery; // the barrage whose warned shell this is
const IDLE: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('heights', async () => {
  startSortie();
  const current = game();
  // the landing cutscene is put up by the first step; take that step and pass the cutscene over, so the sortie's camera
  // follows the mech on the seawall
  step(current, IDLE, 1 / 60);
  sendToScript(current, { kind: 'skip' });
  current.mech.x = SEAWALL_TOP.x;
  current.mech.z = SEAWALL_TOP.z;
  current.mech.y = SEAWALL_TOP.y;
  current.mech.grounded = true;
  current.mech.yaw = 0;
  // a shell of the battery's kind, warned of on the mech's own place, so the ring's height is what the picture shows
  current.shells.push({
    x: SEAWALL_TOP.x,
    z: SEAWALL_TOP.z,
    radius: BATTERY.radius,
    warn: BATTERY.warn,
    left: BATTERY.warn,
    damage: BATTERY.damage,
  });
  if (wanted('heights-warn')) await picture('heights-warn');

  if (wanted('heights-land')) {
    // the shell counts down; when it lands the game reports it and the view draws the blast at the same place
    while (current.shells.length > 0) await frame();
    await picture('heights-land');
  }
});
