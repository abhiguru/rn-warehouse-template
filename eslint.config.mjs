import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';


// Style guide guard (docs/STYLE_GUIDE.md §2 and §16): UI code takes colours, type and
// alerts from the design system, never from literals or the old colour modules.
const THEME_SYNTAX_RULES = [
  {
    selector: "Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
    message: 'Use a semantic token from useTokens()/useThemedStyles() instead of a hex colour (style guide §2).',
  },
  {
    selector: 'Literal[value=/^rgba?\\(/]',
    message: 'Use a semantic token instead of an rgb()/rgba() colour (style guide §2).',
  },
  {
    selector: "Property[key.name='fontSize'][value.type='Literal']",
    message: 'Spread a typography style from @/theme/tokens instead of a raw fontSize (style guide §4).',
  },
  {
    selector: "CallExpression[callee.property.name=/^(split|slice|substring)$/][callee.object.callee.property.name='toISOString']",
    message: "toISOString() is UTC: before 5:30 am in India it gives yesterday. Use toLocalISODate() from @/utils/formatters.",
  },
  {
    selector: "CallExpression[callee.object.name='Alert'][callee.property.name='alert']",
    message: 'Use showAlert from @/utils/alert so the dialog follows the theme (style guide §13.9).',
  },
];

const THEME_IMPORT_RULES = {
  paths: [
    { name: 'react-native', importNames: ['useColorScheme', 'Appearance'], message: 'Use useTheme(); it respects the Settings choice.' },
    { name: '@expo/vector-icons', message: "Use MaterialCommunityIcons: import Icon from 'react-native-vector-icons/MaterialCommunityIcons' (style guide §8)." },
    { name: '@/theme', importNames: ['colors', 'darkColors', 'getThemeColors', 'Colors', 'default'], message: 'Use semantic tokens (useTokens/useThemedStyles).' },
  ],
  patterns: [
    { group: ['@/theme/listColors', '@/theme/fioriColors', '@/hooks/useListColors', '@/constants/fioriDesignTokens', '@/components/common/overview-tab/FioriTokens'], message: 'Removed legacy colour module; use semantic tokens.' },
  ],
};

export default [
  js.configs.recommended,
  {
    files: ['app.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'readonly', process: 'readonly' },
    },
  },
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
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', '**/__tests__/**', '**/*.test.{ts,tsx}', 'src/tests/**'],
    rules: {
      'no-restricted-syntax': ['error', ...THEME_SYNTAX_RULES],
      'no-restricted-imports': ['error', THEME_IMPORT_RULES],
    },
  },
  {
    // The theme hook is the one place that reads the system colour scheme; the alert
    // helper is the one place that calls Alert.alert (as its no-host fallback).
    files: ['src/hooks/useTheme.ts', 'src/utils/alert.ts'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
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
        ...THEME_SYNTAX_RULES,
      ],
    },
  },
];
