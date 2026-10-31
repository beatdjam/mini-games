import { showFps } from '@engine/core/dev.ts';
import { drawStats } from '@engine/render/render.ts';
import { LANG, lang } from '@engine/core/i18n.ts';
import { BIOMES } from '../data/biomes.ts';
import { save } from '../core/save.ts';
import { devSeed } from '../world/level.ts';
import { devCourtOpen } from '../world/building.ts';
import { devPlainLooks } from '../world/looks.ts';
import { useSparkLooks } from '../world/models/sparkLooks.ts';
import { setHazardClock } from '../world/hazards.ts';
import { devPlainGuns } from '../actors/viewmodel.ts';
import { changeLang } from '../ui/settings.ts';
import { devFirstSector } from '../flow/run.ts';
import { renderBase } from '../screens/base.ts';
import { DEV_VIEWS } from './views/index.ts';
import { findDevView } from './views/view.ts';
// ================= dev hooks =================
// URL hash hooks for checking the game without playing it by hand. See SPEC.md, chapter 10.

// dev: ?plain draws every sector the plain way (no sector's own look), to compare with what was there before
if (new URLSearchParams(location.search).has('plain')) {
  devPlainLooks(true);
  devPlainGuns();
  useSparkLooks();
}
// dev: ?hazon keeps the hazard floors live (to look at them lit)
if (new URLSearchParams(location.search).has('hazon')) setInterval(() => setHazardClock(0.5), 50);
// dev seed: ?seed=<n> builds every level from that seed (the same level each time)
// ?sector=KWLN etc.: a dive started as usual (from the base) begins in that sector. The dev views (#bld-…,
// #view-enemies-…) read it too, for the building they stand in
devFirstSector(BIOMES.findIndex(x => x.code === new URLSearchParams(location.search).get('sector')));
const seedParam = new URLSearchParams(location.search).get('seed');
if (seedParam !== null && /^\d+$/.test(seedParam)) devSeed(Number(seedParam) >>> 0);
// dev: ?fps shows the frames drawn in the last second, top middle, and what the last frame drew (engine showFps)
if (new URLSearchParams(location.search).has('fps')) showFps(drawStats);
// dev: ?stats writes what the last frame drew into the page's title, ten times a second (to read it from a headless
// browser, which draws too slowly for ?fps to count a second of frames)
if (new URLSearchParams(location.search).has('stats')) setInterval(() => (document.title = drawStats()), 100);
// dev: ?court=open / ?court=roof makes every courtyard a yard open to the sky / a roofed atrium; with ?court=open,
// ?yard=balcony / walk / bridge gives every floor of a yard that shape
const courtParam = new URLSearchParams(location.search).get('court'),
  yardParam = new URLSearchParams(location.search).get('yard');
if (courtParam === 'open' || courtParam === 'roof')
  devCourtOpen(
    courtParam === 'open',
    yardParam === 'balcony' || yardParam === 'walk' || yardParam === 'bridge' ? yardParam : null,
  );

// dev: ?shortcut=<n>[&start=<n>] opens the start depths up to DEPTH n (and starts from DEPTH start), for the way down on
// the base screen (1-based, as on the screen)
{
  const q = new URLSearchParams(location.search),
    sc = Number(q.get('shortcut'));
  if (sc > 0)
    setTimeout(() => {
      save.shortcut = sc - 1;
      save.startTier = Math.min(Number(q.get('start') || sc) - 1, save.shortcut);
      renderBase();
    }, 0);
}
// the dev view the hash asks for (at most one), set up once the switches above are in place
const devView = findDevView(DEV_VIEWS, location.hash);
if (devView) devView.run(location.hash);
// dev: ?lang=<code> opens the page in that language (saved like the settings button does)
setTimeout(() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && LANG[q] && q !== lang) changeLang(q);
}, 0);
