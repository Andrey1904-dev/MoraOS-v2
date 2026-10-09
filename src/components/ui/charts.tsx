import { useId, useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { currency, number as fmtNumber } from "@/lib/format";
import type { SeriesPoint } from "@/types";

/* ------------------------------- primitives ------------------------------ */

const path = (pts: { x: number; y: number }[]) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

const smooth = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
};

/* -------------------------------- AreaChart ------------------------------ */

export function AreaChart({
  data,
  height = 200,
  format = "number",
  showCompare = true,
  className,
}: {
  data: SeriesPoint[];
  height?: number;
  format?: "number" | "currency" | "percent";
  showCompare?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padY = 14;

  const { max, min, pts, cmpPts } = useMemo(() => {
    const values = data.flatMap((d) => [d.value, ...(showCompare && d.compare ? [d.compare] : [])]);
    const max = Math.max(...values, 1);
    const min = 0;
    const dx = data.length > 1 ? W / (data.length - 1) : W;
    const map = (v: number) => H - padY - ((v - min) / (max - min || 1)) * (H - padY * 2);
    return {
      max,
      min,
      pts: data.map((d, i) => ({ x: i * dx, y: map(d.value) })),
      cmpPts: data.map((d, i) => ({ x: i * dx, y: map(d.compare ?? 0) })),
    };
  }, [data, H, showCompare]);

  const fmt = (v: number) =>
    format === "currency" ? currency(v) : format === "percent" ? `${v}%` : fmtNumber(v);

  const line = smooth(pts);
  // При одной точке или пустых данных линии нет: пустой путь вместо невалидного d=" L…" (ошибка SVG в консоли).
  const area = line ? `${line} L${W},${H} L0,${H} Z` : "";

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="2 5" />
        ))}

        {showCompare && (
          <path
            d={smooth(cmpPts)}
            fill="none"
            stroke="var(--color-line-2)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path d={area} fill={`url(#fill-${id})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent-hi)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="anim-draw"
          style={{ ["--dash" as string]: 1600 }}
        />

        {hover !== null && (
          <>
            <line x1={pts[hover].x} x2={pts[hover].x} y1="0" y2={H} stroke="var(--color-line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r="3.5" fill="var(--color-accent-hi)" stroke="var(--color-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}

        {data.map((_, i) => (
          <rect
            key={i}
            x={(i - 0.5) * (W / Math.max(1, data.length - 1))}
            y={0}
            width={W / Math.max(1, data.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-[10.5px] text-faint">
        {data
          .filter((_, i) => data.length <= 14 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1)
          .map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] shadow-[var(--shadow-pop)]"
          style={{
            left: `${(pts[hover].x / W) * 100}%`,
            transform: pts[hover].x > W * 0.7 ? "translateX(-105%)" : "translateX(8px)",
          }}
        >
          <div className="text-faint">{data[hover].label}</div>
          <div className="num mt-0.5 font-medium text-ink">{fmt(data[hover].value)}</div>
          {showCompare && data[hover].compare !== undefined && (
            <div className="num mt-0.5 text-faint">пред. {fmt(data[hover].compare!)}</div>
          )}
        </div>
      )}

      <div className="num mt-1 flex items-center gap-4 text-[10.5px] text-faint">
        <span>пик {fmt(max)}</span>
        <span>минимум {fmt(min)}</span>
        {showCompare && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 border-t border-dashed border-line-2" /> прошлый период
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- BarChart ------------------------------- */

export function BarChart({
  data,
  height = 180,
  format = "number",
  horizontal = false,
  className,
  tone = "accent",
}: {
  data: SeriesPoint[];
  height?: number;
  format?: "number" | "currency" | "percent";
  horizontal?: boolean;
  className?: string;
  tone?: "accent" | "info" | "pos";
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (v: number) =>
    format === "currency" ? currency(v, { compact: true }) : format === "percent" ? `${v}%` : fmtNumber(v, true);
  const color =
    tone === "info" ? "bg-info" : tone === "pos" ? "bg-pos" : "bg-accent";

  if (horizontal) {
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((d, i) => (
          <div key={d.label} className="group">
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="text-ink-2">{d.label}</span>
              <span className="num text-muted">{fmt(d.value)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", color, i === 0 ? "" : "opacity-70")}
                style={{ width: `${(d.value / max) * 100}%`, transitionDelay: `${i * 60}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-1.5", className)} style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="group relative flex flex-1 flex-col items-center justify-end gap-2" style={{ height: "100%" }}>
          <div className="num absolute -top-5 hidden text-[10.5px] text-ink group-hover:block">{fmt(d.value)}</div>
          <div
            className={cn("anim-rise w-full rounded-t-[3px] transition-colors group-hover:opacity-90", color, i === 0 ? "" : "opacity-60")}
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, animationDelay: `${i * 35}ms` }}
          />
          <span className="truncate text-[10px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ StackedBars ------------------------------ */

export function StackedBars({
  data,
  height = 190,
  className,
}: {
  data: { label: string; segments: { key: string; value: number }[] }[];
  height?: number;
  className?: string;
}) {
  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(...totals, 1);
  const colors = ["var(--color-accent)", "var(--color-info)", "var(--color-pos)", "var(--color-warn)"];

  return (
    <div className={className}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="group flex flex-1 flex-col justify-end gap-2" style={{ height: "100%" }}>
            <div className="num mb-1 text-center text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
              {currency(totals[i], { compact: true })}
            </div>
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-[3px]" style={{ height: `${(totals[i] / max) * 100}%` }}>
              {d.segments.map((s, si) => (
                <div
                  key={s.key}
                  style={{
                    height: `${(s.value / totals[i]) * 100}%`,
                    background: colors[si % colors.length],
                    opacity: si === 0 ? 1 : 0.75,
                  }}
                />
              ))}
            </div>
            <span className="truncate text-center text-[10px] text-faint">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-faint">
        {data[0]?.segments.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: colors[i % colors.length] }} />
            {s.key}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Donut --------------------------------- */

export function Donut({
  segments,
  size = 132,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const colors = ["var(--color-accent)", "var(--color-info)", "var(--color-pos)", "var(--color-warn)", "var(--color-muted)"];
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="9" />
          {segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="9"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-[15px] font-medium text-ink">{centerValue}</div>
            <div className="label mt-0.5">{centerLabel}</div>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-[12px]">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: colors[i % colors.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
            <span className="num text-muted">{currency(s.value, { compact: true })}</span>
            <span className="num w-10 text-right text-faint">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Sparkline ------------------------------ */

export function Sparkline({
  values,
  tone = "accent",
  width = 88,
  height = 26,
}: {
  values: number[];
  tone?: "accent" | "pos" | "neg" | "muted";
  width?: number;
  height?: number;
}) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => ({
    x: (i / Math.max(1, values.length - 1)) * width,
    y: height - ((v - min) / (max - min || 1)) * (height - 4) - 2,
  }));
  const stroke =
    tone === "pos" ? "var(--color-pos)" : tone === "neg" ? "var(--color-neg)" : tone === "muted" ? "var(--color-muted)" : "var(--color-accent-hi)";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path(pts)} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1]?.x} cy={pts[pts.length - 1]?.y} r="2" fill={stroke} />
    </svg>
  );
}

/* -------------------------------- FunnelBars ----------------------------- */

export function FunnelBars({ data }: { data: SeriesPoint[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const prev = i > 0 ? data[i - 1].value : d.value;
        const step = i === 0 ? 100 : (d.value / prev) * 100;
        return (
          <div key={d.label} className="flex items-center gap-4">
            <span className="w-28 shrink-0 text-[12px] text-ink-2">{d.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-[5px] bg-surface-3">
              <div
                className="flex h-full items-center rounded-[5px] px-2 transition-[width] duration-700"
                style={{
                  width: `${Math.max(6, (d.value / max) * 100)}%`,
                  background: i === data.length - 1 ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 45%, transparent)",
                  transitionDelay: `${i * 60}ms`,
                }}
              >
                <span className="num text-[10.5px] font-medium text-white/90">{fmtNumber(d.value)}</span>
              </div>
            </div>
            <span className="num w-14 shrink-0 text-right text-[11.5px] text-faint">
              {i === 0 ? "—" : `${step.toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
