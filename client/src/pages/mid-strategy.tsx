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
  CheckCircle2,
  AlertCircle,
  Activity,
  Zap,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/report-preview/pptx-preview";
import type { Client } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { CrawlAssetSelector } from "@/components/reports/CrawlAssetSelector";
import { Checkbox } from "@/components/ui/checkbox";

// Confidence label badge for slides
function ConfidenceLabel({ confidence }: { confidence?: string }) {
  if (!confidence) return null;
  const map: Record<string, { label: string; color: string }> = {
    "data-backed": { label: "Data-Backed", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    "mixed-source": { label: "Mixed Source", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    "ai-synthesized": { label: "AI-Synthesized", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    "missing-data": { label: "Missing Data", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const cfg = map[confidence];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${cfg.color}`}>
      {confidence === "data-backed" && <CheckCircle2 className="w-2.5 h-2.5" />}
      {confidence === "missing-data" && <AlertCircle className="w-2.5 h-2.5" />}
      {cfg.label}
    </span>
  );
}

export default function MidStrategyPage() {
  const { toast } = useToast();

  const [clientId, setClientId] = useState("");
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);
  const [buildStep, setBuildStep] = useState<"idle" | "building" | "built">("idle");

  // Simplified inputs — no manual strategy content fields
  const [clientInsights, setClientInsights] = useState("");
  const [domainStrategyEnabled, setDomainStrategyEnabled] = useState(false);
  const [domainCurrent, setDomainCurrent] = useState("");
  const [domainProposed, setDomainProposed] = useState("");
  const [domainRationale, setDomainRationale] = useState("");

  const [healthChecks, setHealthChecks] = useState<Record<string, { status: string; detail?: string }> | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showHealthPanel, setShowHealthPanel] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const clientName = (clients as Client[]).find(c => String(c.id) === clientId)?.name ?? "";

  const reportSave = useReportSave({
    reportType: "mid_strategy_seo",
    clientId: clientId ? Number(clientId) : null,
  });

  const reportRef = useRef(report);
  reportRef.current = report;
  const editsRef = useRef(edits);
  editsRef.current = edits;

  async function runHealthCheck(cId: string) {
    if (!cId) return;
    setHealthLoading(true);
    try {
      const res = await apiRequest("POST", "/api/reports/mid-strategy/health-check", { clientId: Number(cId) });
      const data = await res.json();
      setHealthChecks(data.checks ?? null);
      setShowHealthPanel(true);
    } catch {
      setHealthChecks(null);
    } finally {
      setHealthLoading(false);
    }
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

  function handleClientChange(val: string) {
    setClientId(val);
    setReport(null);
    setEdits({});
    setCurrentCrawlId(null);
    setComparisonCrawlId(null);
    setBuildStep("idle");
    reportSave.setSavedReportId(null);
    setHealthChecks(null);
    setDomainStrategyEnabled(false);
    setDomainCurrent("");
    setDomainProposed("");
    setDomainRationale("");
    if (val) runHealthCheck(val);
  }

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client first");
      setBuildStep("building");
      const res = await apiRequest("POST", "/api/reports/mid-strategy/generate", {
        clientId: Number(clientId),
        currentCrawlAssetId: currentCrawlId ?? undefined,
        comparisonCrawlAssetId: comparisonCrawlId ?? undefined,
        clientInsights: clientInsights.trim() || undefined,
        includeDomainStrategy: domainStrategyEnabled,
        domainStrategy: domainStrategyEnabled ? {
          currentDomain: domainCurrent || undefined,
          proposedDomain: domainProposed || undefined,
          customRationale: domainRationale || undefined,
        } : undefined,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Generation failed");
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      setBuildStep("built");
      reportSave.setSavedReportId(null);
      const meta = getMeta(data);
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      const wb = data.workbook;
      const sources = wb?.buildStatus?.dataSourcesUsed?.join(", ") ?? "none";
      const slideCount = (data.slides ?? []).length;
      toast({
        title: "Mid-Strategy Report Generated",
        description: `${slideCount} slides auto-generated${sources ? ` · Sources: ${sources}` : ""}`,
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
      reportSave.pendingPayloadRef.current = { reportData: reportRef.current, edits: next, meta: getMeta() };
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

  const pdfMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Generate report first");
      const res = await apiRequest("POST", "/api/reports/mid-strategy/pdf", { json: report, edits });
      if (!res.ok) throw new Error((await res.json()).message ?? "PDF export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "mid_strategy.pdf";
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => {
      toast({ title: "PDF download failed", description: err.message, variant: "destructive" });
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

  const wb = report?.workbook;
  const missingFields: string[] = wb?.buildStatus?.missingFields ?? [];
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
              <p className="text-xs text-muted-foreground">Auto-generated diagnostic deck</p>
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

          {/* Load Saved */}
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

          {/* Crawl Assets */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Crawl Assets <span className="text-muted-foreground font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <p className="text-[10px] text-muted-foreground leading-tight">Upload a Screaming Frog export for deeper structural, technical, and trust analysis.</p>
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

          {/* Integration Health */}
          {clientId && (healthChecks || healthLoading) && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-full hover:text-foreground transition-colors"
                  onClick={() => setShowHealthPanel(v => !v)}
                  data-testid="toggle-health-panel"
                >
                  <Activity className="w-3 h-3" />
                  {showHealthPanel ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Integration Health
                  {healthLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                </button>
                {showHealthPanel && healthChecks && (
                  <div className="rounded-md border p-2 space-y-1 text-xs bg-muted/30" data-testid="health-check-panel">
                    {Object.entries(healthChecks).map(([name, check]) => {
                      const isOk = check.status === "connected";
                      const isWarn = check.status.includes("no data") || check.status.includes("stale");
                      return (
                        <div key={name} className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0">
                            {isOk ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : isWarn ? <AlertCircle className="w-3 h-3 text-amber-500" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
                          </span>
                          <div className="min-w-0">
                            <span className={`font-medium ${isOk ? "text-foreground" : isWarn ? "text-amber-600" : "text-muted-foreground"}`}>{name}</span>
                            {check.detail && <span className="text-[9px] text-muted-foreground ml-1">— {check.detail}</span>}
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => runHealthCheck(clientId)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1" data-testid="button-refresh-health">
                      <RefreshCw className="w-2.5 h-2.5" /> Refresh
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Client Insights (optional) */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Client Context <span className="text-muted-foreground font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <p className="text-[10px] text-muted-foreground leading-tight">Any relevant context about this client — recent changes, focus areas, upcoming events.</p>
              <Textarea
                placeholder="e.g. Client is launching a new PHP program next month. Leadership focused on admissions volume..."
                value={clientInsights}
                onChange={e => setClientInsights(e.target.value)}
                className="text-xs resize-none h-20"
                data-testid="input-client-insights"
              />
            </div>
          )}

          {/* Domain Strategy (optional toggle) */}
          {clientId && (
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="mid-strategy-domain-strategy"
                  checked={domainStrategyEnabled}
                  onCheckedChange={(checked) => setDomainStrategyEnabled(!!checked)}
                  data-testid="checkbox-domain-strategy"
                />
                <Label htmlFor="mid-strategy-domain-strategy" className="text-xs cursor-pointer leading-tight">
                  Include domain strategy recommendation
                </Label>
              </div>
              {domainStrategyEnabled && (
                <div className="space-y-2 pl-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Current domain</Label>
                    <input
                      value={domainCurrent}
                      onChange={e => setDomainCurrent(e.target.value)}
                      placeholder="e.g. currentdomain.com"
                      className="w-full text-xs px-2 py-1 border rounded bg-background"
                      data-testid="input-domain-current"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Proposed domain</Label>
                    <input
                      value={domainProposed}
                      onChange={e => setDomainProposed(e.target.value)}
                      placeholder="e.g. proposeddomain.com"
                      className="w-full text-xs px-2 py-1 border rounded bg-background"
                      data-testid="input-domain-proposed"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Custom rationale (optional)</Label>
                    <Textarea
                      value={domainRationale}
                      onChange={e => setDomainRationale(e.target.value)}
                      placeholder="Override the default recommendation..."
                      className="text-xs min-h-[40px] resize-none"
                      data-testid="input-domain-rationale"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Generate Button */}
          {clientId && (
            <div className="space-y-2">
              <Button
                onClick={() => generateMut.mutate()}
                disabled={!clientId || generateMut.isPending}
                className="w-full"
                data-testid="button-generate-mid-strategy"
              >
                {generateMut.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</>
                ) : (
                  <><Zap className="w-4 h-4 mr-2" /> {buildStep === "built" ? "Regenerate Report" : "Generate Report"}</>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center leading-tight">
                Deck auto-generates from crawl data, integrations &amp; competitive signals.
              </p>
            </div>
          )}

          {/* Data Sources Used */}
          {report && dataSourcesUsed.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources Used</Label>
              <div className="flex flex-wrap gap-1">
                {dataSourcesUsed.map(src => (
                  <Badge key={src} variant="secondary" className="text-[9px] px-1.5 py-0">{src}</Badge>
                ))}
              </div>
              {missingFields.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-2 text-[10px] text-amber-700 dark:text-amber-400 space-y-0.5">
                  <div className="font-semibold flex items-center gap-1"><Info className="w-3 h-3" /> Missing data</div>
                  {missingFields.slice(0, 4).map((f, i) => <div key={i}>• {f}</div>)}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Export Actions */}
          {report && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</Label>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={() => downloadMut.mutate()}
                disabled={downloadMut.isPending}
                data-testid="button-export-pptx"
              >
                {downloadMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Download PPTX
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={() => pdfMut.mutate()}
                disabled={pdfMut.isPending}
                data-testid="button-export-pdf"
              >
                {pdfMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Download PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={uploadToDrive}
                disabled={isUploading}
                data-testid="button-upload-drive"
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
                Save to Drive
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-xs text-muted-foreground"
                onClick={handleManualSave}
                data-testid="button-save-report"
              >
                <Save className="w-3 h-3" /> Save Progress
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!report ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md px-8">
              <Target className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {clientId ? "Ready to generate" : "Select a client to begin"}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {clientId
                  ? "This report auto-generates from your connected data sources — crawl data, SEMrush, GSC, GA4, and integration status. No manual authoring required."
                  : "Choose a client from the sidebar. The report will auto-generate a diagnostic strategy deck from all available data sources."}
              </p>
              {clientId && buildStep === "idle" && (
                <Button
                  className="mt-4"
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  data-testid="button-generate-mid-strategy-empty"
                >
                  {generateMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing…</> : <><Zap className="w-4 h-4 mr-2" />Generate Report</>}
                </Button>
              )}
              {generateMut.isPending && (
                <div className="mt-6 space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <p className="text-xs text-muted-foreground">Pulling data sources and generating diagnostic slides…</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Report header */}
            <div className="border-b bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h2 className="font-semibold text-sm">{report.report_title}</h2>
                <p className="text-xs text-muted-foreground">{clientName} · {report.report_date} · {(report.slides ?? []).length} slides</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Data-backed
                  <span className="w-2 h-2 rounded-full bg-amber-400 ml-2" /> AI-synthesized
                  <span className="w-2 h-2 rounded-full bg-red-400 ml-2" /> Missing data
                </div>
              </div>
            </div>

            {/* Confidence summary strip */}
            {(() => {
              const slidesWithConf = (report.slides ?? []).filter((s: any) => s.confidence);
              const dataBacked = slidesWithConf.filter((s: any) => s.confidence === "data-backed").length;
              const aiSynth = slidesWithConf.filter((s: any) => ["ai-synthesized", "mixed-source"].includes(s.confidence)).length;
              const missing = slidesWithConf.filter((s: any) => s.confidence === "missing-data").length;
              if (slidesWithConf.length === 0) return null;
              return (
                <div className="bg-muted/40 border-b px-6 py-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Confidence report:</span>
                  {dataBacked > 0 && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> {dataBacked} data-backed</span>}
                  {aiSynth > 0 && <span className="flex items-center gap-1"><Info className="w-3 h-3 text-amber-500" /> {aiSynth} synthesized</span>}
                  {missing > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-400" /> {missing} need data</span>}
                  {missing > 0 && <span className="text-[10px]">Upload a crawl or connect integrations to improve coverage.</span>}
                </div>
              );
            })()}

            {/* Slides preview with inline confidence labels */}
            <div className="p-6">
              <PptxPreview
                slides={report.slides ?? []}
                edits={edits}
                onEdit={handleEdit}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
