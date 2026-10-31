// Which way the imports may run (npm run deps, in npm run lint): the engine is used by the games, so it must not
// know them, and a cycle runs its modules in an order nobody can see. The rest of the rules (the public way in,
// the layers) wait for the engine's public API and the layers.
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
