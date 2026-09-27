'use strict';
// Text lookup. Each js/lang/<code>.js registers LANG.<code> = { name, ui: {key: text}, data: {...} }.
// - ui: screen text. A string may contain {name} placeholders; a function gets the values object.
// - data: names / descriptions for the definitions in js/data/, copied onto them by setLang (matched by id / key / index),
//   so code keeps reading WEAPONS[id].name, PERKS[i].desc(v) and so on.
// Static HTML text is marked with data-i18n="key" (textContent) or data-i18n-aria / -alt / -content (attributes).
const LANG = {};
let lang = 'ja';
function t(key, v) {
  let s = LANG[lang].ui[key];
  if (s === undefined) s = LANG.ja.ui[key];
  if (s === undefined) { console.warn('i18n: missing', key); return key; }
  if (typeof s === 'function') return s(v || {});
  return v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '') : s;
}
function fillData(target, src) {
  Object.keys(src).forEach(k => {
    const obj = Array.isArray(target) ? (target.find(o => o && (o.id === k || o.code === k)) || target[k]) : target[k];
    if (obj && typeof obj === 'object') Object.assign(obj, src[k]);
  });
}
function applyDataText() {
  const d = LANG[lang].data;
  fillData(WEAPONS, d.weapons); fillData(RARITY, d.rarity); fillData(AFFIX, d.affix);
  fillData(BIOMES, d.biomes); fillData(BOSS_META, d.bosses); fillData(PERKS, d.perks);
  fillData(UPGRADES, d.upgrades); fillData(PRES_UP, d.pres); fillData(LAYOUT_DEF, d.layout);
  GUIDE_DESK.splice(0, GUIDE_DESK.length, ...d.guideDesk); GUIDE_TOUCH.splice(0, GUIDE_TOUCH.length, ...d.guideTouch);
}
function applyStaticText(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  ['aria', 'alt', 'content'].forEach(a => root.querySelectorAll(`[data-i18n-${a}]`).forEach(el =>
    el.setAttribute(a === 'aria' ? 'aria-label' : a, t(el.dataset['i18n' + a[0].toUpperCase() + a.slice(1)]))));
  document.documentElement.lang = lang;
}
function setLang(code) {
  lang = LANG[code] ? code : 'ja';
  applyDataText(); applyStaticText();
}
const defaultLang = () => (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
