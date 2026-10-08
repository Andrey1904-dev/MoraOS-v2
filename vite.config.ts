import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

// Единственный источник базового пути (GitHub Pages). Его читают сборка и e2e-тест.
// `vite preview` получает тот же путь флагом --base (см. package.json).
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8')) as {
  basePath: string
}

// Браузер обращается к тому же origin; только Vite проксирует запросы к API.
// В опубликованной сборке задайте VITE_TELEGRAM_API_URL на внешний HTTPS endpoint.
const telegramApiProxy = () => ({
  '/telegram-api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/telegram-api/, ''),
  },
})

// Хосты превью песочницы Arena (*.e2b.app). Это намеренно: без них превью не открывается.
// Вне песочницы это правило можно убрать.
const previewHosts = ['.e2b.app', 'localhost', '127.0.0.1']

// Политика для продакшн-сборки. Dev-сервер её не получает: Vite инжектирует inline-скрипты HMR.
// `connect-src https:` — адрес API задаётся пользователем (VITE_SUPABASE_URL / VITE_TELEGRAM_API_URL),
// поэтому список хостов не фиксирован.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.pexels.com",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspPlugin = (): Plugin => ({
  name: 'mara-os-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
})

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), cspPlugin()],
  base: command === 'build' ? site.basePath : '/',
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    allowedHosts: previewHosts,
    proxy: telegramApiProxy(),
  },
  preview: {
    allowedHosts: previewHosts,
    proxy: telegramApiProxy(),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}))
