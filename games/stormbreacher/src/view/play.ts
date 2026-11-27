// The sortie as the screen draws it: the map on M1's B line, the mech, its shots, the dust and the camera's feel. The
// view reads GameModel and never writes it; logic/game.ts owns the mech, the targets and the frame's events.
import * as THREE from 'three';
import { clamp, distXZ } from '@engine/core/index.ts';
import { burst, camera, cullChunks, scene } from '@engine/render/index.ts';
import { BLAST_LIFT, boomShakeAt, landBlastHeight, type BoomKind } from '../data/boom.ts';
import { COVER_TUNE } from '../data/allies.ts';
import {
  MELEE_SPARK_COLOR,
  PILLBOX_DEFLECT_COLOR,
  PILLBOX_SMOKE_COLOR,
  PILLBOX_WARN_COLOR,
  SHELL_LAND_COLOR,
} from '../data/colors.ts';
import { CUTSCENES } from '../data/cutscenes.ts';
import { ENEMIES } from '../data/enemies.ts';
import { MELEE_TUNE } from '../data/melee.ts';
import { PILLBOXES_FLAG } from '../data/front.ts';
import { YARD_TUNE } from '../data/fortress.ts';
import { lookOf } from '../data/looks.ts';
import { M1 } from '../data/missions/m1.ts';
import { PAYOFFS } from '../data/payoff.ts';
import { PILLBOX_TUNE } from '../data/pillbox.ts';
import { FADE_TUNE, FEEL_TUNE, FOV_TUNE, HUD_RING_TUNE, MECH_TUNE, QUARTER_TUNE } from '../data/tune.ts';
import type { QuarterTune } from '../data/tuneTypes.ts';
import { WARDEN_TUNE } from '../data/warden.ts';
import type { WeaponId } from '../data/weapons.ts';
import { blastTarget } from '../logic/blasts.ts';
import { blastFaceHeight, type GameModel } from '../logic/game.ts';
import { cutsceneElapsed, cutsceneMech, cutscenePose } from '../logic/cutscene.ts';
import type { Ray3 } from '../logic/fcs.ts';
import { pillboxMuzzle } from '../logic/pillbox.ts';
import { stepZoom, wantsWide, zoomedTune } from '../logic/quarterZoom.ts';
import { hudModel } from '../logic/hud.ts';
import { stream } from '../logic/rng.ts';
import { sectorHold } from '../logic/sectors.ts';
import type { MechEvent } from '../logic/mech.ts';
import { buildAllyView, drawAllies, type AllyView } from './allies.ts';
import { burnAtmosphere } from './atmosphere.ts';
import { buildBattle, type Battle } from './battle/index.ts';
import { buildBlastView, drawBlasts, type BlastView } from './blasts.ts';
import { screenRect } from './camera.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from './enemies.ts';
import { fadeStep } from './fade.ts';
import { drawHazards, buildHazardView, shellBurst, type HazardView } from './hazards.ts';
import { buildBooms, drawBooms, spawnBoom } from './boom.ts';
import { feelBoom, feelDamage, feelEvents, feelMelee, feelStep, newFeel, spawnDust, type FeelState } from './feel.ts';
import { buildCutsceneView, drawCutscene, type CutsceneView } from './cutscene.ts';
import { buildGunfireView, drawGunfire, spawnImpact, spawnMuzzleFlash, type GunfireView } from './gunfire.ts';
import { buildSeaFire, drawSeaFire, type SeaFireView } from './seaFire.ts';
import { buildPlayHud, drawHud, type PlayHud } from './hud.ts';
import { hitGlow } from './hudRing.ts';
import { buildHurtView, hurtBlast, hurtDamage, hurtStep, type HurtView } from './hurt.ts';
import { applyLookTo } from './look.ts';
import { drawMechMotion, drawMechWalk } from './mechDrive.ts';
import { mechSeeThrough } from './mechFade.ts';
import { buildProtoMech, protoMuzzle, setProtoOpacity } from './mechProtoModel.ts';
import { addProtoStage, stageFlag, type ProtoStage } from './protoStage.ts';
import {
  followQuarter,
  groundPoint,
  quarterPose,
  quarterPoseFromCutscene,
  quarterTuneFrom,
  type QuarterPose,
} from './quarterCamera.ts';
import { buildWorld, MAP_FOG, syncWorld, type World } from './world.ts';

const fadeChest = new THREE.Vector3(); // the mech's chest, the far end of the line a low prop fades on
const HIT_DUST = 3; // the dust's particle count before FEEL_TUNE.dust, per hit
const DEFLECT_SPARKS = 6; // the sparks a shot off a pillbox's front throws
const DEFLECT_SPEED = 5; // how fast a spark flies out (m/s)
const DEFLECT_LIFE = 0.18; // how long a spark lives (s)
const DEFLECT_GRAVITY = -4; // how fast a spark falls (m/s^2)
const LAND_DUST = 10; // the dust's particle count before FEEL_TUNE.dust, per landing
const BOOST_DUST = 6; // the same, per boost start
const BLAST_DUST = 14; // the same, per ally falling to a mortar shell
const PLANT_DUST = 4; // the same, when a charge is set on a blast point
const COVER_SPARKS = 5; // the sparks a support-fire tracer throws where it lands on a nest (SB-2024)
const COVER_SPARK_SPEED = 4; // how fast a spark flies out (m/s)
const COVER_SPARK_LIFE = 0.2; // how long a spark lives (s)
const COVER_SPARK_GRAVITY = -5; // how fast a spark falls (m/s^2)
const COVER_DUST = 4; // the dust's particle count before FEEL_TUNE.dust, per landing
const SUPPORT_TRACER_HEIGHT = 1.2; // the height an infantry tracer leaves from over the ground (m), about a soldier's chest
const MAX_COVER_HITS = 32; // the landings waiting for their tracer to arrive; the rest are dropped
const MAX_NEST_SMOKE = 12; // the nests' smoke the mesh can draw at once
const MAX_PILLBOX_WARNS = 8; // the warning lights the mesh can draw at once; the hand map has 3 pillboxes, so it is not reached
const PILLBOX_WARN_SIZE = 0.6; // the light's size when the warning starts (m)
const PILLBOX_WARN_SHRINK = 0.6; // how small it gets as the warning ends, as a share of its start size
const PILLBOX_SMOKE_SIZE = 1.3; // the smoke at a suppressed muzzle's size (m)
const PILLBOX_SMOKE_LIFT = 0.5; // how far above the muzzle the smoke floats (m)
const MAX_WARDEN_BANDS = 4; // the charge bands the mesh can draw at once; the game has one warden
const WARDEN_BAND_LIFT = 0.07; // how far above the ground the band sits, so it does not fight with it (m)
const WARDEN_SMOKE_EVERY = 0.7; // s between the smoke puffs of a warden that is falling

// The warning lights and the suppression smoke, one instanced mesh each for all of them.
export interface PillboxWarnView {
  mesh: THREE.InstancedMesh;
  smoke: THREE.InstancedMesh;
  nestSmoke: THREE.InstancedMesh; // the smoke over the machine-gun nests the allies' fire holds quiet (SB-2024)
}

// The red bands ahead of a warden that is about to charge, one instanced mesh.
export interface WardenChargeView {
  mesh: THREE.InstancedMesh;
}

export interface PlayView {
  world: World;
  model: THREE.Group; // the mech (the prototype of data/mechProto.ts, bones and skinned meshes)
  stage: ProtoStage | null; // the prototype's sun, shadow and surroundings' light; only with ?shadow=1 or ?env=1
  mechFaded: boolean; // whether the mech is drawn see-through, for the camera is near
  feel: FeelState;
  // the overview camera's values, its place and look last frame (before the feel's shake), and the vertical field of
  // view the last frame was drawn with (the feel's boost included), which the cursor's point uses
  quarter: { tune: QuarterTune; pose: QuarterPose | null; fov: number; zoom: number };
  aim: Ray3 | undefined; // the line through the middle of the screen; undefined here: the main body and the arena aim with aimAt (ticket 2115)
  gunfire: GunfireView; // the muzzle flashes, the tracers in flight and the impacts' sparks and smoke
  enemies: EnemyView; // the enemies' instanced boxes
  wardenCharge: WardenChargeView; // the red band ahead of a warden about to charge
  wardenSmoke: Map<string, number>; // s to the next smoke puff of each warden that is falling
  coverHits: { t: number; x: number; y: number; z: number }[]; // the support fire's landings still to come: seconds until the tracer arrives, and where (SB-2024)
  pillboxWarns: PillboxWarnView; // the lights at the pillboxes' muzzles while they warn of a burst
  blasts: BlastView; // the blast points' rings and the charges planted on them
  hazards: HazardView; // the warned shells' rings and the mines' discs
  seaFire: SeaFireView; // the main guns' flashes and lines toward the sea
  battle: Battle; // the battle around the mech: allies walking, shells, smoke, tracers, planes and holes; the game moves it, the view draws it (SB-170)
  allies: AllyView; // the script's allied mech
  hud: PlayHud; // the sortie's HUD, in the page
  hudGlowFrom: number | null; // the aim mark's armour flash start (game time), null when dark
  useNear: boolean; // whether the mech is in reach of a blast point, so the touch use button lights (SB-2017)
  hurt: HurtView; // the red edge, the white flash and the dark edge while the armour is low
  cutscene: CutsceneView; // the bars, the line and the pictures only a cutscene shows
  fortressBoomed: boolean; // whether the fortress blast's dust has been drawn (a game past it starts quiet)
}

// Builds the sortie's map and its mech into the scene. Hiding the start-up field is left to the caller.
// `world` lets a view bring its own map (the arena's flat ground). The battle layer runs on `game.battleTune`, which the
// caller sets when it makes the game (the arena asks for a thinner one).
export interface PlayViewOptions {
  world?: World;
}

// The ground point at height `y` that the screen's point (`ndc`) looks at, from the quarter camera's pose before the
// feel's shake and the fov it was last drawn with. The view owns the screen-to-ground step; null until the camera has a
// pose (the first frame) or when the point looks above the horizon.
export function aimPointOf(view: PlayView, ndc: { x: number; y: number }, y: number): { x: number; z: number } | null {
  if (view.quarter.pose === null) return null;
  return groundPoint(view.quarter.pose, view.quarter.fov, window.innerWidth / window.innerHeight, ndc, y);
}

export function buildPlayView(game: GameModel, options: PlayViewOptions = {}): PlayView {
  const world = options.world ?? buildWorld(game.map);
  buildBooms(game.map.bounds);
  // the look comes from the mission's row; the sortie is M1's B alone, so M1.id is written here (SB-300 picks the mission)
  applyLookTo(lookOf(M1.id), world.built.group);
  const model = buildProtoMech(MECH_TUNE.height);
  scene.add(model);
  // The mech's shadow and the surroundings' light are off unless the page asks (?shadow=1, ?env=1), so a plain sortie
  // keeps the look's lights and costs what it did; SB-1474 measures what each adds.
  const shadow = stageFlag('shadow') === '1';
  const env = stageFlag('env') === '1';
  let stage: ProtoStage | null = null;
  if (shadow || env) {
    stage = addProtoStage(model, world.built.group, game.mech.x, game.mech.z);
    stage.setShadow(shadow);
    stage.setEnv(env);
  }
  // The sortie's HUD: the aim mark at the cursor and the fixed parts round the screen.
  const hud = buildPlayHud(document.body);
  // A sortie taken up from a suspend can come back in the middle of a cutscene: its view starts at that second, so the
  // events before it (already played) are not all played again in the first frame.
  const startSecond = cutsceneElapsed(game.script.cutscene);
  const quarterTune = quarterTuneFrom(new URLSearchParams(location.search), QUARTER_TUNE);
  return {
    world,
    model,
    stage,
    mechFaded: false,
    feel: newFeel(FOV_TUNE.feel),
    // The first frame's pose is null, so the camera sits at its place at once: a checkpoint or a suspend resumes
    // without it flying in. `?q.height=30` tries a value without a build (quarterTuneFrom).
    quarter: { tune: quarterTune, pose: null, fov: quarterTune.fov, zoom: 1 },
    aim: undefined,
    gunfire: buildGunfireView(),
    enemies: buildEnemyView(),
    wardenCharge: buildWardenChargeView(),
    wardenSmoke: new Map(),
    coverHits: [],
    pillboxWarns: buildPillboxWarnView(world.targetGroup),
    blasts: buildBlastView(game.map),
    hazards: buildHazardView(),
    seaFire: buildSeaFire(game),
    // The battle layer's state lives in the game, which step moves; the view draws it. The tune is the one the game was
    // made with (PLAY_BATTLE_TUNE for the sortie, the arena's thinner one there). The rng here is the view's own draws
    // (planes, wrecks, smoke, tracers); the infantry's draws come from stream('crowd') in the game.
    battle: buildBattle(
      game.map,
      game.battleTune,
      stream('battle'),
      stream('craters'),
      { x: game.mech.x, z: game.mech.z },
      null,
      game.rects,
      game.battle,
    ),
    allies: buildAllyView(),
    hud,
    hudGlowFrom: null,
    useNear: false,
    hurt: buildHurtView(document.body),
    cutscene: buildCutsceneView(document.body, world.shore, game.map.bounds, world.targets, startSecond),
    fortressBoomed: game.script.fortressDown,
  };
}

// The lights at the pillboxes' muzzles: one instanced mesh, added to the targets' group so that group's removal takes
// it out with them.
function buildPillboxWarnView(group: THREE.Group): PillboxWarnView {
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({
      color: PILLBOX_WARN_COLOR,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
    MAX_PILLBOX_WARNS,
  );
  mesh.name = 'sb-pillbox-warn';
  mesh.count = 0;
  // the lights come and go, so the bounding sphere made at the start would cull them
  mesh.frustumCulled = false;
  group.add(mesh);
  // the smoke over a suppressed muzzle (SB-2015): a soft grey ball, see-through and not writing depth
  const smoke = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({
      color: PILLBOX_SMOKE_COLOR,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    MAX_PILLBOX_WARNS,
  );
  smoke.name = 'sb-pillbox-smoke';
  smoke.count = 0;
  smoke.frustumCulled = false;
  group.add(smoke);
  const nestSmoke = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({
      color: PILLBOX_SMOKE_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    MAX_NEST_SMOKE,
  );
  nestSmoke.name = 'sb-nest-smoke';
  nestSmoke.count = 0;
  nestSmoke.frustumCulled = false;
  group.add(nestSmoke);
  return { mesh, smoke, nestSmoke };
}

const pillboxWarnPlace = new THREE.Object3D();

// Draws a light at the muzzle of every pillbox whose warning is running, up to the mesh's capacity, smaller as the
// warning nears its end. The light is read from the pillbox's own countdown each frame, so a cutscene, a pause or a
// suspend holds it where it stands.
function drawPillboxWarns(view: PillboxWarnView, game: GameModel): void {
  let count = 0;
  for (const state of game.pillboxes) {
    if (count === MAX_PILLBOX_WARNS) break;
    if (state.warn <= 0) continue;
    const target = game.targets.find(target => target.id === state.id);
    // a destroyed pillbox keeps its state but must not keep its light
    if (!target || target.hp <= 0) continue;
    const muzzle = pillboxMuzzle(target.box, target.yaw);
    const share = clamp(state.warn / PILLBOX_TUNE.warn, 0, 1); // 1 at the warning, 0 as it ends
    const size = PILLBOX_WARN_SIZE * (PILLBOX_WARN_SHRINK + (1 - PILLBOX_WARN_SHRINK) * share);
    pillboxWarnPlace.position.set(muzzle.x, muzzle.y, muzzle.z);
    pillboxWarnPlace.scale.setScalar(size);
    pillboxWarnPlace.updateMatrix();
    view.mesh.setMatrixAt(count, pillboxWarnPlace.matrix);
    count++;
  }
  view.mesh.count = count;
  view.mesh.instanceMatrix.needsUpdate = true;
}

// The red band a warden shows ahead of a charge: one flat plane, added to the scene on its own.
export function buildWardenChargeView(): WardenChargeView {
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(
    plane,
    new THREE.MeshBasicMaterial({
      color: SHELL_LAND_COLOR,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    MAX_WARDEN_BANDS,
  );
  mesh.name = 'sb-warden-charge';
  mesh.count = 0;
  // the band comes and goes, so the bounding sphere made at the start would cull it
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh };
}

const wardenBandPlace = new THREE.Object3D();

// Draws the band ahead of every warden in its charge (the crouch and the run), up to the mesh's capacity.
export function drawWardenCharge(view: WardenChargeView, game: GameModel): void {
  let count = 0;
  for (const enemy of game.enemies) {
    if (count === MAX_WARDEN_BANDS) break;
    if (enemy.kind !== 'warden' || enemy.hp <= 0) continue;
    if (enemy.warden?.phase !== 'charge') continue;
    const radius = ENEMIES.warden.radius;
    const distance = WARDEN_TUNE.charge.distance;
    wardenBandPlace.position.set(
      enemy.x - Math.sin(enemy.yaw) * (radius + distance / 2),
      WARDEN_BAND_LIFT,
      enemy.z - Math.cos(enemy.yaw) * (radius + distance / 2),
    );
    wardenBandPlace.rotation.y = enemy.yaw;
    wardenBandPlace.scale.set(WARDEN_TUNE.look.bandWidth, 1, distance);
    wardenBandPlace.updateMatrix();
    view.mesh.setMatrixAt(count, wardenBandPlace.matrix);
    count++;
  }
  view.mesh.count = count;
  view.mesh.instanceMatrix.needsUpdate = true;
}

// Takes the charge band out of the scene.
export function removeWardenChargeView(view: WardenChargeView): void {
  scene.remove(view.mesh);
  view.mesh.geometry.dispose();
  (view.mesh.material as THREE.Material).dispose();
  view.mesh.dispose();
}

// Draws the smoke over every suppressed pillbox's muzzle, up to the mesh's capacity. It reads the pillbox's own quiet
// seconds each frame, so the smoke stays while a cutscene, a pause or a suspend holds it where it stands.
function drawPillboxSmoke(view: PillboxWarnView, game: GameModel): void {
  let count = 0;
  for (const state of game.pillboxes) {
    if (count === MAX_PILLBOX_WARNS) break;
    if (state.suppress <= 0) continue;
    const target = game.targets.find(target => target.id === state.id);
    if (!target || target.hp <= 0) continue;
    const muzzle = pillboxMuzzle(target.box, target.yaw);
    // a fresh hit's cloud is a little bigger; it settles as the quiet runs out
    const share = clamp(state.suppress / PILLBOX_TUNE.suppressSec, 0, 1);
    const size = PILLBOX_SMOKE_SIZE * (0.8 + 0.2 * share);
    pillboxWarnPlace.position.set(muzzle.x, muzzle.y + PILLBOX_SMOKE_LIFT, muzzle.z);
    pillboxWarnPlace.scale.setScalar(size);
    pillboxWarnPlace.updateMatrix();
    view.smoke.setMatrixAt(count, pillboxWarnPlace.matrix);
    count++;
  }
  view.smoke.count = count;
  view.smoke.instanceMatrix.needsUpdate = true;
}

// Draws a puff over every living nest of the wave the allies' fire holds quiet (SB-2024). It reads the game's `cover` each
// frame, so it stands while the window runs and goes with it; a nest that falls loses its puff.
function drawNestSmoke(view: PillboxWarnView, game: GameModel): void {
  let count = 0;
  const cover = game.cover;
  if (cover !== null) {
    for (const enemy of game.enemies) {
      if (count === MAX_NEST_SMOKE) break;
      if (enemy.hp <= 0 || enemy.wave !== cover.wave) continue;
      // it swells a little at the start and settles as the window runs out
      const swell = 0.85 + 0.15 * Math.sin(game.time * 5 + count);
      pillboxWarnPlace.position.set(enemy.x, enemy.y + COVER_TUNE.smokeLift, enemy.z);
      pillboxWarnPlace.scale.setScalar(COVER_TUNE.smokeSize * swell);
      pillboxWarnPlace.updateMatrix();
      view.nestSmoke.setMatrixAt(count, pillboxWarnPlace.matrix);
      count++;
    }
  }
  view.nestSmoke.count = count;
  view.nestSmoke.instanceMatrix.needsUpdate = true;
}

// Lets the support fire's tracers fly and throws a spark and dust where each lands, once its flight time has passed.
function drawCoverFire(view: PlayView, game: GameModel, dt: number): void {
  for (const event of game.events) {
    if (event.kind !== 'coverFire') continue;
    const dx = event.tx - event.x;
    const dy = event.ty - event.y;
    const dz = event.tz - event.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = COVER_TUNE.speed / len;
    view.battle.tracer({ x: event.x, y: event.y, z: event.z }, { x: dx * k, y: dy * k, z: dz * k });
    if (view.coverHits.length < MAX_COVER_HITS) {
      view.coverHits.push({ t: len / COVER_TUNE.speed, x: event.tx, y: event.ty, z: event.tz });
    }
  }
  for (let i = view.coverHits.length - 1; i >= 0; i--) {
    const hit = view.coverHits[i];
    hit.t -= dt;
    if (hit.t > 0) continue;
    view.coverHits.splice(i, 1);
    burst(
      hit.x,
      hit.y,
      hit.z,
      PILLBOX_DEFLECT_COLOR,
      COVER_SPARKS,
      COVER_SPARK_SPEED,
      COVER_SPARK_LIFE,
      COVER_SPARK_GRAVITY,
    );
    spawnDust(hit.x, hit.z, COVER_DUST, FEEL_TUNE, hit.y);
  }
}

// One frame of the sortie: the frame's events become dust, sparks and the camera's shake, the bullets in flight become
// tracer bands with the enemies' muzzles lit, the enemies, the rings of warned shells and the mines are drawn, the mech
// and the map follow the game's state, and the camera looks from behind the mech. The feel's hit stop is not
// used: the logic cannot be frozen.
export function drawPlay(view: PlayView, game: GameModel, dt: number): void {
  const mechEvents: MechEvent[] = [];
  // The frame's shots, lit once the model has taken this frame's pose: the flash leaves the cannon's own muzzle.
  const shots: { weapon: WeaponId; x: number; y: number; z: number }[] = [];
  let kill = false;
  let meleeHit = false;
  // the blast and the shake its distance from the mech asks for; a close blast also whitens the screen. A shell that
  // falls past the map's front edge lands in the sea, so it lifts a water column and takes the water's colours.
  const blast = (kind: BoomKind, x: number, y: number, z: number) => {
    spawnBoom(kind, x, y, z);
    feelBoom(view.feel, boomShakeAt(kind, distXZ({ x, z }, game.mech)), FEEL_TUNE);
    hurtBlast(view.hurt, x, z, game.mech);
  };
  // A blast that broke its target on this same frame has a `destroyed` event, whose large blast already stands at the
  // target's middle; the blast's own must not be drawn on top of it.
  const brokenThisFrame = new Set(game.events.flatMap(event => (event.kind === 'destroyed' ? [event.id] : [])));
  for (const event of game.events) {
    if (event.kind === 'mech') {
      mechEvents.push(event.event);
      if (event.event.kind === 'land') spawnDust(game.mech.x, game.mech.z, LAND_DUST, FEEL_TUNE, game.mech.y);
      else if (event.event.kind === 'boostStart') {
        spawnDust(game.mech.x, game.mech.z, BOOST_DUST, FEEL_TUNE, game.mech.y);
      }
    } else if (event.kind === 'shot') {
      mechEvents.push({ kind: 'fire', speed: 0 });
      // the muzzle flash carries the weapon, so the heavy gun's reads bigger than the autocannon's; it is lit below,
      // where the model has this frame's pose and the cannon's mouth is known
      shots.push({ weapon: event.weapon, x: event.x, y: event.y, z: event.z });
    } else if (event.kind === 'melee') {
      // a blow that lands throws sparks from the enemy; the shake and the stop are added after the kill's, so the
      // fist's longer stop is the one the frame keeps
      if (event.hit) {
        meleeHit = true;
        burst(
          event.x,
          event.y,
          event.z,
          MELEE_SPARK_COLOR,
          MELEE_TUNE.sparkCount,
          MELEE_TUNE.sparkSpeed,
          MELEE_TUNE.sparkLife,
          MELEE_TUNE.sparkGravity,
        );
      }
    } else if (event.kind === 'hit') {
      // A shot a pillbox's front turned away throws a small bright spark and nothing else; every other hit leaves sand.
      if (event.deflected) {
        burst(
          event.x,
          event.y,
          event.z,
          PILLBOX_DEFLECT_COLOR,
          DEFLECT_SPARKS,
          DEFLECT_SPEED,
          DEFLECT_LIFE,
          DEFLECT_GRAVITY,
        );
      } else {
        spawnDust(event.x, event.z, HIT_DUST, FEEL_TUNE, blastFaceHeight(game.rects, event.x, event.z));
        // sand and props throw a few sparks and a puff; a target, an enemy or the mech's armour throws metal ones
        spawnImpact(
          view.gunfire,
          event.x,
          event.y,
          event.z,
          event.target !== null || event.enemy !== null || event.mech,
        );
      }
    } else if (event.kind === 'destroyed') {
      kill = true;
      const target = game.targets.find(entry => entry.id === event.id);
      if (target) {
        // the pillbox's fall starts now; syncWorld advances its seconds (SB-1550)
        if (target.kind === 'pillbox') view.world.breaks.set(event.id, 0);
        const { box } = target;
        // The second bunker falls with the milestone's bigger blast; the first gets the smaller one (SB-2010). Every
        // other target keeps the plain blast.
        const milestone = target.kind === 'pillbox' && (target.id === 'pillbox-1' || target.id === 'pillbox-2');
        const kind = milestone
          ? game.script.flags.includes(PILLBOXES_FLAG)
            ? PAYOFFS.bunker.boom
            : PAYOFFS.bunker1.boom
          : 'large';
        blast(kind, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
        burnAtmosphere((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2);
      }
    } else if (event.kind === 'enemyDown') {
      // the mid boss smokes for its three seconds and blows on `wardenDown`; the others fall at once
      const fallen = game.enemies.find(enemy => enemy.id === event.id);
      if (fallen?.kind !== 'warden') {
        kill = true;
        blast('small', event.x, event.y + BLAST_LIFT.small, event.z);
      }
    } else if (event.kind === 'wardenDown') {
      kill = true;
      blast('large', event.x, BLAST_LIFT.large, event.z);
    } else if (event.kind === 'propDestroyed') {
      blast('small', event.x, BLAST_LIFT.prop, event.z);
      // the broken prop keeps a fire of its own, which its wreck stands in for well enough at this size
      burnAtmosphere(event.x, event.z);
    } else if (event.kind === 'shellLand' || event.kind === 'mineBlast') {
      // the sea has no ground face: a shell past the map's front edge keeps the height its flash had over the water
      const water = event.z >= game.map.bounds.maxZ;
      blast(water ? 'water' : 'large', event.x, landBlastHeight(water, event.y), event.z);
    } else if (event.kind === 'planted') {
      spawnDust(event.x, event.z, PLANT_DUST, FEEL_TUNE);
    } else if (event.kind === 'blast') {
      const target = blastTarget(game.map, event.id);
      // A charge that opens line 1 or line 2 is a milestone: it draws the bigger blast (SB-2010, SB-2020). A charge whose
      // pillbox broke on this frame leaves the boom to the destroyed event; one whose pillbox was already down (broken by
      // a shot while the fuse burnt) draws its own.
      const opensLine =
        PAYOFFS.breach.blasts?.includes(event.id) === true || PAYOFFS.breach2.blasts?.includes(event.id) === true;
      const kind = opensLine ? PAYOFFS.breach.boom : 'large';
      if (target === undefined || !brokenThisFrame.has(target)) blast(kind, event.x, BLAST_LIFT.large, event.z);
    } else if (event.kind === 'allyDown') {
      // the ally stands on the face under it, so its blast and dust belong there rather than inside a wall
      const face = blastFaceHeight(game.rects, event.x, event.z);
      // A machine gun's burst takes the gunner down: dust, no blast, so it does not look like a mortar round.
      if (event.by === 'gun') {
        spawnDust(event.x, event.z, HIT_DUST, FEEL_TUNE, face);
      } else {
        shellBurst(event.x, event.z, face);
        spawnDust(event.x, event.z, BLAST_DUST, FEEL_TUNE, face);
      }
    } else if (event.kind === 'assistFire') {
      // The survivors' shot from above the sea gate, and the sand it lifts where the enemy stood: a look only. The
      // same frame's `enemyDown` draws the fall itself.
      const dx = event.toX - event.fromX;
      const dz = event.toZ - event.fromZ;
      const length = Math.hypot(dx, dz) || 1;
      view.battle.tracer(
        { x: event.fromX, y: YARD_TUNE.gateY, z: event.fromZ },
        { x: (dx / length) * YARD_TUNE.assistTracerSpeed, y: 0, z: (dz / length) * YARD_TUNE.assistTracerSpeed },
      );
      spawnDust(event.toX, event.toZ, HIT_DUST * YARD_TUNE.assistDust, FEEL_TUNE);
    } else if (event.kind === 'supportFire') {
      // One of the infantry at the hold line shot an enemy (SB-2240): the tracer leaves the soldier's chest and flies
      // as fast as the cover fire's; the same frame's `enemyDown` draws the fall itself.
      const dx = event.to.x - event.from.x;
      const dy = event.to.y - SUPPORT_TRACER_HEIGHT;
      const dz = event.to.z - event.from.z;
      const length = Math.hypot(dx, dy, dz) || 1;
      const k = COVER_TUNE.speed / length;
      view.battle.tracer(
        { x: event.from.x, y: SUPPORT_TRACER_HEIGHT, z: event.from.z },
        { x: dx * k, y: dy * k, z: dz * k },
      );
    } else if (event.kind === 'damaged') {
      feelDamage(view.feel, FEEL_TUNE);
      hurtDamage(view.hurt, event.fromX, event.fromZ, game.mech.yaw, view.quarter.tune.azimuth);
      // layout D's armour arc flashes from the frame the hit lands; the HUD model has no hit of its own (SB-2155)
      view.hudGlowFrom = game.time;
    }
  }
  // The fortress's charge blew (SB-1860): a large blast at the magazine and dust along each wall that comes down. The
  // script's `fortressDown` is the mark, as the blast itself is a `blast` event; a game that starts after it is quiet.
  if (game.script.fortressDown && !view.fortressBoomed) {
    view.fortressBoomed = true;
    for (const [x, z] of [
      [-30, -120],
      [30, -120],
      [-24, -71],
      [24, -71],
      [-12, -125],
      [12, -125],
      [-32, -100],
      [32, -100],
      [0, -100],
    ] as const) {
      blast('large', x, 1, z);
    }
  }
  // The infantry waits at the front line's hold until the pillboxes are down, then goes on to the far line. The game's
  // step moves it: a new front line moves the hold and sends one more wave (SB-2010), and the soldiers that fell and the
  // shells that landed are in this frame's events for the view to draw. The landing cutscene holds the battlefield's clock
  // still (`holdsBattle`), so the first squad runs and falls once the player has the controls; the cutscene's own
  // machine-gun tracers still fly (drawTracersOnly). The other cutscenes run it on.
  const cutscene = game.script.cutscene;
  const holdsBattle = cutscene !== null && CUTSCENES[cutscene.id]?.holdsBattle === true;
  if (!holdsBattle) {
    const shellShake = view.battle.draw(
      dt,
      game.mech,
      sectorHold(game.sectors, game.script.blasts, game.map.blasts ?? []).held,
      game.events,
    );
    // The battlefield's shells shake the camera within the same cap as the blasts: a shell landing in the same frame as
    // a blast near the mech must not add the two past shakeMax and throw the camera off.
    if (shellShake > 0) feelBoom(view.feel, shellShake, FEEL_TUNE);
  } else {
    view.battle.drawTracersOnly(dt);
  }
  feelEvents(view.feel, mechEvents, kill, FEEL_TUNE);
  if (meleeHit) feelMelee(view.feel);
  const frame = feelStep(view.feel, dt, game.mech.boosting, FOV_TUNE.feel, FEEL_TUNE);

  // A cutscene that has the mech walk (the landing's ramp) draws it on its path; this is the picture only, so the
  // game's mech stays at its start and a skip, a checkpoint or a suspend need nothing: the model is back on the game's
  // mech in the frame the cutscene ends. A cutscene with no path does not draw the mech: it is still in the boat.
  const walk = cutscene === null ? null : cutsceneMech(cutscene.id, cutsceneElapsed(cutscene));
  if (walk === null) {
    view.model.position.set(game.mech.x, game.mech.y, game.mech.z);
    view.model.rotation.y = game.mech.yaw;
    drawMechMotion(view.model, game, dt);
  } else {
    view.model.position.set(walk.x, walk.y, walk.z);
    view.model.rotation.y = game.mech.yaw;
    drawMechWalk(view.model, walk.speed, dt);
  }
  view.model.visible = cutscene === null || walk !== null;
  view.stage?.follow(view.model.position.x, view.model.position.z);
  // the cannon's mouth once the arm has this frame's pose; a kit without one keeps the shot's own place
  const muzzle = protoMuzzle(view.model);
  for (const shot of shots) {
    const at = muzzle ?? shot;
    spawnMuzzleFlash(view.gunfire, shot.weapon, at.x, at.y, at.z);
  }

  // A large enemy near the mech pulls the camera back; a cutscene keeps the plain pose and the pull starts again from 1.
  view.quarter.zoom =
    cutscene === null ? stepZoom(view.quarter.zoom, wantsWide(game, view.quarter.tune), dt, view.quarter.tune) : 1;
  const pose = quarterPose(
    { x: game.mech.x, y: game.mech.y, z: game.mech.z },
    zoomedTune(view.quarter.tune, view.quarter.zoom),
  );
  if (cutscene === null) {
    // The follow starts from the last pose drawn, so a skip or a cutscene's end eases into the quarter view (ticket 2137).
    view.quarter.pose = followQuarter(view.quarter.pose, pose, dt, view.quarter.tune);
  } else if (CUTSCENES[cutscene.id] !== undefined) {
    // The cutscene draws its own camera over this one (drawCutscene). Keep that third-person pose as the follow's start,
    // so the first controlled frame passes through it instead of jumping to the quarter view.
    const shown = cutscenePose(cutscene.id, Math.max(0, cutsceneElapsed(cutscene)), walk ?? game.mech);
    view.quarter.pose = quarterPoseFromCutscene(shown);
  } else {
    view.quarter.pose = pose;
  }
  const pos = view.quarter.pose.pos.clone().add(frame.offset);
  camera.position.copy(pos);
  camera.lookAt(view.quarter.pose.look);
  camera.fov = view.quarter.tune.fov + (frame.fov - FOV_TUNE.feel);
  view.quarter.fov = camera.fov;
  camera.updateProjectionMatrix();
  // The main body and the arena pass the cursor's ground point as aimAt; the view leaves this line undefined and step
  // makes a level line from the chest to the point.
  view.aim = undefined;
  drawCutscene(view.cutscene, game, view.hud.root, view.feel, frame.offset, view.battle);
  drawBooms(dt);

  // a camera pushed close by a wall would fill the screen with the mech, so the mech turns see-through
  const near = mechSeeThrough(camera.position, game.mech);
  if (near !== view.mechFaded) {
    view.mechFaded = near;
    setProtoOpacity(view.model, near ? MECH_TUNE.fadeOpacity : 1);
  }

  // a low prop between the camera and the mech's chest turns see-through (the camera is not pulled in by it)
  const model = view.model.position;
  fadeStep(
    view.world.fade,
    camera.position,
    fadeChest.set(model.x, model.y + MECH_TUNE.height / 2, model.z),
    dt,
    FADE_TUNE,
  );
  cullChunks(view.world.built.chunks, view.world.built.group, camera, MAP_FOG.far);
  syncWorld(view.world, game, dt);
  drawGunfire(view.gunfire, game.bullets, dt, muzzle);
  // a warden that is falling smokes until its three seconds are up; the blast itself is the `wardenDown` event
  for (const enemy of game.enemies) {
    if (enemy.kind !== 'warden' || enemy.hp > 0 || (enemy.warden?.dying ?? 0) <= 0) continue;
    const next = (view.wardenSmoke.get(enemy.id) ?? 0) - dt;
    if (next > 0) {
      view.wardenSmoke.set(enemy.id, next);
      continue;
    }
    spawnBoom('small', enemy.x, 1.5, enemy.z);
    view.wardenSmoke.set(enemy.id, WARDEN_SMOKE_EVERY);
  }
  drawEnemies(view.enemies, game);
  drawWardenCharge(view.wardenCharge, game);
  drawPillboxWarns(view.pillboxWarns, game);
  drawPillboxSmoke(view.pillboxWarns, game);
  drawNestSmoke(view.pillboxWarns, game);
  drawCoverFire(view, game, dt);
  drawHazards(view.hazards, game);
  drawBlasts(view.blasts, game);
  drawSeaFire(view.seaFire, game);
  drawAllies(view.allies, game, view.battle, stream('allyFx'), dt);
  hurtStep(view.hurt, dt, game.armor / MECH_TUNE.armor);
  // the red edge and the flash are the player's damage readout, as the HUD is: a cutscene hides them with the HUD
  view.hurt.root.hidden = game.script.cutscene !== null;
  const hud = hudModel(game, view.quarter.tune.azimuth);
  view.useNear = hud.use !== null;
  // the aim mark's armour flashes for a moment after a hit; the fade is the pure hitGlow
  const glow = view.hudGlowFrom === null ? 0 : hitGlow(game.time - view.hudGlowFrom, HUD_RING_TUNE.reticle.glowSec);
  if (view.hudGlowFrom !== null && glow <= 0) view.hudGlowFrom = null;
  const lock = hud.lock === null ? null : screenRect(hud.lock, camera, window.innerWidth, window.innerHeight);
  drawHud(view.hud, hud, lock, glow, game.time);
}
