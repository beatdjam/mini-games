import type { WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch } from '@engine/core/util.ts';
import { setLang, t } from '@engine/core/i18n.ts';
import { camera, resize } from '@engine/render/render.ts';
import { fsSupported, isFullscreen, isStandalone, toggleFs } from '@engine/ui/ui.ts';
import { locked } from '@engine/ui/input.ts';
import { createHitDirs } from '@engine/ui/hitdir.ts';
import { TOUCH_LAYOUT } from '@engine/ui/touchlayout.ts';
import { renderSettings } from '@engine/ui/settings.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { GUIDE_DESK, GUIDE_TOUCH, LAYOUT_DEF } from '../data/controls.ts';
import { persist, save } from '../core/save.ts';
import { layoutEdits, resetLayout, setLanguage } from '../core/progress.ts';
import { boss, nearPickup, target } from '../world/entities.ts';
import { player, currentWeapon, run } from '../actors/player.ts';
import { magSize, weaponName, weaponText, weaponStats } from '../actors/weapons.ts';
import { setState, show, state } from '../flow/state.ts';
import { refreshRunText } from '../screens/pause.ts';
import { renderBase } from '../screens/base.ts';
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
export function updateHud() {
  const f = clamp(player.hp / player.maxHp, 0, 1);
  hpFill.style.transform = `scaleX(${f})`;
  hpBar.classList.toggle('low', f < 0.3);
  hpNum.textContent = String(Math.ceil(player.hp));
  stFill.style.transform = `scaleX(${clamp(player.st / player.stMax, 0, 1)})`;
  stBar.classList.toggle('short', player.st < TUNE.dashCost);
  stBar.classList.toggle('warn', screenFx.stWarn > 0);
  bitNum.textContent = String(Math.floor(run.bits));
  cross.classList.toggle('lock', !!target);
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
  el('#btnDash').classList.toggle('off', player.st < TUNE.dashCost);
  if (boss) bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  const lowPulse = f < 0.3 ? 0.25 + Math.sin(time * 5) * 0.12 : 0;
  vigEl.style.opacity = String(Math.max(screenFx.vig, lowPulse));
  const row = el('#pickRow');
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
    if (row.hidden || row.dataset.key !== key) {
      row.dataset.key = key;
      el('#pickName').textContent = name;
      el('#pickDiff').innerHTML = diff;
      el('#btnEquip').textContent = t(hasSecond ? 'hud.btnSwap' : 'hud.btnEquip2');
      el('#btnStow').textContent = bagFree ? t('hud.btnStow', { n: freeSlots }) : t('hud.btnStowFull');
      el<HTMLButtonElement>('#btnStow').disabled = !bagFree;
      row.hidden = false;
    }
    el('#hint').textContent = ''; // the prompt sits where the hint line is
  } else if (!row.hidden) {
    row.hidden = true;
    updateHint();
  }
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
export function fsLabel() {
  el('#btnFs').textContent = t(isFullscreen() ? 'hud.fsOff' : 'hud.fs');
}
el('#btnFs').hidden = !fsSupported || isStandalone;
el('#btnFs').addEventListener('click', toggleFs);
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
  document.addEventListener(ev, () => {
    fsLabel();
    renderSettings();
    setTimeout(resize, 100);
  }),
);

// touch buttons: placement and the editor are engine/src/ui/touchlayout.ts
Object.assign(TOUCH_LAYOUT, {
  defs: LAYOUT_DEF,
  first: 'dash',
  edits: layoutEdits,
  reset: resetLayout,
  save: persist,
  afterApply: () => {
    el('#btnFire2').hidden = !save.settings.leftFire;
  },
  onOpen: () => {
    show(null);
    setState('layout');
  },
  onClose: (from: string) => {
    if (from === 'pause') {
      setState('pause');
      renderSettings();
      show('#scrPause');
    } else {
      el('#touch').hidden = true;
      setState('base');
      renderSettings();
      show('#scrBase');
    }
  },
});

export function renderGuide() {
  el('#guide').innerHTML = (isTouch ? GUIDE_TOUCH : GUIDE_DESK).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}
// switching language redraws whatever is on screen (static text is handled by setLang)
export function changeLang(code: string) {
  setLanguage(code);
  persist();
  setLang(code);
  renderSettings();
  renderGuide();
  fsLabel();
  updateHint();
  if (state === 'base') renderBase();
  if (player) {
    weaponHud();
    refreshRunText();
  }
}
