import { useMemo, useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { Check, ImagePlus, Info, X } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/Page";
import { Card, Badge, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterChips, SearchInput, Select } from "@/components/ui/Controls";
import { Drawer } from "@/components/ui/Overlays";
import { EmptyState, SkeletonCards, useToast } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { number as fmtNum, shortDate } from "@/lib/format";
import type { Asset } from "@/types";
import { cn } from "@/utils/cn";

const KINDS = ["All", "Photos", "Videos", "References", "Outfits", "Locations", "Expressions"] as const;

export default function Assets() {
  const { push } = useToast();
  const { data, loading } = useResource(() => repositories.content.assets());
  const [kind, setKind] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState<"Any" | "90+" | "80+">("Any");
  const [active, setActive] = useState<Asset | null>(null);

  const rows = useMemo(() => {
    let list = [...(data ?? [])];
    if (kind !== "All") list = list.filter((a) => a.kind === kind);
    if (quality === "90+") list = list.filter((a) => a.quality >= 90);
    if (quality === "80+") list = list.filter((a) => a.quality >= 80);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.outfit.toLowerCase().includes(q) ||
          a.location.toLowerCase().includes(q) ||
          a.prompt.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, kind, quality, search]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Content · Library"
        title="Assets"
        description="Visual library of everything Mara can appear in — generations, references, outfits, locations and expressions."
        actions={
          <Button variant="primary" disabled title="Not available yet">
            <ImagePlus className="size-3.5" /> Generate assets
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 xl:flex-row xl:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by outfit, location or prompt…" className="xl:w-72" />
          <FilterChips options={KINDS} value={kind as (typeof KINDS)[number]} onChange={setKind} />
          <div className="flex items-center gap-2 xl:ml-auto">
            <Select
              ariaLabel="Quality filter"
              value={quality}
              onChange={(v) => setQuality(v as "Any" | "90+" | "80+")}
              options={["Any", "90+", "80+"] as const}
              className="w-28"
            />
            <span className="num text-[11.5px] text-faint">{rows.length} assets</span>
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <SkeletonCards count={8} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 xl:grid-cols-4">
            {rows.map((a) => (
              <button
                key={a.id}
                onClick={() => setActive(a)}
                className="group overflow-hidden rounded-xl border border-line bg-canvas-2 text-left transition-colors hover:border-line-2"
              >
                <div className="relative aspect-4/5 overflow-hidden bg-surface-3">
                  <SafeImg
                    src={a.thumb}
                    alt={a.title}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent p-2.5">
                    <span className="num text-[10.5px] text-white/90">Q{a.quality}</span>
                    <span className="ml-auto rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">{a.model}</span>
                  </div>
                  <div className="absolute top-2.5 left-2.5">
                    <Badge className="backdrop-blur-sm">{a.kind}</Badge>
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <StatusBadge status={a.approval} className="backdrop-blur-sm" />
                  </div>
                </div>
                <div className="p-3">
                  <div className="truncate text-[12.5px] font-medium text-ink">{a.outfit !== "—" ? a.outfit : a.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">{a.location}</div>
                  <div className="mt-2 flex items-center gap-2 text-[10.5px] text-faint">
                    <span className="num">{a.lighting}</span>
                    <span className="ml-auto num">{a.usedIn} used</span>
                  </div>
                </div>
              </button>
            ))}
            {rows.length === 0 && (
              <div className="col-span-full">
                <EmptyState icon={<Info className="size-4" />} title="No assets match" description="Adjust the filters or generate new assets." />
              </div>
            )}
          </div>
        )}
      </Card>

      <Drawer open={!!active} onClose={() => setActive(null)} title={active?.title} width="max-w-lg">
        {active && (
          <div className="space-y-5">
            <SafeImg src={active.thumb} alt={active.title} className="w-full rounded-xl border border-line object-cover" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{active.kind}</Badge>
              <StatusBadge status={active.approval} />
              <Badge tone={active.quality >= 90 ? "pos" : "warn"}>Quality {active.quality}</Badge>
              <Badge>Model: {active.model}</Badge>
            </div>

            <div>
              <div className="label mb-2">Prompt</div>
              <div className="rounded-lg border border-line bg-canvas-2/60 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
                {active.prompt}
              </div>
            </div>

            <Divider />

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Model", value: active.model },
                { label: "Outfit", value: active.outfit },
                { label: "Location", value: active.location },
                { label: "Lighting", value: active.lighting },
                { label: "Quality score", value: String(active.quality) },
                { label: "Created", value: shortDate(active.createdAt) },
              ].map((r) => (
                <div key={r.label}>
                  <div className="label">{r.label}</div>
                  <div className="mt-1 text-[12.5px] text-ink">{r.value}</div>
                </div>
              ))}
            </div>

            <Divider />

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">Used in {active.usedIn} content items</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => {
                    setActive({ ...active, approval: "Rejected" });
                    push({ title: "Asset rejected here", description: "Matching to content is not connected yet, so the library is unchanged.", tone: "warn" });
                  }}
                >
                  <X className="size-3.5" /> Reject
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setActive({ ...active, approval: "Approved" });
                    push({ title: "Asset approved here", description: "Matching to content is not connected yet, so the library is unchanged.", tone: "success" });
                  }}
                >
                  <Check className="size-3.5" /> Approve
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total assets", value: fmtNum((data ?? []).length) },
          { label: "Approved", value: (data ?? []).filter((a) => a.approval === "Approved").length },
          { label: "Pending review", value: (data ?? []).filter((a) => a.approval === "Pending").length },
          { label: "Avg. quality", value: Math.round((data ?? []).reduce((s, a) => s + a.quality, 0) / Math.max(1, (data ?? []).length)) },
        ].map((s) => (
          <Card key={s.label} className={cn("p-4")}>
            <div className="label">{s.label}</div>
            <div className="num mt-2 text-[18px] font-medium text-ink">{s.value}</div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
