import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  // Ignore CommonJS config files and utility files that legitimately use console
  {
    ignores: [
      'babel.config.js',
      'commitlint.config.js',
      'jest.config.js',
      'metro.config.js',
      'jest.setup.js',
      'plugins/**/*.js',
      'src/utils/logger.ts', // Logger utility legitimately uses console
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-console': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-console': 'warn',
    },
  },
  {
    // Authentication inputs and provider errors may contain OTPs or phone numbers.
    // Enforce this boundary in CI, including development-only logging.
    files: ['app/login.tsx', 'app/otp.tsx', 'src/services/pdf-service.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: [
      'src/features/grn/components/HorizontalItemForm.tsx',
      'src/features/grn/components/item-form/ItemSearchField.tsx',
      'src/features/grn/components/CustomerAutocomplete.tsx',
      'src/features/grn/services/grnFormService.ts',
      'src/services/search-service.ts',
      'src/services/user-core-service.ts',
      'src/services/vehicle-suggestion-service.ts',
      'src/services/autocomplete-service.ts',
      'src/services/item-search-service.ts',
      'src/services/order-service.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/supabaseConfig'],
          importNames: ['getSupabaseClient', 'getSupabaseRPCClient'],
          message: 'Business data requires getAuthenticatedClient and the custom OTP session.',
        }],
      }],
    },
  },
  {
    files: ['src/config/supabaseConfig.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='console'][arguments.1]",
          message:
            'Authentication diagnostics must not include credentials, input or response payloads.',
        },
        {
          selector:
            "CallExpression[callee.object.name='console'][arguments.0.type!='Literal']",
          message: 'Authentication diagnostics must use a fixed message.',
        },
      ],
    },
  },
];
