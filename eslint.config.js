// ESLint (flat config). Проверяются исходники приложения, бота, скрипты и тесты.
// Сгенерированные каталоги и Edge-копии общих модулей (они совпадают с bot/) не линтуются.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'vite.config.ts'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Параметры с префиксом _ намеренно не используются (например, заглушки интерфейсов).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['bot/**/*.mjs', 'scripts/**/*.{mjs,ts}', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // E2E выполняет код в браузере (window, document) через Playwright.
    files: ['scripts/e2e-mini-app.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Тесты используют `as never` и подобные приёмы для фикстур.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
