import { useMemo, useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Eye,
  Images,
  List,
  MessageSquare,
  Plus,
  Wallet,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/Page";
import { Card, Badge, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterChips, SearchInput, SegmentedControl } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Overlays";
import { EmptyState, SkeletonCards, SkeletonRows } from "@/components/ui/Feedback";
import { ContentEditorPanel } from "@/components/content/ContentEditorPanel";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { currency, number as fmtNum, shortDate } from "@/lib/format";
import { cn } from "@/utils/cn";

const FILTERS = ["All", "Idea", "Draft", "Ready", "Scheduled", "Published"] as const;
const VIEWS = ["Grid", "List", "Calendar"] as const;

const PLATFORM_TONE: Record<string, "accent" | "info" | "neutral" | "pos"> = {
  TikTok: "neutral",
  Instagram: "accent",
  Threads: "info",
  Fanvue: "pos",
  Telegram: "info",
};

const PLACEHOLDER_IMAGES: Record<string, string> = {
  Fanvue: "https://images.pexels.com/photos/37657504/pexels-photo-37657504.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=800&h=1000",
  Instagram: "https://images.pexels.com/photos/14995251/pexels-photo-14995251.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=800&h=1000",
  TikTok: "https://images.pexels.com/photos/34011808/pexels-photo-34011808.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=800&h=1000",
};

export default function Content() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<string>("All");
  const [view, setView] = useState<string>("Grid");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading } = useResource(
    () => repositories.content.list({ search: search || undefined, status: filter !== "All" ? filter : undefined }),
    [filter, search, refreshKey],
  );
  const { data: episodes } = useResource(() => repositories.content.episodes());

  const openId = params.get("open");
  const openItem = data?.find((c) => c.id === openId) ?? null;

  const rows = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    (data ?? []).forEach((c) => (acc[c.status] = (acc[c.status] ?? 0) + 1));
    return acc;
  }, [data]);

  const episodesById = useMemo(() => {
    const map = new Map<string, { number: number; title: string }>();
    for (const e of episodes ?? []) map.set(e.id, { number: e.number, title: e.title });
    return map;
  }, [episodes]);

  const calendarCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: startPad }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
  }, []);

  function getImage(c: { platform: string }) {
    return PLACEHOLDER_IMAGES[c.platform] ?? PLACEHOLDER_IMAGES.TikTok;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Content"
        title="Content"
        description="Every post, drop and story beat tied to the storyline — from draft to published performance."
        actions={
          <>
            <SegmentedControl options={VIEWS} value={view as (typeof VIEWS)[number]} onChange={setView} />
            <Button variant="primary" onClick={() => navigate("/content/new")}>
              <Plus className="size-3.5" /> Create content
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search content…" className="lg:w-72" />
          <FilterChips
            options={FILTERS}
            value={filter as (typeof FILTERS)[number]}
            onChange={setFilter}
            counts={{ All: data?.length, Idea: counts.Idea, Draft: counts.Draft, Ready: counts.Ready, Scheduled: counts.Scheduled, Published: counts.Published }}
          />
          <div className="num ml-auto text-[11.5px] text-faint">
            {fmtNum((data ?? []).reduce((s, c) => s + c.views, 0), true)} total views ·{" "}
            {currency((data ?? []).reduce((s, c) => s + c.revenue, 0))} attributed
          </div>
        </div>

        {loading && view === "Grid" && (
          <div className="p-5">
            <SkeletonCards count={8} />
          </div>
        )}
        {loading && view === "List" && <SkeletonRows rows={8} />}

        {/* Grid */}
        {!loading && view === "Grid" && (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((c) => {
              const ep = episodesById.get(c.episodeId ?? "");
              return (
                <button
                  key={c.id}
                  onClick={() => setParams({ open: c.id })}
                  className="group overflow-hidden rounded-xl border border-line bg-canvas-2 text-left transition-all duration-150 hover:border-line-2 hover:bg-surface-2"
                >
                  <div className="relative aspect-4/5 overflow-hidden bg-surface-3">
                    {c.type === "Text" ? (
                      <div className="flex size-full flex-col justify-center p-4">
                        <p className="text-[13px] leading-relaxed text-ink-2">{c.hook}</p>
                      </div>
                    ) : (
                      <SafeImg
                        src={getImage(c)}
                        alt={c.title}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    )}
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                      <Badge tone={PLATFORM_TONE[c.platform]} className="backdrop-blur-sm">
                        {c.platform}
                      </Badge>
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <StatusBadge status={c.status} className="backdrop-blur-sm" />
                    </div>
                    {c.type !== "Text" && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                        <p className="line-clamp-2 text-[11.5px] leading-snug text-white/90">{c.hook}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate text-[13px] font-medium text-ink">{c.title}</div>
                      {ep && <span className="num shrink-0 text-[10.5px] text-faint">EP {String(ep.number).padStart(2, "0")}</span>}
                    </div>
                    <div className="mt-1 text-[11.5px] text-muted">{ep ? ep.title : "Standalone"}</div>
                    <Divider className="my-3" />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="label">Views</div>
                        <div className="num mt-1 text-[12px] text-ink">{c.views ? fmtNum(c.views, true) : "—"}</div>
                      </div>
                      <div>
                        <div className="label">Eng.</div>
                        <div className="num mt-1 text-[12px] text-ink">{c.engagement ? `${c.engagement}%` : "—"}</div>
                      </div>
                      <div>
                        <div className="label">Rev.</div>
                        <div className="num mt-1 text-[12px] text-accent-hi">{c.revenue ? currency(c.revenue, { compact: true }) : "—"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-faint">
                      {c.status === "Scheduled" ? (
                        <>
                          <CalendarDays className="size-3" /> {shortDate(c.scheduledFor)}
                        </>
                      ) : (
                        <>
                          <Eye className="size-3" /> {c.publishedAt ? shortDate(c.publishedAt) : "not published"}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {rows.length === 0 && (
              <div className="col-span-full">
                <EmptyState icon={<Images className="size-4" />} title="No content in this state" description="Try another filter or create a new piece." />
              </div>
            )}
          </div>
        )}

        {/* List */}
        {!loading && view === "List" && (
          <div>
            <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_110px_130px_100px_100px_110px_110px] gap-4 border-b border-line px-5 py-2.5 text-[10.5px] tracking-[0.09em] text-faint uppercase">
              <span>Title</span><span>Platform</span><span>Episode</span><span>Status</span><span>Views</span><span>Engagement</span><span>Revenue</span>
            </div>
            {rows.map((c) => {
              const ep = episodesById.get(c.episodeId ?? "");
              return (
                <button
                  key={c.id}
                  onClick={() => setParams({ open: c.id })}
                  className="hidden lg:grid w-full grid-cols-[minmax(0,2.2fr)_110px_130px_100px_100px_110px_110px] items-center gap-4 border-b border-line/60 px-5 py-3 text-left transition-colors last:border-0 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{c.title}</div>
                    <div className="truncate text-[11.5px] text-faint">{c.hook}</div>
                  </div>
                  <Badge tone={PLATFORM_TONE[c.platform]}>{c.platform}</Badge>
                  <span className="truncate text-[12px] text-muted">{ep ? `EP ${String(ep.number).padStart(2, "0")} · ${ep.title}` : "—"}</span>
                  <StatusBadge status={c.status} />
                  <span className="num text-[12.5px] text-ink">{c.views ? fmtNum(c.views, true) : "—"}</span>
                  <span className="num text-[12.5px] text-ink">{c.engagement ? `${c.engagement}%` : "—"}</span>
                  <span className="num text-[12.5px] text-accent-hi">{c.revenue ? currency(c.revenue) : "—"}</span>
                </button>
              );
            })}

            {/* Mobile list */}
            <div className="divide-y divide-line lg:hidden">
              {rows.map((c) => {
                const ep = episodesById.get(c.episodeId ?? "");
                return (
                  <button key={c.id} onClick={() => setParams({ open: c.id })} className="w-full px-4 py-4 text-left">
                    <div className="flex items-center gap-2">
                      <Badge tone={PLATFORM_TONE[c.platform]}>{c.platform}</Badge>
                      <StatusBadge status={c.status} className="ml-auto" />
                    </div>
                    <div className="mt-2 text-[13px] font-medium text-ink">{c.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted">{ep ? `EP ${String(ep.number).padStart(2, "0")} · ${ep.title}` : "Standalone"}</div>
                    <div className="mt-2.5 flex items-center gap-4 text-[11.5px] text-muted">
                      <span className="num flex items-center gap-1"><Eye className="size-3" />{fmtNum(c.views, true)}</span>
                      <span className="num">{c.engagement}%</span>
                      <span className="num text-accent-hi">{currency(c.revenue, { compact: true })}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {rows.length === 0 && (
              <EmptyState icon={<List className="size-4" />} title="Nothing to show" />
            )}
          </div>
        )}

        {/* Calendar */}
        {!loading && view === "Calendar" && (
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink">
                {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <div className="flex items-center gap-3 text-[11px] text-faint">
                {["Published", "Scheduled", "Draft"].map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-[2px]",
                        i === 0 ? "bg-pos/70" : i === 1 ? "bg-info/70" : "bg-line-2",
                      )}
                    />
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="label pb-1 text-center">{d}</div>
              ))}
              {calendarCells.map((date, i) => {
                if (!date) return <div key={`pad-${i}`} />;
                const iso = date.toISOString().slice(0, 10);
                const dayItems = (data ?? []).filter(
                  (c) => (c.scheduledFor ?? c.publishedAt ?? "").slice(0, 10) === iso,
                );
                const isToday = new Date().toDateString() === date.toDateString();
                return (
                  <div
                    key={iso}
                    className={cn(
                      "min-h-[92px] rounded-lg border p-2 transition-colors",
                      isToday ? "border-accent/35 bg-accent/[0.05]" : "border-line bg-canvas-2/40 hover:border-line-2",
                    )}
                  >
                    <div className="num text-[10.5px] text-faint">{date.getDate()}</div>
                    <div className="mt-1.5 space-y-1">
                      {dayItems.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setParams({ open: c.id })}
                          className={cn(
                            "block w-full truncate rounded px-1.5 py-1 text-left text-[10.5px] transition-colors",
                            c.status === "Published"
                              ? "bg-pos/12 text-pos"
                              : c.status === "Scheduled"
                                ? "bg-info/12 text-info"
                                : "bg-surface-3 text-muted",
                          )}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Editor modal */}
      <Modal
        open={!!openItem}
        onClose={() => setParams({})}
        title={openItem ? `Edit · ${openItem.title}` : "Edit content"}
        subtitle="Changes stay in Mara OS until you publish."
        width="max-w-4xl"
        footer={
          <Button variant="primary" onClick={() => { setRefreshKey((k) => k + 1); setParams({}); }}>
            Done
          </Button>
        }
      >
        {openItem && (
          <ContentEditorPanel
            item={openItem}
            onCancel={() => setParams({})}
            onSaved={() => { setRefreshKey((k) => k + 1); setParams({}); }}
            onDeleted={() => { setRefreshKey((k) => k + 1); setParams({}); }}
          />
        )}
      </Modal>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        {[
          { icon: <Images className="size-3.5" />, label: "Published", value: counts.Published ?? 0 },
          { icon: <CalendarDays className="size-3.5" />, label: "Scheduled", value: counts.Scheduled ?? 0 },
          { icon: <MessageSquare className="size-3.5" />, label: "Ready to schedule", value: counts.Ready ?? 0 },
          { icon: <Wallet className="size-3.5" />, label: "Attributed revenue", value: currency((data ?? []).reduce((s, c) => s + c.revenue, 0), { compact: true }) },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-canvas-2 text-faint">{s.icon}</span>
            <div>
              <div className="label">{s.label}</div>
              <div className="num mt-1 text-[15px] font-medium text-ink">{s.value}</div>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
