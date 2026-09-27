'use strict';
// Language files -> definitions: copies the names / descriptions in js/lang/<code>.js (data) onto js/data/.
// Called by setLang (engine/i18n.js), so code keeps reading WEAPONS[id].name, PERKS[i].desc(v) and so on.
function i18nApplyData(d) {
  fillData(WEAPONS, d.weapons); fillData(RARITY, d.rarity); fillData(AFFIX, d.affix);
  fillData(BIOMES, d.biomes); fillData(BOSS_META, d.bosses); fillData(PERKS, d.perks);
  fillData(UPGRADES, d.upgrades); fillData(PRES_UP, d.pres); fillData(LAYOUT_DEF, d.layout);
  GUIDE_DESK.splice(0, GUIDE_DESK.length, ...d.guideDesk); GUIDE_TOUCH.splice(0, GUIDE_TOUCH.length, ...d.guideTouch);
}
