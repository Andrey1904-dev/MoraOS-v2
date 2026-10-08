import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Bell, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { mailCooldownLeft, useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Controls'
import { checkEmail, webmailUrl } from '@/lib/email'
import { AuthProblem, toAuthProblem } from '@/lib/authErrors'
import { cn } from '@/utils/cn'

/**
 * Экран входа Mara OS: email/пароль (Supabase Auth), регистрация с
 * подтверждением почты и локальный демо-режим. Логика идентична
 * прежнему кабинету — та же защита от спама письмами, те же ошибки.
 */
export default function AuthPage() {
  const { signIn, signUp, enterDemo, leaveDemo, resendConfirmation, demoOnly, mode, settings } =
    useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [problem, setProblem] = useState<AuthProblem | null>(null)
  const [notice, setNotice] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(mailCooldownLeft())
  const passwordRef = useRef<HTMLInputElement>(null)

  /**
   * На экран входа попадают только без сессии. Если приложение всё ещё
   * помнит демо-режим (сессию очистили вручную, браузер почистил
   * localStorage), форма обращалась бы к localStorage вместо Supabase и
   * выдавала «неверный пароль» на реальную учётку. Возвращаем облачный режим.
   */
  useEffect(() => {
    if (mode === 'demo' && !demoOnly) leaveDemo()
    // только при монтировании: вход в демо ниже по коду не должен его отменять
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(mailCooldownLeft()), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const check = useMemo(() => checkEmail(email), [email])
  const needsConfirmation = settings !== null && settings.autoconfirm === false
  const signupBlocked = settings?.signupDisabled === true

  const reset = () => {
    setProblem(null)
    setNotice('')
  }

  const fail = (e: unknown) => {
    const p = toAuthProblem(e)
    setProblem(p)
    setNotice('')
    if (p.retryAfterSec) setCooldown(mailCooldownLeft())
  }

  const submit = async () => {
    reset()
    if (!check.ok) {
      setProblem(new AuthProblem('email_invalid', check.error ?? 'Enter a valid email'))
      return
    }
    if (password.length < 6) {
      setProblem(new AuthProblem('weak_password', 'Password must be at least 6 characters'))
      return
    }
    setBusy(true)
    try {
      if (isRegister) {
        const result = await signUp(check.email, password)
        setPendingEmail(check.email)
        setCooldown(mailCooldownLeft())
        if (!result.session) {
          setNotice(
            `Account created. A confirmation link was sent to ${check.email}. ` +
              'Open it (check Spam too), then sign in.',
          )
          setIsRegister(false)
          setPassword('')
        }
      } else {
        await signIn(check.email, password)
      }
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const tryLogin = async () => {
    reset()
    setBusy(true)
    try {
      await signIn(check.email || pendingEmail, password)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const enterDemoMode = async () => {
    reset()
    setBusy(true)
    try {
      await enterDemo()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    reset()
    setBusy(true)
    try {
      await resendConfirmation(pendingEmail || check.email)
      setCooldown(mailCooldownLeft())
      setNotice(`Confirmation email resent to ${pendingEmail || check.email}. Check inbox and Spam.`)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const mailLink = webmailUrl(pendingEmail || check.email)

  return (
    <div className="min-h-dvh w-full bg-canvas text-ink">
      <div className="mx-auto grid min-h-dvh max-w-[1100px] grid-cols-1 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8">
        {/* Бренд-панель: характер Mara и обещание продукта */}
        <div className="hidden lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grain absolute inset-0" aria-hidden="true" />
            <div className="relative flex items-center gap-2.5 px-7 pt-7">
              <span className="grid size-7 place-items-center rounded-[7px] bg-accent text-[13px] font-bold text-white">M</span>
              <span className="text-[13px] font-semibold tracking-[0.16em]">MARA OS</span>
              <span className="num ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">v2</span>
            </div>
            <div className="relative px-7 pt-5 pb-7">
              <p className="label">Virtual creator · operating system</p>
              <h1 className="mt-3 max-w-[520px] text-[34px] leading-[1.08] font-semibold tracking-tight text-ink">
                365 days to buy back my time.
              </h1>
              <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-muted">
                One character, one brain: fans, conversations, content pipeline, offers, revenue and AI agents — wired into a single system.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11.5px] text-ink-2">
                {['$54k salary', '$27k debt', 'One red notebook', 'One year'].map((chip) => (
                  <span key={chip} className="rounded-full border border-line bg-canvas-2 px-2.5 py-1">{chip}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Sparkles className="size-4 text-accent-hi" />, title: 'AI agents on draft', body: 'Replies, sales and memory — always through human approval.' },
              { icon: <Bell className="size-4 text-info" />, title: 'Telegram wired in', body: 'Existing bot and Mini App open this same workspace.' },
              { icon: <ShieldCheck className="size-4 text-pos" />, title: 'Private by default', body: 'Supabase Auth, RLS everywhere, secrets stay server-side.' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-surface p-4">
                {f.icon}
                <div className="mt-2.5 text-[12.5px] font-medium text-ink">{f.title}</div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{f.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Форма */}
        <div className="px-4 py-8 sm:px-8 lg:col-span-5 lg:px-0 lg:py-0">
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-7 place-items-center rounded-[7px] bg-accent text-[13px] font-bold text-white">M</span>
            <div>
              <div className="text-[13px] font-semibold tracking-[0.16em]">MARA OS</div>
              <div className="text-[11px] text-muted">365 days to buy back my time</div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-pop sm:p-6">
            {demoOnly ? (
              <div className="flex flex-col gap-4">
                <div className="border-b border-line pb-4">
                  <span className="text-[11px] font-semibold tracking-wider text-accent-hi uppercase">Standalone build</span>
                  <h2 className="mt-1 text-[20px] font-semibold tracking-tight">Demo workspace</h2>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                    This build runs without Supabase keys, so cloud sign-in is off. The
                    <strong className="text-ink-2"> demo mode </strong>
                    is fully playable — a fictional Mara dataset stored in your browser.
                  </p>
                </div>

                <Button variant="primary" size="lg" loading={busy} onClick={() => void enterDemoMode()} className="w-full">
                  {busy ? 'Opening demo…' : 'Explore demo mode'}
                  <ArrowUpRight className="size-4" />
                </Button>

                {problem && (
                  <div role="alert" className="rounded-lg border border-neg/45 bg-neg/10 p-3.5 text-[12.5px] text-ink-2">
                    {problem.message}
                  </div>
                )}

                <div className="rounded-lg border border-line bg-canvas-2 p-3.5 text-[11.5px] leading-relaxed text-muted">
                  <strong className="text-ink-2">Connect Supabase:</strong> copy{' '}
                  <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10.5px] text-ink">.env.example</code> to{' '}
                  <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10.5px] text-ink">.env</code> and set{' '}
                  <code className="font-mono text-[10.5px] text-ink">VITE_SUPABASE_URL</code> +{' '}
                  <code className="font-mono text-[10.5px] text-ink">VITE_SUPABASE_ANON_KEY</code>; on GitHub Pages add them under
                  Settings → Secrets and variables → Actions.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <SegmentedControl
                  value={isRegister ? 'Create account' : 'Sign in'}
                  onChange={(v) => {
                    reset()
                    setIsRegister(v === 'Create account')
                  }}
                  options={['Sign in', 'Create account'] as const}
                  className="w-full justify-center"
                />

                <label className="flex flex-col gap-1.5">
                  <span className="label">Email</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (problem) setProblem(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && passwordRef.current?.focus()}
                    className={inputCls}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="label">Password</span>
                  <div className="relative">
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      placeholder={isRegister ? 'At least 6 characters' : 'Your password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (problem) setProblem(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && void submit()}
                      className={cn(inputCls, 'pr-14')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-2.5 my-auto text-[11px] font-medium text-muted transition-colors hover:text-ink"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                {problem && (
                  <div role="alert" className="rounded-lg border border-neg/45 bg-neg/10 p-3.5">
                    <div className="text-[12.5px] font-medium text-ink">{problem.message}</div>
                    {problem.detail && <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{problem.detail}</div>}
                  </div>
                )}
                {notice && !problem && (
                  <div role="status" className="rounded-lg border border-pos/40 bg-pos/10 p-3.5">
                    <div className="flex items-start gap-2">
                      <Mail className="mt-0.5 size-4 shrink-0 text-pos" />
                      <div className="text-[12.5px] leading-relaxed text-ink-2">{notice}</div>
                    </div>
                    {mailLink && (
                      <a
                        href={mailLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent-hi hover:underline"
                      >
                        Open mail <ArrowUpRight className="size-3" />
                      </a>
                    )}
                    {(pendingEmail || check.email) && needsConfirmation && (
                      <button
                        onClick={() => void resend()}
                        disabled={busy || cooldown > 0}
                        className="mt-1.5 block text-[12px] text-muted transition-colors hover:text-ink disabled:opacity-50"
                      >
                        {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend confirmation email'}
                      </button>
                    )}
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  loading={busy}
                  onClick={() => void submit()}
                  disabled={signupBlocked && isRegister}
                  className="w-full"
                >
                  {isRegister ? 'Create account' : 'Sign in'}
                </Button>

                {signupBlocked && isRegister && (
                  <p className="text-[11.5px] text-warn">Registration is disabled in this Supabase project.</p>
                )}

                {problem?.kind === 'invalid_credentials' && (
                  <Button variant="outline" size="sm" loading={busy} onClick={() => void tryLogin()}>
                    Try again
                  </Button>
                )}

                <div className="flex items-center gap-3 text-[11px] text-faint">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>

                <Button variant="secondary" size="md" loading={busy} onClick={() => void enterDemoMode()} className="w-full">
                  Explore demo mode
                  <span className="num rounded border border-line px-1 py-0.5 text-[9.5px] text-faint">fictional data</span>
                </Button>

                <p className="text-center text-[10.5px] leading-relaxed text-faint">
                  Demo opens a fictional Mara workspace stored only in this browser — no account needed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'h-10 w-full rounded-lg border border-line bg-canvas-2 px-3 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:outline-none'
