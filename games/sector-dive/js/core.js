'use strict';
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
document.body.classList.add(isTouch ? 'touch' : 'desk');

// ================= data =================
const WEAPONS = {
  pistol:   { name: 'ハンドガン',   dmg: 16, rate: 0.26,  spread: 0.012, pellets: 1, speed: 75,  mag: 12, reload: 1.1, color: 0x54e8ff, cost: 0,   desc: '癖のない単発。リロードが速い。' },
  // SMG: light rounds, very fast, big magazine, no extra spread while moving
  smg:      { name: 'SMG',        dmg: 6,  rate: 0.062, spread: 0.05,  pellets: 1, speed: 70,  mag: 45, reload: 1.7, steady: true, color: 0x8cff6a, cost: 250, desc: '1発は軽いが、連射と装弾数で押し切る。移動しながら撃ってもブレない。' },
  // shotgun: point-blank burst; 7+ pellets from one shot on the same target adds a bonus hit
  shotgun:  { name: 'ショットガン', dmg: 11, rate: 0.7,   spread: 0.065, pellets: 8, speed: 65,  mag: 6,  reload: 2.0, close: 5, closeMul: 1.8, full: 7, kb: 0.35, color: 0xffc24a, cost: 320, desc: '5m以内は威力1.8倍。1発で7発以上当てると追加ダメージ。敵を押し返す。' },
  // rail: one heavy piercing round, stronger the farther it travels
  rail:     { name: 'レールガン',   dmg: 90, rate: 1.1,   spread: 0,     pellets: 1, speed: 200, mag: 4,  reload: 2.2, pierce: 4, far: 15, farMul: 1.5, steady: true, color: 0xc58cff, cost: 520, desc: '貫通する高威力の単発。15m以上離れた敵には威力1.5倍。ブレない。' },
  // launcher: slow rocket, full damage near the centre of the blast, knocks enemies back
  launcher: { name: 'ランチャー',   dmg: 52, rate: 1.15,  spread: 0.008, pellets: 1, speed: 28,  mag: 2,  reload: 2.9, blast: 5, grav: 3.5, color: 0xff6a3d, cost: 700, desc: 'ゆっくり飛ぶロケット。爆心付近は威力が落ちず、敵を吹き飛ばす。近くで撃つと自分も巻き込む。' },
};
const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rail', 'launcher'];
const DROP_POOL = ['pistol', 'pistol', 'smg', 'smg', 'smg', 'shotgun', 'shotgun', 'shotgun', 'rail', 'rail', 'launcher'];
const pickDrop = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];
// rarity rank is shown as stars and a grey -> blue -> gold colour so the order reads at a glance
const RARITY = [
  { name: '標準', stars: '★',   mult: 1,    css: '#9aa8b4', hex: 0x9aa8b4 },
  { name: '改良', stars: '★★',  mult: 1.25, css: '#4da6ff', hex: 0x4da6ff },
  { name: '試作', stars: '★★★', mult: 1.55, css: '#ffc24a', hex: 0xffc24a },
];
const UPGRADES = [
  { id: 'hp',   name: '装甲',         max: 6, cost: l => Math.round(80 * Math.pow(1.6, l)),  desc: l => `最大HP +15 / 段（現在 +${l * 15}）` },
  { id: 'dmg',  name: '出力',         max: 6, cost: l => Math.round(100 * Math.pow(1.6, l)),  desc: l => `与ダメージ +8% / 段（現在 +${l * 8}%）` },
  { id: 'spd',  name: '駆動系',       max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)),  desc: l => `移動速度 +5% / 段（現在 +${l * 5}%）` },
  { id: 'dash', name: '冷却',         max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)),  desc: l => `スタミナ回復 +12% / 段（現在 +${l * 12}%）` },
  { id: 'gain', name: '回収効率',     max: 5, cost: l => Math.round(150 * Math.pow(1.7, l)),  desc: l => `ビット獲得 +15% / 段（現在 +${l * 15}%）` },
  { id: 'stam', name: '持久力',       max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)), desc: l => `最大スタミナ +20 / 段（現在 +${l * 20}）` },
  { id: 'kit',  name: '救急箱',       max: 2, cost: l => Math.round(220 * Math.pow(2, l)), desc: l => `潜行開始時の回復キット +1 / 段（現在 ${1 + l} 個）` },
  { id: 'chip', name: '持ち込みチップ', max: 2, cost: l => Math.round(450 * Math.pow(2.2, l)), desc: l => `潜行開始時にチップを選ぶ（現在 ${l} 枚）` },
];
const PERKS = [
  { name: '過負荷弾', desc: '与ダメージ +20%',            apply: p => { p.dmgMul *= 1.2; } },
  { name: '連射回路', desc: '連射速度 +15%',              apply: p => { p.rateMul *= 0.87; } },
  { name: '装甲パッチ', desc: '最大HP +20、HPを20回復',    apply: p => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { name: '修復パッチ', desc: 'HPを最大値の50%回復',        apply: p => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); } },
  { name: '吸収コード', desc: '撃破ごとにHP +3',          apply: p => { p.leech += 3; } },
  { name: '貫通弾',   desc: '弾が敵を1体多く貫通する',      apply: p => { p.pierce += 1; } },
  { name: '分裂弾',   desc: '発射数 +1（1発の威力は2割減）', apply: p => { p.extra += 1; } },
  { name: '軽量化',   desc: '移動速度 +12%',              apply: p => { p.spdMul *= 1.12; } },
  { name: '弱点解析', desc: '15%の確率で2倍ダメージ',       apply: p => { p.crit += 0.15; } },
  { name: '瞬発回路', desc: 'スタミナ回復 +35%',           apply: p => { p.stRegen *= 1.35; } },
  { name: '連鎖爆破', desc: '撃破した敵が周囲を巻き込んで爆発', apply: p => { p.chain += 1; } },
  { name: '磁力',     desc: 'ビット回収範囲 +80%、獲得 +10%', apply: p => { p.magnet *= 1.8; p.gainMul *= 1.1; } },
  { name: '高速装填', desc: 'リロード時間 -30%',           apply: p => { p.reloadMul *= 0.7; } },
  { name: '拡張弾倉', desc: '装弾数 +50%',                apply: p => { p.magMul *= 1.5; } },
  { name: '予備タンク', desc: '最大スタミナ +30',          apply: p => { p.stMax += 30; p.st += 30; } },
];
// sectors: each run visits them in a shuffled order. gen = level generator settings, bosses = candidates for the sector's boss
const BIOMES = [
  { name: '廃棄データ層', code: 'DATA', fog: 0x061219, fogNear: 4, fogFar: 44, floor: '#08171e', line: '#1d7f94', wall: '#0b232b', wallLine: '#54e8ff',
    gen: { kind: 'rooms', platform: 0.35, bridges: 2 },
    enemies: ['crawler', 'crawler', 'drone', 'drone', 'turret'], bosses: ['watcher', 'phantom'] },
  { name: '溶融炉区画', code: 'FORGE', fog: 0x170905, fogNear: 4, fogFar: 44, floor: '#1e0e08', line: '#94421c', wall: '#2a1209', wallLine: '#ff8a3d',
    gen: { kind: 'rooms', platform: 0.3, bridges: 2, hazard: { count: 12, color: 0xff5a1f, name: '溶融床' } },
    hint: 'オレンジに光る床は溶融床。光っている間は踏むとダメージ',
    enemies: ['crawler', 'crawler', 'drone', 'turret', 'brute', 'bomber'], bosses: ['crusher', 'trinity'] },
  { name: '深層ノイズ', code: 'NOISE', fog: 0x0d0616, fogNear: 2, fogFar: 26, floor: '#120a1e', line: '#5e38a0', wall: '#190d2a', wallLine: '#c58cff',
    gen: { kind: 'rooms', platform: 0.35, bridges: 3 },
    hint: 'ノイズで視界が狭い',
    enemies: ['crawler', 'drone', 'turret', 'brute', 'splitter', 'splitter'], bosses: ['core', 'bastion'] },
  { name: '廃墟街', code: 'RUIN', fog: 0x0d0f0b, fogNear: 2, fogFar: 30, floor: '#171a14', line: '#6b7a4f', wall: '#1d2019', wallLine: '#a8b886',
    gen: { kind: 'rooms', roomMin: 6, roomMax: 8, platform: 0.3, rubble: 0.14, bridges: 1 },
    hint: '瓦礫は腰の高さ。弾は越えるが、登れない',
    enemies: ['crawler', 'bomber', 'shield', 'drone', 'shield', 'crawler'], bosses: ['phantom', 'crusher'] },
  { name: '九龍城', code: 'KWLN', fog: 0x12060e, fogNear: 3, fogFar: 34, floor: '#1a0c16', line: '#b0306e', wall: '#1f0d19', wallLine: '#ff3d8a',
    gen: { kind: 'maze', rooms: 7, loops: 20, prune: 40, density: 5, bridges: 5, hazard: { count: 12, color: 0x3dffb4, name: '漏電床' }, ceiling: true, neon: true },
    hint: '緑に光る床は漏電している。光っている間は踏まない',
    enemies: ['crawler', 'bomber', 'turret', 'splitter', 'crawler'], bosses: ['trinity', 'watcher'] },
  { name: '旧市街ビル群', code: 'CITY', fog: 0x140e06, fogNear: 8, fogFar: 64, floor: '#1b150c', line: '#a06d24', wall: '#221a0e', wallLine: '#ffb347',
    gen: { kind: 'rooms', map: 44, roomMin: 6, roomMax: 9, corridorW: 2, platform: 0.8, rubble: 0.06 },
    hint: '見通しが良い。狙撃手のレーザーに注意',
    enemies: ['sniper', 'drone', 'shield', 'turret', 'crawler', 'sniper'], bosses: ['bastion', 'phantom'] },
];
const BOSS_META = {
  watcher: { pillars: true }, crusher: { pillars: true }, core: { pillars: false },
  phantom: { pillars: true }, trinity: { pillars: false }, bastion: { pillars: false },
};
const ENEMY = {
  crawler: { hp: 30,  speed: 6.4, r: 0.55, y: 0.6, hitR: 0.85, dmg: 10, melee: true, bits: 3, color: 0xff4d8d, geo: 'tetra' },
  drone:   { hp: 24,  speed: 3.4, r: 0.5,  y: 2.3, hitR: 0.8,  dmg: 8,  fly: true, keep: 9, bits: 3, color: 0xffe14a, geo: 'octa',
             ranged: { rate: 1.9, speed: 14, count: 1, spread: 0 } },
  turret:  { hp: 60,  speed: 0,   r: 0.8,  y: 0.9, hitR: 1.1,  dmg: 9,  bits: 5, color: 0x8cff6a, geo: 'cyl',
             ranged: { rate: 2.2, speed: 12, count: 3, spread: 0.2 } },
  brute:   { hp: 150, speed: 2.5, r: 1.0,  y: 1.1, hitR: 1.45, dmg: 14, melee: true, bits: 10, color: 0xff8a3d, geo: 'box',
             ranged: { rate: 2.8, speed: 11, count: 5, spread: 0.22 } },
  // aims a visible laser for a second, then fires one fast, heavy round
  sniper:  { hp: 40,  speed: 2.4, r: 0.5,  y: 0.95, hitR: 0.8, dmg: 24, keep: 18, sniper: true, bits: 6, color: 0x9fe7ff, geo: 'rod' },
  // blocks bullets from the front but turns slowly (turn rad/s); the shield breaks after shieldHp damage and staggers it
  shield:  { hp: 90,  speed: 3.1, r: 0.8,  y: 1.0, hitR: 1.0,  dmg: 12, melee: true, shield: true, shieldHp: 90, turn: 1.6, bits: 7, color: 0x8cc8ff, geo: 'slab' },
  // rushes in and detonates; also blows up when shot, hurting nearby enemies too
  bomber:  { hp: 16,  speed: 7.8, r: 0.5,  y: 0.6, hitR: 0.75, dmg: 26, bomber: true, bits: 3, color: 0xffb13d, geo: 'ico' },
  splitter:{ hp: 70,  speed: 4.0, r: 0.8,  y: 0.9, hitR: 1.1,  dmg: 12, melee: true, split: true, bits: 6, color: 0x7dffcf, geo: 'dodeca' },
  // Bastion's shield generators (boss minion only)
  bturret: { hp: 200, speed: 0,   r: 0.8,  y: 0.9, hitR: 1.2,  dmg: 9,  bits: 2, color: 0xffb347, geo: 'cyl',
             ranged: { rate: 1.7, speed: 13, count: 3, spread: 0.16 } },
  mini:    { hp: 16,  speed: 7.2, r: 0.4,  y: 0.4, hitR: 0.6,  dmg: 6,  melee: true, bits: 1, color: 0x7dffcf, geo: 'tetraS' },
};
const PER = 5; // 4 floors + boss per sector
const PRES_UP = [
  { id: 'gain',   name: '採掘効率',   max: 5, cost: 1, desc: l => `ビット獲得 +10% / 段（現在 +${l * 10}%）` },
  { id: 'hp',     name: '強化外骨格', max: 5, cost: 1, desc: l => `最大HP +10 / 段（現在 +${l * 10}）` },
  { id: 'funds',  name: '初期資金',   max: 3, cost: 1, desc: l => `再起動直後のビット +150 / 段（現在 +${l * 150}）` },
  { id: 'relic',  name: '遺物',       max: 2, cost: 2, desc: l => `再起動直後、倉庫に試作武器が入る（現在 ${l} 本）` },
  { id: 'choice', name: '選択肢拡張', max: 1, cost: 3, desc: l => `チップの候補が4枚になる（${l ? '取得済み' : '未取得'}）` },
];
const presMul = () => 1 + save.pres.count * 0.15;
// touch button layout: x/y are the centre as a fraction of the screen, b is the base size in px
const LAYOUT_DEF = {
  fire:   { x: 0.88,  y: 0.74, s: 1, b: 88, name: '射撃' },
  dash:   { x: 0.955, y: 0.44, s: 1, b: 64, name: 'ダッシュ' },
  reload: { x: 0.75,  y: 0.86, s: 1, b: 50, name: 'リロード' },
  kit:    { x: 0.86,  y: 0.3,  s: 1, b: 50, name: '回復' },
  fire2:  { x: 0.2,   y: 0.5,  s: 1, b: 58, name: '左の射撃' },
};
const STASH_MAX = 12, BAG_MAX = 4, KIT_MAX = 3;
const ASSIST = { off: 0, weak: 0.04, strong: 0.1 };
const GUIDE_DESK = [['移動', 'W A S D'], ['視点', 'マウス（画面クリックでロック）'], ['射撃', '左クリック'], ['ダッシュ', 'Space / Shift（スタミナ消費、短い無敵）'],
  ['リロード', 'R（弾切れで自動）'], ['武器の持ち替え', 'Q / 1 / 2 / ホイール'], ['武器を拾う', 'E'], ['回復キット', 'H'], ['バッグ', 'Tab / I'], ['全体マップ', 'M'], ['一時停止', 'Esc / P']];
const GUIDE_TOUCH = [['移動', '画面左をドラッグ'], ['視点', '画面右をドラッグ'], ['射撃', '右の射撃ボタン（押したままドラッグで視点も動く）/ 左の小さい射撃ボタン'], ['ダッシュ', '右端のダッシュボタン（スタミナ消費、短い無敵）。設定でスティック倒し切りにもできる'],
  ['リロード', 'リロードボタン（弾切れで自動）'], ['武器の持ち替え', '画面下の武器欄をタップ'], ['武器を拾う', '近づくと出る「拾う」ボタン'], ['回復キット', '回復ボタン'], ['バッグ', '右上の BAG'], ['全体マップ', 'ミニマップをタップ']];

// ================= save =================
const SAVE_KEY = 'sector-dive-v1';
const basicW = id => ({ id, r: 0, basic: true });
const defaultSave = () => ({ bits: 0, up: { hp: 0, dmg: 0, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0 }, unlocked: { pistol: true },
  loadout: [basicW('pistol'), null], stash: [], shortcut: 0, startTier: 0,
  best: 0, runs: 0, bossKills: 0, canReboot: false, pres: { count: 0, pts: 0, up: { gain: 0, hp: 0, funds: 0, relic: 0, choice: 0 } },
  settings: { autofire: isTouch, assist: 'weak', sens: 1, leftFire: true, stickDash: false, layout: {} } });
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
      return out;
    }
  } catch (e) {}
  return d;
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const sellValue = w => Math.round(8 + WEAPONS[w.id].cost * 0.06 + [0, 20, 55][w.r] + (w.plus || 0) * 10 + (w.opts || []).length * 20);

// ================= audio =================
let actx = null, master = null, noiseBuf = null;
const lastSfx = {};
function audioInit() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.32; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function tone(freq, dur, type, vol, slide, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
const SFX = {
  pistol: () => tone(560, 0.08, 'square', 0.16, 0.4),
  smg: () => tone(760, 0.05, 'square', 0.09, 0.5),
  shotgun: () => { noise(0.2, 0.35, 1600); tone(150, 0.16, 'sawtooth', 0.18, 0.4); },
  rail: () => { tone(1400, 0.35, 'sawtooth', 0.14, 0.12); noise(0.15, 0.2, 4000); },
  launcher: () => { noise(0.35, 0.3, 900); tone(180, 0.3, 'sawtooth', 0.18, 0.5); },
  hit: () => tone(1000, 0.035, 'square', 0.06, 0.7),
  kill: () => tone(320, 0.12, 'square', 0.12, 2.2),
  boom: () => { noise(0.5, 0.5, 520); tone(80, 0.4, 'sine', 0.35, 0.5); },
  bigboom: () => { noise(1.0, 0.7, 380); tone(60, 0.8, 'sine', 0.5, 0.4); noise(0.3, 0.4, 3000); },
  hurt: () => tone(150, 0.22, 'sawtooth', 0.26, 0.5),
  pick: () => tone(900, 0.07, 'sine', 0.14, 1.6),
  chip: () => { tone(660, 0.1, 'triangle', 0.22, 1.5); tone(990, 0.16, 'triangle', 0.22, 1.3, 0.09); },
  eshot: () => tone(330, 0.08, 'triangle', 0.06, 0.6),
  dash: () => noise(0.14, 0.22, 2600),
  empty: () => tone(1800, 0.03, 'square', 0.08),
  reload: () => { tone(420, 0.05, 'square', 0.1); },
  reloaded: () => { tone(700, 0.05, 'square', 0.12); tone(900, 0.05, 'square', 0.12, 0, 0.07); },
  portal: () => tone(220, 0.9, 'sine', 0.28, 4),
  beam: () => tone(90, 0.5, 'sawtooth', 0.12, 1.4),
  heal: () => { tone(500, 0.12, 'sine', 0.2, 1.5); tone(750, 0.2, 'sine', 0.2, 1.3, 0.1); },
};
function sfx(name, gap) {
  const now = performance.now();
  if (gap && lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now; SFX[name]();
}
