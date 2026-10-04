import type { RunEnd } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { BOSS_META } from '../data/bosses.ts';
import { RUN_END, chipSummary, perkName } from '../core/rules.ts';
import { run } from '../actors/player.ts';
import { stageInfo } from '../core/stages.ts';
import { hideShare, prepShare } from '../ui/share.ts';
import { prepFeedback } from '../ui/feedback.ts';
import { setPlayUI, show } from '../flow/state.ts';
import { rowsHTML } from './rows.ts';

// the result screen comes up at once, or after the death moment
const DEAD_DELAY = 700; // ms
function open(kind: RunEnd) {
  setTimeout(
    () => {
      setPlayUI(false);
      show('#scrResult');
    },
    kind === 'dead' ? DEAD_DELAY : 0,
  );
}
// a practice fight: the boss, the strength, how it ended, the time
export function showPracticeResult(kind: RunEnd, sec: number) {
  el('#resEyebrow').textContent = 'practice';
  el('#resTitle').textContent = t(run.cleared ? 'res.practiceWon' : 'res.practiceDone');
  el('#resList').innerHTML = rowsHTML([
    [t('res.boss'), BOSS_META[run.forceBoss!]!.name],
    [t('res.strength'), t('res.strengthV', { n: stageInfo(run.stage).tier + 1 })],
    [t('res.result'), t(run.cleared ? 'res.won' : kind === 'dead' ? 'res.died' : 'res.quit')],
    [t('res.time'), t('res.timeV', { m: Math.floor(sec / 60), s: sec % 60 })],
  ]);
  el('#resChips').textContent = t('res.practiceNote');
  el('#resOrder').hidden = true;
  hideShare();
  prepFeedback(kind);
  open(kind);
}
// a real run: the rows (reached, kills, bits, weapons...) come from endRun, the chips are listed here
export function showRunResult(kind: RunEnd, rows: [string, string | number][]) {
  el('#resEyebrow').textContent = RUN_END[kind].eyebrow;
  el('#resTitle').textContent = RUN_END[kind].title();
  el('#resList').innerHTML = rowsHTML(rows);
  el('#resChips').textContent = run.perks.length
    ? t('res.chips', { n: run.perks.length, list: chipSummary(run.perks) })
    : '';
  // the order they were taken, folded away (a deep run has around a hundred)
  el('#resOrderList').textContent = run.perks.map(perkName).join(t('common.sep'));
  el('#resOrder').hidden = !run.perks.length;
  el<HTMLDetailsElement>('#resOrder').open = false;
  prepShare(kind);
  prepFeedback(kind);
  open(kind);
}
