// The colours the field, the map's ground and the sky share, so the same one is not written in two files.
import type { DroidMaterial } from './droids.ts';
import type { ProtoMaterial, ProtoPaletteId } from './mechProto.ts';

export const SAND_COLOR = 0xc2a878; // the ground's sand
export const SKY_COLOR = 0x9db8c6; // the sky and the fog
export const SEA_COLOR = 0x3d5560; // the sea's surface: a dark grey-green under a cloudy sky, darker than the fog it fades into

// The beach's surfaces (SB-1360, 仮): the dry sand away from the water, the wet sand kept in the sea's reach, the rust
// of the hedgehogs and the charred iron of the wrecks, and the foam the sea leaves on the shore. New names because the
// look is provisional and will be tuned from the shots. The rust and the foam are kept darker than white so the overcast
// light does not clip them: the hedgehogs read as wet iron and the surf as a thin line, not as a glowing band.
export const DRY_SAND_COLOR = 0xc9b184;
export const WET_SAND_COLOR = 0x6f6250;
export const RUST_COLOR = 0x4a3f38;
export const BURNT_COLOR = 0x3a3733;
export const FOAM_COLOR = 0x9aa5a3;

// The cloudy sky's top, the darkest part of the gradient behind the fog (仮). The bottom is the fog's own colour, so the
// two always meet.
export const SKY_TOP_COLOR = 0x5b6a74;

// The detail on the beach's defence works (SB-1470, 仮). These are vertex colours that multiply the kind's own colour
// and the grey surface picture, so they read as darker or warmer patches on the same concrete and rust.
export const DEFENSE_COLOR = {
  hedgehogPlate: 0xd6c8b4, // the steel plate welded over a hedgehog's crossing
  bunkerSlit: 0x1b1a18, // the dark inside of a bunker's embrasure
  bunkerBag: 0xa89a7c, // the sandbags on a bunker's roof
  bunkerGrass: 0x66704f, // the grass growing on a bunker's roof
  bunkerDoor: 0x232320, // the dark of a bunker's side entrance
  rebar: 0xb07048, // the exposed reinforcing bar in a chipped corner
  crack: 0x3a3833, // a crack across a concrete face
  pillboxPlinth: 0xb8b4ac, // the footing a pillbox stands on, darker than its walls
  pillboxRoof: 0xe0dcd6, // a pillbox's roof slab, a little lighter than its walls
  pillboxNet: 0x6f7a4e, // the camouflage net over a pillbox's roof
  pillboxStain: 0x8a8680, // a rain streak or a patch of soot on a concrete face
  pillboxMark: 0xd2432f, // the red of the target mark: the striped roof lip and the band over the embrasure (SB-2050 v2)
  pillboxMarkWhite: 0xe6e1d6, // the white between the red stripes
  pillboxSteel: 0x34363a, // the embrasure's frame, visor, rivets and gun, and the doorway's door
  pillboxEarth: 0xb5a47c, // a sandbag's earth; each bag shades this a little
  pillboxNetDark: 0x4a5236, // the darker patches of the camouflage net
  pillboxNetBrown: 0x6d5e41, // the brown patches of the camouflage net
  pillboxSoot: 0x2c2a27, // the soot over the embrasure
};

// The fortress's walls, the sea-wall nest and its shutter (SB-2052). On the wall and the nest these are multipliers of
// the concrete's own grey (they cannot make it lighter), like the pillbox's; the shutter's are absolute colours.
export const FORT_COLOR = {
  groove: 0x4e4c47, // a pour line, a formwork joint
  tieHole: 0x2b2926, // the hole a formwork tie left
  dark: 0x161513, // the dark inside a loophole or a hatch
  murk: 0x2c2a27, // the soot, and the inside of a loophole near the face
  gloom: 0x45423d, // the inside of a loophole's sides
  steel: 0x34363a, // frames, rails, rungs, the gun and its mount
  steelLight: 0x5a5e64, // the lit edge of steel, rivets and bolts
  armour: 0x868a90, // the nest's armour plates
  armourLight: 0xa4a8ae, // a plate's bevel and the sloped faces
  scarRim: 0x4a4742, // the ragged patch round a shell scar
  streakLight: 0xe8e4dc, // a rain streak that has washed the wall clean
  footBand: 0x77736c, // the dark band along a wall's foot, where the ground splashes up
  rust: 0x8a5a3c, // rust running down from a steel fitting
  lens: 0xfff2c8, // a lamp's glass
  hazardYellow: 0xdcae2a, // the warning stripes on a buttress's foot and on the shutter
  hazardBlack: 0x1d1c1a, // the black between them
  brass: 0xc9a24a, // a belt's cartridges and the casings on the deck
  ammoBox: 0x56603f, // an ammunition box
  shutterBeam: 0x3f444a, // the shutter's beams and guides
  shutterRivet: 0x7a8088, // the shutter's rivets
  shutterDark: 0x23262a, // the shutter's gaps and its drum's shadow
};

// The landing craft (SB-1470, 仮): its hull and deck, and the seams, hinges, chains, windows and bow plate that dress
// them. These are absolute colours on the craft's one vertex-coloured material (not multipliers).
export const CRAFT_COLOR = {
  hull: 0x6b7378,
  deck: 0x484d50,
  seam: 0x565e63,
  hinge: 0x2d3235,
  chain: 0x6e777c,
  window: 0x18252b,
  bow: 0x7d858a,
};

// The overcast light over the beach (SB-1440, 仮): a pale, cool sky above and a dark, warm ground below, so a face that
// turns away from the sun falls off instead of being filled in from every side. The low sun is warm, like a sun near
// the horizon behind the cloud.
export const LIGHT_SKY_COLOR = 0xd3dfe3;
export const LIGHT_GROUND_COLOR = 0x2c2823;
export const LIGHT_SUN_COLOR = 0xffe0b6;

// The air over the beach (SB-1440, 仮): the smoke of the drifting columns from its first puff to its last, the low haze
// lying over the sand, and the fire on the wrecks (its bright core, its orange edge and the warm pool it casts on the
// ground). The smoke lifts towards the sky's own colour as it thins, so a column reads as air, not as a black box.
export const PLUME_SMOKE_COLOR = 0x2a2724;
export const PLUME_FADE_COLOR = 0xa6a9a4;
export const HAZE_COLOR = 0xb0aea4;
export const FIRE_CORE_COLOR = 0xffe2a0;
export const FIRE_FLAME_COLOR = 0xff7a28;
export const FIRE_GLOW_COLOR = 0xff8a3c;

// The HUD's colours, shared by the mock (#view-hud) and the game's sortie. The values come from the mock as they were;
// the shades are 仮 and will be tuned later.
export const HUD_COLOR = {
  text: '#e8eef2', // the text (仮)
  bar: '#54e8ff', // the gauges' fill (仮)
  amber: '#ffcf6a', // the objective's label and the radar's marks (仮)
  warn: '#ff5a4a', // the radar's enemy marks (仮)
  panel: 'rgba(6, 12, 18, 0.6)', // behind a bar and the radar (仮)
  ring: 'rgba(244, 247, 250, 0.55)', // the aim circle (仮)
  dot: '#f4f7fa', // the aim dot (仮)
  lock: '#ff9d3d', // the lock frame round the target the soft FCS pulls toward (仮)
  track: 'rgba(84, 232, 255, 0.2)', // the empty part of an arc (仮)
  markShadow: 'rgba(0, 0, 0, 0.55)', // the thin dark edge round an arc or bar, so it reads over bright sand (SB-2159, 仮)
  // the armour's three shades as it goes down (layouts D-F, SB-2159); the boost keeps `bar`.
  armorHigh: '#7fe3c0',
  armorMid: '#ffcf6a',
  armorLow: '#ff5a4a',
  // the front gauge's three fills (SB-2270, 仮): the enemy's land darkest, a secured sector amber between, a stable one
  // the gauges' cyan. The three are chosen to read apart in brightness and not only in hue.
  gaugeEnemy: '#4a3c3b',
  gaugeSecured: '#c08a48',
  gaugeStable: '#54e8ff',
  // the sector boundaries (SB-2281, 仮): a little brighter than the fills, so a line still reads where it sits against
  // the dark enemy land
  gaugeBoundary: '#d8e2e8',
};

// The enemies wear the enemy row of PROTO_PALETTES (SB-2083): dark grey armour, near-black joints, red accents and red
// lamps. What an enemy that is down is multiplied by (the instance colour over the baked colours).
export const ENEMY_DOWN_TINT = 0x574d46;
// The mid boss (SB-1850, built from parts by SB-2049) is painted into its shape in the boss row of PROTO_PALETTES, lightened
// a little (as SB-2083 lightened the enemy row): the row's near-black armour lost its plates under the beach's light. Its
// lamps and vents are white in the shape and take these colours per copy: the lamps glow red and warm to
// PILLBOX_WARN_COLOR while it warns of a burst, the radiator's vents smoulder and burn open while it is exposed, and
// both go dark when it is down.
export const WARDEN_PALETTE = { armor: 0x474e57, frame: 0x22262b, accent: 0xb3262b, mark: 0xd9a63a };
export const WARDEN_LAMP_COLOR = 0xff2a22;
export const WARDEN_VENT_IDLE_COLOR = 0x7a1812;
export const WARDEN_VENT_OPEN_COLOR = 0xffb25a;
export const WARDEN_LIGHT_OFF_COLOR = 0x241614;
export const ENEMY_BULLET_COLOR = 0xff6a4a;

// The machine-gun nest's model (SB-1981, provisional): sandbags of a dark grey-green, far from the dry sand and the hedgehogs'
// rust, the gun and the shield in dark greys with bright edges, a small red-orange mark, the gunner's armour, the light
// of its sensor and the flash of its muzzle. The dark colours are kept above black so the overcast light still shapes
// them; the bright ones below white so it does not clip them.
export const NEST_SAND_COLOR = 0x526044;
export const NEST_MOUNT_COLOR = 0x2f3437;
export const NEST_BARREL_COLOR = 0x3a4146;
export const NEST_SHIELD_COLOR = 0x424a4f;
export const NEST_TRIM_COLOR = 0xb9c2c6; // the bright edges of the gun and the shield
export const NEST_MARK_COLOR = 0xd4552b; // the small red-orange mark
export const NEST_DROID_COLOR = 0x6f7d84;
export const NEST_SENSOR_COLOR = 0x6fe0f2;
export const NEST_FLASH_COLOR = 0xffcf6a;

// The hazards on the field (仮): the ring of a coming shell from the moment it is warned to the moment it lands, and a
// mine's disc.
export const SHELL_WARN_COLOR = 0x5a1a14;
export const SHELL_LAND_COLOR = 0xff3a22;
export const MINE_COLOR = 0x3a3d2e;

// The boss (SB-200, 仮): the armour plate before the magazine, the flash of a main gun firing at the sea and the line of
// its shot.
export const SHUTTER_COLOR = 0x5b6168;
export const SEA_FLASH_COLOR = 0xfff1b0;
export const SEA_TRACER_COLOR = 0xffb347;

// The light at a pillbox's muzzle while it warns of a burst, and the smoke that marks a suppressed muzzle (仮; SB-2015).
export const PILLBOX_WARN_COLOR = 0xffd890;
export const PILLBOX_SMOKE_COLOR = 0x4b4743;

// The blast points on the hedgehog lines and the charges planted on them (SB-1500, 仮): the ring the player stands in,
// and the box that blinks as its fuse burns.
export const BLAST_POINT_COLOR = 0xffb347;
export const CHARGE_COLOR = 0xffe066;

// The sparks of a shot a pillbox's front turns away (仮). A little warmer than SEA_FLASH_COLOR, so the two do not read
// as the same flash.
export const PILLBOX_DEFLECT_COLOR = 0xffe080;

// The sparks a mech's fist throws off an enemy's armour (仮). Warm metal, close to the pillbox's deflect sparks but a
// little deeper, so a blow reads apart from a ricochet.
export const MELEE_SPARK_COLOR = 0xffb84d;

// The marks and sparks of the infantry's being under fire (SB-2272, 仮): the mark over a soldier that is aimed at, the
// same mark once it has been hurt (the blend goes to this red as its health falls), and the spark of a hit.
export const FEEDBACK_COLOR = {
  mark: 0xffcf6a,
  markHit: 0xff5a4a,
  spark: 0xffa04a,
};

// The look of a shot (SB-1450, 仮): the muzzle's flash, the tracer's band and the sparks and smoke of an impact. The
// mech's are yellow-white and the enemies' red-orange, so which way a shot goes reads at a glance.
export const GUNFIRE_COLOR = {
  mechMuzzle: 0xfffbe2, // the mech's weapons' flash
  enemyMuzzle: 0xff8f4e, // the enemies', the pillboxes' and the battery's flash
  mechTracer: 0xfff3bd, // the mech's tracer band
  enemyTracer: 0xff7a42, // the enemies' tracer band
  surfaceSpark: 0xffc978, // a spark off sand or a prop
  metalSpark: 0xfff2cf, // a spark off a target, an enemy or the mech's armour
  smoke: 0x736a5c, // a fresh puff of an impact
  smokeFade: 0x9a9287, // that puff just before it goes
};

// The friendly side's painted band and number (#551), a pale green-teal clear of M1's gold and of the enemies' reds and
// dark olive. It goes on the shoulder band and the number alone; the machine itself wears its type's colours (SB-2082).
// A little deeper (SB-2082) so it still reads as teal under the beach's bright sun rather than washing out to white.
export const PROTO_MARK_COLOR = 0x2fa890;
// The mech's boost flame (SB-130, 仮): a small bright box behind the back part.
export const MECH_FLAME_COLOR = 0xffd27a;

// The prototype's metal (SB-1468, second pass SB-1469, 仮): a pale steel armour over a near-black frame, an orange
// accent, and a cool light for the seams, the windows and the lamps. One hex per material name of data/mechProto.ts.
// SB-2080 puts the colours in a table by faction and type: SB-2081 makes the player the three views' white armour,
// near-black joints, yellow bands and teal sensor; SB-2082 gives the sniper olive/navy/orange and the scout
// blue-grey/white/yellow, and puts the friendly side's green-teal band and number (#551, PROTO_MARK_COLOR, deepened so it
// reads under the sun) on the allies of either type. The enemy is dark grey with red lamps, its
// row lightened a little in SB-2083 so the plates read under the beach's light. A kit picks one row
// (data/mechProto.ts's PROTO_KITS) and the shapes never carry a colour.
export const PROTO_PALETTES: Record<ProtoPaletteId, Record<ProtoMaterial, number>> = {
  player: { armor: 0xd2d7d5, frame: 0x202528, accent: 0xe8b23c, glow: 0x43ddd0, mark: PROTO_MARK_COLOR },
  ally: { armor: 0xd2dad8, frame: 0x252b2e, accent: 0xe8b43a, glow: 0xffcf5a, mark: PROTO_MARK_COLOR },
  sniper: { armor: 0x4c5436, frame: 0x222931, accent: 0xcf6d24, glow: 0x9fdfe8, mark: PROTO_MARK_COLOR },
  scout: { armor: 0x4c6270, frame: 0x2d373e, accent: 0xe8e4d8, glow: 0xffcf3a, mark: PROTO_MARK_COLOR },
  // SB-2083: a little lighter than SB-2080's row, so the dark machine still shows its plates under the beach's light
  enemy: { armor: 0x5a6067, frame: 0x2b3035, accent: 0xa52e33, glow: 0xff3b36, mark: 0xa52e33 },
  boss: { armor: 0x24262a, frame: 0x141618, accent: 0xa01e22, glow: 0xff1a1a, mark: 0xa01e22 },
  // SB-2049: the mid boss, the boss's black lightened as the enemy row was, with the gold of the command mark
  warden: { ...WARDEN_PALETTE, glow: 0xff2a22 },
  allyWreck: { armor: 0x2e3234, frame: 0x1e2022, accent: 0x35332c, glow: 0x1e2022, mark: 0x35332c },
};

// The beach's infantry droids (SB-1745, second pass SB-1747, three views SB-2084, near form SB-2085): the allies' bright
// grey armour over dark joints, their yellow accents and teal lights. SB-2084 had taken them for the enemy's small machine
// and given them its dark grey and red; SB-2085 puts them back on the friendly side, near the player's palette
// (PROTO_PALETTES.player) so the beach's own troops read as part of the same army at a glance on the sand.
export const DROID_COLOR: Record<DroidMaterial, number> = {
  armor: 0xb4bcb8,
  frame: 0x2a3034,
  accent: 0xe8b43a,
  glow: 0x43ddd0,
};

// The light the confirmation view puts around the prototype (SB-1468, second pass SB-1469, 仮): a warm sun that casts
// its shadow, a cool edge light along its back, a soft fill on the dark side, and the room the metal reflects.
export const MECH_PROTO_LIGHT_COLOR = {
  key: 0xfff3df,
  rim: 0x8fc8ff,
  fill: 0xd8e8ff,
};

// The paint under the prototype's colours (SB-1469, 仮): the armour and the frame keep their tone in the picture, so the
// pale armour does not blow out to white in the sun. The grime, the rust and the stencil stay MECH_PAINT_COLOR's.
export const MECH_PROTO_PAINT_COLOR = {
  armorBase: '176,182,184', // the armour's mid tone under the grime
  frameBase: '158,164,166', // the frame's worn metal
  accentBase: '238,234,226', // the accent's stripes, so the orange keeps its colour
};

// The paint on a mech's boxes (SB-1460, 仮): the strokes of view/mechSurfaces.ts, as the canvas's "r,g,b" strings. The
// picture multiplies the palette's hex, so these stay near white and darken the hue rather than replacing it. Chosen
// apart from the field's and the HUD's colours so the grime does not read as an effect.
export const MECH_PAINT_COLOR = {
  baseLight: '234,231,222', // the armour's paint under the grime
  baseMid: '212,209,200', // the frame and the weapon's worn metal
  grimeLight: '244,240,228', // a dusty patch
  grimeDark: '46,44,38', // soot and dirt running down a plate
  rust: '102,72,48', // rust on the frame's joints
  scrape: '252,250,242', // a scraped edge showing bare metal
  stencil: '34,32,28', // the number stencilled on the armour
  stripeLight: '246,242,228', // a warning stripe's light band
  stripeDark: '38,36,30', // its dark band
  sensorBase: '44,42,40', // the head's housing around the window
  sensorWindow: '252,250,244', // the lit sensor window
};

// An explosion (SB-1340, 仮): the flash of each kind, the smoke that turns from black to grey, the debris, and the sand
// or water a blast lifts from the ground or the sea.
export const BOOM_COLOR = {
  fire: 0xff6d21, // a small blast's flash
  fireLarge: 0xff8f31, // a target's, a mine's or a mortar shell's
  fireCraft: 0xffa646, // a landing craft's
  fireWater: 0x8fd2e6, // a shell falling into the sea
  smoke: 0x191715, // a fresh puff of the column
  smokeFade: 0x6d6a66, // a puff just before it goes
  debris: 0x584635, // the pieces of earth and metal thrown out
  sand: 0xb39262, // the sand a blast lifts from the beach
  water: 0x84bccb, // the water a shell lifts from the sea
  spray: 0xd9edf0, // the drops thrown with it
};

// The briefing's map (SB-310, 仮): the land, the sea, the three kinds of ground props and the marks. The marks that stand
// for a side take the HUD's colours (the radar's enemy and the bars' cyan).
export const BRIEFING_COLOR = {
  land: '#6f6a54', // the sand seen from above
  sea: '#27404f', // the sea
  hedgehog: '#9a9680', // a hedgehog's dot
  wall: '#d8d2b8', // a seawall piece's dot
  cliff: '#4a4538', // a cliff's dot
  enemy: HUD_COLOR.warn, // the battery, the pillboxes, the soldiers
  depot: HUD_COLOR.amber, // the depot
  wave1: HUD_COLOR.bar, // the first wave's arrow
  wave2: '#7fb4d6', // the second wave's arrow, paler than the first
};
