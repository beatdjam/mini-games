import type { GameState } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { gun } from '@engine/render/render.ts';
import { bigmap } from '../ui/hud.ts';
// ================= which screen is up =================
// the screen that is up; replaced only through setState
export let state: GameState = 'base';
export function setState(s: GameState) {
  state = s;
}
const screens = ['#scrBase', '#scrPerk', '#scrPause', '#scrResult', '#scrBag'];
export function show(id: string | null) {
  screens.forEach(s => {
    el(s).hidden = s !== id;
  });
}
export function setPlayUI(on: boolean) {
  el('#hud').hidden = !on;
  el('#touch').hidden = !on;
  gun.visible = on;
  if (!on) bigmap.hidden = true;
}
