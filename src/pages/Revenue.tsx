import { useState } from "react";
import { Download, Wallet } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Avatar, Divider, Delta } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/ui/Controls";
import { SkeletonRows } from "@/components/ui/Feedback";
import { AreaChart, BarChart, Donut } from "@/components/ui/charts";
import { MetricCard } from "@/components/ui/MetricCard";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, currency } from "@/lib/format";

export default function Revenue() {
  const [period, setPeriod] = useState("30 days");

  const { data: revenue, loading } = useResource(() => repositories.analytics.revenue(period), [period]);
  const { data: offers } = useResource(() => repositories.commerce.offers());
  const { data: byOffer } = useResource(() => repositories.commerce.revenueByOffer());
  const { data: bySource } = useResource(() => repositories.commerce.revenueBySource());
  const { data: spenders } = useResource(() => repositories.commerce.topSpenders());
  const { data: fans } = useResource(() => repositories.fans.list());

  const kpis = [
    { label: "Revenue", value: "$4,820", delta: 12.4, hint: "gross, all platforms", accent: true },
    { label: "Net Revenue", value: "$3,910", delta: 11.1, hint: "after platform fees" },
    { label: "PPV", value: "$1,940", delta: 16.1, hint: "one-time unlocks" },
    { label: "Subscriptions", value: "$2,610", delta: 8.2, hint: "184 active" },
    { label: "Tips", value: "$270", delta: -4.2, hint: "17 tips" },
    { label: "ARPU", value: "$26.20", delta: 3.6, hint: "per paying fan" },
  ];

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
            subtitle={`${period} · gross vs previous period`}
            action={<Badge tone="pos"><Delta value={12.4} /> period over period</Badge>}
          />
          <div className="px-5 pb-5">
            {loading ? (
              <div className="h-[240px] animate-pulse rounded-lg bg-surface-2" />
            ) : (
              <AreaChart data={revenue ?? []} height={240} format="currency" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by source" subtitle="Platform attribution" />
          <div className="px-5 pb-5">
            <Donut
              segments={bySource ?? []}
              centerValue="$4,820"
              centerLabel="gross"
            />
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Wallet className="size-3.5" />
              Fanvue carries 58% of revenue; Telegram is the fastest growing source.
            </div>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by offer" subtitle="Which products actually sell" />
          <div className="px-5 pb-5">
            <BarChart data={byOffer ?? []} horizontal format="currency" />
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
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Revenue per fan" subtitle="Distribution across the base" />
          <div className="px-5 pb-5">
            <BarChart
              data={[
                { label: "$0", value: 1797 },
                { label: "$1–50", value: 402 },
                { label: "$51–150", value: 186 },
                { label: "$151–400", value: 71 },
                { label: "$401+", value: 25 },
              ]}
              height={150}
              format="currency"
            />
            <Divider className="my-4" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              72% of the base has never paid. Moving 2% of them to a first purchase adds roughly $1,040 / month.
            </p>
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
          </div>
        </Card>

        <Card>
          <CardHeader title="Payout ledger" subtitle="Mock reconciliation" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { label: "Fanvue · February", value: 2810, status: "Paid" },
              { label: "TikTok Creator · February", value: 640, status: "Paid" },
              { label: "Instagram bonuses", value: 512, status: "Pending" },
              { label: "Telegram Stars", value: 486, status: "Paid" },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink-2">{r.label}</div>
                </div>
                <span className="num text-[12.5px] text-ink">{currency(r.value)}</span>
                <Badge tone={r.status === "Paid" ? "pos" : "warn"} dot>
                  {r.status}
                </Badge>
              </div>
            ))}
            <Divider />
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-muted">Net after fees</span>
              <span className="num text-[14px] font-medium text-accent-hi">{currency(3910)}</span>
            </div>
          </div>
        </Card>
      </Grid>
    </PageContainer>
  );
}
