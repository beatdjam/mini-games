import type { DevView } from './view.ts';
import { placeCamera } from '../../view/field.ts';
import { showScale } from './scale.ts';
import { showCamera } from './camera.ts';
import { showMove } from './move.ts';
import { showTouch } from './touch.ts';
import { showFcs } from './fcs.ts';
import { showOutdoor } from './outdoor.ts';
import { showScript } from './script.ts';

// The views the dev server can open (dev/dev.ts).
export const DEV_VIEWS: DevView[] = [
  {
    hash: '#view-field',
    match: 'is',
    name: 'the empty field from the start camera',
    run: () => placeCamera(),
  },
  {
    hash: '#view-scale',
    match: 'starts',
    name: 'the scale course with 7/8/10 m mechs',
    run: showScale,
  },
  {
    hash: '#view-camera',
    match: 'is',
    name: 'the third-person camera on the course',
    run: showCamera,
  },
  {
    hash: '#view-move',
    match: 'is',
    name: 'walk, jump, boost and fire on flat ground',
    run: showMove,
  },
  {
    hash: '#view-touch',
    match: 'is',
    name: 'touch controls on flat ground, with the layout editor',
    run: showTouch,
  },
  {
    hash: '#view-play',
    match: 'is',
    name: 'play on flat ground with touch, or keyboard and mouse',
    run: showTouch,
  },
  {
    hash: '#view-fcs',
    match: 'is',
    name: 'the three FCS types against moving dummies',
    run: showFcs,
  },
  {
    hash: '#view-outdoor',
    match: 'is',
    name: 'the beach bench: draw calls, triangles and fps',
    run: showOutdoor,
  },
  {
    hash: '#view-script',
    match: 'is',
    name: 'the mission script, driven by buttons',
    run: showScript,
  },
];
