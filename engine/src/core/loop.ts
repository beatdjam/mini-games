import { camera, renderGun, renderer, scene } from '../render/render.ts';
// engine: The main loop. The engine owns requestAnimationFrame, caps dt, runs the systems, then draws the frame
// (renderer.render(scene, camera) and the in-hand viewmodel pass).
// - addSystem({ name, order, modes, update(dt) }): order = lower runs first (default 0); modes = names of the modes it
//   runs in (omit to run in every mode). Returns the system; change .modes / .enabled on it later if needed.
// - LOOP.mode(): the game says which mode it is in (e.g. 'play', 'base', 'pause'); read once at the start of each frame.
// - stopFrame(): skip the remaining systems for this frame (e.g. after moving to the next level).
// - runSystems(dt, mode): run one step by hand (tests do this); startLoop(): begin.
export interface LoopConfig {
  mode(): string | null;
  maxDt: number;
}
export interface SystemDef {
  name: string;
  order?: number;
  modes?: string[];
  enabled?: boolean;
  update(dt: number): void;
}
export interface System extends SystemDef {
  order: number;
  enabled: boolean;
}
export const LOOP: LoopConfig = { mode: () => null, maxDt: 0.05 };
export const systems: System[] = [];
let frameStopped = false; // set by stopFrame(): the rest of this frame's systems are skipped
let loopLast = 0; // time of the previous frame (ms)
export function addSystem(s: SystemDef): System {
  const sys: System = Object.assign({ order: 0, enabled: true }, s);
  systems.push(sys);
  systems.sort((a, b) => a.order - b.order);
  return sys;
}
export function stopFrame() {
  frameStopped = true;
}
export function runSystems(dt: number, mode?: string | null) {
  const curMode = mode === undefined ? LOOP.mode() : mode;
  frameStopped = false;
  for (const s of systems) {
    if (!s.enabled || (s.modes && (curMode == null || !s.modes.includes(curMode)))) continue;
    s.update(dt);
    if (frameStopped) break;
  }
}
export function loopFrame(now: number) {
  requestAnimationFrame(loopFrame);
  const dt = Math.min(LOOP.maxDt, (now - loopLast) / 1000);
  loopLast = now;
  runSystems(dt);
  renderer.render(scene, camera);
  renderGun();
}
export function startLoop() {
  loopLast = performance.now();
  requestAnimationFrame(loopFrame);
}
