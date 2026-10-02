import type { Pickup, WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch } from '@engine/core/util.ts';
import { query } from '@engine/core/world.ts';
import { LANG, lang, setLang, t } from '@engine/core/i18n.ts';
import { applySfxVolume, audioInit } from '@engine/audio/audio.ts';
import { musicVolume } from '@engine/audio/music.ts';
import { camera, resize } from '@engine/render/render.ts';
import { H, T, W, cover, grid, hgt, ramp, tileIndex } from '@engine/world/tiles.ts';
import { fsSupported, isFullscreen, isStandalone, toggleFs } from '@engine/ui/ui.ts';
import { locked } from '@engine/ui/input.ts';
import { TOUCH_LAYOUT, applyLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { GUIDE_DESK, GUIDE_TOUCH, LAYOUT_DEF } from '../data/controls.ts';
import { persist, save, syncVolumes } from '../core/save.ts';
import { layoutEdits, resetLayout, setLanguage, setSetting, toggleSetting } from '../core/progress.ts';
import { level } from '../world/level.ts';
import { boss, enemies, nearPickup, target } from '../world/entities.ts';
import { player, currentWeapon, magSize, run, weaponName, weaponText, weaponStats } from '../actors/player.ts';
import { setState, show, state } from '../flow/state.ts';
import { refreshRunText } from '../screens/pause.ts';
import { renderBase } from '../screens/base.ts';
import { time } from '../flow/update.ts';
import { CSS_COLOR } from '../data/colors.ts';
export const hpFill = el('#hpFill'),
  hpNum = el('#hpNum'),
  hpBar = el('#hpBar'),
  stFill = el('#stFill'),
  stBar = el('#stBar'),
  bitNum = el('#bitNum');
export const cross = el('#cross'),
  hitm = el('#hitm'),
  ammoEl = el('#ammo'),
  reloadEl = el('#reload'),
  rFill = el('#rFill');
export const vigEl = el('#vig'),
  bossFill = el('#bossFill'),
  mini = el<HTMLCanvasElement>('#mini'),
  mctx = mini.getContext('2d')!,
  bigmap = el<HTMLCanvasElement>('#bigmap'),
  bctx = bigmap.getContext('2d')!;
// screen effects shared by several files: hit marker, damage vignette, camera shake, minimap redraw, stamina warning
export const screenFx = { hitTimer: 0, vig: 0, shake: 0, miniT: 0, stWarn: 0 };
// ---- where a hit came from: a red arc around the crosshair, only when the attacker is outside the view ----
// hits from in front need no arc (you can see them); the arc keeps pointing at the spot while you turn, then fades
export const hitDirs: { el: HTMLElement; x: number; z: number; t: number }[] = [];
// angle of a point from the view direction: 0 = straight ahead, positive = to the left (the camera's yaw convention)
const relAngle = (x: number, z: number) => {
  const a = Math.atan2(-(x - player.x), -(z - player.z)) - player.yaw;
  return Math.atan2(Math.sin(a), Math.cos(a));
};
export function hitDirection(x: number, z: number) {
  const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect); // half the horizontal field of view
  if (Math.abs(relAngle(x, z)) < half * 0.9) return;
  let d = hitDirs.find(h => h.t <= 0);
  if (!d && hitDirs.length < 4) {
    const de = document.createElement('div');
    de.className = 'hdir';
    el('#hitDirs').appendChild(de);
    d = { el: de, x: 0, z: 0, t: 0 };
    hitDirs.push(d);
  }
  if (!d) d = hitDirs.reduce((a, b) => (a.t < b.t ? a : b));
  d.x = x;
  d.z = z;
  d.t = TUNE.hitDirTime;
}
export function updateHitDirs(dt: number) {
  for (const d of hitDirs) {
    if (d.t <= 0) {
      d.el.style.opacity = '0';
      continue;
    }
    d.t -= dt;
    d.el.style.transform = `rotate(${-relAngle(d.x, d.z)}rad)`;
    d.el.style.opacity = String(Math.max(0, d.t / TUNE.hitDirTime));
  }
}
export function hitMark(crit?: boolean) {
  hitm.classList.add('on');
  hitm.classList.toggle('crit', !!crit);
  screenFx.hitTimer = 0.09;
}
export function toggleMap() {
  if (state !== 'play') return;
  bigmap.hidden = !bigmap.hidden;
  screenFx.miniT = 0;
}
export function weaponHud() {
  [0, 1].forEach(k => {
    const slot = el('#w' + k),
      w = player.weapons[k];
    slot.classList.toggle('on', k === player.cur);
    slot.innerHTML = w ? t('hud.slot', { n: k + 1, name: weaponName(w) }) : t('hud.slotEmpty', { n: k + 1 });
  });
  el('#kitBtnN').textContent = String(player.kits);
  const kh = el('#kitHud');
  kh.textContent = t('hud.kits', { n: player.kits, max: KIT_MAX });
  kh.classList.toggle('none', player.kits <= 0);
  el('#btnKit').classList.toggle('off', player.kits <= 0);
}
export function updateHud() {
  const f = clamp(player.hp / player.maxHp, 0, 1);
  hpFill.style.transform = `scaleX(${f})`;
  hpBar.classList.toggle('low', f < 0.3);
  hpNum.textContent = String(Math.ceil(player.hp));
  stFill.style.transform = `scaleX(${clamp(player.st / player.stMax, 0, 1)})`;
  stBar.classList.toggle('short', player.st < TUNE.dashCost);
  stBar.classList.toggle('warn', screenFx.stWarn > 0);
  bitNum.textContent = String(Math.floor(run.bits));
  cross.classList.toggle('lock', !!target);
  const w = currentWeapon(),
    ms = magSize(w);
  const at = `${w.mag}<small> / ${ms}</small>`;
  if (ammoEl.dataset.v !== at) {
    ammoEl.innerHTML = at;
    ammoEl.dataset.v = at;
    ammoEl.classList.toggle('empty', w.mag === 0);
  }
  reloadEl.hidden = !(player.reloadT > 0);
  if (player.reloadT > 0) rFill.style.transform = `scaleX(${1 - player.reloadT / player.reloadMax})`;
  el('#btnDash').classList.toggle('off', player.st < TUNE.dashCost);
  if (boss) bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  const lowPulse = f < 0.3 ? 0.25 + Math.sin(time * 5) * 0.12 : 0;
  vigEl.style.opacity = String(Math.max(screenFx.vig, lowPulse));
  const row = el('#pickRow');
  if (nearPickup) {
    const desk = !isTouch && !document.body.classList.contains('nolock'),
      bagFree = player.bag.includes(null);
    const name =
      weaponText(nearPickup.w!) +
      (desk
        ? t('hud.pickDesk', {
            act: t(player.weapons[1] ? 'hud.pickSwap' : 'hud.pickEquip'),
            full: bagFree ? '' : t('hud.pickFull'),
          })
        : '');
    const diff = compareHTML(nearPickup.w!, currentWeapon()),
      key = name + '|' + diff + '|' + player.cur + '|' + bagFree;
    if (row.hidden || row.dataset.key !== key) {
      row.dataset.key = key;
      el('#pickName').textContent = name;
      el('#pickDiff').innerHTML = diff;
      el('#btnEquip').textContent = t(player.weapons[1] ? 'hud.btnSwap' : 'hud.btnEquip2');
      el('#btnStow').textContent = bagFree
        ? t('hud.btnStow', { n: player.bag.filter(w => !w).length })
        : t('hud.btnStowFull');
      el<HTMLButtonElement>('#btnStow').disabled = !bagFree;
      row.hidden = false;
    }
    el('#hint').textContent = ''; // the prompt sits where the hint line is
  } else if (!row.hidden) {
    row.hidden = true;
    updateHint();
  }
}
// "DPS 142 ▲+38 / per hit 16×8 ▼-4 / mag 6 ▼-6" against the weapon in hand
export function compareHTML(w: WeaponItem, cur: WeaponItem) {
  const a = weaponStats(w),
    b = weaponStats(cur);
  const d = (v: number, base: number) => {
    const diff = Math.round(v) - Math.round(base);
    return diff > 0
      ? `<span class="up">▲+${diff}</span>`
      : diff < 0
        ? `<span class="down">▼${diff}</span>`
        : '<span class="same">±0</span>';
  };
  const hits = a.hits > 1 ? `×${a.hits}` : '';
  return t('hud.compare', {
    dps: Math.round(a.dps),
    ddps: d(a.dps, b.dps),
    hit: Math.round(a.perHit),
    hits,
    dhit: d(a.perHit * a.hits, b.perHit * b.hits),
    mag: a.mag,
    dmag: d(a.mag, b.mag),
  });
}
export function updateHint() {
  const h = el('#hint');
  if (isTouch) h.textContent = '';
  else if (document.body.classList.contains('nolock')) h.textContent = t('hud.hintTouchLook');
  else h.textContent = locked || state !== 'play' ? '' : t('hud.hintLock');
}
export function drawMap(c: HTMLCanvasElement, g: CanvasRenderingContext2D, big?: boolean) {
  const s = c.width / Math.max(W, H);
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = level.biome.line;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!level.seen[k] || grid[k] !== 1) continue;
      // brighter = higher; cover is grey, hazard tiles get a red tint
      g.fillStyle = cover[k] ? '#5b6168' : level.biome.line;
      g.globalAlpha = cover[k] ? 0.8 : ramp[k] >= 0 ? 0.8 : hgt[k] > 0 ? 1 : level.roomOf[k] >= 0 ? 0.55 : 0.4;
      g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      if (level.hazardTiles[k]) {
        g.fillStyle = '#ff4d4d';
        g.globalAlpha = 0.45;
        g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      }
    }
  g.globalAlpha = 1;
  const px = (x: number) => (x / T) * s,
    u = c.width / 160;
  query<Pickup>('pickup').forEach(p => {
    if (p.kind === 'bit') return;
    if (!level.seen[tileIndex(p.x, p.z)]) return;
    g.fillStyle = p.kind === 'chip' ? CSS_COLOR.amber : p.kind === 'kit' ? CSS_COLOR.lime : '#ffffff';
    g.fillRect(px(p.x) - 2.5 * u, px(p.z) - 2.5 * u, 5 * u, 5 * u);
  });
  level.portals.forEach(pt => {
    if (!level.seen[tileIndex(pt.x, pt.z)]) return;
    g.strokeStyle = '#' + pt.color.toString(16).padStart(6, '0');
    g.lineWidth = 2 * u;
    g.beginPath();
    g.arc(px(pt.x), px(pt.z), 5 * u, 0, Math.PI * 2);
    g.stroke();
    if (big) {
      g.fillStyle = g.strokeStyle;
      g.font = `${7 * u}px "DotGothic16",sans-serif`;
      g.textAlign = 'center';
      g.fillText(
        t(pt.kind === 'extract' ? 'map.extract' : pt.kind === 'next' && level.arena ? 'map.next' : 'map.exit'),
        px(pt.x),
        px(pt.z) - 8 * u,
      );
    }
  });
  g.fillStyle = CSS_COLOR.mag;
  enemies.forEach(e => {
    if (!e.dead && (e.active || e.boss) && level.seen[tileIndex(e.x, e.z)]) {
      g.beginPath();
      g.arc(px(e.x), px(e.z), (e.boss ? 5 : 2.2) * u, 0, Math.PI * 2);
      g.fill();
    }
  });
  const x = px(player.x),
    z = px(player.z),
    fx = -Math.sin(player.yaw),
    fz = -Math.cos(player.yaw),
    a = 6 * u,
    b = 3.5 * u;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x + fx * a, z + fz * a);
  g.lineTo(x - fx * b + fz * b, z - fz * b - fx * b);
  g.lineTo(x - fx * b - fz * b, z - fz * b + fx * b);
  g.closePath();
  g.fill();
}

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

export function settingsHTML(where?: string) {
  const st = save.settings;
  const onOff = (v: boolean) => t(v ? 'set.on' : 'set.off');
  const langSeg = `<div class="seg" role="group" aria-label="${t('set.lang')}"><span>${t('set.lang')}</span>${Object.keys(
    LANG,
  )
    .map(k => `<button data-lang="${k}" aria-pressed="${lang === k}">${LANG[k].name}</button>`)
    .join('')}</div>`;
  const fsBtn =
    fsSupported && !isStandalone
      ? `<button class="toggle" data-fs="1" aria-pressed="${isFullscreen()}">${t('set.fs')}<b>${onOff(isFullscreen())}</b></button>`
      : '';
  return `${langSeg}${fsBtn}<button class="toggle" data-set="autofire" aria-pressed="${st.autofire}">${t('set.autofire')}<b>${onOff(st.autofire)}</b></button>
    <div class="seg" role="group" aria-label="${t('set.assist')}"><span>${t('set.assist')}</span>${[
      ['off', 'set.assistOff'],
      ['weak', 'set.assistWeak'],
      ['strong', 'set.assistStrong'],
    ]
      .map(([k, l]) => `<button data-assist="${k}" aria-pressed="${st.assist === k}">${t(l)}</button>`)
      .join('')}</div>
    <label class="sens" for="sens-${where}">${t('set.sens')} <input id="sens-${where}" class="sensIn" type="range" min="0.4" max="2.2" step="0.1" value="${st.sens}"><span class="num sensV">${st.sens.toFixed(1)}</span></label>
    <label class="sens" for="bgm-${where}">${t('set.bgm')} <input id="bgm-${where}" class="volIn" data-vol="bgm" type="range" min="0" max="1" step="0.05" value="${st.bgm ?? 0.6}"></label>
    <label class="sens" for="sfx-${where}">${t('set.sfx')} <input id="sfx-${where}" class="volIn" data-vol="sfx" type="range" min="0" max="1" step="0.05" value="${st.sfx ?? 1}"></label>
    ${
      isTouch
        ? `<button class="toggle" data-set="leftFire" aria-pressed="${st.leftFire}">${t('set.leftFire')}<b>${onOff(st.leftFire)}</b></button>
    <button class="toggle" data-set="stickDash" aria-pressed="${st.stickDash}">${t('set.stickDash')}<b>${onOff(st.stickDash)}</b></button>
    <button class="toggle" data-layout="1">${t('set.layout')}</button>`
        : ''
    }`;
}
export function renderSettings() {
  document.querySelectorAll<HTMLElement>('[data-settings]').forEach(el => {
    el.innerHTML = settingsHTML(el.dataset.settings);
  });
}
document.addEventListener('click', e => {
  const el = e.target as HTMLElement;
  const s = el.closest<HTMLElement>('[data-set]'),
    a = el.closest<HTMLElement>('[data-assist]'),
    f = el.closest('[data-fs]');
  const lo = el.closest('[data-layout]'),
    lg = el.closest<HTMLElement>('[data-lang]');
  if (lg) changeLang(lg.dataset.lang!);
  else if (lo) openLayoutEditor(state === 'pause' ? 'pause' : 'base');
  else if (f) toggleFs();
  else if (s) {
    const k = s.dataset.set as 'autofire' | 'leftFire' | 'stickDash';
    toggleSetting(k);
    persist();
    renderSettings();
    applyLayout();
  } else if (a) {
    setSetting('assist', a.dataset.assist!);
    persist();
    renderSettings();
  }
});
document.addEventListener('input', ev => {
  const e = { target: ev.target as HTMLInputElement };
  if (e.target.classList && e.target.classList.contains('volIn')) {
    const k = e.target.dataset.vol as 'bgm' | 'sfx';
    setSetting(k, parseFloat(e.target.value));
    persist();
    document.querySelectorAll<HTMLInputElement>(`.volIn[data-vol="${k}"]`).forEach(v => {
      if (v !== e.target) v.value = String(save.settings[k]);
    });
    syncVolumes();
    audioInit();
    musicVolume();
    applySfxVolume();
    return;
  }
  if (e.target.classList && e.target.classList.contains('sensIn')) {
    setSetting('sens', parseFloat(e.target.value));
    persist();
    document.querySelectorAll('.sensV').forEach(v => {
      v.textContent = save.settings.sens.toFixed(1);
    });
    document.querySelectorAll<HTMLInputElement>('.sensIn').forEach(v => {
      if (v !== e.target) v.value = String(save.settings.sens);
    });
  }
});
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

export function renderGuide() {
  el('#guide').innerHTML = (isTouch ? GUIDE_TOUCH : GUIDE_DESK).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
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
