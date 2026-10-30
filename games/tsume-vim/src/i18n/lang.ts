// A small text lookup for this game (the engine's i18n is not used here). `src/i18n/ja.ts` fills LANG.ja;
// screen text stays out of the code so tools/check_style.js and tools/check_i18n.js can check it.
export type UiText = string | ((v: Record<string, string | number>) => string);

export interface LangPack {
  name: string;
  ui: Record<string, UiText>;
  data: Record<string, unknown>;
}

export const LANG: Record<string, LangPack> = {};
const LANG_CODE = 'ja';

export function t(key: string, values?: Record<string, string | number>): string {
  const text = LANG[LANG_CODE]?.ui[key];
  if (text === undefined) return key;
  if (typeof text === 'function') return text(values ?? {});
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}

// Fills elements marked with data-i18n (text) or data-i18n-content (an attribute).
export function applyStaticText(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n ?? '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-content]').forEach(element => {
    element.setAttribute('content', t(element.dataset.i18nContent ?? ''));
  });
  document.documentElement.lang = LANG_CODE;
}
