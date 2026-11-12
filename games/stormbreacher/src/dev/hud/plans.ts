// The HUD layout plans (#view-hud, SB-160): the three placements the mock compares, the sample values it draws and
// the radar's marks. No DOM and no three: build.ts turns these tables into elements. Every value here is a sample; the
// game's state is never read.
import type { RadarMarkKind } from '../../view/hudParts.ts';

// The radar's mark kinds are drawn by view/hudParts.ts, which the mock and the game share.
export type { RadarMarkKind };

// The elements every plan draws. The strip is the background of plan B's bottom panel and belongs to plan B only, so it
// stays out of this list.
export const HUD_IDS = [
  'armor',
  'boost',
  'heat',
  'main',
  'sub',
  'enemy',
  'objective',
  'radar',
  'radio',
  'warning',
] as const;

export type HudId = (typeof HUD_IDS)[number];

export const PLAN_IDS = ['a', 'b', 'c', 'd'] as const;

export type PlanId = (typeof PLAN_IDS)[number];

// The names on the plan buttons.
export const PLAN_LABELS: Record<PlanId, string> = {
  a: '四隅に散らす',
  b: '下にまとめる',
  c: '照準のまわりに寄せる',
  d: 'A＋照準に細く',
};

export interface RadarMark {
  kind: RadarMarkKind;
  angle: number; // degrees from the mech's front, + to the right
  dist: number; // 0 at the centre, 1 at the edge (radar) or the half width (compass)
}

// The sample values. None of the numbers is decided: they are all placeholders. D-13 decides only that the armour is
// the whole mech's HP (not its amount), and the boost is D-11's shared gauge, shown as a 0-1 ratio.
export const HUD_SAMPLE = {
  armor: { current: 1280, max: 1500 }, // 仮
  boost: 0.72, // 仮: D-11's shared gauge, ratio only
  heat: 0.35, // 仮
  main: { current: 197, max: 200 }, // 仮
  sub: { current: 6, max: 8 }, // 仮
  enemy: { name: 'トーチカ', health: 0.6 }, // M1's enemy; the bar is 仮
  objective: { key: 'obj.break-pillboxes', count: ' 1/2' }, // the key is t()'d in build.ts
  radio: { key: 'm1.wave2-lost', label: '無線' }, // the key is t()'d in build.ts
  warning: '被弾: 左脚', // 仮
  radar: [
    { kind: 'objective', angle: 20, dist: 0.7 },
    { kind: 'depot', angle: 70, dist: 0.8 },
    { kind: 'enemy', angle: -30, dist: 0.5 },
    { kind: 'enemy', angle: -10, dist: 0.8 },
    { kind: 'enemy', angle: 40, dist: 0.6 },
  ],
} as const;

export type HudDir = 'h' | 'row' | 'v' | 'arc';

export interface HudPlace {
  id: HudId | 'strip';
  css: string; // position and size, without position:absolute
  dir?: HudDir; // h: name and number above a bar; row: name, bar and number on one line; v: a tall bar with the text below; arc: a thin arc along the aim circle, the number outside it
  side?: 'left' | 'right'; // an `arc` element only: which side of the aim circle the arc sits on
  radar?: 'round' | 'compass';
}

// The cutscene moves the radio into the bottom bar (3 plans alike).
export const CUTSCENE_RADIO_CSS = 'left:50%;transform:translateX(-50%);bottom:24px;width:560px';

// The positions are for 1280x720. `--ring` is the aim circle's radius (px), set on the root by build.ts.
export const HUD_PLANS: Record<PlanId, readonly HudPlace[]> = {
  // near the reference: the corners hold everything and the middle stays clear
  a: [
    { id: 'armor', css: 'left:24px;bottom:64px;width:260px', dir: 'h' },
    { id: 'heat', css: 'left:24px;bottom:24px;width:260px', dir: 'row' },
    { id: 'boost', css: 'left:50%;transform:translateX(-50%);bottom:24px;width:360px', dir: 'row' },
    { id: 'main', css: 'right:24px;bottom:64px;width:260px;text-align:right', dir: 'h' },
    { id: 'sub', css: 'right:24px;bottom:24px;width:260px;text-align:right', dir: 'h' },
    { id: 'radar', css: 'right:24px;top:48px;width:150px;height:150px', radar: 'round' },
    { id: 'objective', css: 'left:24px;top:48px;width:340px' },
    { id: 'enemy', css: 'left:50%;transform:translateX(-50%);top:48px;width:300px', dir: 'h' },
    { id: 'warning', css: 'left:50%;transform:translateX(-50%);top:132px' },
    { id: 'radio', css: 'left:50%;transform:translateX(-50%);bottom:96px;width:560px' },
  ],
  // a cockpit panel: one strip along the bottom, mech state left, weapons middle, radar right
  b: [
    { id: 'strip', css: 'left:0;right:0;bottom:0;height:104px' },
    { id: 'armor', css: 'left:24px;bottom:72px;width:320px', dir: 'row' },
    { id: 'boost', css: 'left:24px;bottom:48px;width:320px', dir: 'row' },
    { id: 'heat', css: 'left:24px;bottom:24px;width:320px', dir: 'row' },
    { id: 'main', css: 'left:50%;margin-left:-220px;bottom:24px;width:200px', dir: 'h' },
    { id: 'sub', css: 'left:50%;margin-left:20px;bottom:24px;width:200px', dir: 'h' },
    { id: 'radar', css: 'right:24px;bottom:12px;width:160px;height:160px', radar: 'round' },
    { id: 'objective', css: 'left:24px;top:48px;width:340px' },
    { id: 'enemy', css: 'left:50%;transform:translateX(-50%);top:48px;width:300px', dir: 'h' },
    { id: 'warning', css: 'left:24px;bottom:120px' },
    { id: 'radio', css: 'left:50%;transform:translateX(-50%);bottom:120px;width:520px' },
  ],
  // around the aim: the corners stay clear, directions go to a compass on top
  c: [
    {
      id: 'armor',
      css: 'left:calc(50% - var(--ring) - 48px);top:calc(50% - 70px);width:56px;height:150px',
      dir: 'v',
    },
    {
      id: 'boost',
      css: 'left:calc(50% + var(--ring) + 8px);top:calc(50% - 70px);width:56px;height:150px',
      dir: 'v',
    },
    {
      id: 'heat',
      css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 14px);width:140px',
      dir: 'row',
    },
    {
      id: 'main',
      css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 38px);width:200px;text-align:center',
      dir: 'h',
    },
    {
      id: 'sub',
      css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 76px);width:200px;text-align:center',
      dir: 'h',
    },
    { id: 'enemy', css: 'left:calc(50% + 114px);top:calc(50% - 105px);width:72px', dir: 'h' },
    { id: 'radar', css: 'left:50%;transform:translateX(-50%);top:48px;width:480px;height:28px', radar: 'compass' },
    { id: 'objective', css: 'left:50%;transform:translateX(-50%);top:84px;width:420px;text-align:center' },
    { id: 'warning', css: 'left:50%;transform:translateX(-50%);top:calc(50% - var(--ring) - 70px)' },
    { id: 'radio', css: 'left:50%;transform:translateX(-50%);bottom:48px;width:560px' },
  ],
  // A's corners and round radar, with thin arcs on the aim circle for the armour and the boost (the user liked C's
  // gathering around the aim, but not its thick bars)
  d: [
    { id: 'armor', css: '', dir: 'arc', side: 'left' },
    { id: 'boost', css: '', dir: 'arc', side: 'right' },
    {
      id: 'heat',
      css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 14px);width:140px',
      dir: 'row',
    },
    {
      id: 'main',
      css: 'right:50%;margin-right:8px;top:calc(50% + var(--ring) + 36px);width:150px;text-align:right',
      dir: 'h',
    },
    { id: 'sub', css: 'left:50%;margin-left:8px;top:calc(50% + var(--ring) + 36px);width:150px', dir: 'h' },
    { id: 'radar', css: 'right:24px;top:48px;width:150px;height:150px', radar: 'round' },
    { id: 'objective', css: 'left:24px;top:48px;width:340px' },
    { id: 'enemy', css: 'left:50%;transform:translateX(-50%);top:48px;width:300px', dir: 'h' },
    { id: 'warning', css: 'left:50%;transform:translateX(-50%);top:calc(50% - var(--ring) - 70px)' },
    { id: 'radio', css: 'left:50%;transform:translateX(-50%);bottom:48px;width:560px' },
  ],
};
