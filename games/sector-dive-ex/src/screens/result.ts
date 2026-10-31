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
import { rowsHTML } from '@engine/ui/dom.ts';

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
// the facts a real run's result rows are made from
export interface RunResultFacts {
  reached: string; // stageLabel(run.stage) and the sector name joined
  kills: number;
  dead: boolean;
  got: number; // bits picked up in the dive
  kept: number; // bits brought back
  foundText: string; // the weapons brought back (or common.none)
  sold: number; // bits sold from an overflowing stash (0: no row)
  shortcut: string; // the milestone fallen back to (empty: no row)
}
// one result row: its name (for adding rows later, not shown), the i18n key of its label, when it shows, and its value
interface ResultRow {
  id: string;
  label: string | ((f: RunResultFacts) => string);
  when?: (f: RunResultFacts) => boolean;
  value: (f: RunResultFacts) => string | number;
}
const RUN_RESULT_ROWS: ResultRow[] = [
  { id: 'reached', label: 'res.reached', value: f => f.reached },
  { id: 'kills', label: 'res.kills', value: f => f.kills },
  {
    id: 'bits',
    label: 'res.bits',
    value: f => (f.dead ? t('res.bitsLost', { kept: f.kept, lost: f.got - f.kept }) : `+${f.kept}`),
  },
  {
    id: 'weapons',
    label: f => (f.dead ? 'res.lostWeapons' : 'res.keptWeapons'),
    value: f => f.foundText,
  },
  { id: 'sold', label: 'res.sold', when: f => !f.dead && f.sold > 0, value: f => `+${f.sold}` },
  { id: 'shortcut', label: 'res.shortcut', when: f => !!f.shortcut, value: f => f.shortcut },
];
export function runResultRows(f: RunResultFacts): [string, string | number][] {
  return RUN_RESULT_ROWS.filter(r => !r.when || r.when(f)).map(r => [
    t(typeof r.label === 'function' ? r.label(f) : r.label),
    r.value(f),
  ]);
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
// a real run: the rows (reached, kills, bits, weapons...) come from the facts endRun gathers, the chips are listed here
export function showRunResult(kind: RunEnd, facts: RunResultFacts) {
  el('#resEyebrow').textContent = RUN_END[kind].eyebrow;
  el('#resTitle').textContent = RUN_END[kind].title();
  el('#resList').innerHTML = rowsHTML(runResultRows(facts));
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
