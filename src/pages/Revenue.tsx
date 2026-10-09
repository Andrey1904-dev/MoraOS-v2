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
import { ago, currency, pluralRu } from "@/lib/format";
import { label } from "@/lib/labels";

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
    { label: "Выручка (всего)", value: currency(total), delta: monthRev > 0 ? Number(((monthRev / Math.max(total - monthRev, 1)) * 100).toFixed(1)) : 0, hint: "без вычетов, все площадки", accent: true },
    { label: "За месяц", value: currency(monthRev), delta: 0, hint: "последние 30 дней" },
    { label: "За неделю", value: currency(weekRev), delta: 0, hint: "последние 7 дней" },
    { label: "Сегодня", value: currency(todayRev), delta: 0, hint: "с полуночи" },
    { label: "Покупки", value: String(purchases), delta: 0, hint: "оплаченные заказы" },
    { label: "Подписки", value: String(subs), delta: 0, hint: "активные" },
  ];

  const hasData = total > 0 || purchases > 0 || (offers && offers.length > 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Бизнес"
        title="Выручка"
        description="Откуда приходят деньги, какие офферы конвертируют и какие фаны держат бизнес."
        actions={
          <>
            <DateRangePicker value={period} onChange={setPeriod} />
            <Button variant="outline" disabled title="Пока недоступно">
              <Download className="size-3.5" /> Экспорт
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
            title="Выручка по времени"
            subtitle={`${label(period)} · без вычетов`}
            action={<Badge tone={monthRev > 0 ? "pos" : "neutral"}>{monthRev > 0 ? <Delta value={kpis[1].delta} /> : "нет данных"} к прошлому периоду</Badge>}
          />
          <div className="px-5 pb-5">
            {loading ? (
              <div className="h-[240px] animate-pulse rounded-lg bg-surface-2" />
            ) : revenue && revenue.length > 0 ? (
              <AreaChart data={revenue} height={240} format="currency" />
            ) : (
              <EmptyState icon={<Wallet className="size-4" />} title="Данных о выручке пока нет" description="Подключите платёжные источники или опубликуйте платный оффер — выручка появится здесь." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Выручка по источникам" subtitle="Атрибуция по площадкам" />
          <div className="px-5 pb-5">
            {(bySource && bySource.length > 0) ? (
              <Donut
                segments={bySource}
                centerValue={currency(total, { compact: true })}
                centerLabel="всего"
              />
            ) : (
              <EmptyState title="Источников пока нет" description="События выручки появятся здесь после записи." />
            )}
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Wallet className="size-3.5" />
              {hasData
                ? `Средний чек ${currency(aov)} по ${purchases} ${pluralRu(purchases, ["покупке", "покупкам", "покупкам"])}.`
                : "Событий выручки не записано."}
            </div>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Выручка по офферам" subtitle="Что реально продаётся" />
          <div className="px-5 pb-5">
            {byOffer && byOffer.length > 0 ? (
              <BarChart data={byOffer} horizontal format="currency" />
            ) : (
              <EmptyState title="Офферов пока нет" description="Создайте офферы, чтобы увидеть разбивку выручки." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Топ по тратам" subtitle="Фаны с наибольшим LTV" action={
            <span className="num text-[11.5px] text-faint">{currency((spenders ?? []).reduce((s, x) => s + x.amount, 0))} суммарно</span>
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
                      {s.handle} · {s.orders} заказов · {ago(s.last)}
                    </div>
                  </div>
                  <span className="num text-[13px] font-medium text-ink">{currency(s.amount)}</span>
                </div>
              );
            })}
            {!spenders && <SkeletonRows rows={4} />}
            {spenders && spenders.length === 0 && (
              <div className="p-5">
                <EmptyState title="Покупок пока нет" description="События покупок появятся здесь." />
              </div>
            )}
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Выручка на фана" subtitle="Распределение по базе" />
          <div className="px-5 pb-5">
            {hasData ? (
              <>
                <div className="grid grid-cols-3 gap-4 pb-4">
                  <div>
                    <div className="label">Средний чек</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{currency(aov)}</div>
                  </div>
                  <div>
                    <div className="label">Подписки</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{subs}</div>
                  </div>
                  <div>
                    <div className="label">PPV</div>
                    <div className="num mt-1 text-[15px] font-medium text-ink">{currency(ppvRevenue)}</div>
                  </div>
                </div>
                <Divider />
                <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
                  Чаевые: {currency(tipRevenue)} · Подписки: {currency(subRevenue)}.
                  Гистограмма распределения появится, когда накопится больше данных о покупках.
                </p>
              </>
            ) : (
              <EmptyState title="Нет распределения выручки" description="Нужны события покупок, чтобы посчитать распределение по фанам." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Состав офферов" subtitle="Активные и черновики" />
          <div className="space-y-3 px-5 pb-5">
            {(offers ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink">{o.name}</div>
                  <div className="text-[11px] text-faint">
                    {label(o.kind)} · {currency(o.price, { cents: true })} {label(o.cadence)}
                  </div>
                </div>
                <span className="num text-[12.5px] text-ink-2">{currency(o.revenue, { compact: true })}</span>
                <Badge tone={o.status === "Live" ? "pos" : o.status === "Draft" ? "neutral" : "warn"} dot>
                  {label(o.status)}
                </Badge>
              </div>
            ))}
            {(!offers || offers.length === 0) && (
              <EmptyState title="Офферов нет" description="Создайте оффер, чтобы начать учёт выручки." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Сводка" subtitle="Реальные данные из revenue_events" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { label: "Выручка без вычетов", value: currency(total) },
              { label: "Оценка netto после комиссий", value: currency(net) },
              { label: "Оплаченные покупки", value: String(purchases) },
              { label: "Активные подписки", value: String(subs) },
              { label: "Средний чек", value: currency(aov) },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <div className="text-[12.5px] text-muted">{r.label}</div>
                <div className="num text-[12.5px] font-medium text-ink">{r.value}</div>
              </div>
            ))}
            <Divider />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Netto — оценка (≈20% комиссий площадок). Точная сверка выплат зависит от API площадок.
            </p>
          </div>
        </Card>
      </Grid>

      {!hasData && (
        <div className="mt-4 rounded-lg border border-line bg-canvas-2 p-5 text-center">
          <p className="text-[12.5px] text-muted">Выручки пока нет. Переключитесь в демо-режим, чтобы посмотреть вымышленный датасет.</p>
        </div>
      )}
    </PageContainer>
  );
}
