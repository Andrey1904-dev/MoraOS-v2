import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Eye,
  Images,
  Plus,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Avatar, ProgressBar, Divider } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/ui/Controls";
import { AreaChart, FunnelBars, StackedBars } from "@/components/ui/charts";
import { AICard } from "@/components/common/AICard";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories, story, actionQueue } from "@/repositories";
import { ago, number as fmtNum, signed } from "@/lib/format";
import { episodes } from "@/data/content";
import { media } from "@/data/media";
import { cn } from "@/utils/cn";

const toneRing: Record<string, string> = {
  warn: "bg-warn",
  pos: "bg-pos",
  accent: "bg-accent",
  neg: "bg-neg",
};

export default function Overview() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30 days");

  const { data: metrics, loading: loadingMetrics } = useResource(() => repositories.analytics.metrics(period), [period]);
  const { data: revenue } = useResource(() => repositories.analytics.revenue(period), [period]);
  const { data: audience } = useResource(() => repositories.analytics.audience(period), [period]);
  const { data: top } = useResource(() => repositories.analytics.topContent());
  const { data: insights } = useResource(() => repositories.ai.insights());
  const { data: funnel } = useResource(() => repositories.analytics.funnel());

  const insight = insights?.[0];
  const nextEpisodes = episodes.filter((e) => e.status !== "Published").slice(0, 2);
  const publishedEpisodes = episodes.filter((e) => e.status === "Published");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Command"
        title="Good morning, Andrey"
        description="Mara's business overview — what changed since yesterday and what needs a decision today."
        meta={
          <>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-pos" />
              All 6 agents online
            </span>
            <span className="text-[12px] text-muted">
              Last sync <span className="num text-ink-2">2 min ago</span>
            </span>
            <span className="text-[12px] text-muted">
              Story week <span className="num text-ink-2">20 of 52</span>
            </span>
          </>
        }
        actions={
          <>
            <DateRangePicker value={period} onChange={setPeriod} />
            <Button variant="primary" onClick={() => navigate("/content/new")}>
              <Plus className="size-3.5" /> Create content
            </Button>
          </>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(metrics ?? Array.from({ length: 6 })).map((m, i) =>
          !m || loadingMetrics ? (
            <MetricCard key={i} label="" value="" loading />
          ) : (
            <MetricCard
              key={m.key}
              label={m.label}
              value={m.value}
              delta={m.delta}
              hint={m.hint}
              accent={m.accent}
              invertDelta={m.key === "churn"}
              spark={[8, 12, 9, 15, 14, 19, 22, 26]}
              onClick={() => {
                if (m.key === "revenue") window.location.hash = "#/revenue";
                if (m.key === "subs" || m.key === "fans") window.location.hash = "#/fans";
                if (m.key === "ppv" || m.key === "ltv") window.location.hash = "#/offers";
                if (m.key === "churn") window.location.hash = "#/analytics";
              }}
            />
          ),
        )}
      </div>

      {/* Revenue + AI insight */}
      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Revenue"
            subtitle={`${period} · gross, all platforms`}
            action={
              <>
                <Badge tone="pos">{signed(12.4)}</Badge>
                <Link to="/revenue" className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
                  Revenue detail <ChevronRight className="size-3.5" />
                </Link>
              </>
            }
          />
          <div className="px-5 pb-5">
            {revenue ? (
              <AreaChart data={revenue} height={216} format="currency" />
            ) : (
              <div className="h-[216px] animate-pulse rounded-lg bg-surface-2" />
            )}
            <Divider className="my-4" />
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                { label: "Subscriptions", value: "$2,610", tone: "text-ink" },
                { label: "PPV", value: "$1,940", tone: "text-ink" },
                { label: "Tips", value: "$270", tone: "text-ink" },
                { label: "Net after fees", value: "$3,910", tone: "text-accent-hi" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="label">{s.label}</div>
                  <div className={cn("num mt-1.5 text-[15px] font-medium", s.tone)}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {insight ? (
          <AICard
            title={insight.title}
            body={insight.body}
            recommendation={insight.recommendation}
            confidence={insight.confidence}
            cta={insight.cta}
          />
        ) : (
          <Card className="p-5">
            <SkeletonRows rows={5} />
          </Card>
        )}
      </Grid>

      {/* Audience / content / queue */}
      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Audience growth"
            subtitle="Followers across platforms"
            action={<Badge tone="accent">+{fmtNum(327)} new</Badge>}
          />
          <div className="px-5 pb-5">
            <AreaChart data={audience ?? []} height={150} showCompare={false} />
            <Divider className="my-4" />
            <div className="space-y-3">
              {[
                { label: "TikTok", value: 148200, delta: "+18.2%" },
                { label: "Instagram", value: 62400, delta: "+9.4%" },
                { label: "Telegram", value: 21800, delta: "+24.1%" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-ink-2">{s.label}</span>
                    <span className="num flex items-center gap-2 text-muted">
                      {fmtNum(s.value, true)}
                      <span className="text-pos">{s.delta}</span>
                    </span>
                  </div>
                  <ProgressBar value={s.value} max={160000} tone="accent" />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Content performance"
            subtitle="Top content this period"
            action={
              <Link to="/content" className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
                All content <ChevronRight className="size-3.5" />
              </Link>
            }
          />
          <div className="px-2 pb-3">
            {(top ?? []).map((item) => (
              <Link
                key={item.id}
                to={`/content?open=${item.id}`}
                className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="num mt-0.5 w-4 text-[12px] text-faint">{item.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">“{item.title}”</div>
                  <div className="mt-1 flex items-center gap-3 text-[11.5px] text-muted">
                    <span className="num flex items-center gap-1">
                      <Eye className="size-3" /> {fmtNum(item.views, true)} views
                    </span>
                    <span className="num flex items-center gap-1 text-pos">
                      <UserPlus className="size-3" /> +{fmtNum(item.followers)}
                    </span>
                  </div>
                </div>
                <Badge>{item.platform}</Badge>
              </Link>
            ))}
            {!top && <SkeletonRows rows={3} />}
          </div>
          <Divider />
          <div className="px-5 py-4">
            <div className="label mb-3">Reach → subscriber funnel</div>
            <FunnelBars data={funnel ?? []} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Action queue"
            subtitle="Needs attention"
            action={<Badge tone="warn">4</Badge>}
          />
          <div className="space-y-1 px-2 pb-4">
            {actionQueue.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className="group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2"
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneRing[item.tone])} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-ink">{item.label}</div>
                  {item.meta && <div className="mt-0.5 text-[11.5px] text-faint">{item.meta}</div>}
                </div>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            ))}
          </div>
          <Divider />
          <div className="px-5 py-4">
            <div className="label mb-3">Storyline progress · {story.season}</div>
            <div className="space-y-2.5">
              {nextEpisodes.map((ep) => (
                <div key={ep.id} className="flex items-center gap-3">
                  <span className="num w-6 text-[11px] text-faint">{String(ep.number).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-ink-2">{ep.title}</div>
                    <ProgressBar value={ep.status === "In production" ? 72 : 18} max={100} className="mt-1.5" height={3} />
                  </div>
                  <StatusBadge status={ep.status} dot={false} />
                </div>
              ))}
              <Link
                to="/episodes"
                className="mt-1 flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
              >
                {publishedEpisodes.length} episodes published <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </Card>
      </Grid>

      {/* Revenue mix + Mara panel + secondary insights */}
      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue mix" subtitle="Subscription · PPV · tips by week" action={<Badge>6 weeks</Badge>} />
          <div className="px-5 pb-5">
            <StackedBars
              data={["W15", "W16", "W17", "W18", "W19", "W20"].map((label, i) => ({
                label,
                segments: [
                  { key: "Subscriptions", value: 520 + i * 62 },
                  { key: "PPV", value: 300 + i * 84 },
                  { key: "Tips", value: 40 + i * 9 },
                ],
              }))}
              height={176}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Mara" subtitle="Character · story state" />
          <div className="px-5 pb-5">
            <div className="flex items-center gap-3">
              <Avatar name="Mara Quinn" src={media.mara} size={44} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">Mara Quinn</div>
                <div className="mt-0.5 text-[12px] text-muted">23 · Chicago · Marketing Coordinator</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-line bg-canvas-2/60 p-3">
              <div className="label">Current story</div>
              <div className="mt-1.5 text-[13px] leading-snug text-ink">{story.title}</div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{story.logline}</p>
            </div>
            <div className="mt-4 space-y-2.5">
              {(insights ?? []).slice(1, 3).map((ins) => (
                <div key={ins.id} className="flex items-start gap-2.5">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" strokeWidth={1.9} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] leading-snug text-ink-2">{ins.title}</div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{ins.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/ai"
              className="mt-4 flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Open AI Studio <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      {/* Latest activity */}
      <Card className="mt-4 lg:mt-5">
        <CardHeader title="Latest activity" subtitle="System, content and revenue events from the last 24 hours" />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Users className="size-3.5" />, label: "New fans", value: "+38", meta: "24h · TikTok dominant" },
            { icon: <Images className="size-3.5" />, label: "Assets generated", value: "12", meta: "9 approved · 3 pending" },
            { icon: <Clock3 className="size-3.5" />, label: "Median reply time", value: "41 min", meta: "AI draft ready in 8s" },
            { icon: <TriangleAlert className="size-3.5" />, label: "Churn signals", value: "4", meta: "1 high LTV" },
          ].map((item) => (
            <div key={item.label} className="bg-surface px-5 py-4">
              <div className="flex items-center gap-2 text-faint">
                {item.icon}
                <span className="label">{item.label}</span>
              </div>
              <div className="num mt-2.5 text-[18px] font-medium text-ink">{item.value}</div>
              <div className="mt-1 text-[11.5px] text-muted">{item.meta}</div>
            </div>
          ))}
        </div>
      </Card>

      {!insights && (
        <EmptyState
          title="No AI insights yet"
          description="The Analytics Agent will publish insights once the first sync completes."
          className="mt-4"
        />
      )}
      <div className="mt-6 text-[11px] text-faint">
        Mock data · revenue figures are illustrative · last rendered {ago(new Date().toISOString())}
      </div>
    </PageContainer>
  );
}
