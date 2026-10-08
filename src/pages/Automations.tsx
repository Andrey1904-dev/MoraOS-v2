import { ArrowDown, Bot, Cog, Pause, Play, Workflow, Zap } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, number as fmtNum } from "@/lib/format";
import { cn } from "@/utils/cn";

export default function Automations() {
  const { data, loading } = useResource(() => repositories.ai.automations());

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI"
        title="Automations"
        description="Workflow definitions that connect fans, content and money. Every step is either deterministic or an AI decision point."
        actions={
          <>
            <Button variant="outline" disabled title="The automation engine is not connected yet" aria-label="Pause all (not available yet)">
              <Pause className="size-3.5" /> Pause all
            </Button>
            <Button variant="primary" disabled title="The visual builder ships with the automation engine" aria-label="New workflow (not available yet)">
              <Workflow className="size-3.5" /> New workflow
            </Button>
          </>
        }
      />

      <div role="note" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-[12.5px] leading-6 text-warn">
        The automation engine is not connected yet, so nothing on this page runs by itself. The workflows and
        runs shown are sample definitions.
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
                  disabled
                  title="The automation engine is not connected yet"
                  aria-label={`${w.status === "Active" ? "Pause" : "Resume"} ${w.name} (not available yet)`}
                >
                  {w.status === "Active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {w.status === "Active" ? "Pause" : "Resume"}
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
          <CardHeader title="Run history" subtitle="Sample data — the engine does not run workflows yet" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { wf: "PPV purchase → next action", at: "4 min ago", status: "Success" },
              { wf: "New fan onboarding", at: "12 min ago", status: "Success" },
              { wf: "Churn risk rescue", at: "38 min ago", status: "Success" },
              { wf: "Episode publishing", at: "2 days ago", status: "Paused" },
            ].map((r) => (
              <div key={r.at} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-pos" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink-2">{r.wf}</div>
                </div>
                <span className="num text-[11px] text-faint">{r.at}</span>
                <StatusBadge status={r.status} dot={false} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Approval policy" subtitle="What the system may do without you" />
          <div className="space-y-3 px-5 pb-5">
            {[
              { label: "Create CRM records", value: "Allowed" },
              { label: "Update LTV and relationship", value: "Allowed" },
              { label: "Draft messages", value: "Allowed" },
              { label: "Send messages", value: "Requires approval" },
              { label: "Publish content", value: "Requires approval" },
              { label: "Change prices", value: "Blocked" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                <span className="text-muted">{r.label}</span>
                <Badge tone={r.value === "Allowed" ? "pos" : r.value === "Blocked" ? "neg" : "warn"} dot>
                  {r.value}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </Grid>
    </PageContainer>
  );
}
