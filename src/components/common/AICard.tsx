import { ArrowUpRight, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";

/**
 * AI card — the single visual treatment used for every AI output in
 * Mara OS (insights, recommendations, drafts). Never auto-executes:
 * everything requires an explicit operator action.
 */
export function AICard({
  eyebrow = "AI INSIGHT",
  title,
  body,
  recommendation,
  confidence,
  cta,
  secondaryAction,
  onAction,
  className,
  compact,
}: {
  eyebrow?: string;
  title?: string;
  body: React.ReactNode;
  recommendation?: string;
  confidence?: number;
  cta?: { label: string; to?: string };
  secondaryAction?: React.ReactNode;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const confidenceTone =
    confidence === undefined ? "" : confidence >= 90 ? "text-pos" : confidence >= 80 ? "text-warn" : "text-muted";

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-accent/25 bg-accent/[0.05]", className)}>
      <span className="absolute inset-y-0 left-0 w-[2px] bg-accent/70" />
      <div className={cn("flex h-full flex-col", compact ? "p-4" : "p-5")}>
        <div className="flex items-center gap-2">
          <Lightbulb className="size-3.5 text-accent-hi" strokeWidth={1.9} />
          <span className="text-[10.5px] font-semibold tracking-[0.1em] text-accent-hi uppercase">{eyebrow}</span>
        </div>

        {title && <h3 className="mt-3 text-[14px] font-medium tracking-[-0.01em] text-ink">{title}</h3>}

        <p className={cn("mt-2 leading-relaxed text-ink-2", compact ? "text-[12.5px]" : "text-[13px]")}>{body}</p>

        {recommendation && (
          <div className="mt-4 rounded-lg border border-line bg-canvas-2/60 p-3">
            <div className="label">Recommended</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{recommendation}</p>
          </div>
        )}

        <div className={cn("flex flex-wrap items-center gap-3", compact ? "mt-4" : "mt-auto pt-5")}>
          {confidence !== undefined && (
            <div className="flex items-center gap-2">
              <span className="label">Confidence</span>
              <span className={cn("num text-[12.5px] font-medium", confidenceTone)}>{confidence}%</span>
            </div>
          )}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {secondaryAction}
            {cta &&
              (cta.to ? (
                <Link
                  to={cta.to}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-accent px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hi"
                >
                  {cta.label}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              ) : (
                <Button variant="primary" size="sm" onClick={onAction}>
                  {cta.label}
                </Button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact inline AI note used in side panels (conversations, fan profile). */
export function AINote({
  title,
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-accent/22 bg-accent/[0.06] p-3">
      {title && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Lightbulb className="size-3 text-accent-hi" strokeWidth={2} />
          <span className="text-[10px] font-semibold tracking-[0.1em] text-accent-hi uppercase">{title}</span>
        </div>
      )}
      <div className="text-[12px] leading-relaxed text-ink-2">{children}</div>
      {footer && <div className="mt-3 flex items-center gap-2">{footer}</div>}
    </div>
  );
}
