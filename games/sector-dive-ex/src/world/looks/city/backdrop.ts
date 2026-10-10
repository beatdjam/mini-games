import type * as THREE from 'three';
import { createRng } from '@engine/core/util.ts';
import { BACKDROP_H, BACKDROP_W, BACKDROP_EYE, canvasTex } from '../paint.ts';
// What the old downtown's windows look out on (Look.outside): the city at dusk all round, painted on a band that is
// wrapped round the player (world/level.ts). The sun is low in the west (the -x side, a quarter of the band before
// its end: facesWest in common.ts), the sky glowing amber round it and going grey toward the east. Two rows of
// buildings against it, the far one in the haze, the near one with a few lit windows; below the line of the roofs,
// the streets in the dusk with their lamps.
// ---- tuning numbers used only here ----
const SUN_U = 0.75; // where the sun is along the band (the band starts at +z and goes round through +x: 0.75 is -x)
const HORIZON = BACKDROP_EYE + 6; // the row of the far ground, a little under the eye (px)
const SEED = 1900;

export function cityBackdrop(): THREE.CanvasTexture {
  return canvasTex(BACKDROP_W, BACKDROP_H, g => {
    const rand = createRng(SEED).next,
      sunX = BACKDROP_W * SUN_U;
    // the sky: grey high up, dusk toward the roofs
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, '#1f2230');
    sky.addColorStop(0.55, '#45444f');
    sky.addColorStop(1, '#7c6e6c');
    g.fillStyle = sky;
    g.fillRect(0, 0, BACKDROP_W, HORIZON);
    // the glow round the sun, wide along the horizon (twice, so it runs on over the band's ends where it is near)
    for (const x of [sunX, sunX - BACKDROP_W, sunX + BACKDROP_W]) {
      g.save();
      g.translate(x, HORIZON);
      g.scale(3.2, 1);
      const glow = g.createRadialGradient(0, 0, 4, 0, 0, 230);
      glow.addColorStop(0, 'rgba(255,186,104,.95)');
      glow.addColorStop(0.35, 'rgba(236,150,82,.55)');
      glow.addColorStop(1, 'rgba(200,120,70,0)');
      g.fillStyle = glow;
      g.fillRect(-230, -230, 460, 460);
      g.restore();
    }
    // the sun, half down behind the far roofs
    const sun = g.createRadialGradient(sunX, HORIZON - 22, 2, sunX, HORIZON - 22, 40);
    sun.addColorStop(0, 'rgba(255,240,206,1)');
    sun.addColorStop(0.4, 'rgba(255,214,150,.9)');
    sun.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = sun;
    g.fillRect(sunX - 40, HORIZON - 62, 80, 80);
    // the streets under the roofs: dusk, darker further down
    const ground = g.createLinearGradient(0, HORIZON, 0, BACKDROP_H);
    ground.addColorStop(0, '#3a302b');
    ground.addColorStop(1, '#1d1712');
    g.fillStyle = ground;
    g.fillRect(0, HORIZON, BACKDROP_W, BACKDROP_H - HORIZON);
    for (let n = 0; n < 420; n++) {
      g.fillStyle = `rgba(240,196,120,${0.25 + rand() * 0.45})`;
      g.fillRect(rand() * BACKDROP_W, HORIZON + 8 + rand() * 170, 2, 2);
    }
    // two rows of buildings: the far one pale in the haze, the near one dark with a few lit windows. Toward the sun
    // their colour is warmer (the haze lit by it)
    const warmth = (x: number) => Math.max(0, Math.cos(((x - sunX) / BACKDROP_W) * Math.PI * 2));
    const row = (top: [number, number], wide: [number, number], cold: number[], warm: number[], lit: number) => {
      for (let x = 0; x < BACKDROP_W;) {
        const w = wide[0] + rand() * (wide[1] - wide[0]),
          y = top[0] + rand() * (top[1] - top[0]),
          t = warmth(x) * 0.6;
        g.fillStyle = `rgb(${cold.map((c, n) => Math.round(c + (warm[n]! - c) * t)).join(',')})`;
        g.fillRect(x, y, w, HORIZON + 30 - y);
        if (rand() < 0.25) g.fillRect(x + w * 0.3, y - 10, 2, 10); // an aerial
        for (let wy = y + 6; wy < HORIZON + 24; wy += 9)
          for (let wx = x + 4; wx < x + w - 4; wx += 7)
            if (rand() < lit) {
              g.fillStyle = `rgba(236,196,122,${0.45 + rand() * 0.4})`;
              g.fillRect(wx, wy, 3, 4);
              g.fillStyle = `rgb(${cold.map((c, n) => Math.round(c + (warm[n]! - c) * t)).join(',')})`;
            }
        x += w + rand() * 4;
      }
    };
    row([HORIZON - 60, HORIZON - 14], [16, 50], [96, 88, 92], [150, 112, 92], 0.03);
    row([HORIZON - 78, HORIZON - 8], [22, 64], [52, 46, 48], [78, 58, 48], 0.12);
  });
}
