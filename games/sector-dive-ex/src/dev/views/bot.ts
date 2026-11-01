import { BOT_CLIMB_HASH, defaultSave, persist, save, setSave } from '../../core/save.ts';
import { setStartTier } from '../../core/progress.ts';
import { goBase, startRun } from '../../flow/run.ts';
import { state } from '../../flow/state.ts';
import { player } from '../../actors/player.ts';
import { wDmgMul } from '../../actors/weapons.ts';
import { BOT_STYLES, createBot, setBot } from '../bot.ts';
import { buyAtBase, equipBestWeapons } from '../climb.ts';
const NEXT_DIVE_MS = 1000; // how often the climber looks whether its dive is over (ms)
// dev: #bot (or #bot-<style>, src/dev/bot.ts) starts a run played by the bot, to watch it. What it is doing is shown
// in the corner. #bot-climber goes on diving, with a save of its own (core/save.ts saveKeyFor) that stays between
// visits: after each dive it buys levels, takes its two strongest weapons and starts from the deepest depth open.
// #bot-climber-new makes that save again
export function showBot(hash: string) {
  const rest = hash.slice('#bot'.length),
    climbs = hash.startsWith(BOT_CLIMB_HASH);
  if (hash === `${BOT_CLIMB_HASH}-new`) {
    setSave(defaultSave());
    persist();
  }
  setTimeout(() => {
    const style = climbs ? BOT_STYLES.climber! : (BOT_STYLES[rest.slice(1)] ?? BOT_STYLES.rusher!);
    let bot = createBot(style),
      dive = 1;
    const go = () => {
      if (climbs) {
        buyAtBase(style.collect);
        equipBestWeapons();
        setStartTier(save.shortcut);
        persist();
      }
      startRun();
      setBot(bot);
    };
    go();
    if (climbs)
      setInterval(() => {
        if (state !== 'result' && state !== 'base') return;
        goBase();
        bot = createBot(style);
        dive++;
        go();
      }, NEXT_DIVE_MS);
    const note = document.createElement('div');
    note.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#8cff6a;white-space:pre';
    document.body.appendChild(note);
    setInterval(() => {
      const s = bot.stats,
        w = player?.weapons[player.cur],
        climb =
          climbs && player
            ? `\ndive ${dive}  damage ${Math.round(player.dmgMul * player.lvlDmg * (w ? wDmgMul(w) : 0) * 100)}%  hp ${player.maxHp}`
            : '';
      note.textContent = `bot ${bot.style.name}: ${s.doing}\n${(s.frames / 60).toFixed(0)}s  floor ${s.floors}  damage ${s.damage.toFixed(0)}  stuck ${s.stuck}${climb}`;
    }, 200);
  }, 300);
}
