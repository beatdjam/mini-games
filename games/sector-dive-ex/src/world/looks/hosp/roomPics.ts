import type { Paint } from '../paint.ts';
import { HOSP_KINDS, panels } from './shared.ts';
import { EXAM_FRONTS, EXAM_PICS, WARD_FRONTS, WARD_PICS } from './wardPics.ts';
import { LAB_FRONTS, LAB_PICS, PHARMACY_FRONTS, PHARMACY_PICS } from './techPics.ts';
import { LINEN_FRONTS, LINEN_PICS, WAITING_FRONTS, WAITING_PICS } from './storePics.ts';
// The pictures of the hospital's rooms, kind by kind (the order of HOSP_DEPARTMENTS in i18n/signs.ts): the pictures
// inside a room, the fronts where it meets the corridor, and the plain wall of the kind (the rest of its walls).
export const ROOM_PICS: Paint[][] = [WARD_PICS, EXAM_PICS, LAB_PICS, PHARMACY_PICS, LINEN_PICS, WAITING_PICS];
export const ROOM_FRONTS: Paint[][] = [
  WARD_FRONTS,
  EXAM_FRONTS,
  LAB_FRONTS,
  PHARMACY_FRONTS,
  LINEN_FRONTS,
  WAITING_FRONTS,
];
// the plain wall of a kind
export const ROOM_GROUNDS: Paint[] = Array.from(
  { length: HOSP_KINDS },
  (_, kind): Paint =>
    (g, rand) =>
      panels(g, rand, kind),
);
