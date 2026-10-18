import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { UPGRADES } from '../data/progress.ts';
import { persist, save } from '../core/save.ts';
import { addLevelPoint } from '../core/progress.ts';
import { levelOf, nextLevelCost, sellValue } from '../core/rules.ts';
import { weaponText } from '../actors/weapons.ts';
import { applyLevelPoint, player, run } from '../actors/player.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show } from '../flow/state.ts';
import { openPerk } from './perk.ts';
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
  el('#levelNote').textContent = t('level.note', { bits, cost });
  const list = el('#perkList');
  list.innerHTML = '';
  list.style.setProperty('--n', '3');
  for (const u of UPGRADES) {
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
// the bag's weapons, each a button that sells it (none: the part is hidden)
function renderSell() {
  const list = el('#sellList'),
    any = player.bag.some(Boolean);
  el('#sellHead').hidden = !any;
  list.hidden = !any;
  list.innerHTML = '';
  list.style.setProperty('--n', '3');
  player.bag.forEach((w, i) => {
    if (!w) return;
    const b = document.createElement('button');
    b.className = 'perk';
    b.dataset.sell = String(i);
    b.innerHTML = `<span class="pn">${weaponText(w)}</span><span class="pcur">${t('level.sellFor', { v: sellValue(w) })}</span>`;
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
  el('#scrPerk').dataset.mode = '';
  el('#levelNote').hidden = true;
  el('#perkDone').hidden = true;
  el('#sellHead').hidden = true;
  el('#sellList').hidden = true;
  show(null);
  setState('play');
  requestLock();
  const done = afterDone;
  afterDone = null;
  if (done) done();
}
el('#perkDone').addEventListener('click', close);
export function openLevelUp(done?: () => void) {
  afterDone = done ?? null;
  setState('perk');
  releaseInputs();
  exitLock();
  bigmap.hidden = true;
  el('#scrPerk').dataset.mode = 'level';
  el('#perkEyebrow').textContent = 'terminal';
  el('#levelNote').hidden = false;
  el('#perkDone').hidden = false;
  render();
  show('#scrPerk');
}
