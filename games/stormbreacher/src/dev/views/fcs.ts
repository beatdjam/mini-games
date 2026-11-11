// The three FCS kinds against moving dummies (#view-fcs, SB-060): a mech on the flat field fires at eight dummies
// while the aim assist helps in one of three ways. The URL picks the kind and may override any of its values; the
// numbers it measures are shown at the top left and come back from window.sbFcsReport().
import * as THREE from 'three';
import { addSystem, clamp, el } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { CAMERA_TUNE, DUMMY_TUNE, FCS_TUNE, MECH_TUNE, type FcsKind, type FcsTune } from '../../data/tune.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { fireRay } from '../../logic/fire.ts';
import { newFcs, spreadDir, stepFcs, type Dir3, type FcsStep, type FcsTarget, type Ray3 } from '../../logic/fcs.ts';
import {
  DUMMY_DEPTH,
  DUMMY_HEIGHT,
  DUMMY_WIDTH,
  dummyBox,
  hitDummy,
  spawnDummies,
  stepDummies,
  type Dummy,
} from '../../logic/dummies.ts';
import { stream } from '../../logic/rng.ts';
import { applyPose, cameraPose, followPose } from '../../view/camera.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import type { ShotResult } from '../../view/feel.ts';
import { updateReticle } from '../../view/reticle.ts';
import { buildFlatRange, moveFeelFromParams } from './move.ts';

declare global {
  interface Window {
    sbFcsReport?: () => string;
  }
}

const DEFAULT_FCS: FcsKind = 'soft'; // the type chosen for the game (D-10, 2026-11-09)
const FCS_KINDS: readonly FcsKind[] = ['manual', 'soft', 'hard'];
const FCS_LABELS: Record<FcsKind, string> = { manual: '手動', soft: 'ソフト', hard: 'ハード' };
const FLASH_TIME = 0.15; // how long a hit keeps a dummy red (s)
const DUMMY_COLOR = 0x5c6670; // a dummy's usual color
const DUMMY_HIT_COLOR = 0xc0392b; // a dummy flashes this on a hit

interface DummyView {
  dummy: Dummy;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  flashT: number; // the red flash left (s)
}

interface FcsReport {
  fcs: FcsKind;
  shots: number;
  hits: number;
  hitRate: number; // 0..1
  kills: number;
  killTimeAvg: number; // seconds from the first hit to the down; 0 with no down
  lockTimeAvg: number; // seconds from candidate to lock; 0 with no lock
}

const isFcsKind = (value: string): value is FcsKind => (FCS_KINDS as readonly string[]).includes(value);

// FCS_TUNE[kind] with every URL value of the same name on top; a value that is not a number is ignored.
function tuneFrom(params: URLSearchParams, kind: FcsKind): FcsTune {
  const tune: FcsTune = { ...FCS_TUNE[kind] };
  for (const key of Object.keys(tune) as (keyof FcsTune)[]) {
    const value = params.get(key);
    if (value === null || value.trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) tune[key] = n;
  }
  return tune;
}

function addSwitchBar(current: FcsKind) {
  const bar = document.createElement('div');
  bar.id = 'sbFcsSwitch';
  bar.style.cssText =
    'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);transform:translateX(-50%);' +
    'z-index:6;display:flex;gap:6px;pointer-events:none';
  for (const kind of FCS_KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = FCS_LABELS[kind];
    button.id = `sbFcs-${kind}`;
    const on = kind === current;
    button.style.cssText =
      'pointer-events:auto;min-height:44px;min-width:64px;padding:0 12px;border-radius:22px;font:inherit;' +
      'font-size:14px;border:1px solid rgba(255,207,106,.6);' +
      `background:${on ? 'rgba(255,207,106,.85)' : 'rgba(10,17,25,.8)'};` +
      `color:${on ? '#10161d' : '#ffcf6a'}`;
    button.addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      params.set('fcs', kind);
      location.search = params.toString();
    });
    bar.appendChild(button);
  }
  document.body.appendChild(bar);
}

function addHud(): HTMLDivElement {
  const hud = document.createElement('div');
  hud.id = 'sbFcsHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);
  return hud;
}

export function showFcs(_hash: string) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('fcs');
  const invalid = requested !== null && !isFcsKind(requested);
  const fcsKind: FcsKind = requested !== null && isFcsKind(requested) ? requested : DEFAULT_FCS;
  const tune = tuneFrom(params, fcsKind);
  const { moveTune, feelTune } = moveFeelFromParams(params);

  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  el('#sbApp').hidden = true;

  const range = buildFlatRange(CAMERA_TUNE.fov, { targets: false });
  const mech = range.mech;
  initPlayInput();

  // The dummies and their boxes: one mesh each, so a hit can flash only one.
  const dummies = spawnDummies(stream('dummies'));
  if (params.get('move') === 'still') for (const dummy of dummies) dummy.move = 'still';
  const geometry = new THREE.BoxGeometry(DUMMY_WIDTH, DUMMY_HEIGHT, DUMMY_DEPTH);
  const views: DummyView[] = dummies.map(dummy => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: DUMMY_COLOR }));
    mesh.position.set(dummy.x, dummy.y + DUMMY_HEIGHT / 2, dummy.z);
    scene.add(mesh);
    return { dummy, mesh, flashT: 0 };
  });

  const state = newFcs();
  const fcsRng = stream('fcs');
  let pitch = 0;
  let camPos: THREE.Vector3 | null = null;
  let elapsed = 0;

  // The numbers of the run: reset on every load, so a switch starts from 0.
  let shots = 0;
  let hits = 0;
  let kills = 0;
  let killTimeSum = 0;
  let killCount = 0;
  let lockTimeSum = 0;
  let lockCount = 0;
  let lastCandidate: number | null = null;
  let candidateSince = 0;
  let lastLockId: number | null = null;
  const firstHitAt = new Map<number, number>();

  const round = (value: number): number => Math.round(value * 1000) / 1000;

  function targets(): FcsTarget[] {
    return dummies.map(dummy => ({
      id: dummy.id,
      box: dummyBox(dummy),
      cx: dummy.x,
      cy: dummy.y + DUMMY_HEIGHT / 2,
      cz: dummy.z,
      alive: dummy.deadT === 0,
    }));
  }

  function noteLock(result: FcsStep) {
    if (result.candidateId !== lastCandidate) {
      lastCandidate = result.candidateId;
      candidateSince = elapsed;
    }
    if (result.lockId !== null && lastLockId === null && lastCandidate !== null) {
      lockTimeSum += elapsed - candidateSince;
      lockCount++;
    }
    lastLockId = result.lockId;
  }

  function aimStep(dt: number): FcsStep {
    const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, []);
    const aim: Ray3 = {
      ox: pose.pos.x,
      oy: pose.pos.y,
      oz: pose.pos.z,
      dx: pose.look.x - pose.pos.x,
      dy: pose.look.y - pose.pos.y,
      dz: pose.look.z - pose.pos.z,
    };
    const result = stepFcs(
      state,
      fcsKind,
      tune,
      aim,
      { x: mech.x, y: mech.y + MECH_TUNE.chestHeight, z: mech.z },
      targets(),
      dt,
    );
    noteLock(result);
    return result;
  }

  function flash(id: number) {
    const view = views.find(v => v.dummy.id === id);
    if (!view) return;
    view.flashT = FLASH_TIME;
    view.mesh.material.color.setHex(DUMMY_HIT_COLOR);
  }

  function shoot(shotDir: Dir3): ShotResult {
    const dir = spreadDir(shotDir, tune.spread, fcsRng);
    const chestY = mech.y + MECH_TUNE.chestHeight;
    const alive = targets().filter(t => t.alive);
    const boxes = alive.map(t => t.box);
    const index = fireRay(mech.x, chestY, mech.z, dir.dx, dir.dy, dir.dz, tune.range, boxes);
    const reach =
      index >= 0
        ? Math.hypot(alive[index].cx - mech.x, alive[index].cy - chestY, alive[index].cz - mech.z)
        : tune.range;
    range.tracer(mech.x, chestY, mech.z, dir.dx, dir.dy, dir.dz, reach);
    shots++;
    if (index < 0) return 'miss';
    hits++;
    const id = alive[index].id;
    flash(id);
    const dummy = dummies.find(d => d.id === id);
    if (!dummy) return 'hit';
    if (!firstHitAt.has(id)) firstHitAt.set(id, elapsed);
    if (!hitDummy(dummy, DUMMY_TUNE)) return 'hit';
    kills++;
    const since = firstHitAt.get(id);
    if (since !== undefined) {
      killTimeSum += elapsed - since;
      killCount++;
      firstHitAt.delete(id);
    }
    return 'kill';
  }

  function reportJson(): string {
    const report: FcsReport = {
      fcs: fcsKind,
      shots,
      hits,
      hitRate: shots > 0 ? round(hits / shots) : 0,
      kills,
      killTimeAvg: killCount > 0 ? round(killTimeSum / killCount) : 0,
      lockTimeAvg: lockCount > 0 ? round(lockTimeSum / lockCount) : 0,
    };
    return JSON.stringify(report);
  }

  function hudText(): string {
    const rate = shots > 0 ? (hits / shots) * 100 : 0;
    return (
      `FCS ${FCS_LABELS[fcsKind]}${invalid ? '（無効な値）' : ''}\n` +
      `shots ${shots}  hits ${hits}  ${rate.toFixed(0)}%\n` +
      `kills ${kills}\n` +
      `kill ${killCount > 0 ? (killTimeSum / killCount).toFixed(2) : '--'} s\n` +
      `lock ${lockCount > 0 ? (lockTimeSum / lockCount).toFixed(2) : '--'} s`
    );
  }

  addSwitchBar(fcsKind);
  const hud = addHud();
  window.sbFcsReport = reportJson;

  let frameResult: FcsStep | null = null;

  addSystem({
    name: 'sb-fcs',
    update: dt => {
      elapsed += dt;
      frameResult = null;

      const read = readInput(dt);
      pitch = clamp(pitch + read.pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);

      // A shot uses the FCS step of this frame; on a frame with no shot the step runs after the mech.
      const fire = (): ShotResult => {
        if (!frameResult) frameResult = aimStep(dt);
        return shoot(frameResult.shotDir);
      };
      const step = range.step(read.input, dt, moveTune, feelTune, fire);
      if (!frameResult) frameResult = aimStep(dt);

      stepDummies(dummies, dt, DUMMY_TUNE);
      for (const view of views) {
        view.mesh.visible = view.dummy.deadT === 0;
        view.mesh.position.set(view.dummy.x, view.dummy.y + DUMMY_HEIGHT / 2, view.dummy.z);
        if (view.flashT > 0) {
          view.flashT = Math.max(0, view.flashT - dt);
          if (view.flashT === 0) view.mesh.material.color.setHex(DUMMY_COLOR);
        }
      }

      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, []);
      camPos = camPos ? followPose(camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
      const pos = camPos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos }, step.fov);

      updateReticle(camera, fcsKind, tune, frameResult, targets());
      hud.textContent = hudText();
    },
  });
}
