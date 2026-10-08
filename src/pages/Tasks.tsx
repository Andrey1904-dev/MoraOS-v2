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
import { cn } from "@/utils/cn";

const FILTERS = ["All", "Todo", "In progress", "Waiting", "Done"] as const;
const PRIORITY_TONE = { Urgent: "neg", High: "neg", Normal: "info", Low: "neutral" } as const;

export default function Tasks() {
  const { push } = useToast();
  const { data, loading } = useResource(() => repositories.ai.tasks());
  const [filter, setFilter] = useState<string>("All");
  const [group, setGroup] = useState<"Today" | "This week" | "All">("Today");
  const [local, setLocal] = useState<Record<string, Task["status"]>>({});
  const [modal, setModal] = useState(false);

  const rows = useMemo(() => {
    return (data ?? [])
      .map((t) => ({ ...t, status: local[t.id] ?? t.status }))
      .filter((t) => (filter === "All" ? true : t.status === filter))
      .filter((t) => (group === "All" ? true : t.group === group));
  }, [data, filter, group, local]);

  const all = (data ?? []).map((t) => ({ ...t, status: local[t.id] ?? t.status }));
  const done = all.filter((t) => t.status === "Done").length;
  const todo = all.filter((t) => t.status === "Todo").length;
  const progress = (done / Math.max(1, all.length)) * 100;

  const setStatus = (t: Task, status: Task["status"]) => {
    setLocal((prev) => ({ ...prev, [t.id]: status }));
    void repositories.ai.setTaskStatus(t.id, status);
    if (status === "Done") push({ title: "Task completed", description: t.title, tone: "success" });
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="System"
        title="Tasks"
        description="Everything that needs a human decision today — AI drafts, approvals, publishing and risk checks."
        actions={
          <>
            <Select
              ariaLabel="Group"
              value={group}
              onChange={(v) => setGroup(v as "Today" | "This week" | "All")}
              options={["Today", "This week", "All"] as const}
              className="w-32"
            />
            <Button variant="primary" onClick={() => setModal(true)}>
              <Plus className="size-3.5" /> New task
            </Button>
          </>
        }
      />

      <Grid className="lg:grid-cols-4">
        {[
          { label: "Todo", value: todo, tone: "text-ink" },
          { label: "In progress", value: all.filter((t) => t.status === "In progress").length, tone: "text-info" },
          { label: "Done today", value: done, tone: "text-pos" },
          { label: "High priority", value: all.filter((t) => t.priority === "High").length, tone: "text-neg" },
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
              <span className="text-[12.5px] font-medium text-ink">Today's completion</span>
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
          <EmptyState icon={<ListChecks className="size-4" />} title="Nothing here" description="No tasks match this filter." />
        ) : (
          <div>
            {rows.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start gap-3 border-b border-line/60 px-5 py-3.5 last:border-0 hover:bg-surface-2/60">
                <button
                  onClick={() => setStatus(t, t.status === "Done" ? "Todo" : t.status === "Todo" ? "In progress" : "Done")}
                  className="mt-0.5 text-faint transition-colors hover:text-ink"
                  aria-label="Toggle task status"
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
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-muted">{t.detail}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-faint">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {t.due}
                    </span>
                    <span>Source · {t.source}</span>
                    <span className="num">{t.group}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} dot={false} />
                  <Select
                    ariaLabel="Change status"
                    value={t.status}
                    onChange={(v) => setStatus(t, v as Task["status"])}
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
          <CardHeader title="Approvals blocking agents" subtitle="Agents slow down when these wait" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { label: "8 conversation drafts", detail: "Conversation Agent · median wait 41 min", tone: "warn" as const },
              { label: "3 asset approvals", detail: "Content Agent · blocks episode 05 cuts", tone: "warn" as const },
              { label: "1 churn intervention", detail: "Sales Agent · waiting on win-back approval", tone: "neg" as const },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2/50 px-4 py-3">
                <span className={cn("size-1.5 rounded-full", r.tone === "neg" ? "bg-neg" : "bg-warn")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-ink">{r.label}</div>
                  <div className="text-[11px] text-faint">{r.detail}</div>
                </div>
                <Button size="sm" variant="subtle">
                  Review
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Workload" subtitle="By source" />
          <div className="px-5 pb-5">
            {["Conversations", "Content", "Episodes", "Fans", "Revenue"].map((src, i) => {
              const count = all.filter((t) => t.source === src).length;
              return (
                <div key={src} className="mb-3">
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-muted">{src}</span>
                    <span className="num text-ink-2">{count}</span>
                  </div>
                  <ProgressBar value={count} max={4} tone={i % 2 ? "info" : "accent"} height={3} />
                </div>
              );
            })}
            <Divider className="my-4" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Clearing the approval queue unblocks roughly 40 agent runs per hour.
            </p>
          </div>
        </Card>
      </Grid>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="New task"
        subtitle="Tasks are created locally in this prototype."
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setModal(false);
                push({ title: "Task created", description: "Added to Today.", tone: "success" });
              }}
            >
              Create task
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Title</span>
            <input placeholder="Approve episode 05 caption" className="h-9 w-full rounded-[9px] border border-line bg-canvas-2 px-3 text-[13px] focus:outline-none" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Detail</span>
            <textarea rows={3} placeholder="What has to be decided…" className="w-full resize-y rounded-[9px] border border-line bg-canvas-2 px-3 py-2.5 text-[13px] focus:outline-none" />
          </label>
        </div>
      </Modal>
    </PageContainer>
  );
}
