import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RotateCcw } from "lucide-react";
import { FindingCard } from "./FindingCard";
interface FindingsViewProps {
  report: any;
  clientId: number;
  savedReportId: number;
  onRunNewScan: () => void;
  onPushAsana: (finding: any) => void;
}

type QcrCategory = "technical_seo" | "seo_content" | "local_seo" | "seo_strategy";

const CATEGORY_LABELS: Record<QcrCategory, string> = {
  technical_seo: "Technical SEO",
  seo_content: "SEO Content",
  local_seo: "Local SEO",
  seo_strategy: "SEO Strategy",
};

export function FindingsView({ report, clientId, savedReportId, onRunNewScan, onPushAsana }: FindingsViewProps) {
  const [activeTab, setActiveTab] = useState<QcrCategory>("technical_seo");
  const [showSuppressed, setShowSuppressed] = useState(false);

  const totalFindings = Object.values(report.categories as Record<QcrCategory, { findings: any[] }>).reduce(
    (sum, cat) => sum + (cat?.findings?.length ?? 0),
    0,
  );

  const activeFindings = report.categories[activeTab]?.findings ?? [];
  const visible = activeFindings.filter((f: any) => showSuppressed || !f.suppressed);
  const critical = visible.filter((f: any) => f.severity === "critical");
  const medium = visible.filter((f: any) => f.severity === "medium");
  const low = visible.filter((f: any) => f.severity === "low");

  async function downloadMarkdown() {
    const res = await fetch(`/api/qcr/reports/${savedReportId}/markdown`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cd = res.headers.get("content-disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match?.[1] ?? "report.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-card px-5 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{report.clientName}</h2>
          <p className="text-[10px] text-muted-foreground">
            {new Date(report.scanCompletedAt).toLocaleDateString()} • {report.urlsScanned} URLs scanned
            • {totalFindings} findings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={downloadMarkdown} data-testid="button-download-md">
            <Download className="w-3 h-3 mr-1" />
            Download .md
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={onRunNewScan} data-testid="button-run-new-scan">
            <RotateCcw className="w-3 h-3 mr-1" />
            Run new scan
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b bg-card px-5 flex gap-1 py-1">
        {(Object.keys(CATEGORY_LABELS) as QcrCategory[]).map((cat) => {
          const count = report.categories[cat]?.findings?.length ?? 0;
          return (
            <button
              key={cat}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                activeTab === cat
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              onClick={() => setActiveTab(cat)}
              data-testid={`tab-${cat}`}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {critical.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Critical ({critical.length})
            </h3>
            {critical.map((f: any) => (
              <FindingCard key={f.id} finding={f} onPushAsana={onPushAsana} />
            ))}
          </div>
        )}

        {medium.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Medium ({medium.length})
            </h3>
            {medium.map((f: any) => (
              <FindingCard key={f.id} finding={f} onPushAsana={onPushAsana} />
            ))}
          </div>
        )}

        {low.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Low ({low.length})
            </h3>
            {low.map((f: any) => (
              <FindingCard key={f.id} finding={f} onPushAsana={onPushAsana} />
            ))}
          </div>
        )}

        {visible.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-12">
            No findings in this category.
          </div>
        )}

        {/* Show suppressed toggle */}
        {activeFindings.some((f: any) => f.suppressed) && (
          <button
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
            onClick={() => setShowSuppressed(!showSuppressed)}
          >
            {showSuppressed ? "Hide suppressed" : "Show suppressed"}
          </button>
        )}
      </div>
    </div>
  );
}
