// npm run trailer -- <script.txt> [--preview] [--scene N] [--every M] [--out DIR]
// Films a trailer script into an mp4 (tools/trailer/README.md): starts the dev server if it is not up, films the
// frames and the sound effects, then the music, and puts them together with ffmpeg.
//   (no option)   <out>/trailer.mp4
//   --preview     every 15th frame (--every M: every Mth) into one picture, <out>/sheet.jpg (no sound; quick)
//   --scene N     only the Nth part (from 1; the title card counts) as <out>/scene-N.mp4 (no sound)
//   --out DIR     where it all goes (default: out/trailer/<the script's name>)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readScript } from './settings.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, '../..');
const args = process.argv.slice(2),
  flag = name => args.includes(name),
  value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined),
  file = args.find((a, i) => !a.startsWith('--') && !['--scene', '--every', '--out'].includes(args[i - 1]));
if (!file) {
  console.error('usage: npm run trailer -- <script.txt> [--preview] [--scene N] [--every M] [--out DIR]');
  process.exit(1);
}
let script;
try {
  script = readScript(file);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const preview = flag('--preview'),
  scene = value('--scene'),
  out = path.resolve(value('--out') ?? path.join(root, 'out', 'trailer', path.basename(file).replace(/\.[^.]*$/, '')));
if (scene !== undefined && !(+scene >= 1 && +scene <= script.parts.length)) {
  console.error(`--scene takes 1 to ${script.parts.length} (the script's parts, the title card last)`);
  process.exit(1);
}
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version']).status !== 0) {
  console.error('ffmpeg is needed (one with libx264). Set FFMPEG if it is not on the PATH');
  process.exit(1);
}
const BASE = process.env.BASE || 'http://localhost:8765/';

// ---- the dev server ----
const up = async () => {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
};
let server = null;
if (!(await up())) {
  console.log(`starting the dev server (${BASE})`);
  server = spawn('npx', ['vite', '--port', new URL(BASE).port || '8765', '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
  for (let n = 0; !(await up()); n++) {
    if (n > 120) {
      console.error('the dev server did not come up');
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}
const stop = () => {
  if (server) {
    try {
      process.kill(-server.pid);
    } catch {
      // already gone
    }
    server = null;
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

// ---- filming ----
const run = (cmd, argv, env = {}) => {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', cwd: root, env: { ...process.env, BASE, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const capture = (pass, env) =>
  run(process.execPath, [path.join(here, 'capture.mjs'), path.resolve(file), out, pass], env);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^f\d+\.jpg$/.test(f)) fs.rmSync(path.join(out, f));
const frames = () => fs.readdirSync(out).filter(f => /^f\d+\.jpg$/.test(f)).length;

if (preview) {
  const every = value('--every') ?? '15';
  capture('video', { TEVERY: every });
  const sheet = path.join(out, 'sheet.jpg');
  run(ffmpeg, [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-pattern_type', 'glob'],
    ...[
      '-i',
      path.join(out, 'f*.jpg'),
      '-vf',
      `scale=384:-1,tile=6x${Math.ceil(frames() / 6)}`,
      '-frames:v',
      '1',
      sheet,
    ],
  ]);
  console.log(`${sheet} (every ${every}th frame, left to right)`);
} else if (scene !== undefined) {
  capture('video', { TSCENE: scene });
  const mp4 = path.join(out, `scene-${scene}.mp4`);
  run(ffmpeg, [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-pattern_type', 'glob'],
    ...['-i', path.join(out, 'f*.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
  ]);
  console.log(mp4);
} else {
  capture('video');
  capture('music');
  run('sh', [path.join(here, 'encode.sh'), out], { FFMPEG: ffmpeg });
}
stop();
