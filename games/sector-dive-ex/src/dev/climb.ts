import type { WeaponItem } from '../data/types.ts';
import { UPGRADES } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { buyUpgrade } from '../core/progress.ts';
import { nextLevelCost } from '../core/rules.ts';
import { newPlayer, player, setPlayer } from '../actors/player.ts';
import { weaponStats } from '../actors/weapons.ts';
import { nextPoint } from './bot.ts';
// What a player does at the base between dives, for the bot that goes on diving (sim/bot.sim.ts, dev/views/bot.ts)
// The save's bits go on levels (the same picks as at the terminals: nextPoint)
export function buyAtBase(collect: boolean) {
  for (;;) {
    const cost = nextLevelCost(),
      id = nextPoint(collect, id => save.bits >= cost && (save.up[id] || 0) < UPGRADES.find(u => u.id === id)!.max);
    if (!id) return;
    buyUpgrade(id, cost);
  }
}
// Between dives: the two strongest weapons held or in the stash go on (the same comparison the bot makes on the floor,
// weaponStats().dps), so what one dive brings home is what the next one sets out with
export function equipBestWeapons() {
  // (weaponStats reads the player: stand in the one the next dive would set out with, at the depth it starts from)
  const held = player;
  setPlayer(newPlayer(save.loadout, save.shortcut));
  try {
    const all = [...save.loadout, ...save.stash].filter((w): w is WeaponItem => !!w),
      best = [...all].sort((a, b) => weaponStats(b).dps - weaponStats(a).dps).slice(0, 2);
    // (set directly, not one by one with equipWeapon: a weapon moved between the slots would stay in both)
    save.loadout = [best[0] ?? null, best[1] ?? null];
    save.stash = all.filter(w => !best.includes(w) && !w.basic);
  } finally {
    setPlayer(held);
  }
}
