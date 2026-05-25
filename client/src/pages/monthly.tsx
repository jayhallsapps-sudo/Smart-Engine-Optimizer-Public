import { useState, useRef, useCallback, useEffect } from "react";
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
  MessageSquare,
  CheckCircle2,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { CommentPanel } from "@/components/comments/CommentPanel";
import { WorkflowContextBanner } from "@/components/workflow/WorkflowContextBanner";
import { SourceDebugPanel } from "@/components/reports/SourceDebugPanel";
import { loadWorkflowContext, type WorkflowHandoffContext } from "@/lib/workflowHandoff";
import { GuidancePanel } from "@/components/GuidancePanel";
import { SourceReadinessBanner, MONTHLY_SOURCES } from "@/components/reports/SourceReadinessBanner";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2];

export default function MonthlyPage() {
  const { toast } = useToast();
  const now = new Date();

  const [clientId, setClientId] = useState(() => new URLSearchParams(window.location.search).get("client") ?? "");
  const loadIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get("load"));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(THIS_YEAR));
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Phase 3h — custom slide builder state
  const [customSlideOpen, setCustomSlideOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customPosition, setCustomPosition] = useState<string>("");  // "after-N" stringified for the Select
  const [customBrief, setCustomBrief] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);
  const [showAdditionalInputs, setShowAdditionalInputs] = useState(false);

  const [clientSentiment, setClientSentiment] = useState<string>("");
  const [amThoughts, setAmThoughts] = useState("");
  const [priorityChecks, setPriorityChecks] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const [amProgressFeeling, setAmProgressFeeling] = useState("");
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [amContextAnomalies, setAmContextAnomalies] = useState("");
  const [amLeadershipNote, setAmLeadershipNote] = useState("");
  const [amFocusNextMonth, setAmFocusNextMonth] = useState("");
  const [producedBy, setProducedBy] = useState("");
  const [quarterlyStrategyFocus, setQuarterlyStrategyFocus] = useState("");
  const [vvobsCount, setVvobsCount] = useState("");

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [workflowCtx, setWorkflowCtx] = useState<WorkflowHandoffContext | null>(() =>
    loadWorkflowContext("monthly", clientId ? Number(clientId) : null),
  );

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
    draftAnswers,
    handleAnswersChange,
    answerUsage,
    fetchAnswerUsage,
  } = useFillInTheGaps({ reportType: "monthly" });

  const reportRef = useRef(report);
  reportRef.current = report;
  const editsRef = useRef(edits);
  editsRef.current = edits;

  const handleSlidesChange = useCallback((slides: any[]) => {
    setReport((prev: any) => prev ? { ...prev, slides } : prev);
  }, []);

  useEffect(() => {
    const savedId = loadIdRef.current;
    if (!savedId || !clientId) return;
    loadIdRef.current = null;
    import("@/lib/queryClient").then(({ apiRequest }) =>
      apiRequest("GET", `/api/saved-reports/${savedId}`)
        .then(r => r.json())
        .then(saved => {
          const savedEdits = (saved.editsJson as Record<string, string>) ?? {};
          setReport(saved.generatedReportJson);
          setEdits(savedEdits);
          editsRef.current = savedEdits;
          reportSave.setSavedReportId(saved.id);
          reportSave.pendingPayloadRef.current = {
            reportData: saved.generatedReportJson,
            edits: savedEdits,
            meta: {
              reportPeriodLabel: saved.reportPeriodLabel,
              analysisWindowStart: saved.analysisWindowStart,
              analysisWindowEnd: saved.analysisWindowEnd,
              currentCrawlAssetId: saved.currentCrawlAssetId,
              comparisonCrawlAssetId: saved.comparisonCrawlAssetId,
            },
          };
          toast({ title: "Report loaded" });
        })
        .catch(() => {})
    );
  }, [clientId]);

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
    if (!amThoughts.trim()) errors.amThoughts = "AM's Hypothesis is required";
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
          producedBy: producedBy || undefined,
          quarterlyStrategyFocus: quarterlyStrategyFocus || undefined,
          vvobsCount: vvobsCount || undefined,
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
    onSettled: () => {
      if (sessionId) fetchAnswerUsage(sessionId);
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

  // ─── Download PDF — Puppeteer renders the EXACT preview as PDF ────────────
  // Auto-save handles persistence (via useReportSave above); no manual Save
  // button is exposed. The Drive button uploads the deck to Google Drive;
  // the PDF button downloads a PDF that mirrors what's on screen.
  async function downloadPdf() {
    if (!report) return;
    setIsDownloadingPdf(true);
    try {
      const res = await fetch("/api/reports/monthly/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ report, edits }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `${report.client_name ?? "report"} - Monthly Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "PDF download failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  function resetCustomSlideForm() {
    setCustomTitle("");
    setCustomPosition("");
    setCustomBrief("");
  }

  async function submitCustomSlide() {
    if (!report) return;
    const trimmedTitle = customTitle.trim();
    const trimmedBrief = customBrief.trim();
    if (!trimmedTitle || !trimmedBrief) {
      toast({
        title: "Title and brief are required",
        description: "Both fields need text before the AI can synthesize a slide.",
        variant: "destructive",
      });
      return;
    }
    // Position is "after-<index>" where index = 0 means insert at top (before
    // the cover slide), index = slides.length means append. Default: after the
    // currently-final slide (append).
    const slides: any[] = report.slides ?? [];
    const positionStr = customPosition || `after-${slides.length}`;
    const insertIndex = Math.max(0, Math.min(slides.length, parseInt(positionStr.replace("after-", ""), 10)));

    setIsSynthesizing(true);
    try {
      const res = await apiRequest("POST", "/api/reports/monthly/synthesize-custom-slide", {
        title: trimmedTitle,
        brief: trimmedBrief,
        clientName: edits["cover_client"] ?? report.client_name ?? clientName ?? "Client",
        monthLabel: report.month_label ?? "",
      });
      const data = await res.json();
      if (!data?.slide) throw new Error(data?.message ?? "AI returned no slide");

      const newSlide = data.slide;
      const nextSlides = [...slides.slice(0, insertIndex), newSlide, ...slides.slice(insertIndex)];
      handleSlidesChange(nextSlides);

      if (data.fallbackTriggered) {
        toast({
          title: "Custom slide inserted (AI fallback)",
          description: "AI synthesis failed; the slide ships with your raw brief in a prose layout. Edit any text block in-place.",
        });
      } else {
        toast({
          title: "Custom slide inserted",
          description: `Layout: ${newSlide.layout ?? "prose_card"} · via ${data.provider ?? "AI"}`,
        });
      }
      setCustomSlideOpen(false);
      resetCustomSlideForm();
    } catch (err: any) {
      toast({ title: "Synthesis failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setIsSynthesizing(false);
    }
  }

  async function uploadToDrive() {
    if (!report) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/reports/monthly/slides", { json: report, edits });
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
      closeModal();
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
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-sm">Monthly Report</h1>
              <p className="text-xs text-muted-foreground">SEO Performance Deck (PPTX)</p>
            </div>
            <Button
              data-testid="toggle-comment-panel"
              variant={showCommentPanel ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setShowCommentPanel(v => !v)}
              title="Comments"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
          {clientId && (
            <div className="mt-2">
              <SaveStatusIndicator status={reportSave.saveStatus} />
            </div>
          )}
        </div>

        {workflowCtx && (
          <WorkflowContextBanner
            context={workflowCtx}
            onApply={(fields) => {
              if (fields.amThoughts) setAmThoughts(fields.amThoughts);
              if (fields.priorityChecks) setPriorityChecks(fields.priorityChecks);
              if (fields.amContextAnomalies) setAmContextAnomalies(fields.amContextAnomalies);
              if (fields.amFocusNextMonth) setAmFocusNextMonth(fields.amFocusNextMonth);
            }}
            onDismiss={() => setWorkflowCtx(null)}
          />
        )}

        <GuidancePanel reportType="monthly" sessionKey="monthly" />

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
                AM's Hypothesis <span className="text-destructive">*</span>
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
              <Label className="text-[11px] text-muted-foreground">Client Insights</Label>
              <Textarea
                placeholder="Optional notes from or about the client…"
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                className="text-xs resize-none h-14"
                data-testid="input-client-notes"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Produced By</Label>
              <input
                type="text"
                placeholder="e.g. Olivia & Carmen"
                value={producedBy}
                onChange={e => setProducedBy(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-produced-by"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">VVOB Count</Label>
              <input
                type="text"
                placeholder="Total verified VOBs this month (e.g. 13)"
                value={vvobsCount}
                onChange={e => setVvobsCount(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-vvobs-count"
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
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Quarterly Strategy Focus</Label>
                  <Textarea
                    placeholder="e.g. Q1 focus: build topical authority in addiction treatment…"
                    value={quarterlyStrategyFocus}
                    onChange={e => setQuarterlyStrategyFocus(e.target.value)}
                    className="text-xs resize-none h-14"
                    data-testid="input-quarterly-strategy-focus"
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

          {/* Source Readiness */}
          {clientId && (() => {
            const selectedClient = (clients as Client[]).find(c => String(c.id) === clientId);
            return selectedClient ? (
              <SourceReadinessBanner client={selectedClient} sourceIds={MONTHLY_SOURCES} />
            ) : null;
          })()}

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

        {/* Export footer — matches biweekly's button stack: PDF + Drive only.
            Auto-save handles persistence; no manual Save button exposed. */}
        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => setCustomSlideOpen(true)}
              data-testid="btn-add-custom-slide"
            >
              <Plus className="w-3 h-3 mr-1.5" />
              Add Custom Slide
            </Button>
            <Button
              className="w-full text-xs"
              onClick={downloadPdf}
              disabled={isDownloadingPdf}
              data-testid="btn-download-pdf"
            >
              {isDownloadingPdf ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              {isDownloadingPdf ? "Generating PDF…" : "Download PDF"}
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
          <>
            <PptxPreview
              slides={report.slides ?? []}
              edits={edits}
              onEdit={handleEdit}
              onSlidesChange={handleSlidesChange}
            />
            <SourceDebugPanel sourceFacts={(report as any).sourceFacts} />
          </>
        )}
      </div>

      {showCommentPanel && (
        <CommentPanel
          reportType="monthly"
          clientId={clientId || null}
          savedReportId={reportSave.savedReportId}
          anchors={(report?.slides ?? []).map((s: any, i: number) => ({ id: s.id ?? `slide:${i}`, label: s.title ?? `Slide ${i + 1}` }))}
          onClose={() => setShowCommentPanel(false)}
          className="h-full"
        />
      )}

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

      {/* ─── Phase 3h — Add Custom Slide dialog ───────────────────────── */}
      <Dialog
        open={customSlideOpen}
        onOpenChange={(open) => {
          if (!isSynthesizing) {
            setCustomSlideOpen(open);
            if (!open) resetCustomSlideForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add custom slide</DialogTitle>
            <DialogDescription>
              Give the AI a free-form brief. It will pick the right layout (stats, prose, table, or story) and produce
              an editable slide. Insert it anywhere in the deck.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-title" className="text-xs">Slide title</Label>
              <Input
                id="custom-title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Custom code is fighting the platform"
                disabled={isSynthesizing}
                data-testid="input-custom-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-position" className="text-xs">Insert position</Label>
              <Select
                value={customPosition}
                onValueChange={setCustomPosition}
                disabled={isSynthesizing}
              >
                <SelectTrigger id="custom-position" data-testid="select-custom-position">
                  <SelectValue placeholder={`Append to end (after slide ${(report?.slides ?? []).length})`} />
                </SelectTrigger>
                <SelectContent>
                  {((report?.slides ?? []) as any[]).map((s, i) => (
                    <SelectItem key={i} value={`after-${i + 1}`}>
                      After slide {i + 1}{s.title ? ` · ${s.title}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={`after-0`}>Insert at the very top (before cover)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-brief" className="text-xs">Brief</Label>
              <Textarea
                id="custom-brief"
                value={customBrief}
                onChange={(e) => setCustomBrief(e.target.value)}
                placeholder="Type a paragraph of prose, a bulleted list, or a mix of prose and numbers. The AI picks the layout from the shape of what you write."
                rows={6}
                disabled={isSynthesizing}
                data-testid="textarea-custom-brief"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCustomSlideOpen(false);
                resetCustomSlideForm();
              }}
              disabled={isSynthesizing}
            >
              Cancel
            </Button>
            <Button
              onClick={submitCustomSlide}
              disabled={isSynthesizing || !customTitle.trim() || !customBrief.trim()}
              data-testid="btn-synthesize-custom-slide"
            >
              {isSynthesizing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
              {isSynthesizing ? "Synthesizing…" : "Synthesize slide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
