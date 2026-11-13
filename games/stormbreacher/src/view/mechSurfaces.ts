// The paint on a mech's boxes (SB-1460): one small picture per colour name, drawn once from MECH_PAINT's seed and counts
// with the engine's strokes (grime, grain, words, stripes). The picture is light where the palette should show, so the
// armour keeps its olive and the frame its dark grey; the dirt, the stencil "07" and the warning stripes only darken it.
// Nothing here runs per frame. A node test has no canvas: mechPaintTexture then returns null and the material keeps the
// palette's colour alone (the same rule as view/surfaces.ts of SB-1360).
import * as THREE from 'three';
import { grain, grime, paintTex, smudge, stripes, words, type Paint } from '@engine/render/index.ts';
import { MECH_PAINT_COLOR } from '../data/colors.ts';
import { MECH_PAINT, MECH_PAINT_TEX, type MechColor } from '../data/mech.ts';

// node (the unit tests) has no canvas, so a picture cannot be painted there
const CAN_PAINT = typeof document !== 'undefined';

const rgb = (value: string): string => `rgb(${value})`;
const rgba = (value: string, alpha: number): string => `rgba(${value},${alpha})`;

// A plate: paint, dirt, the seams and rivets of the panels, bare metal at the scrapes, and the number stencilled in the
// lower corner. The seams run across the whole picture, so a box of any size shows them as panel lines.
const paintArmor: Paint = (g, rand) => {
  const def = MECH_PAINT.armor;
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PAINT_COLOR.baseLight);
  g.fillRect(0, 0, size, size);
  grime(g, rand, def.grime, rgb(MECH_PAINT_COLOR.grimeLight), rgb(MECH_PAINT_COLOR.grimeDark), size, size);

  g.fillStyle = rgba(MECH_PAINT_COLOR.grimeDark, 0.22);
  g.fillRect(0, size * 0.44, size, 2);
  g.fillRect(size * 0.2, 0, 2, size);
  g.fillStyle = rgba(MECH_PAINT_COLOR.scrape, 0.45);
  for (let at = 9; at < size; at += 15) {
    g.fillRect(at, size * 0.44 - 4, 2, 2);
    g.fillRect(size * 0.2 - 4, at, 2, 2);
  }

  g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.16);
  g.lineWidth = 1;
  for (let i = 0; i < def.scratches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + rand() * 16, y + (rand() - 0.5) * 3);
    g.stroke();
  }

  g.fillStyle = rgba(MECH_PAINT_COLOR.stencil, 0.42);
  words(g, MECH_PAINT_TEX.stencil, size * 0.26, size * 0.82, MECH_PAINT_TEX.stencilSize, 1);
  grain(g, rand, def.grain, size, size);
};

// The frame: worn dark metal, rust running out of the joints and bright edges where the paint has gone.
const paintFrame: Paint = (g, rand) => {
  const def = MECH_PAINT.frame;
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PAINT_COLOR.baseMid);
  g.fillRect(0, 0, size, size);
  grime(g, rand, def.grime, rgb(MECH_PAINT_COLOR.grimeLight), rgb(MECH_PAINT_COLOR.grimeDark), size, size);
  for (let i = 0; i < Math.max(3, Math.round(def.grime / 3)); i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      3 + rand() * 9,
      5 + rand() * 14,
      MECH_PAINT_COLOR.rust,
      0.1 + rand() * 0.12,
      size,
      size,
    );
  }
  g.lineWidth = 1;
  for (let i = 0; i < def.scratches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.12 + rand() * 0.16);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rand() * 20, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  grain(g, rand, def.grain, size, size);
};

// The accent: hazard stripes with a worn band along the bottom, so the small vents and the plate on the back read as
// warning markings rather than as a flat yellow block.
const paintAccent: Paint = (g, rand) => {
  const def = MECH_PAINT.accent;
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PAINT_COLOR.stripeLight);
  g.fillRect(0, 0, size, size);
  stripes(
    g,
    [0, 0, size, size],
    MECH_PAINT_TEX.stripePitch,
    rgb(MECH_PAINT_COLOR.stripeLight),
    rgb(MECH_PAINT_COLOR.stripeDark),
    rgba(MECH_PAINT_COLOR.grimeDark, 0.22),
  );
  grime(g, rand, def.grime, rgb(MECH_PAINT_COLOR.grimeLight), rgb(MECH_PAINT_COLOR.grimeDark), size, size);
  g.lineWidth = 1;
  for (let i = 0; i < def.scratches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rgba(MECH_PAINT_COLOR.scrape, 0.2 + rand() * 0.2);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + rand() * 12, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  grain(g, rand, def.grain, size, size);
};

// The sensor: dark housing around a lit window divided by a few ribs. The window is white so the palette's sensor red
// lights it, and the housing only darkens that red.
const paintSensor: Paint = (g, rand) => {
  const def = MECH_PAINT.sensor;
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PAINT_COLOR.sensorBase);
  g.fillRect(0, 0, size, size);
  const x = size * 0.1;
  const y = size * 0.4;
  const w = size * 0.8;
  const h = size * 0.2;
  g.fillStyle = rgb(MECH_PAINT_COLOR.sensorWindow);
  g.fillRect(x, y, w, h);
  g.fillStyle = rgba(MECH_PAINT_COLOR.sensorBase, 0.9);
  g.fillRect(x, y, w, 2);
  g.fillRect(x, y + h - 2, w, 2);
  for (let at = x + w * 0.14; at < x + w; at += w * 0.14) g.fillRect(at, y, 3, h);
  g.fillStyle = rgba(MECH_PAINT_COLOR.sensorWindow, 0.9);
  g.fillRect(x + 5, y + 3, w * 0.16, 2);
  grime(g, rand, def.grime, rgb(MECH_PAINT_COLOR.grimeLight), rgb(MECH_PAINT_COLOR.grimeDark), size, size);
  grain(g, rand, def.grain, size, size);
};

// The weapon: the frame's worn metal with more scrapes and a few dark grooves, since it takes the most knocks.
const paintWeapon: Paint = (g, rand) => {
  const def = MECH_PAINT.weapon;
  const size = g.canvas.width;
  g.fillStyle = rgb(MECH_PAINT_COLOR.baseMid);
  g.fillRect(0, 0, size, size);
  grime(g, rand, def.grime, rgb(MECH_PAINT_COLOR.grimeLight), rgb(MECH_PAINT_COLOR.grimeDark), size, size);
  for (let i = 0; i < Math.max(2, Math.round(def.grime / 4)); i++) {
    smudge(
      g,
      rand() * size,
      rand() * size,
      3 + rand() * 8,
      3 + rand() * 10,
      MECH_PAINT_COLOR.rust,
      0.08 + rand() * 0.1,
      size,
      size,
    );
  }
  g.lineWidth = 1;
  for (let i = 0; i < def.scratches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = rand() < 0.6 ? rgba(MECH_PAINT_COLOR.scrape, 0.2) : rgba(MECH_PAINT_COLOR.grimeDark, 0.25);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + rand() * 22, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  grain(g, rand, def.grain, size, size);
};

const PAINTERS: Record<MechColor, Paint> = {
  armor: paintArmor,
  frame: paintFrame,
  accent: paintAccent,
  sensor: paintSensor,
  weapon: paintWeapon,
};

// One picture is made per colour name and shared by every mech that wears it (the sortie's, the ally's, the views'), so
// a mech still costs one material and one draw call per colour.
const textures = new Map<MechColor, THREE.Texture>();

export function mechPaintTexture(color: MechColor): THREE.Texture | null {
  if (!CAN_PAINT) return null;
  const made = textures.get(color);
  if (made !== undefined) return made;
  const tex = paintTex(MECH_PAINT[color].seed, PAINTERS[color], MECH_PAINT_TEX.size, true);
  textures.set(color, tex);
  return tex;
}

// Drops the pictures so the dev panel's changed counts are painted again. The running game never calls it: its mech
// keeps the shared pictures (the panel lives in src/dev/ only).
export function resetMechPaint(): void {
  for (const tex of textures.values()) tex.dispose();
  textures.clear();
}
