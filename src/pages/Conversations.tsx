import { useEffect, useMemo, useRef, useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  CheckCheck,
  Image as ImageIcon,
  Inbox,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { PageContainer } from "@/components/layout/Page";
import { Badge, StatusBadge, Avatar, KeyStat, Divider, ProgressBar } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterChips, SearchInput } from "@/components/ui/Controls";
import { Drawer } from "@/components/ui/Overlays";
import { EmptyState, SkeletonRows, useToast } from "@/components/ui/Feedback";
import { AINote } from "@/components/common/AICard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { trackEvent } from "@/lib/events";
import { getAiOrchestrator, runReplyPipeline } from "@/lib/ai";
import { isDemoActive } from "@/lib";
import type { RelationshipLevel as Rel } from "@/types";
import { ago, clock, currency } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/utils/cn";

const FILTERS = ["All", "Unread", "Awaiting approval", "Inner circle", "Unanswered"] as const;

export default function Conversations() {
  const [params] = useSearchParams();
  const { push } = useToast();
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations, loading, refetch: refetchList } = useResource(() => repositories.conversations.list());
  const { data: fans } = useResource(() => repositories.fans.list());

  useEffect(() => {
    if (!conversations) return;
    const fanParam = params.get("fan");
    const target = fanParam ? conversations.find((c) => c.fanId === fanParam) : conversations[0];
    if (target) setActiveId((prev) => prev ?? target.id);
  }, [conversations, params]);

  const active = conversations?.find((c) => c.id === activeId) ?? null;
  const { data: messages, refetch } = useResource(
    () => repositories.conversations.messages(activeId ?? ""),
    [activeId],
  );
  const activeFan = fans?.find((f) => f.id === active?.fanId);
  const activeMemories = useResource(() => repositories.fans.memories(activeFan?.id ?? ""), [activeFan?.id]);

  const visible = useMemo(() => {
    let list = [...(conversations ?? [])];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const fan = fans?.find((f) => f.id === c.fanId);
        return fan?.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
      });
    }
    if (filter === "Unread") list = list.filter((c) => c.unread > 0);
    if (filter === "Awaiting approval") list = list.filter((c) => c.awaitingApproval > 0);
    if (filter === "Inner circle")
      list = list.filter((c) => fans?.find((f) => f.id === c.fanId)?.relationship === "Inner circle");
    if (filter === "Unanswered") list = list.filter((c) => c.awaitingApproval > 0 || c.unread > 0);
    return list.sort((a, b) => (a.pinned ? -1 : 1) - (b.pinned ? -1 : 1) || b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [conversations, fans, filter, search]);

  const totalUnread = (conversations ?? []).reduce((s, c) => s + c.unread, 0);
  const totalDrafts = (conversations ?? []).reduce((s, c) => s + c.awaitingApproval, 0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const suggestion = active?.aiSuggestion;

  const REL_TO_KEY: Record<Rel, "visitor" | "follower" | "regular" | "fan" | "favorite" | "inner_circle"> = {
    Visitor: "visitor",
    Follower: "follower",
    Regular: "regular",
    Fan: "fan",
    Favorite: "favorite",
    "Inner circle": "inner_circle",
  };

  /**
   * Human-in-the-loop: agents only draft. The result lands in the inbox as
   * awaiting_approval; a person approves it. Approval records the decision;
   * delivery to fans is not connected yet.
   */
  const generateReply = async () => {
    if (!activeId || !activeFan || generating) return;
    setGenerating(true);
    try {
      const [character, offers, memories] = await Promise.all([
        repositories.character.get(),
        repositories.commerce.offers(),
        repositories.fans.memories(activeFan.id),
      ]);
      const history = (messages ?? [])
        .filter((m) => m.author === "fan" || m.author === "mara")
        .slice(-10)
        .map((m) => ({ author: m.author as "fan" | "mara", body: m.body, at: m.at }));
      const orchestrator = getAiOrchestrator();
      const result = await runReplyPipeline(orchestrator, {
        character: {
          name: character.name,
          voice: character.voice,
          story: character.story,
          lore: character.logline,
          boundaries: character.boundaries,
          personality: character.traits.filter((t) => t.label === "Характер").map((t) => t.value),
          recurringObjects: character.traits
            .filter((t) => /фирменн|предмет|notebook/i.test(t.label))
            .map((t) => t.value),
        },
        fan: {
          id: activeFan.id,
          name: activeFan.name,
          relationshipLevel: REL_TO_KEY[activeFan.relationship] ?? "fan",
          ltv: activeFan.ltv,
          purchases: activeFan.purchases,
          hasActiveSubscription: activeFan.subscription?.status === "Active",
          source: activeFan.source.toLowerCase(),
        },
        memories: memories.map((m) => ({ memory: m.statement, category: m.category, importance: m.confidence })),
        history,
        offers: offers.map((o) => ({ id: o.id, name: o.name, price: o.price, type: o.kind.toLowerCase() })),
      });
      await repositories.conversations.saveDraft(activeId, result.draft.reply, {
        tone: "mara",
        intent: result.draft.intent,
        confidence: result.draft.confidence,
      });
      void trackEvent({
        type: "ai_generated",
        entityType: "conversation",
        entityId: activeId,
        payload: { intent: result.draft.intent, confidence: result.draft.confidence, mock: result.mock },
      });
      refetch();
      refetchList();
      push({
        title: result.mock ? "AI-черновик готов (mock-провайдер)" : "AI-черновик готов",
        description: result.draft.sales_action !== "none"
          ? `${activeFan.name} · намерение ${result.draft.intent} · продажа: ${result.draft.sales_action}. Ждёт вашего одобрения.`
          : `${activeFan.name} · намерение ${result.draft.intent}. Ждёт вашего одобрения.`,
        tone: "success",
      });
    } catch (error) {
      push({
        title: "Не удалось сгенерировать",
        description: error instanceof Error ? error.message : "AI-провайдер не ответил.",
        tone: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PageContainer className="max-w-none px-0 py-0 lg:px-0 lg:py-0">
      <div className="flex h-[calc(100vh-56px)] min-h-0 flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 lg:px-6">
          <div>
            <div className="label">Аудитория</div>
            <h1 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Диалоги</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone="accent">{totalUnread} непрочитанных</Badge>
            <Badge tone="warn">{totalDrafts} ждут одобрения</Badge>
            {/* Коннекторов (Fanvue, Telegram-инбокс) в приложении пока нет: честно выключено. */}
            <Button variant="outline" size="sm" disabled title="Коннекторы пока не подключены" aria-label="Синхронизировать инбокс (коннекторы не подключены)">
              <RefreshCw className="size-3.5" /> Синхронизация
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={generating}
              disabled={!activeId || !activeFan}
              onClick={() => void generateReply()}
            >
              <Sparkles className="size-3.5" /> Сгенерировать ответ{isDemoActive() ? " (mock)" : ""}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          {/* List */}
          <div className={cn("flex min-h-0 flex-col border-r border-line", active && "hidden lg:flex")}>
            <div className="border-b border-line px-3 py-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Поиск по диалогам…" />
              <FilterChips options={FILTERS} value={filter as (typeof FILTERS)[number]} onChange={setFilter} className="mt-3" />
            </div>
            <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
              {loading && <SkeletonRows rows={6} />}
              {visible.map((c) => {
                const fan = fans?.find((f) => f.id === c.fanId);
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setDraft("");
                    }}
                    className={cn(
                      "flex w-full gap-3 border-b border-line/60 px-3 py-3 text-left transition-colors",
                      isActive ? "bg-surface-2" : "hover:bg-surface-2/60",
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={fan?.name ?? "?"} tone={fan?.avatarTone} size={34} />
                      {c.unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-semibold text-white">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("truncate text-[13px]", c.unread ? "font-medium text-ink" : "text-ink-2")}>
                          {fan?.name}
                        </span>
                        {fan?.relationship === "Inner circle" && <Star className="size-3 shrink-0 text-accent-hi" />}
                        <span className="num ml-auto shrink-0 text-[10.5px] text-faint">{ago(c.lastMessageAt)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted">{c.subject}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge tone={c.channel === "Fanvue" ? "info" : "neutral"}>{c.channel}</Badge>
                        {c.awaitingApproval > 0 && (
                          <span className="flex items-center gap-1 text-[10.5px] text-warn">
                            <Sparkles className="size-3" /> {c.awaitingApproval} черн.
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && visible.length === 0 && (
                <EmptyState icon={<Inbox className="size-4" />} title="Инбокс пуст" description="Под этот фильтр не подходит ни один диалог." />
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={cn("flex min-h-0 flex-col", !active && "hidden lg:flex")}>
            {!active ? (
              <EmptyState icon={<Inbox className="size-4" />} title="Выберите диалог" className="m-auto" />
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <Avatar name={activeFan?.name ?? "?"} tone={activeFan?.avatarTone} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{activeFan?.name}</div>
                    <div className="text-[11px] text-faint">
                      {active.channel} · {active.subject}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setActiveId(null)}>
                      Назад
                    </Button>
                    <Badge tone={activeFan?.relationship === "Inner circle" ? "accent" : "neutral"}>{label(activeFan?.relationship)}</Badge>
                    <Button variant="subtle" size="sm" className="lg:hidden" onClick={() => setInfoOpen(true)}>
                      Инфо
                    </Button>
                  </div>
                </div>

                <div ref={scrollRef} className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 lg:px-6">
                  <div className="flex justify-center">
                    <span className="rounded-full border border-line bg-canvas-2 px-3 py-1 text-[10.5px] text-faint">
                      Сегодня · {active.channel}
                    </span>
                  </div>

                  {(messages ?? []).map((m) => {
                    if (m.author === "ai_draft") {
                      const isApproved = Boolean(approved[m.id]) || m.state === "approved";
                      return (
                        <div key={m.id} className="anim-fade ml-auto max-w-[520px]">
                          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3.5">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="size-3 text-accent-hi" strokeWidth={2} />
                              <span className="text-[10px] font-semibold tracking-[0.1em] text-accent-hi uppercase">
                                AI-черновик
                              </span>
                              <span className="ml-auto num text-[10.5px] text-faint">{clock(m.at)}</span>
                            </div>
                            <p className="mt-2 text-[13px] leading-relaxed text-ink">{m.body}</p>

                            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-canvas-2/60 p-2.5">
                              {[
                                { label: "Тон", value: suggestion?.tone ?? "Игривый" },
                                { label: "Намерение", value: suggestion?.intent ?? "Разговор" },
                                { label: "Уверенность", value: `${suggestion?.confidence ?? 90}%` },
                              ].map((s) => (
                                <div key={s.label}>
                                  <div className="label">{s.label}</div>
                                  <div className="num mt-1 text-[11.5px] text-ink-2">{s.value}</div>
                                </div>
                              ))}
                            </div>

                            {isApproved ? (
                              <div className="mt-3 flex items-center gap-2 rounded-lg border border-pos/25 bg-pos/10 px-3 py-2 text-[12px] text-pos">
                                <CheckCheck className="size-3.5" /> Одобрено — записано, фану ещё не доставлено
                              </div>
                            ) : (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="subtle" onClick={() => setDraft(m.body)}>
                                  <Pencil className="size-3.5" /> Изменить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="subtle"
                                  loading={generating}
                                  onClick={() => void generateReply()}
                                >
                                  <RefreshCw className="size-3.5" /> Перегенерировать
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="ml-auto"
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        if (!activeId) return;
                                        await repositories.conversations.approveDraft(activeId, m.id);
                                        void trackEvent({ type: "reply_approved", entityType: "message", entityId: m.id });
                                        setApproved((prev) => ({ ...prev, [m.id]: true }));
                                        refetch();
                                        refetchList();
                                        push({
                                          title: "Черновик одобрен",
                                          description: "Записано как одобренное. Доставка фану не подключена, поэтому ничего не отправлено.",
                                          tone: "success",
                                        });
                                      } catch (error) {
                                        push({
                                          title: "Не удалось одобрить",
                                          description: error instanceof Error ? error.message : "Попробуйте ещё раз.",
                                          tone: "error",
                                        });
                                      }
                                    })();
                                  }}
                                >
                                  <Check className="size-3.5" /> Одобрить
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="mt-1.5 text-right text-[10.5px] text-faint">
                            AI-черновики ждут вашего одобрения. Доставка фанам не подключена.
                          </div>
                        </div>
                      );
                    }

                    const mine = m.author === "mara";
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[520px]", mine && "text-right")}>
                          {m.media ? (
                            <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
                              <SafeImg src={m.media.thumb} alt={m.media.label} className="h-44 w-full object-cover" loading="lazy" />
                              <div className="flex items-center gap-2 px-3 py-2">
                                <ImageIcon className="size-3.5 text-faint" />
                                <span className="text-[11.5px] text-muted">{m.media.label}</span>
                                <Badge className="ml-auto">Превью</Badge>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                                mine ? "bg-accent/15 text-ink" : "border border-line bg-surface-2 text-ink-2",
                              )}
                            >
                              {m.body}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                            {mine && <span className="ml-auto">{mine ? "Mara" : activeFan?.name}</span>}
                            {mine && m.state === "approved" && <span className="text-warn">Одобрено · не доставлено</span>}
                            <span className="num">{clock(m.at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!messages && <SkeletonRows rows={4} />}
                </div>

                {/* Composer */}
                <div className="border-t border-line px-4 py-3 lg:px-6">
                  {draft && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2 text-[12px] text-accent-hi">
                      <Sparkles className="size-3.5" /> Правка AI-черновика
                      <button className="ml-auto text-faint hover:text-ink" onClick={() => setDraft("")}>
                        очистить
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="Ответить как Мара… (сохранится как одобренное; фану пока не доставляется)"
                      aria-label="Ответить как Мара"
                      className="max-h-32 min-h-[46px] flex-1 resize-none rounded-[10px] border border-line bg-canvas-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink transition-colors placeholder:text-faint focus:border-line-2 focus:outline-none"
                    />
                    <Button
                      variant="primary"
                      className="h-[46px]"
                      onClick={() => {
                        const body = draft.trim();
                        if (!body || !activeId) return;
                        void (async () => {
                          try {
                            // Один вызов: сообщение записывается сразу как approved (решение оператора).
                            await repositories.conversations.sendMessage(activeId, { body, author: "mara" });
                            void trackEvent({ type: "reply_approved", entityType: "conversation", entityId: activeId });
                            setDraft("");
                            refetch();
                            refetchList();
                            push({
                              title: "Ответ записан",
                              description: "Сохранено как одобренное. Доставка фану не подключена, поэтому ничего не отправлено.",
                              tone: "success",
                            });
                          } catch (error) {
                            push({ title: "Не удалось сохранить ответ", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
                          }
                        })();
                      }}
                    >
                      <Send className="size-3.5" /> Записать ответ
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Fan profile rail */}
          <div className="hidden min-h-0 flex-col overflow-y-auto border-l border-line px-5 py-5 lg:flex">
            {!activeFan ? (
              <div className="text-[12.5px] text-muted">Выберите диалог</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={activeFan.name} tone={activeFan.avatarTone} size={44} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">{activeFan.name}</div>
                    <div className="text-[11.5px] text-faint">{activeFan.handle}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={activeFan.relationship === "Inner circle" ? "accent" : "neutral"}>{label(activeFan.relationship)}</Badge>
                  <StatusBadge status={activeFan.status} />
                </div>

                <Divider className="my-4" />

                <div className="grid grid-cols-2 gap-4">
                  <KeyStat label="LTV" value={currency(activeFan.ltv)} />
                  <KeyStat label="Покупки" value={activeFan.purchases} />
                  <KeyStat label="Подписка" value={activeFan.subscription ? label(activeFan.subscription.status) : label("None")} />
                  <KeyStat label="Был(а)" value={ago(activeFan.lastActivity)} />
                </div>

                <Divider className="my-4" />

                <div>
                  <div className="label mb-2.5">Воспоминания</div>
                  <div className="space-y-2">
                    {(activeMemories.data ?? []).slice(0, 4).map((m) => (
                      <div key={m.id} className="rounded-lg border border-line bg-canvas-2/50 px-3 py-2">
                        <div className="text-[12px] text-ink-2">{m.statement}</div>
                        <div className="mt-0.5 text-[10.5px] text-faint">{label(m.category)}</div>
                      </div>
                    ))}
                    {(activeMemories.data ?? []).length === 0 && (
                      <div className="text-[11.5px] text-faint">Воспоминаний пока нет.</div>
                    )}
                  </div>
                </div>

                <Divider className="my-4" />

                <AINote
                  title="AI-рекомендация"
                  footer={
                    <Button variant="primary" size="sm" loading={generating} onClick={() => void generateReply()}>
                      Черновик ответа
                    </Button>
                  }
                >
                  {activeFan.spendTierNote}
                </AINote>

                <div className="mt-5">
                  <div className="label mb-2.5">Вовлечённость</div>
                  <div className="flex items-center gap-3">
                    <ProgressBar value={activeFan.status === "Sleeping" ? 31 : 82} className="flex-1" height={4} />
                    <span className="num text-[11.5px] text-muted">{activeFan.status === "Sleeping" ? 31 : 82}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-[11.5px] text-muted">
                    <div className="flex justify-between">
                      <span>Доля ответов</span>
                      <span className="num text-ink-2">{activeFan.relationship === "Inner circle" ? "94%" : "61%"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Среднее время ответа</span>
                      <span className="num text-ink-2">{activeFan.relationship === "Inner circle" ? "7 мин" : "38 мин"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Локация</span>
                      <span className="num text-ink-2">{activeFan.location.split(",")[0]}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* Mobile fan profile drawer */}
        <Drawer open={infoOpen} onClose={() => setInfoOpen(false)} title={activeFan?.name} width="max-w-sm">
          {activeFan && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Avatar name={activeFan.name} tone={activeFan.avatarTone} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{activeFan.name}</div>
                  <div className="text-[11.5px] text-faint">{activeFan.handle}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={activeFan.relationship === "Inner circle" ? "accent" : "neutral"}>{label(activeFan.relationship)}</Badge>
                <StatusBadge status={activeFan.status} />
                <Badge>{activeFan.source}</Badge>
              </div>
              <Divider />
              <div className="grid grid-cols-2 gap-4">
                <KeyStat label="LTV" value={currency(activeFan.ltv)} />
                <KeyStat label="Покупки" value={activeFan.purchases} />
                <KeyStat label="Подписка" value={activeFan.subscription ? label(activeFan.subscription.status) : label("None")} />
                <KeyStat label="Был(а)" value={ago(activeFan.lastActivity)} />
              </div>
              <Divider />
              <div>
                <div className="label mb-2.5">Воспоминания</div>
                <div className="space-y-2">
                  {(activeMemories.data ?? []).slice(0, 4).map((m) => (
                    <div key={m.id} className="rounded-lg border border-line bg-canvas-2/50 px-3 py-2">
                      <div className="text-[12px] text-ink-2">{m.statement}</div>
                      <div className="mt-0.5 text-[10.5px] text-faint">{label(m.category)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <AINote title="AI-рекомендация">{activeFan.spendTierNote}</AINote>
            </div>
          )}
        </Drawer>
      </div>
    </PageContainer>
  );
}
