'use strict';
// Touch button layout and the controls guide
// touch button layout: x/y are the centre as a fraction of the screen, b is the base size in px
const LAYOUT_DEF = {
  fire:   { x: 0.88,  y: 0.74, s: 1, b: 88 },
  dash:   { x: 0.955, y: 0.44, s: 1, b: 64 },
  reload: { x: 0.75,  y: 0.86, s: 1, b: 50 },
  kit:    { x: 0.86,  y: 0.3,  s: 1, b: 50 },
  fire2:  { x: 0.2,   y: 0.5,  s: 1, b: 58 },
};
const GUIDE_DESK = []; // filled from the language file
const GUIDE_TOUCH = [];
