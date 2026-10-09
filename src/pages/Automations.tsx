import { ArrowDown, Bot, Cog, Pause, Play, Zap, Plus } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Feedback";

import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, number as fmtNum } from "@/lib/format";
import { cn } from "@/utils/cn";

export default function Automations() {
  const { push } = useToast();
  const { data, loading, refetch } = useResource(() => repositories.ai.automations());

  async function setStatus(id: string, currentStatus: string) {
    const next = currentStatus === "Active" ? "Paused" : "Active";
    try {
      await repositories.ai.setAutomationStatus(id, next);
      push({ title: next === "Active" ? "Automation enabled" : "Automation disabled", tone: "success" });
      void refetch();
    } catch (error) {
      push({ title: "Update failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    }
  }

  async function runNow(id: string, name: string) {
    try {
      await repositories.ai.recordAutomationRun(id);
      push({ title: `Ran: ${name}`, description: "Run logged to automation_runs.", tone: "success" });
      void refetch();
    } catch (error) {
      push({ title: "Run failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI"
        title="Automations"
        description="Workflow definitions that connect fans, content and money. MVP: every action runs synchronously when triggered; no enterprise engine yet."
        actions={
          <>
            <Button variant="outline" disabled title="Pause-all control coming after MVP">
              <Pause className="size-3.5" /> Pause all
            </Button>
            <Button variant="primary" disabled title="Visual workflow builder is post-MVP">
              <Plus className="size-3.5" /> New workflow
            </Button>
          </>
        }
      />

      <div role="note" className="mt-4 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-[12.5px] leading-6 text-info">
        MVP runner: triggers are defined but conditions execute as simple pass-through. Each "Run now" logs an entry to <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">automation_runs</code>.
      </div>

      <Grid className="lg:grid-cols-4">
        {[
          { label: "Active workflows", value: String((data ?? []).filter((w) => w.status === "Active").length) },
          { label: "Total runs", value: fmtNum((data ?? []).reduce((s, w) => s + w.runs, 0)) },
          { label: "AI decision points", value: String((data ?? []).reduce((s, w) => s + w.steps.filter((x) => x.actor === "ai").length, 0)) },
          { label: "Failed runs (24h)", value: "0" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="label">{s.label}</div>
            <div className="num mt-2 text-[19px] font-medium text-ink">{s.value}</div>
          </Card>
        ))}
      </Grid>

      <div className="mt-4 space-y-4">
        {loading && <Card className="h-40 animate-pulse" />}
        {(data ?? []).map((w) => (
          <Card key={w.id}>
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-canvas-2 text-accent-hi">
                <Zap className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink">{w.name}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  Trigger · {w.trigger} · {fmtNum(w.runs)} runs · last {ago(w.lastRun)}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <StatusBadge status={w.status} />
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => void setStatus(w.id, w.status)}
                >
                  {w.status === "Active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {w.status === "Active" ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void runNow(w.id, w.name)}
                  disabled={w.status !== "Active"}
                >
                  <Play className="size-3.5" /> Run now
                </Button>
              </div>
            </div>

            <div className="px-5 py-5">
              <div
                className="hide-scrollbar flex gap-3 overflow-x-auto pb-1"
                role="region"
                tabIndex={0}
                aria-label={`${w.name} steps`}
              >
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="flex h-16 w-36 flex-col justify-center rounded-lg border border-accent/30 bg-accent/[0.07] px-3">
                    <div className="flex items-center gap-1.5">
                      <Cog className="size-3 text-accent-hi" />
                      <span className="text-[10px] font-semibold tracking-[0.08em] text-accent-hi uppercase">Trigger</span>
                    </div>
                    <div className="mt-1 text-[12px] leading-snug text-ink">{w.trigger}</div>
                  </div>
                </div>

                {w.steps.map((step, i) => (
                  <div key={step.id} className="flex shrink-0 items-center gap-3">
                    <ArrowDown className="size-3.5 -rotate-90 text-faint" />
                    <div
                      className={cn(
                        "flex h-16 w-44 flex-col justify-center rounded-lg border px-3",
                        step.actor === "ai" ? "border-info/30 bg-info/[0.07]" : "border-line bg-canvas-2/60",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {step.actor === "ai" ? (
                          <Bot className="size-3 text-info" />
                        ) : (
                          <Cog className="size-3 text-faint" />
                        )}
                        <span
                          className={cn(
                            "text-[10px] font-semibold tracking-[0.08em] uppercase",
                            step.actor === "ai" ? "text-info" : "text-faint",
                          )}
                        >
                          {step.actor === "ai" ? "AI" : "System"}
                        </span>
                        <span className="num ml-auto text-[9.5px] text-faint">{i + 1}</span>
                      </div>
                      <div className="mt-1 text-[12px] leading-snug text-ink">{step.label}</div>
                      <div className="mt-0.5 line-clamp-1 text-[10.5px] text-faint">{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Divider className="my-4" />

              <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted">
                <span className="num">{w.steps.length} steps</span>
                <span className="num">{w.steps.filter((s) => s.actor === "ai").length} AI steps</span>
                <span className="num">{w.steps.filter((s) => s.actor === "system").length} system steps</span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone={w.status === "Active" ? "pos" : "warn"} dot>
                    {w.status}
                  </Badge>
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Kill switch" subtitle="One click to disable every automation" />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-[12.5px] leading-relaxed text-muted">
              If an automation misbehaves, use the Disable button next to it above. The button below pauses every active workflow at once.
            </p>
            <Button
              variant="primary"
              onClick={async () => {
                for (const w of data ?? []) {
                  if (w.status === "Active") {
                    await repositories.ai.setAutomationStatus(w.id, "Paused");
                  }
                }
                push({ title: "All automations paused", tone: "success" });
                void refetch();
              }}
            >
              <Pause className="size-3.5" /> Pause all workflows
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Supported triggers" subtitle="MVP" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { t: "manual", d: "Triggered by the operator (Run now)." },
              { t: "schedule", d: "Time-based; runner invoked externally (cron or Edge Function cron)." },
              { t: "event", d: "Fires on matching event types (fan_created, subscription_started, etc.)." },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-3">
                <span className="num mt-0.5 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">{r.t}</span>
                <span className="text-[12px] leading-relaxed text-muted">{r.d}</span>
              </div>
            ))}
          </div>
        </Card>
      </Grid>
    </PageContainer>
  );
}
