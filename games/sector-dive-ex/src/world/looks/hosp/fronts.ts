import type * as THREE from 'three';
import { NAME_BOARD_PX, boardName, cachedTex, canvasTex } from '../paint.ts';
import { KIND_BAND, PLATE_WHITE, STEEL_DARK } from './shared.ts';
// The department boards of the hospital's rooms (props): one for each room with a kind, over its way in from the
// corridor (the place is worked out the way the mall's shop fronts are: mall/fronts.ts shopFronts, given the hospital's
// words). A white enamel plate with a band in the colour of the room's kind at its left and the department's name; the
// pictures are made once for each name.
// ---- tuning numbers used only here ----
const BAND_W = 44; // the coloured band at the plate's left (px)
const WORDS_COLOR = '#2c3a34';

const boards = new Map<string, THREE.CanvasTexture>();
// the board of a room: the kind's colour band, a steel rim, the name
export function boardTex(kind: number, name: string): THREE.CanvasTexture {
  const key = `${kind}|${name}`;
  return cachedTex(boards, key, () =>
    canvasTex(NAME_BOARD_PX[0], NAME_BOARD_PX[1], g => {
      g.fillStyle = PLATE_WHITE;
      g.fillRect(0, 0, NAME_BOARD_PX[0], NAME_BOARD_PX[1]);
      g.fillStyle = KIND_BAND[kind]!;
      g.fillRect(0, 0, BAND_W, NAME_BOARD_PX[1]);
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.fillRect(BAND_W, 0, 3, NAME_BOARD_PX[1]);
      g.strokeStyle = STEEL_DARK;
      g.lineWidth = 4;
      g.strokeRect(2, 2, NAME_BOARD_PX[0] - 4, NAME_BOARD_PX[1] - 4);
      boardName(g, name, WORDS_COLOR, BAND_W);
      g.fillStyle = 'rgba(60,50,30,.12)';
      g.fillRect(0, 0, NAME_BOARD_PX[0], NAME_BOARD_PX[1]);
    }),
  );
}
