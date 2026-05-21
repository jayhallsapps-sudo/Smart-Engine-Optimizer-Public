import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText } from "lucide-react";

interface PastReportsListProps {
  clientId: string;
  onSelectReport: (savedReportId: number, reportData: any) => void;
}

export function PastReportsList({ clientId, onSelectReport }: PastReportsListProps) {
  const { data: reports, isLoading } = useQuery<any[]>({
    queryKey: ["/api/saved-reports", Number(clientId), "quarterly_content_roadmap"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/saved-reports?clientId=${clientId}&reportType=quarterly_content_roadmap`,
      );
      return res.json();
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading past reports…
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground py-2">
        No past scans for this client.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        Past Reports
      </p>
      {reports.map((r) => {
        const json = r.generatedReportJson as any;
        const findingCount = json?.categories?.technical_seo?.findings?.length ?? 0;
        return (
          <button
            key={r.id}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-2"
            onClick={() => onSelectReport(r.id, json)}
            data-testid={`past-report-${r.id}`}
          >
            <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium truncate">{r.reportName}</p>
              <p className="text-[9px] text-muted-foreground">
                {new Date(r.generatedOn).toLocaleDateString()} • {findingCount} findings
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
