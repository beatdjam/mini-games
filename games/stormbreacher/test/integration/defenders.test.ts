// The posted defenders of M1's two sectors (SB-2015): they hold their cover while their line stands, step out to fire,
// and run for the next line's cover when a milestone breaks it. The open map keeps the run free of the hedgehog lines,
// so a test can read the run itself; the posts are the hand map's own.
import { describe, expect, test } from 'vitest';
import { DEFENDER_POSTS, DEFENDER_START_POSTS, DEFENDER_TUNE } from '../../src/data/defenders.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import {
  isEnemyBullet,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { clearInfantry, newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

// No props, so a run to the next cover is not pushed about by the hedgehogs still standing; the posts stay the map's.
const OPEN_MAP = { ...M1B_HAND, props: [], mines: [] };

function run(game: GameModel, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, idle, DT);
}

function wave(game: GameModel, name: string) {
  return game.enemies.filter(enemy => enemy.wave === name);
}

function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

describe('the defenders’ posts', () => {
  test('both sectors are put out on their posts from the first step', () => {
    const game = newPlayGame(OPEN_MAP);
    const line1 = wave(game, 'line1-hold');
    const pillbox = wave(game, 'pillbox-hold');
    expect(line1).toHaveLength(DEFENDER_START_POSTS['line1-hold'].length);
    expect(pillbox).toHaveLength(DEFENDER_START_POSTS['pillbox-hold'].length);
    line1.forEach((enemy, i) => {
      const post = DEFENDER_POSTS[DEFENDER_START_POSTS['line1-hold'][i]];
      expect(enemy.post).toBe(DEFENDER_START_POSTS['line1-hold'][i]);
      expect({ x: enemy.x, z: enemy.z }).toEqual({ x: post.x, z: post.z });
      expect(enemy.fallback).toBeNull();
    });
    pillbox.forEach((enemy, i) => {
      const post = DEFENDER_POSTS[DEFENDER_START_POSTS['pillbox-hold'][i]];
      expect(enemy.post).toBe(DEFENDER_START_POSTS['pillbox-hold'][i]);
      expect({ x: enemy.x, z: enemy.z }).toEqual({ x: post.x, z: post.z });
      expect(enemy.fallback).toBeNull();
    });
  });

  test('while its line holds a defender only steps out from its post, and it never walks toward the mech', () => {
    const game = newPlayGame(OPEN_MAP);
    game.armor = 1e9;
    // close to the first line's posts, with the line still closed; no prop hides the open map's lines
    game.mech.x = 0;
    game.mech.z = 100;
    game.mech.yaw = 0;
    const line1 = wave(game, 'line1-hold');
    const start = line1.map(enemy => ({ x: enemy.x, z: enemy.z, to: Math.hypot(enemy.x - 0, enemy.z - 100) }));
    let shots = false;
    for (let i = 0; i < 12 / DT; i++) {
      step(game, idle, DT);
      if (game.bullets.some(bullet => isEnemyBullet(bullet) && bullet.enemy === 'grunt')) shots = true;
    }
    line1.forEach((enemy, i) => {
      const post = DEFENDER_POSTS[enemy.post as number];
      // it stays at the post's hiding place or its step out point, and it has not come closer to the mech
      const reach = Math.hypot(post.peekX - post.x, post.peekZ - post.z) + DEFENDER_TUNE.arrive + 0.1;
      expect(Math.hypot(enemy.x - post.x, enemy.z - post.z)).toBeLessThanOrEqual(reach);
      expect(Math.hypot(enemy.x - 0, enemy.z - 100)).toBeGreaterThanOrEqual(start[i].to - reach);
      expect(enemy.fallback).toBeNull();
    });
    // they do fire from the stepped-out place
    expect(shots).toBe(true);
  });
});

describe('a milestone breaks the line', () => {
  test('line 1’s breach starts the whole first line at once, and it runs to the next cover and holds there', () => {
    const game = newPlayGame(OPEN_MAP);
    game.armor = 1e9;
    game.mech.x = 40;
    game.mech.z = 150;
    game.mech.yaw = 0;
    const line1 = wave(game, 'line1-hold');
    const pillbox = wave(game, 'pillbox-hold');
    const starts = line1.map(enemy => ({ x: enemy.x, z: enemy.z }));

    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    line1.forEach((enemy, i) => {
      const next = DEFENDER_POSTS[enemy.post as number].next;
      expect(next).not.toBeNull();
      expect(enemy.fallbackPost).toBe(next);
      expect(enemy.fallback).not.toBeNull();
      expect(enemy.fallbackHold).toBeGreaterThan(0);
      // the first line starts, the second waits for its own milestone
      expect(pillbox[i].fallback).toBeNull();
    });

    // all of them run landward in the first frames, their backs to the mech
    run(game, 30);
    line1.forEach((enemy, i) => {
      expect(enemy.z).toBeLessThan(starts[i].z);
      if (enemy.z < starts[i].z) expect(enemy.yaw).not.toBeNaN();
    });

    // they reach the next line's posts and become its holders
    const far = Math.max(...line1.map(enemy => Math.hypot(enemy.fallback?.x ?? 0, enemy.fallback?.z ?? 0)));
    expect(far).toBeGreaterThan(0);
    for (let i = 0; i < 30 / DT && line1.some(enemy => enemy.fallback !== null); i++) step(game, idle, DT);
    line1.forEach(enemy => {
      expect(enemy.fallback).toBeNull();
      expect(enemy.fallbackPost).toBeNull();
      expect(DEFENDER_POSTS[enemy.post as number].line).toBe('line2');
      expect(enemy.holdLeft).toBeGreaterThan(0);
    });
  });

  test('on the hand map the run reaches the next cover through the line it leaves', () => {
    const game = newPlayGame(M1B_HAND);
    const line1 = wave(game, 'line1-hold');
    const next = line1.map(enemy => DEFENDER_POSTS[enemy.post as number].next);
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    // the hand map's hedgehogs stand in the way; a posted defender runs through its own line (SB-2015)
    for (let i = 0; i < 20 / DT && line1.some(enemy => enemy.fallback !== null); i++) step(game, idle, DT);
    line1.forEach((enemy, i) => {
      expect(enemy.fallback).toBeNull();
      expect(enemy.post).toBe(next[i]);
      expect(DEFENDER_POSTS[enemy.post as number].line).toBe('line2');
    });
  });

  test('line 2’s breach starts the posts behind it, and they run to the cover before the pillboxes', () => {
    const game = newPlayGame(OPEN_MAP);
    game.armor = 1e9;
    game.mech.x = 0;
    game.mech.z = 90;
    game.mech.yaw = 0;
    const line1 = wave(game, 'line1-hold');
    const pillbox = wave(game, 'pillbox-hold');
    // line 1's breach put its holders on line 2's posts
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    for (let i = 0; i < 20 / DT && line1.some(enemy => enemy.fallback !== null); i++) step(game, idle, DT);
    expect(line1.every(enemy => DEFENDER_POSTS[enemy.post as number].line === 'line2')).toBe(true);

    sendToScript(game, { kind: 'blast', id: 'l2-a' });
    line1.forEach(enemy => {
      const next = DEFENDER_POSTS[enemy.post as number].next;
      expect(next).not.toBeNull();
      expect(enemy.fallbackPost).toBe(next);
      expect(enemy.fallback).not.toBeNull();
    });
    // the pillbox line's own holders wait for the pillboxes
    expect(pillbox.every(enemy => enemy.fallback === null)).toBe(true);

    for (let i = 0; i < 20 / DT && line1.some(enemy => enemy.fallback !== null); i++) step(game, idle, DT);
    line1.forEach(enemy => {
      expect(enemy.fallback).toBeNull();
      expect(DEFENDER_POSTS[enemy.post as number].line).toBe('pillbox');
      expect(enemy.post).toBeGreaterThanOrEqual(15);
    });
  });

  test('the first pillbox starts only the posts around it; the second starts the rest of the line', () => {
    const game = newPlayGame(OPEN_MAP);
    const pillbox = wave(game, 'pillbox-hold');
    const line1 = wave(game, 'line1-hold');
    const target = game.targets.find(entry => entry.id === 'pillbox-1');
    if (!target) throw new Error('the map has no pillbox-1');
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: 'pillbox-1' });

    pillbox.forEach(enemy => {
      const post = DEFENDER_POSTS[enemy.post as number];
      expect(enemy.fallback !== null).toBe(post.firstRout);
    });
    // the first line still stands
    expect(line1.every(enemy => enemy.fallback === null)).toBe(true);

    const second = game.targets.find(entry => entry.id === 'pillbox-2');
    if (!second) throw new Error('the map has no pillbox-2');
    second.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: 'pillbox-2' });
    expect(pillbox.every(enemy => enemy.fallback !== null)).toBe(true);
    // the first line's own milestone is still to come
    expect(line1.every(enemy => enemy.fallback === null)).toBe(true);
  });

  test('a checkpoint and a suspend keep the posts and the run', () => {
    const game = newPlayGame(OPEN_MAP);
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    run(game, 30);
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');

    const held = (model: GameModel) =>
      [...wave(model, 'line1-hold'), ...wave(model, 'pillbox-hold')].map(enemy => ({
        id: enemy.id,
        post: enemy.post,
        fallbackPost: enemy.fallbackPost,
        fallback: enemy.fallback,
        holdOut: enemy.holdOut,
        holdLeft: enemy.holdLeft,
      }));
    const before = held(game);
    expect(before.some(enemy => enemy.fallbackPost !== null)).toBe(true);

    const retried = retryFromCheckpoint(game);
    expect(held(retried)).toEqual(before);

    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    if (!back) throw new Error('the suspend was not read');
    expect(held(back)).toEqual(before);
  });
});

describe('a posted enemy on its own', () => {
  test('it steps out, fires and hides again without walking off the post', () => {
    const game = newPlayGame(OPEN_MAP);
    game.armor = 1e9;
    game.mech.x = 0;
    game.mech.z = 130;
    game.mech.yaw = 0;
    const enemy = wave(game, 'line1-hold')[0];
    const post = DEFENDER_POSTS[enemy.post as number];
    const start = { x: enemy.x, z: enemy.z };
    expect(start).toEqual({ x: post.x, z: post.z });
    expect(enemy.holdOut).toBe(false);
    // the hide runs first: no shot before its seconds
    let firstShot = -1;
    for (let i = 0; i < 12 / DT && firstShot < 0; i++) {
      step(game, idle, DT);
      if (game.bullets.some(bullet => isEnemyBullet(bullet) && bullet.enemy === 'grunt')) firstShot = i;
    }
    expect(firstShot).toBeGreaterThanOrEqual(Math.floor(DEFENDER_TUNE.hideSec * 60) - 2);
    // and it has come back behind cover at least once since
    let hidAgain = false;
    for (let i = 0; i < 12 / DT && !hidAgain; i++) {
      step(game, idle, DT);
      if (!enemy.holdOut) hidAgain = true;
    }
    expect(hidAgain).toBe(true);
    const reach = Math.hypot(post.peekX - post.x, post.peekZ - post.z) + DEFENDER_TUNE.arrive;
    expect(Math.hypot(enemy.x - post.x, enemy.z - post.z)).toBeLessThanOrEqual(reach);
    expect(enemy.post).toBe(DEFENDER_START_POSTS['line1-hold'][0]);
  });

  test('a new enemy that has a post runs with its back to the mech and fires nothing on the way', () => {
    const game = newPlayGame(OPEN_MAP);
    // this test reads its own runner alone: the infantry's support fire would suppress it and slow its run (SB-2240)
    clearInfantry(game);
    const post = DEFENDER_POSTS[5];
    const enemy = newEnemy('run-1', 'line1-hold', 'grunt', 0, 120);
    enemy.awake = true;
    enemy.fallback = { x: post.x, z: post.z };
    enemy.fallbackPost = 5;
    game.enemies = [enemy];
    game.mech.x = 0;
    game.mech.z = 170;
    game.mech.yaw = 0;
    game.armor = 1e9;
    let shotOnTheWay = false;
    for (let i = 0; i < 30 / DT && enemy.fallback !== null; i++) {
      step(game, idle, DT);
      if (game.bullets.some(bullet => isEnemyBullet(bullet))) shotOnTheWay = true;
      if (enemy.fallback !== null) expect(enemy.z).toBeLessThan(120 + 0.01);
    }
    expect(enemy.fallback).toBeNull();
    expect(enemy.post).toBe(5);
    expect(shotOnTheWay).toBe(false);
  });
});
