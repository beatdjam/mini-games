import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { UPGRADES } from '../data/progress.ts';
import { persist, save } from '../core/save.ts';
import { addLevelPoint } from '../core/progress.ts';
import { levelOf, nextLevelCost } from '../core/rules.ts';
import { applyLevelPoint, player, run } from '../actors/player.ts';
import { bigmap, weaponHud } from '../ui/hud.ts';
import { setState, show } from '../flow/state.ts';
import { openPerk } from './perk.ts';
// A milestone's level-up (2026-10-18): on the way into a milestone depth (data/progress.ts isMilestone), the dive's own
// bits buy levels, as at the base, and each point counts at once. What is spent here is the level's for good: death
// halves only the bits still carried. The chip screen's card is used, with its own words and a "done" button
// (#scrPerk[data-mode="level"]; the bot reads that: dev/bot.ts)
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
  el('#perkEyebrow').textContent = 'milestone';
  el('#levelNote').hidden = false;
  el('#perkDone').hidden = false;
  render();
  show('#scrPerk');
}
