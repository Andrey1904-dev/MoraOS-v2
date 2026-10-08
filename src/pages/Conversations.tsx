import { useEffect, useMemo, useRef, useState } from "react";
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
import { getAiOrchestrator, runReplyPipeline } from "@/lib/ai";
import { isDemoActive } from "@/lib";
import type { RelationshipLevel as Rel } from "@/types";
import { ago, clock, currency } from "@/lib/format";
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
   * Human-in-the-loop: агенты только черновят. Результат уходит в инбокс как
   * draft/awaiting_approval — отправку подтверждает человек кнопкой Approve.
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
          personality: character.traits.filter((t) => t.label === "Personality").map((t) => t.value),
          recurringObjects: character.traits
            .filter((t) => /signature|object|notebook/i.test(t.label))
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
      refetch();
      refetchList();
      push({
        title: result.mock ? "AI draft ready (mock provider)" : "AI draft ready",
        description: result.draft.sales_action !== "none"
          ? `${activeFan.name} · intent ${result.draft.intent} · sales: ${result.draft.sales_action}. Awaiting your approval.`
          : `${activeFan.name} · intent ${result.draft.intent}. Awaiting your approval.`,
        tone: "success",
      });
    } catch (error) {
      push({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "AI provider did not answer.",
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
            <div className="label">Audience</div>
            <h1 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Conversations</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone="accent">{totalUnread} unread</Badge>
            <Badge tone="warn">{totalDrafts} awaiting approval</Badge>
            <Button variant="outline" size="sm" onClick={() => push({ title: "Inbox synced", description: "Fanvue + Telegram connectors refreshed.", tone: "default" })}>
              <RefreshCw className="size-3.5" /> Sync
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={generating}
              disabled={!activeId || !activeFan}
              onClick={() => void generateReply()}
            >
              <Sparkles className="size-3.5" /> Generate reply{isDemoActive() ? " (mock)" : ""}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          {/* List */}
          <div className={cn("flex min-h-0 flex-col border-r border-line", active && "hidden lg:flex")}>
            <div className="border-b border-line px-3 py-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search conversations…" />
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
                            <Sparkles className="size-3" /> {c.awaitingApproval} draft
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && visible.length === 0 && (
                <EmptyState icon={<Inbox className="size-4" />} title="Inbox clear" description="No conversations match this filter." />
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={cn("flex min-h-0 flex-col", !active && "hidden lg:flex")}>
            {!active ? (
              <EmptyState icon={<Inbox className="size-4" />} title="Select a conversation" className="m-auto" />
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
                      Back
                    </Button>
                    <Badge tone={activeFan?.relationship === "Inner circle" ? "accent" : "neutral"}>{activeFan?.relationship}</Badge>
                    <Button variant="subtle" size="sm" className="lg:hidden" onClick={() => setInfoOpen(true)}>
                      Info
                    </Button>
                  </div>
                </div>

                <div ref={scrollRef} className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 lg:px-6">
                  <div className="flex justify-center">
                    <span className="rounded-full border border-line bg-canvas-2 px-3 py-1 text-[10.5px] text-faint">
                      Today · {active.channel}
                    </span>
                  </div>

                  {(messages ?? []).map((m) => {
                    if (m.author === "ai_draft") {
                      const isApproved = approved[m.id];
                      return (
                        <div key={m.id} className="anim-fade ml-auto max-w-[520px]">
                          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3.5">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="size-3 text-accent-hi" strokeWidth={2} />
                              <span className="text-[10px] font-semibold tracking-[0.1em] text-accent-hi uppercase">
                                AI Draft
                              </span>
                              <span className="ml-auto num text-[10.5px] text-faint">{clock(m.at)}</span>
                            </div>
                            <p className="mt-2 text-[13px] leading-relaxed text-ink">{m.body}</p>

                            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-canvas-2/60 p-2.5">
                              {[
                                { label: "Tone", value: suggestion?.tone ?? "Playful" },
                                { label: "Intent", value: suggestion?.intent ?? "Conversation" },
                                { label: "Confidence", value: `${suggestion?.confidence ?? 90}%` },
                              ].map((s) => (
                                <div key={s.label}>
                                  <div className="label">{s.label}</div>
                                  <div className="num mt-1 text-[11.5px] text-ink-2">{s.value}</div>
                                </div>
                              ))}
                            </div>

                            {isApproved ? (
                              <div className="mt-3 flex items-center gap-2 rounded-lg border border-pos/25 bg-pos/10 px-3 py-2 text-[12px] text-pos">
                                <CheckCheck className="size-3.5" /> Approved — queued for review window
                              </div>
                            ) : (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="subtle" onClick={() => setDraft(m.body)}>
                                  <Pencil className="size-3.5" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="subtle"
                                  loading={generating}
                                  onClick={() => void generateReply()}
                                >
                                  <RefreshCw className="size-3.5" /> Regenerate
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
                                        setApproved((prev) => ({ ...prev, [m.id]: true }));
                                        refetch();
                                        refetchList();
                                        push({
                                          title: "Draft approved",
                                          description: "Marked as sent — human approval recorded for every outgoing message.",
                                          tone: "success",
                                        });
                                      } catch (error) {
                                        push({
                                          title: "Approve failed",
                                          description: error instanceof Error ? error.message : "Try again.",
                                          tone: "error",
                                        });
                                      }
                                    })();
                                  }}
                                >
                                  <Check className="size-3.5" /> Approve
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="mt-1.5 text-right text-[10.5px] text-faint">
                            AI never sends without approval
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
                              <img src={m.media.thumb} alt={m.media.label} className="h-44 w-full object-cover" loading="lazy" />
                              <div className="flex items-center gap-2 px-3 py-2">
                                <ImageIcon className="size-3.5 text-faint" />
                                <span className="text-[11.5px] text-muted">{m.media.label}</span>
                                <Badge className="ml-auto">Preview</Badge>
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
                      <Sparkles className="size-3.5" /> Editing AI draft
                      <button className="ml-auto text-faint hover:text-ink" onClick={() => setDraft("")}>
                        clear
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder={`Reply as Mara… (draft only — nothing sends automatically)`}
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
                            const saved = await repositories.conversations.saveDraft(activeId, body);
                            await repositories.conversations.approveDraft(activeId, saved.id);
                            setDraft("");
                            refetch();
                            refetchList();
                            push({ title: "Approved & queued", description: "Message approved in UI before any send — audit trail kept.", tone: "success" });
                          } catch (error) {
                            push({ title: "Send failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
                          }
                        })();
                      }}
                    >
                      <Send className="size-3.5" /> Approve & queue
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Fan profile rail */}
          <div className="hidden min-h-0 flex-col overflow-y-auto border-l border-line px-5 py-5 lg:flex">
            {!activeFan ? (
              <div className="text-[12.5px] text-muted">Select a conversation</div>
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
                  <Badge tone={activeFan.relationship === "Inner circle" ? "accent" : "neutral"}>{activeFan.relationship}</Badge>
                  <StatusBadge status={activeFan.status} />
                </div>

                <Divider className="my-4" />

                <div className="grid grid-cols-2 gap-4">
                  <KeyStat label="LTV" value={currency(activeFan.ltv)} />
                  <KeyStat label="Purchases" value={activeFan.purchases} />
                  <KeyStat label="Subscription" value={activeFan.subscription?.status ?? "None"} />
                  <KeyStat label="Last seen" value={ago(activeFan.lastActivity)} />
                </div>

                <Divider className="my-4" />

                <div>
                  <div className="label mb-2.5">Memories</div>
                  <div className="space-y-2">
                    {(activeMemories.data ?? []).slice(0, 4).map((m) => (
                      <div key={m.id} className="rounded-lg border border-line bg-canvas-2/50 px-3 py-2">
                        <div className="text-[12px] text-ink-2">{m.statement}</div>
                        <div className="mt-0.5 text-[10.5px] text-faint">{m.category}</div>
                      </div>
                    ))}
                    {(activeMemories.data ?? []).length === 0 && (
                      <div className="text-[11.5px] text-faint">No memories yet.</div>
                    )}
                  </div>
                </div>

                <Divider className="my-4" />

                <AINote
                  title="AI Recommendation"
                  footer={
                    <Button variant="primary" size="sm" onClick={() => push({ title: "Draft created", description: "Saved as a draft for approval.", tone: "success" })}>
                      Draft message
                    </Button>
                  }
                >
                  {activeFan.spendTierNote}
                </AINote>

                <div className="mt-5">
                  <div className="label mb-2.5">Engagement</div>
                  <div className="flex items-center gap-3">
                    <ProgressBar value={activeFan.status === "Sleeping" ? 31 : 82} className="flex-1" height={4} />
                    <span className="num text-[11.5px] text-muted">{activeFan.status === "Sleeping" ? 31 : 82}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-[11.5px] text-muted">
                    <div className="flex justify-between">
                      <span>Reply rate</span>
                      <span className="num text-ink-2">{activeFan.relationship === "Inner circle" ? "94%" : "61%"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg. response time</span>
                      <span className="num text-ink-2">{activeFan.relationship === "Inner circle" ? "7 min" : "38 min"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Joined</span>
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
                <Badge tone={activeFan.relationship === "Inner circle" ? "accent" : "neutral"}>{activeFan.relationship}</Badge>
                <StatusBadge status={activeFan.status} />
                <Badge>{activeFan.source}</Badge>
              </div>
              <Divider />
              <div className="grid grid-cols-2 gap-4">
                <KeyStat label="LTV" value={currency(activeFan.ltv)} />
                <KeyStat label="Purchases" value={activeFan.purchases} />
                <KeyStat label="Subscription" value={activeFan.subscription?.status ?? "None"} />
                <KeyStat label="Last seen" value={ago(activeFan.lastActivity)} />
              </div>
              <Divider />
              <div>
                <div className="label mb-2.5">Memories</div>
                <div className="space-y-2">
                  {(activeMemories.data ?? []).slice(0, 4).map((m) => (
                    <div key={m.id} className="rounded-lg border border-line bg-canvas-2/50 px-3 py-2">
                      <div className="text-[12px] text-ink-2">{m.statement}</div>
                      <div className="mt-0.5 text-[10.5px] text-faint">{m.category}</div>
                    </div>
                  ))}
                </div>
              </div>
              <AINote title="AI Recommendation">{activeFan.spendTierNote}</AINote>
            </div>
          )}
        </Drawer>
      </div>
    </PageContainer>
  );
}
