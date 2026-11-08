// Which way the imports may run (npm run deps, in npm run lint): the engine is used by the games, so it must not
// know them; the games go into the engine only through its public entries (engine/src/<folder>/index.ts), so the
// engine's files can be split without touching the games; core is the engine's lowest layer; and a cycle runs its
// modules in an order nobody can see.
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
