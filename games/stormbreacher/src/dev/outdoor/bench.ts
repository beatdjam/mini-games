// Measures how heavy the beach is to draw. After a warm-up it records, frame by frame, how long the last frame took and
// what it drew; at the end it puts the numbers big in the screen's top right (a phone held sideways can read them) and
// returns the same numbers from window.sbBenchReport().
import { addSystem } from '@engine/core/index.ts';
import { renderer } from '@engine/render/index.ts';
import type { MechDraw } from './mechs.ts';

// How long the bench waits and measures (ms). The first seconds of a page are slower than the rest, so they are left
// out; ten seconds is long enough for the numbers to settle on a phone.
export const BENCH = {
  warm: 2000,
  span: 10000,
} as const;

export interface BenchParams {
  chunk: number; // the chunk side (m); 0 is no chunks
  chunkMin: number; // the triangles a kind needs before it is split into chunks
  far: number; // how far the camera draws (m)
  enemies: number; // how many mechs walk the beach
  mechDraw: MechDraw; // how the mechs are drawn
  mechs: number; // mechs added in a line for comparison
  density: number; // how many obstacles stand on the beach
  cam: 'path' | 'fixed'; // whether the camera walks the beach or stands still
  invalid: string[]; // the URL names whose values were not one of the listed ones
}

export interface BenchReport {
  params: BenchParams;
  fpsAvg: number; // frames a second over the span
  frameMsP99: number; // the slowest 1% of the frame intervals (ms)
  frameMsMax: number; // the slowest frame interval (ms)
  callsAvg: number; // draw calls in a frame, averaged over the span
  callsMax: number;
  trisAvg: number; // triangles in a frame, averaged over the span
  trisMax: number;
  loadMs: number; // from the page opening to the view's first frame (ms)
  buildMs: number; // how long buildOutdoor took (ms)
  heapMB: number | null; // the JavaScript heap in use, on Chrome only (MB)
  geometries: number; // what the renderer keeps in memory
  textures: number;
  ua: string; // the browser, to tell a phone's numbers from a desk's
  screen: string; // width x height x devicePixelRatio
}

interface Sample {
  frameMs: number;
  calls: number;
  tris: number;
}

declare global {
  interface Window {
    sbBenchReport?: () => string | null;
  }
}

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

// The slowest frame interval at the 99th percentile: one frame in a hundred is slower than this.
function p99(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)];
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

function heapMB(): number | null {
  // performance.memory is Chrome's own; the standard type does not list it
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? round(memory.usedJSHeapSize / (1024 * 1024), 1) : null;
}

const SCREEN: string = `${window.innerWidth}x${window.innerHeight}x${window.devicePixelRatio || 1}`;

function makePanel() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'top:max(8px,env(safe-area-inset-top))',
    'right:max(8px,env(safe-area-inset-right))',
    'max-width:min(92vw,720px)',
    'display:flex',
    'flex-direction:column',
    'gap:6px',
    'pointer-events:none',
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#eaf6ff',
    'text-shadow:0 2px 6px rgba(0,0,0,.85)',
    'z-index:20',
  ].join(';');
  const head = document.createElement('div');
  head.style.cssText = [
    'pointer-events:none',
    'font-size:clamp(18px,3.4vmin,30px)',
    'line-height:1.35',
    'white-space:pre',
    'text-align:right',
    'font-weight:600',
  ].join(';');
  const json = document.createElement('textarea');
  json.readOnly = true;
  json.spellcheck = false;
  json.style.cssText = [
    'pointer-events:auto',
    'display:none',
    'width:min(92vw,720px)',
    'height:auto',
    'box-sizing:border-box',
    'font:inherit',
    'font-size:clamp(10px,1.5vmin,14px)',
    'color:#eaf6ff',
    'background:rgba(0,0,0,.6)',
    'border:1px solid rgba(234,246,255,.4)',
    'border-radius:4px',
    'padding:4px',
  ].join(';');
  panel.append(head, json);
  document.body.appendChild(panel);
  return { head, json };
}

function resultText(report: BenchReport): string {
  const lines = [
    `fps ${report.fpsAvg}`,
    `frame p99 ${report.frameMsP99} ms / max ${report.frameMsMax} ms`,
    `calls ${report.callsAvg} avg / ${report.callsMax} max`,
    `tris ${report.trisAvg} avg / ${report.trisMax} max`,
    `build ${report.buildMs} ms / load ${report.loadMs} ms`,
    `heap ${report.heapMB === null ? '-' : `${report.heapMB} MB`}`,
    `geom ${report.geometries} / tex ${report.textures}`,
  ];
  if (report.params.invalid.length) lines.push(`無効な値: ${report.params.invalid.join(', ')}`);
  return lines.join('\n');
}

// Starts the bench for a view that is already built: `params` is what the URL asked for, `buildMs` what building the
// beach took. Readings come from the last frame that was drawn, one frame behind the moment the system runs.
export function startBench(params: BenchParams, buildMs: number) {
  const { head, json } = makePanel();
  let report: BenchReport | null = null;
  window.sbBenchReport = () => (report ? JSON.stringify(report) : null);

  let started = 0;
  let warmEnd = 0;
  let endAt = 0;
  let last = 0;
  let loadMs = 0;
  const samples: Sample[] = [];

  addSystem({
    name: 'sb-outdoor-bench',
    order: 10,
    update: () => {
      const now = performance.now();
      if (!started) {
        started = now;
        loadMs = round(now, 1);
        warmEnd = now + BENCH.warm;
        endAt = warmEnd + BENCH.span;
        last = now;
        head.textContent = `測定中 ${Math.round(BENCH.span / 1000)} 秒`;
        return;
      }

      const frameMs = now - last;
      last = now;

      if (now >= endAt) {
        const intervals = samples.map(sample => sample.frameMs);
        const calls = samples.map(sample => sample.calls);
        const tris = samples.map(sample => sample.tris);
        report = {
          params,
          fpsAvg: intervals.length ? round(1000 / (sum(intervals) / intervals.length), 1) : 0,
          frameMsP99: round(p99(intervals), 2),
          frameMsMax: round(Math.max(...intervals), 2),
          callsAvg: samples.length ? round(sum(calls) / samples.length, 1) : 0,
          callsMax: calls.length ? Math.max(...calls) : 0,
          trisAvg: samples.length ? round(sum(tris) / samples.length, 1) : 0,
          trisMax: tris.length ? Math.max(...tris) : 0,
          loadMs,
          buildMs: round(buildMs, 1),
          heapMB: heapMB(),
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          ua: navigator.userAgent,
          screen: SCREEN,
        };
        head.textContent = resultText(report);
        json.value = JSON.stringify(report, null, 2);
        json.style.display = 'block';
        json.rows = Math.min(20, json.value.split('\n').length);
        return;
      }

      if (now >= warmEnd) {
        head.textContent = `測定中 ${Math.max(0, Math.ceil((endAt - now) / 1000))} 秒`;
        samples.push({
          frameMs,
          calls: renderer.info.render.calls,
          tris: renderer.info.render.triangles,
        });
      } else {
        head.textContent = `測定中 ${Math.round(BENCH.span / 1000)} 秒`;
      }
    },
  });
}
