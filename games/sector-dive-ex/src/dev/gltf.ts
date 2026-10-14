// dev view #view-gltf: an experiment for humans as glTF models (a skinned mesh with its animation) instead of
// jointed boxes. It stands in the start room in front of a crowd of one model, all playing a clip, and shows what it
// costs: the file's size, the time to load it, the triangles drawn and the time the animation takes each frame.
// Not part of the game: nothing here reaches the enemies, the hit spheres or the published build.
//   ?model=<url>: the model to load (default: src/dev/assets/human-quaternius.glb, a CC0 human; assets/README.md).
//   Other models to try can go in src/dev/models/, which git leaves out
//   ?n=<count>: how many (default 20)   ?clip=<name>: the clip to play (default: the first with "walk" in its name)
// Add ?fps to see the frame rate next to it.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { dynGroup } from '@engine/render/render.ts';
import { player } from '../actors/player.ts';

const HUMAN_H = 1.8; // every model is scaled to this height (m)
const ROW = 5, // models in a row
  GAP = 1.6, // between models (m)
  NEAR = 4; // from the player to the first row (m)

export async function showGltfCrowd() {
  const q = new URLSearchParams(location.search),
    url = q.get('model') ?? new URL('./assets/human-quaternius.glb', import.meta.url).href,
    n = Math.max(1, Number(q.get('n') ?? 20) || 20);
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:99;padding:4px 8px;background:#000a;color:#fff;font:13px/1.5 monospace;white-space:pre';
  document.body.append(box);
  box.textContent = `loading ${url}`;

  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) {
    box.textContent = `${res.status}: ${url}\nGive a model with ?model=<url>`;
    return;
  }
  const bytes = await res.arrayBuffer();
  // (three 0.128 has no parseAsync yet)
  const gltf = await new Promise<GLTF>((ok, fail) => new GLTFLoader().parse(bytes, url, ok, fail));
  const loadMs = performance.now() - t0;

  const clip =
    gltf.animations.find(a => a.name === q.get('clip')) ??
    gltf.animations.find(a => /walk/i.test(a.name)) ??
    gltf.animations[0];
  let tris = 0;
  gltf.scene.traverse(o => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
    if (g) tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()),
    scale = HUMAN_H / (size.y || 1);

  // the crowd: rows across the player's view, each model turned to face the player
  const fx = -Math.sin(player.yaw),
    fz = -Math.cos(player.yaw);
  const mixers = Array.from({ length: n }, (_, i) => {
    const m = SkeletonUtils.clone(gltf.scene),
      side = ((i % ROW) - (ROW - 1) / 2) * GAP,
      d = NEAR + Math.floor(i / ROW) * GAP;
    m.scale.setScalar(scale);
    m.position.set(player.x + fx * d - fz * side, player.fy, player.z + fz * d + fx * side);
    m.rotation.y = player.yaw;
    dynGroup.add(m);
    const mixer = new THREE.AnimationMixer(m);
    if (clip) mixer.clipAction(clip).play();
    mixer.setTime(Math.random() * (clip?.duration ?? 0)); // out of step, as a crowd would be
    return mixer;
  });

  // run the animations on their own clock; the cost is the time the mixers take, averaged over a second
  let last = performance.now(),
    spent = 0,
    frames = 0,
    since = last;
  const head = [
    `${(bytes.byteLength / 1024).toFixed(0)} KB, loaded in ${loadMs.toFixed(0)} ms`,
    `${n} × ${tris.toFixed(0)} tris = ${((n * tris) / 1000).toFixed(1)}k tris`,
    `clip: ${clip?.name ?? '(none)'} / ${gltf.animations.map(a => a.name).join(', ') || 'no clips'}`,
  ].join('\n');
  box.textContent = head;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const a = performance.now();
    mixers.forEach(m => m.update(dt));
    spent += performance.now() - a;
    frames++;
    if (now - since >= 1000) {
      box.textContent = `${head}\nanimation: ${(spent / frames).toFixed(2)} ms / frame`;
      spent = 0;
      frames = 0;
      since = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
