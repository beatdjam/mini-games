// The look of a shot (#view-gunfire, SB-1450): a mech on the beach with the camera over its right shoulder, where the
// muzzle's flash, the tracer bands and the impacts' sparks and smoke can be set off with buttons. The knobs are the
// shared tuning panel (dev/tunePanel.ts), which writes straight into data/gunfire.ts and copies the changed values in the
// table's shape; nothing is saved.
import { addSystem } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { GUNFIRE_TUNE } from '../../data/gunfire.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../../data/mech.ts';
import { M1 } from '../../data/missions/m1.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../data/tune.ts';
import { WEAPONS, type WeaponId } from '../../data/weapons.ts';
import { isEnemyBullet, type Bullet } from '../../logic/game.ts';
import { buildGunfireView, drawGunfire, gunfireCounts, spawnImpact, spawnMuzzleFlash } from '../../view/gunfire.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual } from '../../view/mechModel.ts';
import { MAP_FOG } from '../../view/world.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { buildMapScene } from './mapView.ts';

const MECH_AT = { x: 0, z: 140 } as const; // the mech faces -z, toward the first line of hedgehogs
const CAM_AT = { x: 1.8, y: 3.4, z: 5.4 } as const; // the camera's offset from the mech: over the right shoulder
const LOOK_AHEAD = 30; // how far in front of the mech the camera looks (m)
const ENEMY_AT = { x: -8, y: 2.2, z: -45 } as const; // where the enemy's shot comes from, from the mech
const HEDGEHOG_AT = { x: 0, y: 1.4, z: 131 } as const; // a hedgehog of the first line, for the metal impact
const GROUND_AHEAD = 14; // how far in front of the mech the ground impact goes (m)
const TRACER_GAP = 7; // how far apart the shots of a burst are drawn (m)
const TRACER_COUNT = 3; // the shots one press of "撃つ" puts in flight
const SHOT_RANGE = 60; // how far a dev shot flies (m)
const OTHER_SPEED = 150; // the battery's and the pillbox's shots' speed; this view makes neither

// How fast a dev shot flies: the weapon's own speed, or the enemy's.
function shotSpeed(bullet: Bullet): number {
  if ('weapon' in bullet) return WEAPONS[bullet.weapon].speed;
  if (isEnemyBullet(bullet)) return ENEMIES[bullet.enemy].bulletSpeed;
  return OTHER_SPEED;
}

// The values the panel turns, by dotted path into the table.
const GUNFIRE_RANGES: Record<string, TuneRange> = {
  'tracer.length': { min: 1, max: 10, step: 0.1 },
  'tracer.width': { min: 0.02, max: 0.4, step: 0.01 },
  'tracer.tail': { min: 0, max: 1, step: 0.01 },
  'flash.autocannon.size': { min: 0.1, max: 2, step: 0.05 },
  'flash.heavyGun.size': { min: 0.1, max: 3, step: 0.05 },
  'flash.enemy.size': { min: 0.1, max: 3, step: 0.05 },
  'impact.surfaceSparks': { min: 0, max: 20, step: 1 },
  'impact.metalSparks': { min: 0, max: 30, step: 1 },
  'impact.sparkSize': { min: 0.01, max: 0.3, step: 0.005 },
  'impact.sparkLife': { min: 0.05, max: 1, step: 0.01 },
  'impact.smokeSize': { min: 0.1, max: 1.5, step: 0.05 },
  'impact.smokeLife': { min: 0.1, max: 2, step: 0.05 },
};
const GUNFIRE_LABELS: Record<string, string> = {
  'tracer.length': '曳光の長さ（m）',
  'tracer.width': '曳光の太さ（m）',
  'tracer.tail': '尾の明るさ（頭=1）',
  'flash.autocannon.size': '機関砲の炎（m）',
  'flash.heavyGun.size': '重い砲の炎（m）',
  'flash.enemy.size': '敵の炎（m）',
  'impact.surfaceSparks': '地面の火花（個）',
  'impact.metalSparks': '金属の火花（個）',
  'impact.sparkSize': '火花の大きさ（m）',
  'impact.sparkLife': '火花の寿命（s）',
  'impact.smokeSize': '煙の大きさ（m）',
  'impact.smokeLife': '煙の寿命（s）',
};

const BUTTON_STYLE =
  'height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);color:inherit;font:inherit';

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.style.cssText = `${BUTTON_STYLE};flex:1;min-width:0`;
  element.addEventListener('click', onClick);
  return element;
}

export function showGunfire(_hash: string) {
  const { built } = buildMapScene(M1B_HAND);
  applyLookTo(lookOf(M1.id), built.group);
  const mech = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  mech.position.set(MECH_AT.x, 0, MECH_AT.z);
  scene.add(mech);
  const view = buildGunfireView();
  // the shots the buttons put in flight; the view reads them as it reads the game's own bullets
  let bullets: Bullet[] = [];

  camera.position.set(MECH_AT.x + CAM_AT.x, CAM_AT.y, MECH_AT.z + CAM_AT.z);
  camera.lookAt(MECH_AT.x, MECH_TUNE.chestHeight, MECH_AT.z - LOOK_AHEAD);
  camera.fov = CAMERA_TUNE.fov;
  camera.updateProjectionMatrix();

  const muzzle = () => ({
    x: MECH_AT.x + MECH_TUNE.muzzleSide,
    y: MECH_TUNE.chestHeight,
    z: MECH_AT.z - MECH_TUNE.muzzleForward,
  });

  const fire = (weapon: WeaponId) => {
    const at = muzzle();
    spawnMuzzleFlash(view, weapon, at.x, at.y, at.z);
    for (let i = 0; i < TRACER_COUNT; i++) {
      bullets.push({
        weapon,
        x: at.x,
        y: at.y,
        z: at.z - i * TRACER_GAP,
        dx: 0,
        dy: 0,
        dz: -1,
        left: SHOT_RANGE,
      });
    }
  };

  // The enemy's shot starts at its muzzle and flies at the mech's chest, so the view lights the muzzle the first frame
  // it sees the bullet, as it does for the game's own enemies.
  const enemyFire = () => {
    const from = { x: MECH_AT.x + ENEMY_AT.x, y: ENEMY_AT.y, z: MECH_AT.z + ENEMY_AT.z };
    const to = { x: MECH_AT.x, y: MECH_TUNE.chestHeight, z: MECH_AT.z };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    bullets.push({
      enemy: 'grunt',
      x: from.x,
      y: from.y,
      z: from.z,
      dx: dx / length,
      dy: dy / length,
      dz: dz / length,
      left: SHOT_RANGE,
    });
  };

  const impactAtHedgehog = () => spawnImpact(view, HEDGEHOG_AT.x, HEDGEHOG_AT.y, HEDGEHOG_AT.z, true);
  const impactAtGround = () => spawnImpact(view, MECH_AT.x, 0.3, MECH_AT.z - GROUND_AHEAD, false);

  const hud = document.createElement('div');
  hud.id = 'sbGunfireHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  row.append(
    button('撃つ（機関砲）', () => fire('autocannon')),
    button('撃つ（重い砲）', () => fire('heavyGun')),
  );
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  row2.append(button('当てる（金属）', impactAtHedgehog), button('当てる（地面）', impactAtGround));
  const row3 = document.createElement('div');
  row3.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  row3.append(button('敵の射撃', enemyFire));
  const note = document.createElement('div');
  note.style.cssText = 'margin:6px 0;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = '撃つと曳光と銃口炎が出る。当てると火花と煙。\n保存はしない。';
  extra.append(row, row2, row3, note);

  createTunePanel({
    title: '銃撃 #view-gunfire',
    extra,
    groups: [
      {
        name: 'GUNFIRE_TUNE',
        table: GUNFIRE_TUNE,
        ranges: GUNFIRE_RANGES,
        labels: GUNFIRE_LABELS,
      },
    ],
  });

  window.sbGunfireReport = () => {
    const counts = gunfireCounts(view);
    return JSON.stringify({
      bullets: bullets.length,
      ...counts,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
  };

  addSystem({
    name: 'sb-gunfire',
    update: dt => {
      // the shots fly straight ahead and leave when their range runs out; the enemy's leaves past the camera
      for (const bullet of bullets) {
        const speed = shotSpeed(bullet);
        bullet.x += bullet.dx * speed * dt;
        bullet.y += bullet.dy * speed * dt;
        bullet.z += bullet.dz * speed * dt;
        bullet.left -= speed * dt;
      }
      bullets = bullets.filter(bullet => bullet.left > 0 && bullet.z < MECH_AT.z + 10);
      drawGunfire(view, bullets, dt);
      cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
      const counts = gunfireCounts(view);
      hud.textContent =
        `弾 ${bullets.length} 曳光 ${counts.tracers} 炎 ${counts.flashes} 火花 ${counts.sparks} 煙 ${counts.smoke}\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}

declare global {
  interface Window {
    sbGunfireReport?: () => string;
  }
}
