// The settings the game offers (the panel itself is engine/src/ui/settings.ts): shown in the base's settings tab and
// on the pause screen. A change is saved at once; volumes and the touch layout are applied right away too. Also here:
// the other things that follow from settings — the language switch, the fullscreen button, the touch button layout
// and the how-to-play list.
import { el, isTouch } from '@engine/core/util.ts';
import { setLang, t } from '@engine/core/i18n.ts';
import { applySfxVolume, audioInit } from '@engine/audio/audio.ts';
import { musicVolume } from '@engine/audio/music.ts';
import { resize } from '@engine/render/render.ts';
import { fsSupported, isFullscreen, isStandalone, toggleFs } from '@engine/ui/ui.ts';
import { TOUCH_LAYOUT, applyLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { SETTINGS, fullscreenSetting, languageSetting, renderSettings } from '@engine/ui/settings.ts';
import type { SettingItem } from '@engine/ui/settings.ts';
import { GUIDE_DESK, GUIDE_TOUCH, LAYOUT_DEF } from '../data/controls.ts';
import { persist, save, syncVolumes } from '../core/save.ts';
import { layoutEdits, resetLayout, setLanguage, setSetting, toggleSetting } from '../core/progress.ts';
import { player } from '../actors/player.ts';
import { setState, show, state } from '../flow/state.ts';
import { renderBase } from '../screens/base.ts';
import { openKeyDialog } from '../screens/keys.ts';
import { refreshRunText } from '../screens/pause.ts';
import { updateHint, weaponHud } from './hud.ts';
import { keyText } from './input.ts';
// languageSetting() lists the languages that are registered when it runs, so they must be loaded before this file
import '../i18n/ja.ts';
import '../i18n/en.ts';

export function fsLabel() {
  el('#btnFs').textContent = t(isFullscreen() ? 'hud.fsOff' : 'hud.fs');
}
el('#btnFs').hidden = !fsSupported || isStandalone;
el('#btnFs').addEventListener('click', toggleFs);
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
  document.addEventListener(ev, () => {
    fsLabel();
    renderSettings();
    setTimeout(resize, 100);
  }),
);

// touch buttons: placement and the editor are engine/src/ui/touchlayout.ts
Object.assign(TOUCH_LAYOUT, {
  defs: LAYOUT_DEF,
  first: 'dash',
  edits: layoutEdits,
  reset: resetLayout,
  save: persist,
  afterApply: () => {
    el('#btnFire2').hidden = !save.settings.leftFire;
  },
  onOpen: () => {
    show(null);
    setState('layout');
  },
  onClose: (from: string) => {
    if (from === 'pause') {
      setState('pause');
      renderSettings();
      show('#scrPause');
    } else {
      el('#touch').hidden = true;
      setState('base');
      renderSettings();
      show('#scrBase');
    }
  },
});

// a PC guide text with {action} / {action.0} replaced by the keys assigned now (all of them / the first one)
const withKeys = (text: string) =>
  text.replace(/\{(\w+)(?:\.(\d))?\}/g, (_, action: string, index?: string) =>
    keyText(action, index === undefined ? undefined : Number(index)),
  );
export function renderGuide() {
  const rows = isTouch ? GUIDE_TOUCH : GUIDE_DESK.map(([a, b]): [string, string] => [a, withKeys(b)]);
  el('#guide').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}
// switching language redraws whatever is on screen (static text is handled by setLang)
export function changeLang(code: string) {
  setLanguage(code);
  persist();
  setLang(code);
  renderSettings();
  renderGuide();
  fsLabel();
  updateHint();
  if (state === 'base') renderBase();
  if (player) {
    weaponHud();
    refreshRunText();
  }
}

type Flag = 'autofire' | 'leftFire' | 'stickDash';
const flag = (key: Flag, label: () => string, show?: () => boolean): SettingItem => ({
  kind: 'toggle',
  key,
  label,
  show,
  get: () => save.settings[key],
  set: () => toggleSetting(key),
});
const volume = (key: 'bgm' | 'sfx', label: () => string, fallback: number): SettingItem => ({
  kind: 'range',
  key,
  label,
  min: 0,
  max: 1,
  step: 0.05,
  get: () => save.settings[key] ?? fallback,
  set: v => setSetting(key, v),
});
const touchOnly = () => isTouch;
const deskOnly = () => !isTouch;

SETTINGS.onOff = on => t(on ? 'set.on' : 'set.off');
SETTINGS.items = [
  languageSetting(() => t('set.lang'), changeLang),
  fullscreenSetting(() => t('set.fs')),
  flag('autofire', () => t('set.autofire')),
  {
    kind: 'choice',
    key: 'assist',
    label: () => t('set.assist'),
    options: [
      { value: 'off', label: () => t('set.assistOff') },
      { value: 'weak', label: () => t('set.assistWeak') },
      { value: 'strong', label: () => t('set.assistStrong') },
    ],
    get: () => save.settings.assist,
    set: v => setSetting('assist', v),
  },
  {
    kind: 'range',
    key: 'sens',
    label: () => t('set.sens'),
    min: 0.4,
    max: 2.2,
    step: 0.1,
    get: () => save.settings.sens,
    set: v => setSetting('sens', v),
    format: v => v.toFixed(1),
  },
  volume('bgm', () => t('set.bgm'), 0.6),
  volume('sfx', () => t('set.sfx'), 1),
  flag('leftFire', () => t('set.leftFire'), touchOnly),
  flag('stickDash', () => t('set.stickDash'), touchOnly),
  {
    kind: 'button',
    key: 'layout',
    label: () => t('set.layout'),
    show: touchOnly,
    onClick: () => openLayoutEditor(state === 'pause' ? 'pause' : 'base'),
  },
  { kind: 'button', key: 'keys', label: () => t('set.keys'), show: deskOnly, onClick: openKeyDialog },
];
SETTINGS.onChange = key => {
  if (key === 'lang' || key === 'fs') return; // changeLang saves; fullscreen is not saved
  persist();
  if (key === 'bgm' || key === 'sfx') {
    syncVolumes();
    audioInit();
    musicVolume();
    applySfxVolume();
  } else if (key === 'autofire' || key === 'leftFire' || key === 'stickDash') applyLayout();
};
