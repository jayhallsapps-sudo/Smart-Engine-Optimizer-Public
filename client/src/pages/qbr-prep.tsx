import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Download,
  Upload,
  Loader2,
  Bug,
  Settings2,
  RefreshCw,
  CloudUpload,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocxPreview } from "@/components/report-preview/docx-preview";
import type { DocxSection } from "@/components/report-preview/docx-preview";
import type { Client } from "@shared/schema";

interface Opportunity {
  opportunity_title: string;
  priority: "P0" | "P1" | "P2";
  impact: "High" | "Med" | "Low";
  effort: "S" | "M" | "L";
  kpi_affected: string;
  urls: string[];
  evidence: string;
  problem: string;
  opportunity: string;
  why_it_matters: string;
  recommended_next_step: string;
}

interface OpportunityCategory {
  category_name: string;
  opportunities: Opportunity[];
}

interface Win {
  title: string;
  evidence: string;
  source: string;
}

interface TopOpportunity {
  title: string;
  category: string;
  priority: string;
  impact: string;
  kpi: string;
}

interface QbrPrepJson {
  report_title: string;
  client_name: string;
  past_window_label: string;
  past_start: string;
  past_end: string;
  future_window_label: string;
  generated_at: string;
  executive_summary: {
    wins: Win[];
    top_opportunities: TopOpportunity[];
  };
  opportunity_backlog: OpportunityCategory[];
}

interface QbrPrepOutput {
  json: QbrPrepJson;
  markdown: string;
}

const PAST_QUARTER_OPTIONS = [
  { value: "Q1", label: "Q1 (Most Recent)" },
  { value: "Q2", label: "Q2 (Most Recent)" },
  { value: "Q3", label: "Q3 (Most Recent)" },
  { value: "Q4", label: "Q4 (Most Recent)" },
  { value: "Q1_TODATE", label: "Q1 To Date" },
  { value: "Q2_TODATE", label: "Q2 To Date" },
  { value: "Q3_TODATE", label: "Q3 To Date" },
  { value: "Q4_TODATE", label: "Q4 To Date" },
];

const FUTURE_QUARTER_OPTIONS = [
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
];

interface SfReport {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
}

function qbrJsonToSections(json: QbrPrepJson): DocxSection[] {
  const sections: DocxSection[] = [];

  sections.push({
    id: "exec_summary",
    type: "qbr-exec",
    title: `Executive Summary — ${json.past_window_label}`,
    wins: json.executive_summary.wins,
    topOpps: json.executive_summary.top_opportunities.map(o => ({
      priority: o.priority,
      title: o.title,
      category: o.category,
      impact: o.impact,
      kpi: o.kpi,
    })),
  });

  const CATEGORY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
  json.opportunity_backlog.forEach((cat, ci) => {
    const letter = CATEGORY_LETTERS[ci] ?? String(ci + 1);
    sections.push({
      id: `category_${ci}`,
      type: "qbr-category",
      title: `${letter}. ${cat.category_name} (${cat.opportunities.length} items)`,
      opportunities: cat.opportunities,
    });
  });

  return sections;
}

export default function QbrPrepPage() {
  const { toast } = useToast();
  const rqClient = useQueryClient();

  const [clientId, setClientId] = useState<string>("");
  const [pastQuarter, setPastQuarter] = useState<string>("Q4");
  const [futureQuarter, setFutureQuarter] = useState<string>("Q1");
  const [includeContent, setIncludeContent] = useState(true);
  const [includeTechnical, setIncludeTechnical] = useState(true);
  const [includeLocal, setIncludeLocal] = useState(true);
  const [includeCro, setIncludeCro] = useState(true);
  const [includeAuthority, setIncludeAuthority] = useState(true);
  const [includeTracking, setIncludeTracking] = useState(true);
  const [opportunityCapPerCategory, setOpportunityCapPerCategory] = useState<string>("10");
  const [result, setResult] = useState<QbrPrepOutput | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [sfActiveId, setSfActiveId] = useState<number | null>(null);
  const [sfUploading, setSfUploading] = useState(false);
  const sfFileInputRef = useRef<HTMLInputElement>(null);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: sfReports = [] } = useQuery<SfReport[]>({
    queryKey: ["/api/clients", clientId, "sf-reports"],
    enabled: !!clientId,
  });

  useEffect(() => {
    if (sfReports.length > 0 && !sfActiveId) setSfActiveId(sfReports[0].id);
    if (sfReports.length === 0) setSfActiveId(null);
  }, [sfReports]);

  useEffect(() => { setSfActiveId(null); }, [clientId]);

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
      const res = await apiRequest("POST", "/api/reports/qbr-prep/generate", {
        clientId: Number(clientId),
        pastQuarter,
        futureQuarter,
        includeContent,
        includeTechnical,
        includeLocal,
        includeCro,
        includeAuthority,
        includeTracking,
        opportunityCapPerCategory: Number(opportunityCapPerCategory),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
        sfReportId: sfActiveId ?? undefined,
      });
      return res.json();
    },
    onSuccess: (data: QbrPrepOutput) => {
      setResult(data);
      setEdits({});
      toast({ title: "QBR Prep generated", description: "Preview ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const [docxDownloading, setDocxDownloading] = useState(false);

  const downloadDocx = async () => {
    if (!result) return;
    setDocxDownloading(true);
    try {
      const res = await fetch("/api/reports/qbr-prep/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: result.json }),
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
      const slug = result.json.client_name.toLowerCase().replace(/\s+/g, "_");
      a.download = `${slug}_qbr_prep_${pastQuarter.toLowerCase()}.docx`;
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
      if (!result) throw new Error("No report to upload");
      const res = await apiRequest("POST", "/api/reports/qbr-prep/upload-to-drive", {
        json: result.json,
        reportTitle: result.json.report_title,
        clientId: Number(clientId),
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

  function handleEdit(key: string, value: string) {
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  const sections: DocxSection[] = result ? qbrJsonToSections(result.json) : [];

  return (
    <div className="flex h-full min-h-0" data-testid="qbr-prep-page">
      <aside className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">QBR Prep</h1>
              <p className="text-xs text-muted-foreground">Opportunity backlog for QBR</p>
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
              <Label className="text-xs mb-1 block">Past Quarter (Analysis Window)</Label>
              <Select value={pastQuarter} onValueChange={setPastQuarter}>
                <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-past-quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAST_QUARTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Future Quarter (Planning Label)</Label>
              <Select value={futureQuarter} onValueChange={setFutureQuarter}>
                <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-future-quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_QUARTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Opportunities per Category</Label>
              <Select value={opportunityCapPerCategory} onValueChange={setOpportunityCapPerCategory}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-cap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "10", "15", "20"].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Bug className="w-3 h-3" /> Screaming Frog Crawl
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
              <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                ✓ {sfReports.find(r => r.id === sfActiveId)?.rowCount.toLocaleString()} URLs will be analyzed
              </p>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Category Toggles
            </p>
            <div className="space-y-2.5">
              {[
                { id: "content", label: "Content", state: includeContent, set: setIncludeContent },
                { id: "technical", label: "Technical SEO", state: includeTechnical, set: setIncludeTechnical },
                { id: "local", label: "Local / GBP", state: includeLocal, set: setIncludeLocal },
                { id: "cro", label: "CRO / Conversion", state: includeCro, set: setIncludeCro },
                { id: "authority", label: "Authority / Links", state: includeAuthority, set: setIncludeAuthority },
                { id: "tracking", label: "Tracking", state: includeTracking, set: setIncludeTracking },
              ].map(({ id, label, state, set }) => (
                <div key={id} className="flex items-center justify-between gap-2">
                  <Label htmlFor={`toggle-${id}`} className="text-xs cursor-pointer">{label}</Label>
                  <Switch id={`toggle-${id}`} checked={state} onCheckedChange={set} data-testid={`switch-${id}`} />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <Button
            className="w-full"
            onClick={() => generateMutation.mutate()}
            disabled={!clientId || generateMutation.isPending}
            data-testid="button-generate-qbr-prep"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : result ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate QBR Prep</>
            )}
          </Button>
        </div>

        {result && (
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
        {!result && !generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">QBR Prep Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client, configure quarters and category toggles, then click Generate. The preview renders your document in real time — click any text to edit before downloading.
              </p>
            </div>
          </div>
        )}

        {generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">Analyzing data sources…</p>
              <p className="text-xs text-muted-foreground">Pulling GSC, GA4, and crawl data — 15–30 seconds.</p>
            </div>
          </div>
        )}

        {result && !generateMutation.isPending && (
          <DocxPreview
            clientName={result.json.client_name}
            reportTitle={result.json.report_title}
            date={new Date(result.json.generated_at).toLocaleDateString("en-US", { dateStyle: "long" })}
            sections={sections}
            edits={edits}
            onEdit={handleEdit}
          />
        )}
      </div>
    </div>
  );
}
