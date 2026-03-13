import { Link } from "wouter";
import {
  FileText,
  Monitor,
  ArrowRight,
  Lock,
  ChevronRight,
  Users,
  User,
} from "lucide-react";
import { listReportTypes, familyColor, familyLabel, type ReportTypeDefinition } from "@/lib/reportFamilyUtils";

const ALL_REPORT_TYPES = listReportTypes();

function ReportRow({ rt }: { rt: ReportTypeDefinition }) {
  const color = familyColor(rt.family);
  const isClickable = rt.implemented && rt.route !== null;
  const isInternal = rt.audience === "internal";

  const inner = (
    <div
      className={[
        "group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 transition-all duration-150",
        isClickable
          ? "border-border hover:border-[#1B3A6B]/40 dark:hover:border-[#1B3A6B]/60 hover:shadow-sm cursor-pointer"
          : "border-border opacity-55 cursor-default",
      ].join(" ")}
      data-testid={`card-report-type-${rt.id.replace("_", "-")}`}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
        style={{ backgroundColor: `${color}12`, border: `1.5px solid ${color}25` }}
      >
        {rt.family === "slideshow" ? (
          <Monitor className="w-5 h-5" style={{ color }} />
        ) : (
          <FileText className="w-5 h-5" style={{ color }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{rt.displayName}</span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
            style={{ backgroundColor: `${color}12`, color }}
          >
            {familyLabel(rt.family)}
          </span>
          {isInternal && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <User className="w-2.5 h-2.5" />
              Internal
            </span>
          )}
          {!rt.implemented && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide bg-muted text-muted-foreground shrink-0">
              <Lock className="w-2.5 h-2.5" />
              Phase 2
            </span>
          )}
          {rt.derivedFrom && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              ← from QBS
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{rt.description}</p>
      </div>

      {isClickable ? (
        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      ) : (
        <div className="w-4 shrink-0" />
      )}
    </div>
  );

  if (isClickable) {
    return (
      <Link href={`/workflow?type=${rt.id}`} data-testid={`link-report-type-${rt.id.replace("_", "-")}`}>
        {inner}
      </Link>
    );
  }

  return inner;
}

export default function PrepareReportPage() {
  const slideshowReports = ALL_REPORT_TYPES.filter(r => r.family === "slideshow");
  const documentReports = ALL_REPORT_TYPES.filter(r => r.family === "document");

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-prepare-report">
      <div className="flex-1 px-6 py-6 max-w-[960px] mx-auto w-full">

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/command-center" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Command Center
            </Link>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#1B3A6B]" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Deck Reports
              </p>
              <span className="text-[10px] text-muted-foreground ml-1">· Slideshow export</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {slideshowReports.map(rt => <ReportRow key={rt.id} rt={rt} />)}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#C0392B]" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Document Reports
              </p>
              <span className="text-[10px] text-muted-foreground ml-1">· Document export</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {documentReports.map(rt => <ReportRow key={rt.id} rt={rt} />)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <User className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              <span className="font-semibold">QBS</span> is an internal-only report used to plan the QBR.
              The <span className="font-semibold">QBR</span> deck is built from QBS content
              plus ADR and Director of SEO adjustments before the client presentation.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
