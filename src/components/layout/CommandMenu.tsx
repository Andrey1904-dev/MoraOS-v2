import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Clapperboard,
  CornerDownLeft,
  Images,
  MessageSquare,
  Search,
  Sparkles,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import { flatNav } from "./nav";
import { fans } from "@/data/fans";
import { contentItems } from "@/data/content";
import { cn } from "@/utils/cn";

const groupLabels: Record<Command["group"], string> = {
  Navigate: "Переход",
  Create: "Действия",
  Fans: "Фаны",
  Content: "Контент",
};

interface Command {
  id: string;
  label: string;
  hint: string;
  group: "Navigate" | "Create" | "Fans" | "Content";
  icon: React.ReactNode;
  run: () => void;
}

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = flatNav
      .filter((n) => n.to !== "/")
      .map((n) => ({
        id: `nav-${n.to}`,
        label: n.label,
        hint: n.to,
        group: "Navigate",
        icon: <n.icon className="size-4" strokeWidth={1.75} />,
        run: () => navigate(n.to),
      }));

    const create: Command[] = [
      {
        id: "create-content",
        label: "Создать контент",
        hint: "content / new",
        group: "Create",
        icon: <Images className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/content/new"),
      },
      {
        id: "create-offer",
        label: "Создать оффер",
        hint: "offers",
        group: "Create",
        icon: <Tag className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/offers?new=1"),
      },
      {
        id: "open-ai",
        label: "Открыть AI-студию",
        hint: "ai",
        group: "Create",
        icon: <Sparkles className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/ai"),
      },
      {
        id: "open-conversations",
        label: "Открыть диалоги",
        hint: "inbox",
        group: "Create",
        icon: <MessageSquare className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/conversations"),
      },
      {
        id: "open-revenue",
        label: "Открыть выручку",
        hint: "revenue",
        group: "Create",
        icon: <Wallet className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/revenue"),
      },
      {
        id: "open-episodes",
        label: "Открыть сюжетную линию",
        hint: "episodes",
        group: "Create",
        icon: <Clapperboard className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/episodes"),
      },
      {
        id: "open-analytics",
        label: "Открыть аналитику",
        hint: "analytics",
        group: "Create",
        icon: <BarChart3 className="size-4" strokeWidth={1.75} />,
        run: () => navigate("/analytics"),
      },
    ];

    const fanCmds: Command[] = fans.slice(0, 8).map((f) => ({
      id: `fan-${f.id}`,
      label: f.name,
      hint: `${f.handle} · ${f.relationship}`,
      group: "Fans",
      icon: <Users className="size-4" strokeWidth={1.75} />,
      run: () => navigate(`/fans/${f.id}`),
    }));

    const contentCmds: Command[] = contentItems.slice(0, 6).map((c) => ({
      id: `content-${c.id}`,
      label: c.title,
      hint: `${c.platform} · ${c.status}`,
      group: "Content",
      icon: <Images className="size-4" strokeWidth={1.75} />,
      run: () => navigate(`/content?open=${c.id}`),
    }));

    return [...nav, ...create, ...fanCmds, ...contentCmds];
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(filtered.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        const cmd = filtered[index];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, index, onClose]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-200 flex items-start justify-center p-4 pt-[12vh]">
      <div className="anim-overlay absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="anim-sheet relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Поиск по фанам и контенту или переход к разделу…"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>

        <div className="hide-scrollbar max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-3 py-10 text-center text-[12.5px] text-muted">По запросу «{query}» ничего не найдено</div>
          )}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {showGroup && <div className="label px-2.5 pt-3 pb-1.5">{groupLabels[cmd.group]}</div>}
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    cmd.run();
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    i === index ? "bg-surface-3 text-ink" : "text-ink-2",
                  )}
                >
                  <span className={cn(i === index ? "text-accent-hi" : "text-faint")}>{cmd.icon}</span>
                  <span className="flex-1 truncate text-[13px]">{cmd.label}</span>
                  <span className="num truncate text-[11px] text-faint">{cmd.hint}</span>
                  {i === index && <CornerDownLeft className="size-3.5 text-faint" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-canvas-2/60 px-4 py-2.5 text-[10.5px] text-faint">
          <span className="flex items-center gap-3">
            <span>↑↓ — навигация</span>
            <span>↵ — открыть</span>
          </span>
          <span className="flex items-center gap-1">
            Командная панель Mara OS <ArrowRight className="size-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
