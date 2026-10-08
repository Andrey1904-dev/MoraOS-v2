import { cn } from "@/utils/cn";

/**
 * DataTable — a presentational table shell.
 * On small screens the caller can switch to a card list; this component
 * only handles the desktop grid markup.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  selected,
  onToggleSelect,
  onToggleAll,
  empty,
  className,
}: {
  rows: T[];
  columns: { key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; className?: string; align?: "left" | "right" }[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onToggleAll?: () => void;
  empty?: React.ReactNode;
  className?: string;
}) {
  const allSelected = selected !== undefined && rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-line bg-canvas-2/50">
            {onToggleAll && (
              <th className="w-10 px-5 py-2.5">
                <CheckBox
                  checked={allSelected}
                  onChange={onToggleAll}
                  ariaLabel="Select all rows"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-2.5 text-[10.5px] font-medium tracking-[0.09em] whitespace-nowrap text-faint uppercase",
                  c.align === "right" && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (onToggleAll ? 1 : 0)} className="px-5 py-14 text-center text-[13px] text-muted">
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            const isSelected = selected?.has(key);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line/70 transition-colors last:border-0",
                  onRowClick && "cursor-pointer",
                  isSelected ? "bg-accent/[0.06]" : "hover:bg-surface-2/70",
                )}
              >
                {onToggleSelect && (
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <CheckBox checked={!!isSelected} onChange={() => onToggleSelect(key)} ariaLabel={`Select ${key}`} />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 text-[13px] text-ink-2",
                      c.align === "right" && "text-right",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CheckBox({
  checked,
  onChange,
  ariaLabel,
  indeterminate,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  indeterminate?: boolean;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "grid size-4 place-items-center rounded-[4px] border transition-colors",
        checked || indeterminate ? "border-accent bg-accent text-white" : "border-line-2 bg-canvas-2 hover:border-faint",
      )}
    >
      {indeterminate ? (
        <span className="h-[1.5px] w-2 rounded-full bg-white" />
      ) : checked ? (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

/** Responsive helper: renders a card list instead of a table under `md`. */
export function MobileCardList<T>({
  rows,
  rowKey,
  render,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  render: (row: T) => React.ReactNode;
}) {
  return (
    <div className="divide-y divide-line md:hidden">
      {rows.map((row) => (
        <div key={rowKey(row)} className="px-4 py-4">
          {render(row)}
        </div>
      ))}
    </div>
  );
}
