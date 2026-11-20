import { expect, test } from 'vitest';
import { ALLY_KIT_IDS, ALLY_KITS, allyKitOf } from '../../src/data/allies.ts';
import { buildAllyMech } from '../../src/view/allies.ts';
import { countProtoDraws, disposeProtoMech } from '../../src/view/mechProtoModel.ts';

// SB-2082: an ally is the three views' sniper or scout on the common skeleton, with the friendly side's band and number
// (#551) on its shoulders. The mark is one material of its own, so an ally costs five draws: armour, frame, accent,
// glow and mark. A node test has no canvas: the paint is null and the material keeps the palette's colour alone.
test('an ally draws its four materials plus the friendly mark, running or wrecked', () => {
  for (const kit of ALLY_KIT_IDS) {
    for (const shape of ['run', 'wreck'] as const) {
      const mech = buildAllyMech(shape, kit);
      const stats = countProtoDraws(mech);
      console.log(`ally ${kit} ${shape}: ${stats.calls} calls, ${stats.triangles} triangles, ${stats.shapes} shapes`);
      expect(stats.calls).toBe(5);
      expect(stats.triangles).toBeGreaterThan(0);
      disposeProtoMech(mech);
    }
  }
});

test('each named ally gets one of the two types, and the two types are different machines', () => {
  expect(Object.keys(ALLY_KITS)).toHaveLength(5);
  for (const id of Object.keys(ALLY_KITS)) expect(ALLY_KIT_IDS).toContain(allyKitOf(id));
  // an ally the mission has not named still builds
  expect(ALLY_KIT_IDS).toContain(allyKitOf('a-new-ally'));

  const sniper = buildAllyMech('run', 'sniper');
  const scout = buildAllyMech('run', 'scout');
  expect(countProtoDraws(sniper).triangles).not.toBe(countProtoDraws(scout).triangles);
  disposeProtoMech(sniper);
  disposeProtoMech(scout);
});
