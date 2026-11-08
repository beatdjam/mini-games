import type { DevView } from './view.ts';
import { placeCamera } from '../../view/field.ts';
import { showScale } from './scale.ts';

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
];
