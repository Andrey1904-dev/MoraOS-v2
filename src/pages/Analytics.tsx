import { useState } from "react";
import { ArrowUpRight, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Divider, Delta, ProgressBar, StatusBadge } from "@/components/ui/Card";
import { AreaChart, BarChart, FunnelBars, Sparkline, StackedBars } from "@/components/ui/charts";
import { DateRangePicker } from "@/components/ui/Controls";
import { MetricCard } from "@/components/ui/MetricCard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { number as fmtNum } from "@/lib/format";
import { cn } from "@/utils/cn";

const SECTIONS = ["Content", "Audience", "Revenue", "Conversion", "Retention"] as const;

export default function Analytics() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Content");
  const [period, setPeriod] = useState("30 days");

  const { data: revenue } = useResource(() => repositories.analytics.revenue(period), [period]);
  const { data: audience } = useResource(() => repositories.analytics.audience(period), [period]);
  const { data: engagement } = useResource(() => repositories.analytics.engagement(period), [period]);
  const { data: funnel } = useResource(() => repositories.analytics.funnel());
  const { data: retention } = useResource(() => repositories.analytics.retention());
  const { data: top } = useResource(() => repositories.analytics.topContent());

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Business"
        title="Analytics"
        description="A decision surface: what is working, what is decaying, and where the next dollar comes from."
        actions={<DateRangePicker value={period} onChange={setPeriod} />}
      />

      <div className="hide-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              "shrink-0 rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition-colors",
              section === s
                ? "border-accent/40 bg-accent/12 text-ink"
                : "border-line text-muted hover:border-line-2 hover:text-ink-2",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Section KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {section === "Content" &&
          [
            { label: "Views", value: "271K", delta: 18.4, spark: [12, 18, 15, 24, 22, 31, 38] },
            { label: "Engagement", value: "6.4%", delta: 2.1, spark: [4, 5, 4.6, 5.4, 6, 6.2, 6.4] },
            { label: "Follower growth", value: "+5,963", delta: 21.6, spark: [8, 10, 12, 16, 19, 24, 29] },
            { label: "Watch-through", value: "64%", delta: 3.8, spark: [52, 54, 58, 60, 61, 63, 64] },
            { label: "Posts published", value: "38", delta: 5.9, spark: [3, 4, 3, 5, 4, 5, 5] },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Audience" &&
          [
            { label: "Followers", value: "232K", delta: 14.2, spark: [10, 14, 16, 20, 24, 27, 32] },
            { label: "Fans in CRM", value: "2,481", delta: 12.8, spark: [20, 24, 28, 30, 34, 38, 42] },
            { label: "Active fans", value: "1,204", delta: 6.1, spark: [18, 20, 22, 24, 25, 27, 30] },
            { label: "New / week", value: "327", delta: 21.6, spark: [5, 8, 7, 12, 15, 18, 22] },
            { label: "Top source", value: "TikTok", delta: 24.1, spark: [9, 12, 16, 18, 22, 26, 31] },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Revenue" &&
          [
            { label: "Revenue", value: "$4,820", delta: 12.4, accent: true, spark: [10, 14, 12, 18, 22, 26, 31] },
            { label: "Net revenue", value: "$3,910", delta: 11.1, spark: [9, 12, 11, 15, 18, 21, 25] },
            { label: "PPV share", value: "40%", delta: 3.2, spark: [30, 32, 34, 36, 38, 39, 40] },
            { label: "Revenue / fan", value: "$26.20", delta: 3.6, spark: [20, 21, 22, 24, 25, 26, 26] },
            { label: "Top offer", value: "Bundle", delta: 18.2, spark: [8, 10, 13, 14, 16, 17, 18] },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Conversion" &&
          [
            { label: "Reach → fan", value: "0.60%", delta: 0.4, spark: [3, 4, 5, 5, 6, 6, 6] },
            { label: "Fan → buyer", value: "27.6%", delta: 2.8, spark: [18, 20, 22, 24, 25, 27, 28] },
            { label: "Buyer → sub", value: "26.9%", delta: -1.2, spark: [32, 30, 29, 28, 28, 27, 27] },
            { label: "Fan → Circle", value: "14.7%", delta: 1.9, spark: [9, 10, 11, 12, 13, 14, 15] },
            { label: "Bundle take-rate", value: "18.2%", delta: 4.1, spark: [10, 12, 13, 15, 16, 17, 18] },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Retention" &&
          [
            { label: "M1 retention", value: "86%", delta: 1.4, spark: [80, 82, 83, 84, 85, 86, 86] },
            { label: "M3 retention", value: "74%", delta: -0.8, spark: [78, 77, 76, 75, 75, 74, 74] },
            { label: "Churn", value: "4.8%", delta: -0.6, invertDelta: true, spark: [6, 5.8, 5.5, 5.2, 5, 4.9, 4.8] },
            { label: "Resurrected", value: "38", delta: 9.4, spark: [4, 6, 8, 10, 12, 14, 15] },
            { label: "Avg. lifetime", value: "4.2 mo", delta: 2.2, spark: [3, 3.2, 3.5, 3.8, 4, 4.1, 4.2] },
          ].map((k) => <MetricCard key={k.label} {...k} />)}
      </div>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              section === "Revenue"
                ? "Revenue"
                : section === "Audience"
                  ? "Audience growth"
                  : section === "Conversion"
                    ? "Conversion trend"
                    : section === "Retention"
                      ? "Retention curve"
                      : "Engagement rate"
            }
            subtitle={`${period} · with previous period comparison`}
            action={<Badge tone="pos"><TrendingUp className="size-3" /> trending up</Badge>}
          />
          <div className="px-5 pb-5">
            <AreaChart
              data={
                section === "Revenue"
                  ? (revenue ?? [])
                  : section === "Audience"
                    ? (audience ?? [])
                    : section === "Retention"
                      ? (retention ?? [])
                      : section === "Conversion"
                        ? (audience ?? []).map((p) => ({ label: p.label, value: Math.round(p.value * 0.28), compare: Math.round((p.compare ?? 0) * 0.26) }))
                        : (engagement ?? [])
              }
              height={244}
              format={section === "Revenue" ? "currency" : section === "Audience" ? "number" : "number"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="What this means" subtitle="Analytics Agent read-out" />
          <div className="space-y-4 px-5 pb-5">
            {[
              {
                tone: "pos" as const,
                title: "Storyline carries the growth",
                body: "Episode-tagged content produced 68% of new followers with 41% of the posting volume.",
              },
              {
                tone: "warn" as const,
                title: "Buyer → subscriber is slipping",
                body: "Conversion from first purchase to subscription fell 1.2pt after the price change.",
              },
              {
                tone: "accent" as const,
                title: "Highest leverage action",
                body: "Ship episode 05 on Friday and attach the gym PPV — modeled +$610 over 10 days.",
              },
            ].map((n) => (
              <div key={n.title} className="rounded-lg border border-line bg-canvas-2/50 p-3.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      n.tone === "pos" ? "bg-pos" : n.tone === "warn" ? "bg-warn" : "bg-accent",
                    )}
                  />
                  <span className="text-[12.5px] font-medium text-ink">{n.title}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{n.body}</p>
              </div>
            ))}
            <Link to="/ai" className="flex items-center gap-1.5 text-[12px] text-accent-hi hover:underline">
              Open AI Studio <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Conversion funnel" subtitle="Reach → Inner circle" />
          <div className="px-5 pb-5">
            <FunnelBars data={funnel ?? []} />
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Target className="size-3.5" />
              Biggest leak: profile visit → fan creation (6.4%).
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Followers by platform" subtitle="All time" />
          <div className="px-5 pb-5">
            <BarChart
              data={[
                { label: "TikTok", value: 148200 },
                { label: "Instagram", value: 62400 },
                { label: "Telegram", value: 21800 },
                { label: "Threads", value: 9400 },
                { label: "Fanvue", value: 3600 },
              ]}
              horizontal
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by source" subtitle="Attribution" />
          <div className="px-5 pb-5">
            <StackedBars
              data={["W18", "W19", "W20", "W21"].map((label, i) => ({
                label,
                segments: [
                  { key: "Subscriptions", value: 520 + i * 48 },
                  { key: "PPV", value: 300 + i * 62 },
                  { key: "Tips", value: 40 + i * 7 },
                ],
              }))}
              height={150}
            />
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top content" subtitle="Ranked by follower conversion" />
          <div>
            {(top ?? []).map((t) => (
              <Link
                key={t.id}
                to={`/content?open=${t.id}`}
                className="flex items-center gap-4 border-b border-line/60 px-5 py-3.5 transition-colors last:border-0 hover:bg-surface-2"
              >
                <span className="num text-[12px] text-faint">{t.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">“{t.title}”</div>
                  <div className="num mt-0.5 text-[11px] text-faint">{fmtNum(t.views, true)} views</div>
                </div>
                <Sparkline values={[8, 14, 11, 22, 28, 34, 41]} />
                <Badge tone="pos">+{fmtNum(t.followers)}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Retention & churn" subtitle="Cohort curve with churn overlay" />
          <div className="px-5 pb-5">
            <AreaChart data={retention ?? []} height={150} showCompare={false} format="percent" />
            <Divider className="my-4" />
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Churn", value: "4.8%", delta: -0.6 },
                { label: "Pause rate", value: "3.1%", delta: 0.4 },
                { label: "Resurrect", value: "38", delta: 9.4 },
              ].map((k) => (
                <div key={k.label}>
                  <div className="label">{k.label}</div>
                  <div className="num mt-1.5 text-[15px] font-medium text-ink">{k.value}</div>
                  <Delta value={k.delta} invert={k.label === "Churn"} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[11.5px] text-muted">
              <TrendingDown className="size-3.5" />
              Churn improves to 3.9% when episode drops stay weekly.
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="mt-4">
        <CardHeader title="Decision log" subtitle="What the operator changed based on analytics" />
        <div className="grid gap-px bg-line lg:grid-cols-3">
          {[
            { title: "Moved the gym PPV to Friday", detail: "Fitness-memory fans convert 3.2× more often.", status: "Approved" },
            { title: "Paused lifestyle-only posts", detail: "34% below storyline performance.", status: "In progress" },
            { title: "Loyalty price for 4 pausers", detail: "Retention play before the next episode.", status: "Review" },
          ].map((d) => (
            <div key={d.title} className="bg-surface px-5 py-4">
              <StatusBadge status={d.status} />
              <div className="mt-2.5 text-[13px] font-medium text-ink">{d.title}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{d.detail}</p>
              <ProgressBar value={d.status === "Approved" ? 100 : d.status === "In progress" ? 55 : 25} className="mt-3" height={3} />
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
