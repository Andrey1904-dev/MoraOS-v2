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
  Trash2,
  UserPlus,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, StatusBadge, ProgressBar, Divider, KeyStat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, SkeletonRows, useToast } from "@/components/ui/Feedback";
import { AINote } from "@/components/common/AICard";
import { Modal } from "@/components/ui/Overlays";
import { Field, inputClass, textareaClass } from "@/components/ui/Controls";
import { useResource } from "@/hooks/useResource";
import { repositories, story } from "@/repositories";
import { media } from "@/data/media";
import { currency, number as fmtNum, pluralRu, shortDate } from "@/lib/format";
import { cn } from "@/utils/cn";

const statusColor: Record<string, string> = {
  Published: "border-pos/40",
  Scheduled: "border-info/40",
  "In production": "border-warn/40",
  Outline: "border-line",
};

export default function Episodes() {
  const { push } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading } = useResource(() => repositories.content.episodes(), [refreshKey]);
  const { data: content } = useResource(() => repositories.content.list(), [refreshKey]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLogline, setNewLogline] = useState("");
  const [saving, setSaving] = useState(false);

  const published = (data ?? []).filter((e) => e.status === "Published");
  const totalViews = published.reduce((s, e) => s + e.performance.views, 0);
  const totalFollowers = published.reduce((s, e) => s + e.performance.followers, 0);

  const contentById = new Map((content ?? []).map((c) => [c.id, c]));

  async function createEpisode() {
    if (!newTitle.trim()) {
      push({ title: "Нужно название", description: "Дайте эпизоду название.", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const nextNumber = Math.max(0, ...(data ?? []).map((e) => e.number)) + 1;
      await repositories.content.createEpisode({
        title: newTitle.trim(),
        number: nextNumber,
        logline: newLogline.trim(),
        description: newLogline.trim(),
      });
      push({ title: "Эпизод создан", description: newTitle.trim(), tone: "success" });
      setModal(false);
      setNewTitle("");
      setNewLogline("");
      setRefreshKey((k) => k + 1);
    } catch (error) {
      push({ title: "Не удалось создать", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteEpisode(id: string, title: string) {
    if (!confirm(`Удалить эпизод «${title}»? Контент будет откреплён.`)) return;
    try {
      await repositories.content.deleteEpisode(id);
      push({ title: "Эпизод удалён", description: title, tone: "success" });
      setRefreshKey((k) => k + 1);
    } catch (error) {
      push({ title: "Не удалось удалить", description: error instanceof Error ? error.message : "Попробуйте ещё раз.", tone: "error" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Контент · Сюжет"
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
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus className="size-3.5" /> Новый эпизод
          </Button>
        }
      />

      <Grid className="lg:grid-cols-4">
        {[
          { label: "Опубликовано эпизодов", value: published.length },
          { label: "Просмотры сюжета", value: fmtNum(totalViews, true) },
          { label: "Прирост подписчиков", value: `+${fmtNum(totalFollowers, true)}` },
          { label: "Среднее удержание", value: "N/A" },
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
            <CardHeader title={story.season} subtitle="Вертикальный сюжет — каждый эпизод двигает арку дальше" />
            <div className="px-5 pb-6">
              {loading && <SkeletonRows rows={5} />}
              {!loading && (!data || data.length === 0) && (
                <EmptyState title="Эпизодов пока нет" description="Создайте первый эпизод, чтобы начать сюжет." />
              )}
              <div className="relative pl-7">
                <span className="absolute top-1 bottom-1 left-[7px] w-px bg-line" />
                {(data ?? []).map((ep) => {
                  const open = expanded === ep.id;
                  const relatedContent = ep.contentIds.map((id) => contentById.get(id)).filter(Boolean);
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
                          <span className="num text-[11px] text-faint">Эпизод {String(ep.number).padStart(2, "0")}</span>
                          <span className="text-[14px] font-medium text-ink">{ep.title}</span>
                          <StatusBadge status={ep.status} className="ml-auto" />
                          <ChevronDown className={cn("size-4 text-faint transition-transform", open && "rotate-180")} />
                        </div>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{ep.logline}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-faint">
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-3" />
                            {ep.status === "Published" ? shortDate(ep.publishedAt) : ep.publishedAt ? `план ${shortDate(ep.publishedAt)}` : "не запланировано"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Images className="size-3" /> {relatedContent.length} мат.
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
                          <p className="text-[12.5px] leading-relaxed text-ink-2">{ep.description || ep.logline}</p>

                          <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <KeyStat label="Бит" value={ep.beat || "—"} />
                            <KeyStat label="Удержание" value={ep.performance.retention ? `${ep.performance.retention}%` : "—"} />
                            <KeyStat
                              label="Выручка"
                              value={ep.performance.views ? currency(Math.round(ep.performance.followers * 2), { compact: true }) : "—"}
                            />
                          </div>

                          <Divider className="my-4" />

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <div className="label mb-2.5">Связанный контент</div>
                              <div className="space-y-2">
                                {relatedContent.map((c) => c && (
                                  <Link
                                    key={c.id}
                                    to={`/content?open=${c.id}`}
                                    className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
                                  >
                                    <Images className="size-3.5 text-faint" />
                                    <span className="truncate">{c.title}</span>
                                  </Link>
                                ))}
                                {relatedContent.length === 0 && <div className="text-[11.5px] text-faint">Контент ещё не прикреплён.</div>}
                              </div>
                            </div>
                            <div>
                              <div className="label mb-2.5">Ассеты</div>
                              <div className="flex flex-wrap gap-2">
                                {ep.assetIds.length > 0 ? ep.assetIds.slice(0, 6).map((id, i) => (
                                  <Link key={id} to="/assets" className="group relative">
                                    <SafeImg
                                      src={[media.portraits[0], media.portraits[2], media.portraits[6], media.portraits[3], media.portraits[8], media.wide[9]][i % 6]}
                                      alt="ассет"
                                      loading="lazy"
                                      className="size-16 rounded-lg border border-line object-cover transition-opacity group-hover:opacity-80"
                                    />
                                  </Link>
                                )) : <div className="text-[11.5px] text-faint">Ассеты ещё не прикреплены.</div>}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link to={`/content/new`}>
                              <Button size="sm" variant="primary">
                                <Plus className="size-3.5" /> Добавить контент
                              </Button>
                            </Link>
                            <Button size="sm" variant="subtle" onClick={() => deleteEpisode(ep.id, ep.title)}>
                              <Trash2 className="size-3.5" /> Удалить
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
            <CardHeader title="Библия истории" subtitle="Правила непрерывности, которые следит Агент персонажа" />
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-lg border border-line bg-canvas-2/50 p-3">
                <div className="label">Логлайн</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{story.logline}</p>
              </div>
            </div>
          </Card>

          <AINote
            title="AI-инсайт"
            footer={
              <Link to="/ai" className="text-[11.5px] text-accent-hi hover:underline">
                Открыть AI-студию
              </Link>
            }
          >
            Эпизоды, выходящие по пятницам в 18:00, получают на 34% больше вовлечённости, чем релизы в середине недели.
          </AINote>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-faint">
              <Clapperboard className="size-3.5" />
              <span className="label">Ближайшая веха</span>
            </div>
            <div className="mt-3 text-[13px] text-ink">{(data ?? []).find((e) => e.status !== "Published")?.title ?? "Все эпизоды опубликованы"}</div>
            <p className="mt-1 text-[12px] text-muted">
              {(() => { const n = (data ?? []).filter((e) => e.status !== "Published").length; return `${n} ${pluralRu(n, ["эпизод", "эпизода", "эпизодов"])} в работе.`; })()}
            </p>
            <div className="mt-3">
              <ProgressBar value={Math.min(100, published.length * 20)} />
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => !saving && setModal(false)}
        title="Новый эпизод"
        subtitle="Создайте новый сюжетный бит."
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>Отмена</Button>
            <Button variant="primary" loading={saving} onClick={() => void createEpisode()}>
              Создать эпизод
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Название">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название эпизода" className={inputClass} />
          </Field>
          <Field label="Логлайн / краткое описание">
            <textarea value={newLogline} onChange={(e) => setNewLogline(e.target.value)} rows={3} placeholder="Описание в одну строку" className={textareaClass} />
          </Field>
        </div>
      </Modal>
    </PageContainer>
  );
}
