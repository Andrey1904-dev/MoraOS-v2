import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  CircleDollarSign,
  MessagesSquare,
  Pencil,
  Send,
  Sparkles,
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
import { cn } from "@/utils/cn";

const TABS = ["Overview", "Conversations", "Purchases", "Memories", "Events"] as const;

export default function FanProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  const { data: fan, loading } = useResource(() => repositories.fans.get(id), [id]);
  const { data: memories } = useResource(() => repositories.fans.memories(id), [id]);
  const { data: events } = useResource(() => repositories.fans.events(id), [id]);
  const { data: purchases } = useResource(() => repositories.fans.purchases(id), [id]);
  const { data: conversations } = useResource(() => repositories.conversations.list());

  const fanConversations = useMemo(
    () => (conversations ?? []).filter((c) => c.fanId === id),
    [conversations, id],
  );

  const recommendation = useMemo(() => {
    if (!fan) return null;
    if (fan.status === "Churn risk")
      return {
        title: "Win-back before day 10",
        body: `${fan.name} cancelled ${fan.subscription?.status === "Cancelled" ? "recently" : ""} and has not opened a message in 6 days. Their memory shows they respond to value-first messaging, not discounts.`,
        action: "Send an honest win-back message referencing episode 03 — the last one they engaged with.",
        confidence: 74,
      };
    if (fan.relationship === "Visitor")
      return {
        title: "First contact not made",
        body: `${fan.name} arrived from ${fan.source} but has never been contacted. New visitors convert 3.4× better when the first message arrives within an hour.`,
        action: "Send an onboarding message pointing at episode 01.",
        confidence: 88,
      };
    const days = Math.round((Date.now() - new Date(fan.lastActivity).getTime()) / 86_400_000);
    return {
      title: "Purchase rhythm gap",
      body: `${fan.name} has not purchased anything in the last ${Math.max(days, 2)} days. Their purchase history and memories point at fitness content.`,
      action: `Send a personalized PPV related to ${memories?.[2]?.statement.toLowerCase() ?? "their favourite content"}.`,
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
            title="Fan not found"
            description="This fan may have been removed from the CRM."
            action={<Button onClick={() => navigate("/fans")}>Back to fans</Button>}
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
        <ArrowLeft className="size-3.5" /> Back to Fans
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
                <Badge tone={fan.relationship === "Inner circle" ? "accent" : "neutral"}>{fan.relationship}</Badge>
                <StatusBadge status={fan.status} />
                <Badge>{fan.source}</Badge>
                <span className="text-[12px] text-faint">{fan.location}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => push({ title: "Profile edit", description: "Manual edits land with the CRM layer.", tone: "default" })}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Link to={`/conversations?fan=${fan.id}`}>
              <Button variant="secondary">
                <MessagesSquare className="size-3.5" /> Open conversation
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "LTV", value: currency(fan.ltv, { cents: fan.ltv % 1 !== 0 }) },
            { label: "Purchases", value: fmtNum(fan.purchases) },
            { label: "Subscription", value: fan.subscription?.status ?? "None" },
            { label: "Last activity", value: ago(fan.lastActivity) },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-5 py-4">
              <div className="label">{s.label}</div>
              <div className="num mt-1.5 text-[16px] font-medium text-ink">{s.value}</div>
              {s.label === "Subscription" && fan.subscription && (
                <div className="mt-0.5 text-[11.5px] text-faint">{fan.subscription.plan} · renews {fan.subscription.renews}</div>
              )}
              {s.label === "Last activity" && (
                <div className="mt-0.5 text-[11.5px] text-faint">joined {longDate(fan.joined)}</div>
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
              {tab === "Overview" && (
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="label mb-2.5">Journey</div>
                      <div className="space-y-3">
                        {[
                          { label: "Source", value: fan.source },
                          { label: "Joined", value: longDate(fan.joined) },
                          { label: "Relationship", value: fan.relationship },
                          { label: "Spend tier", value: fan.ltv >= 500 ? "Top 10%" : fan.ltv >= 150 ? "Mid" : "Entry" },
                        ].map((r) => (
                          <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                            <span className="text-muted">{r.label}</span>
                            <span className="text-ink">{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="label mb-2.5">Signals</div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[12px]">
                            <span className="text-muted">Engagement score</span>
                            <span className="num text-ink">{fan.status === "Sleeping" ? 31 : 82}/100</span>
                          </div>
                          <ProgressBar value={fan.status === "Sleeping" ? 31 : 82} tone={fan.status === "Sleeping" ? "warn" : "accent"} />
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[12px]">
                            <span className="text-muted">Churn risk</span>
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
                    <div className="label mb-3">Recent timeline</div>
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
                      {(events ?? []).length === 0 && <div className="text-[12.5px] text-muted">No events recorded yet.</div>}
                    </div>
                  </div>
                </div>
              )}

              {tab === "Conversations" && (
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
                      {c.awaitingApproval > 0 && <Badge tone="warn">{c.awaitingApproval} draft</Badge>}
                      {c.unread > 0 && <Badge tone="accent">{c.unread} new</Badge>}
                    </Link>
                  ))}
                  {fanConversations.length === 0 && (
                    <EmptyState
                      icon={<MessagesSquare className="size-4" />}
                      title="No conversations"
                      description="This fan has not been contacted yet."
                    />
                  )}
                </div>
              )}

              {tab === "Purchases" && (
                <div className="space-y-1">
                  {(purchases ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0">
                      <CircleDollarSign className="size-4 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-ink">{p.offer}</div>
                        <div className="text-[11.5px] text-faint">
                          {p.kind} · {longDate(p.at)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} dot={false} />
                      <span className="num w-20 text-right text-[13px] font-medium text-ink">
                        {currency(p.amount, { cents: true })}
                      </span>
                    </div>
                  ))}
                  {(purchases ?? []).length === 0 && (
                    <EmptyState icon={<CircleDollarSign className="size-4" />} title="No purchases yet" description="This fan has not spent money." />
                  )}
                </div>
              )}

              {tab === "Memories" && (
                <div className="space-y-3">
                  {(memories ?? []).map((m) => (
                    <div key={m.id} className="rounded-lg border border-line bg-canvas-2/40 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-ink">{m.statement}</span>
                        <Badge>Category: {m.category}</Badge>
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
                      title="No memories yet"
                      description="The Memory Agent has not extracted facts from this fan's conversations."
                    />
                  )}
                </div>
              )}

              {tab === "Events" && (
                <div className="relative pl-5">
                  <span className="absolute top-1 bottom-1 left-[5px] w-px bg-line" />
                  {(events ?? []).map((e) => (
                    <div key={e.id} className="relative pb-5 last:pb-0">
                      <span className="absolute top-1 -left-5 size-[9px] rounded-full border-2 border-surface bg-accent/80" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-medium text-ink">{e.title}</span>
                        <Badge tone={e.type === "purchase" || e.type === "tip" ? "pos" : "neutral"}>{e.type}</Badge>
                        {e.amount && <span className="num text-[12px] text-pos">{currency(e.amount, { cents: true })}</span>}
                      </div>
                      <div className="mt-1 text-[12px] text-muted">{e.detail}</div>
                      <div className="num mt-1 text-[11px] text-faint">{longDate(e.at)}</div>
                    </div>
                  ))}
                  {(events ?? []).length === 0 && (
                    <EmptyState icon={<CalendarClock className="size-4" />} title="No events" />
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
                  AI Recommendation
                </span>
              </div>
              <h3 className="mt-3 text-[14px] font-medium text-ink">{recommendation.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{recommendation.body}</p>
              <div className="mt-3 rounded-lg border border-line bg-canvas-2/60 p-3">
                <div className="label">Suggested action</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{recommendation.action}</p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="label">Confidence</span>
                  <span
                    className={cn(
                      "num text-[12.5px] font-medium",
                      recommendation.confidence >= 85 ? "text-pos" : "text-warn",
                    )}
                  >
                    {recommendation.confidence}%
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    push({
                      title: "Draft created",
                      description: "The message was saved as a draft — nothing was sent.",
                      tone: "success",
                    })
                  }
                >
                  <Send className="size-3.5" /> Draft message
                </Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Memory summary" subtitle={`${(memories ?? []).length} memories · ${(memories ?? []).reduce((s, m) => s + m.confidence, 0) / Math.max(1, (memories ?? []).length) | 0}% avg confidence`} />
            <div className="space-y-2 px-5 pb-5">
              {(memories ?? []).slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <div>
                    <div className="text-[12.5px] text-ink-2">{m.statement}</div>
                    <div className="text-[11px] text-faint">{m.category}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Value" subtitle="Lifetime contribution" />
            <div className="grid grid-cols-2 gap-5 px-5 pb-5">
              <KeyStat label="LTV" value={currency(fan.ltv)} hint="lifetime" />
              <KeyStat label="Orders" value={fmtNum(fan.purchases)} hint="paid events" />
              <KeyStat label="Avg order" value={currency(Math.round(fan.ltv / Math.max(1, fan.purchases)))} hint="per purchase" />
              <KeyStat label="Months" value={Math.max(1, Math.round((Date.now() - new Date(fan.joined).getTime()) / 2_592_000_000))} hint="in base" />
            </div>
          </Card>

          <AINote title="Memory Agent">
            Next memory review for {fan.name.split(" ")[0]} is scheduled after the next 5 conversations.
          </AINote>
        </div>
      </div>
    </PageContainer>
  );
}
