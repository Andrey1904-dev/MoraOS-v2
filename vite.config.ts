import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Браузер обращается к тому же origin; только Vite проксирует запросы к API.
// В опубликованной сборке задайте VITE_TELEGRAM_API_URL на внешний HTTPS endpoint.
const telegramApiProxy = () => ({
  '/telegram-api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/telegram-api/, ''),
  },
})

// base '/MoraOS-v2/' нужен только для продакшн-билда на GitHub Pages
// (https://<user>.github.io/MoraOS-v2/). В dev-режиме используем '/',
// чтобы превью было доступно сразу с корневого URL.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/MoraOS-v2/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // разрешаем превью-хосты песочницы (*.e2b.app)
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
    proxy: telegramApiProxy(),
  },
  preview: {
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
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
