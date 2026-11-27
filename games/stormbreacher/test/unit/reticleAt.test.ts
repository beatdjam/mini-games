import { expect, test } from 'vitest';
import { placeReticle, type PlayHud } from '../../src/view/hud.ts';
import { reticleAt } from '../../src/view/hudParts.ts';

// A HUD with only the reticle's parts: the node layer has no DOM, and placeReticle reads no other part.
function reticleOf(): { hud: PlayHud; dot: { cx?: string; cy?: string }; ring: { display?: string } } {
  const dot = {
    cx: undefined as string | undefined,
    cy: undefined as string | undefined,
    setAttribute(name: string, value: string) {
      if (name === 'cx') this.cx = value;
      else if (name === 'cy') this.cy = value;
    },
  };
  const ring: { display?: string } = {};
  const hud = { reticle: { dot, ring: { style: ring }, at: reticleAt(null) } } as unknown as PlayHud;
  return { hud, dot, ring };
}

// The dot is placed as a share of the reticle's box: the cursor's normalized point (-1 to 1, + up), null at the centre.
test('reticleAt turns the cursor into percentages of the reticle box', () => {
  expect(reticleAt({ x: 1, y: 1 })).toEqual({ left: '100%', top: '0%' });
  expect(reticleAt({ x: -1, y: -1 })).toEqual({ left: '0%', top: '100%' });
  expect(reticleAt(null)).toEqual({ left: '50%', top: '50%' });
});

test('placeReticle hides the ring on a PC and keeps the dot for a rebuilt HUD', () => {
  const { hud, dot, ring } = reticleOf();
  placeReticle(hud, { x: 0.5, y: -0.5 });
  expect(dot.cx).toBe('75%');
  expect(dot.cy).toBe('75%');
  // the node project has no touch screen, so the cone's ring stays hidden
  expect(ring.display).toBe('none');
  // the last place is kept for layOut to put the dot back after a rebuild
  expect(hud.reticle.at).toEqual({ left: '75%', top: '75%' });
});
