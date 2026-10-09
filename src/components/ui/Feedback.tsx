import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/utils/cn";

/* -------------------------------- Skeleton ------------------------------- */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div style={style} className={cn("relative overflow-hidden rounded-md bg-surface-3", className)}>
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
        style={{ animation: "mara-shimmer 1.6s infinite" }}
      />
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 p-5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3 flex-1" style={{ width: `${100 - i * 7}%` }} />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <Skeleton className="aspect-4/5 w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-faint">
          {icon}
        </div>
      )}
      <h3 className="text-[13.5px] font-medium text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Псевдоним сохранён для соответствия описи компонентов. */
export const LoadingState = SkeletonRows;

/* ---------------------------------- Toast -------------------------------- */

type ToastTone = "default" | "success" | "warn" | "error";
interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const icons: Record<ToastTone, React.ReactNode> = {
    default: <Info className="size-4 text-info" />,
    success: <CheckCircle2 className="size-4 text-pos" />,
    warn: <TriangleAlert className="size-4 text-warn" />,
    error: <TriangleAlert className="size-4 text-neg" />,
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-200 flex w-full max-w-xs flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-sheet pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3 shadow-[var(--shadow-pop)]"
          >
            <span className="mt-0.5">{icons[t.tone]}</span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{t.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
