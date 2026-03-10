import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { SavedReport } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReportSaveSelectorProps {
  clientId: number | null | undefined;
  reportType: string;
  onLoad: (reportData: any, edits: Record<string, string>, savedId: number, savedReport?: SavedReport) => void;
}

export function ReportSaveSelector({ clientId, reportType, onLoad }: ReportSaveSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const { toast } = useToast();

  const { data: savedReports = [], isLoading } = useQuery<SavedReport[]>({
    queryKey: [`/api/saved-reports?clientId=${clientId}&reportType=${encodeURIComponent(reportType)}`],
    enabled: !!clientId,
  });

  const handleLoad = async () => {
    if (!selectedId) return;
    setIsLoadingFull(true);
    try {
      const res = await apiRequest("GET", `/api/saved-reports/${selectedId}`);
      if (!res.ok) throw new Error("Failed to load report");
      const report: SavedReport = await res.json();
      onLoad(
        report.generatedReportJson,
        (report.editsJson as Record<string, string>) ?? {},
        report.id,
        report
      );
    } catch (err: any) {
      toast({ title: "Could not load report", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setIsLoadingFull(false);
    }
  };

  if (!clientId) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedId}
        onValueChange={setSelectedId}
        disabled={isLoading || savedReports.length === 0}
      >
        <SelectTrigger
          data-testid="select-saved-report"
          className="h-8 text-xs w-56"
        >
          <SelectValue
            placeholder={
              isLoading
                ? "Loading..."
                : savedReports.length === 0
                ? "No saved reports"
                : "Load saved report..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          {savedReports.map((r) => (
            <SelectItem key={r.id} value={String(r.id)}>
              {r.reportName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        data-testid="btn-load-saved-report"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={handleLoad}
        disabled={!selectedId || isLoadingFull}
      >
        {isLoadingFull ? <Loader2 className="w-3 h-3 animate-spin" /> : "Load"}
      </Button>
    </div>
  );
}
