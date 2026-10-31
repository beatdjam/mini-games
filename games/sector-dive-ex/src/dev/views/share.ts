import { el, shuffle } from '@engine/core/util.ts';
import type { RunEnd, Weapon } from '../../data/types.ts';
import { PER } from '../../data/progress.ts';
import { player, run } from '../../actors/player.ts';
import { endRun, startRun } from '../../flow/run.ts';
import { drawShareCard, shareData, shareText } from '../../ui/share.ts';
// dev view: #view-share[-dead] shows the result card image for a sample run (#view-share-res: the result screen, #view-share-res-panel: with the PC share panel open,
// #view-share-res-many: a deep run's hundred chips)
export function showShare(hash: string) {
  setTimeout(() => {
    startRun();
    run.stage = 2 * PER + PER - 1;
    run.kills = 142;
    run.bosses = ['watcher', 'trinity'];
    run.perks = ['overload', 'overload', 'rapid+', 'crit', 'reload', 'light'];
    // -many: a deep run's hundred chips (the mix from a player's D14 run), to see the result screen fold them up
    if (hash.includes('many'))
      run.perks = shuffle(
        Object.entries({
          split: 25,
          rapid: 18,
          overload: 13,
          'overload+': 3,
          armor: 10,
          'armor+': 3,
          mag: 4,
          leech: 4,
          'leech+': 3,
          sprint: 4,
          'sprint+': 1,
          reload: 3,
          'crit+': 2,
          chain: 1,
          pierce: 1,
          'light+': 1,
          repair: 1,
          'rapid+': 1,
        }).flatMap(([id, n]) => Array(n).fill(id)),
      );
    player.weapons[0] = { id: 'rail', r: 2, plus: 7, opts: [] } as unknown as Weapon;
    const kind: RunEnd = hash.includes('dead') ? 'dead' : 'extract';
    endRun(kind);
    if (hash.includes('res')) {
      if (hash.includes('panel')) setTimeout(() => el('#btnShare').click(), 900);
      return;
    } // #view-share-res: the result screen itself
    drawShareCard(shareData!).then(b => {
      const im = new Image();
      im.src = URL.createObjectURL(b!);
      im.style.cssText = 'position:fixed;inset:0;width:100%;z-index:99;background:#000';
      document.body.appendChild(im);
      console.log('VIEW share', shareText(shareData!));
    });
  }, 300);
}
