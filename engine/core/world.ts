import { addSystem, type System } from './loop.ts';
import { disposeTree } from '../render/render.ts';
// engine: Objects with behaviour, in the spirit of Unity's MonoBehaviour.
// - spawn(obj): obj joins the world; every frame the engine calls obj.update(dt), in the order they joined (objects
//   spawned during the pass are updated in the same pass). Set obj.dead = true to remove it: after the pass it leaves
//   the list, obj.onRemove() runs if it has one, and obj.mesh is disposed and taken out of the scene if still there.
// - obj.tag groups objects: query(tag) returns the live ones; clearWorld(tag) removes them now (no tag = everything).
// - worldGroup(tag, order): objects with that tag get their own list and system, so they update at `order`
//   (other tags share the default group at order 30). group.list is kept as the same array for the game's lifetime,
//   so the game may keep a reference to it (e.g. let enemies = worldGroup('enemy', 10).list).
//   group.system / WORLD.system are the systems; set their .modes like any other.
export interface WorldObject { tag?: string; dead?: boolean; mesh?: any; update?(dt: number): void; onRemove?(): void; [k: string]: any; }
export interface WorldGroup { tag: string; list: WorldObject[]; system: System; }
export const WORLD: { groups: Record<string, WorldGroup>; system: System | null } = { groups: {}, system: null };
export function newWorldGroup(tag: string, order: number): WorldGroup {
  const g = { tag, list: [] } as unknown as WorldGroup;
  g.system = addSystem({ name: 'world:' + tag, order, update: dt => updateWorldGroup(g, dt) });
  return g;
}
export function worldGroup(tag: string, order: number) { return WORLD.groups[tag] = newWorldGroup(tag, order); }
WORLD.groups['*'] = newWorldGroup('*', 30);
WORLD.system = WORLD.groups['*'].system;
export const groupOf = tag => WORLD.groups[tag] || WORLD.groups['*'];
export function spawn(o) { groupOf(o.tag).list.push(o); return o; }
export function query(tag) { return groupOf(tag).list.filter(o => o.tag === tag && !o.dead); }
export function removeFromWorld(o) {
  if (o.onRemove) o.onRemove();
  if (o.mesh && o.mesh.parent) { disposeTree(o.mesh); o.mesh.parent.remove(o.mesh); }
}
export function sweepGroup(g) {
  let j = 0;
  for (const o of g.list) { if (o.dead) removeFromWorld(o); else g.list[j++] = o; }
  g.list.length = j;
}
export function sweepWorld() { Object.values(WORLD.groups).forEach(sweepGroup); }
export function clearWorld(tag?) {
  Object.values(WORLD.groups).forEach(g => g.list.forEach(o => { if (!tag || o.tag === tag) o.dead = true; }));
  sweepWorld();
}
export function updateWorldGroup(g, dt) {
  for (let i = 0; i < g.list.length; i++) { const o = g.list[i]; if (!o.dead && o.update) o.update(dt); }
  sweepGroup(g);
}
