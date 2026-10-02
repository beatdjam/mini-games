// Shared colours. The first six names match the CSS variables in index.html (:root).
// COLOR is for three.js (number), CSS_COLOR is for canvas / CSS (string); both come from the same value.
const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

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
};

export const CSS_COLOR = {
  cyan: css(COLOR.cyan),
  mag: css(COLOR.mag),
  amber: css(COLOR.amber),
  lime: css(COLOR.lime),
  text: css(COLOR.text),
  dim: css(COLOR.dim),
};
