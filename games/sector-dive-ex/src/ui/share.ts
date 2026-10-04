import { el, isTouch } from '@engine/core/util.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { toast } from '@engine/ui/ui.ts';
import { canCopyImage, canShareFile, copyImage, openXPost, saveFile, shareNative } from '@engine/ui/share.ts';
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
// ---- sharing a run's result: a card image + a short text with #SectorDiveEX ----
// phones get the share sheet with the image attached. PCs get a small panel instead (a desktop share sheet rarely has X):
// the card, plus copy / save / open X as separate clicks (copying and opening a tab in one click loses the clipboard)
const SHARE_FILE = 'sector-dive-ex.png';
const SHARE_URL = 'https://beatdjam.github.io/mini-games/games/sector-dive-ex/';
// card layout (px, on a CARD_W x CARD_H canvas). y values are text baselines unless noted
const CARD_W = 1200;
const CARD_H = 630;
const MARGIN_X = 64; // left / right edge of the text
const CONTENT_W = CARD_W - MARGIN_X * 2; // width between the margins
const BG_COLOR = '#05080c';
const GRID_STEP = 40; // distance between grid lines
const GRID_COLOR = 'rgba(84,232,255,0.06)'; // the cyan of CSS_COLOR.cyan, faint
const ACCENT_BAR_W = 10; // coloured bar on the left edge
const LOGO_Y = 86; // the logo and the result badge sit on slightly different baselines
const BADGE_Y = 84;
const TITLE_Y = 190; // result title ("EXTRACTED" in the language)
const WHERE_Y = 290; // sector label; the biome name follows it on the same baseline
const WHERE_BIOME_GAP = 28; // between the sector label and the biome name
const ROWS_Y = 370; // first row
const ROW_STEP = 50; // distance between rows
const ROW_RULE_DROP = 16; // the rule under a row is drawn this far below its baseline
const ROW_RULE_COLOR = 'rgba(213,228,238,0.08)'; // the CSS_COLOR.text, faint
const ROW_LABEL_W = 140; // width of the label column; the value starts after it
const FOOTER_BOTTOM = 36; // footer baseline, up from the bottom edge

interface CardFonts {
  disp: string; // headings, numbers
  jp: string; // body text, in the language's font
}
interface ShareCard {
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

const bossShort = (k: string) => BOSS_META[k]?.short ?? k;
// the bosses of a run, each kind once with a count, in the order first met ("監視体×3・圧壊機"): a deep run beats a
// dozen bosses or more, and the full list pushed the post past X's length limit
function bossSummary(bosses: string[]): string {
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

// the text that fits in max px with "…" cut in, measured with the ctx's current font
function fitText(g: CanvasRenderingContext2D, s: string, max: number) {
  if (g.measureText(s).width <= max) return s;
  let cut = s;
  while (cut && g.measureText(cut + '…').width > max) cut = cut.slice(0, -1);
  return cut + '…';
}

function drawBackground(g: CanvasRenderingContext2D) {
  g.fillStyle = BG_COLOR;
  g.fillRect(0, 0, CARD_W, CARD_H);
}

// vertical lines, then horizontal ones. The 0.5 puts a 1px line on whole pixels
function drawGridLines(g: CanvasRenderingContext2D, dir: 'vertical' | 'horizontal') {
  const length = dir === 'vertical' ? CARD_W : CARD_H;
  for (let p = 0; p <= length; p += GRID_STEP) {
    g.beginPath();
    if (dir === 'vertical') {
      g.moveTo(p + 0.5, 0);
      g.lineTo(p + 0.5, CARD_H);
    } else {
      g.moveTo(0, p + 0.5);
      g.lineTo(CARD_W, p + 0.5);
    }
    g.stroke();
  }
}

function drawGrid(g: CanvasRenderingContext2D) {
  g.strokeStyle = GRID_COLOR;
  g.lineWidth = 1;
  drawGridLines(g, 'vertical');
  drawGridLines(g, 'horizontal');
}

function drawAccentBar(g: CanvasRenderingContext2D, acc: string) {
  g.fillStyle = acc;
  g.fillRect(0, 0, ACCENT_BAR_W, CARD_H);
}

// the logo on the left, the result badge (with the reboot count) on the right. Leaves textAlign at 'left'
function drawHeader(g: CanvasRenderingContext2D, d: ShareCard, fonts: CardFonts) {
  let x = MARGIN_X;
  g.font = `700 34px ${fonts.disp}`;
  [
    ['SECTOR', CSS_COLOR.text],
    ['/', CSS_COLOR.cyan],
    ['DIVE', CSS_COLOR.text],
  ].forEach(([s, col]) => {
    g.fillStyle = col;
    g.fillText(s, x, LOGO_Y);
    x += g.measureText(s).width;
  });
  g.font = `500 20px ${fonts.disp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.textAlign = 'right';
  g.fillText(RUN_END[d.kind].badge + (d.reboots ? `  ·  REBOOT ×${d.reboots}` : ''), CARD_W - MARGIN_X, BADGE_Y);
  g.textAlign = 'left';
}

// the result title, then the sector label with the biome name after it. Needs textAlign 'left'
function drawHeadline(g: CanvasRenderingContext2D, d: ShareCard, acc: string, fonts: CardFonts) {
  g.font = `64px ${fonts.jp}`;
  g.fillStyle = acc;
  g.fillText(RUN_END[d.kind].title(), MARGIN_X, TITLE_Y);
  g.font = `700 76px ${fonts.disp}`;
  g.fillStyle = CSS_COLOR.text;
  g.fillText(d.where, MARGIN_X, WHERE_Y);
  const whereW = g.measureText(d.where).width;
  g.font = `34px ${fonts.jp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.fillText(fitText(g, d.biome, CONTENT_W - whereW - WHERE_BIOME_GAP), MARGIN_X + whereW + WHERE_BIOME_GAP, WHERE_Y);
}

// label / value rows under a rule each. Needs textAlign 'left'
function drawRows(g: CanvasRenderingContext2D, d: ShareCard, fonts: CardFonts) {
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
    const y = ROWS_Y + i * ROW_STEP;
    g.fillStyle = ROW_RULE_COLOR;
    g.fillRect(MARGIN_X, y + ROW_RULE_DROP, CONTENT_W, 1);
    g.font = `24px ${fonts.jp}`;
    g.fillStyle = CSS_COLOR.dim;
    g.fillText(k, MARGIN_X, y);
    g.fillStyle = col;
    g.fillText(fitText(g, v, CONTENT_W - ROW_LABEL_W), MARGIN_X + ROW_LABEL_W, y);
  });
}

// the hashtag on the left, the URL on the right. Needs textAlign 'left'; leaves it 'left'
function drawFooter(g: CanvasRenderingContext2D, fonts: CardFonts) {
  g.font = `22px ${fonts.jp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.fillText('#SectorDiveEX', MARGIN_X, CARD_H - FOOTER_BOTTOM);
  g.textAlign = 'right';
  g.font = `500 20px ${fonts.disp}`;
  g.fillText(SHARE_URL.replace('https://', ''), CARD_W - MARGIN_X, CARD_H - FOOTER_BOTTOM);
  g.textAlign = 'left';
}

export async function drawShareCard(d: ShareCard): Promise<Blob | null> {
  try {
    await Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('30px "DotGothic16"')]);
  } catch {
    // the fonts are only for looks: if loading fails, the card is still drawn with the fallback fonts
  }
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d')!;
  const fonts: CardFonts = {
    disp: '"Chakra Petch","DotGothic16",sans-serif',
    jp: lang === 'en' ? '"Chakra Petch",sans-serif' : '"DotGothic16","Hiragino Sans","Noto Sans JP",sans-serif',
  };
  const acc = d.kind === 'extract' ? CSS_COLOR.cyan : CSS_COLOR.mag;
  drawBackground(g);
  drawGrid(g);
  drawAccentBar(g, acc);
  drawHeader(g, d, fonts);
  drawHeadline(g, d, acc, fonts);
  drawRows(g, d, fonts);
  drawFooter(g, fonts);
  return new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
}

async function shareResult() {
  if (!shareData) return;
  const file = shareBlob && new File([shareBlob], SHARE_FILE, { type: 'image/png' });
  if (isTouch && file && canShareFile(file)) {
    track('share', { method: 'native' });
    if ((await shareNative(file, shareText(shareData))) === 'failed') openSharePanel();
    return;
  }
  openSharePanel();
}
async function openSharePanel() {
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
function copyShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'copy' });
  copyImage(shareBlob).then(ok => toast(t(ok ? 'share.copied' : 'share.copyFailed'), 3000));
}
function saveShareImage() {
  if (!shareBlob) return;
  track('share', { method: 'save' });
  saveFile(shareBlob, SHARE_FILE);
}
function openShareX() {
  if (!shareData) return;
  track('share', { method: 'x' });
  openXPost(shareText(shareData));
}
el('#btnShareCopy').addEventListener('click', copyShareImage);
el('#btnShareSave').addEventListener('click', saveShareImage);
el('#btnShareX').addEventListener('click', openShareX);
el('#btnShare').addEventListener('click', shareResult);
