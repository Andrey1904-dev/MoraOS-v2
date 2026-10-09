import {
  BarChart3,
  Clapperboard,
  FolderOpen,
  Images,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Settings as SettingsIcon,
  Sparkles,
  Tag,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  { label: "Штаб", items: [{ label: "Обзор", to: "/", icon: LayoutDashboard }] },
  {
    label: "Аудитория",
    items: [
      { label: "Фаны", to: "/fans", icon: Users },
      { label: "Диалоги", to: "/conversations", icon: MessageSquare },
    ],
  },
  {
    label: "Контент",
    items: [
      { label: "Контент", to: "/content", icon: Images },
      { label: "Эпизоды", to: "/episodes", icon: Clapperboard },
      { label: "Ассеты", to: "/assets", icon: FolderOpen },
    ],
  },
  {
    label: "Бизнес",
    items: [
      { label: "Офферы", to: "/offers", icon: Tag },
      { label: "Выручка", to: "/revenue", icon: Wallet },
      { label: "Аналитика", to: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "AI-студия", to: "/ai", icon: Sparkles },
      { label: "Автоматизации", to: "/automations", icon: Workflow },
    ],
  },
  {
    label: "Система",
    items: [
      { label: "Задачи", to: "/tasks", icon: ListChecks },
      { label: "Настройки", to: "/settings", icon: SettingsIcon },
    ],
  },
];

export const flatNav = navGroups.flatMap((g) => g.items);

export const pageTitle = (pathname: string) => {
  if (pathname === "/") return "Обзор";
  const match = flatNav.find((n) => n.to !== "/" && pathname.startsWith(n.to));
  return match?.label ?? "Mara OS";
};
