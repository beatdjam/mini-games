// Compares two folders of screenshots (npm run shots, vitest.shots.config.ts): node tools/shots_diff.js <before> <after>.
// For each picture in either, prints how many of its pixels differ (a channel more than THRESHOLD apart), and for the
// ones that differ writes <after>/diff/<name>.png: the before picture greyed out, the pixels that changed in red.
// Exits with 1 when any picture differs or is in only one of the folders. Both folders should be taken on the same
// machine: the drawn pixels differ a little from one GPU or browser to another.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs'; // (comes with @vitest/browser, which reads and writes its screenshots with it)

const THRESHOLD = 8; // a pixel counts as changed when one of its channels moved more than this (0-255)
const GREY = 0.25; // how bright the unchanged pixels are drawn in a diff picture

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node tools/shots_diff.js <before folder> <after folder>');
  process.exit(2);
}
// every .png under a folder, by its path from the folder
const pictures = dir =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true })
        .filter(f => f.endsWith('.png') && !f.split(path.sep).includes('diff'))
        .sort()
    : [];
const names = [...new Set([...pictures(a), ...pictures(b)])].sort();
let bad = 0;
for (const name of names) {
  const pa = path.join(a, name),
    pb = path.join(b, name);
  if (!fs.existsSync(pa) || !fs.existsSync(pb)) {
    console.log(`${name}: only in ${fs.existsSync(pa) ? a : b}`);
    bad++;
    continue;
  }
  const ia = PNG.sync.read(fs.readFileSync(pa)),
    ib = PNG.sync.read(fs.readFileSync(pb));
  if (ia.width !== ib.width || ia.height !== ib.height) {
    console.log(`${name}: size ${ia.width}x${ia.height} -> ${ib.width}x${ib.height}`);
    bad++;
    continue;
  }
  const out = new PNG({ width: ia.width, height: ia.height });
  let changed = 0;
  for (let i = 0; i < ia.data.length; i += 4) {
    const moved =
      Math.abs(ia.data[i] - ib.data[i]) > THRESHOLD ||
      Math.abs(ia.data[i + 1] - ib.data[i + 1]) > THRESHOLD ||
      Math.abs(ia.data[i + 2] - ib.data[i + 2]) > THRESHOLD;
    const grey = ((ia.data[i] + ia.data[i + 1] + ia.data[i + 2]) / 3) * GREY;
    out.data[i] = moved ? 255 : grey;
    out.data[i + 1] = moved ? 0 : grey;
    out.data[i + 2] = moved ? 0 : grey;
    out.data[i + 3] = 255;
    if (moved) changed++;
  }
  const share = (changed / (ia.width * ia.height)) * 100;
  console.log(`${name}: ${changed ? `${changed} pixels (${share.toFixed(2)}%)` : 'same'}`);
  if (!changed) continue;
  bad++;
  const to = path.join(b, 'diff', name);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, PNG.sync.write(out));
}
console.log(`${names.length} pictures, ${bad} differ`);
process.exit(bad ? 1 : 0);
