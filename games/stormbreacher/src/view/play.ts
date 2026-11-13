// The sortie as the screen draws it: the map on M1's B line, the mech, its shots, the dust and the camera's feel. The
// view reads GameModel and never writes it; logic/game.ts owns the mech, the targets and the frame's events.
import * as THREE from 'three';
import { clamp, distXZ } from '@engine/core/index.ts';
import { burst, camera, cullChunks, scene } from '@engine/render/index.ts';
import { boomShakeAt } from '../data/boom.ts';
import { ENEMY_BULLET_COLOR, PILLBOX_DEFLECT_COLOR, PILLBOX_WARN_COLOR } from '../data/colors.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../data/mech.ts';
import { lookOf } from '../data/looks.ts';
import { M1, PILLBOXES_DOWN_FLAG } from '../data/missions/m1.ts';
import { PILLBOX_TUNE } from '../data/pillbox.ts';
import { CUTSCENE_SEC } from '../data/script.ts';
import { BATTLE_TUNE, CAMERA_TUNE, FEEL_TUNE, MECH_TUNE, PLAY_BATTLE_TUNE } from '../data/tune.ts';
import { blastTarget } from '../logic/blasts.ts';
import { isHostileBullet, type Bullet, type GameModel } from '../logic/game.ts';
import { cutsceneMech } from '../logic/cutscene.ts';
import { pillboxMuzzle } from '../logic/pillbox.ts';
import { hudModel } from '../logic/hud.ts';
import { stream } from '../logic/rng.ts';
import type { MechEvent } from '../logic/mech.ts';
import { buildAllyView, drawAllies, type AllyView } from './allies.ts';
import { buildBattle, type Battle } from './battle/index.ts';
import { buildBlastView, drawBlasts, type BlastView } from './blasts.ts';
import { applyPose, cameraPose, followPose, screenRect } from './camera.ts';
import { buildEnemyView, drawEnemies, type EnemyView } from './enemies.ts';
import { drawHazards, buildHazardView, shellBurst, type HazardView } from './hazards.ts';
import { buildBooms, drawBooms, spawnBoom } from './boom.ts';
import { feelBoom, feelDamage, feelEvents, feelStep, newFeel, spawnDust, type FeelState } from './feel.ts';
import { buildCutsceneView, drawCutscene, type CutsceneView } from './cutscene.ts';
import { buildSeaFire, drawSeaFire, type SeaFireView } from './seaFire.ts';
import { buildPlayHud, drawHud, type PlayHud } from './hud.ts';
import { buildHurtView, hurtBlast, hurtDamage, hurtStep, type HurtView } from './hurt.ts';
import { applyLookTo } from './look.ts';
import { drawMechMotion, drawMechWalk } from './mechDrive.ts';
import { buildMechVisual, setMechOpacity } from './mechModel.ts';
import { buildWorld, MAP_FOG, syncWorld, type World } from './world.ts';

const TRACER_COLOR = 0xffe066; // the bullet's line
const TRACER_LENGTH = 4; // how far behind its head a bullet's line reaches (m)
const MAX_BULLET_LINES = 96; // the most bullets drawn at once, for the mech's and for the enemies' each; the rest fly unseen
const HIT_DUST = 3; // the dust's particle count before FEEL_TUNE.dust, per hit
const DEFLECT_SPARKS = 6; // the sparks a shot off a pillbox's front throws
const DEFLECT_SPEED = 5; // how fast a spark flies out (m/s)
const DEFLECT_LIFE = 0.18; // how long a spark lives (s)
const DEFLECT_GRAVITY = -4; // how fast a spark falls (m/s^2)
const LAND_DUST = 10; // the dust's particle count before FEEL_TUNE.dust, per landing
const BOOST_DUST = 6; // the same, per boost start
const BLAST_DUST = 14; // the same, per ally falling to a mortar shell
const PLANT_DUST = 4; // the same, when a charge is set on a blast point
const MAX_PILLBOX_WARNS = 8; // the warning lights the mesh can draw at once; the hand map has 3 pillboxes, so it is not reached
const PILLBOX_WARN_SIZE = 0.6; // the light's size when the warning starts (m)
const PILLBOX_WARN_SHRINK = 0.6; // how small it gets as the warning ends, as a share of its start size

// The bullets in flight, drawn as one set of line segments: two vertices a bullet, the position written every frame.
export interface BulletLines {
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: THREE.BufferAttribute; // MAX_BULLET_LINES * 2 vertices (the tail, then the head)
}

// The warning lights, one instanced mesh for all of them.
export interface PillboxWarnView {
  mesh: THREE.InstancedMesh;
}

export interface PlayView {
  world: World;
  model: THREE.Group; // the mech, M1's look (pattern E)
  mechFaded: boolean; // whether the mech is drawn see-through, for the camera is near
  feel: FeelState;
  pitch: number; // the camera's pitch (rad)
  camPos: THREE.Vector3 | null; // the camera's place in the last frame
  bullets: BulletLines; // the lines of the mech's shots in flight
  enemyBullets: BulletLines; // the lines of the enemies' shots, in another colour
  enemies: EnemyView; // the enemies' instanced boxes
  pillboxWarns: PillboxWarnView; // the lights at the pillboxes' muzzles while they warn of a burst
  blasts: BlastView; // the blast points' rings and the charges planted on them
  hazards: HazardView; // the warned shells' rings and the mines' discs
  seaFire: SeaFireView; // the main guns' flashes and lines toward the sea
  battle: Battle; // the battle around the mech: allies walking, shells, smoke, tracers, planes and holes; looks only (SB-170)
  allies: AllyView; // the script's allied mech
  hud: PlayHud; // the sortie's HUD, in the page
  hurt: HurtView; // the red edge, the white flash and the dark edge while the armour is low
  cutscene: CutsceneView; // the bars, the line and the pictures only a cutscene shows
}

// Builds the sortie's map and its mech into the scene. Hiding the start-up field is left to the caller.
export function buildPlayView(game: GameModel): PlayView {
  const world = buildWorld(game.map);
  buildBooms(game.map.bounds);
  // the look comes from the mission's row; the sortie is M1's B alone, so M1.id is written here (SB-300 picks the mission)
  applyLookTo(lookOf(M1.id), world.built.group);
  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  scene.add(model);
  const hud = buildPlayHud(document.body);
  return {
    world,
    model,
    mechFaded: false,
    feel: newFeel(CAMERA_TUNE.fov),
    pitch: 0,
    camPos: null,
    bullets: buildBulletLines(TRACER_COLOR),
    enemyBullets: buildBulletLines(ENEMY_BULLET_COLOR),
    enemies: buildEnemyView(),
    pillboxWarns: buildPillboxWarnView(world.targetGroup),
    blasts: buildBlastView(game.map),
    hazards: buildHazardView(),
    seaFire: buildSeaFire(game),
    // PLAY_BATTLE_TUNE keeps FX_TUNE's look; only the main sortie's waves are thinner, and its squads fall in the
    // machine-gun nests' fire. The battle is made at the mech's start and keeps no link to the game's state.
    // BATTLE_TUNE.holdZ is where the allies wait until both pillboxes are down; PLAY_BATTLE_TUNE has no such value, so
    // it stays the FX look.
    battle: buildBattle(
      game.map,
      PLAY_BATTLE_TUNE,
      stream('battle'),
      stream('craters'),
      { x: game.mech.x, z: game.mech.z },
      BATTLE_TUNE.holdZ,
    ),
    allies: buildAllyView(),
    hud,
    hurt: buildHurtView(document.body),
    cutscene: buildCutsceneView(document.body, world.shore, game.map.bounds, world.targets),
  };
}

function buildBulletLines(color: number): BulletLines {
  const positions = new THREE.BufferAttribute(new Float32Array(MAX_BULLET_LINES * 2 * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
  // the bounding sphere would be made from the first positions (all 0), so the lines are never culled by it
  lines.frustumCulled = false;
  scene.add(lines);
  return { lines, positions };
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
  return { mesh };
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

// Writes each bullet's head and the point TRACER_LENGTH behind it, and draws only as many segments as there are bullets.
function drawBullets(lines: BulletLines, bullets: readonly Bullet[]): void {
  const count = Math.min(bullets.length, MAX_BULLET_LINES);
  const positions = lines.positions;
  for (let i = 0; i < count; i++) {
    const bullet = bullets[i];
    positions.setXYZ(
      i * 2,
      bullet.x - bullet.dx * TRACER_LENGTH,
      bullet.y - bullet.dy * TRACER_LENGTH,
      bullet.z - bullet.dz * TRACER_LENGTH,
    );
    positions.setXYZ(i * 2 + 1, bullet.x, bullet.y, bullet.z);
  }
  positions.needsUpdate = true;
  lines.lines.geometry.setDrawRange(0, count * 2);
}

// One frame of the sortie: the frame's events become dust and the camera's shake, the bullets in flight become lines
// (the mech's and the hostile ones' apart), the enemies, the rings of warned shells and the mines are drawn, the mech and the map follow the game's state, and the camera looks from behind the mech. The feel's hit stop is not
// used: the logic cannot be frozen.
export function drawPlay(view: PlayView, game: GameModel, dt: number, pitchDelta: number): void {
  const mechEvents: MechEvent[] = [];
  let kill = false;
  // the blast and the shake its distance from the mech asks for; a close blast also whitens the screen. A shell that
  // falls past the map's front edge lands in the sea, so it lifts a water column and takes the water's colours.
  const blast = (kind: 'small' | 'large' | 'water', x: number, y: number, z: number) => {
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
      if (event.event.kind === 'land') spawnDust(game.mech.x, game.mech.z, LAND_DUST, FEEL_TUNE);
      else if (event.event.kind === 'boostStart') spawnDust(game.mech.x, game.mech.z, BOOST_DUST, FEEL_TUNE);
    } else if (event.kind === 'shot') {
      mechEvents.push({ kind: 'fire', speed: 0 });
    } else if (event.kind === 'hit') {
      // a shot a pillbox's front turned away throws a small bright spark; everything else leaves sand
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
        spawnDust(event.x, event.z, HIT_DUST, FEEL_TUNE);
      }
    } else if (event.kind === 'destroyed') {
      kill = true;
      const target = game.targets.find(entry => entry.id === event.id);
      if (target) {
        // the pillbox's fall starts now; syncWorld advances its seconds (SB-1550)
        if (target.kind === 'pillbox') view.world.breaks.set(event.id, 0);
        const { box } = target;
        blast('large', (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
      }
    } else if (event.kind === 'enemyDown') {
      kill = true;
      blast('small', event.x, 0.6, event.z);
    } else if (event.kind === 'propDestroyed') {
      blast('small', event.x, 0.5, event.z);
    } else if (event.kind === 'shellLand' || event.kind === 'mineBlast') {
      blast(event.z >= game.map.bounds.maxZ ? 'water' : 'large', event.x, 0.8, event.z);
      // the game's own blast takes the infantry near it, as the battle's shells do (SB-1610)
      view.battle.blast(event.x, event.z);
    } else if (event.kind === 'planted') {
      spawnDust(event.x, event.z, PLANT_DUST, FEEL_TUNE);
    } else if (event.kind === 'blast') {
      const target = blastTarget(game.map, event.id);
      // A charge that broke its pillbox on this frame leaves the boom to the destroyed event; one whose pillbox was
      // already down (broken by a shot while the fuse burnt) draws its own.
      if (target === undefined || !brokenThisFrame.has(target)) blast('large', event.x, 0.8, event.z);
    } else if (event.kind === 'allyDown') {
      // A machine gun's burst takes the gunner down: dust, no blast, so it does not look like a mortar round.
      if (event.by === 'gun') {
        spawnDust(event.x, event.z, HIT_DUST, FEEL_TUNE);
      } else {
        shellBurst(event.x, event.z);
        spawnDust(event.x, event.z, BLAST_DUST, FEEL_TUNE);
      }
    } else if (event.kind === 'damaged') {
      feelDamage(view.feel, FEEL_TUNE);
      hurtDamage(view.hurt, event.fromX, event.fromZ, game.mech.yaw);
    }
  }
  // The infantry waits at BATTLE_TUNE.holdZ until the pillboxes are down, then goes on to the far line. The landing
  // cutscene keeps the battlefield's clock still, so the first squad runs and falls once the player has the controls;
  // the cutscene's own machine-gun tracers still fly (advanceTracers).
  if (game.script.cutscene === null) {
    view.feel.shake += view.battle.step(dt, game.mech, !game.script.flags.includes(PILLBOXES_DOWN_FLAG));
  } else {
    view.battle.advanceTracers(dt);
  }
  feelEvents(view.feel, mechEvents, kill, FEEL_TUNE);
  const frame = feelStep(view.feel, dt, game.mech.boosting, CAMERA_TUNE.fov, FEEL_TUNE);

  // A cutscene that has the mech walk (the landing's ramp) draws it on its path; this is the picture only, so the
  // game's mech stays at its start and a skip, a checkpoint or a suspend need nothing: the model is back on the game's
  // mech in the frame the cutscene ends. A cutscene with no path does not draw the mech: it is still in the boat.
  const cutscene = game.script.cutscene;
  const walk = cutscene === null ? null : cutsceneMech(cutscene.id, CUTSCENE_SEC[cutscene.id] - cutscene.left);
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

  // The camera's pitch is held while a cutscene plays, so the game's camera is where the cutscene's last key puts its
  // own (the key is written for pitch 0) in the first frame the player controls.
  if (cutscene === null) view.pitch = clamp(view.pitch + pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
  const pose = cameraPose(
    { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw },
    view.pitch,
    CAMERA_TUNE,
    view.world.cameraBoxes,
  );
  // The cutscene draws its own camera over this one (drawCutscene). The game's camera sits at its place meanwhile, so it
  // starts the first controlled frame, or the one after a skip, where it stands and does not fly in from elsewhere.
  view.camPos =
    view.camPos && cutscene === null ? followPose(view.camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
  const pos = view.camPos.clone().add(frame.offset);
  applyPose(camera, { ...pose, pos }, frame.fov);
  drawCutscene(view.cutscene, game, view.hud.root, view.feel, frame.offset, view.battle);
  drawBooms(dt);

  // a camera pushed close by a wall would fill the screen with the mech, so the mech turns see-through
  const near =
    camera.position.distanceTo(new THREE.Vector3(game.mech.x, game.mech.y + MECH_TUNE.chestHeight, game.mech.z)) <
    MECH_TUNE.fadeDist;
  if (near !== view.mechFaded) {
    view.mechFaded = near;
    setMechOpacity(view.model, near ? MECH_TUNE.fadeOpacity : 1);
  }

  cullChunks(view.world.built.chunks, view.world.built.group, camera, MAP_FOG.far);
  syncWorld(view.world, game, dt);
  drawBullets(
    view.bullets,
    game.bullets.filter(bullet => !isHostileBullet(bullet)),
  );
  drawBullets(view.enemyBullets, game.bullets.filter(isHostileBullet));
  drawEnemies(view.enemies, game);
  drawPillboxWarns(view.pillboxWarns, game);
  drawHazards(view.hazards, game);
  drawBlasts(view.blasts, game);
  drawSeaFire(view.seaFire, game);
  drawAllies(view.allies, game, view.battle, stream('allyFx'), dt);
  hurtStep(view.hurt, dt, game.armor / MECH_TUNE.armor);
  const hud = hudModel(game);
  const lock = hud.lock === null ? null : screenRect(hud.lock, camera, window.innerWidth, window.innerHeight);
  drawHud(view.hud, hud, lock);
}
