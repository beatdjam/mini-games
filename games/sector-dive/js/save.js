'use strict';
// Save data: defaults, loading with conversions, persisting
const SAVE_KEY = 'sector-dive-v1';
const basicW = id => ({ id, r: 0, basic: true });
const defaultSave = () => ({ bits: 0, up: { hp: 0, dmg: 0, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0 }, unlocked: { pistol: true },
  loadout: [basicW('pistol'), null], stash: [], shortcut: 0, startTier: 0,
  best: 0, runs: 0, bossKills: 0, bossSeen: {}, stageV: 2, mods: {}, canReboot: false, pres: { count: 0, pts: 0, up: { gain: 0, hp: 0, funds: 0, relic: 0, choice: 0 } },
  settings: { lang: null, autofire: isTouch, assist: 'weak', sens: 1, bgm: 0.6, sfx: 1, leftFire: true, stickDash: false, layout: {} } });
function loadSave() {
  const d = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') {
      const out = Object.assign(d, s, { up: Object.assign(d.up, s.up || {}), unlocked: Object.assign(d.unlocked, s.unlocked || {}),
        settings: Object.assign(d.settings, s.settings || {}),
        pres: Object.assign(d.pres, s.pres || {}, { up: Object.assign(d.pres.up, (s.pres && s.pres.up) || {}) }) });
      if (typeof out.settings.assist === 'boolean') out.settings.assist = out.settings.assist ? 'weak' : 'off';
      if (!Array.isArray(out.loadout)) out.loadout = [basicW(s.weapon && out.unlocked[s.weapon] ? s.weapon : 'pistol'), null];
      if (!out.loadout[0]) out.loadout[0] = basicW('pistol');
      if (!Array.isArray(out.stash)) out.stash = [];
      // stageV 2: depths went from 4 floors + boss to 3 floors + boss; convert stage numbers saved under the old layout
      if (s.stageV !== 2) {
        const conv = st => Math.floor(st / 5) * 4 + [0, 1, 2, 2, 3][st % 5];
        if (out.best) out.best = conv(out.best - 1) + 1;
        if (out.suspend && out.suspend.run) out.suspend.run.stage = conv(out.suspend.run.stage);
        out.stageV = 2;
      }
      return out;
    }
  } catch (e) {}
  return d;
}
let save = loadSave();
setLang(save.settings.lang || defaultLang());
// the engine's audio reads its volumes from these
function syncVolumes() { sfxVolume = save.settings.sfx ?? 1; bgmVolume = save.settings.bgm ?? 0.6; }
syncVolumes();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
