import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  Download,
  CloudUpload,
  Loader2,
  RefreshCw,
  Upload,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocxPreview } from "@/components/report-preview/docx-preview";
import type { Client } from "@shared/schema";

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function get14DayWindow() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  return { start: toYMD(start), end: toYMD(end) };
}

function formatWindowLabel(start: string, end: string): string {
  const fmt = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function parseCSV(text: string): { headers: string[]; data: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], data: [] };
  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { result.push(cur); cur = ""; }
      else { cur += ch; }
    }
    result.push(cur);
    return result.map(s => s.trim().replace(/^"|"$/g, ""));
  };
  const headers = splitLine(lines[0]);
  const data = lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, data };
}

export default function BiweeklyPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<"7" | "14" | "30" | "custom">("14");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [preparedBy, setPreparedBy] = useState("JAY HALL");
  const [sfOpen, setSfOpen] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [sfUploading, setSfUploading] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: sfReports = [], refetch: refetchSf } = useQuery<any[]>({
    queryKey: ["/api/clients", clientId, "sf-reports"],
    queryFn: async () => {
      if (!clientId) return [];
      const res = await fetch(`/api/clients/${clientId}/sf-reports`);
      return res.json();
    },
    enabled: !!clientId,
  });

  function getDateRange(): { startDate: string; endDate: string } {
    if (datePreset === "custom" && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const days = datePreset === "7" ? 7 : datePreset === "30" ? 30 : 14;
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return { startDate: toYMD(start), endDate: toYMD(end) };
  }

  const { startDate, endDate } = getDateRange();
  const windowLabel =
    datePreset === "custom" && customStart && customEnd
      ? formatWindowLabel(customStart, customEnd)
      : formatWindowLabel(startDate, endDate);

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client first");
      const range = getDateRange();
      const res = await apiRequest("POST", "/api/reports/biweekly/generate", {
        clientId: Number(clientId),
        startDate: range.startDate,
        endDate: range.endDate,
        preparedBy: preparedBy || "JAY HALL",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      toast({ title: "Report generated", description: "Preview ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const downloadDocxMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Generate report first");
      const res = await apiRequest("POST", "/api/reports/biweekly/docx", { json: report, edits });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "biweekly_report.docx";
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
      const res = await apiRequest("POST", "/api/reports/biweekly/upload-to-drive", { json: report, edits });
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

  async function handleSfUpload(files: FileList | File[]) {
    if (!clientId || !files || files.length === 0) return;
    setSfUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;
    const errors: string[] = [];
    try {
      for (const file of fileArray) {
        try {
          const text = await file.text();
          const { headers, data } = parseCSV(text);
          if (headers.length === 0) throw new Error("CSV appears empty or unreadable.");
          const reportDate = new Date().toISOString().slice(0, 10);
          await apiRequest("POST", `/api/clients/${clientId}/sf-reports`, {
            filename: file.name,
            reportDate,
            headers,
            data,
            rowCount: data.length,
          });
          successCount++;
        } catch (err: any) {
          const msg = err?.message || "Unknown error";
          const hint = file.size > 40 * 1024 * 1024 ? " (file may be too large)" : "";
          errors.push(`${file.name}: ${msg}${hint}`);
        }
      }
      await refetchSf();
      if (successCount > 0) {
        toast({
          title: successCount === 1 ? "Crawl uploaded" : `${successCount} crawls uploaded`,
          description: errors.length > 0 ? `${errors.length} file(s) failed: ${errors.join("; ")}` : undefined,
        });
      }
      if (errors.length > 0 && successCount === 0) {
        toast({ title: "Upload failed", description: errors.join(" | "), variant: "destructive" });
      }
    } finally {
      setSfUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteSfReport(id: number) {
    try {
      await apiRequest("DELETE", `/api/sf-reports/${id}`, undefined);
      await refetchSf();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  function handleEdit(key: string, value: string) {
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  const displayedSfReports = (sfReports as any[]).slice(0, 10);

  return (
    <div className="flex h-full min-h-0" data-testid="biweekly-page">
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Bi-Weekly Report</h1>
              <p className="text-xs text-muted-foreground">Live data · click to edit</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setReport(null); }}>
              <SelectTrigger data-testid="select-client">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {(clients as Client[]).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Window</Label>
            <div className="flex gap-1">
              {(["7", "14", "30"] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDatePreset(d)}
                  className={`flex-1 text-xs py-1 rounded border transition-colors ${
                    datePreset === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                  data-testid={`preset-${d}d`}
                >
                  {d}d
                </button>
              ))}
              <button
                onClick={() => setDatePreset("custom")}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  datePreset === "custom"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted"
                }`}
                data-testid="preset-custom"
              >
                Custom
              </button>
            </div>
            {datePreset === "custom" && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5 items-center">
                  <label className="text-[10px] text-muted-foreground w-8 shrink-0">From</label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="text-xs h-7"
                    data-testid="input-custom-start"
                  />
                </div>
                <div className="flex gap-1.5 items-center">
                  <label className="text-[10px] text-muted-foreground w-8 shrink-0">To</label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="text-xs h-7"
                    data-testid="input-custom-end"
                  />
                </div>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground bg-muted rounded px-2 py-1 font-mono">
              {windowLabel}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prepared by</Label>
            <Input
              placeholder="e.g. JAY HALL"
              value={preparedBy}
              onChange={e => setPreparedBy(e.target.value)}
              className="text-sm"
              data-testid="input-prepared-by"
            />
          </div>

          <div className="space-y-1.5">
            <button
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-full hover:text-foreground transition-colors"
              onClick={() => setSfOpen(o => !o)}
              data-testid="toggle-sf-section"
            >
              {sfOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Screaming Frog
              {displayedSfReports.length > 0 && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 normal-case tracking-normal font-medium">
                  {displayedSfReports.length} crawl{displayedSfReports.length !== 1 ? "s" : ""}
                </span>
              )}
            </button>

            {sfOpen && (
              <div className="space-y-2">
                {!clientId && (
                  <p className="text-[10px] text-muted-foreground">Select a client first.</p>
                )}
                {clientId && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleSfUpload(e.target.files);
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sfUploading}
                      data-testid="button-sf-upload"
                    >
                      {sfUploading ? (
                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload className="w-3 h-3 mr-1.5" /> Upload CSV</>
                      )}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      Upload one or more Screaming Frog CSVs. Up to 10 crawls stored per client.
                    </p>
                    {displayedSfReports.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">No crawls uploaded yet.</p>
                    )}
                    {displayedSfReports.map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-1.5 p-1.5 rounded border bg-background text-[10px]"
                        data-testid={`sf-report-${r.id}`}
                      >
                        <FileText className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{r.filename}</p>
                          <p className="text-muted-foreground">{r.reportDate} · {r.rowCount?.toLocaleString()} rows</p>
                        </div>
                        <button
                          onClick={() => deleteSfReport(r.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                          data-testid={`delete-sf-${r.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

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
              "Generate Report"
            )}
          </Button>
        </div>

        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => downloadDocxMut.mutate()}
              disabled={downloadDocxMut.isPending}
              data-testid="button-download-docx"
            >
              {downloadDocxMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download DOCX
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

      <div className="flex-1 min-w-0 overflow-auto">
        {!report && !generateMut.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">Bi-Weekly Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client, choose your date window, and click Generate. The report will appear here — click any text to edit before downloading.
              </p>
            </div>
          </div>
        )}

        {generateMut.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Fetching live data and building report…</p>
            </div>
          </div>
        )}

        {report && !generateMut.isPending && (
          <DocxPreview
            clientName={edits["client_name"] ?? report.client_name}
            reportTitle={edits["report_title"] ?? report.report_title}
            date={edits["report_date"] ?? report.date}
            reportingWindow={report.reportingWindow}
            preparedBy={edits["preparedBy"] ?? report.preparedBy}
            sections={report.sections ?? []}
            edits={edits}
            onEdit={handleEdit}
            bwTheme
          />
        )}
      </div>
    </div>
  );
}
