import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, Download, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/report-preview/pptx-preview";
import type { Client } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2];

function currentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

export default function QbrFullPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [quarter, setQuarter] = useState(String(currentQuarter()));
  const [year, setYear] = useState(String(THIS_YEAR));
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const reportSave = useReportSave({
    reportType: "qbr_full",
    clientId: clientId ? Number(clientId) : null,
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client first");
      const res = await apiRequest("POST", "/api/reports/qbr-full/generate", {
        clientId: Number(clientId),
        quarter: Number(quarter),
        year: Number(year),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      reportSave.setSavedReportId(null);
      const periodLabel = `Q${quarter} ${year}`;
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta: { reportPeriodLabel: periodLabel, planningQuarter: Number(quarter), planningYear: Number(year) } };
      reportSave.save(data, {}, { reportPeriodLabel: periodLabel, planningQuarter: Number(quarter), planningYear: Number(year) });
      toast({ title: "QBR generated", description: "Slides ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const downloadMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Generate report first");
      const res = await apiRequest("POST", "/api/reports/qbr-full/pptx", { json: report, edits });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "qbr_report.pptx";
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    },
  });

  async function uploadToDrive() {
    if (!report) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/reports/qbr-full/upload-to-drive", { json: report });
      const data = await res.json();
      if (data.webViewLink) {
        toast({
          title: "Saved to Drive",
          description: (
            <a href={data.webViewLink} target="_blank" rel="noopener noreferrer" className="underline">
              Open in Google Drive
            </a>
          ) as any,
        });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  function handleEdit(key: string, value: string) {
    setEdits(prev => {
      const next = { ...prev, [key]: value };
      reportSave.pendingPayloadRef.current = {
        reportData: report,
        edits: next,
        meta: { reportPeriodLabel: `Q${quarter} ${year}`, planningQuarter: Number(quarter), planningYear: Number(year) },
      };
      return next;
    });
    reportSave.markDirty();
  }

  return (
    <div className="flex h-full min-h-0" data-testid="qbr-full-page">
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">QBR Full Report</h1>
              <p className="text-xs text-muted-foreground">Quarterly Business Review Deck (PPTX)</p>
            </div>
          </div>
          {clientId && <div className="mt-1"><SaveStatusIndicator status={reportSave.saveStatus} /></div>}
        </div>

        <div className="flex-1 p-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-client">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {(clients as Client[]).map(c => (
                  <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger data-testid="select-quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
                <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                <SelectItem value="4">Q4 (Oct–Dec)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {clientId && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="qbr_full"
                onLoad={(data, savedEdits, id) => {
                  setReport(data);
                  setEdits(savedEdits);
                  reportSave.setSavedReportId(id);
                  reportSave.pendingPayloadRef.current = { reportData: data, edits: savedEdits, meta: { reportPeriodLabel: `Q${quarter} ${year}`, planningQuarter: Number(quarter), planningYear: Number(year) } };
                  toast({ title: "Report loaded" });
                }}
              />
            </div>
          )}

          <Separator />

          <Button
            className="w-full"
            onClick={() => generateMut.mutate()}
            disabled={!clientId || generateMut.isPending}
            data-testid="button-generate"
          >
            {generateMut.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : report ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              "Generate QBR"
            )}
          </Button>

          {report && (
            <div className="text-[10px] text-muted-foreground text-center">
              {(report.slides ?? []).length} slides generated — {report.quarter_label}
            </div>
          )}
        </div>

        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => downloadMut.mutate()}
              disabled={downloadMut.isPending}
              data-testid="button-download-pptx"
            >
              {downloadMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download PPTX
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={uploadToDrive}
              disabled={isUploading}
              data-testid="button-save-drive"
            >
              {isUploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CloudUpload className="w-3 h-3 mr-1.5" />}
              Save to Drive
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {!report && !generateMut.isPending && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">QBR Full Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client and quarter, then click Generate to build your QBR deck with live GSC, GA4, SEMrush, and call tracking data. Navigate slides with the panel on the right.
              </p>
            </div>
          </div>
        )}

        {generateMut.isPending && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Fetching QoQ data, rankings, and building QBR slides…</p>
            </div>
          </div>
        )}

        {report && !generateMut.isPending && (
          <PptxPreview
            slides={report.slides ?? []}
            edits={edits}
            onEdit={handleEdit}
          />
        )}
      </div>
    </div>
  );
}
