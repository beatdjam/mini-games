import { css } from '../../../data/colors.ts';
import { WALL_ASPECT } from '../paint.ts';
// What the walled city's pictures and props share (pictures.ts: the alleys; hall.ts: the square of the temple, which is
// the boss room; props.ts and hallProps.ts: what stands in them).
// the signs and the painted words are drawn with whatever CJK face the device has (the words: src/i18n/signs.ts)
export const KWLN_FONT =
  '"PingFang HK","PingFang TC","Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","Hiragino Sans",sans-serif';

// ---- the temple square's colours ----
export const HALL_LACQUER = 0x9a2a22; // the red lacquer of a column or a door
export const HALL_LANTERN = 0xd9382c; // a paper lantern, lit
export const HALL_GOLD = 0xd9a93c; // gilding: a lintel, a cap, the tassel of a lantern
export const HALL_BRONZE = 0x6a5636; // the incense cauldron, a stick holder
export const HALL_CANDLE = 0xffb35c; // a flame, the glow of a lantern on the wall
export const HALL_ASH = 0xb9b0a2; // incense smoke, the grey of ash
export const HALL_STICK = 0x7a2a1c; // a stick of incense
export const HALL_ORANGE = 0xe08a2a; // an orange offered
export const HALL_WAX = 0xa12c23; // a red candle
export const HALL_PLATE = 0xd9d2bd; // a plate of offerings
export const HALL_FLAME = 0xffe9a8; // a candle's flame

// a column of red lacquer from the foot to `top` (picture rows), `w` wide, on a stone plinth: lit from the left, the
// lacquer worn through to the dark wood here and there, a gold band under its cap
export function column(
  g: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  w: number,
  top: number,
  foot: number,
) {
  const body = g.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, '#b84733');
  body.addColorStop(0.3, '#9a2a22');
  body.addColorStop(1, '#561310');
  g.fillStyle = 'rgba(8,6,5,.5)';
  g.fillRect(x + 3, top + 2, w, foot - top);
  g.fillStyle = body;
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(255,214,190,.2)'; // the shine down its lit side
  g.fillRect(x + w * 0.16, top, w * 0.1, foot - top);
  for (let k = 0; k < 7; k++) {
    // worn through
    g.fillStyle = 'rgba(38,16,10,.75)';
    g.fillRect(x + 2 + rand() * (w - 8), top + rand() * (foot - top - 24), 1.5 + rand() * 3, 5 + rand() * 18);
  }
  g.fillStyle = css(HALL_GOLD);
  g.fillRect(x - 1, top + 8, w + 2, 5);
  g.fillRect(x - 1, top + 17, w + 2, 2);
  g.fillStyle = '#6f695d'; // the plinth
  g.fillRect(x - 3, foot - 26, w + 6, 26);
  g.fillStyle = 'rgba(255,250,240,.14)';
  g.fillRect(x - 3, foot - 26, w + 6, 2);
}
// the letters of a neon sign read downward, as tubes: an outline in the colour, a glow round it (lit), or grey and
// cold (dead)
export function neonWord(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  color: number,
  lit: boolean,
) {
  [...text].forEach((ch, n) => {
    g.save();
    g.translate(x, y + n * px * WALL_ASPECT * 1.05);
    g.scale(1, WALL_ASPECT);
    g.font = `900 ${px}px ${KWLN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 2.4;
    g.strokeStyle = lit ? css(color) : '#5d5a52';
    g.shadowColor = lit ? css(color) : 'rgba(0,0,0,0)';
    g.shadowBlur = lit ? 9 : 0;
    g.strokeText(ch, 0, 0);
    g.restore();
  });
}
