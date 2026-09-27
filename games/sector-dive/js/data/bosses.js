'use strict';
// Bosses: names, order, tuning (each boss's behaviour is in js/bosses/)
const BOSS_META = {
  watcher: { pillars: true },
  crusher: { pillars: true },
  core:    { pillars: false },
  phantom: { pillars: true },
  trinity: { pillars: false },
  bastion: { pillars: false },
};
const BOSS_ORDER = ['watcher', 'crusher', 'core', 'phantom', 'trinity', 'bastion'];
// bosses: health at the D1 boss (x1.33 base) times hpMul, growing by `growth` per depth after that
const BOSS_TUNE = {
  hpMul: 1.3,
  growth: 1.85,
  introTime: 2.0,   // seconds a boss takes to appear (invulnerable, name shown)
  phaseTime: 1.2,   // seconds of invulnerability when it drops below half health
};
