import { Link } from "wouter";
import smarteoIconPath from "@assets/SmartEO-Icon_1773606395230.png";
import {
  FileText,
  History,
  BarChart3,
  Zap,
  Plug,
  CheckSquare,
  BookOpen,
  TrendingUp,
  Newspaper,
  ArrowRight,
  Lock,
  Sparkles,
  Search,
} from "lucide-react";

interface ModuleCard {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  href: string | null;
  status: "live" | "placeholder";
  accentColor: string;
  group: "primary" | "secondary";
}

const MODULES: ModuleCard[] = [
  {
    id: "aca",
    icon: Sparkles,
    label: "/ACA/",
    description: "Ask Claude Anything about clients, integrations, data, and get live data pulls.",
    href: "/aca",
    status: "live",
    accentColor: "#D97706",
    group: "primary",
  },
  {
    id: "prepare",
    icon: FileText,
    label: "Prepare a Report",
    description: "Generate any report type for a client — Bi-Weekly, Monthly, QBR, QBS, or Mid-Strategy.",
    href: "/prepare",
    status: "live",
    accentColor: "#C0392B",
    group: "primary",
  },
  {
    id: "past-reports",
    icon: History,
    label: "Past Reports",
    description: "Browse, load, edit, and export previously generated reports.",
    href: "/saved-reports",
    status: "live",
    accentColor: "#7C3AED",
    group: "primary",
  },
  {
    id: "client-signals",
    icon: BarChart3,
    label: "Client Info",
    description: "Live cross-client performance metrics from GSC, GA4, CallRail, and more.",
    href: "/dashboard",
    status: "live",
    accentColor: "#059669",
    group: "primary",
  },
  {
    id: "clients",
    icon: Zap,
    label: "Client Dashboards",
    description: "Manage client configurations, connected data sources, and account details.",
    href: "/clients",
    status: "live",
    accentColor: "#0369A1",
    group: "primary",
  },
  {
    id: "integrations",
    icon: Plug,
    label: "Integrations",
    description: "Configure API credentials, OAuth connections, and data source settings.",
    href: "/integrations",
    status: "live",
    accentColor: "#0891B2",
    group: "primary",
  },
  {
    id: "discoverability",
    icon: Search,
    label: "Discoverability Tool",
    description: "Structured keyword research aligned to business goals, search intent, and conversion outcomes.",
    href: "/discoverability",
    status: "live",
    accentColor: "#1B3A6B",
    group: "primary",
  },
  {
    id: "tasks",
    icon: CheckSquare,
    label: "Tasks",
    description: "Track deliverables, deadlines, and account manager to-dos across all clients.",
    href: null,
    status: "placeholder",
    accentColor: "#6B7280",
    group: "secondary",
  },
  {
    id: "knowledge",
    icon: BookOpen,
    label: "Knowledge",
    description: "Webserv SOPs, playbooks, behavioral health glossary, and strategy references.",
    href: null,
    status: "placeholder",
    accentColor: "#6B7280",
    group: "secondary",
  },
  {
    id: "forecasting",
    icon: TrendingUp,
    label: "Forecasting",
    description: "Organic traffic and conversion projections based on historical trends.",
    href: null,
    status: "placeholder",
    accentColor: "#6B7280",
    group: "secondary",
  },
  {
    id: "research",
    icon: Newspaper,
    label: "Research Updates",
    description: "Algorithm changes, industry news, and competitive intelligence feeds.",
    href: null,
    status: "placeholder",
    accentColor: "#6B7280",
    group: "secondary",
  },
];

function ModuleCardItem({ mod }: { mod: ModuleCard }) {
  const Icon = mod.icon;
  const isLive = mod.status === "live";

  const inner = (
    <div
      className={[
        "group relative flex flex-col h-full rounded-xl border bg-card p-5 transition-all duration-150",
        isLive
          ? "border-border hover:border-[#1B3A6B]/40 dark:hover:border-[#1B3A6B]/60 hover:shadow-md cursor-pointer"
          : "border-border opacity-60 cursor-default select-none",
      ].join(" ")}
      data-testid={`module-card-${mod.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0"
          style={{
            backgroundColor: isLive ? `${mod.accentColor}15` : "#6B728015",
            border: `1.5px solid ${isLive ? `${mod.accentColor}30` : "#6B728030"}`,
          }}
        >
          <Icon
            className="w-5 h-5"
            style={{ color: isLive ? mod.accentColor : "#9CA3AF" }}
          />
        </div>

        {isLive ? (
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
        ) : (
          <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 shrink-0">
            <Lock className="w-2.5 h-2.5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Phase 2</span>
          </div>
        )}
      </div>

      <div className="flex-1">
        <h3
          className="text-sm font-semibold mb-1.5 leading-snug"
          style={{ color: isLive ? mod.accentColor : undefined }}
        >
          {mod.label}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
      </div>

      {isLive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: mod.accentColor }}
        />
      )}
    </div>
  );

  if (isLive && mod.href) {
    return (
      <Link href={mod.href} className="block h-full">
        {inner}
      </Link>
    );
  }

  return inner;
}

export default function CommandCenterPage() {
  const primaryModules = MODULES.filter(m => m.group === "primary");
  const secondaryModules = MODULES.filter(m => m.group === "secondary");

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-command-center">
      <div className="flex-1 px-6 py-6 max-w-[1200px] mx-auto w-full">

        <div className="mb-7">
          <div className="flex items-center gap-3 mb-1">
            <img src={smarteoIconPath} alt="SmartEO" className="w-8 h-8 rounded-lg shrink-0" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">SmartEO Command Center</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">
            Your central workspace for SEO reporting, client intelligence, and strategy.
          </p>
        </div>

        <div className="mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Core Modules</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="grid-primary-modules">
            {primaryModules.map(mod => (
              <ModuleCardItem key={mod.id} mod={mod} />
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Coming in Phase 2
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="grid-secondary-modules">
            {secondaryModules.map(mod => (
              <ModuleCardItem key={mod.id} mod={mod} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
