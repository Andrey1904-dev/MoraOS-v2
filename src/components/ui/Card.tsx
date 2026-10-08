import { cn } from "@/utils/cn";
import { SafeImg } from "./SafeImg";
import { initials } from "@/lib/format";

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className,
  children,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]",
        interactive &&
          "cursor-pointer transition-colors duration-150 hover:border-line-2 hover:bg-surface-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("label mb-3", className)}>{children}</div>;
}

/* --------------------------------- Badge --------------------------------- */

type Tone = "neutral" | "accent" | "pos" | "warn" | "neg" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2 border-line-2",
  accent: "bg-accent/12 text-accent-hi border-accent/25",
  pos: "bg-pos/12 text-pos border-pos/25",
  warn: "bg-warn/12 text-warn border-warn/25",
  neg: "bg-neg/12 text-neg border-neg/25",
  info: "bg-info/12 text-info border-info/25",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const statusTone: Record<string, Tone> = {
  Active: "pos",
  Published: "pos",
  Approved: "pos",
  Online: "pos",
  Live: "pos",
  Done: "pos",
  Paid: "pos",
  Draft: "neutral",
  Outline: "neutral",
  Idle: "neutral",
  Paused: "warn",
  Pending: "warn",
  Review: "warn",
  Scheduled: "info",
  "In production": "info",
  "In progress": "info",
  New: "info",
  Sleeping: "warn",
  "Churn risk": "neg",
  Rejected: "neg",
  Churned: "neg",
  Cancelled: "neg",
  Error: "neg",
  Refunded: "neg",
  Todo: "neutral",
};

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <Badge tone={statusTone[status] ?? "neutral"} dot={dot} className={className}>
      {status}
    </Badge>
  );
}

/* --------------------------------- Avatar -------------------------------- */

export function Avatar({
  name,
  src,
  size = 32,
  tone,
  className,
  ring,
}: {
  name: string;
  src?: string;
  size?: number;
  tone?: string;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 text-[11px] font-medium text-ink-2 select-none",
        ring && "ring-2 ring-accent/50 ring-offset-2 ring-offset-surface",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: tone ? `linear-gradient(140deg, ${tone}, #1b1d21)` : undefined,
        fontSize: Math.max(9, size * 0.34),
      }}
      aria-hidden={false}
      title={name}
    >
      {src ? (
        <SafeImg src={src} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/* ------------------------------- ProgressBar ----------------------------- */

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  className,
  height = 4,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "pos" | "warn" | "info";
  className?: string;
  height?: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const bg = { accent: "bg-accent", pos: "bg-pos", warn: "bg-warn", info: "bg-info" }[tone];
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3", className)} style={{ height }}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------------------------- Delta -------------------------------- */

export function Delta({ value, suffix = "%", invert }: { value: number; suffix?: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 text-[11.5px] font-medium",
        flat ? "text-muted" : good ? "text-pos" : "text-neg",
      )}
    >
      {!flat && (good ? "↑" : "↓")}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/* -------------------------------- KeyStat -------------------------------- */

export function KeyStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num mt-1.5 text-[15px] font-medium text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[11.5px] text-faint">{hint}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
