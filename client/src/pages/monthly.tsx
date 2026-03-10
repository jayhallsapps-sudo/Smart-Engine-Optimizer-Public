import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  BarChart3,
  Download,
  CloudUpload,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Save,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/report-preview/pptx-preview";
import type { Client, SavedReport } from "@shared/schema";
import { CLIENT_SENTIMENT_OPTIONS } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { CrawlAssetSelector } from "@/components/reports/CrawlAssetSelector";
import { useFillInTheGaps } from "@/hooks/useFillInTheGaps";
import { FillInTheGapsModal } from "@/components/FillInTheGapsModal";
import { ClarificationTrail } from "@/components/ClarificationTrail";
import { Checkbox } from "@/components/ui/checkbox";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2];

export default function MonthlyPage() {
  const { toast } = useToast();
  const now = new Date();

  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(THIS_YEAR));
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);
  const [showAdditionalInputs, setShowAdditionalInputs] = useState(false);

  const [clientSentiment, setClientSentiment] = useState<string>("");
  const [amThoughts, setAmThoughts] = useState("");
  const [priorityChecks, setPriorityChecks] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const [amProgressFeeling, setAmProgressFeeling] = useState("");
  const [amContextAnomalies, setAmContextAnomalies] = useState("");
  const [amLeadershipNote, setAmLeadershipNote] = useState("");
  const [amFocusNextMonth, setAmFocusNextMonth] = useState("");

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const clientName = (clients as Client[]).find(c => String(c.id) === clientId)?.name ?? "";

  const reportSave = useReportSave({
    reportType: "monthly",
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
  } = useFillInTheGaps({ reportType: "monthly" });

  const reportRef = useRef(report);
  reportRef.current = report;
  const editsRef = useRef(edits);
  editsRef.current = edits;

  function getMeta(overrideReport?: any) {
    const r = overrideReport ?? reportRef.current;
    const label = r?.month_label ?? `${MONTHS[Number(month) - 1]} ${year}`;
    const generatedOn = new Date().toISOString().split("T")[0];
    return {
      reportName: `Monthly - ${clientName || "Client"} - ${label} - Generated ${generatedOn}`,
      reportPeriodLabel: label,
      analysisWindowStart: `${year}-${String(month).padStart(2, "0")}-01`,
      analysisWindowEnd: new Date(Number(year), Number(month), 0).toISOString().split("T")[0],
      planningYear: Number(year),
      currentCrawlAssetId: currentCrawlId,
      comparisonCrawlAssetId: comparisonCrawlId,
    };
  }

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
      const res = await apiRequest("POST", "/api/reports/monthly/generate", {
        clientId: Number(clientId),
        month: Number(month),
        year: Number(year),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currentCrawlAssetId: currentCrawlId ?? undefined,
        comparisonCrawlAssetId: comparisonCrawlId ?? undefined,
        amInputs: {
          clientSentiment,
          amThoughts,
          priorityChecks,
          clientNotes: clientNotes || undefined,
          progressFeeling: amProgressFeeling || undefined,
          contextAnomalies: amContextAnomalies || undefined,
          leadershipNote: amLeadershipNote || undefined,
          focusNextMonth: amFocusNextMonth || undefined,
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
      const meta = getMeta(data);
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      toast({ title: "Report generated", description: "9 slides ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = useCallback((key: string, value: string) => {
    setEdits(prev => {
      const next = { ...prev, [key]: value };
      reportSave.pendingPayloadRef.current = {
        reportData: reportRef.current,
        edits: next,
        meta: getMeta(),
      };
      return next;
    });
    reportSave.markDirty();
  }, [currentCrawlId, comparisonCrawlId, clientName, month, year]);

  function handleManualSave() {
    if (!report) return;
    const meta = getMeta();
    reportSave.pendingPayloadRef.current = { reportData: report, edits, meta };
    reportSave.save(report, edits, meta);
    toast({ title: "Saved" });
  }

  const downloadMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Generate report first");
      const res = await apiRequest("POST", "/api/reports/monthly/pptx", { json: report, edits });
      if (!res.ok) throw new Error((await res.json()).message ?? "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "monthly_report.pptx";
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
      const res = await apiRequest("POST", "/api/reports/monthly/upload-to-drive", { json: report, edits });
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

  function handleClientChange(val: string) {
    setClientId(val);
    setReport(null);
    setEdits({});
    setCurrentCrawlId(null);
    setComparisonCrawlId(null);
    reportSave.setSavedReportId(null);
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
    } catch (err) {
      // Error handled in hook
    }
  };

  return (
    <div className="flex h-full min-h-0" data-testid="monthly-page">
      {/* ─── Left Panel ─── */}
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Monthly Report</h1>
              <p className="text-xs text-muted-foreground">SEO Performance Deck (PPTX)</p>
            </div>
          </div>
          {clientId && (
            <div className="mt-2">
              <SaveStatusIndicator status={reportSave.saveStatus} />
            </div>
          )}
        </div>

        <div className="flex-1 p-4 space-y-4">
          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={handleClientChange}>
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

          {/* Month + Year */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger data-testid="select-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
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
          </div>

          <Separator />

          {/* Saved report selector */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="monthly"
                onLoad={(data, savedEdits, id, savedReport) => {
                  setReport(data);
                  setEdits(savedEdits);
                  reportSave.setSavedReportId(id);
                  if (savedReport?.currentCrawlAssetId) setCurrentCrawlId(savedReport.currentCrawlAssetId);
                  if (savedReport?.comparisonCrawlAssetId) setComparisonCrawlId(savedReport.comparisonCrawlAssetId);
                  const meta = getMeta(data);
                  reportSave.pendingPayloadRef.current = { reportData: data, edits: savedEdits, meta };
                  toast({ title: "Report loaded" });
                }}
              />
            </div>
          )}

          <Separator />

          {/* Crawl selectors */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Crawl Assets</Label>
              <CrawlAssetSelector
                clientId={clientId ? Number(clientId) : null}
                currentCrawlId={currentCrawlId}
                comparisonCrawlId={comparisonCrawlId}
                onCurrentChange={setCurrentCrawlId}
                onComparisonChange={setComparisonCrawlId}
                showComparison
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

          {/* Additional Optional Inputs */}
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-full text-left hover:text-foreground transition-colors"
              onClick={() => setShowAdditionalInputs(v => !v)}
              data-testid="toggle-additional-inputs"
            >
              {showAdditionalInputs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Additional Inputs (Optional)
            </button>

            {showAdditionalInputs && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">SEO progress this month?</Label>
                  <Textarea
                    placeholder="How did SEO progress feel…"
                    value={amProgressFeeling}
                    onChange={e => setAmProgressFeeling(e.target.value)}
                    className="text-xs resize-none h-14"
                    data-testid="input-am-progress-feeling"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Key context / anomalies</Label>
                  <Textarea
                    placeholder="Anything unusual this month…"
                    value={amContextAnomalies}
                    onChange={e => setAmContextAnomalies(e.target.value)}
                    className="text-xs resize-none h-14"
                    data-testid="input-am-context-anomalies"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">What should leadership know?</Label>
                  <Textarea
                    placeholder="Key message for leadership…"
                    value={amLeadershipNote}
                    onChange={e => setAmLeadershipNote(e.target.value)}
                    className="text-xs resize-none h-14"
                    data-testid="input-am-leadership-note"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Focus next month</Label>
                  <Textarea
                    placeholder="Top priority for next month…"
                    value={amFocusNextMonth}
                    onChange={e => setAmFocusNextMonth(e.target.value)}
                    className="text-xs resize-none h-14"
                    data-testid="input-am-focus-next-month"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="monthly-fill-gaps"
                checked={fillInGapsEnabled}
                onCheckedChange={(checked) => setFillInGapsEnabled(!!checked)}
                data-testid="checkbox-fill-gaps"
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="monthly-fill-gaps"
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

          {/* Generate */}
          <Button
            className="w-full"
            onClick={handleGenerateClick}
            disabled={!clientId || generateMut.isPending || isAnalyzing || requiredFieldsMissing}
            data-testid="btn-generate-report"
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

          {report && (
            <div className="text-[10px] text-muted-foreground text-center">
              {(report.slides ?? []).length} slides · {MONTHS[Number(month) - 1]} {year}
            </div>
          )}
        </div>

        {/* Export footer */}
        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={handleManualSave}
              disabled={reportSave.saveStatus === "saving"}
              data-testid="btn-manual-save"
            >
              <Save className="w-3 h-3 mr-1.5" />
              Save
            </Button>
            <Button
              className="w-full text-xs"
              onClick={() => downloadMut.mutate()}
              disabled={downloadMut.isPending}
              data-testid="btn-download-pptx"
            >
              {downloadMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download PPTX
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={uploadToDrive}
              disabled={isUploading}
              data-testid="btn-save-drive"
            >
              {isUploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CloudUpload className="w-3 h-3 mr-1.5" />}
              Save to Drive
            </Button>
          </div>
        )}
      </div>

      {/* ─── Main Preview ─── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {!report && !generateMut.isPending && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-sm">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">Monthly Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client and reporting month, then click Generate to build your 9-slide monthly SEO deck.
                Slide data uses true calendar month windows. Navigate slides with the controls and click any text to edit inline.
              </p>
              {clientId && (
                <p className="text-xs text-muted-foreground">
                  Tip: upload a site crawl to enrich technical commentary on priorities.
                </p>
              )}
            </div>
          </div>
        )}

        {generateMut.isPending && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">Building 9 slides…</p>
              <p className="text-xs text-muted-foreground">
                Fetching GSC, GA4, CallRail, SEMrush, Airtable, Asana in parallel
              </p>
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

      {fillInGapsEnabled && sessionId && questions.length > 0 && (
        <ClarificationTrail
          questions={questions}
          answers={answers}
          seoHqLoadStatus={seoHqLoadStatus}
          enabled={fillInGapsEnabled}
        />
      )}

      {showModal && (
        <FillInTheGapsModal
          questions={questions}
          onComplete={handleGapComplete}
          onCancel={closeModal}
          isGenerating={generateMut.isPending}
        />
      )}
    </div>
  );
}
