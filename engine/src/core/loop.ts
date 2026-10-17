import { camera, renderGun, renderer, scene } from '../render/render.ts';
// engine: The main loop. The engine owns requestAnimationFrame, caps dt, runs the systems, then draws the frame
// (renderer.render(scene, camera) and the in-hand viewmodel pass).
// - addSystem({ name, order, modes, update(dt) }): order = lower runs first (default 0); modes = names of the modes it
//   runs in (omit to run in every mode). Returns the system; change .modes / .enabled on it later if needed.
// - LOOP.mode(): the game says which mode it is in (e.g. 'play', 'base', 'pause'); read once at the start of each frame.
// - stopFrame(): skip the remaining systems for this frame (e.g. after moving to the next level).
// - runSystems(dt, mode): run one step by hand (tests do this); startLoop(): begin.
// - LOOP.maxFps: at most this many frames a second (0: as many as the screen shows). A screen faster than that skips
//   its frames in between, so the frames are as many, and feel the same, in a heavy place and a light one.
// - framesDrawn(): the frames drawn so far (what a frame counter counts: core/dev.ts showFps).
export interface LoopConfig {
  mode(): string | null;
  maxDt: number;
  maxFps: number;
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
export const LOOP: LoopConfig = { mode: () => null, maxDt: 0.05, maxFps: 0 };
// a frame of the screen this near its turn (ms) is drawn: the screen's frames do not come exactly on time
const FRAME_SLACK = 1;
export const systems: System[] = [];
let frameStopped = false; // set by stopFrame(): the rest of this frame's systems are skipped
let loopLast = 0; // time of the previous frame (ms)
let loopDue = 0; // when the next frame is due, with LOOP.maxFps (ms)
let drawn = 0;
export const framesDrawn = (): number => drawn;
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
// is a frame of the screen at `now` (ms) one to draw, with LOOP.maxFps (and if so, when the next is due). The next is
// due a frame's time after this one was due, so the frames average out to maxFps on a screen whose own rate is not a
// multiple of it; when more than a frame late (the first frame, after a stall), a frame's time from now
export function frameDue(now: number): boolean {
  if (LOOP.maxFps <= 0) return true;
  if (now < loopDue - FRAME_SLACK) return false;
  const step = 1000 / LOOP.maxFps;
  loopDue = (now - loopDue > step ? now : loopDue) + step;
  return true;
}
export function loopFrame(now: number) {
  requestAnimationFrame(loopFrame);
  if (!frameDue(now)) return;
  drawn++;
  const dt = Math.min(LOOP.maxDt, (now - loopLast) / 1000);
  loopLast = now;
  runSystems(dt);
  renderer.info.reset(); // (render.ts: the counts add up over this frame's passes)
  renderer.render(scene, camera);
  renderGun();
}
export function startLoop() {
  loopLast = performance.now();
  requestAnimationFrame(loopFrame);
}
