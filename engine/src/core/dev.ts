// engine: Checks without playing by hand, driven by the URL hash.
// devHook('view-x', rest => ...) runs when the hash starts with #view-x (rest = what follows, e.g. '-dead').
export function devHook(prefix: string, fn: (rest: string) => void, delay?: number) {
  if (!location.hash.startsWith('#' + prefix)) return;
  setTimeout(() => fn(location.hash.slice(prefix.length + 1)), delay ?? 300);
}
// shows the frames drawn in the last second, top middle, for looking at how heavy a place is (on a phone too). Call it
// once (a game turns it on from the URL, e.g. ?fps)
export function showFps() {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:99;padding:2px 8px;background:#000a;color:#fff;font:14px monospace';
  document.body.append(box);
  let frames = 0,
    since = performance.now();
  const count = (now: number) => {
    frames++;
    if (now - since >= 1000) {
      box.textContent = `${Math.round((frames * 1000) / (now - since))} fps`;
      frames = 0;
      since = now;
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
}
