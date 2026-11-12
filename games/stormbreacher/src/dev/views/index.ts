import type { DevView } from './view.ts';
import { placeCamera } from '../../view/field.ts';
import { showScale } from './scale.ts';
import { showCamera } from './camera.ts';
import { showMove } from './move.ts';
import { showTouch } from './touch.ts';
import { showFcs } from './fcs.ts';
import { showOutdoor } from './outdoor.ts';
import { showScript } from './script.ts';
import { showHud } from './hud.ts';
import { showMech } from './mech.ts';
import { showMap } from './mapView.ts';
import { showMapEdit } from './mapEdit.ts';
import { showFx } from './fx.ts';
import { showSound } from './sound.ts';

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
  {
    hash: '#view-hud',
    match: 'is',
    name: 'HUD layout plans A/B/C on a still beach, with sample values',
    run: showHud,
  },
  {
    hash: '#view-mech',
    match: 'is',
    name: 'mech look plans A-D on the beach, spinning, with draw counts',
    run: showMech,
  },
  {
    hash: '#view-map',
    match: 'is',
    name: 'walk M1 B line: by hand, from a seed, or the editor’s map',
    run: showMap,
  },
  {
    hash: '#view-fx',
    match: 'starts',
    name: 'the beach under fire: smoke, tracers, allies and the look, with knobs',
    run: showFx,
  },
  {
    hash: '#view-mapedit',
    match: 'is',
    name: 'put props and targets on M1 B line',
    run: showMapEdit,
  },
  {
    hash: '#view-sound',
    match: 'is',
    name: 'every sound in the table, with a distance knob',
    run: showSound,
  },
];
