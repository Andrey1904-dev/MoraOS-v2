import { useState } from "react";
import { Badge, Card, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass, Select } from "@/components/ui/Controls";
import { SegmentedControl } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Feedback";
import { Sparkles, Wand2, Image as ImageIcon } from "lucide-react";
import type { ContentItem } from "@/types";
import { media } from "@/data/media";
import { currency, number as fmtNum } from "@/lib/format";

const PLATFORMS = ["TikTok", "Instagram", "Threads", "Fanvue", "Telegram"] as const;
const TYPES = ["Image", "Video", "Text", "Story"] as const;
const STATUSES = ["Idea", "Draft", "Ready", "Scheduled"] as const;
const EPISODES = ["Episode 04 · The red notebook", "Episode 05 · The reality check", "None"] as const;
const ASSETS = ["ast_01 · Mara · window light", "ast_10 · Mara · late night", "ast_03 · Mara · 6am gym"] as const;

/**
 * Content creation workflow. Right column renders a live preview so the
 * operator sees the post exactly as the audience will.
 */
export function ContentEditorPanel({
  item,
  onSaved,
  onCancel,
}: {
  item?: ContentItem | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { push } = useToast();
  const [device, setDevice] = useState<"9:16" | "4:5" | "1:1">("9:16");
  const [title, setTitle] = useState(item?.title ?? "");
  const [hook, setHook] = useState(item?.hook ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [cta, setCta] = useState(item?.cta ?? "");
  const [platform, setPlatform] = useState<string>(item?.platform ?? "TikTok");
  const [type, setType] = useState<string>(item?.type ?? "Video");
  const [status, setStatus] = useState<string>(item?.status ?? "Draft");
  const [episode, setEpisode] = useState<string>(
    item?.episodeId ? EPISODES.find((e) => e.startsWith(item.episodeId!.replace("ep", "Episode 0"))) ?? EPISODES[0] : EPISODES[0],
  );
  const [asset, setAsset] = useState<string>(ASSETS[0]);

  const thumb = item?.assetIds.length ? media.portraits[0] : media.portraits[6];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The red notebook" className={inputClass} />
          </Field>
          <Field label="Hook" className="sm:col-span-2" hint="First 3 seconds. Shown before the fold.">
            <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="I bought a notebook for $4…" className={inputClass} />
          </Field>
          <Field label="Caption" className="sm:col-span-2">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Page one: 3,240 hours…" className={textareaClass} />
          </Field>
          <Field label="CTA">
            <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Full story on Fanvue" className={inputClass} />
          </Field>
          <Field label="Status">
            <Select value={status as (typeof STATUSES)[number]} onChange={setStatus} options={STATUSES} />
          </Field>
          <Field label="Platform">
            <Select value={platform as (typeof PLATFORMS)[number]} onChange={setPlatform} options={PLATFORMS} />
          </Field>
          <Field label="Content type">
            <Select value={type as (typeof TYPES)[number]} onChange={setType} options={TYPES} />
          </Field>
          <Field label="Episode">
            <Select value={episode as (typeof EPISODES)[number]} onChange={setEpisode} options={EPISODES} />
          </Field>
          <Field label="Asset">
            <Select value={asset as (typeof ASSETS)[number]} onChange={setAsset} options={ASSETS} />
          </Field>
        </div>

        <Divider />

        <div className="rounded-lg border border-accent/25 bg-accent/[0.05] p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="size-3.5 text-accent-hi" strokeWidth={1.9} />
            <span className="text-[10.5px] font-semibold tracking-[0.1em] text-accent-hi uppercase">Content Agent</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            Generate 3 hook variants in Mara's voice, matched to the selected episode beat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setHook("Page 41 is the first page I almost didn't write.");
                push({ title: "Sample hook applied", description: "AI variant generation is not connected yet.", tone: "default" });
              }}
            >
              <Sparkles className="size-3.5" /> Generate hooks
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setCaption("Week five. The number went the wrong way, and I'm showing you anyway.");
                push({ title: "Sample caption applied", description: "AI caption generation is not connected yet.", tone: "default" });
              }}
            >
              Draft caption
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            variant="primary"
            onClick={() => {
              push({ title: "Content saved", description: `${title || "Untitled"} saved as ${status}.`, tone: "success" });
              onSaved?.();
            }}
          >
            Save
          </Button>
          <Button
            variant="subtle"
            onClick={() => {
              setStatus("Ready");
              push({ title: "Marked as ready", description: "Status set to Ready here. No agent review runs yet.", tone: "default" });
            }}
          >
            Mark ready
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <span className="num ml-auto text-[11px] text-faint">
            {item ? `Editing ${item.id}` : "New content item"}
          </span>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="label">Preview</span>
          <SegmentedControl options={["9:16", "4:5", "1:1"] as const} value={device} onChange={setDevice} />
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">M</span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-ink">mara.quinn</div>
              <div className="text-[10px] text-faint">{platform}</div>
            </div>
            <StatusBadge status={status} dot={false} className="ml-auto" />
          </div>

          {type === "Text" ? (
            <div className="flex aspect-4/5 items-center bg-canvas-2 p-5">
              <p className="text-[13px] leading-relaxed text-ink-2">{hook || "Hook appears here…"}</p>
            </div>
          ) : (
            <div className={device === "9:16" ? "aspect-9/16" : device === "4:5" ? "aspect-4/5" : "aspect-square"}>
              <div className="relative size-full bg-canvas-2">
                {type === "Story" || type === "Image" || type === "Video" ? (
                  <img src={thumb} alt="preview" className="size-full object-cover opacity-90" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-faint">
                    <ImageIcon className="size-6" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3.5">
                  <p className="text-[12px] leading-snug font-medium text-white">{hook || "Hook appears here…"}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 px-3 py-3">
            <p className="text-[12px] leading-relaxed text-ink-2">{caption || "Caption appears here…"}</p>
            {cta && <span className="text-[11.5px] font-medium text-accent-hi">{cta}</span>}
            <div className="flex items-center gap-2 pt-1">
              <Badge>{episode.split(" · ")[0]}</Badge>
              <Badge>{type}</Badge>
            </div>
          </div>
        </Card>

        {item && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-canvas-2/50 p-3">
            {[
              { label: "Views", value: fmtNum(item.views, true) },
              { label: "Engagement", value: `${item.engagement}%` },
              { label: "Revenue", value: currency(item.revenue, { compact: true }) },
            ].map((s) => (
              <div key={s.label}>
                <div className="label">{s.label}</div>
                <div className="num mt-1 text-[12.5px] text-ink">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
