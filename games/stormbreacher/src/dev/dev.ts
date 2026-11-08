// Dev hooks: URL parameters and hashes for checking the game without playing it by hand. main.ts loads this only on
// the dev server, so the built pages carry none of it. See SPEC.md, chapter 6.
import { showFps } from '@engine/core/index.ts';
import { drawStats } from '@engine/render/index.ts';
import { seed } from '../logic/rng.ts';
import { DEV_VIEWS } from './views/index.ts';
import { findDevView } from './views/view.ts';

// The parameters the dev server answers, one line each (if they were ifs, the list would be harder to read).
const DEV_PARAMS: { param: string; run: (value: string) => void }[] = [
  // ?fps shows the frames drawn in the last second and what the last frame drew, top middle (engine showFps)
  { param: 'fps', run: () => showFps(drawStats) },
  // ?stats writes what the last frame drew into the page's title, ten times a second (a headless browser reads it there)
  { param: 'stats', run: () => setInterval(() => (document.title = drawStats()), 100) },
  // ?seed=<n> builds everything from that seed (the same field each time)
  {
    param: 'seed',
    run: value => {
      if (/^\d+$/.test(value)) seed(Number(value) >>> 0);
    },
  },
];

const params = new URLSearchParams(location.search);
for (const { param, run } of DEV_PARAMS) {
  const value = params.get(param);
  if (value !== null) run(value);
}

// #view-…: the view the hash asks for (the longest match)
const view = findDevView(DEV_VIEWS, location.hash);
if (view) view.run(location.hash);
