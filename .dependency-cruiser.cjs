// Which way the imports may run (npm run deps, in npm run lint): the engine is used by the games, so it must not
// know them; the games go into the engine only through its public entries (engine/src/<folder>/index.ts), so the
// engine's files can be split without touching the games; core is the engine's lowest layer; and a cycle runs its
// modules in an order nobody can see.

// STORMBREACHER's pieces that may move into the engine later (D-23). They take every value as an argument and read
// nothing of the game, so they can be lifted out as they are. Add a file here when it is ready.
const SB_PORTABLE = '^games/stormbreacher/src/(logic/(collide|mech|fcs|fire)|view/camera|data/tuneTypes)\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'engine-does-not-import-games',
      severity: 'error',
      comment: 'engine is used by the games: it must not know them',
      from: { path: '^engine/src' },
      to: { path: '^games/' },
    },
    {
      name: 'games-import-engine-entry',
      severity: 'error',
      comment: 'the games use the engine only through its public entries',
      from: { path: '^games/' },
      to: { path: '^engine/src/', pathNot: '^engine/src/(core|render|world|ui|audio|trailer)/index\\.ts$' },
    },
    {
      name: 'engine-core-is-bottom',
      severity: 'error',
      comment: 'core is the lowest layer of the engine: it must not know the others',
      from: { path: '^engine/src/core/' },
      to: { path: '^engine/src/(render|world|ui|audio|trailer)/' },
    },
    // STORMBREACHER's layers (only that game: the other games have a data/ folder too)
    {
      name: 'sb-logic-data-no-render',
      severity: 'error',
      comment: 'stormbreacher: logic and data run without a page, so they must not read three or the engine renderers',
      from: { path: '^games/stormbreacher/src/(logic|data)/' },
      // three without ^: in a work tree whose node_modules links to the main checkout's, it resolves to ../../node_modules
      to: { path: ['(^|/)node_modules/three/', '^engine/src/(render|ui|audio|trailer)/'] },
    },
    {
      name: 'sb-logic-data-inward',
      severity: 'error',
      comment: 'stormbreacher: logic and data are the inner layers; the view, the app, the dev hooks and i18n use them',
      from: { path: '^games/stormbreacher/src/(logic|data)/' },
      to: { path: '^games/stormbreacher/src/(view|app|dev|i18n)/' },
    },
    {
      name: 'sb-data-is-data',
      severity: 'error',
      comment: 'stormbreacher: data holds definitions only, so it must not read logic',
      from: { path: '^games/stormbreacher/src/data/' },
      to: { path: '^games/stormbreacher/src/logic/' },
    },
    {
      name: 'sb-view-reads-only',
      severity: 'error',
      comment: 'stormbreacher: the view reads state and draws it; the app and the dev hooks drive it',
      from: { path: '^games/stormbreacher/src/view/' },
      to: { path: '^games/stormbreacher/src/(app|dev)/' },
    },
    {
      name: 'sb-app-no-dev',
      severity: 'error',
      comment: 'stormbreacher: the game itself does not read the dev hooks, so the public page keeps them out',
      from: { path: '^games/stormbreacher/src/app/' },
      to: { path: '^games/stormbreacher/src/dev/' },
    },
    {
      name: 'sb-portable-no-game',
      severity: 'error',
      comment:
        'stormbreacher: the pieces that may move into the engine read nothing of the game; values come in as arguments',
      from: { path: SB_PORTABLE },
      to: { path: '^games/', pathNot: SB_PORTABLE },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'a cycle runs its modules in an order nobody can see',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // `@engine/*` in the games: resolve it the way tsconfig does, or the edges into the engine are lost
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
