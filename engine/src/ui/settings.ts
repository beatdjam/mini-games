// engine: The settings panel. The game lists its settings in SETTINGS.items; every [data-settings="<where>"]
// element on the page (e.g. a settings tab and the pause screen) shows them, and they stay in step.
// Kinds: toggle (on/off button), choice (segmented buttons), range (slider, optionally with its value), button.
// After a change the panels are drawn again and SETTINGS.onChange(key) runs (the game saves and applies it there).
// Markup (styled by the game): .toggle > b for on/off, .seg > span + buttons, label.sens > input (+ span.num).
import { LANG, lang } from '../core/i18n.ts';
import { fsSupported, isFullscreen, isStandalone, toggleFs } from './ui.ts';

interface ItemBase {
  key: string;
  label: () => string;
  show?: () => boolean; // false hides the item (e.g. touch-only settings)
}
export interface ToggleItem extends ItemBase {
  kind: 'toggle';
  get: () => boolean;
  set: (v: boolean) => void;
}
export interface ChoiceItem extends ItemBase {
  kind: 'choice';
  options: { value: string; label: () => string }[];
  get: () => string;
  set: (v: string) => void;
}
export interface RangeItem extends ItemBase {
  kind: 'range';
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  format?: (v: number) => string; // shown next to the slider when given
}
export interface ButtonItem extends ItemBase {
  kind: 'button';
  onClick: () => void;
}
export type SettingItem = ToggleItem | ChoiceItem | RangeItem | ButtonItem;

export const SETTINGS: {
  items: SettingItem[];
  onOff: (on: boolean) => string; // the word on a toggle
  onChange: (key: string) => void;
} = { items: [], onOff: on => (on ? 'ON' : 'OFF'), onChange: () => {} };

// ready-made items for things the engine owns: the language list and fullscreen
export const languageSetting = (label: () => string, change: (code: string) => void): ChoiceItem => ({
  kind: 'choice',
  key: 'lang',
  label,
  options: Object.keys(LANG).map(k => ({ value: k, label: () => LANG[k].name })),
  get: () => lang,
  set: change,
});
export const fullscreenSetting = (label: () => string): ToggleItem => ({
  kind: 'toggle',
  key: 'fs',
  label,
  show: () => fsSupported && !isStandalone,
  get: isFullscreen,
  set: () => toggleFs(),
});

const itemHTML = (it: SettingItem, where: string): string => {
  const label = it.label();
  switch (it.kind) {
    case 'toggle': {
      const on = it.get();
      return `<button class="toggle" data-set="${it.key}" aria-pressed="${on}">${label}<b>${SETTINGS.onOff(on)}</b></button>`;
    }
    case 'choice': {
      const cur = it.get();
      const opts = it.options
        .map(
          o =>
            `<button data-choice="${it.key}" data-value="${o.value}" aria-pressed="${cur === o.value}">${o.label()}</button>`,
        )
        .join('');
      return `<div class="seg" role="group" aria-label="${label}"><span>${label}</span>${opts}</div>`;
    }
    case 'range': {
      const v = it.get();
      const id = `${it.key}-${where}`;
      const shown = it.format ? `<span class="num" data-range-v="${it.key}">${it.format(v)}</span>` : '';
      return `<label class="sens" for="${id}">${label} <input id="${id}" data-range="${it.key}" type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">${shown}</label>`;
    }
    case 'button':
      return `<button class="toggle" data-action="${it.key}">${label}</button>`;
  }
};
export function settingsHTML(where: string): string {
  return SETTINGS.items
    .filter(it => !it.show || it.show())
    .map(it => itemHTML(it, where))
    .join('\n');
}
// draws every settings panel on the page again
export function renderSettings() {
  document.querySelectorAll<HTMLElement>('[data-settings]').forEach(p => {
    p.innerHTML = settingsHTML(p.dataset.settings || '');
  });
}
const item = <K extends SettingItem['kind']>(key: string | undefined, kind: K) =>
  SETTINGS.items.find((it): it is Extract<SettingItem, { kind: K }> => it.key === key && it.kind === kind);

document.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  if (!target.closest || !target.closest('[data-settings]')) return;
  const tg = target.closest<HTMLElement>('[data-set]'),
    ch = target.closest<HTMLElement>('[data-choice]'),
    bt = target.closest<HTMLElement>('[data-action]');
  if (tg) {
    const it = item(tg.dataset.set, 'toggle');
    if (!it) return;
    it.set(!it.get());
    renderSettings();
    SETTINGS.onChange(it.key);
  } else if (ch) {
    const it = item(ch.dataset.choice, 'choice');
    if (!it) return;
    it.set(ch.dataset.value!);
    renderSettings();
    SETTINGS.onChange(it.key);
  } else if (bt) {
    const it = item(bt.dataset.action, 'button');
    if (it) it.onClick();
  }
});
// a slider is not drawn again while it is dragged: the other panels' sliders and values follow it instead
document.addEventListener('input', e => {
  const input = e.target as HTMLInputElement;
  const key = input.dataset && input.dataset.range;
  const it = item(key, 'range');
  if (!it) return;
  it.set(parseFloat(input.value));
  const v = it.get();
  document.querySelectorAll<HTMLInputElement>(`[data-range="${key}"]`).forEach(o => {
    if (o !== input) o.value = String(v);
  });
  if (it.format) {
    const text = it.format(v);
    document.querySelectorAll(`[data-range-v="${key}"]`).forEach(o => {
      o.textContent = text;
    });
  }
  SETTINGS.onChange(it.key);
});
