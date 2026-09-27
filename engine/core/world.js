'use strict';
// engine: Objects with behaviour, in the spirit of Unity's MonoBehaviour.
// - spawn(obj): obj joins the world; every frame the engine calls obj.update(dt), in the order they joined (objects
//   spawned during the pass are updated in the same pass). Set obj.dead = true to remove it: after the pass it leaves
//   the list, obj.onRemove() runs if it has one, and obj.mesh is disposed and taken out of the scene if still there.
// - obj.tag groups objects: query(tag) returns the live ones; clearWorld(tag) removes them now (no tag = everything).
// - worldGroup(tag, order): objects with that tag get their own list and system, so they update at `order`
//   (other tags share the default group at order 30). group.list is kept as the same array for the game's lifetime,
//   so the game may keep a reference to it (e.g. let enemies = worldGroup('enemy', 10).list).
//   group.system / WORLD.system are the systems; set their .modes like any other.
const WORLD = { groups: {}, system: null };
function newWorldGroup(tag, order) {
  const g = { tag, list: [] };
  g.system = addSystem({ name: 'world:' + tag, order, update: dt => updateWorldGroup(g, dt) });
  return g;
}
function worldGroup(tag, order) { return WORLD.groups[tag] = newWorldGroup(tag, order); }
WORLD.groups['*'] = newWorldGroup('*', 30);
WORLD.system = WORLD.groups['*'].system;
const groupOf = tag => WORLD.groups[tag] || WORLD.groups['*'];
function spawn(o) { groupOf(o.tag).list.push(o); return o; }
function query(tag) { return groupOf(tag).list.filter(o => o.tag === tag && !o.dead); }
function removeFromWorld(o) {
  if (o.onRemove) o.onRemove();
  if (o.mesh && o.mesh.parent) { disposeTree(o.mesh); o.mesh.parent.remove(o.mesh); }
}
function sweepGroup(g) {
  let j = 0;
  for (const o of g.list) { if (o.dead) removeFromWorld(o); else g.list[j++] = o; }
  g.list.length = j;
}
function sweepWorld() { Object.values(WORLD.groups).forEach(sweepGroup); }
function clearWorld(tag) {
  Object.values(WORLD.groups).forEach(g => g.list.forEach(o => { if (!tag || o.tag === tag) o.dead = true; }));
  sweepWorld();
}
function updateWorldGroup(g, dt) {
  for (let i = 0; i < g.list.length; i++) { const o = g.list[i]; if (!o.dead && o.update) o.update(dt); }
  sweepGroup(g);
}
