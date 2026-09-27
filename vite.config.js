// Vite: `npm run dev` serves the repo as it is (http://localhost:8765/), `npm run build` writes dist/ for GitHub Pages.
// Every games/<id>/index.html (plus its other pages) is a page of the build. Files that must keep their names
// (PWA manifest, icons) live in public/ and are copied as they are. The build stamps a version:
// <meta name="build" content="dev"> becomes the build time, and games/<id>/version.json carries the same value
// (engine/core/stale.js, inlined into the page, compares the two to replace a stale cached page).
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

const jst = new Date(Date.now() + 9 * 3600e3).toISOString();
const BUILD = jst.slice(0, 19).replace(/\D/g, '');
const games = readdirSync('games').filter(g => existsSync(`games/${g}/index.html`));
const pages = { top: resolve('index.html'), engineTest: resolve('engine/test/index.html') };
for (const g of games) {
  for (const f of readdirSync(`games/${g}`).filter(f => f.endsWith('.html'))) pages[f === 'index.html' ? g : `${g}-${f.replace('.html', '')}`] = resolve(`games/${g}/${f}`);
}

function buildStamp() {
  return {
    name: 'build-stamp',
    apply: 'build',
    // stamp the build and inline the stale-page guard (engine/core/stale.js) right after the build meta
    transformIndexHtml: html => html.replace(/(<meta name="build" content=")dev">/,
      `$1${BUILD}">\n<script>\n${readFileSync('engine/core/stale.js', 'utf8')}</script>`),
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
  plugins: [buildStamp()],
}));
