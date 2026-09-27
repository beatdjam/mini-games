'use strict';
const hpFill = $('#hpFill'), hpNum = $('#hpNum'), hpBar = $('#hpBar'), stFill = $('#stFill'), stBar = $('#stBar'), bitNum = $('#bitNum');
const cross = $('#cross'), hitm = $('#hitm'), ammoEl = $('#ammo'), reloadEl = $('#reload'), rFill = $('#rFill');
const vigEl = $('#vig'), bossFill = $('#bossFill'), mini = $('#mini'), mctx = mini.getContext('2d'), bigmap = $('#bigmap'), bctx = bigmap.getContext('2d');
let hitTimer = 0, vig = 0, shake = 0, miniT = 0, stWarn = 0;
function hitMark(crit) { hitm.classList.add('on'); hitm.classList.toggle('crit', !!crit); hitTimer = 0.09; }
function toggleMap() { if (state !== 'play') return; bigmap.hidden = !bigmap.hidden; miniT = 0; }
function weaponHud() {
  [0, 1].forEach(k => {
    const el = $('#w' + k), w = P.weapons[k];
    el.classList.toggle('on', k === P.cur);
    el.innerHTML = w ? t('hud.slot', { n: k + 1, name: wName(w) }) : t('hud.slotEmpty', { n: k + 1 });
  });
  $('#kitBtnN').textContent = P.kits;
  const kh = $('#kitHud'); kh.textContent = t('hud.kits', { n: P.kits, max: KIT_MAX }); kh.classList.toggle('none', P.kits <= 0);
  $('#btnKit').classList.toggle('off', P.kits <= 0);
}
function updateHud() {
  const f = clamp(P.hp / P.maxHp, 0, 1);
  hpFill.style.transform = `scaleX(${f})`; hpBar.classList.toggle('low', f < 0.3);
  hpNum.textContent = Math.ceil(P.hp);
  stFill.style.transform = `scaleX(${clamp(P.st / P.stMax, 0, 1)})`;
  stBar.classList.toggle('short', P.st < TUNE.dashCost); stBar.classList.toggle('warn', stWarn > 0);
  bitNum.textContent = Math.floor(run.bits);
  cross.classList.toggle('lock', !!target);
  const w = curW(), ms = magSize(w);
  const at = `${w.mag}<small> / ${ms}</small>`;
  if (ammoEl.dataset.v !== at) { ammoEl.innerHTML = at; ammoEl.dataset.v = at; ammoEl.classList.toggle('empty', w.mag === 0); }
  reloadEl.hidden = !(P.reloadT > 0);
  if (P.reloadT > 0) rFill.style.transform = `scaleX(${1 - P.reloadT / P.reloadMax})`;
  $('#btnDash').classList.toggle('off', P.st < TUNE.dashCost);
  if (boss) bossFill.style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  const lowPulse = f < 0.3 ? 0.25 + Math.sin(time * 5) * 0.12 : 0;
  vigEl.style.opacity = Math.max(vig, lowPulse);
  const row = $('#pickRow');
  if (nearW) {
    const desk = !isTouch && !document.body.classList.contains('nolock'), bagFree = P.bag.includes(null);
    const name = wText(nearW.w) + (desk ? t('hud.pickDesk', { act: t(P.weapons[1] ? 'hud.pickSwap' : 'hud.pickEquip'), full: bagFree ? '' : t('hud.pickFull') }) : '');
    const diff = compareHTML(nearW.w, curW()), key = name + '|' + diff + '|' + P.cur + '|' + bagFree;
    if (row.hidden || row.dataset.key !== key) {
      row.dataset.key = key;
      $('#pickName').textContent = name;
      $('#pickDiff').innerHTML = diff;
      $('#btnEquip').textContent = t(P.weapons[1] ? 'hud.btnSwap' : 'hud.btnEquip2');
      $('#btnStow').textContent = bagFree ? t('hud.btnStow', { n: P.bag.filter(w => !w).length }) : t('hud.btnStowFull');
      $('#btnStow').disabled = !bagFree;
      row.hidden = false;
    }
    $('#hint').textContent = ''; // the prompt sits where the hint line is
  } else if (!row.hidden) { row.hidden = true; updateHint(); }
}
// "DPS 142 ▲+38 / per hit 16×8 ▼-4 / mag 6 ▼-6" against the weapon in hand
function compareHTML(w, cur) {
  const a = weaponStats(w), b = weaponStats(cur);
  const d = (v, base) => {
    const diff = Math.round(v) - Math.round(base);
    return diff > 0 ? `<span class="up">▲+${diff}</span>` : diff < 0 ? `<span class="down">▼${diff}</span>` : '<span class="same">±0</span>';
  };
  const hits = a.hits > 1 ? `×${a.hits}` : '';
  return t('hud.compare', { dps: Math.round(a.dps), ddps: d(a.dps, b.dps), hit: Math.round(a.perHit), hits, dhit: d(a.perHit * a.hits, b.perHit * b.hits), mag: a.mag, dmag: d(a.mag, b.mag) });
}
function updateHint() {
  const h = $('#hint');
  if (isTouch) h.textContent = '';
  else if (document.body.classList.contains('nolock')) h.textContent = t('hud.hintTouchLook');
  else h.textContent = locked || state !== 'play' ? '' : t('hud.hintLock');
}
function drawMap(c, g, big) {
  const s = c.width / Math.max(W, H);
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = curBiome.line;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!seen[k] || grid[k] !== 1) continue;
    // brighter = higher; cover is grey, hazard tiles get a red tint
    g.fillStyle = cover[k] ? '#5b6168' : curBiome.line;
    g.globalAlpha = cover[k] ? 0.8 : ramp[k] >= 0 ? 0.8 : hgt[k] > 0 ? 1 : roomOf[k] >= 0 ? 0.55 : 0.4;
    g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
    if (haz[k]) { g.fillStyle = '#ff4d4d'; g.globalAlpha = 0.45; g.fillRect(i * s, j * s, s + 0.5, s + 0.5); }
  }
  g.globalAlpha = 1;
  const px = x => x / T * s, u = c.width / 160;
  query('pickup').forEach(p => {
    if (p.kind === 'bit') return;
    if (!seen[Math.floor(p.z / T) * W + Math.floor(p.x / T)]) return;
    g.fillStyle = p.kind === 'chip' ? '#ffc24a' : p.kind === 'kit' ? '#8cff6a' : '#ffffff';
    g.fillRect(px(p.x) - 2.5 * u, px(p.z) - 2.5 * u, 5 * u, 5 * u);
  });
  portals.forEach(pt => {
    if (!seen[Math.floor(pt.z / T) * W + Math.floor(pt.x / T)]) return;
    g.strokeStyle = '#' + pt.color.toString(16).padStart(6, '0'); g.lineWidth = 2 * u;
    g.beginPath(); g.arc(px(pt.x), px(pt.z), 5 * u, 0, Math.PI * 2); g.stroke();
    if (big) { g.fillStyle = g.strokeStyle; g.font = `${7 * u}px "DotGothic16",sans-serif`; g.textAlign = 'center'; g.fillText(t(pt.kind === 'extract' ? 'map.extract' : pt.kind === 'next' && arena ? 'map.next' : 'map.exit'), px(pt.x), px(pt.z) - 8 * u); }
  });
  g.fillStyle = '#ff4d8d';
  enemies.forEach(e => { if (!e.dead && (e.active || e.boss) && seen[Math.floor(e.z / T) * W + Math.floor(e.x / T)]) { g.beginPath(); g.arc(px(e.x), px(e.z), (e.boss ? 5 : 2.2) * u, 0, Math.PI * 2); g.fill(); } });
  const x = px(P.x), z = px(P.z), fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), a = 6 * u, b = 3.5 * u;
  g.fillStyle = '#ffffff'; g.beginPath();
  g.moveTo(x + fx * a, z + fz * a); g.lineTo(x - fx * b + fz * b, z - fz * b - fx * b); g.lineTo(x - fx * b - fz * b, z - fz * b + fx * b); g.closePath(); g.fill();
}

function fsLabel() { $('#btnFs').textContent = t(isFs() ? 'hud.fsOff' : 'hud.fs'); }
$('#btnFs').hidden = !fsSupported || isStandalone;
fsLabel();
$('#btnFs').addEventListener('click', toggleFs);
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { fsLabel(); renderSettings(); setTimeout(resize, 100); }));

function settingsHTML(where) {
  const st = save.settings;
  const onOff = v => t(v ? 'set.on' : 'set.off');
  const langSeg = `<div class="seg" role="group" aria-label="${t('set.lang')}"><span>${t('set.lang')}</span>${Object.keys(LANG).map(k =>
    `<button data-lang="${k}" aria-pressed="${lang === k}">${LANG[k].name}</button>`).join('')}</div>`;
  const fsBtn = fsSupported && !isStandalone ? `<button class="toggle" data-fs="1" aria-pressed="${isFs()}">${t('set.fs')}<b>${onOff(isFs())}</b></button>` : '';
  return `${langSeg}${fsBtn}<button class="toggle" data-set="autofire" aria-pressed="${st.autofire}">${t('set.autofire')}<b>${onOff(st.autofire)}</b></button>
    <div class="seg" role="group" aria-label="${t('set.assist')}"><span>${t('set.assist')}</span>${[['off', 'set.assistOff'], ['weak', 'set.assistWeak'], ['strong', 'set.assistStrong']].map(([k, l]) =>
      `<button data-assist="${k}" aria-pressed="${st.assist === k}">${t(l)}</button>`).join('')}</div>
    <label class="sens" for="sens-${where}">${t('set.sens')} <input id="sens-${where}" class="sensIn" type="range" min="0.4" max="2.2" step="0.1" value="${st.sens}"><span class="num sensV">${st.sens.toFixed(1)}</span></label>
    <label class="sens" for="bgm-${where}">${t('set.bgm')} <input id="bgm-${where}" class="volIn" data-vol="bgm" type="range" min="0" max="1" step="0.05" value="${st.bgm ?? 0.6}"></label>
    <label class="sens" for="sfx-${where}">${t('set.sfx')} <input id="sfx-${where}" class="volIn" data-vol="sfx" type="range" min="0" max="1" step="0.05" value="${st.sfx ?? 1}"></label>
    ${isTouch ? `<button class="toggle" data-set="leftFire" aria-pressed="${st.leftFire}">${t('set.leftFire')}<b>${onOff(st.leftFire)}</b></button>
    <button class="toggle" data-set="stickDash" aria-pressed="${st.stickDash}">${t('set.stickDash')}<b>${onOff(st.stickDash)}</b></button>
    <button class="toggle" data-layout="1">${t('set.layout')}</button>` : ''}`;
}
function renderSettings() { document.querySelectorAll('[data-settings]').forEach(el => { el.innerHTML = settingsHTML(el.dataset.settings); }); }
document.addEventListener('click', e => {
  const s = e.target.closest('[data-set]'), a = e.target.closest('[data-assist]'), f = e.target.closest('[data-fs]');
  const lo = e.target.closest('[data-layout]'), lg = e.target.closest('[data-lang]');
  if (lg) changeLang(lg.dataset.lang);
  else if (lo) openLayoutEditor(state === 'pause' ? 'pause' : 'base');
  else if (f) toggleFs();
  else if (s) { const k = s.dataset.set; save.settings[k] = !save.settings[k]; persist(); renderSettings(); applyLayout(); }
  else if (a) { save.settings.assist = a.dataset.assist; persist(); renderSettings(); }
});
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('volIn')) {
    const k = e.target.dataset.vol; save.settings[k] = parseFloat(e.target.value); persist();
    document.querySelectorAll(`.volIn[data-vol="${k}"]`).forEach(v => { if (v !== e.target) v.value = save.settings[k]; });
    syncVolumes(); audioInit(); musicVolume(); applySfxVolume();
    return;
  }
  if (e.target.classList && e.target.classList.contains('sensIn')) {
    save.settings.sens = parseFloat(e.target.value); persist();
    document.querySelectorAll('.sensV').forEach(v => { v.textContent = save.settings.sens.toFixed(1); });
    document.querySelectorAll('.sensIn').forEach(v => { if (v !== e.target) v.value = save.settings.sens; });
  }
});
// touch buttons: placement and the editor are engine/ui/touchlayout.js
Object.assign(TOUCH_LAYOUT, {
  defs: LAYOUT_DEF, first: 'dash',
  edits: () => save.settings.layout || (save.settings.layout = {}),
  reset: () => { save.settings.layout = {}; },
  save: persist,
  afterApply: () => { $('#btnFire2').hidden = !save.settings.leftFire; },
  onOpen: () => { show(null); state = 'layout'; },
  onClose: from => {
    if (from === 'pause') { state = 'pause'; renderSettings(); show('#scrPause'); }
    else { $('#touch').hidden = true; state = 'base'; renderSettings(); show('#scrBase'); }
  },
});
applyLayout();

function renderGuide() { $('#guide').innerHTML = (isTouch ? GUIDE_TOUCH : GUIDE_DESK).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join(''); }
renderGuide();
// switching language redraws whatever is on screen (static text is handled by setLang)
function changeLang(code) {
  save.settings.lang = code; persist(); setLang(code);
  renderSettings(); renderGuide(); fsLabel(); updateHint();
  if (state === 'base') renderBase();
  if (P) weaponHud();
}
