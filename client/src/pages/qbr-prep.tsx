import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Copy,
  ExternalLink,
  BarChart3,
  Globe,
  MapPin,
  TrendingUp,
  Link2,
  Activity,
  Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  P1: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  P2: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
};

const IMPACT_COLORS: Record<string, string> = {
  High: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Med: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const EFFORT_LABELS: Record<string, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

const CATEGORY_ICONS: Record<string, any> = {
  "Content Opportunities": Globe,
  "Technical SEO Opportunities": Activity,
  "Local / GBP Opportunities": MapPin,
  "CRO / Conversion Opportunities": TrendingUp,
  "Authority / Links Opportunities": Link2,
  "Tracking / Measurement Opportunities": BarChart3,
};

function OpportunityCard({ opp, index }: { opp: Opportunity; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors group"
          data-testid={`card-opportunity-${index}`}
        >
          <span className="text-xs font-semibold text-muted-foreground mt-0.5 w-5 shrink-0">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[opp.priority] ?? ""}`}
              >
                {opp.priority}
              </span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${IMPACT_COLORS[opp.impact] ?? ""}`}
              >
                {opp.impact} Impact
              </span>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                Effort: {EFFORT_LABELS[opp.effort] ?? opp.effort}
              </span>
              <span className="text-[10px] text-muted-foreground">KPI: {opp.kpi_affected}</span>
            </div>
            <p className="text-sm font-medium leading-snug">{opp.opportunity_title}</p>
          </div>
          <div className="shrink-0 text-muted-foreground mt-0.5">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-8 mt-1 mb-2 space-y-2 border-l-2 border-muted pl-3">
          {opp.urls.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">URL(s)</p>
              <div className="flex flex-wrap gap-1">
                {opp.urls.map((u, i) => (
                  <span key={i} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-xs" title={u}>
                    {u.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Evidence</p>
            <p className="text-xs text-muted-foreground">{opp.evidence}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Problem</p>
            <p className="text-xs">{opp.problem}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Opportunity</p>
            <p className="text-xs">{opp.opportunity}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Why It Matters</p>
            <p className="text-xs">{opp.why_it_matters}</p>
          </div>
          <div className="p-2 rounded bg-primary/5 border border-primary/10">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Recommended Next Step</p>
            <p className="text-xs font-medium">{opp.recommended_next_step}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CategorySection({ cat }: { cat: OpportunityCategory }) {
  const [open, setOpen] = useState(true);
  const Icon = CATEGORY_ICONS[cat.category_name] ?? BarChart3;
  const p0Count = cat.opportunities.filter(o => o.priority === "P0").length;
  const p1Count = cat.opportunities.filter(o => o.priority === "P1").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid={`section-category-${cat.category_name.toLowerCase().replace(/\s+/g, "-")}`}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-sm flex-1">{cat.category_name}</span>
          <div className="flex items-center gap-1.5">
            {p0Count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS.P0}`}>{p0Count} P0</span>
            )}
            {p1Count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS.P1}`}>{p1Count} P1</span>
            )}
            <span className="text-[10px] text-muted-foreground">{cat.opportunities.length} items</span>
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1.5 pb-2 pl-1">
          {cat.opportunities.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-6 py-2">No opportunities identified.</p>
          ) : (
            cat.opportunities.map((opp, i) => (
              <OpportunityCard key={i} opp={opp} index={i} />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function QbrPrepPage() {
  const { toast } = useToast();

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

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients.find(c => String(c.id) === clientId);

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
      });
      return res.json();
    },
    onSuccess: (data: QbrPrepOutput) => {
      setResult(data);
      toast({ title: "Report generated", description: "QBR Prep report is ready." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No report to upload");
      const res = await apiRequest("POST", "/api/reports/qbr-prep/upload-to-drive", {
        markdown: result.markdown,
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
            Open in Google Docs <ExternalLink className="w-3 h-3" />
          </a>
        ) as any,
      });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const downloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const clientSlug = (selectedClient?.name ?? "client").toLowerCase().replace(/\s+/g, "_");
    a.download = `${clientSlug}_qbr_prep_${pastQuarter.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.json, null, 2));
    toast({ title: "JSON copied to clipboard" });
  };

  const totalOpps = result
    ? result.json.opportunity_backlog.reduce((s, c) => s + c.opportunities.length, 0)
    : 0;

  const p0Count = result
    ? result.json.opportunity_backlog.flatMap(c => c.opportunities).filter(o => o.priority === "P0").length
    : 0;

  const p1Count = result
    ? result.json.opportunity_backlog.flatMap(c => c.opportunities).filter(o => o.priority === "P1").length
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              QBR Prep
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate a structured opportunity backlog for your next quarterly business review
            </p>
          </div>
          {result && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadMarkdown} data-testid="button-download-markdown">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download .md
              </Button>
              <Button variant="outline" size="sm" onClick={copyJson} data-testid="button-copy-json">
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy JSON
              </Button>
              <Button
                size="sm"
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
                data-testid="button-upload-to-drive"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                )}
                Save to Google Drive
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 border-r overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Configuration</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Client</Label>
                <Select value={clientId} onValueChange={setClientId} data-testid="select-client">
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
                <Select value={pastQuarter} onValueChange={setPastQuarter} data-testid="select-past-quarter">
                  <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-past-quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAST_QUARTER_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} data-testid={`option-past-${o.value}`}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Future Quarter (Planning Label)</Label>
                <Select value={futureQuarter} onValueChange={setFutureQuarter} data-testid="select-future-quarter">
                  <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-future-quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUTURE_QUARTER_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} data-testid={`option-future-${o.value}`}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Opportunities per Category (cap)</Label>
                <Select value={opportunityCapPerCategory} onValueChange={setOpportunityCapPerCategory} data-testid="select-cap">
                  <SelectTrigger className="h-8 text-xs" data-testid="trigger-select-cap">
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
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Settings2 className="w-3 h-3" />
              Category Toggles
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
                  <Switch
                    id={`toggle-${id}`}
                    checked={state}
                    onCheckedChange={set}
                    data-testid={`switch-${id}`}
                  />
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
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate QBR Prep
              </>
            )}
          </Button>
          {!clientId && (
            <p className="text-[10px] text-muted-foreground text-center">Select a client to generate</p>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          {!result && !generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Ready to generate</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a client and quarter windows on the left, then click Generate.
                </p>
              </div>
              <div className="mt-2 text-xs text-muted-foreground max-w-sm space-y-1">
                <p>The report pulls live data from GSC, GA4, CallRail, Screaming Frog, and GBP — any source not connected is marked "Not available" and still generates guidance.</p>
              </div>
            </div>
          )}

          {generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">Analyzing data sources…</p>
              <p className="text-sm text-muted-foreground">Pulling GSC, GA4, and crawl data — this may take 15–30 seconds.</p>
            </div>
          )}

          {result && !generateMutation.isPending && (
            <div className="space-y-4 max-w-4xl">
              <div>
                <h2 className="text-base font-bold" data-testid="text-report-title">{result.json.report_title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analysis window: <span className="font-medium">{result.json.past_window_label}</span> ({result.json.past_start} → {result.json.past_end})
                  &nbsp;·&nbsp;Planning: <span className="font-medium">{result.json.future_window_label}</span>
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {totalOpps} Opportunities
                </div>
                {p0Count > 0 && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${PRIORITY_COLORS.P0}`}>
                    <AlertTriangle className="w-3 h-3" />
                    {p0Count} P0 Critical
                  </div>
                )}
                {p1Count > 0 && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${PRIORITY_COLORS.P1}`}>
                    {p1Count} P1 High
                  </div>
                )}
              </div>

              <Card className="p-4 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Executive Summary
                </h3>

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Top Wins — {result.json.past_window_label}
                  </p>
                  <div className="space-y-2">
                    {result.json.executive_summary.wins.map((win, i) => (
                      <div key={i} className="flex gap-2 items-start" data-testid={`card-win-${i}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium">{win.title}</p>
                          <p className="text-[10px] text-muted-foreground">{win.evidence}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Top Opportunities for {result.json.future_window_label}
                  </p>
                  <div className="space-y-1.5">
                    {result.json.executive_summary.top_opportunities.map((opp, i) => (
                      <div key={i} className="flex items-start gap-2" data-testid={`card-top-opp-${i}`}>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[opp.priority] ?? ""}`}>
                          {opp.priority}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{opp.title}</p>
                          <p className="text-[10px] text-muted-foreground">{opp.category} · KPI: {opp.kpi}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Opportunity Backlog
                </h3>
                <Card className="divide-y">
                  {result.json.opportunity_backlog.map((cat, i) => (
                    <div key={i} className="p-2">
                      <CategorySection cat={cat} />
                    </div>
                  ))}
                </Card>
              </div>

              <div className="flex items-center gap-2 pt-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={downloadMarkdown} data-testid="button-download-markdown-bottom">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Markdown
                </Button>
                <Button variant="outline" size="sm" onClick={copyJson} data-testid="button-copy-json-bottom">
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy JSON
                </Button>
                <Button
                  size="sm"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending}
                  data-testid="button-upload-to-drive-bottom"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save to Google Drive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-regenerate"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
