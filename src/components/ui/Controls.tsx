import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/utils/cn";

/* ------------------------------- SearchInput ------------------------------ */

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-9 w-full rounded-[9px] border border-line bg-canvas-2 pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-faint focus:border-line-2 focus:bg-surface-2 focus:outline-none"
      />
    </div>
  );
}

/* ------------------------------- FilterChips ------------------------------ */

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  counts,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  counts?: Partial<Record<T, number>>;
  className?: string;
}) {
  return (
    <div className={cn("hide-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1", className)}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
              active
                ? "border-accent/40 bg-accent/12 text-ink"
                : "border-line text-muted hover:border-line-2 hover:bg-surface-2 hover:text-ink-2",
            )}
          >
            {opt}
            {counts?.[opt] !== undefined && (
              <span className={cn("num text-[11px]", active ? "text-accent-hi" : "text-faint")}>
                {counts[opt]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- SegmentedControl ---------------------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-line bg-canvas-2 p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150",
            value === opt ? "bg-surface-3 text-ink shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink-2",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------- Tabs --------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-5 border-b border-line", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "relative -mb-px border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
            value === tab
              ? "border-accent text-ink"
              : "border-transparent text-muted hover:text-ink-2",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Switch -------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  const control = (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40",
        checked ? "border-accent/50 bg-accent" : "border-line-2 bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white transition-all duration-200",
          checked ? "left-[18px]" : "left-[3px]",
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {description && <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</div>}
      </div>
      {control}
    </div>
  );
}

/* ---------------------------------- Select -------------------------------- */

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 w-full appearance-none rounded-[9px] border border-line bg-canvas-2 pr-8 pl-3 text-[12.5px] text-ink-2 transition-colors hover:border-line-2 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-surface text-ink">
            {o}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-faint"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ----------------------------- DateRangePicker ---------------------------- */

export function DateRangePicker({
  value,
  onChange,
  options = ["7 days", "30 days", "90 days", "All time"] as const,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-canvas-2 p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition-all duration-150",
            value === opt ? "bg-surface-3 text-ink" : "text-muted hover:text-ink-2",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- Pagination ------------------------------ */

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total?: number;
}) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
  );

  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
      <span className="num text-[12px] text-faint">
        Page {page} of {Math.max(1, pageCount)}
        {total !== undefined && ` · ${total} results`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="grid size-8 place-items-center rounded-md border border-line text-muted transition-colors hover:border-line-2 hover:text-ink disabled:opacity-35"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        {pages.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-faint">…</span>}
            <button
              onClick={() => onPage(p)}
              className={cn(
                "num size-8 rounded-md border text-[12px] transition-colors",
                p === page
                  ? "border-accent/40 bg-accent/12 text-ink"
                  : "border-line text-muted hover:border-line-2 hover:text-ink",
              )}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
          className="grid size-8 place-items-center rounded-md border border-line text-muted transition-colors hover:border-line-2 hover:text-ink disabled:opacity-35"
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Field ---------------------------------- */

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-[9px] border border-line bg-canvas-2 px-3 text-[13px] text-ink transition-colors placeholder:text-faint focus:border-line-2 focus:bg-surface-2 focus:outline-none";

export const textareaClass =
  "w-full resize-y rounded-[9px] border border-line bg-canvas-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink transition-colors placeholder:text-faint focus:border-line-2 focus:bg-surface-2 focus:outline-none";
