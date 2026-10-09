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
import { Card, CardHeader, Badge, Avatar, Divider } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/ui/Controls";
import { AreaChart, FunnelBars, StackedBars } from "@/components/ui/charts";
import { AICard } from "@/components/common/AICard";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories, story, actionQueue } from "@/repositories";
import { ago, number as fmtNum, signed, currency } from "@/lib/format";
import { label } from "@/lib/labels";
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

  const { data: revenue } = useResource(() => repositories.analytics.revenue(period), [period]);
  const { data: audience } = useResource(() => repositories.analytics.audience(period), [period]);
  const { data: top } = useResource(() => repositories.analytics.topContent());
  const { data: insights } = useResource(() => repositories.ai.insights());
  const { data: funnel } = useResource(() => repositories.analytics.funnel());
  const { data: fans } = useResource(() => repositories.fans.list());
  const { data: content } = useResource(() => repositories.content.list());
  const { data: tasks } = useResource(() => repositories.ai.tasks());
  const { data: summary } = useResource(() => repositories.analytics.revenueSummary());
  const { data: agents } = useResource(() => repositories.ai.agents());

  const totalFans = fans?.length ?? 0;
  const activeFans = fans?.filter((f) => f.status === "Active").length ?? 0;
  const subscribers = fans?.filter((f) => f.subscription?.status === "Active").length ?? 0;
  const totalRevenue = summary?.total ?? 0;
  const totalPurchases = summary?.purchases ?? 0;
  const totalContent = content?.length ?? 0;
  const pendingTasks = tasks?.filter((t) => t.status !== "Done").length ?? 0;

  const onlineAgents = (agents ?? []).filter((a) => a.status === "Online").length;
  const insight = insights?.[0];
  const nextContent = (content ?? [])
    .filter((c) => c.status === "Scheduled" || c.status === "Ready")
    .slice(0, 3);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Штаб"
        title="Доброе утро"
        description="Сводка бизнеса Мары: что изменилось со вчерашнего дня и какие решения нужны сегодня."
        meta={
          <>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-pos" />
              {onlineAgents} из {(agents ?? []).length} агентов в сети
            </span>
            <span className="text-[12px] text-muted">
              Последняя синхронизация <span className="num text-ink-2">только что</span>
            </span>
          </>
        }
        actions={
          <>
            <DateRangePicker value={period} onChange={setPeriod} />
            <Button variant="primary" onClick={() => navigate("/content/new")}>
              <Plus className="size-3.5" /> Создать контент
            </Button>
          </>
        }
      />

      {/* KPI - real numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {[
          { key: "total_fans", label: "Всего фанов", value: String(totalFans), hint: "в CRM" },
          { key: "active_fans", label: "Активные фаны", value: String(activeFans), hint: "статус «активен»" },
          { key: "subscribers", label: "Подписчики", value: String(subscribers), hint: "активные подписки" },
          { key: "revenue", label: "Выручка", value: currency(totalRevenue), hint: "всего, без вычетов", accent: true, onClick: () => (window.location.hash = "#/revenue") },
          { key: "purchases", label: "Покупки", value: String(totalPurchases), hint: "оплаченные заказы" },
          { key: "content", label: "Контент", value: String(totalContent), hint: "единиц" },
          { key: "tasks", label: "Задачи", value: String(pendingTasks), hint: "к работе" },
          { key: "ai_activity", label: "AI-запуски", value: String((agents ?? []).reduce((s, a) => s + a.tasks, 0)), hint: "всего" },
        ].map((m) => (
          <MetricCard
            key={m.key}
            label={m.label}
            value={m.value}
            hint={m.hint}
            accent={m.accent}
            onClick={m.onClick}
          />
        ))}
      </div>

      {/* Revenue + AI insight */}
      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Выручка"
            subtitle={`${label(period)} · без вычетов, все платформы`}
            action={
              <>
                {summary?.thisMonth ? <Badge tone="pos">{signed(0)}</Badge> : null}
                <Link to="/revenue" className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
                  Детализация выручки <ChevronRight className="size-3.5" />
                </Link>
              </>
            }
          />
          <div className="px-5 pb-5">
            {revenue && revenue.length > 0 ? (
              <AreaChart data={revenue} height={216} format="currency" />
            ) : (
              <div className="flex h-[216px] items-center justify-center rounded-lg bg-surface-2 text-[12.5px] text-muted">
                Событий выручки пока нет
              </div>
            )}
            <Divider className="my-4" />
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                { label: "Подписки", value: currency(summary?.byCategory?.subscription ?? 0) },
                { label: "PPV", value: currency(summary?.byCategory?.ppv ?? 0) },
                { label: "Чаевые", value: currency(summary?.byCategory?.tip ?? 0) },
                { label: "Средний чек", value: currency(summary?.averageOrderValue ?? 0) },
              ].map((s) => (
                <div key={s.label}>
                  <div className="label">{s.label}</div>
                  <div className={cn("num mt-1.5 text-[15px] font-medium", "text-ink")}>{s.value}</div>
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
            title="Рост аудитории"
            subtitle="Фаны в CRM по времени"
            action={
              <Badge tone="accent">
                +{fmtNum((audience ?? []).reduce((s, p) => s + p.value, 0))} новых
              </Badge>
            }
          />
          <div className="px-5 pb-5">
            <AreaChart data={audience ?? []} height={150} showCompare={false} />
            <Divider className="my-4" />
            <p className="text-[11.5px] text-muted">
              Внешние счётчики подписчиков (TikTok/Instagram) не подключены — показаны только фаны из CRM.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Результаты контента"
            subtitle="Лучший контент за период"
            action={
              <Link to="/content" className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
                Весь контент <ChevronRight className="size-3.5" />
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
                      <Eye className="size-3" /> {fmtNum(item.views, true)} просмотров
                    </span>
                    <span className="num flex items-center gap-1 text-pos">
                      <UserPlus className="size-3" /> +{fmtNum(item.followers)}
                    </span>
                  </div>
                </div>
                <Badge>{item.platform}</Badge>
              </Link>
            ))}
            {(!top || top.length === 0) && (
              <div className="p-4 text-[12.5px] text-muted">Данных о результатах контента пока нет.</div>
            )}
          </div>
          <Divider />
          <div className="px-5 py-4">
            <div className="label mb-3">Воронка</div>
            <FunnelBars data={funnel ?? []} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Очередь действий"
            subtitle="Требует внимания"
            action={<Badge tone="warn">{actionQueue.length}</Badge>}
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
            <div className="label mb-3">Сюжет · {story.season}</div>
            {nextContent.length > 0 ? (
              <div className="space-y-2.5">
                {nextContent.slice(0, 2).map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-ink-2">{c.title}</div>
                    </div>
                    <Badge>{c.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted">Запланированного контента нет.</p>
            )}
            <Link
              to="/content"
              className="mt-3 flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Весь контент <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      {/* Revenue mix + Mara panel + secondary insights */}
      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Структура выручки" subtitle="Из таблицы revenue_events" />
          <div className="px-5 pb-5">
            {revenue && revenue.length > 0 ? (
              <StackedBars
                data={revenue.slice(-6).map((p) => ({
                  label: p.label,
                  segments: [
                    { key: "Всего", value: Math.round(p.value) },
                  ],
                }))}
                height={176}
              />
            ) : (
              <EmptyState title="Нет данных о выручке" description="Разбивка появится, когда появятся события выручки." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Мара" subtitle="Персонаж · состояние истории" />
          <div className="px-5 pb-5">
            <div className="flex items-center gap-3">
              <Avatar name="Mara Quinn" src={media.mara} size={44} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">Mara Quinn</div>
                <div className="mt-0.5 text-[12px] text-muted">23 · Чикаго · маркетинг-координатор</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-line bg-canvas-2/60 p-3">
              <div className="label">Текущая история</div>
              <div className="mt-1.5 text-[13px] leading-snug text-ink">{story.title}</div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{story.logline}</p>
            </div>
            {(insights ?? []).slice(1, 3).length > 0 && (
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
            )}
            <Link
              to="/ai"
              className="mt-4 flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Открыть AI-студию <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </Grid>

      {/* Latest activity */}
      <Card className="mt-4 lg:mt-5">
        <CardHeader title="Последняя активность" subtitle="Системные, контентные и финансовые события рабочей области" />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Users className="size-3.5" />, label: "Всего фанов", value: fmtNum(totalFans), meta: "в CRM" },
            { icon: <Images className="size-3.5" />, label: "Единиц контента", value: String(totalContent), meta: `${(content ?? []).filter((c) => c.status === "Published").length} опубликовано` },
            { icon: <Clock3 className="size-3.5" />, label: "Задачи в работе", value: String(pendingTasks), meta: "требуют внимания" },
            { icon: <TriangleAlert className="size-3.5" />, label: "AI-инсайты", value: String((insights ?? []).length), meta: `${onlineAgents} агентов в сети` },
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

      {!insights?.length && (
        <EmptyState
          title="AI-инсайтов пока нет"
          description="Агент аналитики опубликует инсайты после первой синхронизации."
          className="mt-4"
        />
      )}
      <div className="mt-6 text-[11px] text-faint">
        Реальные данные из Supabase / демо-датасет · отрисовано {ago(new Date().toISOString())}
      </div>
    </PageContainer>
  );
}
