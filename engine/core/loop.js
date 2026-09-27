'use strict';
// engine: The main loop. The engine owns requestAnimationFrame, caps dt, runs the systems, then draws the frame
// (renderer.render(scene, camera) and the in-hand viewmodel pass).
// - addSystem({ name, order, modes, update(dt) }): order = lower runs first (default 0); modes = names of the modes it
//   runs in (omit to run in every mode). Returns the system; change .modes / .enabled on it later if needed.
// - LOOP.mode(): the game says which mode it is in (e.g. 'play', 'base', 'pause'); read once at the start of each frame.
// - stopFrame(): skip the remaining systems for this frame (e.g. after moving to the next level).
// - runSystems(dt, mode): run one step by hand (tests do this); startLoop(): begin.
const LOOP = { mode: () => null, maxDt: 0.05 };
const systems = [];
let frameStopped = false, loopLast = 0;
function addSystem(s) {
  const sys = Object.assign({ order: 0, enabled: true }, s);
  systems.push(sys); systems.sort((a, b) => a.order - b.order);
  return sys;
}
function stopFrame() { frameStopped = true; }
function runSystems(dt, mode) {
  if (mode === undefined) mode = LOOP.mode();
  frameStopped = false;
  for (const s of systems) {
    if (!s.enabled || (s.modes && !s.modes.includes(mode))) continue;
    s.update(dt);
    if (frameStopped) break;
  }
}
function loopFrame(now) {
  requestAnimationFrame(loopFrame);
  const dt = Math.min(LOOP.maxDt, (now - loopLast) / 1000); loopLast = now;
  runSystems(dt);
  renderer.render(scene, camera);
  renderGun();
}
function startLoop() { loopLast = performance.now(); requestAnimationFrame(loopFrame); }
