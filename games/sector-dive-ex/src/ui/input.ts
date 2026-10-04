import { clamp, el, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { toast } from '@engine/ui/ui.ts';
import { INPUT, locked, tapBtn } from '@engine/ui/input.ts';
import { actionOf, defineActions, importBindings, keyLabel, keysOf } from '@engine/ui/keymap.ts';
import { KEY_ACTIONS } from '../data/controls.ts';
import { BAG_MAX } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { addPickup, nearPickup, setNear } from '../world/entities.ts';
import { GUNFX, setVM } from '../actors/viewmodel.ts';
import { player, currentWeapon } from '../actors/player.ts';
import { kitHealAmount } from '../actors/combat.ts';
import { startReload } from '../actors/firing.ts';
import { weaponText } from '../actors/weapons.ts';
import { toggleMap, updateHint, weaponHud } from './hud.ts';
import { state } from '../flow/state.ts';
import { closeBag, openBag } from '../screens/bag.ts';
import { pause } from '../screens/pause.ts';
// Controls: what the keys and touch buttons do in Sector Dive Extended (the input itself is engine/src/ui/input.ts, the key
// bindings engine/src/ui/keymap.ts). The keys are looked up by action (KEY_ACTIONS in src/data/controls.ts), never by code.
defineActions(KEY_ACTIONS);
// reads the saved bindings into the engine (start-up, and after the save is replaced)
export const applyKeyBindings = () => importBindings(save.settings.keys);
// an action's keys as text for screens: "W / ↑" (all of them) or only the one at `index`; "-" when there is none
export function keyText(action: string, index?: number): string {
  const list = keysOf(action).map(keyLabel);
  const shown = index === undefined ? list : list.slice(index, index + 1);
  return shown.length ? shown.join(' / ') : '-';
}
// the four move keys written in a row: "WASD" (the first key of forward, left, back, right)
export const moveKeysText = (): string => ['forward', 'left', 'back', 'right'].map(a => keyText(a, 0)).join('');
// dash request, the dash button held (touch) and for how long, the run kept on after letting it go (touch), and the
// full-stick dash timer
export const controlState = { dashReq: false, dashHeld: false, heldT: 0, runLatch: false, stickT: 0, stickArmed: true };
Object.assign(INPUT, {
  active: () => state === 'play',
  look: (dx: number, dy: number) => {
    if (!player) return;
    player.yaw -= dx;
    player.pitch = clamp(player.pitch - dy, -1.25, 1.25);
  },
  sens: () => save.settings.sens,
  pause: () => pause(),
  lockChanged: () => updateHint(),
  key: (e: KeyboardEvent) => {
    const action = actionOf(e.code);
    if (e.code === 'Tab') e.preventDefault();
    if (state === 'bag' && (action === 'bag' || e.code === 'Escape')) {
      closeBag();
      return;
    }
    if (state !== 'play') return;
    // Esc always pauses, whatever the bindings say (the key dialog cannot bind it, and it frees the mouse anyway)
    if (e.code === 'Escape') {
      pause();
      return;
    }
    switch (action) {
      case 'dash':
        controlState.dashReq = true;
        e.preventDefault();
        break;
      case 'swap':
        swapWeapon();
        break;
      case 'slot1':
        selectSlot(0);
        break;
      case 'slot2':
        selectSlot(1);
        break;
      case 'reload':
        startReload();
        break;
      case 'stow':
        stowNearby();
        break;
      case 'equip':
        equipNearby();
        break;
      case 'kit':
        useKit();
        break;
      case 'map':
        toggleMap();
        break;
      case 'bag':
        openBag();
        break;
      case 'pause':
        pause();
        break;
    }
  },
});
tapBtn(el('#btnDash'), () => {
  controlState.dashReq = true;
});
// held on after the dash, the button keeps the player running (flow/update.ts)
el('#btnDash').addEventListener('pointerdown', e => {
  controlState.dashHeld = true;
  try {
    el('#btnDash').setPointerCapture(e.pointerId);
  } catch (err) {}
});
for (const type of ['pointerup', 'pointercancel'])
  el('#btnDash').addEventListener(type, () => {
    controlState.dashHeld = false;
  });
tapBtn(el('#btnReload'), () => {
  if (state === 'play') startReload();
});
tapBtn(el('#btnKit'), useKit);
tapBtn(el('#btnEquip'), equipNearby);
tapBtn(el('#btnStow'), stowNearby);
[0, 1].forEach(k => tapBtn(el('#w' + k), () => selectSlot(k)));
el('#btnPause').addEventListener('click', () => {
  if (state === 'play') pause();
});
el('#btnBag').addEventListener('click', () => {
  if (state === 'play') openBag();
});
el('#mini').addEventListener('click', () => toggleMap());
el('#bigmap').addEventListener('click', () => toggleMap());
window.addEventListener(
  'wheel',
  () => {
    if (state === 'play' && locked) swapWeapon();
  },
  { passive: true },
);

function selectSlot(k: number) {
  if (state !== 'play' || k === player.cur || !player.weapons[k]) return;
  player.cur = k;
  player.reloadT = 0;
  player.fireCd = Math.max(player.fireCd, 0.2);
  GUNFX.gunKick = 0.15;
  setVM(currentWeapon().id);
  weaponHud();
}
function swapWeapon() {
  selectSlot(player ? player.cur ^ 1 : 0);
}
export function useKit() {
  if (!player || (state !== 'play' && state !== 'bag')) return;
  if (player.kits <= 0) {
    toast(t('run.noKit'), 1200);
    return;
  }
  if (player.hp >= player.maxHp) {
    toast(t('run.hpFull'), 1200);
    return;
  }
  const heal = kitHealAmount();
  player.kits--;
  player.hp = Math.min(player.maxHp, player.hp + heal);
  sfx('heal');
  toast(`HP +${heal}`, 1000);
  weaponHud();
}
export function normalizeWeapons() {
  if (!player.weapons[0] && player.weapons[1]) {
    player.weapons[0] = player.weapons[1];
    player.weapons[1] = null;
  }
  if (!player.weapons[player.cur]) player.cur = 0;
  player.reloadT = 0;
  setVM(currentWeapon().id);
}
// Picking up a weapon: the player chooses between holding it now and putting it in the bag.
function takeNearby() {
  if (state !== 'play' || !nearPickup) return null;
  const p = nearPickup;
  p.dead = true;
  p.mesh.visible = false; // the engine world disposes it
  setNear(null);
  sfx('pick');
  GUNFX.gunKick = 0.12;
  return p.w;
}
// hold it: fills the empty second slot, otherwise swaps with the weapon in hand (that one is dropped here)
export function equipNearby() {
  const nw = takeNearby();
  if (!nw) return;
  if (!player.weapons[1]) {
    player.weapons[1] = nw;
    player.cur = 1;
    normalizeWeapons();
    toast(t('run.equipped', { w: weaponText(nw) }), 1400);
  } else {
    const old = currentWeapon();
    player.weapons[player.cur] = nw;
    normalizeWeapons();
    addPickup('weapon', player.x + rand(-0.5, 0.5), player.z + rand(-0.5, 0.5), { w: old });
    toast(t('run.swapped', { w: weaponText(old) }), 1400);
  }
  weaponHud();
}
export function stowNearby() {
  if (!nearPickup || !player.bag.includes(null)) {
    if (nearPickup) toast(t('run.bagFull'), 1000);
    return;
  }
  const nw = takeNearby();
  if (!nw) return;
  player.bag[player.bag.indexOf(null)] = nw;
  toast(t('run.stowed', { w: weaponText(nw), n: player.bag.filter(Boolean).length, max: BAG_MAX }), 1400);
  weaponHud();
}
