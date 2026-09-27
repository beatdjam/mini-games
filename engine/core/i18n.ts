// engine: Text lookup and language switching.
// Each language file registers LANG.<code> = { name, ui: {key: text}, data: {...} }; ja is the fallback for missing keys.
// - ui: screen text. A string may contain {name} placeholders; a function gets the values object.
// - data: anything the game wants per language (names / descriptions of its definitions). setLang passes it to the
//   function the game registered with setI18nHook(fn), if any; fillData(target, src) copies entries onto definitions by id / key / index.
// Static HTML text is marked with data-i18n="key" (textContent) or data-i18n-aria / -alt / -content (attributes).
// a text is a string with {name} placeholders, or a function of the values
export type Text = string | ((v: Record<string, any>) => string);
export interface LangPack { name: string; ui: Record<string, Text>; data: Record<string, any>; }
export const LANG: Record<string, LangPack> = {};
export let lang = 'ja', i18nHook: ((data: Record<string, any>) => void) | null = null;
export function setI18nHook(fn: ((data: Record<string, any>) => void) | null) { i18nHook = fn; }
export function t(key: string, v?: Record<string, any>): string {
  let s: Text | undefined = LANG[lang].ui[key];
  if (s === undefined) s = LANG.ja.ui[key];
  if (s === undefined) { console.warn('i18n: missing', key); return key; }
  if (typeof s === 'function') return s(v || {});
  return v ? s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '') : s;
}
// target: an array (matched by id / code, else index) or an object (matched by key)
export function fillData(target: any[] | Record<string, any>, src: Record<string, any>) {
  Object.keys(src).forEach(k => {
    const obj = Array.isArray(target) ? (target.find(o => o && (o.id === k || o.code === k)) || target[+k]) : target[k];
    if (obj && typeof obj === 'object') Object.assign(obj, src[k]);
  });
}
export function applyStaticText(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n ?? ''); });
  ['aria', 'alt', 'content'].forEach(a => root.querySelectorAll<HTMLElement>(`[data-i18n-${a}]`).forEach(el =>
    el.setAttribute(a === 'aria' ? 'aria-label' : a, t(el.dataset['i18n' + a[0].toUpperCase() + a.slice(1)] ?? ''))));
  document.documentElement.lang = lang;
}
export function setLang(code: string) {
  lang = LANG[code] ? code : 'ja';
  if (i18nHook) i18nHook(LANG[lang].data);
  applyStaticText();
}
export const defaultLang = () => (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
