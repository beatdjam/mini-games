import type { WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { camera } from '@engine/render/render.ts';
import { locked } from '@engine/ui/input.ts';
import { createHitDirs } from '@engine/ui/hitdir.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { boss, nearPickup, target } from '../world/entities.ts';
import { player, currentWeapon, run } from '../actors/player.ts';
import { magSize, weaponName, weaponText, weaponStats } from '../actors/weapons.ts';
import { state } from '../flow/state.ts';
import { time } from '../flow/update.ts';
export const hpFill = el('#hpFill'),
  hpNum = el('#hpNum'),
  hpBar = el('#hpBar'),
  stFill = el('#stFill'),
  stBar = el('#stBar'),
  bitNum = el('#bitNum');
export const cross = el('#cross'),
  hitm = el('#hitm'),
  ammoEl = el('#ammo'),
  reloadEl = el('#reload'),
  rFill = el('#rFill');
export const vigEl = el('#vig'),
  bossFill = el('#bossFill'),
  mini = el<HTMLCanvasElement>('#mini'),
  mctx = mini.getContext('2d')!,
  bigmap = el<HTMLCanvasElement>('#bigmap'),
  bctx = bigmap.getContext('2d')!;
const btnDash = el('#btnDash'),
  pickRow = el('#pickRow'),
  pickName = el('#pickName'),
  pickDiff = el('#pickDiff'),
  btnEquip = el('#btnEquip'),
  btnStow = el<HTMLButtonElement>('#btnStow'),
  hintEl = el('#hint');
const LOW_HP_FRAC = 0.3; // below this share of max HP the HP bar turns red and the screen edge pulses
// screen effects shared by several files: hit marker, damage vignette, camera shake, minimap redraw, stamina warning
export const screenFx = { hitTimer: 0, vig: 0, shake: 0, miniT: 0, stWarn: 0 };
// where a hit came from: a red arc around the crosshair, only when the attacker is outside the view (engine/ui/hitdir.ts)
const hitDirUi = createHitDirs({
  container: el('#hitDirs'),
  view: () => player,
  camera,
  time: TUNE.hitDirTime,
});
export const hitDirs = hitDirUi.list;
export const hitDirection = hitDirUi.show;
export const updateHitDirs = hitDirUi.update;
export function hitMark(crit?: boolean) {
  hitm.classList.add('on');
  hitm.classList.toggle('crit', !!crit);
  screenFx.hitTimer = 0.09;
}
export function toggleMap() {
  if (state !== 'play') return;
  bigmap.hidden = !bigmap.hidden;
  screenFx.miniT = 0;
}
export function weaponHud() {
  [0, 1].forEach(k => {
    const slot = el('#w' + k),
      w = player.weapons[k];
    slot.classList.toggle('on', k === player.cur);
    slot.innerHTML = w ? t('hud.slot', { n: k + 1, name: weaponName(w) }) : t('hud.slotEmpty', { n: k + 1 });
  });
  el('#kitBtnN').textContent = String(player.kits);
  const kh = el('#kitHud');
  kh.textContent = t('hud.kits', { n: player.kits, max: KIT_MAX });
  kh.classList.toggle('none', player.kits <= 0);
  el('#btnKit').classList.toggle('off', player.kits <= 0);
}
function hpFrac() {
  return clamp(player.hp / player.maxHp, 0, 1);
}
// HP, stamina and the dash button that needs stamina
function updateBars() {
  const f = hpFrac();
  hpFill.style.transform = `scaleX(${f})`;
  hpBar.classList.toggle('low', f < LOW_HP_FRAC);
  hpNum.textContent = String(Math.ceil(player.hp));
  stFill.style.transform = `scaleX(${clamp(player.st / player.stMax, 0, 1)})`;
  stBar.classList.toggle('short', player.st < TUNE.dashCost);
  stBar.classList.toggle('warn', screenFx.stWarn > 0);
  btnDash.classList.toggle('off', player.st < TUNE.dashCost);
}
// rounds in the magazine and the reload bar
function updateAmmo() {
  const w = currentWeapon(),
    ms = magSize(w);
  const at = `${w.mag}<small> / ${ms}</small>`;
  if (ammoEl.dataset.v !== at) {
    ammoEl.innerHTML = at;
    ammoEl.dataset.v = at;
    ammoEl.classList.toggle('empty', w.mag === 0);
  }
  reloadEl.hidden = !(player.reloadT > 0);
  if (player.reloadT > 0) rFill.style.transform = `scaleX(${1 - player.reloadT / player.reloadMax})`;
}
// the red screen edge: hits, and a pulse while HP is low
function updateVignette() {
  const lowPulse = hpFrac() < LOW_HP_FRAC ? 0.25 + Math.sin(time * 5) * 0.12 : 0;
  vigEl.style.opacity = String(Math.max(screenFx.vig, lowPulse));
}
// the weapon on the floor next to the player: name, comparison and the equip / stow buttons
function updatePickPrompt() {
  if (nearPickup) {
    const desk = !isTouch && !document.body.classList.contains('nolock'),
      bagFree = player.bag.includes(null),
      freeSlots = player.bag.filter(w => !w).length,
      hasSecond = !!player.weapons[1];
    const name =
      weaponText(nearPickup.w!) +
      (desk
        ? t('hud.pickDesk', {
            act: t(hasSecond ? 'hud.pickSwap' : 'hud.pickEquip'),
            full: bagFree ? '' : t('hud.pickFull'),
          })
        : '');
    const diff = compareHTML(nearPickup.w!, currentWeapon()),
      // everything the labels below depend on: the bag screen can change the slots while the prompt stays up
      key = name + '|' + diff + '|' + player.cur + '|' + bagFree + '|' + freeSlots + '|' + hasSecond;
    if (pickRow.hidden || pickRow.dataset.key !== key) {
      pickRow.dataset.key = key;
      pickName.textContent = name;
      pickDiff.innerHTML = diff;
      btnEquip.textContent = t(hasSecond ? 'hud.btnSwap' : 'hud.btnEquip2');
      btnStow.textContent = bagFree ? t('hud.btnStow', { n: freeSlots }) : t('hud.btnStowFull');
      btnStow.disabled = !bagFree;
      pickRow.hidden = false;
    }
    hintEl.textContent = ''; // the prompt sits where the hint line is
  } else if (!pickRow.hidden) {
    pickRow.hidden = true;
    updateHint();
  }
}
export function updateHud() {
  updateBars();
  bitNum.textContent = String(Math.floor(run.bits));
  cross.classList.toggle('lock', !!target);
  updateAmmo();
  if (boss) bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  updateVignette();
  updatePickPrompt();
}
// "DPS 142 ▲+38 / per hit 16×8 ▼-4 / mag 6 ▼-6" against the weapon in hand
export function compareHTML(w: WeaponItem, cur: WeaponItem) {
  const a = weaponStats(w),
    b = weaponStats(cur);
  const d = (v: number, base: number) => {
    const diff = Math.round(v) - Math.round(base);
    return diff > 0
      ? `<span class="up">▲+${diff}</span>`
      : diff < 0
        ? `<span class="down">▼${diff}</span>`
        : '<span class="same">±0</span>';
  };
  const hits = a.hits > 1 ? `×${a.hits}` : '';
  return t('hud.compare', {
    dps: Math.round(a.dps),
    ddps: d(a.dps, b.dps),
    hit: Math.round(a.perHit),
    hits,
    dhit: d(a.perHit * a.hits, b.perHit * b.hits),
    mag: a.mag,
    dmag: d(a.mag, b.mag),
  });
}
export function updateHint() {
  const h = el('#hint');
  if (isTouch) h.textContent = '';
  else if (document.body.classList.contains('nolock')) h.textContent = t('hud.hintTouchLook');
  else h.textContent = locked || state !== 'play' ? '' : t('hud.hintLock');
}
