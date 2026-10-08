import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, Download, Plus, Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/Page";
import { Card, StatusBadge, Badge, Avatar, Delta } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterChips, SearchInput, Select, Pagination } from "@/components/ui/Controls";
import { DataTable, MobileCardList } from "@/components/ui/DataTable";
import { SkeletonRows, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { ago, currency } from "@/lib/format";
import { cn } from "@/utils/cn";

const SEGMENTS = ["All", "New", "Active", "Subscribers", "Buyers", "Inner circle", "At Risk"] as const;
type SortKey = "name" | "ltv" | "lastActivity" | "relationship";

const SORT_KEYS = {
  "LTV": "ltv",
  "Name": "name",
  "Last activity": "lastActivity",
  "Relationship": "relationship",
} as const;
const SORT_LABELS = Object.fromEntries(
  Object.entries(SORT_KEYS).map(([label, key]) => [key, label]),
) as Record<SortKey, string>;

export default function Fans() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<string>("All");
  const [sort, setSort] = useState<SortKey>("ltv");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const perPage = 10;

  const { data, loading } = useResource(
    () => repositories.fans.list({ search, segment }),
    [search, segment],
  );

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    list.sort((a, b) => {
      const mul = dir === "asc" ? 1 : -1;
      if (sort === "ltv") return (a.ltv - b.ltv) * mul;
      if (sort === "name") return a.name.localeCompare(b.name) * mul;
      if (sort === "lastActivity") return (a.lastActivity < b.lastActivity ? 1 : -1) * mul;
      const order = ["Visitor", "Follower", "Regular", "Fan", "Favorite", "Inner circle"];
      return (order.indexOf(a.relationship) - order.indexOf(b.relationship)) * mul;
    });
    return list;
  }, [data, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = rows.slice((Math.min(page, pageCount) - 1) * perPage, Math.min(page, pageCount) * perPage);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === current.length ? new Set() : new Set(current.map((f) => f.id))));

  const totalCount = data?.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Audience"
        title="Fans"
        description={`2,481 total fans · ${totalCount} shown in ${segment.toLowerCase()} view`}
        actions={
          <>
            <Button variant="outline" onClick={() => push({ title: "Export queued", description: "CSV export of the current view.", tone: "default" })}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" onClick={() => push({ title: "Manual fan creation", description: "Available once the CRM repository is connected.", tone: "default" })}>
              <Plus className="size-3.5" /> Add fan
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search fans, handles or sources…"
            className="lg:w-80"
          />
          <FilterChips
            options={SEGMENTS}
            value={segment as (typeof SEGMENTS)[number]}
            onChange={(v) => {
              setSegment(v);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2 lg:ml-auto">
            <Select
              ariaLabel="Sort by"
              value={SORT_LABELS[sort]}
              onChange={(v) => setSort(SORT_KEYS[v as keyof typeof SORT_KEYS] as SortKey)}
              options={Object.keys(SORT_KEYS) as (keyof typeof SORT_KEYS)[]}
              className="w-40"
            />
            <Button variant="outline" size="md" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}>
              <ArrowUpDown className="size-3.5" /> {dir === "asc" ? "Asc" : "Desc"}
            </Button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="anim-fade flex flex-wrap items-center gap-2 border-b border-line bg-accent/[0.06] px-4 py-2.5">
            <span className="num text-[12px] text-ink">{selected.size} selected</span>
            <span className="text-[12px] text-faint">·</span>
            <span className="num text-[12px] text-muted">
              LTV {currency([...selected].reduce((s, id) => s + (data?.find((f) => f.id === id)?.ltv ?? 0), 0))}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="subtle" onClick={() => push({ title: "Tag applied", description: `${selected.size} fans tagged “priority”.`, tone: "success" })}>
                Tag
              </Button>
              <Button size="sm" variant="subtle" onClick={() => push({ title: "Draft queued", description: "AI will draft a message per selected fan.", tone: "success" })}>
                Draft message
              </Button>
              <Button size="sm" variant="subtle" onClick={() => push({ title: "Offer assigned", description: "Welcome bundle assigned to selection.", tone: "success" })}>
                Assign offer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonRows rows={8} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <DataTable
                rows={current}
                rowKey={(f) => f.id}
                onRowClick={(f) => navigate(`/fans/${f.id}`)}
                selected={selected}
                onToggleSelect={toggle}
                onToggleAll={toggleAll}
                empty={<EmptyState icon={<Users className="size-4" />} title="No fans match this filter" description="Try a different segment or clear the search." />}
                columns={[
                  {
                    key: "fan",
                    header: "Fan",
                    cell: (f) => (
                      <div className="flex items-center gap-3">
                        <Avatar name={f.name} tone={f.avatarTone} size={30} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">{f.name}</div>
                          <div className="text-[11.5px] text-faint">{f.handle}</div>
                        </div>
                      </div>
                    ),
                  },
                  { key: "source", header: "Source", cell: (f) => <Badge>{f.source}</Badge> },
                  {
                    key: "relationship",
                    header: "Relationship",
                    cell: (f) => (
                      <Badge tone={f.relationship === "Inner circle" ? "accent" : f.relationship === "Fan" ? "info" : "neutral"}>
                        {f.relationship}
                      </Badge>
                    ),
                  },
                  {
                    key: "ltv",
                    header: "LTV",
                    align: "right",
                    cell: (f) => <span className="num font-medium text-ink">{currency(f.ltv, { cents: f.ltv % 1 !== 0 })}</span>,
                  },
                  { key: "last", header: "Last activity", cell: (f) => <span className="num text-muted">{ago(f.lastActivity)}</span> },
                  { key: "status", header: "Status", cell: (f) => <StatusBadge status={f.status} /> },
                ]}
              />
            </div>

            {/* Mobile cards */}
            <MobileCardList
              rows={current}
              rowKey={(f) => f.id}
              render={(f) => (
                <button onClick={() => navigate(`/fans/${f.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-3">
                    <Avatar name={f.name} tone={f.avatarTone} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{f.name}</div>
                      <div className="text-[11.5px] text-faint">{f.handle}</div>
                    </div>
                    <span className="num text-[13px] font-medium text-ink">{currency(f.ltv)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge>{f.source}</Badge>
                    <Badge tone={f.relationship === "Inner circle" ? "accent" : "neutral"}>{f.relationship}</Badge>
                    <StatusBadge status={f.status} />
                    <span className="num ml-auto text-[11.5px] text-faint">{ago(f.lastActivity)}</span>
                  </div>
                </button>
              )}
            />

            <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} total={rows.length} />
          </>
        )}
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          { label: "At risk", value: "2 fans", tone: "text-neg", note: "Ben Adler · Andre Silva" },
          { label: "Inner circle", value: "27 fans", tone: "text-accent-hi", note: "$1,323 MRR" },
          { label: "Avg. LTV", value: "$74", tone: "text-ink", note: "+4.3% vs last period" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="label">{s.label}</div>
            <div className={cn("num mt-2 text-[17px] font-medium", s.tone)}>{s.value}</div>
            <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
              {s.note}
              <Delta value={4.3} />
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
