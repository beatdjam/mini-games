// The enemies' looks (SB-1480, rebuilt on the mech kit by SB-2083): which kit of data/mechProto.ts each role wears, and
// how far from the camera it keeps its full parts. The three views' machines give the roles their shape: the rifleman the
// small machine with the three eyes and the rifle, the gunner the one with a four-tube pod on each shoulder and the
// gatling, and the heavy the medium machine, wider in the chest and shoulders, with a six-tube pod and the rifle.
import type { SoldierKind } from './enemies.ts';
import type { ProtoEnemyKitId } from './mechProto.ts';

export const ENEMY_KITS: Record<SoldierKind, ProtoEnemyKitId> = {
  grunt: 'enemyRifle',
  assault: 'enemyGunner',
  heavy: 'enemyHeavy',
};

// The distance (m) from the camera past which a role is drawn from the simplified shape: the smaller machines lose their
// full parts sooner, the heavy, which is larger, keeps them longer (SB-2083).
export const ENEMY_DETAIL_DISTANCE: Record<SoldierKind, number> = {
  grunt: 45,
  assault: 40,
  heavy: 55,
};
