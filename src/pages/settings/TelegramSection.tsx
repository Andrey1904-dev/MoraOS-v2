/**
 * Telegram-интеграция: раздел в Settings.
 *
 * Привязка в два шага: сначала предпросмотр («код принадлежит аккаунту …»),
 * затем подтверждение. Код одноразовый, его хэш хранится в telegram_link_codes,
 * привязку выполняет link_telegram_account через Edge Function telegram-api.
 * Токен бота и service-role ключ остаются на сервере.
 */
import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Bot, RefreshCw, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import { Card, CardHeader, Badge, Divider, KeyStat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Feedback";
import { useAuth } from "@/context/AuthContext";
import {
  TELEGRAM_BOT_URL,
  TELEGRAM_BOT_USERNAME,
  TELEGRAM_CONFIG_MESSAGE,
  checkTelegramHealth,
  isTelegramConfigured,
  previewTelegramLink,
  requestTelegram,
  type TelegramApiHealth,
  type TelegramLinkPreview,
  type TelegramLinkStatus,
} from "@/lib/telegram";
import { TELEGRAM_ASSISTANT_AVATAR } from "@/lib/assets";

/** Узнаваемая «визитка» ассистента: аватар, имя и публичный @username из сборки. */
function BotIdentity() {
  return (
    <div className="flex items-center gap-3">
      <picture>
        <source srcSet={TELEGRAM_ASSISTANT_AVATAR.webp} type="image/webp" />
        <img
          src={TELEGRAM_ASSISTANT_AVATAR.jpg}
          alt="Аватар Mara OS Assistant"
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="size-12 shrink-0 rounded-full object-cover ring-1 ring-line"
        />
      </picture>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">Mara OS Assistant</div>
        <div className="truncate text-[12px] text-muted">
          {TELEGRAM_BOT_USERNAME ? `@${TELEGRAM_BOT_USERNAME}` : "Имя бота не задано в сборке"}
        </div>
      </div>
    </div>
  );
}

type Status =
  | { kind: "loading" }
  | { kind: "linked"; linkedAt?: string }
  | { kind: "unlinked" }
  | { kind: "error"; message: string };

/** Код, который прошёл предпросмотр: подтверждается ровно он и ровно этот аккаунт. */
type PendingLink = TelegramLinkPreview & { code: string };

export function TelegramSection() {
  const { push } = useToast();
  const { backend, mode } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [health, setHealth] = useState<TelegramApiHealth | null>(null);
  const [healthBad, setHealthBad] = useState<string>("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | "unlink" | "refresh" | null>(null);

  const refresh = useCallback(async () => {
    setBusy((b) => b ?? "refresh");
    try {
      if (mode === "demo") {
        setStatus({ kind: "unlinked" });
        setHealth(null);
        setHealthBad("");
        return;
      }
      const token = await backend.auth.getAccessToken();
      if (!token) {
        setStatus({ kind: "error", message: "Войдите, чтобы управлять привязкой Telegram." });
        return;
      }
      const result = await requestTelegram<TelegramLinkStatus>("/api/telegram/link/status", token);
      setStatus(result.linked ? { kind: "linked", linkedAt: result.linkedAt } : { kind: "unlinked" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Telegram API недоступен." });
    } finally {
      setBusy(null);
    }
  }, [backend, mode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isTelegramConfigured || mode === "demo") return;
    checkTelegramHealth()
      .then((report) => {
        const ok = report.configured && (report.botPolling === "online" || report.mode === "webhook");
        setHealth(report);
        setHealthBad(ok ? "" : "Бот не в сети (webhook или polling). Выполните npm run bot:setup.");
      })
      .catch(() => setHealthBad("API бота не ответил на /health."));
  }, [mode]);

  /** Шаг 1: показать, какой Telegram-аккаунт выдал код. Ничего не привязывается. */
  const checkCode = async () => {
    const value = code.trim();
    if (!value) return;
    setBusy("preview");
    try {
      const token = await backend.auth.getAccessToken();
      if (!token) throw new Error("Сначала войдите.");
      const preview = await previewTelegramLink(token, value);
      setPending({ ...preview, code: value });
    } catch (e) {
      setPending(null);
      push({ title: "Код не принят", description: e instanceof Error ? e.message : "Запросите новый код командой /link.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  /** Шаг 2: привязка — только после явного подтверждения аккаунта. */
  const confirmPending = async () => {
    if (!pending) return;
    setBusy("confirm");
    try {
      const token = await backend.auth.getAccessToken();
      if (!token) throw new Error("Сначала войдите.");
      await requestTelegram("/api/telegram/link/confirm", token, { method: "POST", body: { code: pending.code } });
      setPending(null);
      setCode("");
      push({ title: "Telegram подключён", description: `Привязано к ${pending.telegramAccount}.`, tone: "success" });
      await refresh();
    } catch (e) {
      push({ title: "Не удалось привязать", description: e instanceof Error ? e.message : "Запросите новый код командой /link.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    try {
      const token = await backend.auth.getAccessToken();
      if (!token) throw new Error("Сначала войдите.");
      await requestTelegram("/api/telegram/link", token, { method: "DELETE" });
      push({ title: "Telegram отключён", description: "Бот больше не видит ваш аккаунт.", tone: "default" });
      await refresh();
    } catch (e) {
      push({ title: "Не удалось отключить", description: e instanceof Error ? e.message : "Попробуйте ещё раз.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (mode === "demo") {
    return (
      <Card>
        <CardHeader title="Telegram" subtitle="Бот Mara OS Assistant и Mini App" action={<Badge tone="warn">Демо-режим</Badge>} />
        <div className="space-y-3 px-5 pb-5">
          <BotIdentity />
          <p className="text-[13px] leading-6 text-muted">
            В демо-режиме привязка Telegram не используется — аккаунт привязывается к вашему проекту
            Supabase. Сам бот работает: отправьте ему /link, затем войдите здесь с облачными учётными
            данными и вставьте код ниже, чтобы связать аккаунты.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {TELEGRAM_BOT_URL && (
              <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
                <Button variant="secondary"><i className="mr-1.5 inline-flex"><Bot className="size-4" /></i>
                  Открыть Mara OS Assistant
                </Button>
              </a>
            )}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[12px] text-faint hover:text-muted">
              Токен бота настраивается в @BotFather
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Привязка Telegram"
          subtitle="Шаг 1: проверьте, чей это код. Шаг 2: подключите."
          action={
            <Button variant="ghost" size="sm" loading={busy === "refresh"} onClick={() => void refresh()}><i className="mr-1.5 inline-flex"><RefreshCw className="size-3.5" /></i>
              Обновить
            </Button>
          }
        />
        <div className="space-y-4 px-5 pb-5">
          <BotIdentity />

          {!isTelegramConfigured && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-[12.5px] text-warn">
              {TELEGRAM_CONFIG_MESSAGE}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {status.kind === "loading" && <Badge tone="neutral">Проверка…</Badge>}
            {status.kind === "linked" && (
              <Badge tone="pos">
                Подключено{status.linkedAt ? ` с ${new Date(status.linkedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : ""}
              </Badge>
            )}
            {status.kind === "unlinked" && <Badge tone="neutral">Не подключено</Badge>}
            {status.kind === "error" && <Badge tone="neg">{status.message}</Badge>}
            {TELEGRAM_BOT_URL && (
              <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm"><i className="mr-1.5 inline-flex"><Bot className="size-4" /></i>
                  Open Mara OS Assistant
                </Button>
              </a>
            )}
          </div>

          <Divider />

          <div className="grid gap-3 text-[12.5px] text-muted sm:grid-cols-3">
            <KeyStat label="1" value="Отправьте боту /link" />
            <KeyStat label="2" value="Проверьте показанный здесь аккаунт" />
            <KeyStat label="3" value="Подключите — и пользуйтесь /menu в чате" />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Одноразовый код" hint="10 букв или цифр, действует 10 минут. Никому его не показывайте.">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setPending(null);
                }}
                placeholder="например, 4K9PQ-72QX8"
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </Field>
            <Button
              variant="secondary"
              loading={busy === "preview"}
              onClick={() => void checkCode()}
              disabled={!code.trim() || !isTelegramConfigured || busy !== null}
            >
              Проверить код
            </Button>
            {status.kind === "linked" && (
              <Button variant="danger" loading={busy === "unlink"} onClick={() => void unlink()}><i className="mr-1.5 inline-flex"><Link2Off className="size-4" /></i>
                Отключить
              </Button>
            )}
          </div>

          {pending && (
            <div role="group" aria-label="Подтверждение Telegram-аккаунта" className="space-y-3 rounded-lg border border-line-2 bg-canvas-2 p-4">
              <p className="text-[13px] leading-6 text-ink-2">
                Этот код запрошен из Telegram-аккаунта{" "}
                <strong className="font-semibold text-ink">{pending.telegramAccount}</strong>.
                Подключайте только если это ваш собственный аккаунт.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={busy === "confirm"}
                  onClick={() => void confirmPending()}
                  disabled={busy !== null}
                ><i className="mr-1.5 inline-flex"><Link2 className="size-4" /></i>
                  Подключить этот аккаунт
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)} disabled={busy !== null}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {(health || healthBad) && (
        <Card>
          <CardHeader title="Состояние сервиса бота" subtitle="telegram-api /health" />
          <div className="space-y-2 px-5 pb-5 text-[12.5px]">
            {health && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={healthBad ? "warn" : "pos"}>{health.mode === "webhook" ? "Режим webhook" : `Polling: ${health.botPolling}`}</Badge>
                {health.lastSuccessfulPollAt && (
                  <span className="text-muted">последний опрос {new Date(health.lastSuccessfulPollAt).toLocaleTimeString("ru-RU")}</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2 text-muted">
              {healthBad ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-pos" />}
              <span>{healthBad || "Транспорт бота в сети."}</span>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Что умеет бот" subtitle="Компаньон только для чтения — действия остаются за вашим одобрением" />
        <div className="px-5 pb-5 text-[12.5px] leading-6 text-muted">
          <ul className="space-y-1.5">
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /fans — аудитория по уровням отношений</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /messages — непрочитанный инбокс и AI-черновики на одобрении</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /content — срез конвейера и ближайший запланированный дроп</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /analytics — выручка за месяц по источникам</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /tasks /ai — решения, которые ждут вас, и запуски агентов за сегодня</li>
          </ul>
          <p className="mt-3 text-[12px] text-faint">
            Кнопка Mini App в боте открывает эту консоль внутри Telegram; deep links
            (startapp=fans, ?screen=messages, …) ведут сразу в нужный раздел.
          </p>
        </div>
      </Card>
    </div>
  );
}
