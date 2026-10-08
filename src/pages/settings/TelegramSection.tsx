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
  TELEGRAM_CONFIG_MESSAGE,
  checkTelegramHealth,
  isTelegramConfigured,
  previewTelegramLink,
  requestTelegram,
  type TelegramApiHealth,
  type TelegramLinkPreview,
  type TelegramLinkStatus,
} from "@/lib/telegram";

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
        setStatus({ kind: "error", message: "Sign in to manage the Telegram connection." });
        return;
      }
      const result = await requestTelegram<TelegramLinkStatus>("/api/telegram/link/status", token);
      setStatus(result.linked ? { kind: "linked", linkedAt: result.linkedAt } : { kind: "unlinked" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Telegram API unavailable." });
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
        setHealthBad(ok ? "" : "The bot is offline (webhook or polling). Run npm run bot:setup.");
      })
      .catch(() => setHealthBad("The bot API did not answer /health."));
  }, [mode]);

  /** Шаг 1: показать, какой Telegram-аккаунт выдал код. Ничего не привязывается. */
  const checkCode = async () => {
    const value = code.trim();
    if (!value) return;
    setBusy("preview");
    try {
      const token = await backend.auth.getAccessToken();
      if (!token) throw new Error("Sign in first.");
      const preview = await previewTelegramLink(token, value);
      setPending({ ...preview, code: value });
    } catch (e) {
      setPending(null);
      push({ title: "Code not accepted", description: e instanceof Error ? e.message : "Request a new code with /link.", tone: "error" });
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
      if (!token) throw new Error("Sign in first.");
      await requestTelegram("/api/telegram/link/confirm", token, { method: "POST", body: { code: pending.code } });
      setPending(null);
      setCode("");
      push({ title: "Telegram connected", description: `Linked to ${pending.telegramAccount}.`, tone: "success" });
      await refresh();
    } catch (e) {
      push({ title: "Link failed", description: e instanceof Error ? e.message : "Request a new code with /link.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    try {
      const token = await backend.auth.getAccessToken();
      if (!token) throw new Error("Sign in first.");
      await requestTelegram("/api/telegram/link", token, { method: "DELETE" });
      push({ title: "Telegram disconnected", description: "The bot no longer sees your account.", tone: "default" });
      await refresh();
    } catch (e) {
      push({ title: "Disconnect failed", description: e instanceof Error ? e.message : "Try again.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (mode === "demo") {
    return (
      <Card>
        <CardHeader title="Telegram" subtitle="Mara OS Assistant bot and Mini App" action={<Badge tone="warn">Demo mode</Badge>} />
        <div className="space-y-3 px-5 pb-5">
          <p className="text-[13px] leading-6 text-muted">
            In demo mode the Telegram link is not used — account binding happens against your Supabase
            project. The bot itself is live: send /link to it, then sign in with cloud credentials here
            and paste the code below to bind the accounts.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {TELEGRAM_BOT_URL && (
              <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
                <Button variant="secondary"><i className="mr-1.5 inline-flex"><Bot className="size-4" /></i>
                  Open Mara OS Assistant
                </Button>
              </a>
            )}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[12px] text-faint hover:text-muted">
              Bot token is managed in @BotFather
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
          title="Telegram link"
          subtitle="Step 1: check the code's account. Step 2: connect it."
          action={
            <Button variant="ghost" size="sm" loading={busy === "refresh"} onClick={() => void refresh()}><i className="mr-1.5 inline-flex"><RefreshCw className="size-3.5" /></i>
              Refresh
            </Button>
          }
        />
        <div className="space-y-4 px-5 pb-5">
          {!isTelegramConfigured && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-[12.5px] text-warn">
              {TELEGRAM_CONFIG_MESSAGE}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {status.kind === "loading" && <Badge tone="neutral">Checking…</Badge>}
            {status.kind === "linked" && (
              <Badge tone="pos">
                Connected{status.linkedAt ? ` since ${new Date(status.linkedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}` : ""}
              </Badge>
            )}
            {status.kind === "unlinked" && <Badge tone="neutral">Not connected</Badge>}
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
            <KeyStat label="1" value="Send /link to the bot" />
            <KeyStat label="2" value="Check the account shown here" />
            <KeyStat label="3" value="Connect it — then use /menu in chat" />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="One-time code" hint="10 letters or digits, valid 10 minutes. Never share it.">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setPending(null);
                }}
                placeholder="e.g. 4K9PQ-72QX8"
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
              Check code
            </Button>
            {status.kind === "linked" && (
              <Button variant="danger" loading={busy === "unlink"} onClick={() => void unlink()}><i className="mr-1.5 inline-flex"><Link2Off className="size-4" /></i>
                Disconnect
              </Button>
            )}
          </div>

          {pending && (
            <div role="group" aria-label="Confirm Telegram account" className="space-y-3 rounded-lg border border-line-2 bg-canvas-2 p-4">
              <p className="text-[13px] leading-6 text-ink-2">
                This code was requested from the Telegram account{" "}
                <strong className="font-semibold text-ink">{pending.telegramAccount}</strong>.
                Connect it only if that is your own account.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={busy === "confirm"}
                  onClick={() => void confirmPending()}
                  disabled={busy !== null}
                ><i className="mr-1.5 inline-flex"><Link2 className="size-4" /></i>
                  Connect this account
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)} disabled={busy !== null}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {(health || healthBad) && (
        <Card>
          <CardHeader title="Bot service health" subtitle="telegram-api /health" />
          <div className="space-y-2 px-5 pb-5 text-[12.5px]">
            {health && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={healthBad ? "warn" : "pos"}>{health.mode === "webhook" ? "Webhook mode" : `Polling: ${health.botPolling}`}</Badge>
                {health.lastSuccessfulPollAt && (
                  <span className="text-muted">last poll {new Date(health.lastSuccessfulPollAt).toLocaleTimeString("en-US")}</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2 text-muted">
              {healthBad ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-pos" />}
              <span>{healthBad || "The bot transport is online."}</span>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="What the bot can do" subtitle="Read-only companion — actions stay behind your approval" />
        <div className="px-5 pb-5 text-[12.5px] leading-6 text-muted">
          <ul className="space-y-1.5">
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /fans — audience by relationship level</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /messages — unread inbox and AI drafts awaiting approval</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /content — pipeline snapshot and next scheduled drop</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /analytics — revenue this month by source</li>
            <li className="flex gap-2"><Copy className="mt-1 size-3.5 shrink-0 text-faint" /> /tasks /ai — decisions waiting on you and today’s agent runs</li>
          </ul>
          <p className="mt-3 text-[12px] text-faint">
            The Mini App button in the bot opens this console inside Telegram; deep links
            (startapp=fans, ?screen=messages, …) land on the matching section.
          </p>
        </div>
      </Card>
    </div>
  );
}
