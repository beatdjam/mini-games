// The defence works and the landing craft lined up for a close look (#view-props, SB-1470): the hedgehog, the block,
// the low wall and the bunker in a row with the craft broadside, and the knobs that change their detail's numbers.
// Nothing here touches the game: each knob rebuilds the line so the shape can be judged at once.
import * as THREE from 'three';
import { el } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { DEFENSE_DETAIL } from '../../data/defenses.ts';
import { buildDefenseLineup } from '../outdoor/defenseLineup.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';

// The values the panel turns, by the table's dotted path. The defence works' lengths are before fitBox stretches the
// shape to PROP_SIZE, so the labels say fit 前; the craft's are its real metres.
const RANGES: Readonly<Record<string, TuneRange>> = {
  'hedgehog.beam': { min: 0.15, max: 0.6, step: 0.01 },
  'hedgehog.web': { min: 0.05, max: 0.3, step: 0.005 },
  'hedgehog.length': { min: 1, max: 5, step: 0.1 },
  'hedgehog.tilt': { min: 0.2, max: 1.2, step: 0.01 },
  'hedgehog.plate': { min: 0.2, max: 1.5, step: 0.01 },
  'hedgehog.plateThick': { min: 0.02, max: 0.3, step: 0.005 },
  'bunker.bevel': { min: 0, max: 1.5, step: 0.01 },
  'bunker.bodyW': { min: 4, max: 12, step: 0.1 },
  'bunker.bodyH': { min: 1, max: 5, step: 0.1 },
  'bunker.bodyD': { min: 3, max: 10, step: 0.1 },
  'bunker.roofW': { min: 4, max: 14, step: 0.1 },
  'bunker.roofH': { min: 0.1, max: 2, step: 0.01 },
  'bunker.roofD': { min: 3, max: 12, step: 0.1 },
  'bunker.slitWidth': { min: 0.5, max: 8, step: 0.1 },
  'bunker.slitHeight': { min: 0.2, max: 2, step: 0.05 },
  'bunker.slitDepth': { min: 0.1, max: 1.5, step: 0.05 },
  'bunker.slitInset': { min: 0, max: 0.3, step: 0.01 },
  'bunker.slitPost': { min: 0.1, max: 1, step: 0.05 },
  'bunker.slitBar': { min: 0.1, max: 0.8, step: 0.01 },
  'bunker.frameProud': { min: 0, max: 0.6, step: 0.01 },
  'bunker.bags': { min: 0, max: 12, step: 1 },
  'bunker.bagW': { min: 0.3, max: 2, step: 0.05 },
  'bunker.bagH': { min: 0.1, max: 1, step: 0.02 },
  'bunker.bagD': { min: 0.2, max: 1.5, step: 0.05 },
  'bunker.bagTurn': { min: 0, max: 1, step: 0.01 },
  'bunker.grass': { min: 0, max: 16, step: 1 },
  'bunker.grassW': { min: 0.05, max: 0.5, step: 0.01 },
  'bunker.grassH': { min: 0.1, max: 1.5, step: 0.05 },
  'bunker.grassTurn': { min: 0, max: 1.5, step: 0.01 },
  'bunker.doorW': { min: 0.3, max: 4, step: 0.1 },
  'bunker.doorH': { min: 0.5, max: 3, step: 0.1 },
  'bunker.doorD': { min: 0.1, max: 1.5, step: 0.05 },
  'block.bodyW': { min: 1, max: 8, step: 0.1 },
  'block.bodyH': { min: 1, max: 4, step: 0.1 },
  'block.bodyD': { min: 1, max: 8, step: 0.1 },
  'block.chipW': { min: 0, max: 2, step: 0.05 },
  'block.chipH': { min: 0, max: 1.5, step: 0.05 },
  'block.rebar': { min: 0.02, max: 0.3, step: 0.01 },
  'block.rebarLength': { min: 0.2, max: 3, step: 0.05 },
  'block.crack': { min: 0.02, max: 0.3, step: 0.01 },
  'block.crackLength': { min: 0.2, max: 3, step: 0.05 },
  'block.crackX': { min: -2, max: 2, step: 0.05 },
  'block.crackY': { min: 0, max: 4, step: 0.05 },
  'block.crackTurn': { min: -1, max: 1, step: 0.01 },
  'block.crack2X': { min: -2, max: 2, step: 0.05 },
  'block.crack2Y': { min: 0, max: 4, step: 0.05 },
  'block.crack2Turn': { min: -1, max: 1, step: 0.01 },
  'lowWall.bodyW': { min: 2, max: 10, step: 0.1 },
  'lowWall.bodyH': { min: 0.3, max: 2, step: 0.05 },
  'lowWall.bodyD': { min: 0.3, max: 3, step: 0.05 },
  'lowWall.chipW': { min: 0, max: 2, step: 0.05 },
  'lowWall.chipH': { min: 0, max: 1, step: 0.05 },
  'lowWall.rebar': { min: 0.02, max: 0.3, step: 0.01 },
  'lowWall.rebarLength': { min: 0.2, max: 3, step: 0.05 },
  'lowWall.crack': { min: 0.02, max: 0.3, step: 0.01 },
  'lowWall.crackLength': { min: 0.2, max: 3, step: 0.05 },
  'lowWall.crackX': { min: -5, max: 5, step: 0.05 },
  'lowWall.crackYShare': { min: 0.1, max: 0.9, step: 0.01 },
  'lowWall.crackTurn': { min: -1, max: 1, step: 0.01 },
  'craft.seamWidth': { min: 0.01, max: 0.3, step: 0.005 },
  'craft.seamHeight': { min: 0.2, max: 2, step: 0.05 },
  'craft.seamGap': { min: 0.2, max: 5, step: 0.1 },
  'craft.hingeW': { min: 0.05, max: 1, step: 0.01 },
  'craft.hingeH': { min: 0.05, max: 1, step: 0.01 },
  'craft.hingeD': { min: 0.05, max: 1, step: 0.01 },
  'craft.chain': { min: 0.02, max: 0.3, step: 0.005 },
  'craft.chainLength': { min: 0.2, max: 4, step: 0.1 },
  'craft.windowW': { min: 0.1, max: 2, step: 0.05 },
  'craft.windowH': { min: 0.1, max: 1.5, step: 0.05 },
  'craft.windowD': { min: 0.01, max: 0.3, step: 0.005 },
  'craft.windowY': { min: 0.5, max: 4, step: 0.05 },
  'craft.windowSide': { min: 0, max: 0.5, step: 0.01 },
  'craft.windowSideZ': { min: 0.1, max: 2, step: 0.05 },
  'craft.bowWidth': { min: 1, max: 7, step: 0.1 },
  'craft.bowHeight': { min: 0.1, max: 2, step: 0.05 },
  'craft.bowDepth': { min: 0.1, max: 3, step: 0.05 },
  'craft.bowTilt': { min: 0, max: 1.5, step: 0.01 },
  'craft.ribWidth': { min: 1, max: 7, step: 0.1 },
  'craft.ribHeight': { min: 0.01, max: 0.3, step: 0.005 },
  'craft.ribDepth': { min: 0.01, max: 0.5, step: 0.005 },
  'craft.ribs': { min: 0, max: 12, step: 1 },
  'craft.hingeX': { min: 1, max: 3, step: 0.05 },
  'craft.hingeY': { min: 0, max: 1, step: 0.01 },
  'craft.chainY': { min: 0, max: 1, step: 0.01 },
};

const LABELS: Readonly<Record<string, string>> = {
  'hedgehog.beam': '梁の太さ（m・fit 前）',
  'hedgehog.web': 'L の板厚（m・fit 前）',
  'hedgehog.length': '梁の長さ（m・fit 前）',
  'hedgehog.tilt': '梁の傾き（rad）',
  'hedgehog.plate': '交点の板（m・fit 前）',
  'hedgehog.plateThick': '交点の板厚（m・fit 前）',
  'bunker.bevel': '面取り（m・fit 前）',
  'bunker.bodyW': '胴の幅（m・fit 前）',
  'bunker.bodyH': '胴の高さ（m・fit 前）',
  'bunker.bodyD': '胴の奥行き（m・fit 前）',
  'bunker.roofW': '屋根の幅（m・fit 前）',
  'bunker.roofH': '屋根の厚さ（m・fit 前）',
  'bunker.roofD': '屋根の奥行き（m・fit 前）',
  'bunker.slitWidth': '銃眼の幅（m・fit 前）',
  'bunker.slitHeight': '銃眼の高さ（m・fit 前）',
  'bunker.slitDepth': '銃眼の奥行き（m・fit 前）',
  'bunker.slitInset': '銃眼の奥（m・fit 前）',
  'bunker.slitPost': '銃眼の柱（m・fit 前）',
  'bunker.slitBar': '銃眼の枠（m・fit 前）',
  'bunker.frameProud': '枠の出（m・fit 前）',
  'bunker.bags': '土嚢の数',
  'bunker.bagW': '土嚢の幅（m・fit 前）',
  'bunker.bagH': '土嚢の高さ（m・fit 前）',
  'bunker.bagD': '土嚢の奥行き（m・fit 前）',
  'bunker.bagTurn': '土嚢の向き（rad）',
  'bunker.grass': '草の数',
  'bunker.grassW': '草の太さ（m・fit 前）',
  'bunker.grassH': '草の高さ（m・fit 前）',
  'bunker.grassTurn': '草の向き（rad）',
  'bunker.doorW': '入口の幅（m・fit 前）',
  'bunker.doorH': '入口の高さ（m・fit 前）',
  'bunker.doorD': '入口の奥行き（m・fit 前）',
  'block.bodyW': '塊の幅（m・fit 前）',
  'block.bodyH': '塊の高さ（m・fit 前）',
  'block.bodyD': '塊の奥行き（m・fit 前）',
  'block.chipW': '欠けの幅（m・fit 前）',
  'block.chipH': '欠けの高さ（m・fit 前）',
  'block.rebar': '鉄筋の太さ（m・fit 前）',
  'block.rebarLength': '鉄筋の長さ（m・fit 前）',
  'block.crack': '割れの幅（m・fit 前）',
  'block.crackLength': '割れの長さ（m・fit 前）',
  'block.crackX': '割れの横位置（m・fit 前）',
  'block.crackY': '割れの高さ（m・fit 前）',
  'block.crackTurn': '割れの傾き（rad）',
  'block.crack2X': '短い割れの横位置（m・fit 前）',
  'block.crack2Y': '短い割れの高さ（m・fit 前）',
  'block.crack2Turn': '短い割れの傾き（rad）',
  'lowWall.bodyW': '壁の幅（m・fit 前）',
  'lowWall.bodyH': '壁の高さ（m・fit 前）',
  'lowWall.bodyD': '壁の奥行き（m・fit 前）',
  'lowWall.chipW': '欠けの幅（m・fit 前）',
  'lowWall.chipH': '欠けの高さ（m・fit 前）',
  'lowWall.rebar': '鉄筋の太さ（m・fit 前）',
  'lowWall.rebarLength': '鉄筋の長さ（m・fit 前）',
  'lowWall.crack': '割れの幅（m・fit 前）',
  'lowWall.crackLength': '割れの長さ（m・fit 前）',
  'lowWall.crackX': '割れの横位置（m・fit 前）',
  'lowWall.crackYShare': '割れの高さ（壁の割合）',
  'lowWall.crackTurn': '割れの傾き（rad）',
  'craft.seamWidth': '継ぎ目の太さ（m）',
  'craft.seamHeight': '継ぎ目の高さ（m）',
  'craft.seamGap': '継ぎ目の間隔（m）',
  'craft.hingeW': '蝶番の幅（m）',
  'craft.hingeH': '蝶番の高さ（m）',
  'craft.hingeD': '蝶番の奥行き（m）',
  'craft.chain': '鎖の太さ（m）',
  'craft.chainLength': '鎖の長さ（m）',
  'craft.windowW': '窓の幅（m）',
  'craft.windowH': '窓の高さ（m）',
  'craft.windowD': '窓の厚さ（m）',
  'craft.windowY': '窓の高さ（m）',
  'craft.windowSide': '窓の出（m）',
  'craft.windowSideZ': '横の窓の前後（m）',
  'craft.bowWidth': '波よけの幅（m）',
  'craft.bowHeight': '波よけの高さ（m）',
  'craft.bowDepth': '波よけの奥行き（m）',
  'craft.bowTilt': '波よけの傾き（rad）',
  'craft.ribWidth': 'ランプの桟の幅（m）',
  'craft.ribHeight': 'ランプの桟の高さ（m）',
  'craft.ribDepth': 'ランプの桟の奥行き（m）',
  'craft.ribs': 'ランプの桟の数',
  'craft.hingeX': '蝶番の横位置（m）',
  'craft.hingeY': '蝶番の高さ（m）',
  'craft.chainY': '鎖の高さ（m）',
};

// Throws away the geometries of a line that is being replaced; the materials are the shared ones.
function disposeLine(line: THREE.Object3D): void {
  line.traverse(child => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

export function showProps(_hash: string) {
  el('#sbApp').hidden = true;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = true;

  camera.position.set(6, 13, 56);
  camera.lookAt(6, 2, 0);
  camera.fov = 55;
  camera.far = 220;
  camera.updateProjectionMatrix();

  let line: THREE.Group | null = null;
  const rebuild = () => {
    if (line) {
      scene.remove(line);
      disposeLine(line);
    }
    line = buildDefenseLineup();
    scene.add(line);
  };
  rebuild();

  createTunePanel({
    title: '防御物の形 SB-1470',
    groups: [
      {
        name: 'DEFENSE_DETAIL',
        table: DEFENSE_DETAIL,
        ranges: RANGES,
        labels: LABELS,
      },
    ],
    onChange: () => rebuild(),
  });
}
