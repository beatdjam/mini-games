// ESLint: the rules about how values change (npm run lint; STYLE.md 1). Formatting is Prettier's, the other style
// rules are tools/check_style.js.
import tseslint from 'typescript-eslint';

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
);
