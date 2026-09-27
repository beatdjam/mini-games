'use strict';
// Bosses: names, order, tuning (each boss's behaviour is in js/bosses/)
const BOSS_META = {
  watcher: { pillars: true,  name: 'WATCHER 監視体',   desc: '弾の輪と螺旋弾。体力が減るとドローンを出す' },
  crusher: { pillars: true,  name: 'CRUSHER 圧壊機',   desc: '突進と衝撃波。壁に当てるとスタン' },
  core:    { pillars: false, name: 'NOISE CORE 深層核', desc: '回転レーザーと弾の輪、雑魚召喚' },
  phantom: { pillars: true,  name: 'PHANTOM 狙撃体',   desc: '柱の近くへワープし、予告レーザーのあと狙撃' },
  trinity: { pillars: false, name: 'TRINITY 三連体',   desc: '3体で体力を共有して周回。半分で突進' },
  bastion: { pillars: false, name: 'BASTION 要塞核',   desc: '周りの砲台を全部壊すとしばらく無防備' },
};
const BOSS_ORDER = ['watcher', 'crusher', 'core', 'phantom', 'trinity', 'bastion'];
// bosses: health at the D1 boss (x1.33 base) times hpMul, growing by `growth` per depth after that
const BOSS_TUNE = {
  hpMul: 1.3,
  growth: 1.85,
  introTime: 2.0,   // seconds a boss takes to appear (invulnerable, name shown)
  phaseTime: 1.2,   // seconds of invulnerability when it drops below half health
};
