'use strict';
// Run structure, balance numbers, base upgrades, reboot upgrades, inventory sizes
const PER = 4; // 3 floors + boss per depth
// health grows by these factors per depth (compounding). Enemies trail the player's growth a little; bosses stay a wall.
const DEPTH_HP_GROWTH = 1.55;
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
const PRES_UP = [
  { id: 'gain',   name: '採掘効率',   max: 5, cost: 1, desc: l => `ビット獲得 +10% / 段（現在 +${l * 10}%）` },
  { id: 'hp',     name: '強化外骨格', max: 5, cost: 1, desc: l => `最大HP +10 / 段（現在 +${l * 10}）` },
  { id: 'funds',  name: '初期資金',   max: 3, cost: 1, desc: l => `再起動直後のビット +150 / 段（現在 +${l * 150}）` },
  { id: 'relic',  name: '遺物',       max: 2, cost: 2, desc: l => `再起動直後、倉庫に試作武器が入る（現在 ${l} 本）` },
  { id: 'choice', name: '選択肢拡張', max: 1, cost: 3, desc: l => `チップの候補が4枚になる（${l ? '取得済み' : '未取得'}）` },
];
const STASH_MAX = 12, BAG_MAX = 4, KIT_MAX = 3;
const ASSIST = { off: 0, weak: 0.04, strong: 0.1 };
