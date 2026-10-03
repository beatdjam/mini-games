import { el, isTouch } from '@engine/core/util.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { toast } from '@engine/ui/ui.ts';
import { canCopyImage, canShareFile, copyImage, openXPost, saveImage, shareNative } from '@engine/ui/share.ts';
import { RARITY } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { RUN_END, countBy, parsePerk, perkName } from '../core/rules.ts';
import { player, run } from '../actors/player.ts';
import { stageInfo, stageLabel } from '../core/stages.ts';
import { weaponText } from '../actors/weapons.ts';
import { track } from '@engine/core/analytics.ts';
import { save } from '../core/save.ts';
import { CSS_COLOR } from '../data/colors.ts';
import type { RunEnd } from '../data/types.ts';
// ---- sharing a run's result: a card image + a short text with #SectorDive ----
// phones get the share sheet with the image attached. PCs get a small panel instead (a desktop share sheet rarely has X):
// the card, plus copy / save / open X as separate clicks (copying and opening a tab in one click loses the clipboard)
const SHARE_FILE = 'sector-dive.png';
export const SHARE_URL = 'https://beatdjam.github.io/mini-games/games/sector-dive/';
export interface ShareCard {
  kind: RunEnd;
  where: string;
  biome: string;
  kills: number;
  bosses: string[];
  weapon: string;
  wr: number;
  chips: string[];
  nChips: number;
  reboots: number; // reboot (prestige) count, shown next to the result label when above 0
}
export let shareData: ShareCard | null = null; // the card for the result on screen
let shareBlob: Blob | null = null; // its image, drawn on first use

export const bossShort = (k: string) => BOSS_META[k]?.short ?? k;
// the bosses of a run, each kind once with a count, in the order first met ("監視体×3・圧壊機"): a deep run beats a
// dozen bosses or more, and the full list pushed the post past X's length limit
export function bossSummary(bosses: string[]): string {
  return [...countBy(bosses, b => b)]
    .map(([name, c]) => (c > 1 ? t('common.count', { name, n: c }) : name))
    .join(t('share.join'));
}
export function prepShare(kind: RunEnd) {
  const si = stageInfo(run.stage),
    w = player.weapons[player.cur] || player.weapons[0];
  const chips = [...countBy(run.perks, rec => parsePerk(rec).id)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n, c]) => (c > 1 ? t('common.count', { name: perkName(n), n: c }) : perkName(n)));
  shareData = {
    kind,
    where: stageLabel(run.stage),
    biome: si.biome.name ?? '',
    kills: run.kills,
    bosses: (run.bosses || []).map(bossShort),
    weapon: w ? weaponText(w) : '',
    wr: w ? w.r : 0,
    chips,
    nChips: run.perks.length,
    reboots: save.pres.count,
  };
  shareBlob = null;
  drawShareCard(shareData)
    .then(b => {
      if (shareData && b) shareBlob = b;
    })
    .catch(() => {});
  el('#btnShare').hidden = false;
  el('#sharePanel').hidden = true;
}
export function hideShare() {
  shareData = null;
  shareBlob = null;
  el('#btnShare').hidden = true;
  el('#sharePanel').hidden = true;
}

export function shareText(d: ShareCard) {
  return t('share.text', { ...d, bosses: bossSummary(d.bosses), nBoss: d.bosses.length }) + '\n' + SHARE_URL;
}

export async function drawShareCard(d: ShareCard): Promise<Blob | null> {
  try {
    await Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('30px "DotGothic16"')]);
  } catch (e) {}
  const W = 1200,
    H = 630,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const disp = '"Chakra Petch","DotGothic16",sans-serif',
    jp = lang === 'en' ? '"Chakra Petch",sans-serif' : '"DotGothic16","Hiragino Sans","Noto Sans JP",sans-serif';
  const acc = d.kind === 'extract' ? CSS_COLOR.cyan : CSS_COLOR.mag;
  const fit = (s: string, max: number) => {
    if (g.measureText(s).width <= max) return s;
    let cut = s;
    while (cut && g.measureText(cut + '…').width > max) cut = cut.slice(0, -1);
    return cut + '…';
  };
  g.fillStyle = '#05080c';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(84,232,255,0.06)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
    g.stroke();
  }
  g.fillStyle = acc;
  g.fillRect(0, 0, 10, H);
  // logo
  let x = 64;
  g.font = `700 34px ${disp}`;
  [
    ['SECTOR', CSS_COLOR.text],
    ['/', CSS_COLOR.cyan],
    ['DIVE', CSS_COLOR.text],
  ].forEach(([s, col]) => {
    g.fillStyle = col;
    g.fillText(s, x, 86);
    x += g.measureText(s).width;
  });
  g.font = `500 20px ${disp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.textAlign = 'right';
  g.fillText(RUN_END[d.kind].badge + (d.reboots ? `  ·  REBOOT ×${d.reboots}` : ''), W - 64, 84);
  g.textAlign = 'left';
  // headline
  g.font = `64px ${jp}`;
  g.fillStyle = acc;
  g.fillText(RUN_END[d.kind].title(), 64, 190);
  g.font = `700 76px ${disp}`;
  g.fillStyle = CSS_COLOR.text;
  g.fillText(d.where, 64, 290);
  const ww = g.measureText(d.where).width;
  g.font = `34px ${jp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.fillText(fit(d.biome, W - 128 - ww - 28), 64 + ww + 28, 290);
  // rows
  const rows = [
    [t('share.kills'), t('share.killsV', { n: d.kills }), CSS_COLOR.text],
    [t('share.bosses'), d.bosses.length ? bossSummary(d.bosses) : t('common.none'), CSS_COLOR.text],
    [t('share.weapon'), d.weapon || t('common.none'), RARITY[d.wr] ? RARITY[d.wr].css : CSS_COLOR.text],
    [
      t('share.chips'),
      d.nChips
        ? `${d.chips.join(t('share.join'))}${d.nChips > d.chips.length ? t('share.chipsMore', { n: d.nChips }) : ''}`
        : t('common.none'),
      CSS_COLOR.text,
    ],
  ];
  rows.forEach(([k, v, col], i) => {
    const y = 370 + i * 50;
    g.fillStyle = 'rgba(213,228,238,0.08)';
    g.fillRect(64, y + 16, W - 128, 1);
    g.font = `24px ${jp}`;
    g.fillStyle = CSS_COLOR.dim;
    g.fillText(k, 64, y);
    g.fillStyle = col;
    g.fillText(fit(v, W - 128 - 140), 204, y);
  });
  g.font = `22px ${jp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.fillText('#SectorDive', 64, H - 36);
  g.textAlign = 'right';
  g.font = `500 20px ${disp}`;
  g.fillText(SHARE_URL.replace('https://', ''), W - 64, H - 36);
  g.textAlign = 'left';
  return new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
}

export async function shareResult() {
  if (!shareData) return;
  const file = shareBlob && new File([shareBlob], SHARE_FILE, { type: 'image/png' });
  if (isTouch && file && canShareFile(file)) {
    track('share', { method: 'native' });
    if ((await shareNative(file, shareText(shareData))) === 'failed') openSharePanel();
    return;
  }
  openSharePanel();
}
export async function openSharePanel() {
  const panel = el('#sharePanel');
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  track('share', { method: 'panel' });
  el('#btnShareCopy').hidden = !canCopyImage();
  if (!shareBlob) shareBlob = await drawShareCard(shareData!);
  if (!shareBlob) return;
  const img = el<HTMLImageElement>('#shareImg');
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(shareBlob);
}
export function copyShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'copy' });
  copyImage(shareBlob).then(ok => toast(t(ok ? 'share.copied' : 'share.copyFailed'), 3000));
}
export function saveShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'save' });
  saveImage(shareBlob, SHARE_FILE);
}
export function openShareX() {
  if (!shareData) return;
  track('share', { method: 'x' });
  openXPost(shareText(shareData));
}
el('#btnShareCopy').addEventListener('click', copyShareImage);
el('#btnShareSave').addEventListener('click', saveShareImage);
el('#btnShareX').addEventListener('click', openShareX);
el('#btnShare').addEventListener('click', shareResult);
