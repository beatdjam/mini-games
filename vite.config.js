// Vite: `npm run dev` serves the repo as it is (http://localhost:8765/), `npm run build` writes dist/ for GitHub Pages.
// Every games/<id>/index.html (plus its other pages) is a page of the build. Files that must keep their names
// (PWA manifest, icons) live in public/ and are copied as they are. The build stamps a version:
// <meta name="build" content="dev"> becomes the build time, and games/<id>/version.json carries the same value
// (engine/core/stale.ts, inlined into the page, compares the two to replace a stale cached page).
import { defineConfig, transformWithEsbuild } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

const jst = new Date(Date.now() + 9 * 3600e3).toISOString();
const BUILD = jst.slice(0, 19).replace(/\D/g, '');
const games = readdirSync('games').filter(g => existsSync(`games/${g}/index.html`));
const pages = { top: resolve('index.html'), privacy: resolve('privacy.html'), engineTest: resolve('engine/test/index.html') };
for (const g of games) {
  for (const f of readdirSync(`games/${g}`).filter(f => f.endsWith('.html'))) pages[f === 'index.html' ? g : `${g}-${f.replace('.html', '')}`] = resolve(`games/${g}/${f}`);
}

// Google Analytics 4 measurement id (it is public: it ends up in every page). Empty = no tag anywhere.
const GA_ID = 'G-N6B7J9DVGE';
const SITE_HOST = 'beatdjam.github.io';
// adds the GA4 tag to every built page except the engine tests. The tag only starts on the real site, so a local
// `npm run preview` (and the smoke test run against it) sends nothing. Events: engine/core/analytics.ts track()
function analytics() {
  return {
    name: 'analytics',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!GA_ID || ctx.path.startsWith('/engine/')) return html;
      const tag = `<script>if(location.hostname==='${SITE_HOST}'){window.dataLayer=window.dataLayer||[];` +
        `window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${GA_ID}');` +
        `const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_ID}';document.head.appendChild(s)}</script>`;
      return html.replace('</head>', tag + '\n</head>');
    },
  };
}

function buildStamp() {
  return {
    name: 'build-stamp',
    apply: 'build',
    // stamp the build and inline the stale-page guard (engine/core/stale.ts, compiled to JS) right after the build meta
    async transformIndexHtml(html) {
      if (!html.includes('<meta name="build" content="dev">')) return html;
      const { code } = await transformWithEsbuild(readFileSync('engine/core/stale.ts', 'utf8'), 'stale.ts', { minify: true });
      return html.replace('<meta name="build" content="dev">', `<meta name="build" content="${BUILD}">\n<script>${code.trim()}</script>`);
    },
    generateBundle() {
      for (const g of games) this.emitFile({ type: 'asset', fileName: `games/${g}/version.json`, source: JSON.stringify({ build: BUILD }) + '\n' });
    },
  };
}

// the published site lives at https://beatdjam.github.io/mini-games/ (build and `npm run preview`); the dev server at /
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/mini-games/' : '/',
  server: { port: 8765, strictPort: true },
  // three.js alone is ~550 kB, so the vendor chunk is always over the default 500 kB warning
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800, rollupOptions: { input: pages } },
  plugins: [buildStamp(), analytics()],
}));
