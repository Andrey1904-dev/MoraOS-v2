import { useState, useCallback } from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Factory,
  FileText,
  Loader2,
  PenLine,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Wand2,
  XCircle,
  Zap,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Divider, ProgressBar } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Controls";
import { EmptyState, useToast } from "@/components/ui/Feedback";
import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { trackEvent } from "@/lib/events";
import {
  ContentFactoryPipeline,
  DEFAULT_BRIEF,
  buildCharacterContext,
  MARA_BIBLE,
} from "@/lib/ai/content-factory";
import type {
  ContentBrief,
  ContentFormat,
  ContentPlatform,
  ContentIdea,
  HookVariant,
  PipelineState,
} from "@/lib/ai/content-factory";
import { MockAIProvider } from "@/lib/ai/mock";
import type { AIProvider } from "@/lib/ai/provider";
import type { AiRunLogger } from "@/lib/ai/types";
import type { Platform, ContentType } from "@/types";
import { cn } from "@/utils/cn";

const FORMATS: ContentFormat[] = [
  "Short Video", "Reel", "TikTok", "Threads Post",
  "Photo Caption", "Story", "Episode Teaser", "Multi-Post Series",
];

const PLATFORMS: ContentPlatform[] = ["TikTok", "Instagram", "Threads"];

const MOODS = ["Confident", "Vulnerable", "Playful", "Reflective", "Bold", "Intimate"];

/* ------------------------------------------------------------------ */
/* Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ContentFactory() {
  const { push } = useToast();
  const { data: character } = useResource(() => repositories.character.get());
  const { data: content } = useResource(() => repositories.content.list());
  const { data: episodes } = useResource(() => repositories.content.episodes());

  const [brief, setBrief] = useState<ContentBrief>({ ...DEFAULT_BRIEF, topic: "" });
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("brief");

  const characterContext = character
    ? buildCharacterContext(character)
    : buildCharacterContext({
        id: "char_default",
        name: MARA_BIBLE.name,
        age: MARA_BIBLE.age,
        city: MARA_BIBLE.city,
        occupation: MARA_BIBLE.occupation,
        voice: MARA_BIBLE.voice,
        story: MARA_BIBLE.story,
        logline: MARA_BIBLE.logline,
        boundaries: MARA_BIBLE.boundaries,
        traits: [
          { label: "Personality", value: MARA_BIBLE.personality.join(", ") },
          { label: "Signature object", value: MARA_BIBLE.recurringObjects.join(", ") },
        ],
      });

  const recentTitles = (content ?? []).slice(0, 10).map((c) => c.title);

  const getProvider = useCallback((): AIProvider => {
    // In demo mode, use MockAIProvider. In cloud mode, also use mock for now
    // (until Edge Function integration is fully configured with credentials).
    return new MockAIProvider(200);
  }, []);

  const getLogger = useCallback((): AiRunLogger => ({
    async log(entry: Parameters<AiRunLogger["log"]>[0]) {
      try {
        await repositories.ai.logRun(entry);
      } catch {
        // Logging is best-effort
      }
    },
  }), []);

  const createPipeline = () => {
    const provider = getProvider();
    const pf = new ContentFactoryPipeline(provider, getLogger());
    const state = pf.createPipelineState(brief);
    setPipeline(state);
    setCurrentStep("ideas");
    void trackEvent({
      type: "content_brief_created",
      entityType: "content",
      payload: { topic: brief.topic, platform: brief.platform, format: brief.format },
    });
  };

  const generateIdeas = async () => {
    if (running) return;
    setRunning(true);
    try {
      const provider = getProvider();
      const pf = new ContentFactoryPipeline(provider, getLogger());
      const state = pipeline ?? pf.createPipelineState(brief);
      const result = await pf.generateIdeas(state, characterContext, recentTitles);
      setPipeline(result);
      setCurrentStep("hooks");
      void trackEvent({ type: "content_idea_generated", entityType: "content", payload: { count: result.ideas?.ideas.length ?? 0 } });
    } catch (error) {
      push({ title: "Generation failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setRunning(false);
    }
  };

  const selectIdea = async (idea: ContentIdea) => {
    if (!pipeline || running) return;
    setRunning(true);
    try {
      const provider = getProvider();
      const pf = new ContentFactoryPipeline(provider, getLogger());
      const updated = { ...pipeline, selectedIdeaId: idea.id };
      setPipeline(updated);
      const result = await pf.generateHooks(updated, idea, characterContext);
      setPipeline(result);
      setCurrentStep("script");
    } catch (error) {
      push({ title: "Hook generation failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setRunning(false);
    }
  };

  const selectHook = async (hook: HookVariant) => {
    if (!pipeline || running) return;
    setRunning(true);
    try {
      const provider = getProvider();
      const pf = new ContentFactoryPipeline(provider, getLogger());
      const idea = pipeline.ideas?.ideas.find((i) => i.id === pipeline.selectedIdeaId) ?? pipeline.ideas?.ideas[0];
      if (!idea) throw new Error("No idea selected");
      let result = await pf.generateScript(pipeline, idea, hook, characterContext);
      setPipeline(result);
      void trackEvent({ type: "content_script_generated", entityType: "content" });
      setCurrentStep("platform");
      // Auto-generate platform variants and captions
      result = await pf.generatePlatformVariants(result, characterContext);
      setPipeline(result);
      void trackEvent({ type: "content_variant_generated", entityType: "content" });
      result = await pf.generateCaptions(result, characterContext);
      setPipeline(result);
      setCurrentStep("checks");
      // Run checks
      result = await pf.runCharacterCheck(result, characterContext);
      setPipeline(result);
      result = await pf.runQualityCheck(result, characterContext);
      setPipeline(result);
      void trackEvent({ type: "content_quality_checked", entityType: "content", payload: { passed: result.qualityCheck?.passed ?? false } });
      setCurrentStep("review");
    } catch (error) {
      push({ title: "Generation failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setRunning(false);
    }
  };

  const saveDraft = async () => {
    if (!pipeline) return;
    try {
      const provider = getProvider();
      const pf = new ContentFactoryPipeline(provider, getLogger());
      const draft = pf.buildDraft(pipeline);
      const saved = await repositories.content.saveDraft({
        ...draft,
        platform: draft.platform as Platform,
        type: draft.type as ContentType,
      });
      push({ title: "Draft saved", description: `"${saved.title}" is now in your Content library.`, tone: "success" });
      void trackEvent({ type: "content_approved", entityType: "content", entityId: saved.id });
      setPipeline(null);
      setBrief({ ...DEFAULT_BRIEF, topic: "" });
      setCurrentStep("brief");
    } catch (error) {
      push({ title: "Save failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    }
  };

  const regenerateStep = async (step: string) => {
    if (!pipeline || running) return;
    setRunning(true);
    try {
      const provider = getProvider();
      const pf = new ContentFactoryPipeline(provider, getLogger());
      let result = pipeline;
      if (step === "ideas") {
        result = await pf.generateIdeas(pipeline, characterContext, recentTitles);
      } else if (step === "checks") {
        result = await pf.runCharacterCheck(pipeline, characterContext);
        result = await pf.runQualityCheck(result, characterContext);
      }
      setPipeline(result);
      void trackEvent({ type: "content_regenerated", entityType: "content", payload: { step } });
    } catch (error) {
      push({ title: "Regeneration failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setRunning(false);
    }
  };

  const pipelineProgress = pipeline ? getPipelineProgress(pipeline) : 0;
  const isProviderMock = getProvider().isMock;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Content"
        title="Content Factory"
        description="AI content pipeline: from topic to approved draft. Every step is logged, every result is editable."
        meta={
          <>
            <span className={cn("flex items-center gap-1.5 text-[12px]", isProviderMock ? "text-warn" : "text-pos")}>
              <span className={cn("size-1.5 rounded-full", isProviderMock ? "bg-warn" : "bg-pos")} />
              {isProviderMock ? "Mock provider" : "AI provider active"}
            </span>
            <span className="num text-[12px] text-muted">{MARA_BIBLE.name} · character context loaded</span>
          </>
        }
      />

      <Grid className="lg:grid-cols-3">
        {/* Left: Brief + Pipeline Steps */}
        <div className="lg:col-span-1 space-y-4">
          {/* Brief Builder */}
          <Card className="p-5">
            <CardHeader title="Brief" subtitle="Define what you want to create" />
            <div className="space-y-3">
              <Field label="Topic *">
                <input
                  className={inputClass}
                  placeholder="e.g. Mara talks about why she decided to change her life in a year"
                  value={brief.topic}
                  onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
                  maxLength={200}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform">
                  <select
                    className={inputClass}
                    value={brief.platform}
                    onChange={(e) => setBrief({ ...brief, platform: e.target.value as ContentPlatform })}
                  >
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Format">
                  <select
                    className={inputClass}
                    value={brief.format}
                    onChange={(e) => setBrief({ ...brief, format: e.target.value as ContentFormat })}
                  >
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Goal">
                <input
                  className={inputClass}
                  placeholder="e.g. Drive engagement, build storyline"
                  value={brief.goal ?? ""}
                  onChange={(e) => setBrief({ ...brief, goal: e.target.value })}
                />
              </Field>

              <Field label="Mood">
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[11.5px] transition-colors",
                        brief.mood === m
                          ? "border-accent bg-accent/10 text-accent-hi"
                          : "border-line bg-canvas-2 text-muted hover:border-line-2",
                      )}
                      onClick={() => setBrief({ ...brief, mood: m })}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Episode link (optional)">
                <select
                  className={inputClass}
                  value={brief.episodeId ?? ""}
                  onChange={(e) => setBrief({ ...brief, episodeId: e.target.value || undefined })}
                >
                  <option value="">— Standalone —</option>
                  {(episodes ?? []).map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      EP {String(ep.number).padStart(2, "0")} · {ep.title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Constraints (optional)">
                <input
                  className={inputClass}
                  placeholder="e.g. No numbers, keep under 30s"
                  value={(brief.constraints ?? []).join(", ")}
                  onChange={(e) => setBrief({ ...brief, constraints: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              </Field>

              <Button
                variant="primary"
                className="w-full"
                disabled={!brief.topic.trim() || running}
                onClick={pipeline ? () => { setPipeline(null); createPipeline(); } : createPipeline}
              >
                <Wand2 className="size-3.5" />
                {pipeline ? "Reset & Start New" : "Start Pipeline"}
              </Button>
            </div>
          </Card>

          {/* Pipeline Progress */}
          {pipeline && (
            <Card className="p-5">
              <CardHeader title="Pipeline" subtitle="Step-by-step progress" />
              <ProgressBar value={pipelineProgress} tone={pipeline.status === "failed" ? "warn" : "accent"} height={4} className="mb-4" />
              <div className="space-y-1.5">
                {PIPELINE_STEPS.map((step) => {
                  const isActive = currentStep === step.key;
                  const isDone = isStepDone(pipeline, step.key);
                  const isFailed = pipeline.status === "failed" && pipeline.currentStep === step.key;
                  return (
                    <button
                      key={step.key}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors",
                        isActive ? "bg-accent/10 text-accent-hi" :
                        isFailed ? "bg-warn/10 text-warn" :
                        isDone ? "text-pos" : "text-muted",
                      )}
                      onClick={() => step.key === "ideas" && pipeline.ideas && setCurrentStep("ideas")}
                    >
                      {isFailed ? <XCircle className="size-3.5 text-warn" /> :
                       isDone ? <CheckCircle2 className="size-3.5 text-pos" /> :
                       isActive ? <Loader2 className="size-3.5 animate-spin" /> :
                       <span className="size-3.5 rounded-full border border-line" />}
                      <span>{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-4">
          {!pipeline && (
            <Card className="p-8">
              <EmptyState
                icon={<Factory className="size-5" />}
                title="Content Factory is ready"
                description="Write a topic in the Brief panel and start the pipeline. AI will generate ideas, hooks, scripts, platform variants, and run quality checks — all in one flow."
              />
            </Card>
          )}

          {/* Ideas */}
          {pipeline && currentStep === "ideas" && (
            <IdeasStep
              pipeline={pipeline}
              running={running}
              onGenerate={generateIdeas}
              onSelect={selectIdea}
              onRegenerate={() => regenerateStep("ideas")}
            />
          )}

          {/* Hooks */}
          {pipeline && currentStep === "hooks" && pipeline.hooks && (
            <HooksStep hooks={pipeline.hooks.hooks} running={running} onSelect={selectHook} />
          )}

          {/* Script + Platform + Captions */}
          {pipeline && (currentStep === "script" || currentStep === "platform" || currentStep === "checks" || currentStep === "review") && pipeline.script && (
            <ScriptStep
              pipeline={pipeline}
              running={running}
              onSave={saveDraft}
              onRegenerate={() => regenerateStep("checks")}
            />
          )}

          {/* Loading overlay */}
          {running && (
            <Card className="flex items-center gap-3 p-4">
              <Loader2 className="size-4 animate-spin text-accent-hi" />
              <div>
                <div className="text-[13px] text-ink">AI is working…</div>
                <div className="text-[11.5px] text-muted">
                  {isProviderMock ? "Mock provider — results are illustrative" : "Calling AI provider"}
                </div>
              </div>
            </Card>
          )}
        </div>
      </Grid>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline Steps Configuration                                       */
/* ------------------------------------------------------------------ */

const PIPELINE_STEPS = [
  { key: "brief", label: "Brief" },
  { key: "ideas", label: "Ideas" },
  { key: "hooks", label: "Hooks" },
  { key: "script", label: "Script" },
  { key: "platform", label: "Platform Variants" },
  { key: "captions", label: "Captions" },
  { key: "checks", label: "Character & Quality Check" },
  { key: "review", label: "Review & Save" },
];

function isStepDone(pipeline: PipelineState, step: string): boolean {
  const stepOrder = PIPELINE_STEPS.map((s) => s.key);
  const currentIdx = stepOrder.indexOf(pipeline.currentStep);
  const targetIdx = stepOrder.indexOf(step);
  if (targetIdx < 0 || currentIdx < 0) return false;

  switch (step) {
    case "ideas": return !!pipeline.ideas;
    case "hooks": return !!pipeline.hooks;
    case "script": return !!pipeline.script;
    case "platform": return !!pipeline.platformVariants;
    case "captions": return !!pipeline.captions;
    case "checks": return !!pipeline.characterCheck && !!pipeline.qualityCheck;
    default: return targetIdx < currentIdx;
  }
}

function getPipelineProgress(pipeline: PipelineState): number {
  const done = PIPELINE_STEPS.filter((s) => isStepDone(pipeline, s.key)).length;
  return Math.round((done / PIPELINE_STEPS.length) * 100);
}

/* ------------------------------------------------------------------ */
/* Ideas Step                                                         */
/* ------------------------------------------------------------------ */

function IdeasStep({ pipeline, running, onGenerate, onSelect, onRegenerate }: {
  pipeline: PipelineState;
  running: boolean;
  onGenerate: () => void;
  onSelect: (idea: ContentIdea) => void;
  onRegenerate: () => void;
}) {
  if (!pipeline.ideas) {
    return (
      <Card className="p-5">
        <CardHeader title="Step 1: Generate Ideas" subtitle="AI will suggest 5 content ideas with different angles" />
        <Button variant="primary" disabled={running} onClick={onGenerate}>
          <Sparkles className="size-3.5" /> Generate Ideas
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <CardHeader title="Step 1: Ideas" subtitle={`5 ideas generated · ${pipeline.ideas.reasoning ? pipeline.ideas.reasoning.slice(0, 80) + "…" : ""}`} />
        <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={running}>
          <RefreshCw className="size-3.5" /> Regenerate
        </Button>
      </div>
      <div className="space-y-2.5">
        {pipeline.ideas.ideas.map((idea) => (
          <button
            key={idea.id}
            className="group w-full rounded-lg border border-line bg-canvas-2 p-4 text-left transition-all hover:border-accent/40 hover:bg-accent/[0.04]"
            onClick={() => onSelect(idea)}
            disabled={running}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-ink">{idea.title}</div>
                <div className="mt-1 text-[12px] text-muted">{idea.angle}</div>
                <div className="mt-1.5 text-[11.5px] text-faint">{idea.purpose}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {idea.experimental && <Badge tone="accent">experimental</Badge>}
                <ArrowRight className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks Step                                                         */
/* ------------------------------------------------------------------ */

function HooksStep({ hooks, running, onSelect }: {
  hooks: HookVariant[];
  running: boolean;
  onSelect: (hook: HookVariant) => void;
}) {
  return (
    <Card className="p-5">
      <CardHeader title="Step 2: Select a Hook" subtitle="Choose the opening that resonates most" />
      <div className="space-y-2.5">
        {hooks.map((hook) => (
          <button
            key={hook.id}
            className="group w-full rounded-lg border border-line bg-canvas-2 p-4 text-left transition-all hover:border-accent/40 hover:bg-accent/[0.04]"
            onClick={() => onSelect(hook)}
            disabled={running}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-relaxed text-ink">&ldquo;{hook.text}&rdquo;</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>{hook.type}</Badge>
                  <Badge tone={hook.audienceInterest === "high" ? "pos" : hook.audienceInterest === "low" ? "warn" : "neutral"}>
                    interest: {hook.audienceInterest}
                  </Badge>
                  <Badge tone={hook.clicheRisk === "high" ? "warn" : "neutral"}>
                    cliché risk: {hook.clicheRisk}
                  </Badge>
                </div>
                {hook.recommendation && (
                  <p className="mt-1.5 text-[11.5px] text-faint">{hook.recommendation}</p>
                )}
              </div>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Script Step                                                        */
/* ------------------------------------------------------------------ */

function ScriptStep({ pipeline, running, onSave, onRegenerate }: {
  pipeline: PipelineState;
  running: boolean;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"script" | "platform" | "captions" | "checks">("script");

  const canSave = pipeline.characterCheck?.passed !== false && pipeline.qualityCheck?.passed !== false;

  return (
    <Card className="p-5">
      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-line pb-2">
        {[
          { key: "script", label: "Script", icon: FileText },
          { key: "platform", label: "Platforms", icon: Target },
          { key: "captions", label: "Captions", icon: PenLine },
          { key: "checks", label: "Checks", icon: Zap },
        ].map((tab) => (
          <button
            key={tab.key}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors",
              activeTab === tab.key ? "bg-accent/10 text-accent-hi" : "text-muted hover:text-ink",
            )}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <tab.icon className="size-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Script Tab */}
      {activeTab === "script" && pipeline.script && (
        <div className="space-y-3">
          <div>
            <div className="label mb-1">Hook</div>
            <p className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3 text-[13px] leading-relaxed text-ink">
              {pipeline.script.hook}
            </p>
          </div>
          <div>
            <div className="label mb-1">Setup</div>
            <p className="text-[12.5px] leading-relaxed text-muted">{pipeline.script.setup}</p>
          </div>
          <div>
            <div className="label mb-1">Main Beats</div>
            <div className="space-y-2">
              {pipeline.script.mainBeats.map((beat, i) => (
                <div key={i} className="rounded-md border border-line bg-canvas-2 p-3">
                  <div className="text-[11px] font-semibold tracking-wider text-faint uppercase">{beat.label}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{beat.text}</p>
                  {beat.visualDirection && (
                    <p className="mt-1 text-[11px] text-faint italic">→ {beat.visualDirection}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          {pipeline.script.emotionalTurn && (
            <div>
              <div className="label mb-1">Emotional Turn</div>
              <p className="text-[12.5px] leading-relaxed text-muted">{pipeline.script.emotionalTurn}</p>
            </div>
          )}
          <div>
            <div className="label mb-1">Ending + CTA</div>
            <p className="text-[12.5px] leading-relaxed text-muted">{pipeline.script.ending}</p>
            <p className="mt-1 text-[12px] font-medium text-accent-hi">CTA: {pipeline.script.cta}</p>
          </div>
          {pipeline.script.estimatedDurationSec > 0 && (
            <Badge>~{pipeline.script.estimatedDurationSec}s estimated</Badge>
          )}
        </div>
      )}

      {/* Platform Tab */}
      {activeTab === "platform" && pipeline.platformVariants && (
        <div className="space-y-3">
          {pipeline.platformVariants.variants.map((v) => (
            <div key={v.platform} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={v.platform === "TikTok" ? "neutral" : v.platform === "Instagram" ? "accent" : "info"}>
                  {v.platform}
                </Badge>
                <span className="text-[11.5px] text-faint">{v.format}</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap">{v.text}</p>
              <div className="mt-2">
                <span className="text-[11px] font-medium text-accent-hi">CTA:</span>{" "}
                <span className="text-[12px] text-muted">{v.cta}</span>
              </div>
              {v.visualNotes && (
                <p className="mt-1.5 text-[11px] text-faint italic">Visual: {v.visualNotes}</p>
              )}
              {v.platformConstraints.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.platformConstraints.map((c, i) => (
                    <Badge key={i} tone="warn">{c}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Captions Tab */}
      {activeTab === "captions" && pipeline.captions && (
        <div className="space-y-2.5">
          {pipeline.captions.captions.map((cap, i) => (
            <div key={i} className="rounded-lg border border-line bg-canvas-2 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <Badge>{cap.style}</Badge>
                <button
                  className="text-faint transition-colors hover:text-ink"
                  onClick={() => navigator.clipboard?.writeText(cap.text).catch(() => {})}
                  title="Copy"
                >
                  <Copy className="size-3" />
                </button>
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap">{cap.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Checks Tab */}
      {activeTab === "checks" && (
        <div className="space-y-4">
          {/* Character Check */}
          <div className="rounded-lg border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pipeline.characterCheck?.passed
                  ? <CheckCircle2 className="size-4 text-pos" />
                  : <AlertTriangle className="size-4 text-warn" />}
                <span className="text-[13px] font-medium text-ink">Character Check</span>
              </div>
              <span className="num text-[13px] text-ink">
                {pipeline.characterCheck?.score ?? "—"} / 100
              </span>
            </div>
            <ProgressBar
              value={pipeline.characterCheck?.score ?? 0}
              tone={pipeline.characterCheck?.passed ? "pos" : "warn"}
              height={3}
            />
            {pipeline.characterCheck?.issues.length ? (
              <div className="mt-2.5 space-y-1">
                {pipeline.characterCheck.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className={cn(
                      "mt-0.5 size-1.5 shrink-0 rounded-full",
                      issue.severity === "error" ? "bg-neg" : issue.severity === "warning" ? "bg-warn" : "bg-faint",
                    )} />
                    <span className="text-muted">{issue.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-pos">No issues found — content matches character.</p>
            )}
          </div>

          {/* Quality Check */}
          <div className="rounded-lg border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pipeline.qualityCheck?.passed
                  ? <CheckCircle2 className="size-4 text-pos" />
                  : <AlertTriangle className="size-4 text-warn" />}
                <span className="text-[13px] font-medium text-ink">Quality Check</span>
              </div>
              <span className="num text-[13px] text-ink">
                {pipeline.qualityCheck?.score ?? "—"} / 100
              </span>
            </div>
            <ProgressBar
              value={pipeline.qualityCheck?.score ?? 0}
              tone={pipeline.qualityCheck?.passed ? "pos" : "warn"}
              height={3}
            />
            {pipeline.qualityCheck?.issues.length ? (
              <div className="mt-2.5 space-y-1">
                {pipeline.qualityCheck.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className={cn(
                      "mt-0.5 size-1.5 shrink-0 rounded-full",
                      issue.severity === "error" ? "bg-neg" : issue.severity === "warning" ? "bg-warn" : "bg-faint",
                    )} />
                    <span className="text-muted">{issue.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-pos">Quality looks good — structure is complete.</p>
            )}
            {pipeline.qualityCheck?.blockingReason && (
              <p className="mt-2 rounded-md bg-warn/10 p-2 text-[12px] text-warn">
                {pipeline.qualityCheck.blockingReason}
              </p>
            )}
          </div>

          {/* Suggestions */}
          {(pipeline.characterCheck?.suggestions.length || pipeline.qualityCheck?.suggestions.length) ? (
            <div>
              <div className="label mb-2">Suggestions</div>
              <div className="space-y-1">
                {[...(pipeline.characterCheck?.suggestions ?? []), ...(pipeline.qualityCheck?.suggestions ?? [])].map((s, i) => (
                  <p key={i} className="text-[12px] text-muted">• {s}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Actions */}
      <Divider className="my-4" />
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onRegenerate} disabled={running}>
          <RefreshCw className="size-3.5" /> Re-run checks
        </Button>
        <Button
          variant="primary"
          disabled={!canSave || running}
          onClick={onSave}
          title={!canSave ? "Fix check issues before saving" : undefined}
        >
          <Save className="size-3.5" /> Save as Draft
        </Button>
      </div>
    </Card>
  );
}
