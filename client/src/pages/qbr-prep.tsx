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
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QbrPrepPreview } from "@/components/report-preview/qbr-prep-preview";
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

interface CrawlAsset {
  id: number;
  reportDate: string;
  createdAt: string;
  assetName: string;
  rowCount: number;
}

const SF_FRESHNESS_DAYS = 90;

function crawlIsFresh(createdAt: string, asOfDate: string): boolean {
  const base = new Date(asOfDate + "T12:00:00");
  const created = new Date(createdAt);
  const diffDays = (base.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= SF_FRESHNESS_DAYS;
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

export default function QbrPrepPage() {
  const { toast } = useToast();
  const rqClient = useQueryClient();

  const [clientId, setClientId] = useState<string>("");
  const [generationDate, setGenerationDate] = useState(new Date().toISOString().split("T")[0]);
  const [sentiment, setSentiment] = useState<string>("");
  const [amThoughts, setAmThoughts] = useState("");
  const [priorityChecks, setPriorityChecks] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [showAmInputs, setShowAmInputs] = useState(true);
  const [amValidationErrors, setAmValidationErrors] = useState<Record<string, string>>({});

  const [reportData, setReportData] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [dataOrigin, setDataOrigin] = useState<"live" | "saved" | null>(null);
  const [crossSellClassifications, setCrossSellClassifications] = useState<Record<number, string>>({});

  const quarter = inferQuarterClient(generationDate);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: crawlAssets = [] } = useQuery<CrawlAsset[]>({
    queryKey: [`/api/crawl-assets?clientId=${clientId}`],
    enabled: !!clientId,
  });

  const reportSave = useReportSave({
    reportType: "qbr_prep",
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
  } = useFillInTheGaps({ reportType: "qbr_prep" });

  useEffect(() => {
    if (crawlAssets.length > 0 && !currentCrawlId) {
      setCurrentCrawlId(crawlAssets[0].id);
    }
    if (crawlAssets.length === 0) setCurrentCrawlId(null);
  }, [crawlAssets]);

  useEffect(() => {
    setCurrentCrawlId(null);
    setReportData(null);
    setEdits({});
    setDataOrigin(null);
    reportSave.setSavedReportId(null);
  }, [clientId]);

  const selectedCrawl = crawlAssets.find(a => a.id === currentCrawlId);
  const hasSfCrawl = crawlAssets.length > 0;
  const sfIsFresh = selectedCrawl ? crawlIsFresh(selectedCrawl.createdAt, generationDate) : false;
  const sfReadyForGeneration = !!currentCrawlId && sfIsFresh;

  const clientName = clients.find(c => String(c.id) === clientId)?.name;

  function validateAmInputs(): boolean {
    const errors: Record<string, string> = {};
    if (!sentiment) errors.sentiment = "Client Sentiment is required";
    if (!amThoughts.trim()) errors.amThoughts = "AM's Thoughts is required";
    if (!priorityChecks.trim()) errors.priorityChecks = "Priority Checks is required";
    setAmValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setShowAmInputs(true);
      return false;
    }
    return true;
  }

  const generateMutation = useMutation({
    mutationFn: async (params?: { gapAnswers?: any[]; gapSessionId?: number }) => {
      const res = await apiRequest("POST", "/api/reports/qbr-prep/generate-v2", {
        clientId: Number(clientId),
        generationDate,
        sentiment,
        amThoughts,
        priorityChecks,
        clientNotes: clientNotes || undefined,
        currentCrawlAssetId: currentCrawlId ?? undefined,
        gapAnswers: params?.gapAnswers,
        gapSessionId: params?.gapSessionId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setReportData(data.reportData);
      setEdits({});
      setDataOrigin("live");
      const periodLabel = quarter.analysisWindowLabel;
      const meta = {
        reportPeriodLabel: periodLabel,
        analysisWindowStart: quarter.analysisStart,
        analysisWindowEnd: quarter.analysisEnd,
        planningQuarter: quarter.planningQ,
        planningYear: quarter.planningYear,
        currentCrawlAssetId: currentCrawlId,
      };
      reportSave.pendingPayloadRef.current = { reportData: data.reportData, edits: {}, meta };
      reportSave.save(data.reportData, {}, meta);
      toast({ title: "QBR Prep generated", description: "Preview ready — click any text to edit." });
    },
    onSettled: () => {
      if (sessionId) fetchAnswerUsage(sessionId);
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const editsRef = useRef(edits);
  editsRef.current = edits;
  const reportDataRef = useRef(reportData);
  reportDataRef.current = reportData;

  const handleEdit = useCallback((key: string, value: string) => {
    setEdits(prev => {
      const next = { ...prev, [key]: value };
      reportSave.pendingPayloadRef.current = {
        reportData: reportDataRef.current,
        edits: next,
        meta: {
          reportPeriodLabel: quarter.analysisWindowLabel,
          analysisWindowStart: quarter.analysisStart,
          analysisWindowEnd: quarter.analysisEnd,
          planningQuarter: quarter.planningQ,
          planningYear: quarter.planningYear,
          currentCrawlAssetId: currentCrawlId,
        },
      };
      return next;
    });
    reportSave.markDirty();
  }, [currentCrawlId, quarter]);

  const [docxDownloading, setDocxDownloading] = useState(false);
  const downloadDocx = async () => {
    if (!reportData) return;
    setDocxDownloading(true);
    try {
      const { getAuthHeaders } = await import("@/lib/queryClient");
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/reports/qbr-prep/docx-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
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
      const { getAuthHeaders } = await import("@/lib/queryClient");
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/reports/qbr-prep/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
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

  const handleGenerateClick = async () => {
    if (!clientId) return;
    if (!validateAmInputs()) return;

    if (fillInGapsEnabled) {
      const result = await runGapAnalysis(Number(clientId), {
        clientSentiment: sentiment as any,
        amThoughts,
        priorityChecks,
        clientNotes,
      });
      if (result && !result.hasQuestions) {
        generateMutation.mutate();
      }
    } else {
      generateMutation.mutate();
    }
  };

  const handleGapComplete = async (answers: any[]) => {
    try {
      const sid = await submitAnswers(Number(clientId), answers);
      generateMutation.mutate({ gapAnswers: answers, gapSessionId: sid });
      closeModal();
    } catch (err) {
      // Error handled in hook
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
          {clientId && <div className="mt-1"><SaveStatusIndicator status={reportSave.saveStatus} /></div>}
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
              <Bug className="w-3 h-3" /> Multi-source Crawl
              {clientId && !hasSfCrawl && (
                <span className="ml-auto text-destructive flex items-center gap-0.5 normal-case font-medium">
                  <AlertTriangle className="w-3 h-3" /> Required
                </span>
              )}
            </p>
            {clientId ? (
              <CrawlAssetSelector
                clientId={clientId ? Number(clientId) : null}
                clientName={clientName}
                currentCrawlId={currentCrawlId}
                onCurrentChange={setCurrentCrawlId}
                showComparison={false}
                freshnessLimitDays={SF_FRESHNESS_DAYS}
                asOfDate={generationDate}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">Select a client first</p>
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
              AM Inputs
              <span className="text-destructive text-[10px] normal-case font-medium ml-1">Required</span>
            </button>
            {showAmInputs && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block">Client Sentiment <span className="text-destructive">*</span></Label>
                  <Select value={sentiment} onValueChange={(v) => { setSentiment(v); setAmValidationErrors(prev => { const n = {...prev}; delete n.sentiment; return n; }); }}>
                    <SelectTrigger className={`h-8 text-xs ${amValidationErrors.sentiment ? "border-destructive" : ""}`} data-testid="select-sentiment">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_SENTIMENT_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {amValidationErrors.sentiment && <p className="text-destructive text-[10px] mt-0.5">{amValidationErrors.sentiment}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1 block">AM's Thoughts <span className="text-destructive">*</span></Label>
                  <Textarea
                    className={`text-xs min-h-[60px] ${amValidationErrors.amThoughts ? "border-destructive" : ""}`}
                    placeholder="What you actually think about the account, performance, priorities, concerns, or opportunities…"
                    value={amThoughts}
                    onChange={e => { setAmThoughts(e.target.value); setAmValidationErrors(prev => { const n = {...prev}; delete n.amThoughts; return n; }); }}
                    data-testid="textarea-am-thoughts"
                  />
                  {amValidationErrors.amThoughts && <p className="text-destructive text-[10px] mt-0.5">{amValidationErrors.amThoughts}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Priority Checks <span className="text-destructive">*</span></Label>
                  <Textarea
                    className={`text-xs min-h-[60px] ${amValidationErrors.priorityChecks ? "border-destructive" : ""}`}
                    placeholder="Items you want to explicitly check, even if the automated workflow wouldn't force it…"
                    value={priorityChecks}
                    onChange={e => { setPriorityChecks(e.target.value); setAmValidationErrors(prev => { const n = {...prev}; delete n.priorityChecks; return n; }); }}
                    data-testid="textarea-priority-checks"
                  />
                  {amValidationErrors.priorityChecks && <p className="text-destructive text-[10px] mt-0.5">{amValidationErrors.priorityChecks}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1 block text-muted-foreground">Client Notes <span className="text-muted-foreground text-[10px]">(optional)</span></Label>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    placeholder="Client-specific conditions, constraints, special deliverables…"
                    value={clientNotes}
                    onChange={e => setClientNotes(e.target.value)}
                    data-testid="textarea-client-notes"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {clientId && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="qbr_prep"
                onLoad={(data, savedEdits, id) => {
                  setReportData(data);
                  setEdits(savedEdits);
                  setDataOrigin("saved");
                  reportSave.setSavedReportId(id);
                  reportSave.pendingPayloadRef.current = {
                    reportData: data,
                    edits: savedEdits,
                    meta: {
                      reportPeriodLabel: quarter.analysisWindowLabel,
                      planningQuarter: quarter.planningQ,
                      planningYear: quarter.planningYear,
                      currentCrawlAssetId: currentCrawlId,
                    },
                  };
                  const savedInputs = data?.sourceSnapshot?.manualInputs ?? {};
                  if (savedInputs.sentiment || savedInputs.clientSentiment) setSentiment(savedInputs.clientSentiment ?? savedInputs.sentiment ?? "");
                  if (savedInputs.amThoughts || savedInputs.hypothesis) setAmThoughts(savedInputs.amThoughts ?? savedInputs.hypothesis ?? "");
                  if (savedInputs.priorityChecks || savedInputs.auditNotes) setPriorityChecks(savedInputs.priorityChecks ?? savedInputs.auditNotes ?? "");
                  if (savedInputs.clientNotes) setClientNotes(savedInputs.clientNotes ?? "");
                  toast({ title: "Report loaded" });
                }}
              />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="qbr-prep-fill-gaps"
                checked={fillInGapsEnabled}
                onCheckedChange={(checked) => setFillInGapsEnabled(!!checked)}
                data-testid="checkbox-fill-gaps"
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="qbr-prep-fill-gaps"
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
            disabled={!clientId || !sfReadyForGeneration || generateMutation.isPending || isAnalyzing}
            data-testid="button-generate-qbr-prep"
          >
            {generateMutation.isPending || isAnalyzing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isAnalyzing ? "Analyzing Gaps…" : "Generating…"}</>
            ) : reportData ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate QBR Prep</>
            )}
          </Button>

          {clientId && !hasSfCrawl && (
            <p className="text-[11px] text-destructive flex items-center gap-1" data-testid="text-sf-required-warning">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Upload a site crawl before generating.
            </p>
          )}
          {clientId && hasSfCrawl && !sfIsFresh && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-sf-stale-warning">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Crawl is too old (over {SF_FRESHNESS_DAYS} days). Upload a fresh crawl to generate.
            </p>
          )}
          {reportData && dataOrigin === "live" && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1" data-testid="text-data-origin-live">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              Fresh — generated this session. Safe to export.
            </p>
          )}
          {reportData && dataOrigin === "saved" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-data-origin-saved">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Loaded from saved. Click Regenerate before exporting to apply latest generator logic.
            </p>
          )}
        </div>

        {/* Audit missing warning */}
        {reportData?.section6Priorities?.auditMissing && (
          <div className="px-4 pt-3 pb-0">
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1" data-testid="audit-missing-warning">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Audit input not provided
              </div>
              <p>Before finalizing quarterly priorities, provide a recent site audit screenshot or a short audit summary so the strategy can account for technical blockers, internal linking gaps, page quality issues, or structural weaknesses.</p>
              <p className="text-[10px] opacity-75">Enter audit notes in the "Priority Checks / Audit Notes" field above, then regenerate.</p>
            </div>
          </div>
        )}

        {/* Cross-sell / upsell preview & AM confirmation */}
        {reportData?.section6Priorities?.crossSellPreview?.length > 0 && (
          <div className="px-4 pt-3 pb-0">
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-3" data-testid="crosssell-preview-panel">
              <div className="text-[11px] font-semibold text-blue-900 dark:text-blue-200">
                Potential Opportunities — Classify Before Exporting
              </div>
              <p className="text-[10px] text-blue-800 dark:text-blue-300">
                The SEO Strategy Bank flagged these items as potentially relevant to this account. Classify each before the report is finalized.
              </p>
              {(reportData.section6Priorities.crossSellPreview as any[]).map((item: any, i: number) => (
                <div key={i} className="space-y-1" data-testid={`crosssell-item-${i}`}>
                  <div className="text-[11px] font-medium text-blue-900 dark:text-blue-100">{item.opportunity}</div>
                  <div className="text-[10px] text-blue-700 dark:text-blue-300">{item.relevance}</div>
                  <Select
                    value={crossSellClassifications[i] ?? item.suggestedCategory}
                    onValueChange={(v) => setCrossSellClassifications(prev => ({ ...prev, [i]: v }))}
                  >
                    <SelectTrigger className="h-7 text-[11px]" data-testid={`select-crosssell-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in-scope SEO work">In-scope SEO work</SelectItem>
                      <SelectItem value="cross-sell">Cross-sell</SelectItem>
                      <SelectItem value="upsell">Upsell</SelectItem>
                      <SelectItem value="not relevant">Not relevant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button
                size="sm"
                className="w-full text-xs h-7"
                data-testid="button-apply-crosssell"
                onClick={() => {
                  const preview = reportData.section6Priorities.crossSellPreview as any[];
                  const confirmed = preview
                    .map((item: any, i: number) => ({
                      recommendation: item.opportunity,
                      type: crossSellClassifications[i] ?? item.suggestedCategory,
                      relevance: item.relevance,
                    }))
                    .filter((c: any) => c.type === "cross-sell" || c.type === "upsell");
                  setEdits(prev => ({ ...prev, s6_crossSells_confirmed: JSON.stringify(confirmed) }));
                }}
              >
                Apply Confirmed Opportunities to Report
              </Button>
            </div>
          </div>
        )}

        {reportData && (
          <div className="p-4 border-t space-y-2">
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
                Select a client, upload a site crawl, then click Generate. The preview renders your 7-section planning snapshot — click any text to edit before exporting.
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
            sectionQssb={reportData.sectionQssb}
            edits={edits}
            onEdit={handleEdit}
            generationMeta={reportData.generationMeta}
            amInputs={reportData.sourceSnapshot?.manualInputs ? {
              clientSentiment: reportData.sourceSnapshot.manualInputs.clientSentiment ?? reportData.sourceSnapshot.manualInputs.sentiment,
              amThoughts: reportData.sourceSnapshot.manualInputs.amThoughts ?? reportData.sourceSnapshot.manualInputs.hypothesis,
              priorityChecks: reportData.sourceSnapshot.manualInputs.priorityChecks ?? reportData.sourceSnapshot.manualInputs.auditNotes,
              clientNotes: reportData.sourceSnapshot.manualInputs.clientNotes,
            } : undefined}
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
          isGenerating={generateMutation.isPending}
          initialAnswers={draftAnswers}
          onAnswersChange={handleAnswersChange}
        />
      )}
    </div>
  );
}
