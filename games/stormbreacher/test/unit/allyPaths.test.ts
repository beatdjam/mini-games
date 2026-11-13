// The ways the allied mechs run must stay out of the props and the pillboxes: an ally has no hit box, so a way laid
// through a hedgehog, a block or a pillbox shows it walking through a wall. The line holes are opened from the way's
// crossing before the boxes are read, so a way through a blast point's hole is tested as the game draws it after the
// blast. Ramps and stairs are left out: the allies walk on them, and their boxes reach up from the ground. The seawall
// is left out too: the boss ways climb its ramp and cross it on top (the ground height, not the flat box, carries them).
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { GroundSpot, PropKind } from '../../src/data/types.ts';
import { openBreach } from '../../src/logic/blasts.ts';
import { newGame } from '../../src/logic/game.ts';

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const WALKABLE: readonly PropKind[] = ['ramp', 'stairs', 'seawall'];
const BLASTS = M1B_HAND.blasts ?? [];
const LINE_ZS = [...new Set(BLASTS.flatMap(place => (place.line === null ? [] : [place.line])))];

// The blast points whose holes a way crosses. The way runs at the x where it meets a line's z, and the point on that
// line nearest that x is the one that opens the ground under it. A line with no crossing opens nothing.
function holesOf(way: readonly GroundSpot[]): string[] {
  const ids: string[] = [];
  for (const lineZ of LINE_ZS) {
    const points = BLASTS.filter(place => place.line === lineZ);
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1];
      const b = way[i];
      if (a.z === b.z) continue;
      if ((a.z - lineZ) * (b.z - lineZ) > 0) continue;
      const x = a.x + ((lineZ - a.z) / (b.z - a.z)) * (b.x - a.x);
      let nearest = points[0];
      for (const point of points) if (Math.abs(point.x - x) < Math.abs(nearest.x - x)) nearest = point;
      ids.push(nearest.id);
      break;
    }
  }
  return ids;
}

// Whether the flat segment a-b meets the box. Liang-Barsky, with a touch of the edge counted as a meeting.
function meets(a: GroundSpot, b: GroundSpot, box: Box): boolean {
  let enter = 0;
  let leave = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const p = [-dx, dx, -dz, dz];
  const q = [a.x - box.minX, box.maxX - a.x, a.z - box.minZ, box.maxZ - a.z];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

test('no ally’s way runs through a prop or a pillbox', () => {
  for (const [name, way] of Object.entries(M1.paths)) {
    const game = newGame(openBreach(M1B_HAND, holesOf(way)), M1);
    const boxes: { box: Box; what: string }[] = [];
    for (let i = 0; i < game.propBoxes.length; i++) {
      const prop = game.map.props[game.propRefs[i]];
      if (WALKABLE.includes(prop.kind)) continue;
      boxes.push({ box: game.propBoxes[i], what: `${prop.kind} at (${prop.x}, ${prop.z})` });
    }
    for (const target of game.targets) boxes.push({ box: target.box, what: target.id });
    for (let i = 1; i < way.length; i++) {
      for (const { box, what } of boxes) {
        expect(meets(way[i - 1], way[i], box), `${name} runs through the ${what}`).toBe(false);
      }
    }
  }
});
