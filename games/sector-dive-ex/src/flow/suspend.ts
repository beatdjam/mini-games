import type { Snapshot } from '../data/types.ts';
import { el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { toast } from '@engine/ui/ui.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { track } from '@engine/core/analytics.ts';
import { BIOMES } from '../data/biomes.ts';
import { PER } from '../data/progress.ts';
import { basicW, persist, save } from '../core/save.ts';
import { setSuspend } from '../core/progress.ts';
import { perkIdOf } from '../core/rules.ts';
import { player, newPlayer, run, setPlayer, setRun } from '../actors/player.ts';
import { building, packSeen } from '../world/building.ts';
import { stageInfo, stageLabel } from '../core/stages.ts';
import { onDataClick } from '../screens/rows.ts';
import { beginDive, endRun, enterDive, goBase } from './run.ts';

// ---- suspend / resume ----
// the snapshot keeps the run and the player's build; resuming regenerates the current stage from its start
const SNAP_SKIP = [
  'x',
  'z',
  'yaw',
  'pitch',
  'tile',
  'bob',
  'fy',
  'vy',
  'inv',
  'dashT',
  'sprint',
  'ddx',
  'ddz',
  'reloadT',
  'reloadMax',
  'fireCd',
  'stDelay',
];
let discardArm = false; // the discard button shows its confirmation
// Checkpoint: the run is saved every time a stage (floor or boss room) starts, and deleted when the run ends.
// If the page is killed (e.g. a phone closing a backgrounded browser) or the player suspends by hand,
// the next launch offers RESUME from the start of that stage, with the state it had when the stage began.
function makeSnapshot() {
  // the explored map goes into the checkpoint with the building's state
  if (run.bld && building) run.bld.seen = packSeen(building);
  const p: Record<string, unknown> = {};
  Object.entries(player).forEach(([k, v]) => {
    if (!SNAP_SKIP.includes(k)) p[k] = v;
  });
  return {
    run: {
      stage: run.stage,
      kills: run.kills,
      bits: run.bits,
      perks: run.perks,
      bosses: run.bosses || [],
      startTier: run.startTier,
      route: run.route,
      bld: run.bld,
    },
    P: JSON.parse(JSON.stringify(p)),
  };
}
export function checkpoint() {
  if (!run || run.practice || !player) return;
  setSuspend(makeSnapshot());
  persist();
}
export function suspendRun() {
  // the checkpoint from the start of this stage is already saved; progress since then is dropped
  releaseInputs();
  exitLock();
  discardArm = false;
  goBase();
}
function restoreSnapshot(sn: Snapshot) {
  setPlayer(Object.assign(newPlayer([basicW('pistol'), null]), sn.P));
  setRun(Object.assign({}, sn.run));
  run.perks = (run.perks || []).map(perkIdOf);
}
export function resumeRun() {
  const sn = save.suspend;
  if (!sn) return;
  enterDive();
  restoreSnapshot(sn);
  track('dive_resume', { level: stageInfo(run.stage).tier + 1 });
  setSuspend(null);
  persist();
  beginDive();
  requestLock();
  toast(t('susp.resumed'), 2000);
}
export function discardSuspended() {
  const sn = save.suspend;
  if (!sn) return;
  restoreSnapshot(sn);
  setSuspend(null);
  discardArm = false;
  endRun('abandon');
}
// the discard button asks once: arm, then go / cancel
function discardButtons(): string {
  if (!discardArm) return `<button class="mini-btn" data-susp="arm">${t('susp.discard')}</button>`;
  return (
    `<button class="buy" data-susp="discard">${t('susp.discardGo')}</button>` +
    `<button class="mini-btn" data-susp="cancel">${t('common.cancel')}</button>`
  );
}
export function renderSuspend() {
  const box = el('#suspendBox'),
    sn = save.suspend;
  box.hidden = !sn;
  el('#btnStart').hidden = !!sn;
  if (!sn) return;
  const tier = Math.floor(sn.run.stage / PER),
    b = BIOMES[sn.run.route[tier % sn.run.route.length]];
  const info = t('susp.info', {
    where: stageLabel(sn.run.stage),
    biome: b.name,
    hp: Math.ceil(sn.P.hp),
    maxHp: sn.P.maxHp,
    bits: Math.floor(sn.run.bits),
  });
  const resume = `<button class="primary" data-susp="resume">${t('susp.resume')}<small>${t('susp.resumeSub')}</small></button>`;
  box.innerHTML = `<p class="eyebrow">suspended</p>
    <div>${info}</div>
    <div class="row">${resume}
    ${discardButtons()}</div>`;
}
onDataClick(el('#suspendBox'), [
  'susp',
  a => {
    if (a === 'resume') resumeRun();
    else if (a === 'discard') discardSuspended();
    else {
      discardArm = a === 'arm';
      renderSuspend();
    }
  },
]);
