import { Link } from "wouter";
import {
  CalendarDays,
  BarChart3,
  TrendingUp,
  Sparkles,
  Target,
  ArrowRight,
  FileText,
} from "lucide-react";

interface ReportType {
  id: string;
  icon: React.ElementType;
  label: string;
  cadence: string;
  description: string;
  family: "Slideshow" | "Document";
  familyColor: string;
  href: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id: "mid-strategy",
    icon: Target,
    label: "Mid-Strategy SEO Report",
    cadence: "Mid-engagement",
    description: "Deep-dive audit covering competitor benchmarks, URL pruning decisions, IA architecture, and long-term keyword strategy.",
    family: "Slideshow",
    familyColor: "#1B3A6B",
    href: "/mid-strategy",
  },
  {
    id: "qbr-prep",
    icon: Sparkles,
    label: "Quarterly Business Snapshot",
    cadence: "Pre-QBR",
    description: "Internal-facing QBS preparation: wins, losses, opportunities, and strategic narrative for the upcoming quarter.",
    family: "Document",
    familyColor: "#C0392B",
    href: "/qbr-prep",
  },
  {
    id: "qbr",
    icon: TrendingUp,
    label: "QBR Full",
    cadence: "Quarterly",
    description: "Client-facing Quarterly Business Review slide deck with performance data, wins, strategy, and next-quarter planning.",
    family: "Slideshow",
    familyColor: "#1B3A6B",
    href: "/qbr",
  },
  {
    id: "monthly",
    icon: BarChart3,
    label: "Monthly Report",
    cadence: "Monthly",
    description: "Comprehensive monthly performance review with QTD data, trendlines, content output, and technical health.",
    family: "Slideshow",
    familyColor: "#1B3A6B",
    href: "/monthly",
  },
  {
    id: "biweekly",
    icon: CalendarDays,
    label: "Bi-Weekly Report",
    cadence: "Bi-weekly",
    description: "Pulse check with key metrics and work log summary for bi-weekly client check-in meetings.",
    family: "Document",
    familyColor: "#C0392B",
    href: "/biweekly",
  },
];

export default function PrepareReportPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-prepare-report">
      <div className="flex-1 px-6 py-6 max-w-[900px] mx-auto w-full">

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/command-center" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Command Center
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-foreground font-medium">Prepare a Report</span>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#C0392B] shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Prepare a Report</h1>
              <p className="text-sm text-muted-foreground">Select a report type to get started.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3" data-testid="list-report-types">
          {REPORT_TYPES.map(rt => {
            const Icon = rt.icon;
            return (
              <Link key={rt.id} href={rt.href} data-testid={`card-report-type-${rt.id}`}>
                <div className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:border-[#1B3A6B]/40 dark:hover:border-[#1B3A6B]/60 hover:shadow-sm transition-all duration-150 cursor-pointer">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
                    style={{ backgroundColor: `${rt.familyColor}12`, border: `1.5px solid ${rt.familyColor}25` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: rt.familyColor }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground">{rt.label}</span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                        style={{ backgroundColor: `${rt.familyColor}12`, color: rt.familyColor }}
                      >
                        {rt.family}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">{rt.cadence}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground truncate">{rt.description}</span>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}
