'use strict';
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// `-touch` at the end of a dev hash (e.g. #view-pick-touch) forces the touch layout for screenshots
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || /-touch$/.test(location.hash);
document.body.classList.add(isTouch ? 'touch' : 'desk');

// ================= data =================
const WEAPONS = {
  pistol:   { name: 'ハンドガン',   dmg: 16, rate: 0.26,  spread: 0.012, pellets: 1, speed: 75,  mag: 12, reload: 1.1, color: 0x54e8ff, cost: 0,   desc: '癖のない単発。リロードが速い。' },
  // SMG: light rounds, very fast, big magazine, no extra spread while moving
  smg:      { name: 'SMG',        dmg: 6,  rate: 0.062, spread: 0.05,  pellets: 1, speed: 70,  mag: 45, reload: 1.7, steady: true, color: 0x8cff6a, cost: 250, desc: '1発は軽いが、連射と装弾数で押し切る。移動しながら撃ってもブレない。' },
  // shotgun: 8 pellets; the closer you are, the more of them land
  shotgun:  { name: 'ショットガン', dmg: 13, rate: 0.7,   spread: 0.065, pellets: 8, speed: 65,  mag: 6,  reload: 2.0, kb: 0.8, color: 0xffc24a, cost: 320, desc: '8発の散弾。近いほど多く当たる。敵を押し返す。' },
  // rail: one heavy piercing round, stronger the farther it travels
  rail:     { name: 'レールガン',   dmg: 90, rate: 1.1,   spread: 0,     pellets: 1, speed: 200, mag: 4,  reload: 2.2, pierce: 4, far: 15, farMul: 1.5, steady: true, color: 0xc58cff, cost: 520, desc: '貫通する高威力の単発。15m以上離れた敵には威力1.5倍。ブレない。' },
  // launcher: slow rocket, full damage near the centre of the blast, knocks enemies back
  launcher: { name: 'ランチャー',   dmg: 52, rate: 1.15,  spread: 0.008, pellets: 1, speed: 28,  mag: 2,  reload: 2.9, blast: 5, grav: 3.5, chipMag: 0.5, color: 0xff6a3d, cost: 700, desc: 'ゆっくり飛ぶロケット。爆心付近は威力が落ちず、敵を吹き飛ばす。近くで撃つと自分も巻き込む。' },
};
const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rail', 'launcher'];
const DROP_POOL = ['pistol', 'pistol', 'smg', 'smg', 'smg', 'shotgun', 'shotgun', 'shotgun', 'rail', 'rail', 'launcher'];
// every weapon type can drop during a dive; unlocking only decides what you can start with and mod at the base
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
// Chips. v = normal amount, rv = amount on the rare (gold) version; chips without rv never come as rare.
// maxed(p) = true once the chip can't do anything more (it is then left out of the offer).
// Damage / fire rate / speed stack additively (two 過負荷弾 = +40%), so power grows in a straight line.
const pct = v => `${Math.round(v * 100)}%`;
const PERKS = [
  { name: '過負荷弾',   v: 0.2,  rv: 0.35, desc: v => `与ダメージ +${pct(v)}`,                 apply: (p, v) => { p.dmgMul += v; } },
  { name: '連射回路',   v: 0.15, rv: 0.26, desc: v => `連射速度 +${pct(v)}`,                   apply: (p, v) => { p.fireRate += v; } },
  { name: '装甲パッチ', v: 20,   rv: 35,   desc: v => `最大HP +${v}、HPを${v}回復`,             apply: (p, v) => { p.maxHp += v; p.hp = Math.min(p.maxHp, p.hp + v); } },
  { name: '修復パッチ', v: 0.5,  rv: 0.85, desc: v => `HPを最大値の${pct(v)}回復`,              apply: (p, v) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * v); } },
  { name: '吸収コード', v: 3,    rv: 5,    desc: v => `撃破ごとにHP +${v}`,                     apply: (p, v) => { p.leech += v; } },
  { name: '貫通弾',     v: 1,    rv: 2,    desc: v => `弾が敵を${v}体多く貫通する（チップでは最大3）`, apply: (p, v) => { p.pierce = Math.min(3, p.pierce + v); }, maxed: p => p.pierce >= 3 },
  { name: '分裂弾',     v: 1,              desc: () => '発射数 +1。全弾当てたときの合計ダメージ +20%（弾数で分け合う）', apply: p => { p.extra += 1; } },
  { name: '軽量化',     v: 0.12, rv: 0.21, desc: v => `移動速度 +${pct(v)}`,                   apply: (p, v) => { p.spdMul += v; } },
  { name: '弱点解析',   v: 0.15, rv: 0.26, desc: v => `会心率 +${pct(v)}（2倍ダメージ、上限40%）`, apply: (p, v) => { p.crit += v; }, maxed: p => p.crit >= TUNE.critCap },
  { name: '瞬発回路',   v: 0.35, rv: 0.6,  desc: v => `スタミナ回復 +${pct(v)}`,                apply: (p, v) => { p.stRegen *= 1 + v; } },
  { name: '連鎖爆破',   v: 1,    rv: 2,    desc: v => `撃破した敵が周囲を巻き込んで爆発（Lv +${v}）`, apply: (p, v) => { p.chain += v; } },
  { name: '磁力',       v: 1,              desc: () => 'ビット回収範囲 +80%、獲得 +10%',         apply: p => { p.magnet *= 1.8; p.gainMul *= 1.1; } },
  { name: '高速装填',   v: 0.25, rv: 0.44, desc: v => `リロード時間 -${pct(v)}（最大 -60%）`,   apply: (p, v) => { p.reloadMul = Math.max(0.4, p.reloadMul - v); }, maxed: p => p.reloadMul <= 0.4 },
  { name: '拡張弾倉',   v: 0.4,  rv: 0.7,  desc: v => `装弾数 +${pct(v)}（最大 +150%）`,        apply: (p, v) => { p.magMul = Math.min(2.5, p.magMul + v); }, maxed: p => p.magMul >= 2.5 },
  { name: '予備タンク', v: 30,   rv: 52,   desc: v => `最大スタミナ +${v}`,                     apply: (p, v) => { p.stMax += v; p.st += v; } },
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
    gen: { kind: 'rooms', map: 34, countMin: 7, countMax: 8, roomMin: 4, roomMax: 6, platform: 0.2, bridges: 4, density: 4, hazard: { count: 10, color: 0x3dffb4, name: '漏電床' }, ceiling: true, neon: true },
    hint: '緑に光る床は漏電している。光っている間は踏まない',
    enemies: ['crawler', 'bomber', 'turret', 'splitter', 'crawler'], bosses: ['trinity', 'watcher'] },
  { name: '旧市街ビル群', code: 'CITY', fog: 0x140e06, fogNear: 8, fogFar: 64, floor: '#1b150c', line: '#a06d24', wall: '#221a0e', wallLine: '#ffb347',
    gen: { kind: 'rooms', map: 44, roomMin: 6, roomMax: 9, corridorW: 2, platform: 0.8, rubble: 0.06 },
    hint: '見通しが良い。狙撃手のレーザーに注意',
    enemies: ['sniper', 'drone', 'shield', 'turret', 'crawler', 'sniper'], bosses: ['bastion', 'phantom'] },
];
const BOSS_META = {
  watcher: { pillars: true,  name: 'WATCHER 監視体',   desc: '弾の輪と螺旋弾。体力が減るとドローンを出す' },
  crusher: { pillars: true,  name: 'CRUSHER 圧壊機',   desc: '突進と衝撃波。壁に当てるとスタン' },
  core:    { pillars: false, name: 'NOISE CORE 深層核', desc: '回転レーザーと弾の輪、雑魚召喚' },
  phantom: { pillars: true,  name: 'PHANTOM 狙撃体',   desc: '柱の近くへワープし、予告レーザーのあと狙撃' },
  trinity: { pillars: false, name: 'TRINITY 三連体',   desc: '3体で体力を共有して周回。半分で突進' },
  bastion: { pillars: false, name: 'BASTION 要塞核',   desc: '周りの砲台を全部壊すとしばらく無防備' },
};
const BOSS_ORDER = ['watcher', 'crusher', 'core', 'phantom', 'trinity', 'bastion'];
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
  bturret: { hp: 140, speed: 0,   r: 0.8,  y: 0.9, hitR: 1.2,  dmg: 9,  bits: 2, color: 0xffb347, geo: 'cyl',
             ranged: { rate: 1.7, speed: 13, count: 3, spread: 0.16 } },
  mini:    { hp: 16,  speed: 7.2, r: 0.4,  y: 0.4, hitR: 0.6,  dmg: 6,  melee: true, bits: 1, color: 0x7dffcf, geo: 'tetraS' },
};
// player-side tuning knobs. Enemy numbers live in ENEMY, boss numbers in js/bosses/*.js
const TUNE = {
  hp: 100,              // base max HP (armour upgrade adds 15 per level)
  moveSpeed: 7.4,       // base move speed (m/s)
  stamina: 100,         // base max stamina (endurance upgrade adds 20 per level)
  staminaRegen: 34,     // stamina per second (cooling upgrade adds 12% per level)
  staminaDelay: 0.5,    // seconds after a dash before stamina refills
  dashCost: 45,
  dashTime: 0.2,        // seconds
  dashSpeed: 3.3,       // multiplier on move speed while dashing
  dashInvuln: 0.32,     // seconds of invulnerability from a dash
  hitInvuln: 0.45,      // seconds of invulnerability after taking a hit
  kitHeal: 40,
  kitStart: 1,          // kits at the start of a run (first-aid upgrade adds 1 per level)
  kitDropChance: 0.06,  // chance an enemy drops a kit
  chipChance: 0.5,      // chance a cleared room gives a chip (otherwise a kit + bits); about 8 chips per depth incl. the boss
  rareChipChance: 0.12, // chance each offered chip is the rare (gold, stronger) version
  critCap: 0.4,         // crit chance can't go above this
  deathBitsKeep: 0.5,   // share of the run's bits kept on death / abandon
};
// regular enemies (not bosses): overall knobs on top of the per-type numbers in ENEMY
const ENEMY_TUNE = {
  maxPerRoom: 11,     // cap on enemies in one room
  elitePerDepth: 0.1, // per depth, extra chance a spawn is one of the biome's tougher types (up to eliteMax)
  eliteMax: 0.5,
  hpMul: 1.4,         // health multiplier
  dmgMul: 1.25,       // damage multiplier
  fireInterval: 0.85, // multiplier on ranged / sniper cooldowns (smaller = shoots more often)
  wakeTiles: 7,       // wakes when the player is within this many tiles of walking distance and in sight
};
// health grows by these factors per depth (compounding). Enemies trail the player's growth a little; bosses stay a wall.
const DEPTH_HP_GROWTH = 1.55;
// bosses: health at the D1 boss (x1.33 base) times hpMul, growing by `growth` per depth after that
const BOSS_TUNE = {
  hpMul: 1.3,
  growth: 1.85,
  introTime: 2.0,   // seconds a boss takes to appear (invulnerable, name shown)
  phaseTime: 1.2,   // seconds of invulnerability when it drops below half health
};
// tougher enemy types, favoured more the deeper you go
const ELITE_TYPES = ['sniper', 'shield', 'brute', 'bomber', 'splitter', 'turret'];
const PER = 4; // 3 floors + boss per depth
// progress in "old" 5-stage-per-depth units, so per-depth scaling stays the same whatever PER is
// (depth start = depth * 5, the boss = depth * 5 + 4)
const prog = s => Math.floor(s / PER) * 5 + (s % PER) * 4 / (PER - 1);
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
  ['リロード', 'R（弾切れで自動）'], ['武器の持ち替え', 'Q / 1 / 2 / ホイール'], ['武器を拾う', 'G で持ち替え / E でバッグへ'], ['回復キット', 'H'], ['バッグ', 'Tab / I'], ['全体マップ', 'M'], ['一時停止', 'Esc / P']];
const GUIDE_TOUCH = [['移動', '画面左をドラッグ'], ['視点', '画面右をドラッグ'], ['射撃', '右の射撃ボタン（押したままドラッグで視点も動く）/ 左の小さい射撃ボタン'], ['ダッシュ', '右端のダッシュボタン（スタミナ消費、短い無敵）。設定でスティック倒し切りにもできる'],
  ['リロード', 'リロードボタン（弾切れで自動）'], ['武器の持ち替え', '画面下の武器欄をタップ'], ['武器を拾う', '近づくと出る「持ち替え」「バッグへ」ボタン'], ['回復キット', '回復ボタン'], ['バッグ', '右上の BAG'], ['全体マップ', 'ミニマップをタップ']];

// ================= save =================
const SAVE_KEY = 'sector-dive-v1';
const basicW = id => ({ id, r: 0, basic: true });
// base-side modding of basic weapons: persistent +value / rarity per weapon type (kept on death)
const MOD_PLUS_MAX = 10;
const modPlusCost = plus => Math.round(50 * Math.pow(1.5, plus));
const MOD_RARITY_COST = [300, 900]; // to ★★ and to ★★★
const modOf = id => (save.mods && save.mods[id]) || { plus: 0, r: 0 };
// a basic weapon as it currently stands after modding (non-basic weapons pass through)
const basicNow = w => w && w.basic ? Object.assign({}, w, { plus: modOf(w.id).plus, r: modOf(w.id).r }) : w;
const defaultSave = () => ({ bits: 0, up: { hp: 0, dmg: 0, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0 }, unlocked: { pistol: true },
  loadout: [basicW('pistol'), null], stash: [], shortcut: 0, startTier: 0,
  best: 0, runs: 0, bossKills: 0, bossSeen: {}, stageV: 2, mods: {}, canReboot: false, pres: { count: 0, pts: 0, up: { gain: 0, hp: 0, funds: 0, relic: 0, choice: 0 } },
  settings: { autofire: isTouch, assist: 'weak', sens: 1, bgm: 0.6, sfx: 1, leftFire: true, stickDash: false, layout: {} } });
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
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const sellValue = w => Math.round(8 + WEAPONS[w.id].cost * 0.06 + [0, 20, 55][w.r] + (w.plus || 0) * 10 + (w.opts || []).length * 20);

// ================= audio =================
let actx = null, master = null, noiseBuf = null;
const lastSfx = {};
function audioInit() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    // effects bus -> light compressor so layered shots stay punchy without clipping
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.012; comp.release.value = 0.15;
    master = actx.createGain(); master.connect(comp); comp.connect(actx.destination); applySfxVolume();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicInit(); // js/music.js
  } catch (e) { actx = null; }
}
function applySfxVolume() { if (master) master.gain.value = 0.32 * (save.settings.sfx ?? 1); }
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
// ---- layered sound effects ----
// nz: filtered noise with a filter sweep f0 -> f1; ot: oscillator with a pitch sweep f0 -> f1.
// Gun shots stack a transient crack, a body, a low thump and a tail, with a little random pitch per shot.
function nz(t, dur, vol, type, f0, f1, q) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q || 0.8;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || f0), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function ot(t, type, f0, f1, dur, vol, att) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (att || 0.002)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function gunshot(o) {
  if (!actx) return;
  const t = actx.currentTime, r = rand(0.92, 1.08);
  nz(t, 0.02, o.crack, 'highpass', (o.crackF || 5000) * r, 3000);                    // transient crack
  nz(t, o.body, o.bodyVol, 'bandpass', o.bodyF * r, o.bodyF * (o.bodyEnd || 0.35), 1.2); // body
  ot(t, 'sine', o.thumpF * r, 35, o.thump, o.thumpVol);                                // low thump
  nz(t + 0.01, o.tail, o.tailVol, 'lowpass', (o.tailF || 2200) * r, 300);             // tail
}
const SFX = {
  // pistol: snappy — bright short body, light thump, short bright tail
  pistol: () => gunshot({ crack: 0.5, crackF: 6500, body: 0.06, bodyVol: 0.3, bodyF: 2800, bodyEnd: 0.7, thumpF: 220, thump: 0.05, thumpVol: 0.18, tail: 0.15, tailVol: 0.08, tailF: 3800 }),
  smg: () => gunshot({ crack: 0.22, body: 0.07, bodyVol: 0.22, bodyF: 2400, thumpF: 180, thump: 0.07, thumpVol: 0.2, tail: 0.14, tailVol: 0.06 }),
  shotgun: () => {
    gunshot({ crack: 0.45, body: 0.22, bodyVol: 0.55, bodyF: 1100, thumpF: 110, thump: 0.25, thumpVol: 0.6, tail: 0.5, tailVol: 0.22 });
    const t = actx.currentTime + 0.32; // pump: back and forward
    nz(t, 0.05, 0.25, 'bandpass', 1400, 900, 3); nz(t + 0.09, 0.06, 0.3, 'bandpass', 1900, 1200, 3);
  },
  rail: () => {
    const t = actx.currentTime;
    ot(t, 'sawtooth', 2600, 180, 0.45, 0.18); ot(t, 'square', 1300, 90, 0.3, 0.1);   // electric zap falling into a hum
    nz(t, 0.12, 0.35, 'highpass', 6000, 2500); nz(t, 0.6, 0.12, 'bandpass', 3000, 400, 4); // crackle and shimmer tail
    ot(t, 'sine', 90, 30, 0.35, 0.45);
  },
  launcher: () => {
    const t = actx.currentTime;
    ot(t, 'sine', 120, 40, 0.3, 0.55);                   // launch thump
    nz(t, 0.45, 0.35, 'bandpass', 500, 2500, 1.5);         // rising whoosh
    nz(t, 0.06, 0.3, 'highpass', 3000, 2000);
  },
  hit: () => { const t = actx.currentTime; nz(t, 0.03, 0.12, 'bandpass', 3200 * rand(0.9, 1.1), 2000, 4); ot(t, 'square', 1400, 900, 0.03, 0.03); },
  kill: () => { const t = actx.currentTime; nz(t, 0.18, 0.3, 'bandpass', 900, 250, 2); ot(t, 'square', 420, 90, 0.16, 0.1); nz(t, 0.05, 0.15, 'highpass', 4000, 2500); },
  boom: () => { const t = actx.currentTime; ot(t, 'sine', 90, 30, 0.5, 0.6); nz(t, 0.6, 0.5, 'lowpass', 1400, 120); nz(t, 0.08, 0.3, 'highpass', 3000, 1500); },
  bigboom: () => {
    const t = actx.currentTime;
    ot(t, 'sine', 70, 22, 1.0, 0.8); nz(t, 1.2, 0.7, 'lowpass', 1800, 80); nz(t, 0.1, 0.4, 'highpass', 3500, 1500);
    nz(t + 0.15, 0.9, 0.15, 'bandpass', 2500, 600, 2); // debris
  },
  hurt: () => { const t = actx.currentTime; ot(t, 'sine', 130, 50, 0.25, 0.5); nz(t, 0.2, 0.35, 'lowpass', 900, 200); ot(t, 'sawtooth', 220, 110, 0.18, 0.08); },
  pick: () => { const t = actx.currentTime; ot(t, 'sine', 900, 1500, 0.08, 0.14); nz(t, 0.03, 0.08, 'highpass', 5000, 5000); },
  chip: () => { tone(660, 0.1, 'triangle', 0.22, 1.5); tone(990, 0.16, 'triangle', 0.22, 1.3, 0.09); },
  eshot: () => { const t = actx.currentTime; ot(t, 'square', 520 * rand(0.9, 1.1), 180, 0.12, 0.05); nz(t, 0.06, 0.06, 'bandpass', 1500, 700, 2); },
  dash: () => { const t = actx.currentTime; nz(t, 0.22, 0.28, 'bandpass', 800, 3500, 1.2); ot(t, 'sine', 200, 90, 0.15, 0.12); },
  empty: () => { const t = actx.currentTime; nz(t, 0.025, 0.2, 'bandpass', 2800, 2600, 6); },
  reload: () => { const t = actx.currentTime; nz(t, 0.05, 0.25, 'bandpass', 1200, 800, 4); ot(t, 'square', 300, 180, 0.05, 0.06); },   // mag out
  reloaded: () => { const t = actx.currentTime; nz(t, 0.04, 0.3, 'bandpass', 1800, 1400, 5); nz(t + 0.07, 0.05, 0.35, 'bandpass', 2400, 1600, 5); ot(t + 0.07, 'square', 500, 300, 0.04, 0.05); }, // mag in, slide
  portal: () => tone(220, 0.9, 'sine', 0.28, 4),
  beam: () => { const t = actx.currentTime; ot(t, 'sawtooth', 70, 140, 0.6, 0.12, 0.3); nz(t, 0.6, 0.08, 'bandpass', 400, 1600, 6); },
  heal: () => { tone(500, 0.12, 'sine', 0.2, 1.5); tone(750, 0.2, 'sine', 0.2, 1.3, 0.1); },
};
function sfx(name, gap) {
  if (!actx) return; // no audio yet (before the first tap) or not supported
  const now = performance.now();
  if (gap && lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now; SFX[name]();
}
