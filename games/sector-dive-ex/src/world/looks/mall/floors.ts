import { TEX, grain, grime, oval, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
// The floors of the mall's shop rooms (Look.roomFloors), one set for each kind of shop (the order of MALL_SHOP_NAMES):
// the plain floor and one with a mark of wear on it. Like the concourse's, they run on across the edge of the
// picture (the joints are half a tile in from it and the stains are drawn again on every side), so the tiles of the
// floor do not show.
// ---- tuning numbers used only here ----
const PLANK_ROWS = 8; // rows of planks across a picture: a plank is half a metre wide
const FLOOR_TILE_N = 4; // tiles across a picture: a metre
interface Style {
  how: 'planks' | 'carpet' | 'vinyl' | 'tiles';
  base: string;
  alt: string; // the second shade: another row of planks, the speckle in the carpet, the joints
}
const STYLES: Style[] = [
  { how: 'planks', base: '#a58a63', alt: '#98805a' }, // clothes: light wood
  { how: 'planks', base: '#6b4a2e', alt: '#5e4029' }, // cafe: wooden boards
  { how: 'carpet', base: '#3b3d4e', alt: '#555a70' }, // books: a dark carpet
  { how: 'carpet', base: '#7b7d80', alt: '#989a9e' }, // glasses: grey carpet
  { how: 'vinyl', base: '#6a6b6e', alt: '#4e4f52' }, // electronics: a grey floor
  { how: 'tiles', base: '#b4b2a6', alt: '#8c8a7e' }, // drugstore: white tiles
  { how: 'tiles', base: '#a0784a', alt: '#6e4e2c' }, // food court: warm stone
];
// the floor of a kind of shop: variant 0 plain, 1 with a mark of wear
const roomFloor =
  (kind: number, variant: number): Paint =>
  (g, rand) => {
    const st = STYLES[kind]!;
    g.fillStyle = st.base;
    g.fillRect(0, 0, TEX, TEX);
    if (st.how === 'planks') {
      const s = TEX / PLANK_ROWS;
      for (let r = 0; r < PLANK_ROWS; r++) {
        g.fillStyle = r % 2 ? st.alt : st.base;
        g.fillRect(0, r * s, TEX, s);
        g.fillStyle = 'rgba(14,10,6,.4)';
        g.fillRect(0, r * s, TEX, 1);
        for (const cut of [(r * 83 + 40) % TEX, (r * 83 + 168) % TEX]) g.fillRect(cut, r * s, 1, s);
        g.fillStyle = 'rgba(255,240,210,.07)';
        g.fillRect(0, r * s + 1, TEX, 1.5);
      }
      for (let k = 0; k < 40; k++) {
        g.fillStyle = 'rgba(30,20,10,.16)';
        g.fillRect(rand() * TEX, rand() * TEX, 12 + rand() * 30, 0.8);
      }
    } else if (st.how === 'carpet' || st.how === 'vinyl') {
      for (let k = 0; k < 900; k++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(10,10,14,.2)' : st.alt + '55';
        g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
      }
      if (st.how === 'vinyl') {
        g.fillStyle = 'rgba(10,10,14,.22)';
        for (let n = 0; n < FLOOR_TILE_N; n++) {
          const p = (n + 0.5) * (TEX / FLOOR_TILE_N);
          g.fillRect(p - 0.5, 0, 1, TEX);
          g.fillRect(0, p - 0.5, TEX, 1);
        }
      }
    } else {
      const s = TEX / FLOOR_TILE_N,
        shade = Array.from({ length: FLOOR_TILE_N * FLOOR_TILE_N }, () => rand());
      for (let a = 0; a <= FLOOR_TILE_N; a++)
        for (let b = 0; b <= FLOOR_TILE_N; b++) {
          const t = shade[(b % FLOOR_TILE_N) * FLOOR_TILE_N + (a % FLOOR_TILE_N)]!;
          g.fillStyle = t < 0.5 ? `rgba(255,248,226,${t * 0.12})` : `rgba(24,20,14,${(t - 0.5) * 0.14})`;
          g.fillRect((a - 0.5) * s, (b - 0.5) * s, s, s);
        }
      g.fillStyle = st.alt + '66';
      for (let n = 0; n < FLOOR_TILE_N; n++) {
        const p = (n + 0.5) * s;
        g.fillRect(p - 0.6, 0, 1.2, TEX);
        g.fillRect(0, p - 0.6, TEX, 1.2);
      }
    }
    for (let k = 0; k < 24; k++)
      smudge(g, rand() * TEX, rand() * TEX, 16 + rand() * 46, 12 + rand() * 30, '30,26,20', 0.04 + rand() * 0.08);
    // (below, clear of the picture's edge) a mark of wear: a pale path worn through the middle, or a stain
    if (variant === 1) {
      smudge(g, TEX / 2, TEX / 2, 46, 26, st.how === 'tiles' ? '60,40,20' : '200,190,170', 0.22);
      g.fillStyle = 'rgba(20,14,8,.28)';
      oval(g, TEX * 0.62, TEX * 0.4, 9, 6);
    }
    grime(g, rand, 24, '#9a9078', '#2a2418');
    grain(g, rand, 12);
  };
// the pictures, kind by kind: [plain, worn] for each
export const ROOM_FLOOR_PICS: Paint[] = STYLES.flatMap((_, kind) => [roomFloor(kind, 0), roomFloor(kind, 1)]);
