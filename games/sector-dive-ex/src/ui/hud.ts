import type { WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { camera } from '@engine/render/render.ts';
import { exitLock, locked, requestLock } from '@engine/ui/input.ts';
import { createHitDirs } from '@engine/ui/hitdir.ts';
import { createHitMark } from '@engine/ui/hitmark.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { boss, nearPickup, target } from '../world/entities.ts';
import { player, currentWeapon, run } from '../actors/player.ts';
import { magSize, weaponName, weaponText, weaponStats } from '../actors/weapons.ts';
import { state } from '../flow/state.ts';
import { level } from '../world/level.ts';
import { bossAreaOn } from '../core/bossArea.ts';
import { map3d, map3dAllowed } from './map3d.ts';
import { time } from '../flow/update.ts';
import { keyText, moveKeysText } from './input.ts';
import { ICON, hud2, slotHtml } from './hud2.ts';
const hpFill = el('#hpFill'),
  hpNum = el('#hpNum'),
  hpBar = el('#hpBar'),
  stFill = el('#stFill'),
  stBar = el('#stBar'),
  bitNum = el('#bitNum');
const cross = el('#cross');
const HIT_MARK_TIME = 0.09; // seconds the hit marker stays up
const hitm = el('#hitm');
const ammoEl = el('#ammo'),
  reloadEl = el('#reload'),
  rFill = el('#rFill');
const vigEl = el('#vig'),
  bossFill = el('#bossFill');
export const mini = el<HTMLCanvasElement>('#mini'),
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
// The last values written to the HUD by updateHud and its helpers: a frame whose values are unchanged writes nothing.
// null = not written yet, so the first frame after a load writes every one of them.
// These elements are not written outside updateHud; if one is, change the matching item in shown too.
const shown: {
  hpFill: string | null;
  hpNum: string | null;
  hpLow: boolean | null;
  stFill: string | null;
  stShort: boolean | null;
  stWarn: boolean | null;
  dashOff: boolean | null;
  bits: string | null;
  lock: boolean | null;
  bossFill: string | null;
  vig: string | null;
  reloadHidden: boolean | null;
  reloadFill: string | null;
} = {
  hpFill: null,
  hpNum: null,
  hpLow: null,
  stFill: null,
  stShort: null,
  stWarn: null,
  dashOff: null,
  bits: null,
  lock: null,
  bossFill: null,
  vig: null,
  reloadHidden: null,
  reloadFill: null,
};
// screen effects shared by several files: hit marker, damage vignette, camera shake, minimap redraw, stamina warning
export const screenFx = { vig: 0, shake: 0, miniT: 0, stWarn: 0 };
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
// the mark over the crosshair when a shot lands (engine/src/ui/hitmark.ts)
const hitMarkUi = createHitMark(hitm, HIT_MARK_TIME);
export const hitMark = hitMarkUi.show;
export const updateHitMark = hitMarkUi.update;
// ---- the big map: the 2D map of this floor, and (in a building) a second page with the 3D map of the building ----
const mapHint = el('#mapHint');
// is the 3D page the one asked for (it is on screen from the next frame: ui/map3d.ts)
export const map3dWanted = (): boolean => !bigmap.hidden && map3d.on && map3dAllowed();
// Opens or closes the big map on one of its pages. On a PC the 3D page needs the pointer (the map is dragged with the
// mouse), so the mouse lock is let go while it is up and taken back when it goes
function setMap(open: boolean, solid: boolean) {
  const was = map3dWanted();
  bigmap.hidden = !open;
  map3d.on = open && solid && map3dAllowed();
  screenFx.miniT = 0;
  if (!isTouch && was !== map3dWanted()) {
    if (map3dWanted()) exitLock();
    else if (state === 'play') requestLock();
  }
  mapHint.hidden = !open;
  if (!open) return;
  const keys = { map: keyText('map', 0), map3d: keyText('map3d', 0), move: moveKeysText() };
  const can3d = map3dAllowed();
  mapHint.textContent = isTouch
    ? bossAreaOn()
      ? t(can3d ? (map3d.on ? 'map.hintTouch3d' : 'map.hintTouch2d') : 'map.hintTouchClose')
      : t(map3d.on ? 'map.hintTouch3d' : 'map.hintTouch2d')
    : level.floor < 0
      ? ''
      : t(can3d ? (map3d.on ? 'map.hint3d' : 'map.hint2d') : 'map.hintClose', keys);
}
// the map key: opens the 2D map, or closes the big map whichever page it is on
export function toggleMap() {
  if (state !== 'play') return;
  setMap(bigmap.hidden, false);
}
// the 3D map key: opens the big map on its 3D page, or turns between the two pages
export function toggleMap3D() {
  if (state !== 'play' || !map3dAllowed()) return;
  setMap(true, bigmap.hidden || !map3d.on);
}
// a tap on the minimap or the map (touch): closed, the 2D map, the 3D map, closed again
export function cycleMap() {
  if (state !== 'play') return;
  if (bigmap.hidden) setMap(true, false);
  else if (!map3d.on && map3dAllowed()) setMap(true, true);
  else setMap(false, false);
}
export function weaponHud() {
  [0, 1].forEach(k => {
    const slot = el('#w' + k),
      w = player.weapons[k];
    slot.classList.toggle('on', k === player.cur);
    if (hud2) {
      slot.innerHTML = slotHtml(w, k + 1);
      slot.setAttribute(
        'aria-label',
        w ? t('hud.slot', { n: k + 1, name: weaponName(w) }) : t('hud.slotEmpty', { n: k + 1 }),
      );
    } else slot.innerHTML = w ? t('hud.slot', { n: k + 1, name: weaponName(w) }) : t('hud.slotEmpty', { n: k + 1 });
  });
  el('#kitBtnN').textContent = String(player.kits);
  const kh = el('#kitHud');
  if (hud2) kh.innerHTML = `${ICON.kit}${player.kits}/${KIT_MAX}<small>${keyText('kit', 0)}</small>`;
  else kh.textContent = t('hud.kits', { n: player.kits, max: KIT_MAX, key: keyText('kit', 0) });
  kh.classList.toggle('none', player.kits <= 0);
  el('#btnKit').classList.toggle('off', player.kits <= 0);
}
function hpFrac() {
  return clamp(player.hp / player.maxHp, 0, 1);
}
// HP, stamina and the dash button that needs stamina
function updateBars() {
  const f = hpFrac(),
    hpScale = `scaleX(${f})`;
  if (shown.hpFill !== hpScale) {
    hpFill.style.transform = hpScale;
    shown.hpFill = hpScale;
  }
  const low = f < LOW_HP_FRAC;
  if (shown.hpLow !== low) {
    hpBar.classList.toggle('low', low);
    shown.hpLow = low;
  }
  const hpText = String(Math.ceil(player.hp));
  if (shown.hpNum !== hpText) {
    hpNum.textContent = hpText;
    shown.hpNum = hpText;
  }
  const stScale = `scaleX(${clamp(player.st / player.stMax, 0, 1)})`;
  if (shown.stFill !== stScale) {
    stFill.style.transform = stScale;
    shown.stFill = stScale;
  }
  const short = player.st < TUNE.dashCost;
  if (shown.stShort !== short) {
    stBar.classList.toggle('short', short);
    shown.stShort = short;
  }
  const warn = screenFx.stWarn > 0;
  if (shown.stWarn !== warn) {
    stBar.classList.toggle('warn', warn);
    shown.stWarn = warn;
  }
  if (shown.dashOff !== short) {
    btnDash.classList.toggle('off', short);
    shown.dashOff = short;
  }
}
// rounds in the magazine and the reload bar
function updateAmmo() {
  const w = currentWeapon(),
    ms = magSize(w);
  const at = `${w.mag}<small> / ${ms}</small>`;
  if (ammoEl.dataset.v !== at) {
    ammoEl.innerHTML = at;
    ammoEl.dataset.v = at;
    // (not 'empty': that is the box of an empty list, index.html, and would put its dashed frame round the count)
    ammoEl.classList.toggle('dry', w.mag === 0);
  }
  const reloadHidden = !(player.reloadT > 0);
  if (shown.reloadHidden !== reloadHidden) {
    reloadEl.hidden = reloadHidden;
    shown.reloadHidden = reloadHidden;
  }
  if (player.reloadT > 0) {
    const fill = `scaleX(${1 - player.reloadT / player.reloadMax})`;
    if (shown.reloadFill !== fill) {
      rFill.style.transform = fill;
      shown.reloadFill = fill;
    }
  }
}
// the red screen edge: hits, and a pulse while HP is low
function updateVignette() {
  const lowPulse = hpFrac() < LOW_HP_FRAC ? 0.25 + Math.sin(time * 5) * 0.12 : 0;
  const opacity = String(Math.max(screenFx.vig, lowPulse));
  if (shown.vig !== opacity) {
    vigEl.style.opacity = opacity;
    shown.vig = opacity;
  }
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
            equip: keyText('equip', 0),
            stow: keyText('stow', 0),
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
  const bits = String(Math.floor(run.bits));
  if (shown.bits !== bits) {
    bitNum.textContent = bits;
    shown.bits = bits;
  }
  const lock = !!target;
  if (shown.lock !== lock) {
    cross.classList.toggle('lock', lock);
    shown.lock = lock;
  }
  updateAmmo();
  if (boss) {
    const fill = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
    if (shown.bossFill !== fill) {
      bossFill.style.transform = fill;
      shown.bossFill = fill;
    }
  }
  updateVignette();
  updatePickPrompt();
}
// "DPS 142 ▲+38 / per hit 16×8 ▼-4 / mag 6 ▼-6" against the weapon in hand
function compareHTML(w: WeaponItem, cur: WeaponItem) {
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
