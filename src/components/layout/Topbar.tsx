import { useState } from "react";
import { SafeImg } from "@/components/ui/SafeImg";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Circle,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Overlays";

import { media } from "@/data/media";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/utils/cn";

/**
 * Примеры уведомлений — только в демо-режиме (вымышленные данные). В облачном
 * режиме уведомлений пока нет: показываем пустое состояние, а не выдуманные события.
 */
const demoNotifications = [
  { id: 1, title: "12 диалогов ждут одобрения", meta: "Демо-данные · Агент диалогов", tone: "warn" },
  { id: 2, title: "Эпизод 05 готов к публикации", meta: "Демо-данные · Запланировано на пятницу, 18:00", tone: "info" },
  { id: 3, title: "Бен Адлер отменил подписку", meta: "Демо-данные · Риск оттока", tone: "neg" },
  { id: 4, title: "Ассет одобрен: Мара · поздний вечер", meta: "Демо-данные · Качество 97", tone: "pos" },
];

/** Человекочитаемые названия сегментов адреса для «хлебных крошек». */
const crumbLabels: Record<string, string> = {
  fans: "Фаны",
  conversations: "Диалоги",
  content: "Контент",
  episodes: "Эпизоды",
  assets: "Ассеты",
  offers: "Офферы",
  revenue: "Выручка",
  analytics: "Аналитика",
  ai: "AI-студия",
  automations: "Автоматизации",
  tasks: "Задачи",
  settings: "Настройки",
  new: "Создание",
};

const crumbLabel = (segment: string) => {
  if (segment.startsWith("fan_")) return "Профиль";
  if (crumbLabels[segment]) return crumbLabels[segment];
  return segment.replace(/-/g, " ");
};

export function Topbar({
  onOpenSidebar,
  onOpenCommand,
}: {
  onOpenSidebar: () => void;
  onOpenCommand: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, mode, demoOnly, signOut } = useAuth();
  const [read, setRead] = useState(false);
  const notifications = mode === "demo" ? demoNotifications : [];

  const crumbs = pathname.split("/").filter(Boolean);

  const onSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onOpenSidebar}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Открыть навигацию"
      >
        <Menu className="size-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <PanelLeft className="size-3.5 text-faint" />
        <nav aria-label="Хлебные крошки" className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <Link to="/" className="text-muted transition-colors hover:text-ink-2">
            Mara OS
          </Link>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1.5">
              <span className="text-faint">/</span>
              <span className={cn("truncate", i === crumbs.length - 1 ? "text-ink" : "text-muted")}>
                {crumbLabel(c)}
              </span>
            </span>
          ))}
        </nav>
      </div>

      <button
        onClick={onOpenCommand}
        className="ml-auto flex h-8 w-full max-w-[320px] items-center gap-2 rounded-lg border border-line bg-canvas-2 px-3 text-[12.5px] text-faint transition-colors hover:border-line-2 hover:text-muted lg:ml-6"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Поиск или переход…</span>
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        {mode === "demo" && (
          <div className="hidden items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 sm:flex">
            <Circle className="size-1.5 fill-warn text-warn" />
            <span className="text-[11.5px] font-medium text-warn">Демо-режим</span>
          </div>
        )}
        {mode === "demo" && (
          <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-canvas-2 px-2.5 py-1.5 xl:flex">
            <Circle className="size-1.5 fill-warn text-warn" />
            <span className="text-[11.5px] text-muted">Демо-агенты</span>
          </div>
        )}

        <Dropdown
          align="end"
          trigger={
            <button
              className="relative grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Уведомления"
            >
              <Bell className="size-4" strokeWidth={1.75} />
              {!read && notifications.length > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          }
        >
          {(close) => (
            <div className="w-80">
              <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-[12.5px] font-medium text-ink">Уведомления</span>
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      setRead(true);
                      close();
                    }}
                    className="text-[11px] text-muted transition-colors hover:text-ink"
                  >
                    Отметить всё прочитанным
                  </button>
                )}
              </div>
              <MenuSeparator />
              {notifications.length === 0 && (
                <div className="px-2.5 py-3 text-[12px] text-muted">Уведомлений пока нет.</div>
              )}
              {notifications.map((n) => (
                <div key={n.id} className="flex gap-2.5 rounded-md px-2.5 py-2 hover:bg-surface-3">
                  <Circle
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0",
                      n.tone === "warn" && "fill-warn text-warn",
                      n.tone === "neg" && "fill-neg text-neg",
                      n.tone === "pos" && "fill-pos text-pos",
                      n.tone === "info" && "fill-info text-info",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-[12.5px] leading-snug text-ink">{n.title}</div>
                    <div className="mt-0.5 text-[11px] text-faint">{n.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dropdown>

        <Dropdown
          align="end"
          trigger={
            <button className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-surface-2">
              <SafeImg src={media.mara} alt="Мара Куинн" className="size-6 rounded-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
              <ChevronDown className="size-3.5 text-faint" />
            </button>
          }
        >
          <MenuLabel>{user?.email ?? "Mara OS"}</MenuLabel>
          <MenuItem icon={<UserRound className="size-3.5" />} onClick={() => navigate("/settings")}>
            Мара Куинн · профиль
          </MenuItem>
          <MenuItem icon={<Sparkles className="size-3.5" />} onClick={() => navigate("/ai")}>
            AI-студия
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<SettingsIcon className="size-3.5" />} onClick={() => navigate("/settings")}>
            Настройки
          </MenuItem>
          {!demoOnly && (
            <>
              <MenuSeparator />
              <MenuItem icon={<LogOut className="size-3.5" />} onClick={() => void onSignOut()}>
                {mode === "demo" ? "Выйти из демо-режима" : "Выйти"}
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
