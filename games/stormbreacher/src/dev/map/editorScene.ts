// What the editor draws for one map: the ground, the props and the targets seen from above, plus the mark on the
// selected piece. The map view and this view use the same builders, so the editor shows the map #view-map walks.
import * as THREE from 'three';
import type { MapDef } from '../../data/types.ts';
import { buildOutdoor, buildTargets } from '../../view/outdoor.ts';
import { groundTiles } from './build.ts';
import { selectionAt, type MapSelection } from './model.ts';

const SELECT_COLOR = 0xffd24a; // the selected piece's ring and line
const SELECT_LINE = 8; // how tall the line over a selected piece stands (m)

export function buildEditorGroup(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map-editor';
  const built = buildOutdoor([...groundTiles(map.bounds), ...map.props], { chunk: 0, chunkMin: 0 });
  group.add(built.group);
  group.add(buildTargets(map.targets));
  return group;
}

export function makeSelectionMark(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'selection';
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.5, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: SELECT_COLOR, side: THREE.DoubleSide }),
  );
  ring.position.y = 0.12;
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, SELECT_LINE, 0)]),
    new THREE.LineBasicMaterial({ color: SELECT_COLOR }),
  );
  group.add(ring, line);
  group.visible = false;
  return group;
}

export function placeSelectionMark(mark: THREE.Group, map: MapDef, selection: MapSelection) {
  const at = selectionAt(map, selection);
  if (at === null) {
    mark.visible = false;
    return;
  }
  mark.visible = true;
  mark.position.set(at.x, 0, at.z);
}
