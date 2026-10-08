import { cn } from "@/utils/cn";
import { Delta } from "./Card";
import { Skeleton } from "./Feedback";
import { Sparkline } from "./charts";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  spark,
  accent,
  invertDelta,
  loading,
  onClick,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  spark?: number[];
  accent?: boolean;
  invertDelta?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="mt-3 h-5 w-24" />
        <Skeleton className="mt-2 h-2.5 w-20" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface p-4 transition-colors duration-150",
        accent ? "border-accent/25 bg-accent/[0.045]" : "border-line hover:border-line-2",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {spark && (
          <span className="-mr-1 -mt-1 opacity-70 transition-opacity group-hover:opacity-100">
            <Sparkline values={spark} tone={accent ? "accent" : delta && delta < 0 ? "neg" : "muted"} width={62} height={20} />
          </span>
        )}
      </div>
      <div className={cn("num mt-3 text-[22px] leading-none font-medium tracking-[-0.02em]", accent ? "text-ink" : "text-ink")}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
        {hint && <span className="truncate text-[11px] text-faint">{hint}</span>}
      </div>
      {accent && <span className="absolute inset-x-0 bottom-0 h-px bg-accent/40" />}
    </div>
  );
}
