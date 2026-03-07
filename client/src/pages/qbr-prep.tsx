import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Download,
  Loader2,
  Bug,
  RefreshCw,
  CloudUpload,
  ExternalLink,
  Save,
  FileText,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QbrPrepPreview } from "@/components/report-preview/qbr-prep-preview";
import type { Client } from "@shared/schema";

interface SfReport {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
}

interface QuarterInfo {
  currentQ: number;
  analysisStart: string;
  analysisEnd: string;
  planningQ: number;
  planningYear: number;
  analysisWindowLabel: string;
  planningQuarterLabel: string;
}

function inferQuarterClient(dateStr: string): QuarterInfo {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const currentQ = Math.ceil(month / 3);
  const qStarts = [0, 0, 3, 6, 9];
  const analysisStart = new Date(year, qStarts[currentQ], 1).toISOString().split("T")[0];
  const analysisEnd = dateStr;
  let planningQ = currentQ + 1;
  let planningYear = year;
  if (planningQ > 4) { planningQ = 1; planningYear = year + 1; }
  return {
    currentQ,
    analysisStart,
    analysisEnd,
    planningQ,
    planningYear,
    analysisWindowLabel: `Q${currentQ} ${year} (through ${analysisEnd})`,
    planningQuarterLabel: `Q${planningQ} ${planningYear}`,
  };
}

interface SavedReport {
  id: number;
  clientId: number;
  reportName: string;
  planningQuarter: number;
  planningYear: number;
  generatedOn: string;
  createdAt: string;
  updatedAt: string;
}

export default function QbrPrepPage() {
  const { toast } = useToast();
  const rqClient = useQueryClient();

  const [clientId, setClientId] = useState<string>("");
  const [generationDate, setGenerationDate] = useState(new Date().toISOString().split("T")[0]);
  const [sentiment, setSentiment] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [auditNotes, setAuditNotes] = useState("");
  const [sfActiveId, setSfActiveId] = useState<number | null>(null);
  const [sfUploading, setSfUploading] = useState(false);
  const sfFileInputRef = useRef<HTMLInputElement>(null);
  const [showAmInputs, setShowAmInputs] = useState(false);

  const [reportData, setReportData] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  const [showSavedReports, setShowSavedReports] = useState(false);

  const quarter = inferQuarterClient(generationDate);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: sfReports = [] } = useQuery<SfReport[]>({
    queryKey: ["/api/clients", clientId, "sf-reports"],
    enabled: !!clientId,
  });

  const { data: savedReports = [] } = useQuery<SavedReport[]>({
    queryKey: [`/api/reports/qbr-prep/saved?clientId=${clientId}`],
    enabled: !!clientId,
  });

  useEffect(() => {
    if (sfReports.length > 0 && !sfActiveId) setSfActiveId(sfReports[0].id);
    if (sfReports.length === 0) setSfActiveId(null);
  }, [sfReports]);

  useEffect(() => {
    setSfActiveId(null);
    setReportData(null);
    setEdits({});
    setSavedReportId(null);
  }, [clientId]);

  const hasSfCrawl = sfReports.length > 0;

  const handleSfUpload = async (file: File) => {
    if (!clientId) return;
    setSfUploading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("File appears empty");
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").replace(/^"|"$/g, "").trim(); });
        return obj;
      });
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/clients/${clientId}/sf-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate: today, filename: file.name, rowCount: rows.length, headers, data: rows }),
      });
      if (!res.ok) throw new Error("Upload failed");
      const created = await res.json();
      rqClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "sf-reports"] });
      if (created?.id) setSfActiveId(created.id);
      toast({ title: "Crawl uploaded", description: `${rows.length} rows from ${file.name}` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setSfUploading(false);
    }
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports/qbr-prep/generate-v2", {
        clientId: Number(clientId),
        generationDate,
        sentiment: sentiment || undefined,
        hypothesis: hypothesis || undefined,
        auditNotes: auditNotes || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setReportData(data.reportData);
      setEdits({});
      if (data.savedId) setSavedReportId(data.savedId);
      rqClient.invalidateQueries({ queryKey: [`/api/reports/qbr-prep/saved?clientId=${clientId}`] });
      toast({ title: "QBR Prep generated", description: "Preview ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: number; data: any; currentEdits: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/reports/qbr-prep/saved/${payload.id}`, {
        generatedReportJson: { ...payload.data, edits: payload.currentEdits },
        htmlSnapshot: null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report saved" });
      rqClient.invalidateQueries({ queryKey: [`/api/reports/qbr-prep/saved?clientId=${clientId}`] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const editsRef = useRef(edits);
  editsRef.current = edits;
  const reportDataRef = useRef(reportData);
  reportDataRef.current = reportData;
  const savedReportIdRef = useRef(savedReportId);
  savedReportIdRef.current = savedReportId;

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEdit = useCallback((key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }));
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const id = savedReportIdRef.current;
      const data = reportDataRef.current;
      if (id && data) {
        saveMutation.mutate({ id, data, currentEdits: { ...editsRef.current, [key]: value } });
      }
    }, 2000);
  }, []);

  const loadSavedReport = async (id: number) => {
    try {
      const res = await fetch(`/api/reports/qbr-prep/saved/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const json = data.generatedReportJson as any;
      if (json?.edits) {
        const { edits: savedEdits, ...rest } = json;
        setReportData(rest);
        setEdits(savedEdits);
      } else {
        setReportData(json);
        setEdits({});
      }
      setSavedReportId(id);
      toast({ title: "Report loaded" });
    } catch (err: any) {
      toast({ title: "Load failed", description: err.message, variant: "destructive" });
    }
  };

  const deleteSavedReport = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/reports/qbr-prep/saved/${id}`);
      rqClient.invalidateQueries({ queryKey: [`/api/reports/qbr-prep/saved?clientId=${clientId}`] });
      if (savedReportId === id) {
        setSavedReportId(null);
        setReportData(null);
        setEdits({});
      }
      toast({ title: "Report deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const [docxDownloading, setDocxDownloading] = useState(false);
  const downloadDocx = async () => {
    if (!reportData) return;
    setDocxDownloading(true);
    try {
      const res = await fetch("/api/reports/qbr-prep/docx-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData, edits }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        toast({ title: "Download failed", description: (err as any).message, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = reportData.meta?.site?.toLowerCase().replace(/\s+/g, "_") ?? "report";
      a.download = `${slug}_qbr_prep_q${quarter.planningQ}_${quarter.planningYear}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDocxDownloading(false);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!reportData) throw new Error("No report to upload");
      const res = await apiRequest("POST", "/api/reports/qbr-prep/upload-to-drive-v2", {
        reportData,
        edits,
        reportTitle: `QBR Prep - ${reportData.meta?.site} - Q${quarter.planningQ} ${quarter.planningYear}`,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Uploaded to Google Drive",
        description: (
          <a href={data.webViewLink} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1">
            Open in Drive <ExternalLink className="w-3 h-3" />
          </a>
        ) as any,
      });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const [pdfDownloading, setPdfDownloading] = useState(false);
  const downloadPdf = async () => {
    if (!reportData) return;
    setPdfDownloading(true);
    try {
      const res = await fetch("/api/reports/qbr-prep/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData, edits }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = reportData.meta?.site?.toLowerCase().replace(/\s+/g, "_") ?? "report";
      a.download = `${slug}_qbr_prep_q${quarter.planningQ}_${quarter.planningYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "PDF failed", description: err.message, variant: "destructive" });
    } finally {
      setPdfDownloading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0" data-testid="qbr-prep-page">
      <aside className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm" data-testid="text-page-title">QBR Prep</h1>
              <p className="text-xs text-muted-foreground">7-section SEO planning snapshot</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-client">
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Generate as-of Date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={generationDate}
                onChange={e => setGenerationDate(e.target.value)}
                data-testid="input-generation-date"
              />
            </div>

            {clientId && (
              <div className="text-[11px] bg-muted/50 rounded px-3 py-2 space-y-0.5">
                <div><span className="text-muted-foreground">Analysis:</span> <strong>{quarter.analysisWindowLabel}</strong></div>
                <div><span className="text-muted-foreground">Planning:</span> <strong>{quarter.planningQuarterLabel}</strong></div>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Bug className="w-3 h-3" /> Screaming Frog Crawl
              {clientId && !hasSfCrawl && (
                <span className="ml-auto text-destructive flex items-center gap-0.5 normal-case font-medium">
                  <AlertTriangle className="w-3 h-3" /> Required
                </span>
              )}
            </p>
            <input
              ref={sfFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleSfUpload(f); }}
              data-testid="input-sf-file"
            />
            {clientId ? (
              <Select
                value={sfActiveId ? String(sfActiveId) : "__none__"}
                onValueChange={v => {
                  if (v === "__upload__") { sfFileInputRef.current?.click(); return; }
                  setSfActiveId(v === "__none__" ? null : Number(v));
                }}
              >
                <SelectTrigger className="h-8 text-xs w-full" data-testid="select-sf-crawl">
                  <SelectValue placeholder="Select crawl…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No crawl selected</SelectItem>
                  {sfReports.map(r => (
                    <SelectItem key={r.id} value={String(r.id)} data-testid={`sf-option-${r.id}`}>
                      {r.reportDate} — {r.filename} ({r.rowCount.toLocaleString()} rows)
                    </SelectItem>
                  ))}
                  <SelectItem value="__upload__" data-testid="sf-upload-option">
                    {sfUploading ? "Uploading…" : "↑ Upload new crawl CSV…"}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-[11px] text-muted-foreground">Select a client first</p>
            )}
            {sfActiveId && sfReports.length > 0 && (
              <p className="text-[10px] text-green-600 dark:text-green-400 mt-1" data-testid="text-sf-status">
                ✓ {sfReports.find(r => r.id === sfActiveId)?.rowCount.toLocaleString()} URLs will be analyzed
              </p>
            )}
          </div>

          <Separator />

          <div>
            <button
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1 hover:text-foreground transition-colors w-full text-left"
              onClick={() => setShowAmInputs(!showAmInputs)}
              data-testid="toggle-am-inputs"
            >
              {showAmInputs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              AM Inputs (Optional)
            </button>
            {showAmInputs && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block">Client Sentiment</Label>
                  <Select value={sentiment} onValueChange={setSentiment}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-sentiment">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="happy">Happy — strong momentum</SelectItem>
                      <SelectItem value="neutral">Neutral — steady state</SelectItem>
                      <SelectItem value="concerned">Concerned — needs attention</SelectItem>
                      <SelectItem value="frustrated">Frustrated — escalated risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Hypothesis / Focus Area</Label>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    placeholder="What you think should be the priority this quarter…"
                    value={hypothesis}
                    onChange={e => setHypothesis(e.target.value)}
                    data-testid="textarea-hypothesis"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Manual Audit Notes</Label>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    placeholder="Any specific site observations…"
                    value={auditNotes}
                    onChange={e => setAuditNotes(e.target.value)}
                    data-testid="textarea-audit-notes"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          <Button
            className="w-full"
            onClick={() => generateMutation.mutate()}
            disabled={!clientId || !hasSfCrawl || generateMutation.isPending}
            data-testid="button-generate-qbr-prep"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : reportData ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate QBR Prep</>
            )}
          </Button>

          {clientId && !hasSfCrawl && (
            <p className="text-[11px] text-destructive flex items-center gap-1" data-testid="text-sf-required-warning">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Upload a Screaming Frog crawl before generating.
            </p>
          )}

          {clientId && savedReports.length > 0 && (
            <>
              <Separator />
              <div>
                <button
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1 hover:text-foreground transition-colors w-full text-left"
                  onClick={() => setShowSavedReports(!showSavedReports)}
                  data-testid="toggle-saved-reports"
                >
                  {showSavedReports ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Saved Reports ({savedReports.length})
                </button>
                {showSavedReports && (
                  <div className="space-y-1.5">
                    {savedReports.map(r => (
                      <div
                        key={r.id}
                        className={`text-[11px] rounded px-2 py-1.5 flex items-start gap-1.5 cursor-pointer hover:bg-muted/50 ${savedReportId === r.id ? "bg-muted ring-1 ring-primary/20" : ""}`}
                        data-testid={`saved-report-${r.id}`}
                      >
                        <FileText className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0" onClick={() => loadSavedReport(r.id)}>
                          <div className="font-medium truncate">{r.reportName}</div>
                          <div className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                        <button
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteSavedReport(r.id); }}
                          data-testid={`delete-saved-report-${r.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {reportData && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => {
                if (savedReportId && reportData) {
                  saveMutation.mutate({ id: savedReportId, data: reportData, currentEdits: edits });
                }
              }}
              disabled={saveMutation.isPending || !savedReportId}
              data-testid="button-save-report"
            >
              {saveMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
              Save Report
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={downloadDocx}
              disabled={docxDownloading}
              data-testid="button-download-docx"
            >
              {docxDownloading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download DOCX
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={downloadPdf}
              disabled={pdfDownloading}
              data-testid="button-download-pdf"
            >
              {pdfDownloading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download PDF
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending}
              data-testid="button-upload-to-drive"
            >
              {uploadMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CloudUpload className="w-3 h-3 mr-1.5" />}
              Save to Google Drive
            </Button>
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 overflow-auto">
        {!reportData && !generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg" data-testid="text-empty-state-title">QBR Prep Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client, upload a Screaming Frog crawl, then click Generate. The preview renders your 7-section planning snapshot — click any text to edit before exporting.
              </p>
            </div>
          </div>
        )}

        {generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium" data-testid="text-generating">Analyzing data sources…</p>
              <p className="text-xs text-muted-foreground">Pulling GSC, GA4, NSM, and crawl data — 15–30 seconds.</p>
            </div>
          </div>
        )}

        {reportData && !generateMutation.isPending && (
          <QbrPrepPreview
            meta={reportData.meta}
            section1Goals={reportData.section1Goals}
            section2Conversions={reportData.section2Conversions}
            section3Traffic={reportData.section3Traffic}
            section4Services={reportData.section4Services}
            section5Diagnosis={reportData.section5Diagnosis}
            section6Priorities={reportData.section6Priorities}
            section7Tracking={reportData.section7Tracking}
            edits={edits}
            onEdit={handleEdit}
            generationMeta={reportData.generationMeta}
          />
        )}
      </div>
    </div>
  );
}
