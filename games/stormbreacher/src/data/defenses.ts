// The shapes of the beach's defence works and the landing craft (SB-1470, 仮). Every value is a length in metres or a
// count. The defence works' values are the lengths before fitBox stretches the shape to PROP_SIZE; the craft's are its
// real metres (data/craft.ts). The shapes are built from these numbers in view/outdoor.ts and view/shore.ts; the hit boxes
// stay PROP_SIZE and TARGET_SIZE, so the detail only dresses the box's outside. The numbers are provisional and are
// turned in #view-props.
export const DEFENSE_DETAIL = {
  hedgehog: {
    beam: 0.35, // the square section of a beam (m)
    web: 0.13, // the thickness of the L's two plates (m)
    length: 3, // a beam's length (m)
    tilt: 0.7, // how far a beam leans from upright (rad)
    plate: 0.62, // the plate welded over the crossing (m)
    plateThick: 0.09, // the plate's thickness (m)
  },
  bunker: {
    bevel: 0.55, // how far each edge of the concrete mass is chamfered (m)
    bodyW: 9, // the body before fit to PROP_SIZE (m)
    bodyH: 2.4,
    bodyD: 7,
    roofW: 10, // the roof slab (m)
    roofH: 0.8,
    roofD: 8,
    slitWidth: 4.6, // the front embrasure (m)
    slitHeight: 0.8,
    slitDepth: 0.5,
    slitInset: 0.06, // how far the dark of the slit sits back from its frame (m)
    slitPost: 0.35, // the post at each side of the slit (m)
    slitBar: 0.25, // the sill and lintel of the slit (m)
    frameProud: 0.2, // how far the slit's frame stands out from the wall (m)
    bags: 6, // the sandbags on the roof
    bagW: 0.95,
    bagH: 0.42,
    bagD: 0.65,
    bagTurn: 0.12, // how far alternate bags are turned (rad)
    grass: 7, // the tufts of grass on the roof
    grassW: 0.16,
    grassH: 0.55,
    grassTurn: 0.45, // how far a tuft is turned from the next (rad)
    doorW: 1.6, // the side entrance (m)
    doorH: 1.9,
    doorD: 0.5,
  },
  block: {
    bodyW: 3, // the concrete block before fit to PROP_SIZE (m)
    bodyH: 2,
    bodyD: 4,
    chipW: 0.9, // the corner broken away at the top (m)
    chipH: 0.7,
    rebar: 0.09, // the exposed bar's thickness (m)
    rebarLength: 1.1,
    crack: 0.07, // the crack's width (m)
    crackLength: 1.4,
    crackX: -0.35, // where the crack sits across the face (m)
    crackY: 0.95, // its middle's height up the block (m)
    crackTurn: 0.32, // how far the crack leans (rad)
    crack2X: 0.3, // the short second crack (m)
    crack2Y: 1.3,
    crack2Turn: -0.5,
  },
  lowWall: {
    bodyW: 6, // the wall before fit to PROP_SIZE (m)
    bodyH: 0.85,
    bodyD: 1,
    chipW: 0.9, // the corner broken away at one end (m)
    chipH: 0.35,
    rebar: 0.08,
    rebarLength: 0.9,
    crack: 0.06,
    crackLength: 1.1,
    crackX: -0.6, // where the crack sits across the face (m)
    crackYShare: 0.55, // its middle's height as a share of the wall's (m)
    crackTurn: 0.28, // how far the crack leans (rad)
  },
  craft: {
    seamWidth: 0.06, // the raised plate seams on the hull's side (m)
    seamHeight: 1.2,
    seamGap: 2.2, // the seam spacing along the hull (m)
    hingeW: 0.3, // the ramp's hinges (m)
    hingeH: 0.22,
    hingeD: 0.3,
    chain: 0.07, // the thickness of the ramp's chains (m)
    chainLength: 1.6,
    windowW: 0.7, // the wheelhouse windows (m)
    windowH: 0.45,
    windowD: 0.08,
    windowY: 2.1, // how high the wheelhouse's windows sit above the hull's top (m)
    windowSide: 0.04, // how far they stand proud of the wheelhouse's sides (m)
    windowSideZ: 0.6, // how far in front of the wheelhouse's middle the side windows sit (m)
    bowWidth: 6.4, // the wave deflector at the bow (m)
    bowHeight: 0.45,
    bowDepth: 1.1,
    bowTilt: 0.5, // how far the deflector leans back (rad)
    ribWidth: 6, // the ribs across the ramp (m)
    ribHeight: 0.06,
    ribDepth: 0.12,
    ribs: 5, // how many ribs the ramp has
    hingeX: 2.2, // how far the ramp's hinges sit from its middle (m)
    hingeY: 0.25, // how high the hinges sit above the plate (m)
    chainY: 0.35, // how high the chains sit above it (m)
  },
};
