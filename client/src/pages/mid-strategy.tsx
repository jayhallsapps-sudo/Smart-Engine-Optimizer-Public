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
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Download,
  CloudUpload,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Save,
  Database,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/report-preview/pptx-preview";
import type { Client } from "@shared/schema";
import { CLIENT_SENTIMENT_OPTIONS } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { CrawlAssetSelector } from "@/components/reports/CrawlAssetSelector";
import { useFillInTheGaps } from "@/hooks/useFillInTheGaps";
import { FillInTheGapsModal } from "@/components/FillInTheGapsModal";
import { Checkbox } from "@/components/ui/checkbox";

export default function MidStrategyPage() {
  const { toast } = useToast();

  const [clientId, setClientId] = useState("");
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);
  const [showAdditionalInputs, setShowAdditionalInputs] = useState(false);
  const [workbookBuilt, setWorkbookBuilt] = useState(false);
  const [buildStep, setBuildStep] = useState<"idle" | "building" | "built">("idle");

  const [clientSentiment, setClientSentiment] = useState<string>("");
  const [amThoughts, setAmThoughts] = useState("");
  const [priorityChecks, setPriorityChecks] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const [amAccountFeeling, setAmAccountFeeling] = useState("");
  const [amContextAnomalies, setAmContextAnomalies] = useState("");
  const [amLeadershipNote, setAmLeadershipNote] = useState("");
  const [amFocusNext60Days, setAmFocusNext60Days] = useState("");
  const [amSalesAdmissions, setAmSalesAdmissions] = useState("");
  const [amClientDependency, setAmClientDependency] = useState("");

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const clientName = (clients as Client[]).find(c => String(c.id) === clientId)?.name ?? "";

  const reportSave = useReportSave({
    reportType: "mid_strategy_seo",
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
    closeModal,
  } = useFillInTheGaps({ reportType: "mid_strategy_seo" });

  const reportRef = useRef(report);
  reportRef.current = report;
  const editsRef = useRef(edits);
  editsRef.current = edits;

  function getAmInputs() {
    return {
      clientSentiment,
      amThoughts,
      priorityChecks,
      clientNotes: clientNotes || undefined,
      accountFeeling: amAccountFeeling || undefined,
      contextAnomalies: amContextAnomalies || undefined,
      leadershipNote: amLeadershipNote || undefined,
      focusNext60Days: amFocusNext60Days || undefined,
      salesAdmissionsContext: amSalesAdmissions || undefined,
      clientDependencyNotes: amClientDependency || undefined,
    };
  }

  function getMeta(overrideReport?: any) {
    const r = overrideReport ?? reportRef.current;
    const generatedOn = new Date().toISOString().split("T")[0];
    return {
      reportName: `Mid-Strategy SEO - ${clientName || "Client"} - Generated ${generatedOn}`,
      reportPeriodLabel: r?.report_date ?? generatedOn,
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
      setBuildStep("building");
      const res = await apiRequest("POST", "/api/reports/mid-strategy/generate", {
        clientId: Number(clientId),
        currentCrawlAssetId: currentCrawlId ?? undefined,
        comparisonCrawlAssetId: comparisonCrawlId ?? undefined,
        amInputs: getAmInputs(),
        gapAnswers: params?.gapAnswers,
        gapSessionId: params?.gapSessionId,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Generation failed");
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      setWorkbookBuilt(true);
      setBuildStep("built");
      reportSave.setSavedReportId(null);
      const meta = getMeta(data);
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      const wb = data.workbook;
      const missing = wb?.buildStatus?.missingFields?.length ?? 0;
      const sources = wb?.buildStatus?.dataSourcesUsed?.join(", ") ?? "none";
      toast({
        title: "Mid-Strategy Report Generated",
        description: `${(data.slides ?? []).length} slides ready${sources ? ` · Sources: ${sources}` : ""}${missing > 0 ? ` · ${missing} fields need manual entry` : ""}`,
      });
    },
    onError: (err: any) => {
      setBuildStep("idle");
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
  }, [currentCrawlId, comparisonCrawlId, clientName]);

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
      const res = await apiRequest("POST", "/api/reports/mid-strategy/pptx", { json: report, edits });
      if (!res.ok) throw new Error((await res.json()).message ?? "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "mid_strategy.pptx";
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
      const res = await apiRequest("POST", "/api/reports/mid-strategy/upload-to-drive", { json: report, edits });
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
    setWorkbookBuilt(false);
    setBuildStep("idle");
    reportSave.setSavedReportId(null);
  }

  const handleGenerateClick = async () => {
    if (!clientId) return;
    if (!validateAmInputs()) return;

    if (fillInGapsEnabled) {
      const amInputs = getAmInputs();
      const result = await runGapAnalysis(Number(clientId), amInputs as any);
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

  const wb = report?.workbook;
  const missingFields: string[] = wb?.buildStatus?.missingFields ?? [];
  const completedFields: number = wb?.buildStatus?.completedFields ?? 0;
  const dataSourcesUsed: string[] = wb?.buildStatus?.dataSourcesUsed ?? [];

  return (
    <div className="flex h-full min-h-0" data-testid="mid-strategy-page">
      {/* ─── Left Panel ─── */}
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Mid-Strategy SEO Report</h1>
              <p className="text-xs text-muted-foreground">Competitive benchmark · Structural analysis</p>
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
              <SelectTrigger data-testid="select-client-mid">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {(clients as Client[]).map(c => (
                  <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-mid-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Saved report selector */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="mid_strategy_seo"
                onLoad={(data, savedEdits, id, savedReport) => {
                  setReport(data);
                  setEdits(savedEdits);
                  reportSave.setSavedReportId(id);
                  setWorkbookBuilt(true);
                  setBuildStep("built");
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
                clientId={Number(clientId)}
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
          <div className="space-y-1.5">
            <button
              className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-full hover:text-foreground transition-colors"
              onClick={() => setShowAdditionalInputs(v => !v)}
              data-testid="toggle-additional-inputs-mid"
            >
              {showAdditionalInputs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Additional Inputs (Optional)
            </button>
            {showAdditionalInputs && (
              <div className="space-y-3 pt-1">
                {[
                  { label: "How does the account feel so far?", value: amAccountFeeling, set: setAmAccountFeeling, testId: "input-am-feeling" },
                  { label: "Key context / anomalies", value: amContextAnomalies, set: setAmContextAnomalies, testId: "input-am-context" },
                  { label: "What should leadership know?", value: amLeadershipNote, set: setAmLeadershipNote, testId: "input-am-leadership" },
                  { label: "Focus over next 30-60 days", value: amFocusNext60Days, set: setAmFocusNext60Days, testId: "input-am-focus" },
                  { label: "Sales / admissions context", value: amSalesAdmissions, set: setAmSalesAdmissions, testId: "input-am-sales" },
                  { label: "Client dependency / approval notes", value: amClientDependency, set: setAmClientDependency, testId: "input-am-dependency" },
                ].map(({ label, value, set, testId }) => (
                  <div key={testId} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Textarea
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="Optional…"
                      className="text-xs min-h-[52px] resize-none"
                      data-testid={testId}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Workbook Status */}
          {workbookBuilt && wb && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Database className="w-3 h-3" />
                Workbook Status
              </Label>
              <div className="rounded-md border p-2.5 space-y-1.5 text-xs bg-muted/30">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-muted-foreground">{completedFields} fields populated</span>
                </div>
                {dataSourcesUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dataSourcesUsed.map(s => (
                      <Badge key={s} variant="secondary" className="text-[9px] px-1 py-0">{s}</Badge>
                    ))}
                  </div>
                )}
                {missingFields.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{missingFields.length} manual entry needed</span>
                    </div>
                    {missingFields.slice(0, 3).map((f, i) => (
                      <div key={i} className="text-[9px] text-muted-foreground pl-4">• {f}</div>
                    ))}
                    {missingFields.length > 3 && (
                      <div className="text-[9px] text-muted-foreground pl-4">+ {missingFields.length - 3} more</div>
                    )}
                  </div>
                )}
                {missingFields.length === 0 && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>All fields populated</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="mid-strategy-fill-gaps"
                checked={fillInGapsEnabled}
                onCheckedChange={(checked) => setFillInGapsEnabled(!!checked)}
                data-testid="checkbox-fill-gaps"
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="mid-strategy-fill-gaps"
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

          {/* Action buttons */}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={handleGenerateClick}
              disabled={!clientId || generateMut.isPending || isAnalyzing || requiredFieldsMissing}
              data-testid="button-generate-mid-strategy"
            >
              {generateMut.isPending || isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isAnalyzing ? "Analyzing Gaps…" : buildStep === "building" ? "Building workbook & slides…" : "Generating…"}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  {report ? "Regenerate Report" : "Build & Generate Report"}
                </>
              )}
            </Button>

            {requiredFieldsMissing && clientId && (
              <p className="text-[10px] text-destructive text-center" data-testid="text-validation-warning">
                Fill in all required AM Inputs to generate
              </p>
            )}

            {report && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManualSave}
                  disabled={reportSave.saveStatus === "saving"}
                  data-testid="button-save-mid-strategy"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => downloadMut.mutate()}
                  disabled={downloadMut.isPending}
                  data-testid="button-download-pptx-mid"
                >
                  {downloadMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Export PPTX
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={uploadToDrive}
                  disabled={isUploading}
                  data-testid="button-upload-drive-mid"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudUpload className="w-4 h-4 mr-2" />}
                  Upload to Drive
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Slide Preview ─── */}
      <div className="flex-1 min-w-0 flex flex-col bg-gray-800">
        {report?.slides?.length > 0 ? (
          <PptxPreview
            slides={report.slides}
            edits={edits}
            onEdit={handleEdit}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <Target className="w-12 h-12 text-gray-500" />
            <div>
              <p className="text-gray-300 font-medium text-sm">Mid-Strategy SEO Report</p>
              <p className="text-gray-500 text-xs mt-1">Select a client and click Build & Generate Report</p>
              <p className="text-gray-600 text-xs mt-3 max-w-sm">
                Pulls competitor benchmarks from SEMrush, analyzes your crawl for cannibalization patterns, and generates a 14-slide strategic deck.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-left max-w-xs w-full mt-2">
              {[
                "Competitive analysis (4 slides)",
                "Authority & AI visibility scores",
                "Immediate focus priorities",
                "Risk flag: cannibalization",
                "URL audit & action plan",
                "Next steps for both parties",
              ].map(item => (
                <div key={item} className="flex items-start gap-1.5 text-xs text-gray-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
