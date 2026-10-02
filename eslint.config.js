// ESLint: the rules about how values change (npm run lint; STYLE.md 1). Formatting is Prettier's, the other style
// rules are tools/check_style.js.
import tseslint from 'typescript-eslint';

const SAVE_MSG = 'save is changed only in src/core/ (progress.ts): add or use a named operation there';
// a write to save.a, save.a.b or save.a.b.c (assignment, ++ / --, delete), a mutating array call on save.a or save.a.b,
// or Object.assign(save, ...)
const SAVE_PATHS = ['object.name', 'object.object.name', 'object.object.object.name'];
const SAVE_WRITES = [
  ...SAVE_PATHS.flatMap(path => [
    `AssignmentExpression[left.${path}='save']`,
    `UpdateExpression[argument.${path}='save']`,
    `UnaryExpression[operator='delete'][argument.${path}='save']`,
  ]),
  ...SAVE_PATHS.slice(1).map(
    path =>
      `CallExpression[callee.${path}='save'][callee.property.name=/^(push|pop|shift|unshift|splice|sort|reverse|fill)$/]`,
  ),
  "CallExpression[callee.object.name='Object'][callee.property.name='assign'][arguments.0.name='save']",
];

export default tseslint.config(
  { ignores: ['dist/', 'dist-test/', 'test-results/', '.vitest/', 'node_modules/', 'public/', '.claude/'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'prefer-const': 'error', // a value that is never reassigned is a const
      'no-var': 'error',
      'no-multi-assign': 'error', // one assignment per statement: a = b = 0 hides the second change
      'no-param-reassign': 'error', // a parameter keeps the value it was given (its fields may change)
    },
  },
  {
    // the save is changed only in src/core/ (progress.ts); everywhere else it is read
    files: ['games/*/src/**/*.ts'],
    ignores: ['games/*/src/core/**', 'games/*/src/dev/**'],
    rules: {
      'no-restricted-syntax': ['error', ...SAVE_WRITES.map(selector => ({ selector, message: SAVE_MSG }))],
    },
  },
);
