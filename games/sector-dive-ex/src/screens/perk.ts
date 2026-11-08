import type { Perk } from '../data/types.ts';
import { el, shuffle } from '@engine/core/index.ts';
import { t } from '@engine/core/index.ts';
import { sfx } from '@engine/audio/index.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/index.ts';
import { DEPTH_SCALE, TUNE } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { perkRecord } from '../core/rules.ts';
import { usingRestriction } from '../core/progress.ts';
import { PERKS } from '../data/perks.ts';
import { player, run } from '../actors/player.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show } from '../flow/state.ts';
import { statsHTML } from './pause.ts';

// one chip card: name (★ and + when rare), what it does, what you have now. A shortcut supply card shows how many times
// the chip is applied (×N); an ordinary pick shows its effect doubled instead, since one pick counts DEPTH_SCALE times
const perkCard = (o: Perk, v: number, rare: boolean, times: number, supply: boolean): string => {
  const name = `${rare ? '★ ' : ''}${o.name}${rare ? '+' : ''}${supply ? t('perk.times', { n: times }) : ''}`;
  const cur = t('perk.cur', { v: o.curText(o.cur(player)) });
  return `<span class="pn">${name}</span><span class="pd">${o.desc(supply ? v : v * times)}</span><span class="pcur">${cur}</span>`;
};
// the chip screen without the terminal's parts (screens/levelup.ts): its note, "done" button and the bag's weapons to
// sell. A starting chip bought at the terminal is picked on this same screen, so they must not stay on it
export function hideTerminalParts() {
  el('#scrPerk').dataset.mode = '';
  for (const id of ['#levelNote', '#perkDone', '#sellAll', '#sellHead', '#sellList']) el(id).hidden = true;
}
// baseTimes: how many picks this offer already stands for (a shortcut supply pick counts TUNE.supplyTimes). Every chip
// picked is applied baseTimes * DEPTH_SCALE times, stopping early once it is maxed
// allRare: every choice is the rare version (only the chips that have one are offered)
export function openPerk(title: string, eyebrow?: string, done?: () => void, baseTimes = 1, allRare = false) {
  const supply = baseTimes > 1,
    times = baseTimes * DEPTH_SCALE;
  setState('perk');
  releaseInputs();
  exitLock();
  bigmap.hidden = true;
  hideTerminalParts();
  el('#perkTitle').textContent = title;
  el('#perkEyebrow').textContent = eyebrow || 'chip acquired';
  const offered = PERKS.filter(
    o => !(o.maxed && o.maxed(player)) && !(supply && o.noSupply) && !(allRare && o.rv === undefined),
  );
  // the 'pick' restriction takes the choice away: one card, whatever way the offer came
  const count = usingRestriction('pick') ? 1 : 3 + (run.choice ?? save.up.choice ?? 0);
  const opts = shuffle(offered)
    .slice(0, count)
    .map(o => ({ o, rare: o.rv !== undefined && (allRare || Math.random() < TUNE.rareChipChance) }));
  const list = el('#perkList');
  list.innerHTML = '';
  list.style.setProperty('--n', String(opts.length)); // one row, however many options
  opts.forEach(({ o, rare }) => {
    const v = rare ? o.rv! : o.v;
    const b = document.createElement('button');
    b.className = 'perk' + (rare ? ' rare' : '');
    b.dataset.perk = o.id; // (for the bot: src/dev/bot.ts)
    b.innerHTML = perkCard(o, v, rare, times, supply);
    b.addEventListener('click', () => {
      for (let k = 0; k < times && !(k && o.maxed && o.maxed(player)); k++) {
        o.apply(player, v);
        run.perks.push(perkRecord(o.id, rare));
      }
      sfx('chip');
      show(null);
      setState('play');
      weaponHud();
      requestLock();
      if (done) done();
    });
    list.appendChild(b);
  });
  el('#perkStats').innerHTML = statsHTML();
  show('#scrPerk');
}
