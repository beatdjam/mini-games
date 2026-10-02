import type { Biome, Snapshot, Weapon, WeaponItem } from '../data/types.ts';
import { $, clamp, el, isTouch, pick, rand, randi, shuffle } from '../../../../engine/core/util.ts';
import { clearStore, prefGet, prefSet } from '../../../../engine/core/store.ts';
import { t } from '../../../../engine/core/i18n.ts';
import { audioInit, sfx } from '../../../../engine/audio/audio.ts';
import { musicVolume, setMusic } from '../../../../engine/audio/music.ts';
import { camera, gun } from '../../../../engine/render/render.ts';
import { T, W, floorY } from '../../../../engine/world/tiles.ts';
import { banner, enterFs, isFs, toast } from '../../../../engine/ui/ui.ts';
import { exitLock, releaseInputs, requestLock } from '../../../../engine/ui/input.ts';
import { applyLayout } from '../../../../engine/ui/touchlayout.ts';
import { MOD_CAP_PER_DEPTH, MOD_PLUS_MAX, MOD_RARITY_COST, RARITY, WEAPONS, WEAPON_ORDER, modPlusCost } from '../data/weapons.ts';
import { EYE } from '../data/level.ts';
import { ELITE_TYPES, ENEMY_TUNE } from '../data/enemies.ts';
import { BOSS_META, BOSS_ORDER } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import { PER, PRES_UP, STASH_MAX, TUNE, UPGRADES } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { _ } from '../data/music.ts';
import { SAVE_KEY, basicW, defaultSave, exportSave, importSave, importSaveCheck, persist, save, setSave } from '../system/save.ts';
import { basicNow, chipSummary, presCost, modOf, modPlusCap, peakDepth, perkIdOf, perkName, pickDrop, PRES_DIFF_CAP, presMul, presMulOf, prog, readiness, readyAfterReboot, sellValue } from '../system/rules.ts';
import { buildLevel, exitIdx, makePortal, portals, randomTileIn, roomCount, roomSpot, rooms, seen, startIdx } from '../world/level.ts';
import { addPickup, boss, enemies, spawnEnemy } from '../world/entities.ts';
import { P, critChance, curW, diffOf, isBossStage, kitHealAmount, magSize, newPlayer, rollWeapon, run, setPlayer, setRun, stageInfo, stageLabel, tierLabel, wDmgMul, wName, wOpts, wText, weaponStats, wo } from '../actors/player.ts';
import { spawnBoss } from '../actors/bosses/common.ts';
import { normalizeWeapons, useKit } from '../ui/input.ts';
import { bigmap, renderSettings, updateHint, weaponHud } from '../ui/hud.ts';
import { hideShare, prepShare } from '../ui/share.ts';
import { prepFeedback, showBaseFeedback } from '../ui/feedback.ts';
import { tickClock } from './update.ts';
import { track } from '../../../../engine/core/analytics.ts';
// ================= game flow =================
export let state: string = 'base';
export function setState(s: string) { state = s; }
export const screens = ['#scrBase', '#scrPerk', '#scrPause', '#scrResult', '#scrBag'];
export function show(id: string | null) { screens.forEach(s => { $(s).hidden = s !== id; }); }
export function setPlayUI(on: boolean) { $('#hud').hidden = !on; $('#touch').hidden = !on; gun.visible = on; if (!on) bigmap.hidden = true; }

export function startRun() {
  audioInit();
  if (isTouch && !isFs()) enterFs();
  if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(() => {});
  const tier = clamp(save.startTier, 0, save.shortcut);
  setPlayer(newPlayer(save.loadout));
  const risked = save.loadout.filter(w => w && !w.basic).length;
  // non-basic weapons leave the base: they come back only on extraction
  save.loadout = save.loadout.map((w, i) => w && w.basic ? w : (i === 0 ? basicW('pistol') : null));
  setRun({ stage: tier * PER, kills: 0, bits: 0, perks: [], bosses: [], startTier: tier, route: shuffle(BIOMES.map((_, i) => i)) });
  save.runs++; persist();
  track('dive_start', { start_level: tier + 1, item_name: save.loadout[0]?.id ?? '' });
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage();
  const queue: string[] = [];
  for (let k = 0; k < save.up.chip; k++) queue.push(t('perk.carry'));
  for (let k = 0; k < tier; k++) queue.push(t('perk.supply'));
  const total = queue.length;
  // after the loadout / shortcut chips are picked, re-save the checkpoint so they are part of it
  // a walked depth gives about 8 chips, so one supply chip per skipped depth left deep starts hopeless: each supply pick
  // counts supplyTimes times instead
  const next = () => {
    if (!queue.length) { checkpoint(); return; }
    const kind = queue.shift()!;
    openPerk(t('perk.queue', { kind, i: total - queue.length, n: total }), 'loadout', next, kind === t('perk.supply') ? TUNE.supplyTimes : 1);
  };
  next();
  if (!total) requestLock(); // with chips to pick first, the lock is requested when the last one is chosen
  if (!total) toast(t(isTouch ? 'run.firstTouch' : 'run.firstDesk'), 4200);
  if (risked) setTimeout(() => toast(t('run.risked'), 3000), total ? 0 : 4400);
}
export function startStage() {
  const si = stageInfo(run.stage), b = si.biome, isArena = isBossStage(run.stage);
  const fade = $('#fade'); fade.style.transition = 'none'; fade.style.opacity = 1;
  requestAnimationFrame(() => { fade.style.transition = ''; fade.style.opacity = 0; });
  const bossKind = isArena ? (run.forceBoss || pick(b.bosses)) : null;
  if (!run.practice) track('level_start', { level: si.tier + 1, stage: si.sub + 1, stage_type: b.code, stage_role: isArena ? 'boss' : 'normal', target: bossKind ?? '' });
  buildLevel(b, isArena, bossKind);
  const diff = diffOf(run.stage);
  if (isArena) {
    P.x = W * T / 2; P.z = 14.5 * T; P.yaw = 0; P.pitch = 0.08;
    const stageAt = run.stage;
    setTimeout(() => { if (run && run.stage === stageAt && !boss && !portals.length && state !== 'base' && state !== 'result') spawnBoss(bossKind!); }, 1200);
  } else {
    const [sx, sz] = roomSpot(rooms[startIdx]); P.x = sx; P.z = sz;
    const [ex, ez] = roomSpot(rooms[exitIdx]); P.yaw = Math.atan2(-(ex - sx), -(ez - sz)); P.pitch = 0;
    makePortal(ex, ez, 0xffc24a, 'next', t(si.sub === PER - 2 ? 'run.toBoss' : 'run.nextArea'));
    rooms.forEach((r, idx) => {
      if (idx === startIdx) return;
      const n = Math.min(ENEMY_TUNE.maxPerRoom, Math.max(2, Math.floor(r.w * r.h / (b.gen.density || 3))), randi(2, 4) + Math.floor(prog(run.stage) * 0.3));
      for (let k = 0; k < n; k++) { const [x, z] = randomTileIn(r); spawnEnemy(pickEnemyType(b, si.tier), x, z, idx, diff); }
      roomCount[idx] = n;
    });
    const cand = rooms.map((r, i) => i).filter(i => i !== startIdx);
    const caches = Math.random() < 0.4 ? 2 : 1;
    shuffle(cand).slice(0, caches).forEach(i => {
      const [x, z] = randomTileIn(rooms[i]);
      addPickup('weapon', x, z, { w: rollWeapon(prog(run.stage)) });
    });
  }
  P.tile = -1; P.inv = 1.0; P.fy = floorY(P.x, P.z); P.vy = 0;
  $('#bossBar').hidden = true;
  refreshRunText();
  banner(stageLabel(run.stage), b.name);
  const hintAt = run.stage, hint = b.hint;
  if (si.sub === 0 && hint) setTimeout(() => { if (run && run.stage === hintAt && state === 'play') toast(hint, 3600); }, 1800);
  state = 'play';
  checkpoint();
  if (!isArena) setMusic(b.code);
  musicVolume(1);
  updateHint();
}
// deeper sectors lean toward the biome's tougher enemy types
export function pickEnemyType(b: Biome, tier: number): string {
  if (Math.random() < ENEMY_TUNE.trooperChance) return 'trooper'; // the humanoid soldier turns up in every sector
  const elites = b.enemies.filter(t => ELITE_TYPES.includes(t));
  const chance = Math.min(ENEMY_TUNE.eliteMax, ENEMY_TUNE.elitePerDepth * tier);
  return elites.length && Math.random() < chance ? pick(elites) : pick(b.enemies);
}
export function nextStage() {
  sfx('portal');
  run.stage++;
  save.best = Math.max(save.best, run.stage + 1); persist();
  if (run.stage % (PER * 3) === 0) toast(t('run.deeper', { n: stageInfo(run.stage).tier + 1 }), 3000);
  startStage();
}
// times: the chosen chip is applied that many times (shortcut supply), stopping early once it is maxed
export function openPerk(title: string, eyebrow?: string, done?: () => void, times = 1) {
  state = 'perk'; releaseInputs(); exitLock(); bigmap.hidden = true;
  $('#perkTitle').textContent = title; $('#perkEyebrow').textContent = eyebrow || 'chip acquired';
  const opts = shuffle(PERKS.filter(o => !(o.maxed && o.maxed(P)) && !(times > 1 && o.noSupply))).slice(0, 3 + save.pres.up.choice)
    .map(o => ({ o, rare: o.rv !== undefined && Math.random() < TUNE.rareChipChance }));
  const list = $('#perkList'); list.innerHTML = ''; list.style.setProperty('--n', opts.length); // one row, however many options
  opts.forEach(({ o, rare }) => {
    const v = rare ? o.rv! : o.v, name = o.name + (rare ? '+' : '');
    const b = document.createElement('button'); b.className = 'perk' + (rare ? ' rare' : '');
    b.innerHTML = `<span class="pn">${rare ? '★ ' : ''}${name}${times > 1 ? t('perk.times', { n: times }) : ''}</span><span class="pd">${o.desc(v)}</span><span class="pcur">${t('perk.cur', { v: o.curText(o.cur(P)) })}</span>`;
    b.addEventListener('click', () => {
      for (let k = 0; k < times && !(k && o.maxed && o.maxed(P)); k++) { o.apply(P, v); run.perks.push(o.id + (rare ? '+' : '')); }
      sfx('chip');
      show(null); state = 'play'; weaponHud();
      requestLock();
      if (done) done();
    });
    list.appendChild(b);
  });
  $('#perkStats').innerHTML = statsHTML();
  show('#scrPerk');
}
// the run's own text that was written out in the old language (the language can be switched from the pause screen)
export function refreshRunText() {
  if (!run || !P) return;
  const b = stageInfo(run.stage).biome;
  $('#stageLbl').innerHTML = `<b>${stageLabel(run.stage)}</b>　${b.name}`;
  if (boss && boss.kind) $('#bossName').textContent = BOSS_META[boss.kind]!.title ?? boss.kind;
  if (state === 'pause') $('#pauseChips').innerHTML = statsHTML();
}
export function pause() {
  if (state !== 'play') return;
  state = 'pause'; releaseInputs(); exitLock(); bigmap.hidden = true; musicVolume(0.4);
  renderSettings();
  $('#btnSuspend').hidden = !!run.practice;
  $('#pauseChips').innerHTML = statsHTML();
  show('#scrPause');
}
$('#btnResume').addEventListener('click', () => { show(null); state = 'play'; musicVolume(1); requestLock(); });
$('#btnAbandon').addEventListener('click', () => endRun('abandon'));
$('#btnSuspend').addEventListener('click', suspendRun);

// ---- suspend / resume ----
// the snapshot keeps the run and the player's build; resuming regenerates the current stage from its start
export const SNAP_SKIP = ['x', 'z', 'yaw', 'pitch', 'tile', 'bob', 'fy', 'vy', 'inv', 'dashT', 'ddx', 'ddz', 'reloadT', 'reloadMax', 'fireCd', 'stDelay'];
export let discardArm = false;
// Checkpoint: the run is saved every time a stage (floor or boss room) starts, and deleted when the run ends.
// If the page is killed (e.g. a phone closing a backgrounded browser) or the player suspends by hand,
// the next launch offers RESUME from the start of that stage, with the state it had when the stage began.
export function makeSnapshot() {
  const p: Record<string, unknown> = {};
  Object.entries(P).forEach(([k, v]) => { if (!SNAP_SKIP.includes(k)) p[k] = v; });
  return { run: { stage: run.stage, kills: run.kills, bits: run.bits, perks: run.perks, bosses: run.bosses || [], startTier: run.startTier, route: run.route }, P: JSON.parse(JSON.stringify(p)) };
}
export function checkpoint() {
  if (!run || run.practice || !P) return;
  save.suspend = makeSnapshot(); persist();
}
export function suspendRun() {
  // the checkpoint from the start of this stage is already saved; progress since then is dropped
  releaseInputs(); exitLock(); discardArm = false;
  goBase();
}
export function restoreSnapshot(sn: Snapshot) {
  setPlayer(Object.assign(newPlayer([basicW('pistol'), null]), sn.P));
  setRun(Object.assign({}, sn.run));
  run.perks = (run.perks || []).map(perkIdOf);
}
export function resumeRun() {
  const sn = save.suspend; if (!sn) return;
  audioInit();
  if (isTouch && !isFs()) enterFs();
  restoreSnapshot(sn);
  track('dive_resume', { level: stageInfo(run.stage).tier + 1 });
  save.suspend = null; persist();
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage(); requestLock();
  toast(t('susp.resumed'), 2000);
}
export function discardSuspended() {
  const sn = save.suspend; if (!sn) return;
  restoreSnapshot(sn); save.suspend = null; discardArm = false;
  endRun('abandon');
}
export function renderSuspend() {
  const box = $('#suspendBox'), sn = save.suspend;
  box.hidden = !sn; $('#btnStart').hidden = !!sn;
  if (!sn) return;
  const tier = Math.floor(sn.run.stage / PER), b = BIOMES[sn.run.route[tier % sn.run.route.length]];
  box.innerHTML = `<p class="eyebrow">suspended</p>
    <div>${t('susp.info', { where: stageLabel(sn.run.stage), biome: b.name, hp: Math.ceil(sn.P.hp), maxHp: sn.P.maxHp, bits: Math.floor(sn.run.bits) })}</div>
    <div class="row"><button class="primary" data-susp="resume">${t('susp.resume')}<small>${t('susp.resumeSub')}</small></button>
    ${discardArm ? `<button class="buy" data-susp="discard">${t('susp.discardGo')}</button><button class="mini-btn" data-susp="cancel">${t('common.cancel')}</button>`
      : `<button class="mini-btn" data-susp="arm">${t('susp.discard')}</button>`}</div>`;
}
$('#suspendBox').addEventListener('click', (e: Event) => { const tg = e.target as HTMLElement;
  const b = tg.closest<HTMLElement>('[data-susp]'); if (!b) return;
  const a = b.dataset.susp;
  if (a === 'resume') resumeRun();
  else if (a === 'discard') discardSuspended();
  else { discardArm = a === 'arm'; renderSuspend(); }
});

// ---- stats panel ----
export function statsHTML() {
  const w = curW(), pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`, rows: [string, string | number][] = [];
  rows.push([t('stats.maxHp'), P.maxHp]);
  rows.push([t('stats.dmg'), pct(P.dmgMul * wDmgMul(w) - 1)]); // chips and upgrades x the weapon's rarity and +value
  rows.push([t('stats.rate'), pct(P.fireRate / Math.pow(0.91, wo('rate')) - 1)]);
  rows.push([t('stats.speed'), pct(P.spdMul * (1 + 0.06 * wo('speed')) - 1)]);
  rows.push([t('stats.stamina'), t('stats.staminaV', { max: P.stMax, dashes: Math.floor(P.stMax / TUNE.dashCost), regen: Math.round(P.stRegen) })]);
  rows.push([t('stats.reload'), pct(P.reloadMul * Math.pow(0.8, wo('reload')) - 1)]);
  rows.push([t('stats.mag'), pct(magSize(w) / WEAPONS[w.id].mag - 1)]); // as the weapon really loads (the launcher gets half the chips)
  rows.push([t('stats.crit'), `${Math.round(critChance() * 100)}%${P.crit + 0.08 * wo('crit') > TUNE.critCap ? t('stats.capped') : ''}`]);
  const pierce = P.pierce + wo('pierce'), leech = P.leech + 2 * wo('leech'), gain = P.gainMul * (1 + 0.1 * wo('gain'));
  if (pierce) rows.push([t('stats.pierce'), t('stats.pierceV', { n: pierce })]);
  if (P.extra) rows.push([t('stats.split'), t('stats.splitV', { n: P.extra, pct: P.extra * 20 })]);
  if (leech) rows.push([t('stats.leech'), `HP +${leech}`]);
  if (P.chain) rows.push([t('stats.chain'), `Lv ${P.chain}`]);
  if (P.magnet > 1) rows.push([t('stats.magnet'), `×${P.magnet.toFixed(1)}`]);
  rows.push([t('stats.gain'), pct(gain - 1)]);
  const chips = chipSummary(run.perks) || t('common.none');
  return `<h3>${t('stats.title')}<small>${t('stats.titleNote', { w: wText(w) })}</small></h3>
    <dl class="reslist">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <p class="chips">${t('stats.chips', { list: chips })}</p>`;
}

// ---- inventory ----
export let invSel: { where: string; i: number } | null = null; // {where:'eq'|'bag', i}
export function openBag() {
  if (state !== 'play') return;
  state = 'bag'; releaseInputs(); exitLock(); invSel = null; bigmap.hidden = true;
  renderBag(); show('#scrBag');
}
export function closeBag() { show(null); state = 'play'; normalizeWeapons(); weaponHud(); requestLock(); }
$('#btnBagClose').addEventListener('click', closeBag);
$('#btnUseKit').addEventListener('click', () => { useKit(); renderBag(); });
export function itemCard(w: WeaponItem | null, where: string, i: number) {
  const sel = invSel && invSel.where === where && invSel.i === i;
  if (!w) return `<button class="item none ${sel ? 'sel' : ''}" data-inv="${where}:${i}">${t('base.empty')}</button>`;
  const s = weaponStats(w);
  return `<button class="item ${sel ? 'sel' : ''}" data-inv="${where}:${i}" style="border-left:3px solid ${w.basic ? 'var(--line)' : RARITY[w.r].css}"><span class="wn">${wName(w)}</span>
    <span class="ws">${t('bag.item', { dps: Math.round(s.dps), reach: wReach(s), hit: Math.round(s.perHit), hits: s.hits > 1 ? '×' + s.hits : '', mag: w.mag, magMax: s.mag })}</span>${wOpts(w)}
    ${w.basic ? `<span class="ws">${t('base.keep')}</span>` : ''}
    ${where === 'eq' ? `<span class="ws">${t('bag.slotN', { n: i + 1 })}${i === P.cur ? t('bag.inHand') : ''}</span>` : ''}</button>`;
}
export function renderBag() {
  $('#invEq').innerHTML = P.weapons.map((w, i) => itemCard(w, 'eq', i)).join('');
  $('#invBag').innerHTML = P.bag.map((w, i) => itemCard(w, 'bag', i)).join('');
  $('#kitNum').textContent = P.kits;
  $('#btnUseKit').textContent = t('bag.useKit', { n: kitHealAmount() });
  $('#btnUseKit').disabled = P.kits <= 0 || P.hp >= P.maxHp;
  $('#bagChips').innerHTML = `<p class="chips">${t('bag.status', { hp: Math.ceil(P.hp), maxHp: P.maxHp, bits: Math.floor(run.bits) })}</p>` + statsHTML();
  const act = $('#invAct');
  if (!invSel) { act.innerHTML = t('bag.pick'); return; }
  const w = invSel.where === 'eq' ? P.weapons[invSel.i] : P.bag[invSel.i];
  if (!w) { act.innerHTML = t('bag.emptySlot'); return; }
  const eqCount = P.weapons.filter(Boolean).length, bagFree = P.bag.includes(null);
  const btns = [];
  if (invSel.where === 'bag') {
    btns.push(`<button class="mini-btn amber" data-act="equip0">${t('bag.toSlot1')}</button>`);
    btns.push(`<button class="mini-btn amber" data-act="equip1">${t('bag.toSlot2')}</button>`);
    btns.push(`<button class="mini-btn" data-act="drop">${t('bag.drop')}</button>`);
  } else {
    btns.push(`<button class="mini-btn" data-act="stow" ${eqCount > 1 && bagFree ? '' : 'disabled'}>${t('bag.stow')}</button>`);
    btns.push(`<button class="mini-btn" data-act="drop" ${eqCount > 1 ? '' : 'disabled'}>${t('bag.drop')}</button>`);
  }
  act.innerHTML = btns.join('') + (w.basic ? '' : `<span>${t('bag.keptNote')}</span>`);
}
$('#scrBag').addEventListener('click', (e: Event) => { const tg = e.target as HTMLElement;
  const it = tg.closest<HTMLElement>('[data-inv]'), ac = tg.closest<HTMLElement>('[data-act]');
  if (it) { const [where, i] = it.dataset.inv!.split(':'); invSel = { where, i: +i }; renderBag(); return; }
  if (!ac || !invSel) return;
  const a = ac.dataset.act, src = invSel.where === 'eq' ? P.weapons : P.bag, w = src[invSel.i];
  if (!w) return;
  if (a === 'equip0' || a === 'equip1') {
    const k = a === 'equip0' ? 0 : 1, prev = P.weapons[k];
    P.weapons[k] = w; P.bag[invSel.i] = prev; P.cur = k; invSel = { where: 'eq', i: k };
  } else if (a === 'stow') {
    const slot = P.bag.indexOf(null); if (slot < 0) return;
    P.bag[slot] = w; P.weapons[invSel.i] = null; invSel = { where: 'bag', i: slot };
  } else if (a === 'drop') {
    src[invSel.i] = null; addPickup('weapon', P.x + rand(-0.6, 0.6), P.z + rand(-0.6, 0.6), { w }); invSel = null;
  }
  normalizeWeapons(); sfx('pick'); renderBag(); weaponHud();
});

// ---- run end ----
// ---- boss practice: fight one boss at a chosen depth's strength; nothing is gained or lost ----
export let practiceTier = 0;
export function startPractice(kind: string, tier?: number) {
  tier = tier || 0;
  audioInit();
  if (isTouch && !isFs()) enterFs();
  const bi = BIOMES.findIndex(b => b.bosses.includes(kind));
  setPlayer(newPlayer(save.loadout));
  setRun({ stage: tier * PER + PER - 1, kills: 0, bits: 0, perks: [], startTier: 0, route: [bi], practice: true, forceBoss: kind, t0: performance.now() });
  track('practice_start', { target: kind, level: tier + 1 });
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage(); requestLock();
  toast(t('run.practiceStart'), 2600);
}
export function endPractice(kind: string) {
  state = 'result'; releaseInputs(); exitLock();
  const sec = Math.round((performance.now() - run.t0!) / 1000);
  track('practice_end', { target: run.forceBoss!, level: stageInfo(run.stage).tier + 1, result: run.cleared ? 'won' : kind, duration_sec: sec });
  $('#resEyebrow').textContent = 'practice';
  $('#resTitle').textContent = t(run.cleared ? 'res.practiceWon' : 'res.practiceDone');
  $('#resList').innerHTML = [[t('res.boss'), BOSS_META[run.forceBoss!]!.name], [t('res.strength'), t('res.strengthV', { n: stageInfo(run.stage).tier + 1 })], [t('res.result'), t(run.cleared ? 'res.won' : kind === 'dead' ? 'res.died' : 'res.quit')], [t('res.time'), t('res.timeV', { m: Math.floor(sec / 60), s: sec % 60 })]]
    .map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  $('#resChips').textContent = t('res.practiceNote'); $('#resOrder').hidden = true;
  hideShare(); prepFeedback(kind);
  setTimeout(() => { setPlayUI(false); show('#scrResult'); }, kind === 'dead' ? 700 : 0);
}
export function endRun(kind: string) {
  if (run.practice) { endPractice(kind); return; }
  save.suspend = null; // the run is over: its checkpoint must not come back
  const dead = kind !== 'extract';
  state = 'result'; releaseInputs(); exitLock();
  const got = Math.floor(run.bits), kept = dead ? Math.floor(got * TUNE.deathBitsKeep) : got;
  track('level_end', { result: kind, level: stageInfo(run.stage).tier + 1, stage: stageInfo(run.stage).sub + 1, stage_type: stageInfo(run.stage).biome.code, stage_role: isBossStage(run.stage) ? 'boss' : 'normal', count: run.kills, upgrades: run.perks.length, value: kept, virtual_currency_name: 'bits' });
  save.bits += kept;
  save.best = Math.max(save.best, run.stage + 1);
  const found = P.weapons.concat(P.bag).filter((w): w is Weapon => !!w && !w.basic);
  const rows = [];
  rows.push([t('res.reached'), `${stageLabel(run.stage)}　${stageInfo(run.stage).biome.name}`]);
  rows.push([t('res.kills'), run.kills]);
  rows.push([t('res.bits'), dead ? t('res.bitsLost', { kept, lost: got - kept }) : `+${kept}`]);
  let shortcutMsg = '';
  if (dead) {
    rows.push([t('res.lostWeapons'), found.length ? found.map(wText).join(t('common.sep')) : t('common.none')]);
    if (save.shortcut > 0) { save.shortcut--; shortcutMsg = t('res.shortcutClosed', { tier: tierLabel(save.shortcut + 1) }); }
    save.startTier = Math.min(save.startTier, save.shortcut);
  } else {
    const strip = (w: WeaponItem | null): WeaponItem | null => w ? { id: w.id, r: w.r, basic: !!w.basic, plus: w.plus || 0, opts: w.opts || [] } : null;
    save.loadout = [strip(P.weapons[0]), strip(P.weapons[1])];
    if (!save.loadout[0]) save.loadout[0] = basicW('pistol');
    let sold = 0;
    P.bag.filter(w => w && !w.basic).forEach(w => save.stash.push(strip(w)!));
    while (save.stash.length > STASH_MAX) {
      let mi = 0; save.stash.forEach((w, i) => { if (sellValue(w) < sellValue(save.stash[mi])) mi = i; });
      sold += sellValue(save.stash[mi]); save.stash.splice(mi, 1);
    }
    if (sold) save.bits += sold;
    rows.push([t('res.keptWeapons'), found.length ? found.map(wText).join(t('common.sep')) : t('common.none')]);
    if (sold) rows.push([t('res.sold'), `+${sold}`]);
  }
  if (shortcutMsg) rows.push([t('res.shortcut'), shortcutMsg]);
  persist();
  $('#resEyebrow').textContent = kind === 'extract' ? 'extracted' : kind === 'abandon' ? 'abandoned' : 'signal lost';
  $('#resTitle').textContent = t(kind === 'extract' ? 'res.extract' : kind === 'abandon' ? 'res.abandon' : 'res.dead');
  $('#resList').innerHTML = rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  $('#resChips').textContent = run.perks.length ? t('res.chips', { n: run.perks.length, list: chipSummary(run.perks) }) : '';
  // the order they were taken, folded away (a deep run has around a hundred)
  $('#resOrderList').textContent = run.perks.map(perkName).join(t('common.sep'));
  $('#resOrder').hidden = !run.perks.length; ($('#resOrder') as HTMLDetailsElement).open = false;
  prepShare(kind); prepFeedback(kind);
  setTimeout(() => { setPlayUI(false); show('#scrResult'); }, kind === 'dead' ? 700 : 0);
}
$('#btnBack').addEventListener('click', goBase);
export function goBase() {
  state = 'base'; setRun(null); setPlayer(null);
  setPlayUI(false); show('#scrBase'); renderBase();
  setMusic('BASE'); musicVolume(1);
  buildAttract();
}
// the base screen backdrop: the camera slowly turns in the start room (system 'attract', js/flow/update.js)
export let attractYaw = 0, attractPos = [0, 0];
export function buildAttract() {
  const ab = pick(BIOMES);
  buildLevel(ab, false);
  rooms.forEach((r, idx) => { if (idx === startIdx) return; for (let k = 0; k < 3; k++) { const [x, z] = randomTileIn(r); spawnEnemy(pick(ab.enemies), x, z, idx, 1); } });
  attractPos = roomSpot(rooms[startIdx]);
  const [ex, ez] = roomSpot(rooms[exitIdx]); attractYaw = Math.atan2(-(ex - attractPos[0]), -(ez - attractPos[1]));
  makePortal(ex, ez, 0xffc24a, 'next', '');
  seen.fill(1);
}
export function attract(dt: number) {
  tickClock(dt);
  attractYaw += dt * 0.12;
  camera.position.set(attractPos[0], floorY(attractPos[0], attractPos[1]) + EYE + 0.4, attractPos[1]);
  camera.rotation.set(-0.05, attractYaw, 0);
  portals.forEach(pt => { pt.ring.rotation.z += dt * 1.5; pt.ring.material.opacity = 1; }); // the backdrop's gate looks armed
  for (const e of enemies) { e.t += dt; e.mesh.position.y = e.fy + e.y + Math.sin(e.t * 2) * 0.15; e.body.rotation.y += dt; }
}

// ================= base screen =================
export let selSlot = 0;
// a weapon's numbers as it would be right after diving: base upgrades and reboot bonuses in, no chips, its own options
// in (so weapons in the base can be compared; P may still be the last run's player, chips and all)
// what the one-target DPS leaves out: the rail's damage past `far` metres, the rocket's blast radius
export const wReach = (s: ReturnType<typeof weaponStats>): string => s.farDps ? t('weapon.far', { m: s.far, dps: Math.round(s.farDps) }) : s.blast ? t('weapon.blast', { m: s.blast.toFixed(1) }) : '';
export function wStat(w: WeaponItem) {
  const d = WEAPONS[w.id], keep = P;
  setPlayer(newPlayer([]));
  try {
    const s = weaponStats(w);
    return t('base.wstat', { dps: Math.round(s.dps), reach: wReach(s), dmg: Math.round(s.perHit), pellets: s.hits, rate: (1 / s.interval).toFixed(1), mag: s.mag, pierce: d.pierce });
  } finally { setPlayer(keep); }
}
// base menu tabs; the last one opened is remembered in this browser
export let baseTab = 'sortie';
baseTab = prefGet('sd-base-tab', 'sortie');
export function showTab(name: string) {
  if (!document.querySelector(`[data-pane="${name}"]`)) name = 'sortie';
  baseTab = name;
  document.querySelectorAll<HTMLElement>('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; });
  prefSet('sd-base-tab', name);
}
$('.tabs').addEventListener('click', (e: Event) => { const tg = e.target as HTMLElement; const b = tg.closest<HTMLElement>('[data-tab]'); if (b) { showTab(b.dataset.tab!); $('#scrBase').scrollTop = 0; } });
export function renderBase() {
  showBaseFeedback();
  $('#sBits').textContent = save.bits;
  $('#sBest').textContent = save.best ? stageLabel(save.best - 1) : '—';
  $('#sRuns').textContent = save.runs;
  $('#sBoss').textContent = save.bossKills;
  save.startTier = clamp(save.startTier, 0, save.shortcut);
  $('#tiers').innerHTML = Array.from({ length: save.shortcut + 1 }, (_, n) =>
    `<button class="tier" data-tier="${n}" aria-pressed="${save.startTier === n}"><b>${tierLabel(n)}</b><small>${n === 0 ? t('base.tierFirst') : t('base.tierChips', { n, times: TUNE.supplyTimes })}</small><small class="rd rd${readiness(n)}">${t(`base.ready${readiness(n)}`)}</small></button>`).join('');
  $('#startSub').textContent = t('base.diveSub', { tier: tierLabel(save.startTier) });
  renderSuspend();
  $('#loadout').innerHTML = [0, 1].map(k => {
    const w = save.loadout[k];
    return `<button class="lslot ${selSlot === k ? 'sel' : ''}" data-slot="${k}"><span class="eyebrow">${t('base.slot', { n: k + 1 })}${selSlot === k ? t('base.slotTarget') : ''}</span>
      <span class="wn">${w ? wName(basicNow(w)) : t('base.empty')}</span>${w && !w.basic ? `<span class="risk">${t('base.stashRisk')}</span>` : w ? `<span class="ws">${t('base.keep')}</span>` : ''}
      ${k === 1 && w ? `<span class="mini-btn" data-unequip="1" role="button">${t('base.unequip')}</span>` : ''}</button>`;
  }).join('');
  $('#modCap').textContent = t('base.modCap', { cap: modPlusCap(), depth: peakDepth(), per: MOD_CAP_PER_DEPTH, min: MOD_PLUS_MAX });
  $('#wgrid').innerHTML = WEAPON_ORDER.map(id => {
    const def = WEAPONS[id], un = id === 'pistol' || !!save.unlocked[id];
    if (!un) return `<button class="wcard locked ${save.bits < def.cost ? 'poor' : ''}" data-w="${id}">
      <span class="wn">${def.name}</span><span class="wd">${def.desc}</span><span class="ws">${wStat({ id, r: 0 })}</span>
      <span class="wf">${t('base.unlock', { cost: def.cost })}</span></button>`;
    const w = basicNow(basicW(id)), m = modOf(id), pc = modPlusCost(m.plus), rc = MOD_RARITY_COST[m.r];
    const plusBtn = m.plus >= modPlusCap() ? `<button class="mini-btn" disabled>${t('base.plusMax')}</button>`
      : `<button class="mini-btn amber" data-modplus="${id}" ${save.bits < pc ? 'disabled' : ''}>${t('base.modPlus', { n: m.plus + 1, cost: pc })}</button>`;
    const rarBtn = rc === undefined ? `<button class="mini-btn" disabled>${t('base.rarMax')}</button>`
      : `<button class="mini-btn amber" data-modrar="${id}" ${save.bits < rc ? 'disabled' : ''}>${t('base.modRar', { stars: RARITY[m.r + 1].stars, name: RARITY[m.r + 1].name, cost: rc })}</button>`;
    return `<div class="wcard" style="border-left:3px solid ${m.r ? RARITY[m.r].css : 'var(--line)'}">
      <span class="wn">${wName(w)}</span><span class="wd">${def.desc}</span><span class="ws">${wStat(w)}</span>
      <span class="acts"><button class="mini-btn amber" data-w="${id}">${t('base.assign', { n: selSlot + 1 })}</button>${plusBtn}${rarBtn}</span></div>`;
  }).join('');
  $('#stashCount').textContent = t('base.stashCount', { n: save.stash.length, max: STASH_MAX });
  $('#stash').innerHTML = save.stash.length ? save.stash.map((w, i) => `<div class="wcard" style="border-left:3px solid ${RARITY[w.r].css}"><span class="wn">${wName(w)}</span><span class="ws">${wStat(w)}</span>${wOpts(w)}
      <span class="acts"><button class="mini-btn amber" data-stash="${i}">${t('base.stashAssign', { n: selSlot + 1 })}</button><button class="mini-btn" data-sell="${i}">${t('base.sell', { v: sellValue(w) })}</button></span></div>`).join('')
    : `<div class="empty">${t('base.stashEmpty')}</div>`;
  $('#ulist').innerHTML = UPGRADES.map(u => {
    const l = save.up[u.id] || 0, maxed = l >= u.max, cost = u.cost(l);
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('');
    return `<div class="urow"><div><div class="un">${u.name}</div><div class="ud">${u.desc(l)}</div><div class="pips">${pips}</div></div>
      <button class="buy" data-up="${u.id}" ${maxed || save.bits < cost ? 'disabled' : ''}>${maxed ? t('base.max') : cost + ' BIT'}</button></div>`;
  }).join('');
  renderReboot();
  $('#practiceTier').innerHTML = `<span>${t('base.practiceTierLabel')}</span>` + [0, 1, 2, 4].map(t => `<button data-ptier="${t}" aria-pressed="${practiceTier === t}">D${t + 1}</button>`).join('');
  $('#bossList').innerHTML = BOSS_ORDER.map(k => `<button class="wcard" data-practice="${k}"><span class="wn">${BOSS_META[k].name}</span>
    <span class="wd">${BOSS_META[k].desc}</span><span class="wf">${t(save.bossSeen[k] ? 'base.practiceGo' : 'base.practiceGoNew')}</span></button>`).join('');
  renderSettings();
  $('#help').innerHTML = isTouch
    ? t('base.helpTouch')
    : t('base.helpDesk');
}
export let rebootArm = false;
export const rebootGain = () => 2 + Math.max(0, save.shortcut - 3);
export function renderReboot() {
  const pr = save.pres, sec = $('#rebootSec');
  sec.hidden = !(save.canReboot || pr.count > 0);
  if (sec.hidden) return;
  $('#rebootNote').textContent = t('reboot.note', { count: pr.count, diff: Math.round((presMul() - 1) * 100), pts: pr.pts });
  $('#presList').innerHTML = PRES_UP.map(u => {
    const l = pr.up[u.id] || 0, maxed = l >= u.max, cost = presCost(u, l);
    // uncapped bonuses show their level instead of a row of pips
    const pips = isFinite(u.max) ? Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('') : `<small>${t('pres.level', { n: l })}</small>`;
    return `<div class="urow"><div><div class="un">${u.name}</div><div class="ud">${u.desc(l)}</div><div class="pips">${pips}</div></div>
      <button class="buy" data-pres="${u.id}" ${maxed || pr.pts < cost ? 'disabled' : ''}>${maxed ? t('base.max') : cost + ' pt'}</button></div>`;
  }).join('');
  const row = $('#rebootRow');
  if (save.suspend) { row.innerHTML = `<p class="help">${t('reboot.suspended')}</p>`; return; }
  if (!save.canReboot) { row.innerHTML = `<p class="help">${t('reboot.locked')}</p>`; return; }
  row.innerHTML = rebootArm
    ? `<p class="help">${t('reboot.confirm')}<br>${t('reboot.after', { diff: Math.round((presMulOf(pr.count + 1) - 1) * 100), cap: Math.round(PRES_DIFF_CAP * 15), ready: t(`base.ready${readiness(0, readyAfterReboot())}`) })}</p>
       <button class="buy" data-reboot="go">${t('reboot.go', { pts: rebootGain() })}</button><button class="mini-btn" data-reboot="cancel">${t('common.cancel')}</button>`
    : `<p class="help">${t('reboot.info', { pts: rebootGain() })}</p><button class="buy" data-reboot="arm">${t('reboot.arm')}</button>`;
}
export function doReboot() {
  const pr = save.pres, keep = { best: save.best, runs: save.runs, bossKills: save.bossKills, settings: save.settings };
  pr.pts += rebootGain(); pr.count++;
  track('reboot', { count: pr.count });
  const d = defaultSave();
  Object.assign(save, d, keep, { pres: pr });
  save.bits = pr.up.funds * 150;
  for (let k = 0; k < pr.up.relic; k++) save.stash.push({ id: pickDrop(), r: 2, basic: false });
  rebootArm = false; persist(); renderBase();
  audioInit(); sfx('portal');
}
export function assignLoadout(item: WeaponItem | null) {
  const prev = save.loadout[selSlot];
  if (prev && !prev.basic) save.stash.push(prev);
  save.loadout[selSlot] = item;
}
$('#scrBase').addEventListener('click', (e: Event) => { const tg = e.target as HTMLElement;
  const un = tg.closest<HTMLElement>('[data-unequip]'), sl = tg.closest<HTMLElement>('[data-slot]'), w = tg.closest<HTMLElement>('[data-w]'), u = tg.closest<HTMLElement>('[data-up]');
  const st = tg.closest<HTMLElement>('[data-stash]'), se = tg.closest<HTMLElement>('[data-sell]'), ti = tg.closest<HTMLElement>('[data-tier]');
  const pu = tg.closest<HTMLElement>('[data-pres]'), rb = tg.closest<HTMLElement>('[data-reboot]'), pr = tg.closest<HTMLElement>('[data-practice]');
  if (pr) { startPractice(pr.dataset.practice!, practiceTier); return; }
  const mp = tg.closest<HTMLElement>('[data-modplus]'), mr = tg.closest<HTMLElement>('[data-modrar]');
  if (mp || mr) {
    const id = (mp || mr)!.dataset.modplus || (mp || mr)!.dataset.modrar!, m = Object.assign({ plus: 0, r: 0 }, modOf(id));
    const cost = mp ? modPlusCost(m.plus) : MOD_RARITY_COST[m.r];
    if (cost === undefined || save.bits < cost || (mp && m.plus >= modPlusCap())) return;
    save.bits -= cost; if (mp) m.plus++; else m.r++;
    save.mods = Object.assign({}, save.mods, { [id]: m }); persist(); audioInit(); sfx('chip'); renderBase(); return;
  }
  const pt = tg.closest<HTMLElement>('[data-ptier]');
  if (pt) { practiceTier = +pt.dataset.ptier!; renderBase(); return; }
  if (rb) { const a = rb.dataset.reboot; if (a === 'go') { doReboot(); return; } rebootArm = a === 'arm'; renderReboot(); return; }
  if (pu) {
    const def = PRES_UP.find(x => x.id === pu.dataset.pres)!, l = save.pres.up[def.id] || 0;
    const cost = presCost(def, l);
    if (l < def.max && save.pres.pts >= cost) { save.pres.pts -= cost; save.pres.up[def.id] = l + 1; audioInit(); sfx('chip'); }
  } else if (un) { const prev = save.loadout[1]; if (prev && !prev.basic) save.stash.push(prev); save.loadout[1] = null; selSlot = 1; }
  else if (sl) selSlot = +sl.dataset.slot!;
  else if (ti) save.startTier = +ti.dataset.tier!;
  else if (w) {
    const id = w.dataset.w!, def = WEAPONS[id];
    if (!save.unlocked[id]) { if (save.bits < def.cost) return; save.bits -= def.cost; save.unlocked[id] = true; audioInit(); sfx('chip'); }
    assignLoadout(basicW(id));
  } else if (st) {
    const i = +st.dataset.stash!, item = save.stash.splice(i, 1)[0];
    assignLoadout(item);
  } else if (se) {
    const i = +se.dataset.sell!; save.bits += sellValue(save.stash[i]); save.stash.splice(i, 1); audioInit(); sfx('pick');
  } else if (u) {
    const def = UPGRADES.find(x => x.id === u.dataset.up)!, l = save.up[def.id] || 0, cost = def.cost(l);
    if (l < def.max && save.bits >= cost) { save.bits -= cost; save.up[def.id] = l + 1; audioInit(); sfx('pick'); }
  } else return;
  persist(); renderBase();
});
$('#btnStart').addEventListener('click', startRun);

// ---- full data wipe (red confirmation dialog) ----
$('#btnWipe').addEventListener('click', () => { $('#dlgWipe').hidden = false; $('#btnWipeCancel').focus(); });
$('#btnWipeCancel').addEventListener('click', () => { $('#dlgWipe').hidden = true; });
document.addEventListener('keydown', e => { if (e.code === 'Escape' && !$('#dlgWipe').hidden) $('#dlgWipe').hidden = true; });
// ---- save codes: copy the save to another device (settings tab > data) ----
// export shows the code with copy / save-to-file; import takes a pasted code or a file, asks once, then reloads
export let saveMode: 'export' | 'import' | null = null, importArm = false;
export function renderSavePanel() {
  const panel = $('#savePanel'), box = el<HTMLTextAreaElement>('#saveCode');
  panel.hidden = !saveMode;
  if (!saveMode) return;
  box.readOnly = saveMode === 'export';
  box.placeholder = saveMode === 'import' ? t('save.paste') : '';
  $('#saveMsg').textContent = t(saveMode === 'export' ? 'save.exportNote' : importArm ? 'save.importConfirm' : 'save.importNote');
  $('#saveBtns').innerHTML = saveMode === 'export'
    ? `<button class="mini-btn amber" data-save="copy">${t('save.copy')}</button><button class="mini-btn" data-save="download">${t('save.download')}</button><button class="mini-btn" data-save="close">${t('common.close')}</button>`
    : importArm
      ? `<button class="danger-ghost" data-save="go">${t('save.importGo')}</button><button class="mini-btn" data-save="cancel">${t('common.cancel')}</button>`
      : `<button class="mini-btn amber" data-save="check">${t('save.importCheck')}</button><button class="mini-btn" data-save="file">${t('save.fromFile')}</button><button class="mini-btn" data-save="close">${t('common.close')}</button>`;
}
function openSavePanel(mode: 'export' | 'import') {
  saveMode = saveMode === mode ? null : mode; importArm = false;
  el<HTMLTextAreaElement>('#saveCode').value = saveMode === 'export' ? exportSave() : '';
  renderSavePanel();
}
$('#btnExport').addEventListener('click', () => openSavePanel('export'));
$('#btnImport').addEventListener('click', () => openSavePanel('import'));
$('#saveBtns').addEventListener('click', (e: Event) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-save]'); if (!b) return;
  const a = b.dataset.save, box = el<HTMLTextAreaElement>('#saveCode');
  if (a === 'close') { saveMode = null; renderSavePanel(); }
  else if (a === 'copy') {
    const done = () => toast(t('save.copied'), 2000);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { box.select(); toast(t('save.copyFailed'), 3000); });
    else { box.select(); toast(t('save.copyFailed'), 3000); }
  } else if (a === 'download') {
    const url = URL.createObjectURL(new Blob([box.value + '\n'], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = `sector-dive-save-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else if (a === 'file') el<HTMLInputElement>('#saveFile').click();
  else if (a === 'check') {
    if (!box.value.trim()) return;
    if (!importSaveCheck(box.value)) { toast(t('save.invalid'), 3000); return; }
    importArm = true; renderSavePanel();
  } else if (a === 'cancel') { importArm = false; renderSavePanel(); }
  else if (a === 'go') {
    if (!importSave(box.value)) { importArm = false; renderSavePanel(); toast(t('save.invalid'), 3000); return; }
    location.reload();
  }
});
el<HTMLInputElement>('#saveFile').addEventListener('change', e => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  f.text().then(txt => { el<HTMLTextAreaElement>('#saveCode').value = txt.trim(); (e.target as HTMLInputElement).value = ''; });
});

$('#btnWipeGo').addEventListener('click', () => {
  clearStore(SAVE_KEY);
  setSave(defaultSave()); persist();
  $('#dlgWipe').hidden = true; selSlot = 0;
  renderBase(); applyLayout();
});
