import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocxPreview } from "@/components/report-preview/docx-preview";
import type { Client } from "@shared/schema";
import { CLIENT_SENTIMENT_OPTIONS } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { CrawlAssetSelector } from "@/components/reports/CrawlAssetSelector";
import { useFillInTheGaps } from "@/hooks/useFillInTheGaps";
import { FillInTheGapsModal } from "@/components/FillInTheGapsModal";
import { ClarificationTrail } from "@/components/ClarificationTrail";
import { Checkbox } from "@/components/ui/checkbox";

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

export default function BiweeklyPage() {
  const { toast } = useToast();

  const [clientId, setClientId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<"7" | "14" | "30" | "custom">("14");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [preparedBy, setPreparedBy] = useState("JAY HALL");
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);

  const [clientSentiment, setClientSentiment] = useState<string>("");
  const [amThoughts, setAmThoughts] = useState("");
  const [priorityChecks, setPriorityChecks] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const clientName = clients.find(c => String(c.id) === clientId)?.name;

  const reportSave = useReportSave({
    reportType: "biweekly",
    clientId: clientId ? Number(clientId) : null,
  });

  const {
    fillInGapsEnabled,
    setFillInGapsEnabled,
    isAnalyzing,
    showModal,
    questions,
    runGapAnalysis,
    submitAnswers,
    sessionId,
    seoHqLoadStatus,
    answers,
    closeModal,
    draftAnswers,
    handleAnswersChange,
    answerUsage,
    fetchAnswerUsage,
  } = useFillInTheGaps({ reportType: "biweekly" });

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

  function validateAmInputs(): boolean {
    const errors: Record<string, string> = {};
    if (!clientSentiment) errors.clientSentiment = "Client Sentiment is required";
    if (!amThoughts.trim()) errors.amThoughts = "AM's Thoughts is required";
    if (!priorityChecks.trim()) errors.priorityChecks = "Priority Checks is required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const requiredFieldsMissing = !clientSentiment || !amThoughts.trim() || !priorityChecks.trim();

  const generateMut = useMutation({
    mutationFn: async (params?: { gapAnswers?: any[]; gapSessionId?: number }) => {
      if (!clientId) throw new Error("Select a client first");
      if (!validateAmInputs()) throw new Error("Please fill in all required AM Inputs fields");
      const range = getDateRange();
      const res = await apiRequest("POST", "/api/reports/biweekly/generate", {
        clientId: Number(clientId),
        startDate: range.startDate,
        endDate: range.endDate,
        preparedBy: preparedBy || "JAY HALL",
        amInputs: {
          clientSentiment,
          amThoughts,
          priorityChecks,
          clientNotes: clientNotes || undefined,
        },
        gapAnswers: params?.gapAnswers,
        gapSessionId: params?.gapSessionId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      reportSave.setSavedReportId(null);
      const meta = {
        reportPeriodLabel: windowLabel,
        analysisWindowStart: startDate,
        analysisWindowEnd: endDate,
        currentCrawlAssetId: currentCrawlId,
        comparisonCrawlAssetId: comparisonCrawlId,
      };
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      toast({ title: "Report generated", description: "Preview ready — click any text to edit." });
    },
    onSettled: (_data, _err, _vars) => {
      if (sessionId) fetchAnswerUsage(sessionId);
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

  async function downloadPdf() {
    if (!report) return;
    try {
      const { getAuthHeaders } = await import("@/lib/queryClient");
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/reports/biweekly/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ report, edits }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.client_name ?? "report"} - Biweekly Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "PDF download failed", description: err.message, variant: "destructive" });
    }
  }

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

  function handleEdit(key: string, value: string) {
    setEdits(prev => {
      const next = { ...prev, [key]: value };
      reportSave.pendingPayloadRef.current = {
        reportData: report,
        edits: next,
        meta: {
          reportPeriodLabel: windowLabel,
          analysisWindowStart: startDate,
          analysisWindowEnd: endDate,
          currentCrawlAssetId: currentCrawlId,
          comparisonCrawlAssetId: comparisonCrawlId,
        },
      };
      return next;
    });
    reportSave.markDirty();
  }

  const handleGenerateClick = async () => {
    if (!clientId) return;
    if (!validateAmInputs()) return;

    if (fillInGapsEnabled) {
      const result = await runGapAnalysis(Number(clientId), {
        clientSentiment: clientSentiment as any,
        amThoughts,
        priorityChecks,
        clientNotes,
      });
      if (result && !result.hasQuestions) {
        generateMut.mutate();
      }
    } else {
      generateMut.mutate();
    }
  };

  const handleGapComplete = async (answers: any[]) => {
    try {
      const sid = await submitAnswers(Number(clientId), answers);
      generateMut.mutate({ gapAnswers: answers, gapSessionId: sid });
      closeModal();
    } catch (err) {
      // Error handled in hook
    }
  };

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
          {clientId && <div className="mt-1"><SaveStatusIndicator status={reportSave.saveStatus} /></div>}
        </div>

        <div className="flex-1 p-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setReport(null); reportSave.setSavedReportId(null); }}>
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

          {clientId && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Multi-source</Label>
              <CrawlAssetSelector
                clientId={clientId ? Number(clientId) : null}
                clientName={clientName}
                currentCrawlId={currentCrawlId}
                comparisonCrawlId={comparisonCrawlId}
                onCurrentChange={setCurrentCrawlId}
                onComparisonChange={setComparisonCrawlId}
                showComparison
              />
            </div>
          )}

          {clientId && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="biweekly"
                onLoad={(data, savedEdits, id) => {
                  setReport(data);
                  setEdits(savedEdits);
                  reportSave.setSavedReportId(id);
                  reportSave.pendingPayloadRef.current = {
                    reportData: data,
                    edits: savedEdits,
                    meta: { reportPeriodLabel: windowLabel, analysisWindowStart: startDate, analysisWindowEnd: endDate },
                  };
                  toast({ title: "Report loaded" });
                }}
              />
            </div>
          )}

          <Separator />

          {/* AM Inputs — Required */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AM Inputs</Label>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Client Sentiment <span className="text-destructive">*</span>
              </Label>
              <Select value={clientSentiment} onValueChange={(v) => { setClientSentiment(v); setValidationErrors(prev => { const n = {...prev}; delete n.clientSentiment; return n; }); }}>
                <SelectTrigger data-testid="select-client-sentiment" className={validationErrors.clientSentiment ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select sentiment…" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_SENTIMENT_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt} data-testid={`option-sentiment-${opt.toLowerCase()}`}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.clientSentiment && <p className="text-[10px] text-destructive" data-testid="error-client-sentiment">{validationErrors.clientSentiment}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                AM's Thoughts <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Your hypothesis, focus areas, strategy thoughts…"
                value={amThoughts}
                onChange={e => { setAmThoughts(e.target.value); setValidationErrors(prev => { const n = {...prev}; delete n.amThoughts; return n; }); }}
                className={`text-xs resize-none h-14 ${validationErrors.amThoughts ? "border-destructive" : ""}`}
                data-testid="input-am-thoughts"
              />
              {validationErrors.amThoughts && <p className="text-[10px] text-destructive" data-testid="error-am-thoughts">{validationErrors.amThoughts}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Priority Checks <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Site observations, audit findings, priorities…"
                value={priorityChecks}
                onChange={e => { setPriorityChecks(e.target.value); setValidationErrors(prev => { const n = {...prev}; delete n.priorityChecks; return n; }); }}
                className={`text-xs resize-none h-14 ${validationErrors.priorityChecks ? "border-destructive" : ""}`}
                data-testid="input-priority-checks"
              />
              {validationErrors.priorityChecks && <p className="text-[10px] text-destructive" data-testid="error-priority-checks">{validationErrors.priorityChecks}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Client Notes</Label>
              <Textarea
                placeholder="Optional notes from or about the client…"
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                className="text-xs resize-none h-14"
                data-testid="input-client-notes"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="fill-gaps"
                checked={fillInGapsEnabled}
                onCheckedChange={(checked) => setFillInGapsEnabled(!!checked)}
                data-testid="checkbox-fill-gaps"
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="fill-gaps"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer"
                >
                  Fill in the gaps
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Ask follow-up questions before generating if the system detects missing context.
                </p>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleGenerateClick}
            disabled={!clientId || generateMut.isPending || isAnalyzing || requiredFieldsMissing}
            data-testid="button-generate"
          >
            {generateMut.isPending || isAnalyzing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isAnalyzing ? "Analyzing Gaps…" : "Generating…"}</>
            ) : report ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              "Generate Report"
            )}
          </Button>

          {requiredFieldsMissing && clientId && (
            <p className="text-[10px] text-destructive text-center" data-testid="text-validation-warning">
              Fill in all required AM Inputs to generate
            </p>
          )}
        </div>

        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              className="w-full text-xs"
              onClick={downloadPdf}
              disabled={downloadDocxMut.isPending}
              data-testid="button-download-pdf"
            >
              <Download className="w-3 h-3 mr-1.5" />
              Download PDF
            </Button>
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
              Save to Drive (PDF)
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

      {/* ClarificationTrail hidden — gap answers still saved to DB via answerUsage */}
      {/* {fillInGapsEnabled && sessionId && questions.length > 0 && (
        <ClarificationTrail
          questions={questions}
          answers={answers}
          seoHqLoadStatus={seoHqLoadStatus}
          enabled={fillInGapsEnabled}
          answerUsage={answerUsage}
        />
      )} */}

      {showModal && (
        <FillInTheGapsModal
          questions={questions}
          onComplete={handleGapComplete}
          onCancel={closeModal}
          isGenerating={generateMut.isPending}
          initialAnswers={draftAnswers}
          onAnswersChange={handleAnswersChange}
        />
      )}
    </div>
  );
}
