import { useEffect, useState } from 'react'

/**
 * Заставка при входе: эмблема Mara OS и слоган истории.
 * Показывается один раз на загрузку страницы (~1.2 с), затем плавно уходит.
 */
export default function SplashScreen() {
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 1150)
    const goneTimer = window.setTimeout(() => setGone(true), 1550)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(goneTimer)
    }
  }, [])

  if (gone) return null

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-canvas transition-opacity duration-400 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Винное свечение позади эмблемы */}
      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full bg-accent/15 blur-3xl"
        aria-hidden="true"
      />

      <div
        className="anim-fade grid size-20 place-items-center rounded-[20px] border border-line bg-surface text-[34px] font-bold text-accent-hi shadow-2xl shadow-black/70"
        style={{ animationDelay: '60ms' }}
      >
        M
      </div>

      <p
        className="anim-fade mt-5 text-[15px] font-semibold tracking-[0.22em] text-ink uppercase"
        style={{ animationDelay: '140ms' }}
      >
        Mara OS
      </p>

      <p
        className="anim-fade mt-1.5 text-[12px] font-medium tracking-wide text-muted"
        style={{ animationDelay: '240ms' }}
      >
        365 дней, чтобы выкупить своё время
      </p>

      {/* Полоса прогресса */}
      <div className="mt-6 h-[2px] w-40 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full w-full origin-left bg-accent transition-transform duration-1000 ease-out"
          style={{ transform: leaving ? 'scaleX(1)' : 'scaleX(0.25)' }}
        />
      </div>
    </div>
  )
}
