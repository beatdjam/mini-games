import { WEAPON_ORDER, WEAPONS } from '../data/weapons.ts';
import { VIEWMODELS, VM_COLORS } from '../data/viewmodels.ts';
import { buildViewmodel, gun } from '@engine/render/render.ts';

// the gun in hand per weapon, from src/data/viewmodels.ts
export const viewmodelGroups: Record<string, THREE.Group> = {};
WEAPON_ORDER.forEach(id => {
  const g = buildViewmodel(VIEWMODELS[id], Object.assign({ acc: WEAPONS[id].color }, VM_COLORS));
  g.visible = false;
  gun.add(g);
  viewmodelGroups[id] = g;
});
// the gun in hand: recoil and muzzle flash timers
export const GUNFX = { gunKick: 0, flashT: 0 };
// the viewmodel shown (none until the first weapon is set)
export let curVM: THREE.Group | null = null;
export function setVM(id: string) {
  if (curVM) {
    curVM.visible = false;
    curVM.userData.flash.visible = false;
  }
  const vm = viewmodelGroups[id];
  curVM = vm;
  vm.visible = true;
}
