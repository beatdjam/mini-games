// The viewmodel table, which needs no page: nothing here boots the game or draws, so it runs in node. The looks that
// build meshes (gun looks, wall pictures, a building's props and outside) are in ../looks.test.ts.
import { expect, test } from 'vitest';
import { VIEWMODELS } from '../../src/data/viewmodels.ts';
test('viewmodels: no two parts have a flat face in the same place (it would flicker)', () => {
  // each part as an axis-aligned box; a cylinder is round on its sides, so only its end caps (along z) count
  const bounds = (p: (string | number)[]) => {
    const n = p.map(Number);
    return p[0] === 'cyl'
      ? { cyl: true, lo: [n[4] - n[1], n[5] - n[1], n[6] - n[2] / 2], hi: [n[4] + n[1], n[5] + n[1], n[6] + n[2] / 2] }
      : {
          cyl: false,
          lo: [n[5] - n[1] / 2, n[6] - n[2] / 2, n[7] - n[3] / 2],
          hi: [n[5] + n[1] / 2, n[6] + n[2] / 2, n[7] + n[3] / 2],
        };
  };
  const clash: string[] = [];
  for (const [id, def] of Object.entries(VIEWMODELS)) {
    const bs = def.parts.map(bounds);
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        for (let ax = 0; ax < 3; ax++) {
          if ((bs[a].cyl || bs[b].cyl) && ax !== 2) continue;
          for (const side of ['lo', 'hi'] as const) {
            if (Math.abs(bs[a][side][ax] - bs[b][side][ax]) > 1e-9) continue;
            const others = [0, 1, 2].filter(k => k !== ax);
            if (others.every(k => Math.min(bs[a].hi[k], bs[b].hi[k]) - Math.max(bs[a].lo[k], bs[b].lo[k]) > 1e-9))
              clash.push(`${id} parts ${a}/${b} ${'xyz'[ax]} ${side}`);
          }
        }
  }
  expect(clash).toEqual([]);
});
