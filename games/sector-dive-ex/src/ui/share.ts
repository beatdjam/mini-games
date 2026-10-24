import { el, isTouch } from '@engine/core/util.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { toast } from '@engine/ui/ui.ts';
import {
  canCopyImage,
  canShareFile,
  copyImage,
  drawGrid,
  fitText,
  openXPost,
  saveFile,
  shareNative,
} from '@engine/ui/share.ts';
import { RARITY } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { RUN_END, countBy, isBossKind, levelOf, parsePerk, perkName } from '../core/rules.ts';
import { player, run } from '../actors/player.ts';
import { stageInfo, stageLabel } from '../core/stages.ts';
import { weaponText } from '../actors/weapons.ts';
import { track } from '@engine/core/analytics.ts';
import { CSS_COLOR, KIT } from '../data/colors.ts';
import { hud2, weaponPath } from './hud2.ts';
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
  sten: string; // the stencil, for the logo and the labels (the field kit's card)
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
  wid: string; // the weapon's kind, for its outline on the card
  wr: number;
  chips: string[];
  nChips: number;
  level: number; // the player's level, shown next to the result label
}
export let shareData: ShareCard | null = null; // the card for the result on screen
let shareBlob: Blob | null = null; // its image, drawn on first use

const bossShort = (k: string) => (isBossKind(k) ? BOSS_META[k].short : k); // (a run saved before a boss was renamed)
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
    wid: w ? w.id : '',
    wr: w ? w.r : 0,
    chips,
    nChips: run.perks.length,
    level: levelOf(),
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

function drawBackground(g: CanvasRenderingContext2D) {
  g.fillStyle = BG_COLOR;
  g.fillRect(0, 0, CARD_W, CARD_H);
}

function drawAccentBar(g: CanvasRenderingContext2D, acc: string) {
  g.fillStyle = acc;
  g.fillRect(0, 0, ACCENT_BAR_W, CARD_H);
}

// the logo on the left, the result badge (with the level) on the right. Leaves textAlign at 'left'
function drawHeader(g: CanvasRenderingContext2D, d: ShareCard, fonts: CardFonts) {
  let x = MARGIN_X;
  g.font = `700 34px ${fonts.disp}`;
  [
    ['SECTOR', CSS_COLOR.text],
    ['/', CSS_COLOR.cyan],
    ['DIVE', CSS_COLOR.text],
    [' EX', CSS_COLOR.cyan],
  ].forEach(([s, col]) => {
    g.fillStyle = col;
    g.fillText(s, x, LOGO_Y);
    x += g.measureText(s).width;
  });
  g.font = `500 20px ${fonts.disp}`;
  g.fillStyle = CSS_COLOR.dim;
  g.textAlign = 'right';
  g.fillText(RUN_END[d.kind].badge + (d.level ? `  ·  LV ${d.level}` : ''), CARD_W - MARGIN_X, BADGE_Y);
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

// ---- the card in the field kit's look (body.hud2, 2026-10-18): a steel plate with a bolt in each corner, the logo and the
// labels in the stencil, white paint for what is read, the rows as black strips like the result screen's. Yellow marks
// a run that came back, red one that died: the edge on the left and the title. ?hud1 draws the old card above ----
const KIT_INSET = 22; // the plate's inner rule, in from the edge
const BOLT_R = 6; // the bolts in the plate's corners
const BOLT_IN = 40; // ... their centres, in from the edge
// (the dot face is drawn on a 16 px grid: at 32 and 48 px its dots stay square, between them they blur and it reads as
// another face. So the Japanese words are 32 or 48 px)
const KIT_TITLE_Y = 172;
const KIT_WHERE_Y = 258;
const KIT_ROWS_TOP = 292; // the first strip's top
const KIT_ROW_H = 52; // a strip's height
const KIT_ROW_GAP = 4; // the black between two strips
const KIT_ROW_BASE = 38; // the text's baseline, down from a strip's top
const KIT_ICON_W = 56; // the weapon's outline in its row (the 64 x 24 path, scaled)
const KIT_ICON_GAP = 14; // ... and the gap after it
const TAG_PAD = 12; // the result tag's padding left and right
const TAG_H = 34; // ... and its height

function drawPlate(g: CanvasRenderingContext2D, acc: string) {
  const bg = g.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, KIT.steel1);
  bg.addColorStop(0.55, KIT.steel2);
  bg.addColorStop(1, KIT.steel3);
  g.fillStyle = bg;
  g.fillRect(0, 0, CARD_W, CARD_H);
  g.strokeStyle = KIT.edge;
  g.lineWidth = 1;
  g.strokeRect(KIT_INSET + 0.5, KIT_INSET + 0.5, CARD_W - KIT_INSET * 2 - 1, CARD_H - KIT_INSET * 2 - 1);
  for (const [x, y] of [
    [BOLT_IN, BOLT_IN],
    [CARD_W - BOLT_IN, BOLT_IN],
    [BOLT_IN, CARD_H - BOLT_IN],
    [CARD_W - BOLT_IN, CARD_H - BOLT_IN],
  ] as const) {
    g.beginPath();
    g.arc(x, y, BOLT_R, 0, Math.PI * 2);
    g.fillStyle = KIT.steel3;
    g.fill();
    g.strokeStyle = KIT.edge;
    g.stroke();
  }
  g.fillStyle = acc;
  g.fillRect(0, 0, ACCENT_BAR_W, CARD_H);
}
// the logo in the stencil (the slash and EX in safety yellow), the result and the level in an outlined tag on the right
function drawKitHeader(g: CanvasRenderingContext2D, d: ShareCard, fonts: CardFonts) {
  let x = MARGIN_X + 12;
  g.font = `36px ${fonts.sten}`;
  [
    ['SECTOR', KIT.paint],
    ['/', KIT.safety],
    ['DIVE', KIT.paint],
    [' EX', KIT.safety],
  ].forEach(([s, col]) => {
    g.fillStyle = col!;
    g.fillText(s!, x, LOGO_Y + 4);
    x += g.measureText(s!).width;
  });
  const tag = RUN_END[d.kind].badge + (d.level ? `  ·  LV ${d.level}` : '');
  g.font = `20px ${fonts.sten}`;
  const w = g.measureText(tag).width + TAG_PAD * 2,
    right = CARD_W - MARGIN_X - 12;
  g.strokeStyle = KIT.paint2;
  g.strokeRect(right - w + 0.5, LOGO_Y - TAG_H + 8.5, w - 1, TAG_H - 1);
  g.fillStyle = KIT.paint;
  g.fillText(tag, right - w + TAG_PAD, LOGO_Y);
}
function drawKitHeadline(g: CanvasRenderingContext2D, d: ShareCard, acc: string, fonts: CardFonts) {
  const left = MARGIN_X + 12;
  g.font = `48px ${fonts.jp}`;
  g.fillStyle = acc;
  g.fillText(RUN_END[d.kind].title(), left, KIT_TITLE_Y);
  g.font = `700 72px ${fonts.disp}`;
  g.fillStyle = KIT.paint;
  g.fillText(d.where, left, KIT_WHERE_Y);
  const whereW = g.measureText(d.where).width;
  g.font = `32px ${fonts.jp}`;
  g.fillStyle = KIT.paint2;
  g.fillText(
    fitText(g, d.biome, CONTENT_W - 24 - whereW - WHERE_BIOME_GAP),
    left + whereW + WHERE_BIOME_GAP,
    KIT_WHERE_Y,
  );
}
// the rows as black strips: the label in worn paint, the value in white; the weapon with its outline in its rarity's colour
function drawKitRows(g: CanvasRenderingContext2D, d: ShareCard, fonts: CardFonts) {
  const left = MARGIN_X + 12,
    width = CONTENT_W - 24;
  // [label, value, the weapon's kind for its outline, a tail kept whole when the value is cut short (the chips' count)]
  const rows: [string, string, string | null, string][] = [
    [t('share.kills'), t('share.killsV', { n: d.kills }), null, ''],
    [t('share.bosses'), d.bosses.length ? bossSummary(d.bosses) : t('common.none'), null, ''],
    [t('share.weapon'), d.weapon || t('common.none'), d.wid || null, ''],
    [
      t('share.chips'),
      d.nChips ? d.chips.join(t('share.join')) : t('common.none'),
      null,
      d.nChips > d.chips.length ? t('share.chipsMore', { n: d.nChips }) : '',
    ],
  ];
  g.fillStyle = '#000';
  g.fillRect(left, KIT_ROWS_TOP - KIT_ROW_GAP, width, rows.length * (KIT_ROW_H + KIT_ROW_GAP) + KIT_ROW_GAP);
  rows.forEach(([k, v, wid, tail], i) => {
    const top = KIT_ROWS_TOP + i * (KIT_ROW_H + KIT_ROW_GAP),
      y = top + KIT_ROW_BASE;
    g.fillStyle = KIT.strip;
    g.fillRect(left, top, width, KIT_ROW_H);
    g.font = `32px ${fonts.jp}`;
    g.fillStyle = KIT.paint2;
    g.fillText(k, left + 16, y);
    let x = left + 16 + ROW_LABEL_W;
    if (wid) {
      const s = KIT_ICON_W / 64;
      g.save();
      g.translate(x, top + (KIT_ROW_H - 24 * s) / 2);
      g.scale(s, s);
      g.fillStyle = RARITY[d.wr] ? RARITY[d.wr].css : KIT.paint;
      g.fill(new Path2D(weaponPath(wid)));
      g.restore();
      x += KIT_ICON_W + KIT_ICON_GAP;
    }
    g.font = `32px ${fonts.jp}`;
    g.fillStyle = KIT.paint;
    const room = left + width - 16 - x - (tail ? g.measureText(tail).width : 0);
    g.fillText(fitText(g, v, room) + tail, x, y);
  });
}
function drawKitFooter(g: CanvasRenderingContext2D, fonts: CardFonts) {
  const y = CARD_H - FOOTER_BOTTOM - 14;
  g.font = `500 22px ${fonts.disp}`;
  g.fillStyle = KIT.paint2;
  g.fillText('#SectorDiveEX', MARGIN_X + 12, y);
  g.textAlign = 'right';
  g.font = `500 20px ${fonts.disp}`;
  g.fillText(SHARE_URL.replace('https://', ''), CARD_W - MARGIN_X - 12, y);
  g.textAlign = 'left';
}

export async function drawShareCard(d: ShareCard): Promise<Blob | null> {
  // (with the words the card says: a Japanese web font comes in pieces by character, and only the pieces holding the
  // given text are fetched. Without it, a character the page had not shown yet was drawn in the fallback font)
  const words = [
    RUN_END[d.kind].title(),
    d.biome,
    d.weapon,
    bossSummary(d.bosses),
    d.chips.join(t('share.join')),
    t('share.chipsMore', { n: d.nChips }),
    t('share.killsV', { n: d.kills }),
    t('share.kills'),
    t('share.bosses'),
    t('share.weapon'),
    t('share.chips'),
    t('common.none'),
  ].join('');
  try {
    await Promise.all([
      document.fonts.load('700 40px "Chakra Petch"'),
      document.fonts.load('30px "DotGothic16"', words),
      document.fonts.load('30px "Saira Stencil One"'),
    ]);
  } catch {
    // the fonts are only for looks: if loading fails, the card is still drawn with the fallback fonts
  }
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d')!;
  const fonts: CardFonts = {
    sten: '"Saira Stencil One","Chakra Petch",sans-serif',
    disp: '"Chakra Petch","DotGothic16",sans-serif',
    jp: lang === 'en' ? '"Chakra Petch",sans-serif' : '"DotGothic16","Hiragino Sans","Noto Sans JP",sans-serif',
  };
  if (hud2) {
    const acc = d.kind === 'extract' ? KIT.safety : KIT.stop;
    drawPlate(g, acc);
    drawKitHeader(g, d, fonts);
    drawKitHeadline(g, d, acc, fonts);
    drawKitRows(g, d, fonts);
    drawKitFooter(g, fonts);
    return new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  }
  const acc = d.kind === 'extract' ? CSS_COLOR.cyan : CSS_COLOR.mag;
  drawBackground(g);
  drawGrid(g, CARD_W, CARD_H, GRID_STEP, GRID_COLOR);
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
