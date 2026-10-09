import { NavLink } from "react-router-dom";
import { SafeImg } from "@/components/ui/SafeImg";
import { Circle, Command as CommandIcon } from "lucide-react";
import { navGroups } from "./nav";
import { media } from "@/data/media";
import { cn } from "@/utils/cn";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-canvas-2">
      {/* Логотип */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <span className="grid size-6 place-items-center rounded-[6px] bg-accent text-[11px] font-bold text-white">M</span>
        <span className="text-[12.5px] font-semibold tracking-[0.14em] text-ink">MARA OS</span>
        <span className="num ml-auto rounded border border-line px-1 py-0.5 text-[10px] text-faint">v2</span>
      </div>

      {/* Активный персонаж */}
      <div className="mx-3 mb-4 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <SafeImg
          src={media.mara}
          alt="Mara Quinn"
          className="size-8 rounded-full object-cover"
          loading="lazy"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full bg-pos shadow-[0_0_0_3px_rgba(87,160,111,0.15)]" />
            <span className="truncate text-[12.5px] font-medium text-ink">Mara Quinn</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted">Виртуальный креатор</div>
        </div>
      </div>

      {/* Навигация */}
      <nav aria-label="Основная навигация" className="hide-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="label mb-2 px-2">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150",
                        isActive
                          ? "bg-surface-3 text-ink"
                          : "text-muted hover:bg-surface-2 hover:text-ink-2",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-r bg-accent transition-opacity",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <item.icon
                          className={cn("size-[15px] shrink-0", isActive ? "text-accent-hi" : "text-faint group-hover:text-muted")}
                          strokeWidth={1.75}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="num rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-hi">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Системный футер */}
      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-faint">
            <Circle className="size-1.5 fill-pos text-pos" />
            Все системы в норме
          </span>
          <span className="flex items-center gap-1 text-[10.5px] text-faint">
            <CommandIcon className="size-3" />K
          </span>
        </div>
      </div>
    </aside>
  );
}
