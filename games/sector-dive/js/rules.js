'use strict';
// Formulas that read the data: progress, drops, modding, sell value
// progress in "old" 5-stage-per-depth units, so per-depth scaling stays the same whatever PER is
// (depth start = depth * 5, the boss = depth * 5 + 4)
const prog = s => Math.floor(s / PER) * 5 + (s % PER) * 4 / (PER - 1);
const presMul = () => 1 + save.pres.count * 0.15;
// every weapon type can drop during a dive; unlocking only decides what you can start with and mod at the base
const pickDrop = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];
const modOf = id => (save.mods && save.mods[id]) || { plus: 0, r: 0 };
// a basic weapon as it currently stands after modding (non-basic weapons pass through)
const basicNow = w => w && w.basic ? Object.assign({}, w, { plus: modOf(w.id).plus, r: modOf(w.id).r }) : w;
const sellValue = w => Math.round(8 + WEAPONS[w.id].cost * 0.06 + [0, 20, 55][w.r] + (w.plus || 0) * 10 + (w.opts || []).length * 20);
