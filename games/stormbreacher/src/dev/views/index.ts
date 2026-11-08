import type { DevView } from './view.ts';
import { placeCamera } from '../../view/field.ts';
import { showScale } from './scale.ts';
import { showCamera } from './camera.ts';
import { showOutdoor } from './outdoor.ts';

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
    hash: '#view-outdoor',
    match: 'is',
    name: 'the beach bench: draw calls, triangles and fps',
    run: showOutdoor,
  },
];
