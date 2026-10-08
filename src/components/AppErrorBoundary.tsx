import { Component, type ErrorInfo, type ReactNode } from 'react'
import { markMiniAppReady } from '../lib/telegram-mini-app'

interface State {
  failed: boolean
}

/**
 * Последний рубеж: ошибка рендера показывает понятный экран с перезагрузкой
 * вместо белого экрана (в браузере и в Telegram Mini App).
 */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Telegram должен убрать заглушку загрузки, даже если приложение упало.
    markMiniAppReady()
    console.error('[app] render failed:', error, info.componentStack)
  }

  private reload = () => {
    try {
      window.location.reload()
    } catch {
      /* ignore */
    }
  }

  private goHome = () => {
    window.location.hash = '#/'
    this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-[380px] rounded-[14px] border border-line bg-surface p-6 text-center">
          <p className="font-display-num text-[20px] font-bold uppercase tracking-wide">Что-то пошло не так</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#A9AFB7]">
            Экран не удалось отобразить. Данные не потеряны — попробуйте обновить страницу.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="min-h-[44px] rounded-[10px] border border-[#E33337] bg-[#E33337] px-4 text-[14px] font-bold text-white"
            >
              Обновить
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="min-h-[44px] rounded-[10px] border border-[#363B43] bg-[#23272D] px-4 text-[14px] font-semibold text-[#F3F4F4]"
            >
              На главную
            </button>
          </div>
        </div>
      </div>
    )
  }
}
