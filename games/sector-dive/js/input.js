'use strict';
// ================= input =================
const keys = {};
let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 }, fireTouch = { id: null, x: 0, y: 0 };
let fireHeld = false, fire2Held = false, mouseFire = false, dashReq = false, locked = false, lockWorked = false, stickT = 0, stickArmed = true;
const touchEl = $('#touch');
function lookDelta(dx, dy, k) { if (!P) return; P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.25, 1.25); }
const tk = () => 0.0055 * save.settings.sens;

touchEl.addEventListener('pointerdown', e => {
  if (e.target !== touchEl) return;
  audioInit();
  if (e.pointerType === 'mouse' && !document.body.classList.contains('nolock')) { if (!locked) requestLock(); return; }
  e.preventDefault();
  try { touchEl.setPointerCapture(e.pointerId); } catch (err) {}
  if (e.clientX < window.innerWidth * 0.45 && joy.id === null) {
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    const jb = $('#joyBase'); jb.style.left = e.clientX + 'px'; jb.style.top = e.clientY + 'px'; jb.style.display = 'block';
    $('#joyKnob').style.transform = '';
  } else if (look.id === null) { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), R = 55;
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    joy.x = dx / R; joy.y = dy / R;
    $('#joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === look.id) {
    lookDelta(e.clientX - look.x, e.clientY - look.y, tk()); look.x = e.clientX; look.y = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerId === joy.id) { joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; $('#joyBase').style.display = 'none'; }
  if (e.pointerId === look.id) look = { id: null, x: 0, y: 0 };
}
touchEl.addEventListener('pointerup', endPointer);
touchEl.addEventListener('pointercancel', endPointer);
function releaseInputs() {
  joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; look = { id: null, x: 0, y: 0 }; fireTouch = { id: null, x: 0, y: 0 };
  fireHeld = false; fire2Held = false; mouseFire = false; $('#joyBase').style.display = 'none'; $('#btnFire').classList.remove('down'); $('#btnFire2').classList.remove('down');
  for (const k in keys) keys[k] = false;
}
const btnFire = $('#btnFire');
btnFire.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); audioInit();
  try { btnFire.setPointerCapture(e.pointerId); } catch (err) {}
  fireTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }; fireHeld = true; btnFire.classList.add('down');
});
btnFire.addEventListener('pointermove', e => {
  if (e.pointerId !== fireTouch.id) return;
  lookDelta(e.clientX - fireTouch.x, e.clientY - fireTouch.y, tk()); fireTouch.x = e.clientX; fireTouch.y = e.clientY;
});
const fireUp = e => { if (e.pointerId === fireTouch.id) { fireTouch.id = null; fireHeld = false; btnFire.classList.remove('down'); } };
btnFire.addEventListener('pointerup', fireUp); btnFire.addEventListener('pointercancel', fireUp);
function tapBtn(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); fn(); }); }
tapBtn($('#btnDash'), () => { dashReq = true; });
const btnFire2 = $('#btnFire2');
btnFire2.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); try { btnFire2.setPointerCapture(e.pointerId); } catch (err) {} fire2Held = true; btnFire2.classList.add('down'); });
const fire2Up = () => { fire2Held = false; btnFire2.classList.remove('down'); };
btnFire2.addEventListener('pointerup', fire2Up); btnFire2.addEventListener('pointercancel', fire2Up);
tapBtn($('#btnReload'), () => { if (state === 'play') startReload(); });
tapBtn($('#btnKit'), useKit);
tapBtn($('#btnEquip'), equipNearby);
tapBtn($('#btnStow'), stowNearby);
[0, 1].forEach(k => tapBtn($('#w' + k), () => selectSlot(k)));
$('#btnPause').addEventListener('click', () => { if (state === 'play') pause(); });
$('#btnBag').addEventListener('click', () => { if (state === 'play') openBag(); });
$('#mini').addEventListener('click', () => toggleMap());
$('#bigmap').addEventListener('click', () => toggleMap());

function lockFailed() { if (!lockWorked) document.body.classList.add('nolock'); updateHint(); }
function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(lockFailed);
  } catch (err) { lockFailed(); }
}
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === canvas;
  if (locked) { lockWorked = true; document.body.classList.remove('nolock'); }
  // a lock requested just before a menu opened can land after it (Firefox is slow here): let go so the menu is usable
  if (locked && state !== 'play') exitLock();
  updateHint();
  if (was && !locked && state === 'play') pause();
});
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('mousedown', e => { if (locked && state === 'play' && e.button === 0) { audioInit(); mouseFire = true; } });
document.addEventListener('mouseup', () => { mouseFire = false; });
document.addEventListener('mousemove', e => { if (locked && state === 'play') lookDelta(e.movementX, e.movementY, 0.0022 * save.settings.sens); });
window.addEventListener('wheel', e => { if (state === 'play' && locked) swapWeapon(); }, { passive: true });
window.addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault();
  if (state === 'bag' && (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape')) { closeBag(); return; }
  keys[e.code] = true;
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
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

function selectSlot(k) {
  if (state !== 'play' || k === P.cur || !P.weapons[k]) return;
  P.cur = k; P.reloadT = 0; P.fireCd = Math.max(P.fireCd, 0.2); gunKick = 0.15; setVM(curW().id); weaponHud();
}
function swapWeapon() { selectSlot(P ? P.cur ^ 1 : 0); }
function useKit() {
  if (!P || (state !== 'play' && state !== 'bag')) return;
  if (P.kits <= 0) { toast('回復キットがない', 1200); return; }
  if (P.hp >= P.maxHp) { toast('HPは満タン', 1200); return; }
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
  if (!P.weapons[1]) { P.weapons[1] = nw; P.cur = 1; normalizeWeapons(); toast(`${wText(nw)} を装備した`, 1400); }
  else {
    const old = P.weapons[P.cur];
    P.weapons[P.cur] = nw; normalizeWeapons();
    addPickup('weapon', P.x + rand(-0.5, 0.5), P.z + rand(-0.5, 0.5), { w: old });
    toast(`${wText(old)} と持ち替えた`, 1400);
  }
  weaponHud();
}
function stowNearby() {
  if (!nearW || !P.bag.includes(null)) { if (nearW) toast('バッグが満杯', 1000); return; }
  const nw = takeNearby(); if (!nw) return;
  P.bag[P.bag.indexOf(null)] = nw;
  toast(`${wText(nw)} をバッグに入れた（${P.bag.filter(Boolean).length} / ${BAG_MAX}）`, 1400);
  weaponHud();
}
