import { Link } from "wouter";
import { BookOpen, Layers, Shield, Zap, ChevronRight } from "lucide-react";
import { loadProfile } from "@/lib/userProfile";

const CARDS = [
  {
    href: "/admin/config",
    icon: Layers,
    title: "Report Config",
    description:
      "Inspect report type definitions, family labels, lifecycle order, and field mapping rules that drive how SmartEO structures every report.",
    badge: "View only",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  {
    href: "/admin/guidance",
    icon: BookOpen,
    title: "Guidance Library",
    description:
      "Create and manage internal guidance entries tagged by report type and workflow area. These notes shape how AMs approach each report.",
    badge: "Editable",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    href: "/clients",
    icon: Shield,
    title: "Client Management",
    description:
      "Add, edit, and configure client records — GSC properties, GA4 IDs, call tracking accounts, Airtable bases, and more.",
    badge: "Editable",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    href: "/integrations",
    icon: Zap,
    title: "Integrations",
    description:
      "Manage API credentials for GSC, GA4, CallRail, Ahrefs, SEMrush, Airtable, and other connected data sources.",
    badge: "Editable",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
];

export default function AdminPage() {
  const profile = loadProfile();

  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <div className="border-b border-border bg-background px-8 py-6">
        <div className="max-w-4xl">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            SmartEO · {profile.role}
          </p>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Governance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Inspect and manage the report structure, guidance, and configuration
            that shapes how SmartEO behaves — without touching code.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="px-8 py-8 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARDS.map(({ href, icon: Icon, title, description, badge, badgeColor }) => (
            <Link key={href} href={href}>
              <div
                className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
                data-testid={`card-admin-${title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-foreground/70" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                      <span
                        className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border mt-0.5 ${badgeColor}`}
                      >
                        {badge}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-border bg-muted/30 px-5 py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground/70">Phase 1 admin layer.</span>{" "}
            Full WYSIWYG template editing, source-routing management, and the final rules
            engine are deferred to later phases. What you see here is the first controlled
            layer for inspecting and editing SmartEO governance without touching code.
          </p>
        </div>
      </div>
    </div>
  );
}
