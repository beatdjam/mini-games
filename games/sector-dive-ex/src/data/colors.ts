// Shared colours. The first six names match the CSS variables in index.html (:root).
// COLOR is for three.js (number), CSS_COLOR is for canvas / CSS (string); both come from the same value.
// a three.js colour (number) as a canvas / CSS one (string)
export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const COLOR = {
  cyan: 0x54e8ff, // extract portal, pistol
  mag: 0xff4d8d, // enemy shots, boss / sniper eyes
  amber: 0xffc24a, // advance portal, chips, shotgun, rarity 3
  lime: 0x8cff6a, // kits, SMG
  text: 0xd5e4ee, // main text
  dim: 0x7f94a6, // sub text
  orange: 0xff8a3d, // fireballs, crusher
  fire: 0xff6a3d, // explosions, launcher
  violet: 0xc58cff, // rail, core boss
  shield: 0x8cc8ff, // shield enemy, blocked-hit sparks, bastion barrier
  yellow: 0xffe14a, // drone
  bomber: 0xffb13d, // bomber and its blast
  // the neon of the walled city: its signs, lamps, conduits and posters
  neonPink: 0xff3d8a,
  neonMint: 0x3dffb4,
  neonGold: 0xffd23d,
  neonSky: 0x4dc3ff,
};

export const CSS_COLOR = {
  cyan: css(COLOR.cyan),
  mag: css(COLOR.mag),
  amber: css(COLOR.amber),
  lime: css(COLOR.lime),
  text: css(COLOR.text),
  dim: css(COLOR.dim),
  violet: css(COLOR.violet),
  neonPink: css(COLOR.neonPink),
  neonMint: css(COLOR.neonMint),
  neonGold: css(COLOR.neonGold),
  neonSky: css(COLOR.neonSky),
};

// The painters' box: the colours more than one file paints with (the scenery's pictures, set pieces and props). Named
// by family and from dark to light (ink1 is the darkest ink), not by what they are used for: the same grey is a
// cabinet in one picture and a shadow in the next. A colour that only one file uses stays in that file
export const PAINT = {
  amber1: 0xd9a02a,
  amber2: 0xe0b83d,
  amber3: 0xffb347,
  amber4: 0xffb060,
  amber5: 0xffd24a,
  amber6: 0xffc98a,
  blue: 0x3d8de0,
  chalk: 0xb8b2a2,
  clay1: 0x7a6244,
  clay2: 0x8a6a44,
  clay3: 0x9a7b52,
  clay4: 0xb8b0a0,
  clay5: 0xc9c2a8,
  clay6: 0xc9c2b0,
  cyan: 0x4de0ff,
  glow1: 0xd8d2c0,
  glow2: 0xd9d6cc,
  glow3: 0xffd9a0,
  glow4: 0xe8e2d0,
  glow5: 0xffe2b0,
  glow6: 0xfff0d0,
  grey1: 0x4a4458,
  grey2: 0x5c6670,
  grey3: 0x6f6a5e,
  grey4: 0x6f6a60,
  grey5: 0x77736a,
  grey6: 0x7a766c,
  grey7: 0x8a8478,
  grey8: 0x8a8580,
  grey9: 0x8f8a7c,
  grey10: 0x8a8f96,
  grey11: 0x9a9890,
  ink1: 0x0c0a09,
  ink2: 0x0c0b10,
  ink3: 0x0f0d0e,
  ink4: 0x0e0d11,
  ink5: 0x17120f,
  ink6: 0x12161a,
  ink7: 0x15171a,
  ink8: 0x1c1612,
  ink9: 0x1c1a18,
  ink10: 0x1c1a20,
  ink11: 0x1b1e21,
  mint1: 0x3dffb0,
  mint2: 0x58ff9a,
  olive: 0x5a5f3e,
  pale: 0xc9a8ff,
  pink: 0xff5fa8,
  plum: 0x2e2a38,
  red1: 0xff3b4e,
  red2: 0xe0553d,
  rust1: 0x7a2f2f,
  rust2: 0x7a4a35,
  soot1: 0x26221f,
  soot2: 0x2a221c,
  soot3: 0x2a2420,
  soot4: 0x22262b,
  soot5: 0x2c2420,
  soot6: 0x2a2622,
  soot7: 0x2c2723,
  soot8: 0x2a2826,
  soot9: 0x2c3136,
  soot10: 0x3a342c,
  soot11: 0x3a352f,
  soot12: 0x3a3630,
  soot13: 0x3a3836,
  soot14: 0x3a3f44,
  soot15: 0x4a4038,
  soot16: 0x4a443c,
  soot17: 0x4b4a48,
  teal: 0x3f6a66,
  umber1: 0x3a2a22,
  umber2: 0x3a3028,
};
