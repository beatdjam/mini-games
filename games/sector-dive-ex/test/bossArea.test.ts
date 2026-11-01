// Smoke test for Sector Dive Extended, the boss area: its depth, the flag that keeps it out of the published build, and
// where each boss's room is. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real
// loop by hand. Each test makes the state it needs; the file passes on its own and in any order.
import { afterEach, beforeAll, expect, test } from 'vitest';
import type { BossKind, Pickup, PortalKind } from '../src/data/types.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { BOSS_ROOMS, BOSS_ROOM_ORDER } from '../src/data/bossRooms.ts';
import { COLOR } from '../src/data/colors.ts';
import { PORTAL } from '../src/data/level.ts';
import { PER, BOSS_AREA_START_TIER } from '../src/data/progress.ts';
import { SAVE_KEY, save } from '../src/core/save.ts';
import { clampStartTier, startTierMax } from '../src/core/progress.ts';
import { bossAreaTierFor, bossRoomBiome, devBossArea } from '../src/core/bossArea.ts';
import { bossStageOf, firstStageOf, planOf, stageInfo, stageLabel } from '../src/core/stages.ts';
import { run, player } from '../src/actors/player.ts';
import { boss, enemies } from '../src/world/entities.ts';
import { building } from '../src/world/building.ts';
import { devSeed, level } from '../src/world/level.ts';
import { makePortal } from '../src/world/portals.ts';
import { state } from '../src/flow/state.ts';
import { crossToFloor, endRun, enterBossRoom, goBase, returnToHall, startRun, startStage } from '../src/flow/run.ts';
import { resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { lockdownAhead, supplyChips } from '../src/flow/events.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { BOT_STYLES, createBot, hallGate, setBot } from '../src/dev/bot.ts';
import { bigmap, cycleMap, map3dWanted, toggleMap, toggleMap3D } from '../src/ui/hud.ts';
import { map3d, map3dOpen } from '../src/ui/map3d.ts';
import { keyText } from '../src/ui/input.ts';
import { query } from '@engine/core/world.ts';
import { TRACK_LOG } from '@engine/core/analytics.ts';
import { T, W, tileCenter, tileIndex } from '@engine/world/tiles.ts';
import { el, wrapAngle, yawToward } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { bootGame, enterBuilding, goToFloor, putOnTile, stateIs, tick } from './helpers.ts';

beforeAll(async () => {
  await bootGame();
  devBossArea(true); // not left to import.meta.env.DEV
});
afterEach(() => {
  devBossArea(true);
  devSeed(null);
  goBase();
  save.records.bossArea = null;
  save.records.cleared = false;
  save.shortcut = 0;
  save.startTier = 0;
});

test('bossAreaTierFor: D50 for a new save, the next milestone for one already past it', () => {
  expect(bossAreaTierFor(0, 0), 'a new save').toBe(49);
  expect(bossAreaTierFor(49, 49), 'a save that stops at D50').toBe(49);
  expect(bossAreaTierFor(50, 0), 'D51, started from the top').toBe(54);
  expect(bossAreaTierFor(60, 57), 'D58: the next milestone').toBe(59);
  expect(bossAreaTierFor(60, 54), 'a start on a milestone: the one after it').toBe(59);
  expect(bossAreaTierFor(60, 59), 'a start on the next milestone: the one after that').toBe(64);
});

test('settleBossArea: the first dive from the base settles the boss area once', () => {
  goBase();
  save.records.bossArea = null;
  save.shortcut = 0;
  save.startTier = 0;
  startRun(true);
  expect(save.records.bossArea, 'settled at D50').toEqual({ tier: 49, beaten: [] });
  goBase();
  save.startTier = 0; // (a deeper start would open the supply chip picks)
  save.shortcut = 60;
  startRun(true);
  expect(save.records.bossArea, 'already settled: left as it was').toEqual({ tier: 49, beaten: [] });
});

test('planOf: a depth is the boss area only where the save settled it', () => {
  save.records.bossArea = { tier: 49, beaten: [] };
  expect(planOf(49 * PER).area, 'the depth of the boss area').toBe(true);
  expect(planOf(48 * PER).area, 'the depth before it').toBe(false);
});

test('BOSS_ROOMS: every boss has a sector of its own, and all of them are sectors of the game', () => {
  expect(BOSS_ROOM_ORDER.length, 'the eight rooms').toBe(8);
  expect(new Set(BOSS_ROOM_ORDER).size, 'one room each').toBe(BOSS_ROOM_ORDER.length);
  BOSS_ROOM_ORDER.forEach(kind => {
    expect(Object.keys(BOSS_ROOMS), `${kind} has a room`).toContain(kind);
    expect(BOSS_ORDER, `${kind} is a boss`).toContain(kind);
  });
  const codes = Object.values(BOSS_ROOMS),
    sectors = BIOMES.map(b => b.code);
  expect(new Set(codes).size, 'a sector each').toBe(codes.length);
  codes.forEach(code => expect(sectors, `${code} is a sector`).toContain(code));
  expect(bossRoomBiome('watcher').code, "the watcher's room is in DATA").toBe('DATA');
});

test('boss area off: a dive settles nothing and takes the building path as before', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = null;
  save.shortcut = 49;
  save.startTier = 49;
  startRun(true);
  expect(save.records.bossArea, 'not settled').toBeNull();
  expect(planOf(49 * PER).area, 'no boss area').toBe(false);
  expect(run.bld, 'the building is there').toBeTruthy();
  expect(level.floor, 'a floor of it').toBeGreaterThanOrEqual(0);
});

test('a deep start settles the area and leaves the supply chip picks open', () => {
  goBase();
  save.records.bossArea = null;
  save.shortcut = 60;
  save.startTier = 54;
  startRun(true);
  expect(save.records.bossArea, 'the next milestone above the start').toEqual({ tier: 59, beaten: [] });
  expect(run.startTier, 'the run starts where it was set to').toBe(54);
  expect(state, 'a supply chip pick is open').toBe('perk');
});

// a dive at the boss area's depth: the supply chip picks open first; tick(2) closes that screen and play goes on
function enterHallRun(beaten: BossKind[] = []) {
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  expect(state, 'the supply chip pick is open first').toBe('perk');
  tick(2);
}

// the ten gates of the hall: the way out, the terminal and a room for each boss
const hallGateKinds = () => ['extract', 'room', 'room', 'room', 'room', 'room', 'room', 'room', 'room', 'terminal'];

test('a dive in the boss area starts in the hall', () => {
  enterHallRun();
  expect(run.area, 'the run is in the hall').toEqual({ at: 'hall' });
  expect(run.bld, 'not a floor of a building').toBeUndefined();
  expect(level.floor).toBe(-1);
  expect(level.rooms.length).toBe(1);
  expect(enemies.length, 'no enemy in the hall').toBe(0);
  expect(level.portals.map(p => p.kind).sort(), 'the way out, the terminal and the rooms').toEqual(hallGateKinds());
  expect(save.suspend?.run.area, 'the checkpoint keeps the hall').toEqual({ at: 'hall' });
  expect(save.suspend?.run.bld).toBeUndefined();
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('a run suspended in the hall resumes in the hall', () => {
  enterHallRun();
  suspendRun();
  resumeRun();
  expect(run.area, 'still in the hall').toEqual({ at: 'hall' });
  expect(level.floor, 'still a level of its own').toBe(-1);
  expect(run.bld, 'still no building').toBeUndefined();
  expect(enemies.length, 'still no enemy').toBe(0);
  expect(level.portals.map(p => p.kind).sort(), 'the gates are made again').toEqual(hallGateKinds());
});

test('the hall has eight room gates clear of each other', () => {
  enterHallRun();
  const rooms = level.portals.filter(p => p.kind === 'room');
  expect(rooms.length, 'a gate for each boss').toBe(8);
  expect(
    rooms.map(p => p.boss),
    'the order BOSS_ROOM_ORDER lists the rooms in',
  ).toEqual(BOSS_ROOM_ORDER);
  expect(new Set(rooms.map(p => p.boss)).size, 'one gate for each boss').toBe(8);
  expect(level.portals.length, 'the way out, the terminal and the eight rooms').toBe(10);
  level.portals.forEach((a, i) =>
    level.portals.slice(i + 1).forEach(b => {
      expect(
        Math.hypot(a.x - b.x, a.z - b.z),
        `the gates at (${a.x}, ${a.z}) and (${b.x}, ${b.z}) are clear of each other`,
      ).toBeGreaterThanOrEqual(2 * PORTAL.clearR);
    }),
  );
});

test("a beaten room's gate is dim", () => {
  enterHallRun(['crusher']);
  const gate = (kind: BossKind) => level.portals.find(p => p.kind === 'room' && p.boss === kind)!;
  expect(gate('crusher').color, 'the beaten room').toBe(COLOR.dim);
  BOSS_ROOM_ORDER.filter(kind => kind !== 'crusher').forEach(kind =>
    expect(gate(kind).color, `${kind} is not beaten yet`).toBe(COLOR.violet),
  );
});

test('a boss room stage brings the hall back', () => {
  enterHallRun();
  run.stage = bossStageOf(BOSS_AREA_START_TIER);
  run.area = { at: 'hall' };
  startStage();
  expect(run.stage, 'back at the depth start').toBe(firstStageOf(BOSS_AREA_START_TIER));
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('boss area off: the boss area depth keeps the building', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  tick(2);
  expect(planOf(BOSS_AREA_START_TIER * PER).area, 'no boss area').toBe(false);
  expect(run.bld, 'the building is there').toBeTruthy();
  expect(level.floor, 'a floor of it').toBeGreaterThanOrEqual(0);
});

test('boss area off: the room gates stay out of the run', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  tick(2);
  expect(run.bld, 'the building is there').toBeTruthy();
  expect(level.floor, 'a floor of it').toBeGreaterThanOrEqual(0);
  expect(
    level.portals.filter(p => p.kind === 'room' || p.kind === 'hall'),
    'no room gates',
  ).toEqual([]);
});

// ---- the boss rooms: the lowest floor of the boss's sector building, entered by hand (no gate yet) ----
// a run in the crusher's room: the same start as the hall, then the room placed on the run by hand
function enterRoom() {
  enterHallRun();
  devSeed(1234); // the building is the same on every run of the file
  run.area = { at: 'room', boss: 'crusher' };
  startStage();
}
// the floor one up from the lowest, and the link that joins them
function upFromLowest(): { n: number; up: number } {
  const lowest = building!.plans.length - 1,
    n = building!.links.findIndex(l => l.lower === lowest || l.upper === lowest),
    l = building!.links[n]!;
  return { n, up: l.lower === lowest ? l.upper : l.lower };
}
const outsideHall = () => level.roomOf[tileIndex(player.x, player.z)] !== level.hall!.room;

test('a boss room starts on the lowest floor of its sector building, outside the hall door', () => {
  enterRoom();
  expect(run.stage, "the depth's boss stage").toBe(bossStageOf(BOSS_AREA_START_TIER));
  expect(run.bld?.tier, 'the building of the depth').toBe(BOSS_AREA_START_TIER);
  expect(run.bld?.boss, "the room's boss").toBe('crusher');
  expect(level.biome.code, "the crusher's sector").toBe('FORGE');
  expect(level.floor, 'the lowest floor').toBe(building!.plans.length - 1);
  expect(level.hall, 'its boss hall').toBeTruthy();
  expect(outsideHall(), 'starts in the corridor outside the hall door').toBe(true);
  const door = level.hall!.door,
    toDoor = yawToward(tileCenter(door % W) - player.x, tileCenter(Math.floor(door / W)) - player.z);
  expect(Math.abs(wrapAngle(player.yaw - toDoor)), 'facing the hall door').toBeLessThan(1e-6);
  expect(save.suspend?.run.area, 'the checkpoint keeps the room').toEqual({ at: 'room', boss: 'crusher' });
  tick(1);
  expect(stateIs('play'), 'the room starts in play, not in the boss fight').toBe(true);
  expect(boss, 'the boss has not come yet').toBeNull();
});

test('a run suspended in a boss room resumes in the same room, at the same entrance', () => {
  enterRoom();
  const seed = run.bld!.seed,
    at = tileIndex(player.x, player.z);
  suspendRun();
  resumeRun();
  expect(tileIndex(player.x, player.z), 'the same tile').toBe(at);
  expect(run.area, 'still the same room').toEqual({ at: 'room', boss: 'crusher' });
  expect(run.bld?.boss, 'the same building for the boss').toBe('crusher');
  expect(run.bld?.seed, 'the same seed').toBe(seed);
  expect(level.floor, 'the lowest floor again').toBe(building!.plans.length - 1);
  expect(level.hall, 'its boss hall').toBeTruthy();
  expect(outsideHall(), 'the same entrance outside the door').toBe(true);
});

test('a run suspended after going up a floor resumes at the lowest floor entrance', () => {
  enterRoom();
  const { n, up } = upFromLowest(),
    at = tileIndex(player.x, player.z);
  crossToFloor(n, up);
  expect(run.bld!.floor, 'one floor up').toBe(up);
  suspendRun();
  resumeRun();
  expect(run.bld!.floor, 'back on the lowest floor').toBe(building!.plans.length - 1);
  expect(run.bld!.at, 'at the hall door, not the stairwell').toBe(-1);
  expect(tileIndex(player.x, player.z), 'the same tile as the room began on').toBe(at);
});

test('going back to the hall from a boss room drops the building', () => {
  enterRoom();
  expect(run.bld, 'in the building first').toBeTruthy();
  run.area = { at: 'hall' };
  startStage();
  expect(run.bld, 'the building is dropped').toBeUndefined();
  expect(level.floor, 'a level of its own').toBe(-1);
  expect(level.rooms.length, 'the hall map').toBe(1);
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('a death in a boss room goes to the result screen and clears the checkpoint', () => {
  enterRoom();
  endRun('dead');
  expect(stateIs('result'), 'the result screen').toBe(true);
  expect(save.suspend, 'no checkpoint left').toBeNull();
});

test('boss area off: a room placed by hand is ignored and the building path stays', () => {
  devBossArea(false);
  goBase();
  devSeed(1234);
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  tick(2);
  run.area = { at: 'room', boss: 'crusher' };
  startStage();
  expect(run.stage, 'the depth start as before').toBe(firstStageOf(BOSS_AREA_START_TIER));
  expect(level.floor, 'the top floor').toBe(0);
  expect(level.hall, 'no boss hall').toBeNull();
});

// ---- the gates between the hall and a room ----
// a gate set down clear of the player, armed (data/level.ts PORTAL: armTime and clearR), then stepped on: two tiles
// from the player, away from the boss hall door in a room and two tiles south in the hall
function stepOnGate(kind: PortalKind, boss?: BossKind) {
  const h = level.hall,
    k = h
      ? tileIndex(
          player.x + (player.x - tileCenter(h.door % W)),
          player.z + (player.z - tileCenter(Math.floor(h.door / W))),
        )
      : tileIndex(player.x, player.z) + W * 2;
  makePortal(tileCenter(k % W), tileCenter(Math.floor(k / W)), 0xffffff, kind, '', boss);
  const gate = level.portals[level.portals.length - 1];
  tick(70); // PORTAL.armTime (1 s) with the player clear of the gate
  expect(gate.clear, 'the gate is armed before it is stepped on').toBe(true);
  putOnTile(k);
  tick(2);
  return gate; // a test can see that it was stepped on even when nothing moved
}

test('a gate into a boss room starts the room', () => {
  enterHallRun();
  stepOnGate('room', 'crusher');
  expect(run.area, "the run is in the crusher's room").toEqual({ at: 'room', boss: 'crusher' });
  expect(level.biome.code, "the crusher's sector").toBe(BOSS_ROOMS.crusher);
  expect(level.hall, 'its boss hall').toBeTruthy();
});

test('a beaten room can be entered and fought again', () => {
  enterHallRun(['crusher']);
  const gate = level.portals.find(p => p.kind === 'room' && p.boss === 'crusher')!;
  tick(70); // PORTAL.armTime (1 s) with the player clear of the gate
  putOnTile(tileIndex(gate.x, gate.z));
  // the room gates stand on tile edges, so putOnTile lands two metres off: step onto the gate itself
  player.x = gate.x;
  player.z = gate.z;
  tick(2);
  expect(run.area, "the run is in the crusher's room again").toEqual({ at: 'room', boss: 'crusher' });
  expect(run.bld?.beaten, 'the boss is not beaten in this run yet').toBeFalsy();
  expect(boss, 'the boss has not come yet').toBeNull();
});

test('a gate back to the hall drops the building', () => {
  enterRoom();
  expect(run.bld, 'in the building first').toBeTruthy();
  stepOnGate('hall');
  expect(run.area, 'back in the hall').toEqual({ at: 'hall' });
  expect(level.rooms.length, 'the hall map').toBe(1);
  expect(run.bld, 'the building is dropped').toBeUndefined();
});

test('a gate that moves nothing leaves the run as it was', () => {
  enterHallRun();
  const hallLevel = level;
  expect(returnToHall(), 'the hall has no gate back').toBe(false);
  expect(run.area, 'still the hall').toEqual({ at: 'hall' });
  expect(level, 'the level is left as it was').toBe(hallLevel);
  expect(enterBossRoom('crusher'), 'into the room').toBe(true);
  const roomLevel = level;
  expect(run.area, 'now in the room').toEqual({ at: 'room', boss: 'crusher' });
  expect(enterBossRoom('crusher'), 'already in that room').toBe(false);
  expect(run.area, 'still the same room').toEqual({ at: 'room', boss: 'crusher' });
  expect(level, 'the level is left as it was').toBe(roomLevel);
});

test('boss area off: the gates leave the run as it was', () => {
  enterHallRun();
  devBossArea(false);
  const hallLevel = level;
  const gate = stepOnGate('room', 'crusher');
  expect(gate.clear, 'the gate was stepped on and turned the player away').toBe(false);
  expect(run.area, 'still the hall').toEqual({ at: 'hall' });
  expect(level, 'the level is not made again').toBe(hallLevel);
});

// ---- a room's boss: its rewards, its record and the way back ----
// the pickups of a kind lying on the floor being played
const lying = (kind: Pickup['kind']) => query<Pickup>('pickup').filter(p => p.kind === kind).length;
// the room's boss comes in, its entrance is over (200 frames), and it goes down
function beatRoomBoss() {
  spawnBoss(run.bld!.boss);
  tick(200);
  hurtEnemy(boss!, boss!.hp + 1, false);
  tick(2);
}

test("the crusher's gate is one of the hall's room gates", () => {
  enterHallRun();
  const rooms = level.portals.filter(p => p.kind === 'room');
  expect(rooms.length, 'eight gates into the rooms').toBe(8);
  const into = rooms.find(p => p.boss === 'crusher')!;
  expect(into, "the crusher's room has a gate").toBeTruthy();
  expect(into.boss, "the crusher's room").toBe('crusher');
});

test('a boss room drops the same rewards as a boss, but no shortcut', () => {
  enterRoom();
  const kills = save.bossKills,
    shortcut = save.shortcut,
    cleared = save.records.cleared;
  beatRoomBoss();
  expect(save.records.bossArea!.beaten, 'the room is kept in the save').toEqual(['crusher']);
  expect(run.bosses, 'the boss is in the run').toContain('crusher');
  expect(save.bossKills, 'the kill counts').toBe(kills + 1);
  expect(lying('chip'), 'a chip').toBeGreaterThan(0);
  expect(lying('kit'), 'a kit').toBeGreaterThan(0);
  expect(lying('weapon'), 'a weapon').toBeGreaterThan(0);
  expect(save.shortcut, 'no shortcut').toBe(shortcut);
  expect(save.records.cleared, 'the last boss is still not down').toBe(cleared);
});

test("a boss room's record stays one after beating it again", () => {
  enterRoom();
  beatRoomBoss();
  const kills = save.bossKills,
    bosses = run.bosses!.filter(k => k === 'crusher').length;
  expect(returnToHall(), 'back to the hall').toBe(true);
  expect(enterBossRoom('crusher'), 'into the room again').toBe(true);
  const chips = lying('chip'),
    weapons = lying('weapon');
  beatRoomBoss();
  expect(save.records.bossArea!.beaten, 'one entry for the room').toEqual(['crusher']);
  expect(save.bossKills, 'the second kill is not counted').toBe(kills);
  expect(run.bosses!.filter(k => k === 'crusher').length, 'no second entry in the run').toBe(bosses);
  expect(lying('chip'), 'no chip the second time').toBe(chips);
  expect(lying('weapon'), 'no weapon the second time').toBe(weapons);
});

test('the beaten count comes only the first time', () => {
  enterRoom();
  beatRoomBoss();
  expect(el('#toast').textContent, 'the count after the first room').toBe(
    t('boss.beatenCount', { n: 1, max: BOSS_ROOM_ORDER.length }),
  );
  el('#toast').textContent = ''; // cleared, so a count shown again would be seen
  returnToHall();
  enterBossRoom('crusher');
  beatRoomBoss();
  expect(el('#toast').textContent, 'no count when the room is beaten again').not.toBe(
    t('boss.beatenCount', { n: 1, max: BOSS_ROOM_ORDER.length }),
  );
});

test("the hall has only the way back after a room's boss", () => {
  enterRoom();
  beatRoomBoss();
  expect(
    level.portals.map(p => p.kind),
    'only the gate to the hall',
  ).toEqual(['hall']);
});

test('a beaten room stays beaten after death and resume', () => {
  enterRoom();
  beatRoomBoss();
  suspendRun();
  resumeRun();
  expect(save.records.bossArea!.beaten, 'after a resume').toEqual(['crusher']);
  endRun('dead');
  expect(save.records.bossArea!.beaten, 'after a death').toEqual(['crusher']);
});

test('a run suspended after leaving the beaten room resumes with its gates', () => {
  enterRoom();
  beatRoomBoss();
  const { n, up } = upFromLowest();
  crossToFloor(n, up);
  suspendRun();
  resumeRun();
  expect(run.bld!.floor, 'back on the lowest floor').toBe(building!.plans.length - 1);
  expect(run.bld!.at, 'at the hall door').toBe(-1);
  expect(
    level.portals.map(p => p.kind),
    'only the gate to the hall',
  ).toEqual(['hall']);
});

test("a room's boss down is in the stored save at once, for a page killed right then", () => {
  enterRoom();
  beatRoomBoss();
  const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
  expect(stored.records.bossArea.beaten, 'the room is recorded').toContain(run.bld!.boss);
  expect(stored.suspend.run.bld.beaten, 'the checkpoint has the boss down').toBe(true);
});

test("a room's boss is a boss in level_start and boss_defeated", () => {
  TRACK_LOG.length = 0;
  enterRoom();
  const starts = TRACK_LOG.filter(e => e.name === 'level_start');
  expect(starts[starts.length - 1]!.params.target, 'the room boss is named').toBe('crusher');
  const defeated = () => TRACK_LOG.filter(e => e.name === 'boss_defeated' && e.params.target === 'crusher').length;
  beatRoomBoss();
  expect(defeated(), 'the first kill').toBe(1);
  returnToHall();
  enterBossRoom('crusher');
  beatRoomBoss();
  expect(defeated(), 'the second kill too').toBe(2);
});

test('the boss floor of a room has no other enemies, caches or lockdown', () => {
  enterRoom();
  const hallRoom = level.hall!.room,
    lowest = building!.plans.length - 1,
    other = level.rooms.findIndex((_, i) => i !== hallRoom);
  expect(enemies.filter(e => e.room !== hallRoom && !e.dead).length, 'no enemy outside the boss room').toBe(0);
  expect(lying('weapon'), 'no weapon cache').toBe(0);
  building!.lockdown = { floor: lowest, room: other };
  expect(lockdownAhead(lowest, other), 'no lockdown on the boss floor').toBe(false);
});

test('a boss room gives no pre-boss supply', () => {
  enterRoom();
  expect(run.bld!.supplied, 'the supply is marked given').toBe(true);
  expect(supplyChips(), 'so no chip is owed').toBe(0);
});

test("returning to the hall after the room's boss heals to full", () => {
  enterRoom();
  beatRoomBoss();
  player.hp = 1;
  expect(returnToHall(), 'back to the hall').toBe(true);
  expect(player.hp, 'full HP').toBe(player.maxHp);
});

test('boss area off: a building boss keeps its rewards and shortcut', () => {
  devBossArea(false);
  enterBuilding();
  goToFloor(building!.plans.length - 1);
  const tier = stageInfo(run.stage).tier,
    kills = save.bossKills;
  spawnBoss(run.bld!.boss);
  tick(200);
  hurtEnemy(boss!, boss!.hp + 1, false);
  tick(2);
  expect(level.portals.map(p => p.kind).sort(), 'forward and back as before').toEqual(
    expect.arrayContaining(['extract', 'next']),
  );
  expect(
    level.portals.some(p => p.kind === 'hall'),
    'no room gate',
  ).toBe(false);
  expect(save.bossKills, 'the kill counts').toBe(kills + 1);
  expect(run.bosses, 'the boss is in the run').toContain(run.bld!.boss);
  expect(save.shortcut, 'the shortcut opens').toBe(tier + 1);
});

// ---- the way on from the boss area, and the start depth's gate ----
test('the hall has a gate onward once TITAN is down', () => {
  enterHallRun();
  run.area = { at: 'hall' };
  startStage();
  expect(
    level.portals.some(p => p.kind === 'next'),
    'no gate onward before TITAN is down',
  ).toBe(false);
  save.records.cleared = true;
  startStage();
  expect(level.portals.filter(p => p.kind === 'next').length, 'the gate onward once TITAN is down').toBe(1);
});

test('the onward gate leaves the boss area for the next depth', () => {
  enterHallRun();
  save.records.cleared = true;
  run.area = { at: 'hall' };
  startStage();
  const gate = level.portals.find(p => p.kind === 'next')!;
  tick(70); // PORTAL.armTime (1 s) with the player clear of the gate
  putOnTile(tileIndex(gate.x, gate.z));
  tick(2);
  expect(run.stage, 'the first stage of the next depth').toBe(firstStageOf(BOSS_AREA_START_TIER + 1));
  expect(run.area, 'the boss area is left').toBeUndefined();
  expect(run.bld, "the next depth's building").toBeTruthy();
});

test('the start depth stops at the boss area until TITAN is down', () => {
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = 55;
  save.startTier = 55;
  save.records.cleared = false;
  clampStartTier();
  expect(save.startTier, 'no start past the gate before TITAN is down').toBe(BOSS_AREA_START_TIER);
  startRun(true);
  expect(run.startTier, 'the run starts at the boss area too').toBe(BOSS_AREA_START_TIER);
  goBase();
  save.records.cleared = true;
  save.startTier = 55;
  clampStartTier();
  expect(save.startTier, 'TITAN down: the shortcut is the limit again').toBe(55);
  expect(startTierMax(), 'and the limit is the shortcut').toBe(55);
});

test('dying below the boss area comes back to the hall', () => {
  enterHallRun();
  save.records.cleared = true;
  save.shortcut = 52;
  save.startTier = 52;
  startRun(true);
  endRun('dead');
  startRun(true);
  tick(2); // the supply chip picks closed
  expect(run.startTier, 'the last milestone below D53').toBe(BOSS_AREA_START_TIER);
  expect(run.area, 'the hall again').toEqual({ at: 'hall' });
  expect(run.bld, 'not a floor of a building').toBeUndefined();
});

test('boss area off: the start depth is not limited and the hall is not used', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = 55;
  save.startTier = BOSS_AREA_START_TIER;
  expect(startTierMax(), 'the shortcut is the limit without the flag').toBe(55);
  startRun(true);
  tick(2); // the supply chip picks closed
  expect(run.startTier, 'the boss area depth as chosen').toBe(BOSS_AREA_START_TIER);
  expect(run.bld, 'a building, not the hall').toBeTruthy();
  expect(run.area, 'no boss area place').toBeUndefined();
});

// ---- the bot in the boss area: the gate it takes in the hall, and what it records in a room ----
test('hallGate: the first room not beaten yet', () => {
  enterHallRun();
  const gate = hallGate(level.portals, []);
  expect(gate?.kind, 'a room gate').toBe('room');
  expect(gate?.boss, 'the first room not beaten').toBe(BOSS_ROOM_ORDER[0]);
});

test('hallGate: the one room left after the other seven', () => {
  enterHallRun();
  const left = BOSS_ROOM_ORDER[BOSS_ROOM_ORDER.length - 1]!;
  expect(hallGate(level.portals, BOSS_ROOM_ORDER.slice(0, -1))?.boss, 'the room still to beat').toBe(left);
});

test('hallGate: the way out once all eight rooms are beaten', () => {
  enterHallRun();
  expect(hallGate(level.portals, BOSS_ROOM_ORDER)?.kind, 'the way out (TITAN has no gate yet)').toBe('extract');
});

test('hallGate: the way forward once it is open', () => {
  enterHallRun();
  const at = level.portals[0]!;
  makePortal(at.x, at.z, 0xffffff, 'next', '');
  expect(hallGate(level.portals, [])?.kind, 'the way forward comes first').toBe('next');
});

test('the bot records the room it is in, from entering it', () => {
  enterRoom();
  const bot = createBot(BOT_STYLES.rusher!);
  setBot(bot);
  try {
    tick(2);
  } finally {
    setBot(null);
  }
  expect(bot.stats.rooms.length, 'one room so far').toBe(1);
  const room = bot.stats.rooms[0]!;
  expect(room.boss, "the room's boss").toBe('crusher');
  expect(room.sec, 'some time in the room').toBeGreaterThan(0);
  expect(room.bossSec, 'the boss has not come yet').toBe(0);
});

test('the bot keeps off the other gates on its way to a terminal', () => {
  enterHallRun();
  const terminal = level.portals.find(p => p.kind === 'terminal')!;
  // a room it does not mean to take, on the straight way from the player to the terminal
  makePortal(terminal.x - T, terminal.z, 0xffffff, 'room', '', 'phantom');
  player.x = terminal.x - 2 * T;
  player.z = terminal.z;
  tick(70); // PORTAL.armTime (1 s) with the player clear of the gate
  const bot = createBot(BOT_STYLES.rusher!);
  setBot(bot);
  try {
    // (tick closes a screen, so the terminal's screen opening is where this stops)
    for (let i = 0; i < 1200 && state === 'play' && run.area?.at === 'hall'; i++) tick(1);
  } finally {
    setBot(null);
  }
  expect(run.area, 'still in the hall').toEqual({ at: 'hall' });
  expect(state, 'the terminal reached').not.toBe('play');
});

// ---- the maps: the boss area's hall and rooms have the 2D page only ----
test('a boss room has no 3D page, even when the 3D map key is pressed', () => {
  enterRoom();
  tick(1);
  toggleMap3D();
  expect(map3dWanted(), 'the 3D page is not asked for').toBe(false);
  expect(map3d.on, 'nor turned on').toBe(false);
  tick(2);
  expect(el('#bigmap3d').hidden, 'the 3D canvas stays hidden').toBe(true);
  expect(map3dOpen(), 'the 3D page is not on screen').toBe(false);
});

test('a boss room: the 3D canvas stays hidden even with the big map open and its 3D page asked for', () => {
  enterRoom();
  tick(1);
  toggleMap();
  map3d.on = true; // (no key gets here: this is the frame's own check)
  tick(2);
  const hidden = el('#bigmap3d').hidden;
  map3d.on = false;
  toggleMap(); // close it for the next test
  expect(hidden).toBe(true);
});

test('a boss room: a tap cycles the 2D map and then closes, skipping the 3D page', () => {
  enterRoom();
  tick(1);
  toggleMap();
  expect(bigmap.hidden, 'the 2D map is open').toBe(false);
  expect(map3d.on).toBe(false);
  cycleMap();
  expect(bigmap.hidden, 'the big map is closed, not on a 3D page').toBe(true);
  expect(map3d.on).toBe(false);
});

test('a boss room: the PC hint does not name the 3D map key', () => {
  enterRoom();
  tick(1);
  toggleMap();
  expect(el('#mapHint').textContent).not.toContain(keyText('map3d', 0));
  toggleMap(); // close it for the next test
});

test('an ordinary building still gets the 3D page on the second tap', () => {
  enterBuilding();
  cycleMap();
  cycleMap();
  expect(map3dWanted(), 'the 3D page is on').toBe(true);
  cycleMap(); // closed for the next test
});

test('boss area off: a room placed by hand keeps the building, and its 3D page', () => {
  devBossArea(false);
  enterRoom();
  tick(1);
  cycleMap();
  cycleMap();
  expect(map3dWanted(), 'the 3D page is on, as in any building').toBe(true);
  cycleMap(); // closed for the next test
});
