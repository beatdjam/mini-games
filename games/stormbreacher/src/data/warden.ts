// The heavy command mech's own values (SB-1850): the phases, telegraphs, the charge, the shoulder mortars, the armour
// and the falling. The kind's base values (health, height, hit radius, nav radius, walk, range, one burst shot's damage)
// live in ENEMIES.warden; the burst's damage lives there and nowhere else. Every value here is provisional and is meant
// to be settled from #view-warden.
export const WARDEN_TUNE = {
  turnRate: 1.2, // rad/s; it turns slowly, so going round it pays
  walkOutSec: 3, // s; it comes out of the gate and does not shoot for this long
  phase2At: 0.5, // the share of its health at which the shoulder mortars start
  burst: {
    shots: 3, // the shots of one burst
    interval: 0.18, // s from one shot of the burst to the next
  },
  burstTelegraph: 0.6, // s the shoulder light shines before the first shot
  burstRest: 1.5, // s it waits after a burst before it chooses again
  charge: {
    telegraph: 0.8, // s it crouches before it runs
    distance: 25, // m the run may carry it
    speed: 16, // m/s while it runs
    damage: 25, // the armour a ram takes off a mech the ram takes it once per charge (game.ts)
    push: 3, // m a ram pushes a mech aside sideways, out of the way of the run
    stagger: 2, // s it is exposed after a wall stops the run
  },
  mortar: {
    count: 3, // the shells of one volley
    radius: 5, // m the blast of one shell covers
    warn: 2.5, // s from the warning ring to the landing
    damage: 20, // the armour a shell takes off a mech
    spread: 8, // m the shells fall around the mech
  },
  mortarEvery: 7, // s from one special (a charge, or a mortar in the second phase) to the next
  frontMul: 0.25, // the armour plate: a shot from the front takes a quarter
  sideMul: 1, // the flank: a shot takes it whole
  backMul: 2, // the radiator plate on its back: a shot takes double (and while it is exposed)
  dieSec: 3, // s it smokes before the blast
  addsAt: 0.5, // the share of its health at which it calls the two assaults, once
  // The look's proportions (m). The body is built from parts in view/wardenModel.ts, 6 m high at the unit its shapes are
  // written in. The charge band is the red strip the view draws ahead of it.
  look: {
    bandWidth: 6,
  },
};
