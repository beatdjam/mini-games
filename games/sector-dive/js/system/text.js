import { fillData, setI18nHook } from '../../../../engine/core/i18n.js';
import { AFFIX, RARITY, WEAPONS } from '../data/weapons.js';
import { BOSS_META } from '../data/bosses.js';
import { BIOMES } from '../data/biomes.js';
import { PRES_UP, UPGRADES } from '../data/progress.js';
import { PERKS } from '../data/perks.js';
import { GUIDE_DESK, GUIDE_TOUCH, LAYOUT_DEF } from '../data/controls.js';
// Language files -> definitions: copies the names / descriptions in js/lang/<code>.js (data) onto js/data/.
// Called by setLang (engine/core/i18n.js), so code keeps reading WEAPONS[id].name, PERKS[i].desc(v) and so on.
export function i18nApplyData(d) {
  fillData(WEAPONS, d.weapons); fillData(RARITY, d.rarity); fillData(AFFIX, d.affix);
  fillData(BIOMES, d.biomes); fillData(BOSS_META, d.bosses); fillData(PERKS, d.perks);
  fillData(UPGRADES, d.upgrades); fillData(PRES_UP, d.pres); fillData(LAYOUT_DEF, d.layout);
  GUIDE_DESK.splice(0, GUIDE_DESK.length, ...d.guideDesk); GUIDE_TOUCH.splice(0, GUIDE_TOUCH.length, ...d.guideTouch);
}
setI18nHook(i18nApplyData);
