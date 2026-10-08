import { useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  Eye,
  Images,
  Plus,
  UserPlus,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, ProgressBar, Divider, KeyStat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Feedback";
import { AINote } from "@/components/common/AICard";
import { useResource } from "@/hooks/useResource";
import { repositories, story } from "@/repositories";
import { media } from "@/data/media";
import { currency, longDate, number as fmtNum, shortDate } from "@/lib/format";
import { cn } from "@/utils/cn";

const statusColor: Record<string, string> = {
  Published: "border-pos/40",
  Scheduled: "border-info/40",
  "In production": "border-warn/40",
  Outline: "border-line",
};

export default function Episodes() {
  const { data, loading } = useResource(() => repositories.content.episodes());
  const [expanded, setExpanded] = useState<string | null>("ep04");

  const published = (data ?? []).filter((e) => e.status === "Published");
  const totalViews = published.reduce((s, e) => s + e.performance.views, 0);
  const totalFollowers = published.reduce((s, e) => s + e.performance.followers, 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Content · Storyline"
        title={story.title}
        description={story.logline}
        meta={
          <>
            <Badge tone="accent">{story.season}</Badge>
            <span className="text-[12px] text-muted">{story.genre}</span>
            <span className="text-[12px] text-muted">{story.cadence}</span>
          </>
        }
        actions={
          <Button variant="primary" disabled title="Not available yet">
            <Plus className="size-3.5" /> New episode
          </Button>
        }
      />

      <Grid className="lg:grid-cols-4">
        {[
          { label: "Episodes published", value: published.length },
          { label: "Storyline views", value: fmtNum(totalViews, true) },
          { label: "Followers gained", value: `+${fmtNum(totalFollowers, true)}` },
          { label: "Avg. retention", value: "64%" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="label">{s.label}</div>
            <div className="num mt-2 text-[19px] font-medium text-ink">{s.value}</div>
          </Card>
        ))}
      </Grid>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={story.season} subtitle="Vertical storyline — every episode carries the arc forward" />
            <div className="px-5 pb-6">
              {loading && <SkeletonRows rows={5} />}
              <div className="relative pl-7">
                <span className="absolute top-1 bottom-1 left-[7px] w-px bg-line" />
                {(data ?? []).map((ep) => {
                  const open = expanded === ep.id;
                  return (
                    <div key={ep.id} className="relative pb-5 last:pb-0">
                      <span
                        className={cn(
                          "absolute top-4 -left-7 grid size-[15px] place-items-center rounded-full border-2 border-surface text-[8px] font-semibold",
                          ep.status === "Published" ? "bg-accent text-white" : "bg-surface-3 text-muted",
                        )}
                      >
                        {ep.number}
                      </span>

                      <button
                        onClick={() => setExpanded(open ? null : ep.id)}
                        className={cn(
                          "w-full rounded-xl border bg-canvas-2/40 px-4 py-3.5 text-left transition-colors",
                          statusColor[ep.status],
                          open ? "border-line-2 bg-surface-2" : "hover:border-line-2",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="num text-[11px] text-faint">Episode {String(ep.number).padStart(2, "0")}</span>
                          <span className="text-[14px] font-medium text-ink">{ep.title}</span>
                          <StatusBadge status={ep.status} className="ml-auto" />
                          <ChevronDown className={cn("size-4 text-faint transition-transform", open && "rotate-180")} />
                        </div>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{ep.logline}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-faint">
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-3" />
                            {ep.status === "Published" ? shortDate(ep.publishedAt) : `target ${shortDate(ep.publishedAt)}`}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Images className="size-3" /> {ep.assetIds.length} assets
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Eye className="size-3" /> {ep.performance.views ? fmtNum(ep.performance.views, true) : "—"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <UserPlus className="size-3" /> {ep.performance.followers ? `+${fmtNum(ep.performance.followers, true)}` : "—"}
                          </span>
                        </div>
                      </button>

                      {open && (
                        <div className="anim-fade mt-2 rounded-xl border border-line bg-canvas-2/30 p-4">
                          <p className="text-[12.5px] leading-relaxed text-ink-2">{ep.description}</p>

                          <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <KeyStat label="Beat" value={ep.beat} />
                            <KeyStat label="Retention" value={ep.performance.retention ? `${ep.performance.retention}%` : "—"} />
                            <KeyStat
                              label="Revenue"
                              value={ep.performance.views ? currency(Math.round(ep.performance.views * 0.006), { compact: true }) : "—"}
                            />
                          </div>

                          <Divider className="my-4" />

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <div className="label mb-2.5">Related content</div>
                              <div className="space-y-2">
                                {ep.contentIds.map((id) => (
                                  <Link
                                    key={id}
                                    to={`/content?open=${id}`}
                                    className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
                                  >
                                    <Images className="size-3.5 text-faint" />
                                    <span className="truncate">
                                      {id === "cnt_01"
                                        ? "The red notebook"
                                        : id === "cnt_02"
                                          ? "Monday again"
                                          : id === "cnt_03"
                                            ? "Debt update"
                                            : id === "cnt_04"
                                              ? "Apartment, 7am"
                                              : id === "cnt_05"
                                                ? "Late night"
                                                : id === "cnt_06"
                                                  ? "The reality check"
                                                  : id === "cnt_09"
                                                    ? "The decision — trailer"
                                                    : "First week — honest cut"}
                                    </span>
                                  </Link>
                                ))}
                                {ep.contentIds.length === 0 && <div className="text-[11.5px] text-faint">No content attached yet.</div>}
                              </div>
                            </div>
                            <div>
                              <div className="label mb-2.5">Assets</div>
                              <div className="flex flex-wrap gap-2">
                                {ep.assetIds.map((id, i) => (
                                  <Link key={id} to="/assets" className="group relative">
                                    <SafeImg
                                      src={[media.portraits[0], media.portraits[2], media.portraits[6], media.portraits[3], media.portraits[8], media.wide[9]][i % 6]}
                                      alt="asset"
                                      loading="lazy"
                                      className="size-16 rounded-lg border border-line object-cover transition-opacity group-hover:opacity-80"
                                    />
                                  </Link>
                                ))}
                                {ep.assetIds.length === 0 && <div className="text-[11.5px] text-faint">No assets attached yet.</div>}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button size="sm" variant="primary" disabled title="Not available yet">
                              Open editor
                            </Button>
                            <Button size="sm" variant="subtle" disabled title="Not available yet">
                              Schedule publish
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Side */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Story bible" subtitle="Continuity rules enforced by the Character Agent" />
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-lg border border-line bg-canvas-2/50 p-3">
                <div className="label">Logline</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{story.logline}</p>
              </div>
              <div>
                <div className="label mb-2">Arc</div>
                <div className="space-y-2.5">
                  {[
                    { beat: "Setup", pct: 100 },
                    { beat: "Rising", pct: 78 },
                    { beat: "Midpoint", pct: 46 },
                    { beat: "Complication", pct: 22 },
                    { beat: "Resolution", pct: 4 },
                  ].map((b) => (
                    <div key={b.beat}>
                      <div className="mb-1 flex justify-between text-[11.5px]">
                        <span className="text-muted">{b.beat}</span>
                        <span className="num text-faint">{b.pct}%</span>
                      </div>
                      <ProgressBar value={b.pct} tone={b.pct > 50 ? "accent" : "info"} height={3} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <AINote
            title="AI Insight"
            footer={
              <Link to="/ai" className="text-[11.5px] text-accent-hi hover:underline">
                Open AI Studio
              </Link>
            }
          >
            Episode 05 should ship this Friday, not next week — the storyline is outperforming standalone posts by 34%.
          </AINote>

          <Card>
            <CardHeader title="Publishing cadence" subtitle="Fridays at 18:00 local" />
            <div className="px-5 pb-5">
              <div className="space-y-2.5">
                {[
                  { day: "Mon", label: "Story snippet", status: "Approved" },
                  { day: "Wed", label: "Behind the scenes", status: "In production" },
                  { day: "Fri", label: "Episode 05", status: "Scheduled" },
                ].map((r) => (
                  <div key={r.day} className="flex items-center gap-3">
                    <span className="num w-8 text-[11px] text-faint">{r.day}</span>
                    <span className="flex-1 text-[12.5px] text-ink-2">{r.label}</span>
                    <StatusBadge status={r.status} dot={false} />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-faint">
              <Clapperboard className="size-3.5" />
              <span className="label">Next milestone</span>
            </div>
            <div className="mt-3 text-[13px] text-ink">Episode 05 · The reality check</div>
            <p className="mt-1 text-[12px] text-muted">Publishes {longDate(new Date(Date.now() + 2 * 86_400_000).toISOString())}</p>
            <ProgressBar value={72} className="mt-3" />
            <div className="num mt-2 text-[11px] text-faint">72% of production tasks complete</div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
