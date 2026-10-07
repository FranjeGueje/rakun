// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { importX } from 'eslint-plugin-import-x'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  prettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // FIXME: All of these rules should be errors instead
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-for-in-array': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false }
      ],
      '@typescript-eslint/unbound-method': 'error',
      // False positive: JSON5 is used here as a default-export singleton that
      // also happens to expose named exports (`JSON5.parse`). That's the
      // intended usage, not an ESM/CJS interop mistake.
      'import-x/no-named-as-default-member': 'off'
    },

    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: [
      'src/backend/storeManagers/*/games.ts',
      'src/backend/storeManagers/*/library.ts'
    ],
    rules: {
      // These classes implement the `Game`/`LibraryManager` interfaces, which
      // declare async methods (`Promise<T>` returns) for every runner
      // uniformly. Some runners implement a given method as a synchronous
      // stub (e.g. Zoom, for features it doesn't support) -- `async` is
      // still required to satisfy the interface, not a mistake.
      '@typescript-eslint/require-await': 'off'
    }
  },
  {
    files: ['**/__tests__/**/*.ts', '**/__mocks__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Mocks and fixtures are loosely typed on purpose
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/require-await': 'off',
      // False positive: `expect(obj.method).toHaveBeenCalledWith(...)` passes
      // an unbound method reference, but Jest never calls it as `obj.method()`
      // -- it only inspects the mock, so there's no `this` to lose.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    ignores: [
      'build/',
      'dist/',
      'coverage/',
      '**/*.js',
      'eslint.config.mjs',
      '.github/scripts/'
    ]
  }
)
