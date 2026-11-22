import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import testingLibrary from 'eslint-plugin-testing-library';
import jest from 'eslint-plugin-jest';


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
    { name: 'react-native-vector-icons', message: "Use MaterialCommunityIcons: import Icon from '@expo/vector-icons/MaterialCommunityIcons' (style guide §8)." },
    { name: '@expo/vector-icons', message: "Use MaterialCommunityIcons: import Icon from '@expo/vector-icons/MaterialCommunityIcons' (style guide §8)." },
    { name: '@/theme', importNames: ['colors', 'darkColors', 'getThemeColors', 'Colors', 'default'], message: 'Use semantic tokens (useTokens/useThemedStyles).' },
    { name: 'react-native-gesture-handler', importNames: ['Swipeable'], message: 'Use ReanimatedSwipeable: gesture-handler 3 (Expo SDK 58) has no Swipeable.' },
  ],
  patterns: [
    { group: ['react-native-gesture-handler/Swipeable'], message: 'Use ReanimatedSwipeable: gesture-handler 3 (Expo SDK 58) has no Swipeable.' },
    { group: ['react-native-vector-icons/*', '@expo/vector-icons/*', '!@expo/vector-icons/MaterialCommunityIcons'], message: "Use MaterialCommunityIcons: import Icon from '@expo/vector-icons/MaterialCommunityIcons' (style guide §8)." },
    { group: ['@/theme/listColors', '@/theme/fioriColors', '@/hooks/useListColors', '@/constants/fioriDesignTokens', '@/components/common/overview-tab/FioriTokens'], message: 'Removed legacy colour module; use semantic tokens.' },
  ],
};

// docs/CODE_GUIDE.md "Proposed lint rules": the rules below come in at "warn" so main gets
// no new errors; each names its CG rule. The existing style-guide guards above stay at "error".
const CODE_GUIDE_FILES = ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'];
const CODE_GUIDE_IGNORES = ['**/__tests__/**', '**/*.test.{ts,tsx}', 'src/tests/**'];

// Take a shared config and lower every rule to "warn", keeping its options.
const asWarn = (config) => {
  if (!config.rules) return config;
  const rules = {};
  for (const [name, entry] of Object.entries(config.rules)) {
    const level = Array.isArray(entry) ? entry[0] : entry;
    const off = level === 'off' || level === 0;
    rules[name] = off ? entry : Array.isArray(entry) ? ['warn', ...entry.slice(1)] : 'warn';
  }
  return { ...config, rules };
};

// CG-17: no class components outside the three error boundaries. ESLint gives one rule one
// severity per file, and no-restricted-syntax is already used at "error" for the style-guide
// guards, so this small local rule carries the "warn".
const CLASS_COMPONENT_BOUNDARIES = [
  'src/components/ErrorBoundary.tsx',
  'src/components/FeatureErrorBoundary.tsx',
  'src/components/list/ListErrorBoundary.tsx',
];
const codeGuidePlugin = {
  rules: {
    'no-class-components': {
      meta: { type: 'suggestion', schema: [], messages: { noClass: 'Write a function component with hooks; class components are only for error boundaries (CODE_GUIDE CG-17).' } },
      create(context) {
        const check = (node) => {
          const sc = node.superClass;
          if (!sc) return;
          const name = sc.type === 'MemberExpression' ? sc.property.name : sc.name;
          if (name === 'Component' || name === 'PureComponent') context.report({ node, messageId: 'noClass' });
        };
        return { ClassDeclaration: check, ClassExpression: check };
      },
    },
  },
};

const CODE_GUIDE_TYPED_CONFIGS = [
  ...tseslint.configs['flat/recommended-type-checked'],
  ...tseslint.configs['flat/stylistic-type-checked'],
].map((config) => asWarn({ ...config, files: CODE_GUIDE_FILES, ignores: CODE_GUIDE_IGNORES }));

export default [
  js.configs.recommended,
  {
    files: ['app.config.js', 'scripts/metro-block-list.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'readonly', process: 'readonly', require: 'readonly' },
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
      'jest.global-setup.js',
      'plugins/**/*.js',
      // Git worktrees that agents work in (git ignores them through .git/info/exclude).
      '.claude/**',
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
  // CODE_GUIDE (warn): typed linting. Test files are not in tsconfig.json, so they are skipped.
  ...CODE_GUIDE_TYPED_CONFIGS,
  {
    // The type-checked preset includes typescript-eslint's eslint-recommended override, which switches off core
    // rules that TypeScript is meant to cover. Set back the ones TypeScript (strict) does not fully cover.
    files: CODE_GUIDE_FILES,
    ignores: CODE_GUIDE_IGNORES,
    rules: {
      // CG-6 (dead code): allowUnreachableCode is not set, so TS7027 is only an editor suggestion, not a compile error.
      'no-unreachable': 'error',
      // CG-8: left off because tsc errors already cover them under strict: no-const-assign (TS2588), no-dupe-keys (TS1117),
      // no-func-assign (TS2630), no-import-assign (TS2632), no-setter-return (TS2408), getter-return (TS2378),
      // no-unsafe-negation (TS2358, TS2360). no-redeclare stays off: it flags TypeScript function overloads,
      // and tsc reports duplicate let/const/class names (TS2451, TS2300).
    },
  },
  {
    files: CODE_GUIDE_FILES,
    ignores: CODE_GUIDE_IGNORES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint, 'code-guide': codeGuidePlugin },
    rules: {
      // CG-18, CG-19, CG-25, CG-26, CG-27, CG-28, CG-32: react-hooks recommended preset.
      ...asWarn(reactHooks.configs.flat.recommended).rules,
      '@typescript-eslint/no-non-null-assertion': 'warn', // CG-10
      '@typescript-eslint/switch-exhaustiveness-check': 'warn', // CG-12
      '@typescript-eslint/consistent-type-imports': 'warn', // CG-13
      '@typescript-eslint/no-deprecated': 'warn', // CG-16, CG-47, CG-48, CG-53
      // CG-65: no string-to-code evaluation.
      'no-eval': 'warn',
      'no-implied-eval': 'off', // core rule is replaced by the typed one below
      '@typescript-eslint/no-implied-eval': 'warn',
      'no-new-func': 'warn',
      // CG-2, CG-3, CG-4, CG-47, CG-48: warn-level copy of the import guards. The core rule
      // above stays at "error" for the style-guide guards, so the typescript-eslint version
      // of the same rule carries the "warn".
      '@typescript-eslint/no-restricted-imports': ['warn', {
        paths: [
          { name: 'react-native', importNames: ['findNodeHandle', 'requireNativeComponent', 'InteractionManager', 'ImageBackground'], message: 'Removed or deprecated in React Native 0.88 (CODE_GUIDE CG-47, CG-48).' },
        ],
        patterns: [
          { group: ['../../*'], message: "Import across folders with the '@/' alias (CODE_GUIDE CG-2)." },
          { group: ['@react-navigation/*'], message: 'Import navigation from expo-router (CODE_GUIDE CG-3).' },
          { group: ['react-native/Libraries/*'], message: 'No deep imports from react-native/Libraries (CODE_GUIDE CG-4).' },
        ],
      }],
    },
  },
  {
    // CG-17: class components only in the three error boundaries.
    files: CODE_GUIDE_FILES,
    ignores: [...CODE_GUIDE_IGNORES, ...CLASS_COMPONENT_BOUNDARIES],
    plugins: { 'code-guide': codeGuidePlugin },
    rules: { 'code-guide/no-class-components': 'warn' },
  },
  {
    // CG-35, CG-36, CG-37: TanStack Query recommended rules (exhaustive-deps,
    // stable-query-client, no-rest-destructuring, no-unstable-deps and the rest of the preset).
    files: CODE_GUIDE_FILES,
    ignores: CODE_GUIDE_IGNORES,
    plugins: { '@tanstack/query': tanstackQuery },
    rules: asWarn({ rules: tanstackQuery.configs['flat/recommended'].reduce((all, c) => ({ ...all, ...c.rules }), {}) }).rules,
  },
  {
    // CG-68, CG-69: Testing Library rules, test files only.
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'src/tests/**/*.{ts,tsx}'],
    plugins: { 'testing-library': testingLibrary, jest },
    // Aggressive reporting off: the rules count only calls from @testing-library/react-native
    // (named as the utils module, because the plugin does not know that package by itself), not any
    // method called findBy*/getBy*).
    settings: {
      'testing-library/utils-module': '@testing-library/react-native',
      'testing-library/custom-renders': 'off',
      'testing-library/custom-queries': 'off',
    },
    rules: {
      'testing-library/prefer-screen-queries': 'warn', // CG-68
      'testing-library/prefer-find-by': 'warn', // CG-68
      'testing-library/prefer-presence-queries': 'warn', // CG-68
      'testing-library/no-wait-for-side-effects': 'warn', // CG-69
      'testing-library/no-wait-for-multiple-assertions': 'warn', // CG-69
      'testing-library/await-async-queries': 'warn', // CG-69
      'testing-library/no-unnecessary-act': 'warn', // CG-69
      'testing-library/no-manual-cleanup': 'warn', // CG-69
      'jest/no-focused-tests': 'warn', // CG-72
      'jest/no-disabled-tests': 'warn', // CG-72
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
