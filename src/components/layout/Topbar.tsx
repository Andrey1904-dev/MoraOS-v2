import { useState } from "react";
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

const notifications = [
  { id: 1, title: "12 conversations awaiting approval", meta: "Conversation Agent · 41 min oldest", tone: "warn" },
  { id: 2, title: "Episode 05 ready to publish", meta: "Scheduled Friday 18:00", tone: "info" },
  { id: 3, title: "Ben Adler cancelled subscription", meta: "Churn risk · LTV $306", tone: "neg" },
  { id: 4, title: "Asset approved: Mara · late night", meta: "Quality 97 · used in 3 items", tone: "pos" },
];

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

  const crumbs = pathname.split("/").filter(Boolean);

  const onSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onOpenSidebar}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <PanelLeft className="size-3.5 text-faint" />
        <nav className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <Link to="/" className="text-muted transition-colors hover:text-ink-2">
            Mara OS
          </Link>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1.5">
              <span className="text-faint">/</span>
              <span className={cn("truncate capitalize", i === crumbs.length - 1 ? "text-ink" : "text-muted")}>
                {c.startsWith("fan_") ? "Profile" : c === "new" ? "Create" : c.replace(/-/g, " ")}
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
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        {mode === "demo" && (
          <div className="hidden items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 sm:flex">
            <Circle className="size-1.5 fill-warn text-warn" />
            <span className="text-[11.5px] font-medium text-warn">Demo mode</span>
          </div>
        )}
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-canvas-2 px-2.5 py-1.5 xl:flex">
          <Circle className="size-1.5 fill-pos text-pos" />
          <span className="text-[11.5px] text-muted">6 agents online</span>
        </div>

        <Dropdown
          align="end"
          trigger={
            <button
              className="relative grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Notifications"
            >
              <Bell className="size-4" strokeWidth={1.75} />
              {!read && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          }
        >
          {(close) => (
            <div className="w-80">
              <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-[12.5px] font-medium text-ink">Notifications</span>
                <button
                  onClick={() => {
                    setRead(true);
                    close();
                  }}
                  className="text-[11px] text-muted transition-colors hover:text-ink"
                >
                  Mark all read
                </button>
              </div>
              <MenuSeparator />
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
              <img src={media.mara} alt="Mara Quinn" className="size-6 rounded-full object-cover" />
              <ChevronDown className="size-3.5 text-faint" />
            </button>
          }
        >
          <MenuLabel>{user?.email ?? "Mara OS"}</MenuLabel>
          <MenuItem icon={<UserRound className="size-3.5" />} onClick={() => navigate("/settings")}>
            Mara Quinn · profile
          </MenuItem>
          <MenuItem icon={<Sparkles className="size-3.5" />} onClick={() => navigate("/ai")}>
            AI Studio
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<SettingsIcon className="size-3.5" />} onClick={() => navigate("/settings")}>
            Settings
          </MenuItem>
          {!demoOnly && (
            <>
              <MenuSeparator />
              <MenuItem icon={<LogOut className="size-3.5" />} onClick={() => void onSignOut()}>
                {mode === "demo" ? "Exit demo mode" : "Sign out"}
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
