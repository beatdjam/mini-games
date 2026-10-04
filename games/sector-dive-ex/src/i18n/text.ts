import type { LangData } from '../data/types.ts';
import { fillData, setI18nHook } from '@engine/core/i18n.ts';
import { AFFIX, RARITY, WEAPONS } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import { REBOOT_UP, UPGRADES } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { GUIDE_DESK, GUIDE_TOUCH, KEY_ACTIONS, LAYOUT_DEF } from '../data/controls.ts';
// Language files -> definitions: copies the names / descriptions in src/i18n/<code>.ts (data) onto src/data/.
// Called by setLang (engine/src/core/i18n.ts), so code keeps reading WEAPONS[id].name, PERKS[i].desc(v) and so on.
function i18nApplyData(d: LangData) {
  fillData(WEAPONS, d.weapons);
  fillData(RARITY, d.rarity);
  fillData(AFFIX, d.affix);
  fillData(BIOMES, d.biomes);
  fillData(BOSS_META, d.bosses);
  fillData(PERKS, d.perks);
  fillData(UPGRADES, d.upgrades);
  fillData(REBOOT_UP, d.pres);
  fillData(LAYOUT_DEF, d.layout);
  fillData(KEY_ACTIONS, d.keyActions);
  GUIDE_DESK.splice(0, GUIDE_DESK.length, ...d.guideDesk);
  GUIDE_TOUCH.splice(0, GUIDE_TOUCH.length, ...d.guideTouch);
}
setI18nHook(i18nApplyData);
