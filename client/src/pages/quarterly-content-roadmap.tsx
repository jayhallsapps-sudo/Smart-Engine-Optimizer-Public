import { useState, useRef, useCallback, useEffect } from "react";
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
import {
  Download,
  Loader2,
  RefreshCw,
  ChevronRight,
  Save,
  Map,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/report-preview/pptx-preview";
import type { Client, SavedReport } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { Link } from "wouter";

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR + 1];

function currentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

const QUARTER_MONTH_RANGES: Record<string, string> = {
  "1": "January · February · March",
  "2": "April · May · June",
  "3": "July · August · September",
  "4": "October · November · December",
};

export default function QuarterlyContentRoadmapPage() {
  const { toast } = useToast();

  const [clientId, setClientId] = useState(
    () => new URLSearchParams(window.location.search).get("client") ?? "",
  );
  const loadIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get("load"),
  );
  const [quarter, setQuarter] = useState(String(currentQuarter()));
  const [year, setYear] = useState(String(THIS_YEAR));
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const clientName = (clients as Client[]).find(c => String(c.id) === clientId)?.name ?? "";

  // ── Save hook ─────────────────────────────────────────────────────────────
  const reportSave = useReportSave({
    reportType: "quarterly_content_roadmap",
    clientId: clientId ? Number(clientId) : null,
  });

  const reportRef = useRef(report);
  reportRef.current = report;
  const editsRef = useRef(edits);
  editsRef.current = edits;

  // Load from URL param on first render (when client is set)
  useEffect(() => {
    const savedId = loadIdRef.current;
    if (!savedId || !clientId) return;
    loadIdRef.current = null;
    import("@/lib/queryClient").then(({ apiRequest: apiFn }) =>
      apiFn("GET", `/api/saved-reports/${savedId}`)
        .then(r => r.json())
        .then((saved: SavedReport) => {
          const savedEdits = (saved.editsJson as Record<string, string>) ?? {};
          setReport(saved.generatedReportJson);
          setEdits(savedEdits);
          editsRef.current = savedEdits;
          const json = saved.generatedReportJson as any;
          if (json?.quarter) setQuarter(String(json.quarter));
          if (json?.year) setYear(String(json.year));
          reportSave.setSavedReportId(saved.id);
          reportSave.pendingPayloadRef.current = {
            reportData: saved.generatedReportJson,
            edits: savedEdits,
            meta: {
              reportPeriodLabel: saved.reportPeriodLabel ?? undefined,
              planningQuarter: saved.planningQuarter ?? undefined,
              planningYear: saved.planningYear ?? undefined,
            },
          };
          toast({ title: "Report loaded" });
        })
        .catch(() => {})
    );
  }, [clientId]);

  function getMeta(overrideReport?: any) {
    const r = overrideReport ?? reportRef.current;
    const qLabel = r?.quarter_label ?? `Q${quarter} ${year}`;
    const generatedOn = new Date().toISOString().split("T")[0];
    return {
      reportName: `Content Roadmap - ${clientName || "Client"} - ${qLabel} - Generated ${generatedOn}`,
      reportPeriodLabel: qLabel,
      planningQuarter: Number(quarter),
      planningYear: Number(year),
    };
  }

  // ── Load from saved selector ───────────────────────────────────────────────
  function handleLoad(reportData: any, loadedEdits: Record<string, string>, savedId: number, savedReport?: SavedReport) {
    setReport(reportData);
    setEdits(loadedEdits);
    editsRef.current = loadedEdits;
    const json = reportData as any;
    if (json?.quarter) setQuarter(String(json.quarter));
    if (json?.year) setYear(String(json.year));
    reportSave.setSavedReportId(savedId);
    reportSave.pendingPayloadRef.current = {
      reportData,
      edits: loadedEdits,
      meta: {
        reportPeriodLabel: savedReport?.reportPeriodLabel ?? undefined,
        planningQuarter: savedReport?.planningQuarter ?? undefined,
        planningYear: savedReport?.planningYear ?? undefined,
      },
    };
    toast({ title: "Report loaded" });
  }

  // ── Generation ─────────────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports/quarterly-content-roadmap/generate", {
        clientId: Number(clientId),
        quarter: Number(quarter),
        year: Number(year),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Generation failed");
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      editsRef.current = {};
      reportSave.setSavedReportId(null);
      const meta = getMeta(data);
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      toast({ title: "Deck generated", description: `${data.slides?.length ?? 0} slides ready.` });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Edit handler ──────────────────────────────────────────────────────────
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
  }, [clientName, quarter, year]);

  // ── Manual save ────────────────────────────────────────────────────────────
  function handleManualSave() {
    if (!report) return;
    const meta = getMeta();
    reportSave.pendingPayloadRef.current = { reportData: report, edits, meta };
    reportSave.save(report, edits, meta);
    toast({ title: "Saved" });
  }

  // ── PPTX Export ────────────────────────────────────────────────────────────
  async function downloadPptx() {
    if (!report) return;
    setIsDownloading(true);
    try {
      const res = await fetch("/api/reports/quarterly-content-roadmap/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: report, edits }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as any;
        throw new Error(e.message ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `${clientName.toLowerCase().replace(/\s+/g, "_")}_Content_Roadmap_Q${quarter}_${year}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PPTX downloaded" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  }

  const canGenerate = !!clientId && !!quarter && !!year && !generateMutation.isPending;
  const hasReport = !!report?.slides?.length;

  return (
    <div className="flex h-full overflow-hidden bg-background" data-testid="page-quarterly-content-roadmap">
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
            <Link href="/prepare" className="hover:text-foreground transition-colors">Prepare</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium">Quarterly Content Roadmap</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#C0392B] shrink-0">
              <Map className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#C0392B]">Quarterly Content Roadmap</h1>
              <p className="text-[10px] text-muted-foreground">Per-month strategy + Airtable deliverables</p>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="px-5 py-4 flex flex-col gap-4 flex-1">
          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold" htmlFor="qcr-client">Client</Label>
            <Select value={clientId} onValueChange={v => { setClientId(v); reportSave.setSavedReportId(null); }}>
              <SelectTrigger id="qcr-client" className="h-8 text-xs" data-testid="select-qcr-client">
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

          {/* Quarter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold" htmlFor="qcr-quarter">Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger id="qcr-quarter" className="h-8 text-xs" data-testid="select-qcr-quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4"].map(q => (
                  <SelectItem key={q} value={q} data-testid={`option-quarter-${q}`}>
                    Q{q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {quarter && (
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {QUARTER_MONTH_RANGES[quarter]}
              </p>
            )}
          </div>

          {/* Year */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold" htmlFor="qcr-year">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="qcr-year" className="h-8 text-xs" data-testid="select-qcr-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => (
                  <SelectItem key={y} value={String(y)} data-testid={`option-year-${y}`}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data source note */}
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2.5 text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed space-y-1">
            <p className="font-semibold">Data pulled automatically:</p>
            <p>• QBS — strategy context for Q{quarter} {year}</p>
            <p>• Airtable — production deliverables per month</p>
            <p>All text is editable after generation.</p>
          </div>

          {/* Generate button */}
          <Button
            className="w-full h-8 text-xs"
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate}
            data-testid="button-generate-qcr"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Generate Deck
              </>
            )}
          </Button>

          <Separator />

          {/* Save + Load */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Saved Versions</Label>
              <SaveStatusIndicator status={reportSave.saveStatus} />
            </div>
            <ReportSaveSelector
              clientId={clientId ? Number(clientId) : null}
              reportType="quarterly_content_roadmap"
              onLoad={handleLoad}
            />
            <Button
              variant="outline"
              className="w-full h-8 text-xs"
              onClick={handleManualSave}
              disabled={!hasReport}
              data-testid="button-save-qcr"
            >
              <Save className="w-3 h-3 mr-1.5" />
              Save
            </Button>
          </div>

          <Separator />

          {/* Export */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Export</Label>
            <Button
              variant="outline"
              className="w-full h-8 text-xs"
              onClick={downloadPptx}
              disabled={!hasReport || isDownloading}
              data-testid="button-download-pptx"
            >
              {isDownloading ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-3 h-3 mr-1.5" />
              )}
              Download PPTX
            </Button>
          </div>
        </div>
      </div>

      {/* ── Preview area ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {hasReport ? (
          <PptxPreview
            slides={report.slides}
            edits={edits}
            onEdit={handleEdit}
            onSlidesChange={(slides: any[]) => setReport((prev: any) => ({ ...prev, slides }))}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8 text-muted-foreground" data-testid="qcr-empty-state">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C0392B]/10">
              <Map className="w-7 h-7 text-[#C0392B]" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="font-semibold text-foreground text-sm">Quarterly Content Roadmap</p>
              <p className="text-xs leading-relaxed">
                Select a client and quarter, then click <strong>Generate Deck</strong> to build the 11-slide
                content roadmap. Strategy context is pulled from the client's QBS, and deliverables from Airtable.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground/70">All text is editable after generation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
