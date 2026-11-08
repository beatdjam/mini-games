import type { DevView } from './view.ts';
import { placeCamera } from '../../world/field.ts';

// The views the dev server can open (dev/dev.ts).
export const DEV_VIEWS: DevView[] = [
  {
    hash: '#view-field',
    match: 'is',
    name: 'the empty field from the start camera',
    run: () => placeCamera(),
  },
];
