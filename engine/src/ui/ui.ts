import { el } from '../core/util.ts';
// engine: Screen helpers: toast (#toast), banner (#banner), fullscreen, keeping the screen awake
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms?: number) {
  const t = el('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2200);
}
// a new banner restarts the clock, so an earlier banner's timer can't hide it early (same as toast)
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
export function banner(code: string, sub: string) {
  el('#bannerCode').textContent = code;
  el('#bannerSub').textContent = sub;
  const b = el('#banner');
  b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), 2000);
}
export const fullscreenTarget = document.documentElement;
export const fsSupported =
  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
  !!(fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen);
export const isStandalone =
  (typeof window.matchMedia === 'function' &&
    matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) ||
  navigator.standalone === true;
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || isStandalone;
export function enterFs() {
  try {
    const fn = fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen;
    const p = fn.call(fullscreenTarget);
    const lockLand = () => {
      try {
        const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
        if (q && q.catch) q.catch(() => {});
      } catch (e) {}
    };
    if (p && p.then) p.then(lockLand, () => {});
    else lockLand();
  } catch (e) {}
}
export function exitFs() {
  try {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    const p = fn.call(document);
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
export function toggleFs() {
  if (!fsSupported) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) exitFs();
  else enterFs();
}

// Screen Wake Lock: the screen does not dim while the game wants it awake (keepAwake(true)).
// The browser drops the lock whenever the page goes to the background, so it is taken again when the page is visible.
const awake = {
  on: false, // keepAwake(true) was called and not yet undone
  lock: null as WakeLockSentinel | null, // the lock we hold (the browser sets .released when it takes it away)
};
const holding = () => !!awake.lock && !awake.lock.released;
function acquireWakeLock() {
  const wl = navigator.wakeLock;
  if (!awake.on || holding() || !wl || !wl.request) return;
  // a request that settles late (or twice over) must not leave a second lock behind, or one after keepAwake(false)
  wl.request('screen').then(
    lock => {
      if (awake.on && !holding()) awake.lock = lock;
      else lock.release().catch(() => {});
    },
    () => {}, // refused (page hidden, battery saver...): the next visibilitychange tries again
  );
}
export function keepAwake(on: boolean) {
  awake.on = on;
  if (on) {
    acquireWakeLock();
    return;
  }
  const lock = awake.lock;
  awake.lock = null;
  if (lock && !lock.released) lock.release().catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquireWakeLock();
});
