import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-ssr',
    'node_modules',
    'census-tenant-form-2026',
    'charts',
    'screenshots',
    'worker',
    'tools',
    'bridge',
    'api-legacy/**',
    'api/orpl/**',
    '.vercel/output',
    'MCP/**',
    'quickbooks-mcp/**',
    'docs/AURACUT_*.md',
    'scripts/apply-auracut-schema.js',
    'scripts/ensure-auracut-storage.js',
    'scripts/verify-auracut-schema.js',
    'scripts/verify-shared-env-resolution.js',
    '.codex_renders',
    '.codex_pdf_deps',
    '.tmp-chrome-*',
    '.tmp-edge-*',
    'src/orpl/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['api/**/*.js', 'api-handlers/**/*.js', 'api-shared/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['public/service-worker.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ['src/EmployeeClockApp.jsx'],
    rules: {
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-constant-condition': 'warn',
      'react-hooks/component-hook-factories': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      // This file exports shared helpers/constants alongside the default
      // component so that the lazy-loaded ChatScreen chunk (split out for
      // bundle-size reasons) can import them without duplication. That
      // intentionally trips the fast-refresh-only-exports rule; it has no
      // production impact (dev-only HMR granularity).
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // ChatScreen was extracted verbatim out of EmployeeClockApp.jsx (see above)
    // as a bundle-size code-splitting fix. It carries the same pre-existing
    // patterns that were already deliberately relaxed for the monolith above;
    // apply the same relaxations here rather than rewriting unrelated logic.
    files: ['src/ChatScreen.jsx'],
    rules: {
      'no-unused-vars': 'warn',
      'react-hooks/component-hook-factories': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
  {
    // CachedImage swaps its <img src> to a cached object URL from an async
    // effect; the setState-in-effect there is the intended lifecycle, not a bug.
    files: ['src/components/CachedImage.jsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
