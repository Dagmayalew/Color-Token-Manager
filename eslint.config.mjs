// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * ESLint flat config for the Color Token Manager VS Code extension.
 *
 * Lints both production code (src/**) and test code (test/**) with the
 * recommended TypeScript rules, then turns off any rules that would
 * conflict with Prettier so the two never fight each other.
 */
export default tseslint.config(
  // Global ignores — apply to every config below.
  {
    ignores: [
      'dist/**',
      'out-test/**',
      'node_modules/**',
      'coverage/**',
      '*.vsix',
      '.vscode-test/**',
    ],
  },

  // Base recommended rules.
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide rule tweaks.
  {
    rules: {
      // The extension is CJS-bundled and runs in a Node-like host; relax
      // a few rules that are noisy in this layout.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Override for test files: the existing test suite intentionally
  // throws on assertions and the stubs expose a loose API surface.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['test/stubs/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['test/**/*.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // MUST come last — disables ESLint rules that conflict with Prettier.
  eslintConfigPrettier,
);
