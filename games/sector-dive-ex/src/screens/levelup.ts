import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { UPGRADES } from '../data/progress.ts';
import { isArcade, modeTune, persist, save } from '../core/save.ts';
import { addLevelPoint, usingRestriction } from '../core/progress.ts';
import { levelOf, nextLevelCost, sellValue } from '../core/rules.ts';
import { weaponText } from '../actors/weapons.ts';
import { RARITY } from '../data/weapons.ts';
import { weaponIcon } from '../ui/hud2.ts';
import { applyLevelPoint, player, run } from '../actors/player.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show } from '../flow/state.ts';
import { hideTerminalParts, openPerk } from './perk.ts';
// A milestone's terminal (2026-10-18): the boss of a milestone depth (data/progress.ts isMilestone) leaves one in its
// room (world/portals.ts makeTerminal), and stepping onto it opens this. The dive's own bits buy levels, as at the
// base, and each point counts at once. What is spent here is the level's for good: death halves only the bits still
// carried. The weapons in the bag can be sold here for the dive's bits (core/rules.ts sellValue, as at the base). The
// chip screen's card is used, with its own words and a "done" button (#scrPerk[data-mode="level"]; the bot reads
// that: dev/bot.ts)
let afterDone: (() => void) | null = null;
function render() {
  const cost = nextLevelCost(),
    bits = Math.floor(run.bits);
  el('#perkTitle').textContent = t('level.title', { n: levelOf() });
  el('#levelNote').textContent = t(isArcade() ? 'level.noteArcade' : 'level.note', { bits, cost });
  const list = el('#perkList');
  list.innerHTML = '';
  list.style.setProperty('--n', '3');
  for (const u of UPGRADES) {
    if (modeTune().hiddenUpgrades.includes(u.id) || (u.id === 'kit' && usingRestriction('kit'))) continue;
    const l = save.up[u.id] || 0,
      maxed = l >= u.max,
      b = document.createElement('button');
    b.className = 'perk';
    b.dataset.level = u.id;
    b.disabled = maxed || bits < cost;
    b.innerHTML = `<span class="pn">${u.name}</span><span class="pd">${u.desc(l)}</span><span class="pcur">${maxed ? t('base.max') : t('level.buy', { cost })}</span>`;
    b.addEventListener('click', () => buy(u.id));
    list.appendChild(b);
  }
  renderSell();
}
// what the bag's weapons would bring, all together
const bagTotal = () => player.bag.reduce((sum, w) => sum + (w ? sellValue(w) : 0), 0);
// "sell all" in the head asks once, like the pause screen's abandon: the first click arms it, the second sells the bag
let sellAllArmed = false;
function armSellAll(on: boolean, total: number) {
  sellAllArmed = on;
  const b = el('#sellAll'),
    key = on ? 'level.sellAllGo' : 'level.sellAll';
  b.dataset.i18n = key;
  b.textContent = t(key, { v: total });
}
// the bag's weapons, each a button that sells it (none: the part is hidden)
function renderSell() {
  const list = el('#sellList'),
    any = player.bag.some(Boolean);
  el('#sellAll').hidden = !any;
  armSellAll(false, bagTotal());
  el('#sellHead').hidden = !any;
  list.hidden = !any;
  list.innerHTML = '';
  list.style.setProperty('--n', '3');
  player.bag.forEach((w, i) => {
    if (!w) return;
    const b = document.createElement('button');
    b.className = 'perk';
    b.dataset.sell = String(i);
    b.innerHTML = `<span class="wico" style="color:${RARITY[w.r].css}">${weaponIcon(w.id)}</span><span class="pn">${weaponText(w)}</span><span class="pcur">${t('level.sellFor', { v: sellValue(w) })}</span>`;
    b.addEventListener('click', () => sell(i));
    list.appendChild(b);
  });
}
function sell(i: number) {
  const w = player.bag[i];
  if (!w) return;
  run.bits += sellValue(w);
  player.bag[i] = null;
  sfx('pick');
  weaponHud();
  render();
}
function sellAll() {
  const total = bagTotal();
  if (!total) return;
  run.bits += total;
  player.bag.fill(null);
  sfx('pick');
  weaponHud();
  render();
}
function buy(id: string) {
  const cost = nextLevelCost();
  if (run.bits < cost) return;
  run.bits -= cost;
  addLevelPoint(id);
  applyLevelPoint(player, id);
  persist();
  sfx('chip');
  weaponHud();
  // (a starting chip's point: a chip to pick now, then back here)
  if (id === 'chip') {
    openPerk(t('perk.title'), 'level', () => openLevelUp(afterDone ?? undefined));
    return;
  }
  render();
}
function close() {
  hideTerminalParts();
  armSellAll(false, bagTotal());
  show(null);
  setState('play');
  requestLock();
  const done = afterDone;
  afterDone = null;
  if (done) done();
}
el('#perkDone').addEventListener('click', close);
el('#sellAll').addEventListener('click', () => {
  if (sellAllArmed) sellAll();
  else armSellAll(true, bagTotal());
});
export function openLevelUp(done?: () => void) {
  afterDone = done ?? null;
  setState('perk');
  releaseInputs();
  exitLock();
  bigmap.hidden = true;
  el('#scrPerk').dataset.mode = 'level';
  sfx('terminal');
  el('#perkEyebrow').textContent = 'terminal';
  el('#levelNote').hidden = false;
  el('#perkDone').hidden = false;
  render();
  show('#scrPerk');
}
