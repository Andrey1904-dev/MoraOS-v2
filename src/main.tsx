import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { bootstrapTelegramMiniApp } from './lib/telegram-mini-app'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

// Telegram Mini App: SDK должен прочитать параметры запуска из hash раньше,
// чем HashRouter его перепишет. В обычном браузере промис завершается сразу
// (SDK не загружается), при ошибке/таймауте сайт всё равно отрисуется.
void bootstrapTelegramMiniApp().finally(render)
