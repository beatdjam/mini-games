import { $, isTouch } from '../../../../engine/core/util.ts';
import { lang, t } from '../../../../engine/core/i18n.ts';
import { toast } from '../../../../engine/ui/ui.ts';
import { RARITY } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { perkName } from '../system/rules.ts';
import { P, run, stageInfo, stageLabel, wText } from '../actors/player.ts';
import { track } from '../../../../engine/core/analytics.ts';
import { save } from '../system/save.ts';
// ---- sharing a run's result: a card image + a short text with #SectorDive ----
// phones get the share sheet with the image attached. PCs get a small panel instead (a desktop share sheet rarely has X):
// the card, plus copy / save / open X as separate clicks (copying and opening a tab in one click loses the clipboard)
export const SHARE_URL = 'https://beatdjam.github.io/mini-games/games/sector-dive/';
export interface ShareCard {
  kind: string; where: string; biome: string; kills: number; bosses: string[];
  weapon: string; wr: number; chips: string[]; nChips: number;
  reboots: number; // reboot (prestige) count, shown next to the result label when above 0
}
export let shareData: ShareCard | null = null, shareBlob: Blob | null = null;

export const bossShort = (k: string) => BOSS_META[k]?.short ?? k;
export function prepShare(kind: string) {
  const si = stageInfo(run.stage), w = P.weapons[P.cur] || P.weapons[0];
  const counts: Record<string, number> = {};
  run.perks.forEach(n => { const k = n.replace(/\+$/, ''); counts[k] = (counts[k] || 0) + 1; });
  const chips = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => c > 1 ? t('common.count', { name: perkName(n), n: c }) : perkName(n));
  shareData = {
    kind, where: stageLabel(run.stage), biome: si.biome.name ?? '', kills: run.kills,
    bosses: (run.bosses || []).map(bossShort), weapon: w ? wText(w) : '', wr: w ? w.r : 0, chips, nChips: run.perks.length, reboots: save.pres.count,
  };
  shareBlob = null;
  drawShareCard(shareData).then(b => { if (shareData && b) shareBlob = b; }).catch(() => {});
  $('#btnShare').hidden = false; $('#sharePanel').hidden = true;
}
export function hideShare() { shareData = shareBlob = null; $('#btnShare').hidden = true; $('#sharePanel').hidden = true; }

export function shareText(d: ShareCard) {
  return t('share.text', d) + '\n' + SHARE_URL;
}

export async function drawShareCard(d: ShareCard): Promise<Blob | null> {
  try { await Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('30px "DotGothic16"')]); } catch (e) {}
  const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const disp = '"Chakra Petch","DotGothic16",sans-serif', jp = lang === 'en' ? '"Chakra Petch",sans-serif' : '"DotGothic16","Hiragino Sans","Noto Sans JP",sans-serif';
  const acc = d.kind === 'extract' ? '#54e8ff' : '#ff4d8d';
  const fit = (s: string, max: number) => { if (g.measureText(s).width <= max) return s; while (s && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(84,232,255,0.06)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.fillStyle = acc; g.fillRect(0, 0, 10, H);
  // logo
  let x = 64; g.font = `700 34px ${disp}`;
  [['SECTOR', '#d5e4ee'], ['/', '#54e8ff'], ['DIVE', '#d5e4ee']].forEach(([s, col]) => { g.fillStyle = col; g.fillText(s, x, 86); x += g.measureText(s).width; });
  g.font = `500 20px ${disp}`; g.fillStyle = '#7f94a6'; g.textAlign = 'right';
  g.fillText((d.kind === 'extract' ? 'EXTRACTED' : d.kind === 'abandon' ? 'ABANDONED' : 'SIGNAL LOST') + (d.reboots ? `  ·  REBOOT ×${d.reboots}` : ''), W - 64, 84);
  g.textAlign = 'left';
  // headline
  g.font = `64px ${jp}`; g.fillStyle = acc;
  g.fillText(t(d.kind === 'extract' ? 'res.extract' : d.kind === 'abandon' ? 'res.abandon' : 'res.dead'), 64, 190);
  g.font = `700 76px ${disp}`; g.fillStyle = '#d5e4ee'; g.fillText(d.where, 64, 290);
  const ww = g.measureText(d.where).width;
  g.font = `34px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText(fit(d.biome, W - 128 - ww - 28), 64 + ww + 28, 290);
  // rows
  const rows = [
    [t('share.kills'), t('share.killsV', { n: d.kills }), '#d5e4ee'],
    [t('share.bosses'), d.bosses.length ? d.bosses.join(t('share.join')) : t('common.none'), '#d5e4ee'],
    [t('share.weapon'), d.weapon || t('common.none'), RARITY[d.wr] ? RARITY[d.wr].css : '#d5e4ee'],
    [t('share.chips'), d.nChips ? `${d.chips.join(t('share.join'))}${d.nChips > d.chips.length ? t('share.chipsMore', { n: d.nChips }) : ''}` : t('common.none'), '#d5e4ee'],
  ];
  rows.forEach(([k, v, col], i) => {
    const y = 370 + i * 50;
    g.fillStyle = 'rgba(213,228,238,0.08)'; g.fillRect(64, y + 16, W - 128, 1);
    g.font = `24px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText(k, 64, y);
    g.fillStyle = col; g.fillText(fit(v, W - 128 - 140), 204, y);
  });
  g.font = `22px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText('#SectorDive', 64, H - 36);
  g.textAlign = 'right'; g.font = `500 20px ${disp}`; g.fillText(SHARE_URL.replace('https://', ''), W - 64, H - 36); g.textAlign = 'left';
  return new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
}

export function shareResult() {
  if (!shareData) return;
  const file = shareBlob && new File([shareBlob], 'sector-dive.png', { type: 'image/png' });
  if (isTouch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    track('share', { method: 'native' });
    navigator.share({ files: [file], text: shareText(shareData) }).catch(e => { if (e.name !== 'AbortError') openSharePanel(); });
    return;
  }
  openSharePanel();
}
export async function openSharePanel() {
  const panel = $('#sharePanel');
  if (!panel.hidden) { panel.hidden = true; return; }
  panel.hidden = false; track('share', { method: 'panel' });
  $('#btnShareCopy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
  if (!shareBlob) shareBlob = await drawShareCard(shareData!);
  if (!shareBlob) return;
  const img = $('#shareImg'); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(shareBlob);
}
export function copyShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'copy' });
  navigator.clipboard.write([new ClipboardItem({ 'image/png': shareBlob })])
    .then(() => toast(t('share.copied'), 3000), () => toast(t('share.copyFailed'), 3000));
}
export function saveShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'save' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(shareBlob); a.download = 'sector-dive.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
export function openXPost() {
  if (shareData) track('share', { method: 'x' });
  if (shareData) window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(shareData)), '_blank', 'noopener');
}
$('#btnShareCopy').addEventListener('click', copyShareImage);
$('#btnShareSave').addEventListener('click', saveShareImage);
$('#btnShareX').addEventListener('click', openXPost);
$('#btnShare').addEventListener('click', shareResult);
