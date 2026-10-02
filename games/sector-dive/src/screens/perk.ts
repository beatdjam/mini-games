import type { Perk } from '../data/types.ts';
import { el, shuffle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { TUNE } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { PERKS } from '../data/perks.ts';
import { player, run } from '../actors/player.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show } from '../flow/state.ts';
import { statsHTML } from './pause.ts';

// one chip card: name (★ and + when rare), what it does, what you have now
const perkCard = (o: Perk, v: number, rare: boolean, times: number): string => {
  const name = `${rare ? '★ ' : ''}${o.name}${rare ? '+' : ''}${times > 1 ? t('perk.times', { n: times }) : ''}`;
  const cur = t('perk.cur', { v: o.curText(o.cur(player)) });
  return `<span class="pn">${name}</span><span class="pd">${o.desc(v)}</span><span class="pcur">${cur}</span>`;
};
// times: the chosen chip is applied that many times (shortcut supply), stopping early once it is maxed
export function openPerk(title: string, eyebrow?: string, done?: () => void, times = 1) {
  setState('perk');
  releaseInputs();
  exitLock();
  bigmap.hidden = true;
  el('#perkTitle').textContent = title;
  el('#perkEyebrow').textContent = eyebrow || 'chip acquired';
  const opts = shuffle(PERKS.filter(o => !(o.maxed && o.maxed(player)) && !(times > 1 && o.noSupply)))
    .slice(0, 3 + save.pres.up.choice)
    .map(o => ({ o, rare: o.rv !== undefined && Math.random() < TUNE.rareChipChance }));
  const list = el('#perkList');
  list.innerHTML = '';
  list.style.setProperty('--n', String(opts.length)); // one row, however many options
  opts.forEach(({ o, rare }) => {
    const v = rare ? o.rv! : o.v;
    const b = document.createElement('button');
    b.className = 'perk' + (rare ? ' rare' : '');
    b.innerHTML = perkCard(o, v, rare, times);
    b.addEventListener('click', () => {
      for (let k = 0; k < times && !(k && o.maxed && o.maxed(player)); k++) {
        o.apply(player, v);
        run.perks.push(o.id + (rare ? '+' : ''));
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
