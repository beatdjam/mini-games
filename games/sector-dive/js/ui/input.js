'use strict';
// Controls: what the keys and touch buttons do in Sector Dive (the input itself is engine/ui/input.js)
let dashReq = false, stickT = 0, stickArmed = true;
Object.assign(INPUT, {
  active: () => state === 'play',
  look: (dx, dy) => { if (!P) return; P.yaw -= dx; P.pitch = clamp(P.pitch - dy, -1.25, 1.25); },
  sens: () => save.settings.sens,
  pause: () => pause(),
  lockChanged: () => updateHint(),
  key: e => {
    if (e.code === 'Tab') e.preventDefault();
    if (state === 'bag' && (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape')) { closeBag(); return; }
    if (state !== 'play') return;
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { dashReq = true; e.preventDefault(); }
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
tapBtn($('#btnDash'), () => { dashReq = true; });
tapBtn($('#btnReload'), () => { if (state === 'play') startReload(); });
tapBtn($('#btnKit'), useKit);
tapBtn($('#btnEquip'), equipNearby);
tapBtn($('#btnStow'), stowNearby);
[0, 1].forEach(k => tapBtn($('#w' + k), () => selectSlot(k)));
$('#btnPause').addEventListener('click', () => { if (state === 'play') pause(); });
$('#btnBag').addEventListener('click', () => { if (state === 'play') openBag(); });
$('#mini').addEventListener('click', () => toggleMap());
$('#bigmap').addEventListener('click', () => toggleMap());
window.addEventListener('wheel', e => { if (state === 'play' && locked) swapWeapon(); }, { passive: true });

function selectSlot(k) {
  if (state !== 'play' || k === P.cur || !P.weapons[k]) return;
  P.cur = k; P.reloadT = 0; P.fireCd = Math.max(P.fireCd, 0.2); gunKick = 0.15; setVM(curW().id); weaponHud();
}
function swapWeapon() { selectSlot(P ? P.cur ^ 1 : 0); }
function useKit() {
  if (!P || (state !== 'play' && state !== 'bag')) return;
  if (P.kits <= 0) { toast(t('run.noKit'), 1200); return; }
  if (P.hp >= P.maxHp) { toast(t('run.hpFull'), 1200); return; }
  P.kits--; P.hp = Math.min(P.maxHp, P.hp + TUNE.kitHeal); sfx('heal'); toast(`HP +${TUNE.kitHeal}`, 1000); weaponHud();
}
function normalizeWeapons() {
  if (!P.weapons[0] && P.weapons[1]) { P.weapons[0] = P.weapons[1]; P.weapons[1] = null; }
  if (!P.weapons[P.cur]) P.cur = 0;
  P.reloadT = 0; setVM(curW().id);
}
// Picking up a weapon: the player chooses between holding it now and putting it in the bag.
function takeNearby() {
  if (state !== 'play' || !nearW) return null;
  const p = nearW;
  p.dead = true; disposeTree(p.mesh); dynGroup.remove(p.mesh);
  nearW = null; sfx('pick'); gunKick = 0.12;
  return p.w;
}
// hold it: fills the empty second slot, otherwise swaps with the weapon in hand (that one is dropped here)
function equipNearby() {
  const nw = takeNearby(); if (!nw) return;
  if (!P.weapons[1]) { P.weapons[1] = nw; P.cur = 1; normalizeWeapons(); toast(t('run.equipped', { w: wText(nw) }), 1400); }
  else {
    const old = P.weapons[P.cur];
    P.weapons[P.cur] = nw; normalizeWeapons();
    addPickup('weapon', P.x + rand(-0.5, 0.5), P.z + rand(-0.5, 0.5), { w: old });
    toast(t('run.swapped', { w: wText(old) }), 1400);
  }
  weaponHud();
}
function stowNearby() {
  if (!nearW || !P.bag.includes(null)) { if (nearW) toast(t('run.bagFull'), 1000); return; }
  const nw = takeNearby(); if (!nw) return;
  P.bag[P.bag.indexOf(null)] = nw;
  toast(t('run.stowed', { w: wText(nw), n: P.bag.filter(Boolean).length, max: BAG_MAX }), 1400);
  weaponHud();
}
