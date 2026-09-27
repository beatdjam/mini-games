'use strict';
// engine: Screen helpers: toast (#toast), banner (#banner), fullscreen
let toastTimer = 0;
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2200);
}
function banner(code, sub) {
  $('#bannerCode').textContent = code; $('#bannerSub').textContent = sub;
  const b = $('#banner'); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 2000);
}
const fsEl = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
const isStandalone = (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone === true;
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || isStandalone;
function enterFs() {
  try {
    const fn = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
    const p = fn.call(fsEl);
    const lockLand = () => { try { const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (q && q.catch) q.catch(() => {}); } catch (e) {} };
    if (p && p.then) p.then(lockLand, () => {}); else lockLand();
  } catch (e) {}
}
function exitFs() {
  try { const fn = document.exitFullscreen || document.webkitExitFullscreen; const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function toggleFs() { if (!fsSupported) return; if (document.fullscreenElement || document.webkitFullscreenElement) exitFs(); else enterFs(); }
