import { t } from '@engine/core/i18n.ts';
import { PERKS } from '../../data/perks.ts';
import { save } from '../../core/save.ts';
import { player } from '../../actors/player.ts';
import { startRun } from '../../flow/run.ts';
import { openPerk } from '../../screens/perk.ts';
export function showPerk(hash: string) {
  setTimeout(() => {
    startRun();
    PERKS[0].apply(player, 0.2);
    if (hash.includes('perk4')) save.up.choice = 1;
    openPerk(t('perk.title'));
  }, 300); // #view-perk4: four options
}
