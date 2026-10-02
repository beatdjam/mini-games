// Entry point. The imports below load every module (the order matters little: each one only declares things and
// registers listeners); the start-up that needs everything loaded — language, volumes, the base screen, the
// systems and the loop — runs at the bottom, after all of them.
import { setLang, defaultLang } from '@engine/core/i18n.ts';
import { ANALYTICS } from '@engine/core/analytics.ts';
import { FEEDBACK } from '@engine/core/feedback.ts';
import { applyLayout } from '@engine/ui/touchlayout.ts';
import { save, syncVolumes } from './core/save.ts';
import { fsLabel, renderGuide } from './ui/hud.ts';
import { baseUI, showTab } from './screens/base.ts';
import '@engine/core/util.ts';
import '@engine/core/store.ts';
import '@engine/core/dev.ts';
import '@engine/core/loop.ts';
import '@engine/core/world.ts';
import '@engine/core/i18n.ts';
import '@engine/audio/audio.ts';
import '@engine/audio/music.ts';
import '@engine/render/render.ts';
import '@engine/render/fx.ts';
import '@engine/world/tiles.ts';
import '@engine/world/projectiles.ts';
import '@engine/world/steer.ts';
import '@engine/ui/ui.ts';
import '@engine/ui/input.ts';
import '@engine/ui/touchlayout.ts';
import './data/weapons.ts';
import './data/viewmodels.ts';
import './data/level.ts';
import './data/enemies.ts';
import './data/bosses.ts';
import './data/biomes.ts';
import './data/progress.ts';
import './data/perks.ts';
import './data/controls.ts';
import './data/sfx.ts';
import './data/music.ts';
import './i18n/ja.ts';
import './i18n/en.ts';
import './i18n/text.ts';
import './core/save.ts';
import './core/rules.ts';
import './flow/music.ts';
import './world/render.ts';
import './world/level.ts';
import './world/entities.ts';
import './core/stages.ts';
import './actors/player.ts';
import './actors/weapons.ts';
import './actors/viewmodel.ts';
import './actors/firing.ts';
import './actors/combat.ts';
import './actors/bosses/common.ts';
import './actors/bosses/watcher.ts';
import './actors/bosses/crusher.ts';
import './actors/bosses/core.ts';
import './actors/bosses/phantom.ts';
import './actors/bosses/trinity.ts';
import './actors/bosses/bastion.ts';
import './ui/input.ts';
import './ui/hud.ts';
import './flow/state.ts';
import './flow/attract.ts';
import './flow/run.ts';
import './flow/suspend.ts';
import './screens/perk.ts';
import './screens/pause.ts';
import './screens/bag.ts';
import './screens/result.ts';
import './screens/base.ts';
import './screens/data.ts';
import './ui/share.ts';
import './ui/feedback.ts';
import './actors/enemies.ts';
import './actors/bullets.ts';
import { boot } from './flow/update.ts';

ANALYTICS.game = 'sector-dive'; // sent with every analytics event
FEEDBACK.game = 'sector-dive'; // filled into the feedback form
setLang(save.settings.lang || defaultLang());
syncVolumes();
fsLabel();
applyLayout();
renderGuide();
showTab(baseUI.tab);
boot();
// checks and screenshot hooks (#view-…): only on the dev server, never in the built pages. The dev module sets up
// its hooks with timers, so loading it after boot() is fine
if (import.meta.env.DEV) import('./dev/dev.ts');
