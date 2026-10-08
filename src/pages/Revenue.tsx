import { useState } from "react";
import { Download, Wallet } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Avatar, Divider, Delta } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/ui/Controls";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { AreaChart, BarChart, Donut } from "@/components/ui/charts";
import { MetricCard } from "@/components/ui/MetricCard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, currency } from "@/lib/format";

export default function Revenue() {
  const [period, setPeriod] = useState("30 days");

  const { data: revenue, loading } = useResource(() => repositories.analytics.revenue(period), [period]);
  const { data: summary } = useResource(() => repositories.analytics.revenueSummary());
  const { data: offers } = useResource(() => repositories.commerce.offers());
  const { data: byOffer } = useResource(() => repositories.commerce.revenueByOffer());
  const { data: bySource } = useResource(() => repositories.commerce.revenueBySource());
  const { data: spenders } = useResource(() => repositories.commerce.topSpenders());
  const { data: fans } = useResource(() => repositories.fans.list());

  const total = summary?.total ?? 0;
  const monthRev = summary?.thisMonth ?? 0;
  const weekRev = summary?.thisWeek ?? 0;
  const todayRev = summary?.today ?? 0;
  const aov = summary?.averageOrderValue ?? 0;
  const purchases = summary?.purchases ?? 0;
  const subs = summary?.subscriptions ?? 0;
  const subRevenue = summary?.byCategory?.subscription ?? 0;
  const ppvRevenue = summary?.byCategory?.ppv ?? 0;
  const tipRevenue = summary?.byCategory?.tip ?? 0;
  // Net = gross minus an estimated 20% platform fees (placeholder; labelled as estimate)
  const net = Math.round(total * 0.8 * 100) / 100;

  const kpis = [
    { label: "Revenue (all time)", value: currency(total), delta: monthRev > 0 ? Number(((monthRev / Math.max(total - monthRev, 1)) * 100).toFixed(1)) : 0, hint: "gross, all platforms", accent: true },
    { label: "This month", value: currency(monthRev), delta: 0, hint: "last 30 days" },
    { label: "This week", value: currency(weekRev), delta: 0, hint: "last 7 days" },
    { label: "Today", value: currency(todayRev), delta: 0, hint: "since midnight" },
    { label: "Purchases", value: String(purchases), delta: 0, hint: "paid orders" },
    { label: "Subscriptions", value: String(subs), delta: 0, hint: "active subs" },
  ];

  const hasData = total > 0 || purchases > 0 || (offers && offers.length > 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Business"
        title="Revenue"
        description="Where the money comes from, which offers convert, and which fans carry the business."
        actions={
          <>
            <DateRangePicker value={period} onChange={setPeriod} />
            <Button variant="outline" disabled title="Not available yet">
              <Download className="size-3.5" /> Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <MetricCard key={k.label} label={k.label} value={k.value} delta={k.delta} hint={k.hint} accent={k.accent} />
        ))}
      </div>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Revenue over time"
            subtitle={`${period} · gross`}
            action={<Badge tone={monthRev > 0 ? "pos" : "neutral"}>{monthRev > 0 ? <Delta value={kpis[1].delta} /> : "no data"} period over period</Badge>}
          />
          <div className="px-5 pb-5">
            {loading ? (
              <div className="h-[240px] animate-pulse rounded-lg bg-surface-2" />
            ) : revenue && revenue.length > 0 ? (
              <AreaChart data={revenue} height={240} format="currency" />
            ) : (
              <EmptyState icon={<Wallet className="size-4" />} title="No revenue data yet" description="Connect payment sources or post a paid offer to see revenue here." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by source" subtitle="Platform attribution" />
          <div className="px-5 pb-5">
            {(bySource && bySource.length > 0) ? (
              <Donut
                segments={bySource}
                centerValue={currency(total, { compact: true })}
                centerLabel="gross"
              />
            ) : (
              <EmptyState title="No sources yet" description="Revenue events will be attributed here when recorded." />
            )}
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Wallet className="size-3.5" />
              {hasData
                ? `AOV ${currency(aov)} across ${purchases} purchase${purchases === 1 ? "" : "s"}.`
                : "No revenue events recorded."}
            </div>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by offer" subtitle="Which products actually sell" />
          <div className="px-5 pb-5">
            {byOffer && byOffer.length > 0 ? (
              <BarChart data={byOffer} horizontal format="currency" />
            ) : (
              <EmptyState title="No offers yet" description="Create offers to see revenue breakdown." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top spenders" subtitle="Highest lifetime value fans" action={
            <span className="num text-[11.5px] text-faint">{currency((spenders ?? []).reduce((s, x) => s + x.amount, 0))} combined</span>
          } />
          <div>
            {(spenders ?? []).map((s, i) => {
              const fan = fans?.find((f) => f.id === s.fanId);
              return (
                <div key={s.fanId} className="flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
                  <span className="num w-4 text-[12px] text-faint">{i + 1}</span>
                  <Avatar name={s.name} tone={fan?.avatarTone} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{s.name}</div>
                    <div className="text-[11px] text-faint">
                      {s.handle} · {s.orders} orders · {ago(s.last)}
                    </div>
                  </div>
                  <span className="num text-[13px] font-medium text-ink">{currency(s.amount)}</span>
                </div>
              );
            })}
            {!spenders && <SkeletonRows rows={4} />}
            {spenders && spenders.length === 0 && (
              <div className="p-5">
                <EmptyState title="No spenders yet" description="Purchase events will appear here." />
              </div>
            )}
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Revenue per fan" subtitle="Distribution across the base" />
          <div className="px-5 pb-5">
            {hasData ? (
              <>
                <div className="grid grid-cols-3 gap-4 pb-4">
                  <div>
                    <div className="label">AOV</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{currency(aov)}</div>
                  </div>
                  <div>
                    <div className="label">Subs</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{subs}</div>
                  </div>
                  <div>
                    <div className="label">PPV</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{currency(ppvRevenue)}</div>
                  </div>
                </div>
                <Divider />
                <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
                  Tips: {currency(tipRevenue)} · Subscriptions: {currency(subRevenue)}.
                  Distribution histogram appears once more purchase data is recorded.
                </p>
              </>
            ) : (
              <EmptyState title="No revenue distribution" description="Wait for purchase events to calculate fan-level distribution." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Offer mix" subtitle="Live vs draft" />
          <div className="space-y-3 px-5 pb-5">
            {(offers ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink">{o.name}</div>
                  <div className="text-[11px] text-faint">
                    {o.kind} · {currency(o.price, { cents: true })} {o.cadence}
                  </div>
                </div>
                <span className="num text-[12.5px] text-ink-2">{currency(o.revenue, { compact: true })}</span>
                <Badge tone={o.status === "Live" ? "pos" : o.status === "Draft" ? "neutral" : "warn"} dot>
                  {o.status}
                </Badge>
              </div>
            ))}
            {(!offers || offers.length === 0) && (
              <EmptyState title="No offers" description="Create an offer to start tracking revenue." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Summary" subtitle="Real data from revenue_events" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { label: "Gross revenue", value: currency(total) },
              { label: "Est. net after fees", value: currency(net) },
              { label: "Paid purchases", value: String(purchases) },
              { label: "Active subscriptions", value: String(subs) },
              { label: "Average order", value: currency(aov) },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <div className="text-[12.5px] text-muted">{r.label}</div>
                <div className="num text-[12.5px] font-medium text-ink">{r.value}</div>
              </div>
            ))}
            <Divider />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Net is an estimate (≈20% platform fees). Real payout reconciliation depends on platform APIs.
            </p>
          </div>
        </Card>
      </Grid>

      {!hasData && (
        <div className="mt-4 rounded-lg border border-line bg-canvas-2 p-5 text-center">
          <p className="text-[12.5px] text-muted">No revenue recorded yet. Switch to demo mode to see a fictional dataset.</p>
        </div>
      )}
    </PageContainer>
  );
}
