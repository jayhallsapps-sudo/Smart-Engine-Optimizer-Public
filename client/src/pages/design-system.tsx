import { useState } from "react";
import ThemePage from "./theme";
import BiweeklyWYSIWYG from "@/components/biweekly-wysiwyg";
import {
  Palette,
  LayoutTemplate,
  Lock,
  ChevronRight,
  FileText,
  BarChart3,
  BookOpen,
  Presentation,
  ClipboardList,
  TrendingUp,
  CalendarRange,
  FlaskConical,
} from "lucide-react";

// ─── Report type definitions ───────────────────────────────────────────────────

interface ReportTypeDef {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  output: string;
  editable: boolean;
}

const REPORT_TYPES: ReportTypeDef[] = [
  {
    id: "biweekly",
    label: "Bi-Weekly SEO Report",
    description: "Recurring performance snapshot: rankings, traffic, work log, and next steps.",
    icon: CalendarRange,
    output: "Google Doc",
    editable: true,
  },
  {
    id: "monthly",
    label: "Monthly SEO Report",
    description: "In-depth monthly analysis of organic performance, content, and technical health.",
    icon: BarChart3,
    output: "Google Doc",
    editable: false,
  },
  {
    id: "qbr",
    label: "QBR",
    description: "Quarterly Business Review — strategic performance and 90-day roadmap.",
    icon: TrendingUp,
    output: "Google Slides",
    editable: false,
  },
  {
    id: "qbs",
    label: "QBS",
    description: "Quarterly Business Strategy — forward-looking planning deck.",
    icon: Presentation,
    output: "Google Slides",
    editable: false,
  },
  {
    id: "kickoff",
    label: "Kickoff Deck",
    description: "Client onboarding presentation — strategy, scope, and 30-60-90 day plan.",
    icon: FlaskConical,
    output: "Google Slides",
    editable: false,
  },
  {
    id: "mid-strategy",
    label: "Mid-Strategy Deck",
    description: "Mid-engagement strategy review and course correction presentation.",
    icon: BookOpen,
    output: "Google Slides",
    editable: false,
  },
  {
    id: "launch",
    label: "Launch Deck",
    description: "Website or campaign launch readiness and performance baseline.",
    icon: Presentation,
    output: "Google Slides",
    editable: false,
  },
  {
    id: "quarterly-content",
    label: "Quarterly Content Roadmap",
    description: "Structured content plan aligned to search intent and business goals.",
    icon: ClipboardList,
    output: "Google Sheets",
    editable: false,
  },
  {
    id: "eval-sheets",
    label: "Evaluation Sheets",
    description: "Structured client and keyword evaluation scoring templates.",
    icon: FileText,
    output: "Google Sheets",
    editable: false,
  },
];

// ─── Report type card ──────────────────────────────────────────────────────────

function ReportTypeCard({
  report,
  onOpen,
}: {
  report: ReportTypeDef;
  onOpen: () => void;
}) {
  const Icon = report.icon;

  if (!report.editable) {
    return (
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg border bg-muted/30 opacity-60 cursor-not-allowed select-none">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground">{report.label}</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border">
              <Lock className="w-2.5 h-2.5" />
              Coming Next
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{report.description}</p>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">{report.output}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg border bg-background hover:bg-muted/40 transition-all text-left group hover:border-[#C0392B]/40 hover:shadow-sm"
      data-testid={`report-card-${report.id}`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: "#C0392B15", color: "#C0392B" }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground">{report.label}</span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: "#C0392B15", color: "#C0392B" }}
          >
            Editable
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{report.description}</p>
        <p className="text-[10px] mt-1 font-medium" style={{ color: "#C0392B" }}>{report.output}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" style={{ color: "#C0392B" }} />
    </button>
  );
}

// ─── Templates section ─────────────────────────────────────────────────────────

function TemplatesSection() {
  const [openEditor, setOpenEditor] = useState<string | null>(null);

  if (openEditor === "biweekly") {
    return <BiweeklyWYSIWYG onBack={() => setOpenEditor(null)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b">
        <h2 className="text-base font-semibold text-foreground">Report Templates</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Templates define page layout and block structure for each report type. Visual styling is controlled by Theme.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-2xl space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            All Report Types
          </p>
          {REPORT_TYPES.map(report => (
            <ReportTypeCard
              key={report.id}
              report={report}
              onOpen={() => {
                if (report.id === "biweekly") setOpenEditor("biweekly");
              }}
            />
          ))}
        </div>

        <div className="max-w-2xl mt-6 px-4 py-3 rounded-lg border border-dashed text-xs text-muted-foreground" style={{ borderColor: "#C0392B40" }}>
          <span className="font-medium" style={{ color: "#C0392B" }}>Template vs. Theme:</span>{" "}
          Templates control the <em>structure</em> of each report (which blocks appear and in what order).
          Colors, fonts, and visual styling are always controlled by Theme — never duplicated inside templates.
        </div>
      </div>
    </div>
  );
}

// ─── Design System page ────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [tab, setTab] = useState<"theme" | "templates">("theme");

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-design-system">
      {/* Header with tabs */}
      <div className="shrink-0 border-b bg-background">
        <div className="px-6 pt-4 pb-0 flex items-end gap-6">
          <div className="mb-3">
            <h1 className="text-lg font-bold text-foreground tracking-tight" data-testid="text-design-system-title">
              Design System
            </h1>
            <p className="text-xs text-muted-foreground">Universal report styling and layout controls</p>
          </div>

          {/* Tab bar */}
          <div className="flex items-end gap-0 ml-auto mb-0">
            <button
              onClick={() => setTab("theme")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "theme"
                  ? "border-[#C0392B] text-[#C0392B]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-main-theme"
            >
              <Palette className="w-4 h-4" />
              Theme
            </button>
            <button
              onClick={() => setTab("templates")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "templates"
                  ? "border-[#C0392B] text-[#C0392B]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-main-templates"
            >
              <LayoutTemplate className="w-4 h-4" />
              Templates
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "theme" && (
          <div className="h-full overflow-hidden" data-testid="theme-tab-content">
            <ThemePage />
          </div>
        )}
        {tab === "templates" && (
          <div className="h-full overflow-hidden" data-testid="templates-tab-content">
            <TemplatesSection />
          </div>
        )}
      </div>
    </div>
  );
}
