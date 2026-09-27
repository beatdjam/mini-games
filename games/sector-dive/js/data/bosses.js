'use strict';
// Bosses: names, order, tuning (each boss's behaviour is in js/bosses/)
// pillars: arena has pillars. hp: health at difficulty 1 (times bossDiff). y: body height. hitR: hit radius
const BOSS_META = {
  watcher: { pillars: true, hp: 1300, y: 3.2, hitR: 2.4 },
  crusher: { pillars: true, hp: 1800, y: 1.6, hitR: 2.4 },
  core:    { pillars: false, hp: 2400, y: 2.6, hitR: 2.3 },
  phantom: { pillars: true, hp: 1100, y: 2.2, hitR: 1.6 },
  trinity: { pillars: false, hp: 1700, y: 2.2, hitR: 1.4 },
  bastion: { pillars: false, hp: 1500, y: 2.4, hitR: 2.0 },
};
const BOSS_ORDER = ['watcher', 'crusher', 'core', 'phantom', 'trinity', 'bastion'];
// bosses: health at the D1 boss (x1.33 base) times hpMul, growing by `growth` per depth after that
const BOSS_TUNE = {
  hpMul: 1.3,
  growth: 1.85,
  introTime: 2.0,   // seconds a boss takes to appear (invulnerable, name shown)
  phaseTime: 1.2,   // seconds of invulnerability when it drops below half health
};
