import type { WeaponItem } from '../data/types.ts';
import { $, isTouch } from '../../../../engine/core/util.ts';
import { lang } from '../../../../engine/core/i18n.ts';
import { feedbackReady, openFeedback } from '../../../../engine/core/feedback.ts';
import { track } from '../../../../engine/core/analytics.ts';
import { P, run, stageLabel } from '../actors/player.ts';
import { save } from '../system/save.ts';
// ---- sending feedback: the shared form (engine/core/feedback.ts) opens with the player's situation filled in ----
// the situation is written with ids, not display names, so answers read the same whatever the language.
// From the result screen it describes the run that just ended; from the base screen, the save.

// a weapon as id+plus, rarity 0-2 and options: "shotgun+37 r2 [mag,speed]"
const wInfo = (w: WeaponItem | null | undefined) => w ? `${w.id}${w.plus ? '+' + w.plus : ''} r${w.r}${w.opts && w.opts.length ? ` [${w.opts.join(',')}]` : ''}` : '';
const common = () => [`reboots=${save.pres.count}`, `shortcut=D${save.shortcut + 1}`, `runs=${save.runs}`, `lang=${lang}`, `device=${isTouch ? 'touch' : 'desktop'}`];
// the run that just ended (called by endRun / endPractice while the run is still there)
let resultInfo = '';
export function prepFeedback(kind: string) {
  const counts: Record<string, number> = {};
  run.perks.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  const chips = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, c]) => c > 1 ? `${n}x${c}` : n).join(',');
  resultInfo = [
    run.practice ? `practice=${run.forceBoss} result=${run.cleared ? 'won' : kind}` : `result=${kind}`,
    `at=${stageLabel(run.stage)}`, `kills=${run.kills}`,
    `weapons=${P.weapons.concat(P.bag).filter(Boolean).map(wInfo).join(' / ')}`,
    `chips(${run.perks.length})=${chips}`, `bosses=${(run.bosses || []).join(',')}`,
    ...common(),
  ].join(' | ');
  $('#btnFeedbackRes').hidden = !feedbackReady();
}
// the base screen: what the save holds
export const baseInfo = () => ['from=base', `loadout=${save.loadout.map(wInfo).filter(Boolean).join(' / ')}`, `best=${stageLabel(Math.max(0, save.best - 1))}`, ...common()].join(' | ');
export function showBaseFeedback() { $('#btnFeedbackBase').hidden = !feedbackReady(); }

$('#btnFeedbackRes').addEventListener('click', () => { if (openFeedback(resultInfo)) track('feedback', { method: 'result' }); });
$('#btnFeedbackBase').addEventListener('click', () => { if (openFeedback(baseInfo())) track('feedback', { method: 'base' }); });
