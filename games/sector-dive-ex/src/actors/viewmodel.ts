import { WEAPON_ORDER, WEAPONS } from '../data/weapons.ts';
import { VIEWMODELS, VM_COLORS } from '../data/viewmodels.ts';
import { buildViewmodel, gun } from '@engine/render/render.ts';
import { gunLook, hasGunLook } from './gunLooks.ts';

// the gun in hand per weapon: its own look (actors/gunLooks.ts), or the plain one from src/data/viewmodels.ts for a
// weapon without a look
const plainGun = (id: string): THREE.Group =>
  buildViewmodel(VIEWMODELS[id]!, Object.assign({ acc: WEAPONS[id]!.color }, VM_COLORS));
const viewmodelGroups: Record<string, THREE.Group> = {};
function setGroup(id: string, g: THREE.Group) {
  const old = viewmodelGroups[id];
  g.visible = !!old?.visible;
  if (old) gun.remove(old);
  gun.add(g);
  viewmodelGroups[id] = g;
  if (old && curVM === old) curVM = g;
}
// dev only (?plain, src/dev/dev.ts): every gun the plain way, to compare a look with what was there before
// (on = false puts the looks back: the trailer shows both)
export function devPlainGuns(on = true) {
  WEAPON_ORDER.forEach(id => setGroup(id, !on && hasGunLook(id) ? gunLook(id, WEAPONS[id]!.color) : plainGun(id)));
}
// the gun in hand: recoil and muzzle flash timers
export const GUNFX = { gunKick: 0, flashT: 0 };
// the viewmodel shown (none until the first weapon is set)
export let curVM: THREE.Group | null = null;
export function setVM(id: string) {
  if (curVM) {
    curVM.visible = false;
    curVM.userData.flash.visible = false;
  }
  const vm = viewmodelGroups[id]!;
  curVM = vm;
  vm.visible = true;
}
WEAPON_ORDER.forEach(id => setGroup(id, hasGunLook(id) ? gunLook(id, WEAPONS[id]!.color) : plainGun(id)));
