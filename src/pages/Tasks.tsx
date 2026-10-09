import { useMemo, useState } from "react";
import { CheckCircle2, Circle, CircleDotDashed, Clock, ListChecks, Plus } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Divider, ProgressBar } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterChips, Select } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Overlays";
import { EmptyState, useToast } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import type { Task } from "@/types";
import { label } from "@/lib/labels";
import { cn } from "@/utils/cn";
import { inputClass, textareaClass } from "@/components/ui/Controls";

const SOURCE_LABELS: Record<string, string> = {
  Conversations: "Диалоги",
  Content: "Контент",
  Episodes: "Эпизоды",
  Fans: "Фаны",
  Revenue: "Выручка",
  Assets: "Ассеты",
  Manual: "Вручную",
  System: "Система",
};

const FILTERS = ["All", "Todo", "In progress", "Waiting", "Done"] as const;
const PRIORITY_TONE = { Urgent: "neg", High: "neg", Normal: "info", Low: "neutral" } as const;

const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const GROUPS = ["Сегодня", "На этой неделе"] as const;

export default function Tasks() {
  const { push } = useToast();
  const { data, loading, refetch } = useResource(() => repositories.ai.tasks());
  const [filter, setFilter] = useState<string>("All");
  const [group, setGroup] = useState<"Сегодня" | "На этой неделе" | "Все">("Сегодня");
  const [local, setLocal] = useState<Record<string, Task["status"]>>({});
  const [modal, setModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newPriority, setNewPriority] = useState<Task["priority"]>("Normal");
  const [newGroup, setNewGroup] = useState<"Сегодня" | "На этой неделе">("Сегодня");

  const rows = useMemo(() => {
    return (data ?? [])
      .map((t) => ({ ...t, status: local[t.id] ?? t.status }))
      .filter((t) => (filter === "All" ? true : t.status === filter))
      .filter((t) => (group === "Все" ? true : t.group === group));
  }, [data, filter, group, local]);

  const all = (data ?? []).map((t) => ({ ...t, status: local[t.id] ?? t.status }));
  const done = all.filter((t) => t.status === "Done").length;
  const todo = all.filter((t) => t.status === "Todo").length;
  const progress = (done / Math.max(1, all.length)) * 100;

  const setStatus = async (t: Task, status: Task["status"]) => {
    setLocal((prev) => ({ ...prev, [t.id]: status }));
    try {
      await repositories.ai.setTaskStatus(t.id, status);
      if (status === "Done") push({ title: "Задача выполнена", description: t.title, tone: "success" });
    } catch (error) {
      push({ title: "Не удалось обновить", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
      setLocal((prev) => {
        const copy = { ...prev };
        delete copy[t.id];
        return copy;
      });
    }
  };

  async function createTask() {
    if (!newTitle.trim()) {
      push({ title: "Нужно название", description: "Дайте задаче короткое название.", tone: "error" });
      return;
    }
    setCreating(true);
    try {
      await repositories.ai.addTask({
        title: newTitle.trim(),
        detail: newDetail.trim(),
        priority: newPriority,
        group: newGroup,
        due: newGroup === "Сегодня" ? "Сегодня" : "Чт",
        source: "Manual",
      });
      push({ title: "Задача создана", description: newTitle.trim(), tone: "success" });
      setModal(false);
      setNewTitle("");
      setNewDetail("");
      setNewPriority("Normal");
      setNewGroup("Сегодня");
      void refetch();
    } catch (error) {
      push({ title: "Не удалось создать", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Система"
        title="Задачи"
        description="Всё, что сегодня требует решения человека: AI-черновики, одобрения, публикации и проверки рисков."
        actions={
          <>
            <Select
              ariaLabel="Группа"
              value={group}
              onChange={(v) => setGroup(v as "Сегодня" | "На этой неделе" | "Все")}
              options={["Сегодня", "На этой неделе", "Все"] as const}
              className="w-32"
            />
            <Button variant="primary" onClick={() => setModal(true)}>
              <Plus className="size-3.5" /> Новая задача
            </Button>
          </>
        }
      />

      <Grid className="lg:grid-cols-4">
        {[
          { label: "К работе", value: todo, tone: "text-ink" },
          { label: "В работе", value: all.filter((t) => t.status === "In progress").length, tone: "text-info" },
          { label: "Выполнено сегодня", value: done, tone: "text-pos" },
          { label: "Высокий приоритет", value: all.filter((t) => t.priority === "High" || t.priority === "Urgent").length, tone: "text-neg" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="label">{s.label}</div>
            <div className={cn("num mt-2 text-[19px] font-medium", s.tone)}>{s.value}</div>
          </Card>
        ))}
      </Grid>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-ink">Выполнение за сегодня</span>
              <span className="num text-[12px] text-muted">{Math.round(progress)}%</span>
            </div>
            <ProgressBar value={progress} tone={progress > 50 ? "pos" : "accent"} />
          </div>
          <FilterChips options={FILTERS} value={filter as (typeof FILTERS)[number]} onChange={setFilter} />
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ListChecks className="size-4" />} title="Здесь пусто" description="Под этот фильтр задачи не подходят." />
        ) : (
          <div>
            {rows.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start gap-3 border-b border-line/60 px-5 py-3.5 last:border-0 hover:bg-surface-2/60">
                <button
                  onClick={() => setStatus(t, t.status === "Done" ? "Todo" : t.status === "Todo" ? "In progress" : "Done")}
                  className="mt-0.5 text-faint transition-colors hover:text-ink"
                  aria-label="Переключить статус задачи"
                >
                  {t.status === "Done" ? (
                    <CheckCircle2 className="size-4.5 text-pos" strokeWidth={1.8} />
                  ) : t.status === "In progress" ? (
                    <CircleDotDashed className="size-4.5 text-info" strokeWidth={1.8} />
                  ) : (
                    <Circle className="size-4.5" strokeWidth={1.8} />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[13px]", t.status === "Done" ? "text-faint line-through" : "font-medium text-ink")}>
                      {t.title}
                    </span>
                    <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{label(t.priority)}</Badge>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-muted">{t.detail}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-faint">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {t.due}
                    </span>
                    <span>Источник · {SOURCE_LABELS[t.source] ?? t.source}</span>
                    <span className="num">{t.group}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} dot={false} />
                  <Select
                    ariaLabel="Изменить статус"
                    value={t.status}
                    onChange={(v) => void setStatus(t, v as Task["status"])}
                    options={["Todo", "In progress", "Waiting", "Done"] as const}
                    className="w-32"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Grid className="mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Одобрения, блокирующие агентов" subtitle="Пока эти ждут, агенты тормозят" />
          <div className="space-y-3 px-5 pb-5">
            {all.filter((t) => t.source === "Conversations" && t.status !== "Done").length === 0 ? (
              <p className="text-[12.5px] text-muted">Ожидающих одобрений в диалогах нет.</p>
            ) : (
              all
                .filter((t) => t.source === "Conversations" && t.status !== "Done")
                .slice(0, 5)
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2/50 px-4 py-3">
                    <span className="size-1.5 rounded-full bg-warn" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-ink">{t.title}</div>
                      <div className="text-[11px] text-faint">{t.detail}</div>
                    </div>
                    <Button size="sm" variant="subtle" onClick={() => window.location.hash = "#/conversations"}>
                      Проверить
                    </Button>
                  </div>
                ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Загрузка" subtitle="По источникам" />
          <div className="px-5 pb-5">
            {["Conversations", "Content", "Episodes", "Fans", "Revenue"].map((src, i) => {
              const count = all.filter((t) => t.source === src).length;
              return (
                <div key={src} className="mb-3">
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-muted">{SOURCE_LABELS[src] ?? src}</span>
                    <span className="num text-ink-2">{count}</span>
                  </div>
                  <ProgressBar value={count} max={4} tone={i % 2 ? "info" : "accent"} height={3} />
                </div>
              );
            })}
            <Divider className="my-4" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Разбор очереди одобрений разблокирует запуски агентов.
            </p>
          </div>
        </Card>
      </Grid>

      <Modal
        open={modal}
        onClose={() => !creating && setModal(false)}
        title="Новая задача"
        subtitle="Создайте настоящую задачу в этой рабочей области."
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={creating}>
              Отмена
            </Button>
            <Button variant="primary" loading={creating} onClick={() => void createTask()}>
              Создать задачу
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Название</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Одобрить подпись к эпизоду 05"
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Подробности</span>
            <textarea
              rows={3}
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              placeholder="Что нужно решить…"
              className={textareaClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Приоритет</span>
            <Select value={newPriority} onChange={(v) => setNewPriority(v as Task["priority"])} options={PRIORITIES} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Группа</span>
            <Select value={newGroup} onChange={(v) => setNewGroup(v as "Сегодня" | "На этой неделе")} options={GROUPS} />
          </label>
        </div>
      </Modal>
    </PageContainer>
  );
}
