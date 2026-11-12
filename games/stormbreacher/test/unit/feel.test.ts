import { expect, test } from 'vitest';
import { FEEL_TUNE } from '../../src/data/tune.ts';
import type { MechEvent } from '../../src/logic/mech.ts';
import { feelDamage, feelEvents, feelStep, newFeel } from '../../src/view/feel.ts';

const fire: MechEvent = { kind: 'fire', speed: 0 };

// A rapid-fire gun that stopped the mech on every hit made it stutter (2026-11-09): only a kill stops it now.
test('a plain hit does not stop the mech', () => {
  const feel = newFeel(72);
  feelEvents(feel, [fire], false, FEEL_TUNE);
  expect(feel.stopT).toBe(0);
  expect(feelStep(feel, 1 / 60, false, 72, FEEL_TUNE).stopped).toBe(false);
});

test('a kill stops the mech for hitStop', () => {
  const feel = newFeel(72);
  feelEvents(feel, [fire], true, FEEL_TUNE);
  expect(feel.stopT).toBe(FEEL_TUNE.hitStop);
  expect(feelStep(feel, 1 / 60, false, 72, FEEL_TUNE).stopped).toBe(true);
});

test('a hit on the mech shakes the camera and does not stop the mech', () => {
  const feel = newFeel(72);
  feelDamage(feel, FEEL_TUNE);
  expect(feel.shake).toBe(FEEL_TUNE.damageShake);
  expect(feel.stopT).toBe(0);
});
