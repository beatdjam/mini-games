'use strict';
// Weapons: types, rarity, options, drop pool, base-side modding costs
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
// rarity rank is shown as stars and a grey -> blue -> gold colour so the order reads at a glance
const RARITY = [
  { name: '標準', stars: '★',   mult: 1,    css: '#9aa8b4', hex: 0x9aa8b4 },
  { name: '改良', stars: '★★',  mult: 1.25, css: '#4da6ff', hex: 0x4da6ff },
  { name: '試作', stars: '★★★', mult: 1.55, css: '#ffc24a', hex: 0xffc24a },
];
// weapon options: only active while that weapon is in hand
const AFFIX = {
  mag:    { name: '大容量弾倉',   text: '装弾数 +30%' },
  reload: { name: '速射装填',     text: 'リロード -20%' },
  rate:   { name: '高速機関',     text: '連射速度 +10%' },
  crit:   { name: '照準補正',     text: '会心率 +8%' },
  leech:  { name: '吸収回路',     text: '撃破ごとにHP +2' },
  speed:  { name: '軽量フレーム', text: '移動速度 +6%' },
  pierce: { name: '徹甲弾',       text: '貫通 +1' },
  gain:   { name: '採集機構',     text: 'ビット獲得 +10%' },
};
const PLUS_DMG = 0.08;
// base-side modding of basic weapons: persistent +value / rarity per weapon type (kept on death)
const MOD_PLUS_MAX = 10;
const modPlusCost = plus => Math.round(50 * Math.pow(1.5, plus));
const MOD_RARITY_COST = [300, 900]; // to ★★ and to ★★★
