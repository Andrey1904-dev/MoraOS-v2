import { useEffect, useMemo, useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { Badge, Card, StatusBadge, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass, Select } from "@/components/ui/Controls";
import { SegmentedControl } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Feedback";
import { Sparkles, Wand2, Image as ImageIcon, Trash2 } from "lucide-react";
import type { ContentItem, Platform, ContentStatus, ContentType } from "@/types";
import { repositories } from "@/repositories";
import { useResource } from "@/hooks/useResource";
import { media } from "@/data/media";
import { currency, number as fmtNum } from "@/lib/format";
import { trackEvent } from "@/lib/events";

const PLATFORMS: Platform[] = ["TikTok", "Instagram", "Threads", "Fanvue", "Telegram"];
const TYPES: ContentType[] = ["Image", "Video", "Text", "Story"];
const STATUSES: ContentStatus[] = ["Idea", "Draft", "Ready", "Scheduled", "Published"];

/**
 * Content creation workflow. Right column renders a live preview so the
 * operator sees the post exactly as the audience will.
 */
export function ContentEditorPanel({
  item,
  onSaved,
  onCancel,
  onDeleted,
}: {
  item?: ContentItem | null;
  onSaved?: (saved: ContentItem) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const { push } = useToast();
  const { data: episodes } = useResource(() => repositories.content.episodes());
  const [device, setDevice] = useState<"9:16" | "4:5" | "1:1">("9:16");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [hook, setHook] = useState(item?.hook ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [script, setScript] = useState(item?.script ?? "");
  const [cta, setCta] = useState(item?.cta ?? "");
  const [platform, setPlatform] = useState<Platform>(item?.platform ?? "TikTok");
  const [type, setType] = useState<ContentType>(item?.type ?? "Video");
  const [status, setStatus] = useState<ContentStatus>(item?.status ?? "Draft");
  const [scheduledFor, setScheduledFor] = useState<string>(
    item?.scheduledFor ? new Date(item.scheduledFor).toISOString().slice(0, 16) : "",
  );
  const [episodeId, setEpisodeId] = useState<string>(item?.episodeId ?? "none");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setHook(item?.hook ?? "");
    setCaption(item?.caption ?? "");
    setScript(item?.script ?? "");
    setCta(item?.cta ?? "");
    setPlatform(item?.platform ?? "TikTok");
    setType(item?.type ?? "Video");
    setStatus(item?.status ?? "Draft");
    setEpisodeId(item?.episodeId ?? "none");
    setScheduledFor(item?.scheduledFor ? new Date(item.scheduledFor).toISOString().slice(0, 16) : "");
  }, [item?.id]);

  const episodeOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [{ id: "none", label: "None (standalone)" }];
    for (const e of episodes ?? []) {
      opts.push({ id: e.id, label: `Episode ${String(e.number).padStart(2, "0")} · ${e.title}` });
    }
    return opts;
  }, [episodes]);

  const thumb = item?.assetIds?.length ? media.portraits[0] : media.portraits[6];

  const selectedEpisodeLabel = useMemo(() => {
    const ep = (episodes ?? []).find((e) => e.id === episodeId);
    return ep ? `EP ${String(ep.number).padStart(2, "0")}` : "—";
  }, [episodes, episodeId]);

  const canSave = title.trim().length > 0 && !saving;

  async function handleSave(publishAfter = false) {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const finalStatus: ContentStatus = publishAfter ? "Published" : status;
      const payload: Partial<ContentItem> & { title: string } = {
        id: item?.id,
        title: title.trim(),
        description: description.trim(),
        hook: hook.trim(),
        caption: caption.trim(),
        script: script.trim(),
        cta: cta.trim(),
        platform,
        type,
        status: finalStatus,
        episodeId: episodeId === "none" ? undefined : episodeId,
        assetIds: item?.assetIds ?? [],
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      };
      if (publishAfter) payload.publishedAt = new Date().toISOString();
      const saved = await repositories.content.saveDraft(payload);
      if (!item?.id) {
        void trackEvent({ type: "content_created", entityType: "content", entityId: saved.id, platform: platform.toLowerCase() });
      }
      if (publishAfter) {
        void trackEvent({ type: "content_published", entityType: "content", entityId: saved.id });
      }
      push({
        title: publishAfter ? "Content published" : "Content saved",
        description: `${saved.title} · ${saved.status}`,
        tone: "success",
      });
      onSaved?.(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setError(msg);
      push({ title: "Save failed", description: msg, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item?.id) return;
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await repositories.content.delete(item.id);
      push({ title: "Content deleted", description: item.title, tone: "success" });
      onDeleted?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed.";
      setError(msg);
      push({ title: "Delete failed", description: msg, tone: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-neg/45 bg-neg/10 p-3 text-[12.5px] text-neg">{error}</div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The red notebook" className={inputClass} />
          </Field>
          <Field label="Description" className="sm:col-span-2" hint="Internal notes / synopsis (not shown to audience).">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short synopsis for internal reference…" className={textareaClass} />
          </Field>
          <Field label="Hook" className="sm:col-span-2" hint="First 3 seconds. Shown before the fold.">
            <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="I bought a notebook for $4…" className={inputClass} />
          </Field>
          <Field label="Caption" className="sm:col-span-2">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Page one: 3,240 hours…" className={textareaClass} />
          </Field>
          <Field label="Script" className="sm:col-span-2" hint="Voiceover / spoken text for video content.">
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} placeholder="Open on notebook close-up. Slow pan to the window. VO reads page one…" className={textareaClass} />
          </Field>
          <Field label="CTA">
            <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Full story on Fanvue" className={inputClass} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(v) => setStatus(v as ContentStatus)} options={STATUSES} />
          </Field>
          <Field label="Platform">
            <Select value={platform} onChange={(v) => setPlatform(v as Platform)} options={PLATFORMS} />
          </Field>
          <Field label="Content type">
            <Select value={type} onChange={(v) => setType(v as ContentType)} options={TYPES} />
          </Field>
          <Field label="Episode">
            <select
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
              className={inputClass}
            >
              {episodeOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Scheduled for">
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Divider />

        <div className="rounded-lg border border-accent/25 bg-accent/[0.05] p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="size-3.5 text-accent-hi" strokeWidth={1.9} />
            <span className="text-[10.5px] font-semibold tracking-[0.1em] text-accent-hi uppercase">Content Agent</span>
            <span className="ml-auto text-[10px] text-faint">MOCK</span>
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
                push({ title: "Sample hook applied", description: "Mock Content Agent — no real API call.", tone: "default" });
              }}
            >
              <Sparkles className="size-3.5" /> Generate hooks
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setCaption("Week five. The number went the wrong way, and I'm showing you anyway.");
                push({ title: "Sample caption applied", description: "Mock Content Agent — no real API call.", tone: "default" });
              }}
            >
              Draft caption
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            variant="primary"
            loading={saving}
            disabled={!canSave}
            onClick={() => void handleSave(false)}
          >
            Save
          </Button>
          <Button
            variant="subtle"
            loading={saving}
            disabled={!canSave}
            onClick={() => void handleSave(true)}
          >
            Save &amp; publish
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          {item?.id && (
            <Button
              variant="ghost"
              onClick={() => void handleDelete()}
              loading={deleting}
              disabled={saving}
              className="text-neg hover:bg-neg/10"
            >
              <Trash2 className="size-3.5" /> Delete
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
                  <SafeImg src={thumb} alt="Content preview" className="size-full object-cover opacity-90" loading="lazy" />
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
              <Badge>{selectedEpisodeLabel}</Badge>
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
