import { useState } from "react";
import { ArrowUpRight, Target, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Divider, Delta, ProgressBar } from "@/components/ui/Card";
import { AreaChart, BarChart, FunnelBars, Sparkline, StackedBars } from "@/components/ui/charts";
import { DateRangePicker } from "@/components/ui/Controls";
import { MetricCard } from "@/components/ui/MetricCard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { number as fmtNum, currency } from "@/lib/format";
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
  const { data: summary } = useResource(() => repositories.analytics.revenueSummary());
  const { data: fansByPlatform } = useResource(() => repositories.analytics.followersByPlatform());
  const { data: fans } = useResource(() => repositories.fans.list());

  const totalFans = fans?.length ?? 0;
  const newFans = (audience ?? []).reduce((s, p) => s + p.value, 0);
  const activeFans = fans?.filter((f) => f.status === "Active").length ?? 0;
  const subscribers = summary?.subscriptions ?? 0;
  const totalRev = summary?.total ?? 0;
  const purchases = summary?.purchases ?? 0;
  const aov = summary?.averageOrderValue ?? 0;
  const conversion = totalFans > 0 ? Math.round((purchases / totalFans) * 1000) / 10 : 0;
  const churn = 0; // Not enough data to compute accurately yet

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

      {/* Section KPIs - all real data, N/A where not available */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {section === "Content" &&
          [
            { label: "Views", value: fmtNum((top ?? []).reduce((s, c) => s + c.views, 0), true), delta: 0 },
            { label: "Engagement", value: engagement && engagement.length > 0 ? `${(engagement.reduce((s, p) => s + p.value, 0) / engagement.length).toFixed(1)}%` : "N/A", delta: 0 },
            { label: "New fans (period)", value: fmtNum(newFans), delta: 0 },
            { label: "Content items", value: String((top ?? []).length), delta: 0 },
            { label: "Published", value: "N/A", delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Audience" &&
          [
            { label: "Fans in CRM", value: String(totalFans), delta: 0 },
            { label: "Active fans", value: String(activeFans), delta: 0 },
            { label: "New fans (period)", value: String(newFans), delta: 0 },
            { label: "Subscribers", value: String(subscribers), delta: 0 },
            { label: "Social followers", value: "N/A", delta: 0, hint: "Connect platforms to see" },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Revenue" &&
          [
            { label: "Revenue", value: currency(totalRev), delta: 0, accent: true },
            { label: "Purchases", value: String(purchases), delta: 0 },
            { label: "AOV", value: currency(aov), delta: 0 },
            { label: "PPV share", value: totalRev > 0 ? `${Math.round(((summary?.byCategory?.ppv ?? 0) / totalRev) * 100)}%` : "N/A", delta: 0 },
            { label: "Subscriptions", value: String(subscribers), delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Conversion" &&
          [
            { label: "Fans → buyer", value: conversion > 0 ? `${conversion}%` : "N/A", delta: 0 },
            { label: "Buyers", value: String(purchases), delta: 0 },
            { label: "Subscribers", value: String(subscribers), delta: 0 },
            { label: "Conversion rate", value: conversion > 0 ? `${conversion}%` : "N/A", delta: 0 },
            { label: "Funnel depth", value: funnel && funnel.length > 0 ? String(funnel.length) : "N/A", delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Retention" &&
          [
            { label: "Churn", value: churn ? `${churn}%` : "N/A", delta: 0, hint: "Not enough data" },
            { label: "Active subs", value: String(subscribers), delta: 0 },
            { label: "M1 retention", value: "N/A", delta: 0, hint: "Insufficient data" },
            { label: "Resurrected", value: "N/A", delta: 0 },
            { label: "Avg. lifetime", value: "N/A", delta: 0, hint: "Insufficient data" },
          ].map((k) => <MetricCard key={k.label} {...k} />)}
      </div>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              section === "Revenue"
                ? "Revenue"
                : section === "Audience"
                  ? "Audience growth (CRM)"
                  : section === "Conversion"
                    ? "Conversion trend"
                    : section === "Retention"
                      ? "Retention curve"
                      : "Engagement rate"
            }
            subtitle={`${period} · real data`}
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
                      : (engagement ?? [])
              }
              height={244}
              format={section === "Revenue" ? "currency" : "number"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="What this means" subtitle="Analytics Agent read-out" />
          <div className="space-y-4 px-5 pb-5">
            {(revenue ?? []).length === 0 && (audience ?? []).length === 0 ? (
              <p className="text-[12.5px] text-muted">
                Collect enough data points and the Analytics Agent will produce specific recommendations here.
              </p>
            ) : (
              [
                { tone: "pos" as const, title: "Data is flowing", body: "CRM events and revenue events are being recorded in real time." },
                { tone: "warn" as const, title: "Social platforms not connected", body: "TikTok/Instagram follower counts are unavailable until platform APIs are wired up via adapters." },
                { tone: "accent" as const, title: "Start with the funnel", body: "Use the funnel below to identify the largest leak in your visitor → buyer path." },
              ].map((n) => (
                <div key={n.title} className="rounded-lg border border-line bg-canvas-2/50 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", n.tone === "pos" ? "bg-pos" : n.tone === "warn" ? "bg-warn" : "bg-accent")} />
                    <span className="text-[12.5px] font-medium text-ink">{n.title}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{n.body}</p>
                </div>
              ))
            )}
            <Link to="/ai" className="flex items-center gap-1.5 text-[12px] text-accent-hi hover:underline">
              Open AI Studio <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Conversion funnel" subtitle="CRM stages" />
          <div className="px-5 pb-5">
            <FunnelBars data={funnel ?? []} />
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Target className="size-3.5" />
              Funnel is built from your internal CRM data only.
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Fans by source" subtitle="CRM acquisition channel" />
          <div className="px-5 pb-5">
            {fansByPlatform && fansByPlatform.length > 0 ? (
              <BarChart data={fansByPlatform} horizontal />
            ) : (
              <p className="text-[12.5px] text-muted">No fans yet.</p>
            )}
            <Divider className="my-4" />
            <p className="text-[11.5px] text-muted">
              Social follower counts (TikTok/Instagram/etc.) are shown as N/A until platform adapters are connected.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by category" subtitle="From revenue_events" />
          <div className="px-5 pb-5">
            {summary?.byCategory && Object.keys(summary.byCategory).length > 0 ? (
              <StackedBars
                data={Object.entries(summary.byCategory).map(([key, value]) => ({
                  label: key,
                  segments: [{ key, value: Math.round(value as number) }],
                }))}
                height={150}
              />
            ) : (
              <p className="text-[12.5px] text-muted">No revenue events.</p>
            )}
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
                  <div className="truncate text-[13px] text-ink">"{t.title}"</div>
                  <div className="num mt-0.5 text-[11px] text-faint">{fmtNum(t.views, true)} views</div>
                </div>
                <Sparkline values={[8, 14, 11, 22, 28, 34, 41]} />
                <Badge tone="pos">+{fmtNum(t.followers)}</Badge>
              </Link>
            ))}
            {(!top || top.length === 0) && (
              <div className="p-5 text-[12.5px] text-muted">No content performance data yet.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Retention & churn" subtitle="From subscriptions" />
          <div className="px-5 pb-5">
            <AreaChart data={retention ?? []} height={150} showCompare={false} format="percent" />
            <Divider className="my-4" />
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Churn", value: "N/A", delta: 0 },
                { label: "Active subs", value: String(subscribers), delta: 0 },
                { label: "Resurrect", value: "N/A", delta: 0 },
              ].map((k) => (
                <div key={k.label}>
                  <div className="label">{k.label}</div>
                  <div className="num mt-1.5 text-[15px] font-medium text-ink">{k.value}</div>
                  <Delta value={k.delta} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[11.5px] text-muted">
              <TrendingDown className="size-3.5" />
              Churn metrics require at least one full billing cycle of data.
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="mt-4">
        <CardHeader title="Decision log" subtitle="Operator decisions are recorded here (MVP)" />
        <div className="grid gap-px bg-line lg:grid-cols-3">
          <div className="bg-surface px-5 py-4">
            <ProgressBar value={0} height={3} />
            <div className="mt-2.5 text-[13px] font-medium text-ink">No decisions yet</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              As you approve AI suggestions and publish content, decisions will appear here.
            </p>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
