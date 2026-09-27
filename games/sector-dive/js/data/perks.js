'use strict';
// Chips offered during a run
// Chips. v = normal amount, rv = amount on the rare (gold) version; chips without rv never come as rare.
// maxed(p) = true once the chip can't do anything more (it is then left out of the offer). cur(p) = the current value, shown on the card.
// Damage / fire rate / speed stack additively (two 過負荷弾 = +40%), so power grows in a straight line.
const PERKS = [
  { name: '過負荷弾',   v: 0.2,  rv: 0.35, desc: v => `与ダメージ +${pct(v)}`,                 apply: (p, v) => { p.dmgMul += v; }, cur: p => `与ダメージ +${pct(p.dmgMul - 1)}` },
  { name: '連射回路',   v: 0.15, rv: 0.26, desc: v => `連射速度 +${pct(v)}`,                   apply: (p, v) => { p.fireRate += v; }, cur: p => `連射速度 +${pct(p.fireRate - 1)}` },
  { name: '装甲パッチ', v: 20,   rv: 35,   desc: v => `最大HP +${v}、HPを${v}回復`,             apply: (p, v) => { p.maxHp += v; p.hp = Math.min(p.maxHp, p.hp + v); }, cur: p => `最大HP ${p.maxHp}` },
  { name: '修復パッチ', v: 0.5,  rv: 0.85, desc: v => `HPを最大値の${pct(v)}回復`,              apply: (p, v) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * v); }, cur: p => `HP ${Math.ceil(p.hp)} / ${p.maxHp}` },
  { name: '吸収コード', v: 3,    rv: 5,    desc: v => `撃破ごとにHP +${v}`,                     apply: (p, v) => { p.leech += v; }, cur: p => `撃破ごとにHP +${p.leech}` },
  { name: '貫通弾',     v: 1,    rv: 2,    desc: v => `弾が敵を${v}体多く貫通する（チップでは最大3）`, apply: (p, v) => { p.pierce = Math.min(3, p.pierce + v); }, maxed: p => p.pierce >= 3, cur: p => `貫通 +${p.pierce}` },
  { name: '分裂弾',     v: 1,              desc: () => '発射数 +1。全弾当てたときの合計ダメージ +20%（弾数で分け合う）', apply: p => { p.extra += 1; }, cur: p => `発射数 +${p.extra}` },
  { name: '軽量化',     v: 0.12, rv: 0.21, desc: v => `移動速度 +${pct(v)}`,                   apply: (p, v) => { p.spdMul += v; }, cur: p => `移動速度 +${pct(p.spdMul - 1)}` },
  { name: '弱点解析',   v: 0.15, rv: 0.26, desc: v => `会心率 +${pct(v)}（2倍ダメージ、上限40%）`, apply: (p, v) => { p.crit += v; }, maxed: p => p.crit >= TUNE.critCap, cur: p => `会心率 ${pct(p.crit)}` },
  { name: '瞬発回路',   v: 0.35, rv: 0.6,  desc: v => `スタミナ回復 +${pct(v)}`,                apply: (p, v) => { p.stRegen *= 1 + v; }, cur: p => `スタミナ回復 ${Math.round(p.stRegen)} 毎秒` },
  { name: '連鎖爆破',   v: 1,    rv: 2,    desc: v => `撃破した敵が周囲を巻き込んで爆発（Lv +${v}）`, apply: (p, v) => { p.chain += v; }, cur: p => `Lv ${p.chain}` },
  { name: '磁力',       v: 1,              desc: () => 'ビット回収範囲 +80%、獲得 +10%',         apply: p => { p.magnet *= 1.8; p.gainMul *= 1.1; }, cur: p => `回収範囲 ×${p.magnet.toFixed(1)}` },
  { name: '高速装填',   v: 0.25, rv: 0.44, desc: v => `リロード時間 -${pct(v)}（最大 -60%）`,   apply: (p, v) => { p.reloadMul = Math.max(0.4, p.reloadMul - v); }, maxed: p => p.reloadMul <= 0.4, cur: p => `リロード -${pct(1 - p.reloadMul)}` },
  { name: '拡張弾倉',   v: 0.4,  rv: 0.7,  desc: v => `装弾数 +${pct(v)}（最大 +150%）`,        apply: (p, v) => { p.magMul = Math.min(2.5, p.magMul + v); }, maxed: p => p.magMul >= 2.5, cur: p => `装弾数 +${pct(p.magMul - 1)}` },
  { name: '予備タンク', v: 30,   rv: 52,   desc: v => `最大スタミナ +${v}`,                     apply: (p, v) => { p.stMax += v; p.st += v; }, cur: p => `最大スタミナ ${p.stMax}` },
];
