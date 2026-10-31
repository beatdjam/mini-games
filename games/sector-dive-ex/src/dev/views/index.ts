import type { DevView } from './view.ts';
import { showTrailer } from './trailer.ts';
import { showBuildingPlace } from './building.ts';
import { showSector } from './sector.ts';
import { showEnemyRow, showMedic, showMortar, showTroopers } from './enemies.ts';
import { showBaseTab, showKeys, showScreen, showSuspended, showWipe } from './screens.ts';
import { showBoss } from './boss.ts';
import { showItems, showPick } from './items.ts';
import { showEBullets, showFx, showHazard, showHitDirs } from './fx.ts';
import { showShare } from './share.ts';
import { showPerk } from './perks.ts';
import { showSfx } from './sfx.ts';
import { showBot } from './bot.ts';
// every way into the game without playing it by hand: the hash it answers and what it shows
export const DEV_VIEWS: DevView[] = [
  { hash: '#trailer', match: 'starts', name: 'the trailer', run: showTrailer },
  { hash: '#bld-', match: 'starts', name: 'a place in the building', run: showBuildingPlace },
  { hash: '#view-', match: 'starts', name: 'a sector from its start', run: showSector },
  { hash: '#view-enemies-', match: 'starts', name: 'a row of enemies', run: showEnemyRow },
  { hash: '#view-medic', match: 'is', name: 'a repair drone mending a brute', run: showMedic },
  { hash: '#view-mortar', match: 'is', name: 'a mortar just after it fired', run: showMortar },
  { hash: '#view-trooper', match: 'is', name: 'three troopers', run: showTroopers },
  { hash: '#view-wipe', match: 'is', name: 'the data wipe dialog', run: showWipe },
  { hash: '#view-keys', match: 'is', name: 'the key settings', run: showKeys },
  {
    hash: '#view-keys-wait',
    match: 'is',
    name: 'the key settings, with the reload key pressed',
    run: showKeys,
  },
  { hash: '#boss-', match: 'starts', name: 'boss practice', run: showBoss },
  { hash: '#view-items', match: 'is', name: 'the things that lie on the floor', run: showItems },
  { hash: '#view-pick', match: 'starts', name: 'the pick-up prompt', run: showPick },
  { hash: '#view-ebullets', match: 'is', name: 'enemy bullets', run: showEBullets },
  { hash: '#view-fx', match: 'starts', name: 'a weapon firing, and the gates', run: showFx },
  { hash: '#view-haz', match: 'starts', name: 'a lit hazard floor', run: showHazard },
  { hash: '#view-hitdir', match: 'is', name: 'the arcs of where hits came from', run: showHitDirs },
  { hash: '#view-share', match: 'starts', name: 'the result card', run: showShare },
  { hash: '#view-perk', match: 'starts', name: 'the chip screen', run: showPerk },
  { hash: '#view-scr-', match: 'starts', name: 'the bag, pause or terminal screen', run: showScreen },
  { hash: '#sfx', match: 'is', name: 'every sound effect', run: showSfx },
  { hash: '#tab-', match: 'starts', name: 'a tab of the base', run: showBaseTab },
  { hash: '#view-susp', match: 'starts', name: 'a suspended run, back at the base', run: showSuspended },
  { hash: '#bot', match: 'starts', name: 'the bot playing a dive', run: showBot },
];
