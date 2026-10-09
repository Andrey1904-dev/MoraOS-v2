import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  CircleDollarSign,
  Download,
  MessagesSquare,
  Pencil,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageContainer } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Avatar, KeyStat, Divider, ProgressBar } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Controls";
import { EmptyState, SkeletonRows, useToast } from "@/components/ui/Feedback";
import { AINote } from "@/components/common/AICard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, currency, longDate, number as fmtNum } from "@/lib/format";
import { label } from "@/lib/labels";
import { exportFileName, fanDossierToJson } from "@/lib/export";
import { downloadTextFile } from "@/lib/download";
import { trackEvent } from "@/lib/events";
import { confirmAction } from "@/lib/telegram-mini-app";
import { cn } from "@/utils/cn";

const EVENT_TYPE_LABELS: Record<string, string> = {
  purchase: "покупка",
  message: "сообщение",
  subscription: "подписка",
  tip: "чаевые",
  content: "контент",
  system: "система",
};

const TABS = ["Обзор", "Диалоги", "Покупки", "Воспоминания", "События"] as const;

export default function FanProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Обзор");

  const { data: fan, loading } = useResource(() => repositories.fans.get(id), [id]);
  const { data: memories } = useResource(() => repositories.fans.memories(id), [id]);
  const { data: events } = useResource(() => repositories.fans.events(id), [id]);
  const { data: purchases } = useResource(() => repositories.fans.purchases(id), [id]);
  const { data: conversations } = useResource(() => repositories.conversations.list());

  /** Досье фана в JSON: всё, что хранится о нём (право на доступ и переносимость). */
  const exportFan = async () => {
    const dossier = await repositories.fans.exportData(id);
    if (!dossier) {
      push({ title: "Не найдено", description: "Такого фана больше нет.", tone: "error" });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const outcome = await downloadTextFile(
      `${exportFileName("fan", stamp, id)}.json`,
      fanDossierToJson(dossier),
      "application/json;charset=utf-8",
    );
    void trackEvent({ type: "fan_exported", entityType: "fan", entityId: id });
    if (outcome === "downloaded" || outcome === "shared") {
      push({ title: "Экспорт готов", description: "Файл с данными этого фана готов.", tone: "success" });
    }
  };

  /** Удаление данных фана: профиль, переписки, воспоминания, покупки и подписки. Необратимо. */
  const eraseFan = async () => {
    const ok = await confirmAction(
      `Удалить ${fan?.name ?? "этого фана"} и все связанные сообщения, воспоминания, покупки и подписки? Это действие необратимо.`,
    );
    if (!ok) return;
    try {
      const removed = await repositories.fans.erase(id);
      if (!removed) {
        push({ title: "Не найдено", description: "Такого фана больше нет.", tone: "error" });
        return;
      }
      void trackEvent({ type: "fan_erased", entityType: "fan", entityId: id });
      push({ title: "Данные фана удалены", description: "Профиль и связанные записи удалены.", tone: "success" });
      navigate("/fans");
    } catch (error) {
      push({ title: "Не удалось удалить", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
    }
  };

  const fanConversations = useMemo(
    () => (conversations ?? []).filter((c) => c.fanId === id),
    [conversations, id],
  );

  const recommendation = useMemo(() => {
    if (!fan) return null;
    if (fan.status === "Churn risk")
      return {
        title: "Вернуть до 10-го дня",
        body: `${fan.name} отменил${fan.subscription?.status === "Cancelled" ? " подписку недавно" : ""} и не открывает сообщения уже 6 дней. В воспоминаниях видно: работает честная польза, а не скидки.`,
        action: "Отправьте честное сообщение о возвращении со ссылкой на эпизод 03 — последний, на который был отклик.",
        confidence: 74,
      };
    if (fan.relationship === "Visitor")
      return {
        title: "Первый контакт не установлен",
        body: `${fan.name} пришёл из ${fan.source}, но с ним ни разу не связывались. Новые гости конвертируются в 3,4 раза лучше, если первое сообщение приходит в течение часа.`,
        action: "Отправьте приветственное сообщение со ссылкой на эпизод 01.",
        confidence: 88,
      };
    const days = Math.round((Date.now() - new Date(fan.lastActivity).getTime()) / 86_400_000);
    return {
      title: "Сбился ритм покупок",
      body: `${fan.name} ничего не покупал последние ${Math.max(days, 2)} дн. История покупок и воспоминания указывают на фитнес-контент.`,
      action: `Отправьте персональный PPV, связанный с «${memories?.[2]?.statement ?? "любимым контентом"}".`,
      confidence: 87,
    };
  }, [fan, memories]);

  if (loading) {
    return (
      <PageContainer>
        <SkeletonRows rows={6} />
      </PageContainer>
    );
  }

  if (!fan) {
    return (
      <PageContainer>
        <Card>
          <EmptyState
            icon={<Brain className="size-4" />}
            title="Фан не найден"
            description="Возможно, этот фан удалён из CRM."
            action={<Button onClick={() => navigate("/fans")}>К списку фанов</Button>}
          />
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <button
        onClick={() => navigate("/fans")}
        className="mb-4 flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> К списку фанов
      </button>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={fan.name} tone={fan.avatarTone} size={56} ring={fan.relationship === "Inner circle"} />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[19px] font-medium tracking-[-0.02em] text-ink">{fan.name}</h1>
                <span className="text-[13px] text-muted">{fan.handle}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={fan.relationship === "Inner circle" ? "accent" : "neutral"}>{label(fan.relationship)}</Badge>
                <StatusBadge status={fan.status} />
                <Badge>{fan.source}</Badge>
                <span className="text-[12px] text-faint">{fan.location}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Ручное редактирование фанов ещё не реализовано: неактивно, без имитации. */}
            <Button variant="outline" disabled title="Редактирование фанов пока недоступно" aria-label="Редактировать фана (пока недоступно)">
              <Pencil className="size-3.5" /> Изменить
            </Button>
            <Button variant="outline" onClick={() => void exportFan()}>
              <Download className="size-3.5" /> Экспорт данных
            </Button>
            <Button variant="danger" onClick={() => void eraseFan()}>
              <Trash2 className="size-3.5" /> Удалить данные
            </Button>
            <Link to={`/conversations?fan=${fan.id}`}>
              <Button variant="secondary">
                <MessagesSquare className="size-3.5" /> Открыть диалог
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "LTV", value: currency(fan.ltv, { cents: fan.ltv % 1 !== 0 }) },
            { label: "Покупки", value: fmtNum(fan.purchases) },
            { label: "Подписка", value: fan.subscription ? label(fan.subscription.status) : label("None") },
            { label: "Последняя активность", value: ago(fan.lastActivity) },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-5 py-4">
              <div className="label">{s.label}</div>
              <div className="num mt-1.5 text-[16px] font-medium text-ink">{s.value}</div>
              {s.label === "Подписка" && fan.subscription && (
                <div className="mt-0.5 text-[11.5px] text-faint">{fan.subscription.plan} · продление {fan.subscription.renews}</div>
              )}
              {s.label === "Последняя активность" && (
                <div className="mt-0.5 text-[11.5px] text-faint">в базе с {longDate(fan.joined)}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="lg:col-span-2">
          <Card>
            <div className="px-5 pt-4">
              <Tabs tabs={TABS} value={tab} onChange={setTab} />
            </div>

            <div className="p-5">
              {tab === "Обзор" && (
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="label mb-2.5">Путь</div>
                      <div className="space-y-3">
                        {[
                          { label: "Источник", value: fan.source },
                          { label: "В базе с", value: longDate(fan.joined) },
                          { label: "Уровень", value: label(fan.relationship) },
                          { label: "Уровень трат", value: fan.ltv >= 500 ? "Топ-10%" : fan.ltv >= 150 ? "Средний" : "Начальный" },
                        ].map((r) => (
                          <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                            <span className="text-muted">{r.label}</span>
                            <span className="text-ink">{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="label mb-2.5">Сигналы</div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[12px]">
                            <span className="text-muted">Вовлечённость</span>
                            <span className="num text-ink">{fan.status === "Sleeping" ? 31 : 82}/100</span>
                          </div>
                          <ProgressBar value={fan.status === "Sleeping" ? 31 : 82} tone={fan.status === "Sleeping" ? "warn" : "accent"} />
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[12px]">
                            <span className="text-muted">Риск оттока</span>
                            <span className="num text-ink">{fan.status === "Churn risk" ? 71 : fan.status === "Sleeping" ? 54 : 12}%</span>
                          </div>
                          <ProgressBar
                            value={fan.status === "Churn risk" ? 71 : fan.status === "Sleeping" ? 54 : 12}
                            tone={fan.status === "Churn risk" ? "warn" : "accent"}
                          />
                        </div>
                        <div className="rounded-lg border border-line bg-canvas-2/60 p-3 text-[12px] leading-relaxed text-muted">
                          {fan.spendTierNote}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Divider />

                  <div>
                    <div className="label mb-3">Последние события</div>
                    <div className="space-y-3.5">
                      {(events ?? []).slice(0, 5).map((e) => (
                        <div key={e.id} className="flex gap-3">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent/70" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-[12.5px] text-ink">{e.title}</span>
                              {e.amount && <span className="num text-[12px] text-pos">+{currency(e.amount, { cents: true })}</span>}
                              <span className="num ml-auto text-[11px] text-faint">{ago(e.at)}</span>
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-muted">{e.detail}</div>
                          </div>
                        </div>
                      ))}
                      {(events ?? []).length === 0 && <div className="text-[12.5px] text-muted">Событий пока нет.</div>}
                    </div>
                  </div>
                </div>
              )}

              {tab === "Диалоги" && (
                <div className="space-y-3">
                  {fanConversations.map((c) => (
                    <Link
                      key={c.id}
                      to={`/conversations?fan=${fan.id}`}
                      className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2/40 px-4 py-3 transition-colors hover:border-line-2"
                    >
                      <MessagesSquare className="size-4 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">{c.subject}</div>
                        <div className="text-[11.5px] text-faint">{c.channel} · {ago(c.lastMessageAt)}</div>
                      </div>
                      {c.awaitingApproval > 0 && <Badge tone="warn">{c.awaitingApproval} черн.</Badge>}
                      {c.unread > 0 && <Badge tone="accent">{c.unread} новых</Badge>}
                    </Link>
                  ))}
                  {fanConversations.length === 0 && (
                    <EmptyState
                      icon={<MessagesSquare className="size-4" />}
                      title="Диалогов нет"
                      description="С этим фаном ещё не связывались."
                    />
                  )}
                </div>
              )}

              {tab === "Покупки" && (
                <div className="space-y-1">
                  {(purchases ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0">
                      <CircleDollarSign className="size-4 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-ink">{p.offer}</div>
                        <div className="text-[11.5px] text-faint">
                          {label(p.kind)} · {longDate(p.at)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} dot={false} />
                      <span className="num w-20 text-right text-[13px] font-medium text-ink">
                        {currency(p.amount, { cents: true })}
                      </span>
                    </div>
                  ))}
                  {(purchases ?? []).length === 0 && (
                    <EmptyState icon={<CircleDollarSign className="size-4" />} title="Покупок пока нет" description="Этот фан ещё не тратил деньги." />
                  )}
                </div>
              )}

              {tab === "Воспоминания" && (
                <div className="space-y-3">
                  {(memories ?? []).map((m) => (
                    <div key={m.id} className="rounded-lg border border-line bg-canvas-2/40 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-ink">{m.statement}</span>
                        <Badge>{label(m.category)}</Badge>
                        <span className="num ml-auto text-[11px] text-faint">{ago(m.createdAt)}</span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <ProgressBar value={m.confidence} className="flex-1" height={3} />
                        <span className="num text-[11px] text-muted">{m.confidence}%</span>
                        <span className="text-[11px] text-faint">{m.source}</span>
                      </div>
                    </div>
                  ))}
                  {(memories ?? []).length === 0 && (
                    <EmptyState
                      icon={<Brain className="size-4" />}
                      title="Воспоминаний пока нет"
                      description="Агент памяти ещё не извлекал факты из диалогов этого фана."
                    />
                  )}
                </div>
              )}

              {tab === "События" && (
                <div className="relative pl-5">
                  <span className="absolute top-1 bottom-1 left-[5px] w-px bg-line" />
                  {(events ?? []).map((e) => (
                    <div key={e.id} className="relative pb-5 last:pb-0">
                      <span className="absolute top-1 -left-5 size-[9px] rounded-full border-2 border-surface bg-accent/80" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-medium text-ink">{e.title}</span>
                        <Badge tone={e.type === "purchase" || e.type === "tip" ? "pos" : "neutral"}>{EVENT_TYPE_LABELS[e.type] ?? e.type}</Badge>
                        {e.amount && <span className="num text-[12px] text-pos">{currency(e.amount, { cents: true })}</span>}
                      </div>
                      <div className="mt-1 text-[12px] text-muted">{e.detail}</div>
                      <div className="num mt-1 text-[11px] text-faint">{longDate(e.at)}</div>
                    </div>
                  ))}
                  {(events ?? []).length === 0 && (
                    <EmptyState icon={<CalendarClock className="size-4" />} title="Событий нет" />
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {recommendation && (
            <div className="relative overflow-hidden rounded-xl border border-accent/25 bg-accent/[0.05] p-5">
              <span className="absolute inset-y-0 left-0 w-[2px] bg-accent/70" />
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-accent-hi" strokeWidth={1.9} />
                <span className="text-[10.5px] font-semibold tracking-[0.1em] text-accent-hi uppercase">
                  AI-рекомендация
                </span>
              </div>
              <h3 className="mt-3 text-[14px] font-medium text-ink">{recommendation.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{recommendation.body}</p>
              <div className="mt-3 rounded-lg border border-line bg-canvas-2/60 p-3">
                <div className="label">Предлагаемое действие</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{recommendation.action}</p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="label">Уверенность</span>
                  <span
                    className={cn(
                      "num text-[12.5px] font-medium",
                      recommendation.confidence >= 85 ? "text-pos" : "text-warn",
                    )}
                  >
                    {recommendation.confidence}%
                  </span>
                </div>
                <Button variant="primary" size="sm" onClick={() => navigate(`/conversations?fan=${fan.id}`)}>
                  <Send className="size-3.5" /> Открыть в инбоксе
                </Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Сводка воспоминаний" subtitle={`${(memories ?? []).length} записей · ${(memories ?? []).reduce((s, m) => s + m.confidence, 0) / Math.max(1, (memories ?? []).length) | 0}% средняя уверенность`} />
            <div className="space-y-2 px-5 pb-5">
              {(memories ?? []).slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <div>
                    <div className="text-[12.5px] text-ink-2">{m.statement}</div>
                    <div className="text-[11px] text-faint">{label(m.category)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Ценность" subtitle="Вклад за всё время" />
            <div className="grid grid-cols-2 gap-5 px-5 pb-5">
              <KeyStat label="LTV" value={currency(fan.ltv)} hint="за всё время" />
              <KeyStat label="Заказы" value={fmtNum(fan.purchases)} hint="оплаченные" />
              <KeyStat label="Средний чек" value={currency(Math.round(fan.ltv / Math.max(1, fan.purchases)))} hint="на покупку" />
              <KeyStat label="Месяцев" value={Math.max(1, Math.round((Date.now() - new Date(fan.joined).getTime()) / 2_592_000_000))} hint="в базе" />
            </div>
          </Card>

          <AINote title="Агент памяти">
            Следующий пересмотр воспоминаний для {fan.name.split(" ")[0]} — после следующих 5 диалогов.
          </AINote>
        </div>
      </div>
    </PageContainer>
  );
}
