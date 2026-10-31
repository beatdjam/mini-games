import { startRun } from '../../flow/run.ts';
import { BOT_STYLES, createBot, setBot } from '../bot.ts';
// dev: #bot (or #bot-<style>, src/dev/bot.ts) starts a run played by the bot, to watch it. What it is doing is shown
// in the corner
export function showBot(hash: string) {
  const rest = hash.slice('#bot'.length);
  setTimeout(() => {
    const bot = createBot(BOT_STYLES[rest.slice(1)] ?? BOT_STYLES.rusher!);
    startRun();
    setBot(bot);
    const note = document.createElement('div');
    note.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#8cff6a;white-space:pre';
    document.body.appendChild(note);
    setInterval(() => {
      const s = bot.stats;
      note.textContent = `bot ${bot.style.name}: ${s.doing}\n${(s.frames / 60).toFixed(0)}s  floor ${s.floors}  damage ${s.damage.toFixed(0)}  stuck ${s.stuck}`;
    }, 200);
  }, 300);
}
