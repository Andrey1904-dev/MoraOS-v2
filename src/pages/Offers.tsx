import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Tag, TrendingUp, Users } from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, Divider, ProgressBar } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlays";
import { Field, inputClass, textareaClass, Select, SegmentedControl } from "@/components/ui/Controls";
import { SkeletonCards, useToast } from "@/components/ui/Feedback";
import { BarChart } from "@/components/ui/charts";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { currency } from "@/lib/format";
import { cn } from "@/utils/cn";

const KIND_TONE: Record<string, "accent" | "info" | "pos" | "neutral"> = {
  Subscription: "accent",
  VIP: "accent",
  PPV: "info",
  Bundle: "pos",
  Tip: "neutral",
};

export default function Offers() {
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const { data, loading } = useResource(() => repositories.commerce.offers());
  const [kind, setKind] = useState<"All" | "Subscription" | "PPV" | "VIP" | "Bundle">("All");

  const open = params.get("new") === "1";
  const rows = (data ?? []).filter((o) => (kind === "All" ? true : o.kind === kind));

  const mrr = (data ?? []).filter((o) => o.kind === "Subscription" || o.kind === "VIP").reduce((s, o) => s + o.revenue, 0);
  const totalBuyers = (data ?? []).reduce((s, o) => s + o.buyers, 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Business"
        title="Offers"
        description="Everything Mara sells — subscriptions, PPV drops, bundles and VIP access, with live conversion."
        actions={
          <>
            <SegmentedControl
              options={["All", "Subscription", "PPV", "VIP", "Bundle"] as const}
              value={kind}
              onChange={setKind}
            />
            <Button variant="primary" onClick={() => setParams({ new: "1" })}>
              <Plus className="size-3.5" /> Create offer
            </Button>
          </>
        }
      />

      <Grid className="lg:grid-cols-3">
        {[
          { label: "Recurring revenue", value: currency(mrr), note: "Subscriptions + VIP", tone: "text-accent-hi" },
          { label: "Active buyers", value: String(totalBuyers), note: "across all offers", tone: "text-ink" },
          { label: "Best converter", value: "Welcome bundle", note: "18.2% of new fans", tone: "text-ink" },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="label">{s.label}</div>
            <div className={cn("num mt-2 text-[20px] font-medium", s.tone)}>{s.value}</div>
            <div className="mt-1 text-[11.5px] text-muted">{s.note}</div>
          </Card>
        ))}
      </Grid>

      <Grid className="mt-4 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5">
                <SkeletonCards count={1} />
              </Card>
            ))
          : rows.map((o) => (
              <Card key={o.id} interactive className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14.5px] font-medium text-ink">{o.name}</h3>
                      <Badge tone={KIND_TONE[o.kind]}>{o.kind}</Badge>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="num text-[22px] font-medium tracking-[-0.02em] text-ink">
                        {currency(o.price, { cents: true })}
                      </span>
                      <span className="text-[12px] text-muted">{o.cadence}</span>
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>

                <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-muted">{o.description}</p>

                <Divider className="my-4" />

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="label">Buyers</div>
                    <div className="num mt-1 text-[13px] text-ink">{o.buyers}</div>
                  </div>
                  <div>
                    <div className="label">Revenue</div>
                    <div className="num mt-1 text-[13px] text-ink">{currency(o.revenue, { compact: true })}</div>
                  </div>
                  <div>
                    <div className="label">Conv.</div>
                    <div className="num mt-1 text-[13px] text-pos">{o.conversion}%</div>
                  </div>
                </div>

                <ProgressBar
                  value={o.conversion}
                  max={20}
                  tone={o.conversion > 10 ? "pos" : "accent"}
                  className="mt-3"
                />

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="subtle"
                    className="flex-1"
                    onClick={() => push({ title: `${o.name} opened`, description: "Offer editor is part of the commerce layer.", tone: "default" })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled title="Share links are not available yet"
                  >
                    Share
                  </Button>
                </div>
              </Card>
            ))}
      </Grid>

      <Grid className="mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by offer" subtitle="Last 30 days" action={<Badge tone="accent"><TrendingUp className="size-3" /> +12.4%</Badge>} />
          <div className="px-5 pb-5">
            <BarChart
              data={(data ?? []).filter((o) => o.revenue > 0).map((o) => ({ label: o.name, value: o.revenue }))}
              horizontal
              format="currency"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Offer performance" subtitle="Conversion rate by offer" />
          <div className="px-5 pb-5">
            <div className="space-y-4">
              {(data ?? []).map((o) => (
                <div key={o.id}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-ink-2">
                      <Users className="size-3 text-faint" /> {o.name}
                    </span>
                    <span className="num text-muted">{o.conversion}%</span>
                  </div>
                  <ProgressBar value={o.conversion} max={20} tone={o.conversion > 12 ? "pos" : "accent"} height={4} />
                </div>
              ))}
            </div>
            <Divider className="my-4" />
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Tag className="size-3.5" />
              Welcome bundle converts 2.7× better with TikTok-sourced fans.
            </div>
          </div>
        </Card>
      </Grid>

      <Modal
        open={open}
        onClose={() => setParams({})}
        title="Create offer"
        subtitle="Offers stay in Mara OS until a payment provider is connected."
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setParams({})}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled
              title="Offer creation is not available yet"
              onClick={() => setParams({})}
            >
              Create draft
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input placeholder="Behind the notebook" className={inputClass} />
          </Field>
          <Field label="Kind">
            <Select value="PPV" onChange={() => {}} options={["Subscription", "PPV", "VIP", "Bundle", "Tip"] as const} />
          </Field>
          <Field label="Price (USD)">
            <input placeholder="29.99" className={inputClass} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea rows={3} placeholder="4-minute uncut writing session + the spreadsheet scan." className={textareaClass} />
          </Field>
          <Field label="Status">
            <Select value="Draft" onChange={() => {}} options={["Draft", "Live", "Paused"] as const} />
          </Field>
        </div>
      </Modal>
    </PageContainer>
  );
}
