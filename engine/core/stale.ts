// engine: Stale-page guard. The build inlines this file into the <head> of every page that has
// <meta name="build" content="<build>"> (vite.config.js), next to a games/<id>/version.json with the same build.
// It must not be bundled: a stale cached page points at JS files a new deploy has removed, so bundled code would never
// run. If the page is older than what is deployed, jump once (per session and build) to a fresh URL.
(() => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="build"]'); if (!meta || meta.content === 'dev') return; // dev server: nothing to compare
  const mine = meta.content, key = 'stale-reload:' + location.pathname;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => {
    if (!v || v.build === mine) return;
    let tried = null; try { tried = sessionStorage.getItem(key); } catch (e) {}
    if (tried === v.build) return;
    try { sessionStorage.setItem(key, v.build); } catch (e) {}
    location.replace(location.pathname + '?b=' + v.build + location.hash);
  }).catch(() => {});
})();
