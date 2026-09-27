// engine: Checks without playing by hand, driven by the URL hash (headless Chrome prints the console).
// devHook('view-x', rest => ...) runs when the hash starts with #view-x (rest = what follows, e.g. '-dead').
// devSmoke(fn) runs fn on #smoke: errors are logged as 'SMOKE ERR' / 'SMOKE FAIL', the page build is compared
// with version.json ('SMOKE build ok'), and 'SMOKE DONE' marks the end.
export function devHook(prefix, fn, delay) {
  if (!location.hash.startsWith('#' + prefix)) return;
  setTimeout(() => fn(location.hash.slice(prefix.length + 1)), delay ?? 300);
}
export function devSmoke(fn, delay) {
  if (location.hash !== '#smoke') return;
  window.addEventListener('error', e => console.error('SMOKE ERR', e.message, e.filename + ':' + e.lineno));
  setTimeout(() => {
    try {
      fn();
      const meta = document.querySelector('meta[name="build"]');
      if (meta && meta.content !== 'dev') fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(v => {
        console.log(v.build === meta.content ? 'SMOKE build ok ' + meta.content : 'SMOKE ERR build mismatch ' + meta.content + ' vs ' + v.build);
      });
      console.log('SMOKE DONE');
    } catch (err) { console.error('SMOKE FAIL', err && err.stack || err); }
  }, delay ?? 300);
}
