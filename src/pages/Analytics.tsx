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
import { label } from "@/lib/labels";
import { cn } from "@/utils/cn";

const SECTIONS = ["Контент", "Аудитория", "Выручка", "Конверсия", "Удержание"] as const;

export default function Analytics() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Контент");
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
        eyebrow="Бизнес"
        title="Аналитика"
        description="Поверхность решений: что работает, что затухает и откуда придёт следующий рубль."
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
        {section === "Контент" &&
          [
            { label: "Просмотры", value: fmtNum((top ?? []).reduce((s, c) => s + c.views, 0), true), delta: 0 },
            { label: "Вовлечённость", value: engagement && engagement.length > 0 ? `${(engagement.reduce((s, p) => s + p.value, 0) / engagement.length).toFixed(1)}%` : "N/A", delta: 0 },
            { label: "Новые фаны (за период)", value: fmtNum(newFans), delta: 0 },
            { label: "Единиц контента", value: String((top ?? []).length), delta: 0 },
            { label: "Опубликовано", value: "N/A", delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Аудитория" &&
          [
            { label: "Фанов в CRM", value: String(totalFans), delta: 0 },
            { label: "Активные фаны", value: String(activeFans), delta: 0 },
            { label: "Новые фаны (за период)", value: String(newFans), delta: 0 },
            { label: "Подписчики", value: String(subscribers), delta: 0 },
            { label: "Подписчики в соцсетях", value: "N/A", delta: 0, hint: "Подключите площадки" },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Выручка" &&
          [
            { label: "Выручка", value: currency(totalRev), delta: 0, accent: true },
            { label: "Покупки", value: String(purchases), delta: 0 },
            { label: "Средний чек", value: currency(aov), delta: 0 },
            { label: "Доля PPV", value: totalRev > 0 ? `${Math.round(((summary?.byCategory?.ppv ?? 0) / totalRev) * 100)}%` : "N/A", delta: 0 },
            { label: "Подписки", value: String(subscribers), delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Конверсия" &&
          [
            { label: "Фан → покупатель", value: conversion > 0 ? `${conversion}%` : "N/A", delta: 0 },
            { label: "Покупатели", value: String(purchases), delta: 0 },
            { label: "Подписчики", value: String(subscribers), delta: 0 },
            { label: "Конверсия", value: conversion > 0 ? `${conversion}%` : "N/A", delta: 0 },
            { label: "Глубина воронки", value: funnel && funnel.length > 0 ? String(funnel.length) : "N/A", delta: 0 },
          ].map((k) => <MetricCard key={k.label} {...k} />)}

        {section === "Удержание" &&
          [
            { label: "Отток", value: churn ? `${churn}%` : "N/A", delta: 0, hint: "Мало данных" },
            { label: "Активные подписки", value: String(subscribers), delta: 0 },
            { label: "Удержание M1", value: "N/A", delta: 0, hint: "Недостаточно данных" },
            { label: "Возвращённые", value: "N/A", delta: 0 },
            { label: "Средний срок жизни", value: "N/A", delta: 0, hint: "Недостаточно данных" },
          ].map((k) => <MetricCard key={k.label} {...k} />)}
      </div>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              section === "Выручка"
                ? "Выручка"
                : section === "Аудитория"
                  ? "Рост аудитории (CRM)"
                  : section === "Конверсия"
                    ? "Динамика конверсии"
                    : section === "Удержание"
                      ? "Кривая удержания"
                      : "Вовлечённость"
            }
            subtitle={`${label(period)} · реальные данные`}
          />
          <div className="px-5 pb-5">
            <AreaChart
              data={
                section === "Выручка"
                  ? (revenue ?? [])
                  : section === "Аудитория"
                    ? (audience ?? [])
                    : section === "Удержание"
                      ? (retention ?? [])
                      : (engagement ?? [])
              }
              height={244}
              format={section === "Выручка" ? "currency" : "number"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Что это значит" subtitle="Выводы Агента аналитики" />
          <div className="space-y-4 px-5 pb-5">
            {(revenue ?? []).length === 0 && (audience ?? []).length === 0 ? (
              <p className="text-[12.5px] text-muted">
                Накопите достаточно данных — и Агент аналитики даст здесь конкретные рекомендации.
              </p>
            ) : (
              [
                { tone: "pos" as const, title: "Данные поступают", body: "События CRM и выручки записываются в реальном времени." },
                { tone: "warn" as const, title: "Соцсети не подключены", body: "Счётчики подписчиков TikTok/Instagram недоступны, пока не подключены API площадок через адаптеры." },
                { tone: "accent" as const, title: "Начните с воронки", body: "Воронка ниже показывает крупнейшую утечку на пути гость → покупатель." },
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
              Открыть AI-студию <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Воронка конверсии" subtitle="Этапы CRM" />
          <div className="px-5 pb-5">
            <FunnelBars data={funnel ?? []} />
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Target className="size-3.5" />
              Воронка строится только по внутренним данным CRM.
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Фаны по источникам" subtitle="Канал привлечения в CRM" />
          <div className="px-5 pb-5">
            {fansByPlatform && fansByPlatform.length > 0 ? (
              <BarChart data={fansByPlatform} horizontal />
            ) : (
              <p className="text-[12.5px] text-muted">Фанов пока нет.</p>
            )}
            <Divider className="my-4" />
            <p className="text-[11.5px] text-muted">
              Счётчики подписчиков в соцсетях (TikTok/Instagram и др.) показываются как N/A, пока не подключены адаптеры площадок.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Выручка по категориям" subtitle="Из таблицы revenue_events" />
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
              <p className="text-[12.5px] text-muted">Событий выручки нет.</p>
            )}
          </div>
        </Card>
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Топ контента" subtitle="Ранжирование по приросту подписчиков" />
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
                  <div className="num mt-0.5 text-[11px] text-faint">{fmtNum(t.views, true)} просмотров</div>
                </div>
                <Sparkline values={[8, 14, 11, 22, 28, 34, 41]} />
                <Badge tone="pos">+{fmtNum(t.followers)}</Badge>
              </Link>
            ))}
            {(!top || top.length === 0) && (
              <div className="p-5 text-[12.5px] text-muted">Данных о результатах контента пока нет.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Удержание и отток" subtitle="По подпискам" />
          <div className="px-5 pb-5">
            <AreaChart data={retention ?? []} height={150} showCompare={false} format="percent" />
            <Divider className="my-4" />
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Отток", value: "N/A", delta: 0 },
                { label: "Активные подписки", value: String(subscribers), delta: 0 },
                { label: "Возврат", value: "N/A", delta: 0 },
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
              Для метрик оттока нужен хотя бы один полный платёжный цикл данных.
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="mt-4">
        <CardHeader title="Журнал решений" subtitle="Здесь фиксируются решения оператора (MVP)" />
        <div className="grid gap-px bg-line lg:grid-cols-3">
          <div className="bg-surface px-5 py-4">
            <ProgressBar value={0} height={3} />
            <div className="mt-2.5 text-[13px] font-medium text-ink">Решений пока нет</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Когда вы будете одобрять предложения AI и публиковать контент, решения появятся здесь.
            </p>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
