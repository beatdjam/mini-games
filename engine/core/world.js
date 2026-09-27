'use strict';
// engine: Objects with behaviour, in the spirit of Unity's MonoBehaviour.
// - spawn(obj): obj joins the world; every frame (in WORLD.system's modes) the engine calls obj.update(dt), in the
//   order they joined. Set obj.dead = true to remove it: at the end of that pass it leaves the list, obj.onRemove()
//   runs if it has one, and obj.mesh is disposed and taken out of the scene.
// - obj.tag groups objects: query(tag) returns the live ones; clearWorld(tag) removes them now (no tag = everything).
const WORLD = { list: [], system: null };
function spawn(o) { WORLD.list.push(o); return o; }
function query(tag) { return WORLD.list.filter(o => o.tag === tag && !o.dead); }
function removeFromWorld(o) {
  if (o.onRemove) o.onRemove();
  if (o.mesh) { disposeTree(o.mesh); if (o.mesh.parent) o.mesh.parent.remove(o.mesh); }
}
function sweepWorld() {
  const keep = [];
  for (const o of WORLD.list) { if (o.dead) removeFromWorld(o); else keep.push(o); }
  WORLD.list = keep;
}
function clearWorld(tag) { WORLD.list.forEach(o => { if (!tag || o.tag === tag) o.dead = true; }); sweepWorld(); }
function updateWorld(dt) {
  for (const o of WORLD.list.slice()) if (!o.dead && o.update) o.update(dt);
  sweepWorld();
}
WORLD.system = addSystem({ name: 'world', order: 30, update: updateWorld });
