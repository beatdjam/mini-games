// Moves the game on by hand in the e2e tests. Waiting for the page's own drawn frames timed out at 60 s on CI, where
// there is no GPU and a frame is drawn in software and can take seconds. So time is advanced by running the game's
// systems directly; a drawn frame is awaited only by the tests that check the page's own rAF loop.
import { LOOP, runSystems } from '@engine/core/index.ts';

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// Runs the game's systems n times, a 60th of a second each.
export function steps(n: number): void {
  for (let i = 0; i < n; i++) runSystems(1 / 60);
}

// Runs the systems by hand until `done` holds, and fails when it never does. A drawn frame could be up to a 20th of a
// second, so 720 steps are the 12 s of the game that 240 frames were. A drawn frame every 30 steps lets the page's own
// timers move on, and the page's updates that wait for a drawn frame still come.
export async function untilSteps(done: () => boolean, tries = 720): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    runSystems(1 / 60);
    if (i % 30 === 29) await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} steps`);
}

// Draws the scene once by hand.
export const draw = (): void => LOOP.render?.();
