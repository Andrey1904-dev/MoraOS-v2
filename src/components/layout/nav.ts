import {
  BarChart3,
  Clapperboard,
  Factory,
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
  { label: "Command", items: [{ label: "Overview", to: "/", icon: LayoutDashboard }] },
  {
    label: "Audience",
    items: [
      { label: "Fans", to: "/fans", icon: Users },
      { label: "Conversations", to: "/conversations", icon: MessageSquare },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Content", to: "/content", icon: Images },
      { label: "Content Factory", to: "/content-factory", icon: Factory },
      { label: "Episodes", to: "/episodes", icon: Clapperboard },
      { label: "Assets", to: "/assets", icon: FolderOpen },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Offers", to: "/offers", icon: Tag },
      { label: "Revenue", to: "/revenue", icon: Wallet },
      { label: "Analytics", to: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "AI Studio", to: "/ai", icon: Sparkles },
      { label: "Automations", to: "/automations", icon: Workflow },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Tasks", to: "/tasks", icon: ListChecks },
      { label: "Settings", to: "/settings", icon: SettingsIcon },
    ],
  },
];

export const flatNav = navGroups.flatMap((g) => g.items);

export const pageTitle = (pathname: string) => {
  if (pathname === "/") return "Overview";
  const match = flatNav.find((n) => n.to !== "/" && pathname.startsWith(n.to));
  return match?.label ?? "Mara OS";
};
