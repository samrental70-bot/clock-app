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
    files: ['api/**/*.js', 'api-shared/**/*.js'],
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
    },
  },
])
