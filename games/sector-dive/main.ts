// Entry point. The imports below load every module (the order matters little: each one only declares things and
// registers listeners); the start-up that needs everything loaded — language, volumes, the base screen, the
// systems and the loop — runs at the bottom, after all of them.
import { setLang, defaultLang } from '../../engine/core/i18n.ts';
import { ANALYTICS } from '../../engine/core/analytics.ts';
import { FEEDBACK } from '../../engine/core/feedback.ts';
import { applyLayout } from '../../engine/ui/touchlayout.ts';
import { save, syncVolumes } from './js/system/save.ts';
import { fsLabel, renderGuide } from './js/ui/hud.ts';
import { showTab, baseTab } from './js/flow/game.ts';
import '../../engine/core/util.ts';
import '../../engine/core/store.ts';
import '../../engine/core/dev.ts';
import '../../engine/core/loop.ts';
import '../../engine/core/world.ts';
import '../../engine/core/i18n.ts';
import '../../engine/audio/audio.ts';
import '../../engine/audio/music.ts';
import '../../engine/render/render.ts';
import '../../engine/render/fx.ts';
import '../../engine/world/tiles.ts';
import '../../engine/world/projectiles.ts';
import '../../engine/world/steer.ts';
import '../../engine/ui/ui.ts';
import '../../engine/ui/input.ts';
import '../../engine/ui/touchlayout.ts';
import './js/data/weapons.ts';
import './js/data/viewmodels.ts';
import './js/data/level.ts';
import './js/data/enemies.ts';
import './js/data/bosses.ts';
import './js/data/biomes.ts';
import './js/data/progress.ts';
import './js/data/perks.ts';
import './js/data/controls.ts';
import './js/data/sfx.ts';
import './js/data/music.ts';
import './js/lang/ja.ts';
import './js/lang/en.ts';
import './js/system/text.ts';
import './js/system/save.ts';
import './js/system/rules.ts';
import './js/flow/music.ts';
import './js/world/render.ts';
import './js/world/level.ts';
import './js/world/entities.ts';
import './js/actors/player.ts';
import './js/actors/bosses/common.ts';
import './js/actors/bosses/watcher.ts';
import './js/actors/bosses/crusher.ts';
import './js/actors/bosses/core.ts';
import './js/actors/bosses/phantom.ts';
import './js/actors/bosses/trinity.ts';
import './js/actors/bosses/bastion.ts';
import './js/ui/input.ts';
import './js/ui/hud.ts';
import './js/flow/game.ts';
import './js/ui/share.ts';
import './js/ui/feedback.ts';
import './js/actors/enemies.ts';
import './js/actors/bullets.ts';
import { boot } from './js/flow/update.ts';

ANALYTICS.game = 'sector-dive'; // sent with every analytics event
FEEDBACK.game = 'sector-dive';   // filled into the feedback form
setLang(save.settings.lang || defaultLang());
syncVolumes();
fsLabel(); applyLayout(); renderGuide(); showTab(baseTab);
boot();
// checks and screenshot hooks (#smoke, #view-…): only on the dev server and in the test build (npm run test:build),
// never in the published pages. The dev module sets up its hooks with timers, so loading it after boot() is fine
if (import.meta.env.DEV || import.meta.env.MODE === 'test') import('./js/dev/dev.ts');
