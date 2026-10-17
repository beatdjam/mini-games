import { el } from '@engine/core/util.ts';
import type { WeaponItem } from '../data/types.ts';
import { RARITY } from '../data/weapons.ts';
import './hud2.css';
// The fight's screen as laid out since 2026-10-17 (body.hud2): the map alone at the top left, HP and stamina at the
// bottom middle with the weapons under them, the buttons as pictures instead of words (a player of a shooter knows
// them by their pictures; words on every button read as a game explaining itself). ?hud1 brings back the old layout
// (dev: to compare), whose elements are all still there: this only moves them and puts pictures in.
export const hud2 = !new URLSearchParams(location.search).has('hud1');

// the buttons' pictures: lines in currentColor on a 24 x 24 box
const line = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  fire: line('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  reload: line('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v6h-6"/>'),
  dash: line('<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>'),
  kit: line('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'),
  bag: line('<path d="M6 8h12l1 13H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  pause: line('<path d="M9 5v14M15 5v14"/>'),
  fs: line('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  fsOff: line('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'),
};
// the weapons' outlines, filled, on a 64 x 24 box facing right
const WEAPON_PATH: Record<string, string> = {
  pistol: 'M18 6h30v6H32l-2 2h-4l-2 8h-7l3-10h-2z',
  smg: 'M8 7h40v3h6v3H42l-2 2h-5l-1 8h-6l1-8h-6l-2 3h-4l1-4H8z',
  shotgun: 'M2 9h58v4H32l-3 2h-5l-2 3H9l2-5H2z',
  rail: 'M2 8h56l4 2-4 2H40v3H28l-3 6h-7l3-6H8l-3 2H2z',
  launcher: 'M4 5h52v10H38l-2 3h-5l-1 4h-6l1-4h-4v-3H4z',
};
export const weaponIcon = (id: string) =>
  `<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="${WEAPON_PATH[id] ?? WEAPON_PATH.pistol}"/></svg>`;
// a slot: the weapon's outline in its rarity's colour and a line of that colour under it, its +value small after it,
// a dot for each of its options (what they are is in the bag)
export const slotHtml = (w: WeaponItem | null, n: number) =>
  w
    ? `<span class="wico" style="color:${RARITY[w.r].css}">${weaponIcon(w.id)}</span>` +
      (w.plus ? `<em>+${w.plus}</em>` : '') +
      (w.opts?.length ? `<i class="wopts">${'•'.repeat(w.opts.length)}</i>` : '') +
      `<b class="wrar" style="background:${RARITY[w.r].css}"></b>`
    : `<span class="wnum">${n}</span>`;

// a button: its picture in place of its words, which become its name for screen readers (still in the language)
function picture(id: string, icon: string) {
  const b = el(`#${id}`),
    key = b.dataset.i18n;
  if (key) {
    b.removeAttribute('data-i18n');
    b.dataset.i18nAria = key;
  }
  b.innerHTML = icon;
}
if (hud2) {
  document.body.classList.add('hud2');
  // HP, stamina and the kits go down to the bottom, over the weapons; the ammo goes beside them
  const status = document.createElement('div'),
    row = document.createElement('div');
  status.id = 'status';
  row.id = 'weapRow';
  status.append(el('.hplabel'), el('#hpBar'), el('#stBar'), el('#kitHud'));
  row.append(el('#ammo'), el('#weap'));
  el('#bottom').replaceChildren(status, row);
  picture('btnFire', ICON.fire);
  picture('btnFire2', ICON.fire);
  picture('btnReload', ICON.reload);
  picture('btnDash', ICON.dash);
  picture('btnBag', ICON.bag);
  picture('btnPause', ICON.pause);
  // the kit button keeps its count under the picture
  const kit = el('#btnKit');
  kit.innerHTML = `${ICON.kit}<span id="kitBtnN">1</span>`;
  kit.dataset.i18nAria = 'btn.kit';
}
