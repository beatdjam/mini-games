// Smoke test for Sector Dive Extended, screens and input: music, result, share, analytics, pause, the maps, key bindings and the wake lock. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { distXZ, el } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { SFX, actx, audioInit } from '@engine/audio/audio.ts';
import {
  MUSIC_STYLES,
  musicState,
  musicInit,
  musicVolume,
  playStep,
  setMusic,
  setMusicMix,
} from '@engine/audio/music.ts';
import { H, T, W, grid, hasLOS, tileIndex } from '@engine/world/tiles.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { SETTINGS } from '@engine/ui/settings.ts';
import { actionDown, bindKey, changedBindings, exportBindings, keysOf, resetBindings } from '@engine/ui/keymap.ts';
import { encodeStore } from '@engine/core/store.ts';
import { isTouch } from '@engine/core/util.ts';
import { applyLayout, buttonLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { BOSS_META, BOSS_ORDER } from '../src/data/bosses.ts';
import { SAVE_KEY, defaultSave, exportSave, importSave, persist, save } from '../src/core/save.ts';
import { perkName } from '../src/core/rules.ts';
import { level, reveal, roomSpot } from '../src/world/level.ts';
import { addPickup, enemies, removeEnemyMesh, spawnEnemy } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { newWeapon } from '../src/actors/weapons.ts';
import { stageInfo } from '../src/core/stages.ts';
import { shotId } from '../src/actors/firing.ts';
import { KEY_ACTIONS } from '../src/data/controls.ts';
import { setKeyBindings } from '../src/core/progress.ts';
import { applyKeyBindings, controlState } from '../src/ui/input.ts';
import { bigmap, cycleMap, map3dWanted, toggleMap, toggleMap3D } from '../src/ui/hud.ts';
import { changeLang, renderGuide } from '../src/ui/settings.ts';
import { endRun, goBase, startPractice, startRun } from '../src/flow/run.ts';
import { building } from '../src/world/building.ts';
import { setState, show, state } from '../src/flow/state.ts';
import { resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { pause, statsHTML } from '../src/screens/pause.ts';
import { markers } from '../src/ui/minimap.ts';
import { renderBase } from '../src/screens/base.ts';
import { shareData, shareText } from '../src/ui/share.ts';
import { time, updatePickups } from '../src/flow/update.ts';
import { LOOP, runSystems } from '@engine/core/loop.ts';
import { TRACK_LOG } from '@engine/core/analytics.ts';
import { FEEDBACK_FORM } from '@engine/core/feedback.ts';
import { stateIs, tick, bootGame, goToFloor, enterBuilding } from './helpers.ts';

beforeAll(bootGame);

test('map: an enemy on a seen tile shows, asleep or awake; one on a tile not seen does not', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('crawler', cx, cz, -1, 1),
    shown = () => markers(false).some(m => m.shape === 'dot' && m.x === e.x && m.z === e.z);
  e.active = false; // asleep
  level.seen[tileIndex(e.x, e.z)] = 1;
  expect(shown(), 'asleep on a seen tile').toBe(true);
  level.seen[tileIndex(e.x, e.z)] = 0;
  expect(shown(), 'on a tile not seen').toBe(false);
  endRun('abandon');
});
test('music: every style and its boss arrangement can be scheduled', () => {
  audioInit();
  musicInit();
  if (!musicState.bus) throw new Error('music bus');
  Object.keys(MUSIC_STYLES).forEach(name => {
    [false, true].forEach(boss => {
      if (boss && name === 'BASE') return;
      setMusic(name, boss);
      if (!musicState.st || musicState.name !== name + (boss ? ':boss' : '')) throw new Error('setMusic ' + name);
      for (let k = 0; k < 64; k++) playStep(musicState.st, k, actx!.currentTime + k * 0.01, 0.1);
      const mix = boss ? 'boss' : name === 'BASE' ? 'base' : 'explore';
      if (musicState.mix !== mix) throw new Error('music mix ' + name + ' ' + musicState.mix);
    });
  });
  setMusic('NOWHERE'); // a name with no style plays DATA, mixed like a sector
  if (musicState.st !== MUSIC_STYLES.DATA || musicState.mix !== 'explore') throw new Error('music fallback');
  setMusicMix('combat');
  setMusicMix('explore');
  musicVolume(0.4);
  musicVolume(1);
  Object.keys(SFX).forEach(k => SFX[k]()); // every effect builds its node graph without errors
});
test('feedback: hidden without a form; with one, the result screen opens it filled in', () => {
  const keepForm = { ...FEEDBACK_FORM },
    keepOpen = window.open,
    opened: string[] = [];
  window.open = ((u: string) => {
    opened.push(u);
    return null;
  }) as typeof window.open;
  try {
    FEEDBACK_FORM.url = '';
    goBase();
    if (!el('#btnFeedbackBase').hidden) throw new Error('feedback shown without a form');
    Object.assign(FEEDBACK_FORM, {
      url: 'https://docs.google.com/forms/d/e/test/viewform',
      game: '1',
      build: '2',
      info: '3',
    });
    startRun();
    tick(5);
    run.perks = ['split', 'split', 'rapid+'];
    endRun('extract');
    if (el('#btnFeedbackRes').hidden) throw new Error('feedback button on the result screen');
    el('#btnFeedbackRes').click();
    const info = new URL(opened[0]!).searchParams.get('entry.3') || '';
    if (
      !info.includes('result=extract') ||
      !info.includes('splitx2') ||
      !info.includes('rapid+') ||
      new URL(opened[0]!).searchParams.get('entry.1') !== 'sector-dive-ex'
    )
      throw new Error('feedback info ' + info);
    goBase();
    if (el('#btnFeedbackBase').hidden) throw new Error('feedback link on the base screen');
    el('#btnFeedbackBase').click();
    if (!(new URL(opened[1]!).searchParams.get('entry.3') || '').startsWith('from=base'))
      throw new Error('feedback base info');
  } finally {
    Object.assign(FEEDBACK_FORM, keepForm);
    window.open = keepOpen;
  }
  goBase();
  startRun();
  tick(5);
});
test('result chips: counted, most first, order folded underneath', () => {
  goBase();
  startRun();
  tick(5);
  run.perks = ['rapid', 'split', 'split+', 'split', 'overload+'];
  endRun('extract');
  const want = t('res.chips', {
    n: 5,
    list: [
      t('common.countRare', { name: perkName('split'), n: 3, r: 1 }),
      perkName('rapid'),
      perkName('overload+'),
    ].join(t('common.sep')),
  });
  if (el('#resChips').textContent !== want) throw new Error('result chips ' + el('#resChips').textContent);
  if (
    el('#resOrder').hidden ||
    el<HTMLDetailsElement>('#resOrder').open ||
    el('#resOrderList').textContent !== run.perks.map(perkName).join(t('common.sep'))
  )
    throw new Error('result chip order');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#resOrder').hidden) throw new Error('chip order after practice');
  goBase();
  startRun();
  tick(5);
});
test('current stats: rarity damage, real magazine, chips counted', () => {
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('launcher', 2);
  player.magMul = 2.5;
  run.perks = ['mag', 'mag', 'mag+'];
  const rows = new Map(
    [...new DOMParser().parseFromString(statsHTML(), 'text/html').querySelectorAll('.reslist div')].map(d => [
      d.querySelector('dt')!.textContent,
      d.querySelector('dd')!.textContent,
    ]),
  );
  const pc = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const dmg = rows.get(t('stats.dmg')),
    mag = rows.get(t('stats.mag')),
    html = statsHTML();
  player.weapons[player.cur] = keep;
  player.magMul = 1;
  if (
    dmg !== pc(player.dmgMul * player.lvlDmg * 1.55 - 1) ||
    mag !== pc(5 / 3 - 1) /* 3 rounds x (1 + 1.5 x 0.5) = 5.25 -> 5, not +150% */ ||
    !html.includes(t('common.countRare', { name: perkName('mag'), n: 3, r: 1 }))
  )
    throw new Error('stats ' + [dmg, mag]);
});
test('share: shown after a real run, hidden after practice; text fits X', () => {
  goBase();
  startRun();
  tick(5);
  run.bosses = ['watcher'];
  run.perks = ['overload', 'overload', 'rapid+'];
  endRun('extract');
  if (
    el('#btnShare').hidden ||
    !shareData ||
    shareData.bosses[0] !== BOSS_META.watcher.short ||
    shareData.chips[0] !== t('common.count', { name: perkName('overload'), n: 2 })
  )
    throw new Error('share data');
  if (!shareText(shareData).includes('#SectorDiveEX') || !shareText(shareData).includes(BOSS_META.watcher.short))
    throw new Error('share text');
  el('#btnShare').click();
  if (el('#sharePanel').hidden) throw new Error('share panel on PC');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#btnShare').hidden) throw new Error('share shown after practice');
  // a deep run beats many bosses: the post counts them per kind and stays within X's 280 (CJK counts 2, the URL 23)
  const xLen = (s: string) => {
    const [body, url] = [s.slice(0, s.lastIndexOf('\n')), s.slice(s.lastIndexOf('\n') + 1)];
    return [...body].reduce((n, c) => n + (c.charCodeAt(0) > 0x10ff ? 2 : 1), 0) + 1 + (url ? 23 : 0);
  };
  const many = {
    ...shareData!,
    bosses: Array.from({ length: 30 }, (_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
  };
  const keepLang = lang,
    lens: number[] = [];
  for (const code of ['ja', 'en']) {
    changeLang(code);
    const s = shareText({
      ...many,
      bosses: many.bosses.map((_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
    });
    lens.push(xLen(s));
    if (!s.includes('30')) throw new Error('boss count missing ' + s);
  }
  changeLang(keepLang);
  if (lens.some(n => n > 280)) throw new Error('share text too long ' + lens);
  goBase();
  startRun();
  tick(5);
  // switching the language from the pause screen rewrites the stats panel and the stage label
  {
    const other = lang === 'ja' ? 'en' : 'ja';
    pause();
    changeLang(other);
    const ok =
      el('#pauseChips').innerHTML.includes(t('stats.title')) &&
      el('#stageLbl').textContent!.includes(stageInfo(run.stage).biome.name);
    changeLang(keepLang);
    show(null);
    setState('play');
    if (!ok) throw new Error('pause screen kept the old language');
  }
});
test('analytics: a dive, a result, a share and a practice send their events', () => {
  TRACK_LOG.length = 0;
  goBase();
  startRun();
  tick(5);
  endRun('extract');
  el('#btnShare').click();
  goBase();
  startRun();
  tick(5);
  endRun('dead');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (TRACK_LOG.some(e => e.params.game !== 'sector-dive-ex')) throw new Error('analytics: game id missing');
  const ev = TRACK_LOG.map(e => e.name + ':' + (e.params.result ?? e.params.method ?? ''));
  for (const want of [
    'dive_start:',
    'level_start:',
    'level_end:extract',
    'level_end:dead',
    'share:panel',
    'practice_start:',
    'practice_end:abandon',
  ])
    if (!ev.includes(want)) throw new Error('analytics event ' + want + ' / ' + ev.slice(-12).join(' '));
  if (
    TRACK_LOG.some(
      e =>
        (e.name === 'level_start' || e.name === 'level_end') &&
        e.params.stage_role !== 'normal' &&
        e.params.stage_role !== 'boss',
    )
  )
    throw new Error('analytics: stage_role');
});
test('pause: abandoning the dive asks once', () => {
  goBase();
  startRun();
  tick(5);
  pause();
  const btn = el<HTMLButtonElement>('#btnAbandon');
  expect(btn.textContent).toBe(t('pause.abandon'));
  btn.click();
  expect(stateIs('pause'), 'the first click only asks').toBe(true);
  expect(btn.textContent).toBe(t('pause.abandonGo'));
  // leaving the pause screen and coming back starts over
  show(null);
  setState('play');
  pause();
  expect(btn.textContent).toBe(t('pause.abandon'));
  btn.click();
  btn.click();
  expect(stateIs('result')).toBe(true);
});
test('touch layout editor: the edit is kept', () => {
  const s0 = buttonLayout('dash').s;
  openLayoutEditor('base');
  if (!stateIs('layout') || el('#layoutBar').hidden) throw new Error('layout editor open');
  document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click();
  document.querySelector<HTMLElement>('[data-lbact="done"]')!.click();
  if (state !== 'base' || Math.abs(buttonLayout('dash').s - (s0 + 0.1)) > 1e-9)
    throw new Error('layout editor ' + buttonLayout('dash').s);
  save.settings.layout = {};
  applyLayout();
});

// ---- PC key bindings: every action runs through the engine's bindings (engine/src/ui/keymap.ts) ----
describe('key bindings', () => {
  // from the page body, so the event passes the document and the window like a real key press does
  const keyEvent = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
    document.body.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
  const press = (code: string) => {
    keyEvent('keydown', code);
    keyEvent('keyup', code);
  };
  // how far holding `code` for a moment moves the player
  const moveBy = (code: string) => {
    const x = player.x,
      z = player.z;
    keyEvent('keydown', code);
    tick(8);
    keyEvent('keyup', code);
    return distXZ({ x, z }, player);
  };
  // a play state where weapons, kits and the map can be tried
  const freshPlay = () => {
    startRun();
    tick(5);
    clearWorld('pickup');
    player.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)];
    player.cur = 0;
    player.bag = [null, null, null, null];
    player.reloadT = 0;
    controlState.dashReq = false;
  };
  const toPlay = () => {
    show(null);
    setState('play');
  };
  const guideTexts = () => Array.from(document.querySelectorAll('#guide dd'), d => d.textContent);
  const keyCell = (action: string, slot: number) =>
    el('#keysList').querySelector<HTMLElement>(`[data-key-action="${action}"][data-slot="${slot}"]`)!;
  const savedKeys = () => JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').settings.keys;

  beforeEach(() => {
    setFireHeld(false); // the file's start-up holds fire; these tests press fire by key
    resetBindings();
    freshPlay();
  });

  test('the default bindings are the keys the game always had', () => {
    const want: Record<string, string[]> = {
      forward: ['KeyW', 'ArrowUp'],
      back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      dash: ['Space', 'ShiftLeft'],
      fire: ['KeyF'],
      swap: ['KeyQ'],
      slot1: ['Digit1'],
      slot2: ['Digit2'],
      reload: ['KeyR'],
      stow: ['KeyE'],
      equip: ['KeyG'],
      kit: ['KeyH'],
      map: ['KeyM'],
      map3d: ['KeyN'],
      bag: ['Tab', 'KeyI'],
      pause: ['Escape', 'KeyP'],
    };
    expect(KEY_ACTIONS.map(a => a.id)).toEqual(Object.keys(want));
    for (const [action, keys] of Object.entries(want)) expect(keysOf(action), action).toEqual(keys);
    expect(save.settings.keys, 'a new save keeps no keys: every action is on its default').toEqual({});
  });

  test('default keys: move, fire, dash, weapons, reload and kit work as before', () => {
    freshPlay();
    for (const code of ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'])
      expect(moveBy(code), code).toBeGreaterThan(0.2);
    expect(moveBy('KeyZ'), 'an unbound key').toBeLessThan(0.01);
    // fire: F held shoots
    const shots = shotId;
    keyEvent('keydown', 'KeyF');
    tick(3);
    keyEvent('keyup', 'KeyF');
    expect(shotId).toBeGreaterThan(shots);
    // dash: Space, either Shift
    for (const code of ['Space', 'ShiftLeft', 'ShiftRight']) {
      controlState.dashReq = false;
      press(code);
      expect(controlState.dashReq, code).toBe(true);
    }
    // switch weapon: Q, 2, 1
    press('KeyQ');
    expect(player.cur).toBe(1);
    press('KeyQ');
    expect(player.cur).toBe(0);
    press('Digit2');
    expect(player.cur).toBe(1);
    press('Digit1');
    expect(player.cur).toBe(0);
    // reload
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT).toBeGreaterThan(0);
    player.reloadT = 0;
    // med kit
    player.kits = 1;
    player.hp = player.maxHp - 50;
    press('KeyH');
    expect(player.kits).toBe(0);
    // map
    expect(bigmap.hidden).toBe(true);
    press('KeyM');
    expect(bigmap.hidden).toBe(false);
    press('KeyM');
    expect(bigmap.hidden).toBe(true);
    // the 3D map (in a building): N opens it, N again turns back to the 2D page, M closes
    if (level.floor >= 0) {
      press('KeyN');
      expect(map3dWanted()).toBe(true);
      press('KeyN');
      expect(!bigmap.hidden && !map3dWanted()).toBe(true);
      press('KeyM');
      expect(bigmap.hidden).toBe(true);
    }
  });

  test('default keys: pick up (G swap, E to bag), bag (Tab, I, Esc closes) and pause (Esc, P)', () => {
    freshPlay();
    player.weapons = [newWeapon('pistol', 0, true), null];
    addPickup('weapon', player.x, player.z, { w: newWeapon('rail', 1) });
    updatePickups(0);
    press('KeyG');
    expect(player.weapons[1]?.id).toBe('rail');
    addPickup('weapon', player.x, player.z, { w: newWeapon('smg', 1) });
    updatePickups(0);
    press('KeyE');
    expect(player.bag.filter(Boolean).length).toBe(1);
    // the bag: Tab and I open and close, Esc closes
    for (const [open, close] of [
      ['Tab', 'Tab'],
      ['KeyI', 'KeyI'],
      ['Tab', 'Escape'],
      ['KeyI', 'Escape'],
    ] as const) {
      toPlay();
      press(open);
      expect(state, open).toBe('bag');
      press(close);
      expect(state, `${open} then ${close}`).toBe('play');
    }
    // pause: Esc and P
    for (const code of ['Escape', 'KeyP']) {
      toPlay();
      press(code);
      expect(state, code).toBe('pause');
    }
    toPlay();
    // Tab's browser default (moving focus) is stopped, in play and in the bag
    expect(keyEvent('keydown', 'Tab')).toBe(false);
    keyEvent('keyup', 'Tab');
    expect(keyEvent('keydown', 'Tab')).toBe(false);
    keyEvent('keyup', 'Tab');
    toPlay();
  });

  test('the controls list is built from the bindings', () => {
    renderGuide();
    const g = guideTexts();
    expect(g[0]).toBe('W A S D');
    expect(g[2]).toContain('F');
    expect(g[3]).toBe(
      lang === 'ja'
        ? 'Space / Shift（スタミナ消費、短い無敵。押し続けると走る）'
        : 'Space / Shift (uses stamina, brief invulnerability; hold to keep running)',
    );
    expect(g[5]).toContain('Q / 1 / 2');
    expect(g[7]).toBe('H');
    expect(g[8]).toBe('Tab / I');
    expect(g[10]).toBe('Esc / P');
    for (const code of ['ja', 'en']) {
      changeLang(code);
      expect(
        guideTexts().some(x => /[{}]/.test(x ?? '')),
        `${code}: a placeholder is left`,
      ).toBe(false);
    }
    changeLang('ja');
  });

  test('changing a binding: the new key works, the old key does nothing', () => {
    freshPlay();
    bindKey('reload', 0, 'KeyV');
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT, 'the old key').toBe(0);
    press('KeyV');
    expect(player.reloadT, 'the new key').toBeGreaterThan(0);
    player.reloadT = 0;
    bindKey('forward', 0, 'KeyT');
    expect(moveBy('KeyW'), 'the old move key').toBeLessThan(0.01);
    expect(moveBy('KeyT'), 'the new move key').toBeGreaterThan(0.2);
    expect(moveBy('ArrowUp'), 'the other key of the action stays').toBeGreaterThan(0.2);
    // firing and the bag follow too
    bindKey('fire', 0, 'KeyJ');
    const shots = shotId;
    keyEvent('keydown', 'KeyF');
    tick(3);
    keyEvent('keyup', 'KeyF');
    expect(shotId, 'the old fire key').toBe(shots);
    keyEvent('keydown', 'KeyJ');
    tick(3);
    keyEvent('keyup', 'KeyJ');
    expect(shotId, 'the new fire key').toBeGreaterThan(shots);
    bindKey('bag', 0, 'KeyB');
    press('Tab');
    expect(state, 'Tab no longer opens the bag').toBe('play');
    press('KeyB');
    expect(state).toBe('bag');
    press('KeyB');
    expect(state, 'the new key closes it').toBe('play');
    expect(actionDown('forward')).toBe(false);
    resetBindings();
  });

  test('a key given to a second action leaves the first', () => {
    freshPlay();
    expect(bindKey('kit', 0, 'KeyR')).toBe('reload');
    expect(keysOf('reload')).toEqual([]);
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT, 'R is the kit now').toBe(0);
    player.kits = 1;
    player.hp = player.maxHp - 50;
    press('KeyR');
    expect(player.kits).toBe(0);
    resetBindings();
  });

  test('Esc pauses even when the pause keys are changed', () => {
    freshPlay();
    toPlay();
    bindKey('pause', 0, 'KeyK');
    expect(keysOf('pause')).toEqual(['KeyK', 'KeyP']);
    press('Escape');
    expect(state, 'Esc still pauses').toBe('pause');
    toPlay();
    press('KeyK');
    expect(state, 'and so does the new key').toBe('pause');
    resetBindings();
    toPlay();
  });

  test('the controls list shows the changed keys', () => {
    bindKey('reload', 0, 'KeyV');
    bindKey('dash', 1, 'KeyC');
    renderGuide();
    const g = guideTexts();
    expect(g[4]).toMatch(/^V/);
    expect(g[3]).toMatch(/^Space \/ C/);
    resetBindings();
    renderGuide();
  });

  test('the key settings dialog: click a key, press a new one; Esc cancels; reset', () => {
    toPlay();
    show(null);
    setState('base');
    renderBase();
    const open = document.querySelector<HTMLElement>('[data-settings="base"] [data-action="keys"]');
    expect(open, 'the button is in the settings').not.toBeNull();
    open!.click();
    expect(el('#dlgKeys').hidden).toBe(false);
    expect(el('#keysList').querySelectorAll('.keyrow').length).toBe(KEY_ACTIONS.length);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(keyCell('reload', 1).textContent).toBe(t('keys.none'));
    // click, then the cell waits
    keyCell('reload', 0).click();
    expect(keyCell('reload', 0).textContent).toBe(t('keys.press'));
    // Esc cancels: nothing changes, and the dialog stays open
    expect(keyEvent('keydown', 'Escape')).toBe(false);
    keyEvent('keyup', 'Escape');
    expect(el('#dlgKeys').hidden).toBe(false);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(keysOf('reload')).toEqual(['KeyR']);
    // a key press is the answer, and it does nothing else (Tab would have moved the focus, Space would have clicked)
    keyCell('reload', 0).click();
    expect(keyEvent('keydown', 'KeyV')).toBe(false);
    keyEvent('keyup', 'KeyV');
    expect(keysOf('reload')).toEqual(['KeyV']);
    expect(keyCell('reload', 0).textContent).toBe('V');
    expect(savedKeys().reload).toEqual(['KeyV']);
    // the second slot
    keyCell('reload', 1).click();
    keyEvent('keydown', 'Tab');
    keyEvent('keyup', 'Tab');
    expect(keysOf('reload')).toEqual(['KeyV', 'Tab']);
    expect(keysOf('bag'), 'Tab was taken from the bag').toEqual(['KeyI']);
    expect(el('#keysMsg').textContent).toBe(
      t('keys.moved', { key: 'Tab', action: KEY_ACTIONS.find(a => a.id === 'bag')!.name }),
    );
    // the right-hand Shift is the Shift key
    keyCell('dash', 1).click();
    keyEvent('keydown', 'ShiftRight');
    keyEvent('keyup', 'ShiftRight');
    expect(keysOf('dash')).toEqual(['Space', 'ShiftLeft']);
    // the held key that clicked a cell (auto-repeat) is not an answer
    keyCell('map', 0).click();
    keyEvent('keydown', 'Enter', true);
    expect(keysOf('map')).toEqual(['KeyM']);
    keyEvent('keydown', 'KeyN');
    keyEvent('keyup', 'KeyN');
    expect(keysOf('map')).toEqual(['KeyN']);
    // the controls list shows the new key
    expect(guideTexts()[4]).toMatch(/^V/);
    // reset
    el('#btnKeysReset').click();
    expect(save.settings.keys, 'nothing is changed: nothing is saved').toEqual({});
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('bag')).toEqual(['Tab', 'KeyI']);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(savedKeys()).toEqual({});
    // Esc closes the dialog when nothing is waiting, and so does the button
    keyEvent('keydown', 'Escape');
    keyEvent('keyup', 'Escape');
    expect(el('#dlgKeys').hidden).toBe(true);
    open!.click();
    el('#btnKeysClose').click();
    expect(el('#dlgKeys').hidden).toBe(true);
  });

  test('the dialog also opens from the pause screen', () => {
    freshPlay();
    pause();
    const open = document.querySelector<HTMLElement>('[data-settings="pause"] [data-action="keys"]');
    expect(open).not.toBeNull();
    open!.click();
    expect(el('#dlgKeys').hidden).toBe(false);
    keyCell('map', 0).click();
    keyEvent('keydown', 'Escape'); // cancel, not "resume" or anything else
    keyEvent('keyup', 'Escape');
    expect(state).toBe('pause');
    el('#btnKeysClose').click();
    expect(state).toBe('pause');
    toPlay();
  });

  test('the key settings button is for PC only', () => {
    const item = SETTINGS.items.find(i => i.key === 'keys')!;
    const layout = SETTINGS.items.find(i => i.key === 'layout')!;
    expect(item.show!()).toBe(!isTouch);
    expect(item.show!()).toBe(!layout.show!());
  });

  test('the bindings are saved, read back at start-up, and old saves get the defaults', () => {
    bindKey('reload', 0, 'KeyV');
    bindKey('stow', 1, 'KeyC');
    setKeyBindings(changedBindings()); // what the dialog does after a change
    persist();
    expect(save.settings.keys, 'only the changed actions are saved').toEqual({
      reload: ['KeyV'],
      stow: ['KeyE', 'KeyC'],
    });
    // a restart: the engine starts on defaults and takes the save's bindings
    const stored = exportBindings();
    expect(savedKeys()).toEqual(save.settings.keys);
    resetBindings();
    applyKeyBindings();
    expect(exportBindings()).toEqual(stored);
    expect(keysOf('reload')).toEqual(['KeyV']);
    // through a save code
    const code = exportSave();
    resetBindings();
    expect(importSave(code)).toBe(true);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyV']);
    expect(keysOf('stow')).toEqual(['KeyE', 'KeyC']);
    // a save from before the key settings existed: default keys
    const old = JSON.parse(JSON.stringify(save));
    delete old.settings.keys;
    expect(importSave(encodeStore('SDX1', old))).toBe(true);
    expect(save.settings.keys).toEqual(defaultSave().settings.keys);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('forward')).toEqual(['KeyW', 'ArrowUp']);
    // a save with a broken value does not stop the others
    old.settings.keys = { reload: 'KeyV', kit: ['KeyU'], nothing: ['KeyZ'] };
    expect(importSave(encodeStore('SDX1', old))).toBe(true);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('kit')).toEqual(['KeyU']);
  });

  test('wiping the data puts the keys back to the defaults', () => {
    bindKey('reload', 0, 'KeyV');
    setKeyBindings(changedBindings());
    persist();
    el('#btnWipe').click();
    el('#btnWipeGo').click();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(save.settings.keys).toEqual({});
    expect(guideTexts()[4]).toMatch(/^R/);
  });
});

// the screen stays awake for the whole dive (practice and resume too) and is let go on the base and result screens
describe('screen wake lock', () => {
  const held: { released: boolean }[] = []; // the locks the stand-in navigator.wakeLock handed out
  const heldNow = () => held.filter(l => !l.released).length;
  const settle = () => new Promise(r => setTimeout(r, 0)); // lets the request promises resolve
  beforeAll(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          const lock = {
            released: false,
            release: () => {
              lock.released = true;
              return Promise.resolve();
            },
          };
          held.push(lock);
          return Promise.resolve(lock);
        },
      },
    });
    goBase();
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
  test('startRun on, endRun off', async () => {
    startRun();
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
  });
  test('startPractice on, endRun off', async () => {
    startPractice('watcher');
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
  });
  test('suspendRun off, resumeRun on, back at the base off', async () => {
    startRun();
    await settle();
    expect(heldNow()).toBe(1);
    suspendRun();
    await settle();
    expect(save.suspend).not.toBeNull();
    expect(heldNow()).toBe(0);
    resumeRun();
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
    await settle();
    expect(heldNow()).toBe(0);
  });
});

test('map: what lies behind a wall stays off the map until the player has a line to it', () => {
  enterBuilding();
  const b = building!,
    mid = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T];
  let checked = 0;
  b.plans.forEach((plan, floor) => {
    goToFloor(floor);
    // a corridor tile to stand on, and a floor tile inside the map's reveal circle (4 tiles) with a wall between the
    // two. (From a corridor: standing in a room opens the whole room, whatever is in the way.) Any floor has such a
    // pair: wherever two corridors, or a corridor and a room, lie a wall apart
    let from = -1,
      hidden = -1;
    for (let q = 0; q < W * H && hidden < 0; q++) {
      if (grid[q] !== 1 || level.roomOf[q]! >= 0) continue;
      for (let dj = -4; dj <= 4 && hidden < 0; dj++)
        for (let di = -4; di <= 4 && hidden < 0; di++) {
          const k = q + dj * W + di;
          if (di * di + dj * dj > 16 || k < 0 || k >= W * H || grid[k] !== 1) continue;
          if (hasLOS(...mid(q), ...mid(k))) continue;
          from = q;
          hidden = k;
        }
    }
    if (hidden < 0) return;
    checked++;
    plan.seen.fill(0);
    reveal(from % W, Math.floor(from / W));
    expect(plan.seen[from], 'the tile stood on is on the map').toBe(1);
    expect(plan.seen[hidden], `floor ${floor}: the tile behind the wall is not`).toBe(0);
    reveal(hidden % W, Math.floor(hidden / W));
    expect(plan.seen[hidden], 'standing on it puts it on the map').toBe(1);
  });
  expect(checked, 'every floor has a wall with floor on both sides').toBe(b.plans.length);
  goToFloor(0);
});
test('big map: the map key opens and closes it, the 3D map key turns to the 3D page, a tap cycles', () => {
  enterBuilding();
  goToFloor(0);
  const flat = el<HTMLCanvasElement>('#bigmap'),
    solid = el<HTMLCanvasElement>('#bigmap3d'),
    pages = () => [flat.hidden, solid.hidden];
  expect(pages()).toEqual([true, true]);
  // the keys
  toggleMap();
  tick(2);
  expect(pages()).toEqual([false, true]);
  expect(el('#mapHint').hidden).toBe(false);
  toggleMap3D();
  tick(2);
  expect(pages(), 'the 3D page lies over the 2D one').toEqual([false, false]);
  expect(map3dWanted()).toBe(true);
  // the game stands still while the 3D map is up: the loop is in the map's own mode, where no system of the dive runs
  expect(LOOP.mode()).toBe('map');
  const clock = time,
    enemyAt = enemies
      .filter(e => !e.dead)
      .map(e => `${e.x},${e.z}`)
      .join();
  enemies.forEach(e => {
    e.active = true;
  });
  for (let k = 0; k < 30; k++) runSystems(1 / 60);
  expect(time, 'the dive clock has not moved').toBe(clock);
  expect(
    enemies
      .filter(e => !e.dead)
      .map(e => `${e.x},${e.z}`)
      .join(),
    'nor has any enemy',
  ).toBe(enemyAt);
  expect(solid.hidden, 'the map is still drawn').toBe(false);
  // while the 3D page is up the move keys turn the map: the player stands still
  const at = [player.x, player.z].join();
  joy.y = -1;
  tick(20);
  joy.y = 0;
  expect(isTouch || [player.x, player.z].join() === at, 'no walking with the 3D map up (PC)').toBe(true);
  // more of the building seen: the map is made again without trouble
  building!.plans.forEach(p => p.seen.fill(1));
  tick(2);
  toggleMap3D();
  tick(2);
  expect(pages(), 'back to the 2D page').toEqual([false, true]);
  toggleMap3D();
  toggleMap();
  tick(2);
  expect(pages(), 'the map key closes it from the 3D page too').toEqual([true, true]);
  expect(map3dWanted()).toBe(false);
  expect(LOOP.mode(), 'the game runs again').toBe('play');
  // straight to the 3D page from closed
  toggleMap3D();
  tick(2);
  expect(pages()).toEqual([false, false]);
  toggleMap();
  // a tap (touch): closed, 2D, 3D, closed
  cycleMap();
  tick(2);
  expect(pages()).toEqual([false, true]);
  cycleMap();
  tick(2);
  expect(pages()).toEqual([false, false]);
  cycleMap();
  tick(2);
  expect(pages()).toEqual([true, true]);
});
