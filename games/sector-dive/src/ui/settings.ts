// The settings the game offers (the panel itself is engine/src/ui/settings.ts): shown in the base's settings tab and
// on the pause screen. A change is saved at once; volumes and the touch layout are applied right away too.
import { isTouch } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { applySfxVolume, audioInit } from '@engine/audio/audio.ts';
import { musicVolume } from '@engine/audio/music.ts';
import { applyLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { SETTINGS, fullscreenSetting, languageSetting } from '@engine/ui/settings.ts';
import type { SettingItem } from '@engine/ui/settings.ts';
import { persist, save, syncVolumes } from '../core/save.ts';
import { setSetting, toggleSetting } from '../core/progress.ts';
import { state } from '../flow/state.ts';
import { changeLang } from './hud.ts';

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
