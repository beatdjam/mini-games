'use strict';
// engine: Stale-page guard. Load it first, in <head>. The page carries <meta name="build" content="<build>"> and the
// game folder has version.json ({ "build": "<build>" }), both written by tools/bump-version.sh. If a cached copy of the
// page is older than what is deployed, jump once (per session and build) to a fresh URL.
(() => {
  const meta = document.querySelector('meta[name="build"]'); if (!meta) return;
  const mine = meta.content, key = 'stale-reload:' + location.pathname;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => {
    if (!v || v.build === mine) return;
    let tried = null; try { tried = sessionStorage.getItem(key); } catch (e) {}
    if (tried === v.build) return;
    try { sessionStorage.setItem(key, v.build); } catch (e) {}
    location.replace(location.pathname + '?b=' + v.build + location.hash);
  }).catch(() => {});
})();
