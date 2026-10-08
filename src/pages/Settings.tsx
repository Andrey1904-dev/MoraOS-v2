import { useState } from "react";
import {
  Bell,
  Bot,
  KeyRound,
  Layers,
  Plug,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Avatar, Divider, KeyStat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass, Select, Switch } from "@/components/ui/Controls";

import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { media } from "@/data/media";
import { TelegramSection } from "./settings/TelegramSection";
import { cn } from "@/utils/cn";

const SECTIONS = ["Character", "AI", "Platforms", "Notifications", "Team", "Security", "Telegram"] as const;

export default function Settings() {
  const { data: character } = useResource(() => repositories.character.get());
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Character");

  const [ai, setAi] = useState({
    conversations: true,
    autoSend: false,
    memory: true,
    sales: true,
    content: true,
    escalation: true,
  });

  const [notifications, setNotifications] = useState({
    drafts: true,
    churn: true,
    revenue: true,
    publish: false,
    weekly: true,
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Character definition, AI behaviour, platform connections and workspace controls."
        actions={
          <Button variant="primary" disabled title="Settings cannot be saved yet" aria-label="Save changes (not available yet)">
            Save changes
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Section nav */}
        <nav className="hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:self-start lg:px-0">
          {SECTIONS.map((s) => {
            const Icon =
              s === "Character" ? Bot : s === "AI" ? Layers : s === "Platforms" ? Plug : s === "Notifications" ? Bell : s === "Team" ? Users : s === "Telegram" ? Send : ShieldCheck;
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  section === s ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2",
                )}
              >
                <Icon className={cn("size-[15px]", section === s ? "text-accent-hi" : "text-faint")} strokeWidth={1.75} />
                {s}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {section === "Character" && (
            <>
              <Card>
                <CardHeader title="Character" subtitle="The single source of truth every agent reads" />
                <div className="px-5 pb-5">
                  <div className="flex items-start gap-4">
                    <Avatar name="Mara Quinn" src={media.mara} size={64} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[17px] font-medium text-ink">{character?.name ?? "Mara Quinn"}</h2>
                        <Badge tone="accent">Active character</Badge>
                      </div>
                      <div className="mt-1 text-[12.5px] text-muted">
                        {character?.age} · {character?.city} · {character?.occupation}
                      </div>
                      <div className="mt-2 text-[12.5px] text-ink-2">Story: {character?.story}</div>
                    </div>
                  </div>

                  <Divider className="my-5" />

                  <div className="grid gap-5 lg:grid-cols-2">
                    <Field label="Name">
                      <input defaultValue={character?.name} className={inputClass} />
                    </Field>
                    <Field label="Age">
                      <input defaultValue={String(character?.age ?? 23)} className={inputClass} />
                    </Field>
                    <Field label="City">
                      <input defaultValue={character?.city} className={inputClass} />
                    </Field>
                    <Field label="Occupation">
                      <input defaultValue={character?.occupation} className={inputClass} />
                    </Field>
                    <Field label="Story" className="lg:col-span-2" hint="Used by the Content Agent for continuity checks.">
                      <input defaultValue={character?.story} className={inputClass} />
                    </Field>
                    <Field label="Logline" className="lg:col-span-2">
                      <textarea rows={3} defaultValue={character?.logline} className={textareaClass} />
                    </Field>
                    <Field label="Voice" className="lg:col-span-2" hint="Every generated message is checked against this.">
                      <textarea rows={2} defaultValue={character?.voice} className={textareaClass} />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Traits" subtitle="Static attributes exposed to prompts" />
                <div className="grid gap-px bg-line sm:grid-cols-2">
                  {(character?.traits ?? []).map((t) => (
                    <div key={t.label} className="bg-surface px-5 py-3.5">
                      <div className="label">{t.label}</div>
                      <div className="mt-1.5 text-[12.5px] text-ink">{t.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Boundaries" subtitle="Hard rules — never overridden by prompts" />
                <div className="space-y-2 px-5 pb-5">
                  {(character?.boundaries ?? []).map((b) => (
                    <div key={b} className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas-2/50 px-3.5 py-2.5">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-hi" strokeWidth={1.8} />
                      <span className="text-[12.5px] text-ink-2">{b}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {section === "AI" && (
            <>
              <Card>
                <CardHeader title="AI behaviour" subtitle="What the agents are allowed to do" />
                <div className="divide-y divide-line px-5 pb-2">
                  <Switch
                    checked={ai.conversations}
                    onChange={(v) => setAi({ ...ai, conversations: v })}
                    label="AI conversations"
                    description="Conversation Agent drafts replies for every inbound message."
                  />
                  <Switch
                    checked={ai.autoSend}
                    onChange={(v) => setAi({ ...ai, autoSend: v })}
                    label="Auto-send"
                    description="Send approved drafts automatically. Keep off until the AI provider is connected."
                  />
                  <Switch
                    checked={ai.memory}
                    onChange={(v) => setAi({ ...ai, memory: v })}
                    label="Memory"
                    description="Extract facts, preferences and boundaries from conversations."
                  />
                  <Switch
                    checked={ai.sales}
                    onChange={(v) => setAi({ ...ai, sales: v })}
                    label="Sales recommendations"
                    description="Propose offers based on LTV, purchase rhythm and content preference."
                  />
                  <Switch
                    checked={ai.content}
                    onChange={(v) => setAi({ ...ai, content: v })}
                    label="Content generation"
                    description="Hooks, captions and shot lists for each episode beat."
                  />
                  <Switch
                    checked={ai.escalation}
                    onChange={(v) => setAi({ ...ai, escalation: v })}
                    label="Escalate edge cases"
                    description="Anything outside the character card creates a task."
                  />
                </div>
              </Card>

              <Grid className="lg:grid-cols-2">
                <Card>
                  <CardHeader title="Model routing" subtitle="Which provider handles which job" />
                  <div className="space-y-4 px-5 pb-5">
                    {[
                      { label: "Conversation Agent", value: "mock-provider" },
                      { label: "Memory Agent", value: "mock-provider" },
                      { label: "Content Agent", value: "mock-provider" },
                      { label: "Image generation", value: "local" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 text-[12.5px] text-muted">{r.label}</span>
                        <Select value={r.value as "mock-provider"} onChange={() => {}} options={["mock-provider", "cloud-pro", "local"] as const} className="w-44" />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Safety" subtitle="Guardrails applied to every output" />
                  <div className="space-y-3 px-5 pb-5">
                    {[
                      { label: "Character card enforcement", value: "Strict" },
                      { label: "Boundary filter", value: "Enabled" },
                      { label: "Human approval for sends", value: "Required" },
                      { label: "Prompt injection defence", value: "Enabled" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between">
                        <span className="text-[12.5px] text-muted">{r.label}</span>
                        <Badge tone={r.value === "Required" ? "warn" : "pos"} dot>
                          {r.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </Grid>
            </>
          )}

          {section === "Platforms" && (
            <Card>
              <CardHeader title="Platforms" subtitle="Connectors are UI-only in v1" />
              <div className="divide-y divide-line px-5 pb-3">
                {[
                  { name: "Fanvue", detail: "Subscription, PPV, messaging", status: "Not connected" },
                  { name: "Telegram", detail: "Assistant bot and Mini App · fan DMs not connected", status: "Bot only" },
                  { name: "TikTok", detail: "Publishing + analytics", status: "Not connected" },
                  { name: "Instagram", detail: "Publishing + DM inbox", status: "Not connected" },
                  { name: "Threads", detail: "Text posts + replies", status: "Not connected" },
                ].map((p) => (
                  <div key={p.name} className="flex flex-wrap items-center gap-3 py-3.5">
                    <span className="grid size-8 place-items-center rounded-lg border border-line bg-canvas-2 text-[11px] font-semibold text-ink-2">
                      {p.name.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink">{p.name}</div>
                      <div className="text-[11.5px] text-muted">{p.detail}</div>
                    </div>
                    <Badge tone={p.status === "Bot only" ? "info" : "neutral"} dot>
                      {p.status}
                    </Badge>
                    <Button size="sm" variant="subtle" disabled title="Connectors are not available yet" aria-label={`Manage ${p.name} (not available yet)`}>
                      Manage
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {section === "Notifications" && (
            <Card>
              <CardHeader title="Notifications" subtitle="What reaches the operator" />
              <div className="divide-y divide-line px-5 pb-2">
                <Switch checked={notifications.drafts} onChange={(v) => setNotifications({ ...notifications, drafts: v })} label="Drafts waiting too long" description="Notify when a draft waits over 30 minutes." />
                <Switch checked={notifications.churn} onChange={(v) => setNotifications({ ...notifications, churn: v })} label="Churn signals" description="High-LTV fans crossing the inactivity threshold." />
                <Switch checked={notifications.revenue} onChange={(v) => setNotifications({ ...notifications, revenue: v })} label="Revenue milestones" description="Daily and weekly revenue summaries." />
                <Switch checked={notifications.publish} onChange={(v) => setNotifications({ ...notifications, publish: v })} label="Publish confirmations" description="Every successful platform publish." />
                <Switch checked={notifications.weekly} onChange={(v) => setNotifications({ ...notifications, weekly: v })} label="Weekly business review" description="Monday digest with the Analytics Agent read-out." />
              </div>
            </Card>
          )}

          {section === "Team" && (
            <Card>
              <CardHeader
                title="Team"
                subtitle="Roles for the workspace"
                action={<Button size="sm" variant="subtle" disabled title="Not available yet">Invite</Button>}
              />
              <div>
                {[
                  { name: "Andrey", role: "Owner", email: "andrey@maraos.app", tone: "#8a5a4a" },
                  { name: "Nika", role: "Operator", email: "nika@maraos.app", tone: "#4a6a8a" },
                  { name: "Leo", role: "Editor", email: "leo@maraos.app", tone: "#4a8a72" },
                ].map((m) => (
                  <div key={m.email} className="flex items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0">
                    <Avatar name={m.name} tone={m.tone} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink">{m.name}</div>
                      <div className="text-[11.5px] text-faint">{m.email}</div>
                    </div>
                    <Badge tone={m.role === "Owner" ? "accent" : "neutral"}>{m.role}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {section === "Security" && (
            <Grid className="lg:grid-cols-2">
              <Card>
                <CardHeader title="Security" subtitle="Workspace protection" />
                <div className="space-y-3 px-5 pb-5">
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2/50 px-4 py-3">
                    <KeyRound className="size-4 text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-ink">Two-factor authentication</div>
                      <div className="text-[11px] text-faint">Required for all owners</div>
                    </div>
                    <Badge tone="pos" dot>
                      On
                    </Badge>
                  </div>
                  {[
                    { label: "Session length", value: "7 days" },
                    { label: "Audit log", value: "Enabled" },
                    { label: "API keys issued", value: "2" },
                    { label: "Data residency", value: "EU" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-muted">{r.label}</span>
                      <span className="text-ink">{r.value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Architecture" subtitle="What is implemented today" />
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-5">
                    <KeyStat label="UI layer" value="Complete" hint="this build" />
                    <KeyStat label="Repositories" value="Implemented" hint="demo and Supabase share one interface" />
                  </div>
                  <Divider className="my-4" />
                  <div className="space-y-2">
                    {[
                      { name: "FanRepository", status: "Implemented" },
                      { name: "ContentRepository", status: "Implemented" },
                      { name: "ConversationRepository", status: "Implemented" },
                      { name: "CommerceRepository", status: "Implemented" },
                      { name: "AnalyticsRepository", status: "Implemented" },
                      { name: "AIProvider", status: "Mock provider until configured" },
                      { name: "FanvueAdapter", status: "Not started" },
                      { name: "TelegramAdapter", status: "Bot and Mini App live" },
                    ].map((r) => (
                      <div key={r.name} className="flex items-center justify-between rounded-lg border border-line bg-canvas-2/40 px-3 py-2">
                        <span className="font-mono text-[11.5px] text-ink-2">{r.name}</span>
                        <span className="text-right text-[11.5px] text-muted">{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Grid>
          )}
          {section === "Telegram" && <TelegramSection />}
        </div>
      </div>
    </PageContainer>
  );
}
