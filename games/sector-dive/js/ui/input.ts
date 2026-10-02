import { clamp, el, rand } from '../../../../engine/core/util.ts';
import { t } from '../../../../engine/core/i18n.ts';
import { sfx } from '../../../../engine/audio/audio.ts';
import { toast } from '../../../../engine/ui/ui.ts';
import { INPUT, locked, tapBtn } from '../../../../engine/ui/input.ts';
import { BAG_MAX, TUNE } from '../data/progress.ts';
import { save } from '../system/save.ts';
import { addPickup, nearW, setNear } from '../world/entities.ts';
import { GUNFX, P, curW, kitHealAmount, setVM, startReload, wText } from '../actors/player.ts';
import { toggleMap, updateHint, weaponHud } from './hud.ts';
import { closeBag, openBag, pause, state } from '../flow/game.ts';
// Controls: what the keys and touch buttons do in Sector Dive (the input itself is engine/ui/input.js)
// dash request and the full-stick dash timer
export const CTRL = { dashReq: false, stickT: 0, stickArmed: true };
Object.assign(INPUT, {
  active: () => state === 'play',
  look: (dx: number, dy: number) => { if (!P) return; P.yaw -= dx; P.pitch = clamp(P.pitch - dy, -1.25, 1.25); },
  sens: () => save.settings.sens,
  pause: () => pause(),
  lockChanged: () => updateHint(),
  key: (e: KeyboardEvent) => {
    if (e.code === 'Tab') e.preventDefault();
    if (state === 'bag' && (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape')) { closeBag(); return; }
    if (state !== 'play') return;
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { CTRL.dashReq = true; e.preventDefault(); }
    if (e.code === 'KeyQ') swapWeapon();
    if (e.code === 'Digit1') selectSlot(0);
    if (e.code === 'Digit2') selectSlot(1);
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyE') stowNearby();
    if (e.code === 'KeyG') equipNearby();
    if (e.code === 'KeyH') useKit();
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'Tab' || e.code === 'KeyI') openBag();
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  },
});
tapBtn(el('#btnDash'), () => { CTRL.dashReq = true; });
tapBtn(el('#btnReload'), () => { if (state === 'play') startReload(); });
tapBtn(el('#btnKit'), useKit);
tapBtn(el('#btnEquip'), equipNearby);
tapBtn(el('#btnStow'), stowNearby);
[0, 1].forEach(k => tapBtn(el('#w' + k), () => selectSlot(k)));
el('#btnPause').addEventListener('click', () => { if (state === 'play') pause(); });
el('#btnBag').addEventListener('click', () => { if (state === 'play') openBag(); });
el('#mini').addEventListener('click', () => toggleMap());
el('#bigmap').addEventListener('click', () => toggleMap());
window.addEventListener('wheel', e => { if (state === 'play' && locked) swapWeapon(); }, { passive: true });

export function selectSlot(k: number) {
  if (state !== 'play' || k === P.cur || !P.weapons[k]) return;
  P.cur = k; P.reloadT = 0; P.fireCd = Math.max(P.fireCd, 0.2); GUNFX.gunKick = 0.15; setVM(curW().id); weaponHud();
}
export function swapWeapon() { selectSlot(P ? P.cur ^ 1 : 0); }
export function useKit() {
  if (!P || (state !== 'play' && state !== 'bag')) return;
  if (P.kits <= 0) { toast(t('run.noKit'), 1200); return; }
  if (P.hp >= P.maxHp) { toast(t('run.hpFull'), 1200); return; }
  const heal = kitHealAmount();
  P.kits--; P.hp = Math.min(P.maxHp, P.hp + heal); sfx('heal'); toast(`HP +${heal}`, 1000); weaponHud();
}
export function normalizeWeapons() {
  if (!P.weapons[0] && P.weapons[1]) { P.weapons[0] = P.weapons[1]; P.weapons[1] = null; }
  if (!P.weapons[P.cur]) P.cur = 0;
  P.reloadT = 0; setVM(curW().id);
}
// Picking up a weapon: the player chooses between holding it now and putting it in the bag.
export function takeNearby() {
  if (state !== 'play' || !nearW) return null;
  const p = nearW;
  p.dead = true; p.mesh.visible = false; // the engine world disposes it
  setNear(null); sfx('pick'); GUNFX.gunKick = 0.12;
  return p.w;
}
// hold it: fills the empty second slot, otherwise swaps with the weapon in hand (that one is dropped here)
export function equipNearby() {
  const nw = takeNearby(); if (!nw) return;
  if (!P.weapons[1]) { P.weapons[1] = nw; P.cur = 1; normalizeWeapons(); toast(t('run.equipped', { w: wText(nw) }), 1400); }
  else {
    const old = curW();
    P.weapons[P.cur] = nw; normalizeWeapons();
    addPickup('weapon', P.x + rand(-0.5, 0.5), P.z + rand(-0.5, 0.5), { w: old });
    toast(t('run.swapped', { w: wText(old) }), 1400);
  }
  weaponHud();
}
export function stowNearby() {
  if (!nearW || !P.bag.includes(null)) { if (nearW) toast(t('run.bagFull'), 1000); return; }
  const nw = takeNearby(); if (!nw) return;
  P.bag[P.bag.indexOf(null)] = nw;
  toast(t('run.stowed', { w: wText(nw), n: P.bag.filter(Boolean).length, max: BAG_MAX }), 1400);
  weaponHud();
}
