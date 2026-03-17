import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  Loader2,
  BarChart3,
  Globe,
  FileUp,
  Check,
  X,
  PieChart,
  Table2,
  Activity,
  Users,
  AlertTriangle,
  Zap,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client, EvalBatch } from "@shared/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function authedGet(url: string) {
  const headers = await getAuthHeaders();
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
  return r.json();
}

function fmtNum(n: number | string | undefined | null): string {
  if (n === undefined || n === null || n === "" || n === "—") return "—";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
}

const RAW_METRICS = [
  { key: "whoisReg", label: "WHOIS Reg", type: "date", width: 100 },
  { key: "firstArchive", label: "First Archive", type: "date", width: 110 },
  { key: "dr", label: "DR", type: "number", width: 60 },
  { key: "referringDomains", label: "Ref Domains", type: "number", width: 100 },
  { key: "backlinks", label: "Backlinks", type: "number", width: 90 },
  { key: "organicTraffic", label: "Org Traffic", type: "number", width: 100 },
  { key: "organicKeywords", label: "Org Keywords", type: "number", width: 105 },
  { key: "top10Keywords", label: "Top 10 KW", type: "number", width: 95 },
  { key: "indexedPages", label: "Indexed Pg", type: "number", width: 95 },
  { key: "aiVisibilityScore", label: "AI Vis Score", type: "number", width: 100 },
  { key: "aiMentions", label: "AI Mentions", type: "number", width: 98 },
  { key: "citedSources", label: "Cited Sources", type: "number", width: 105 },
  { key: "informationalKeywords", label: "Info KW", type: "number", width: 80 },
  { key: "featuredSnippets", label: "Feat Snippets", type: "number", width: 110 },
];

const DERIVED_METRICS = [
  { key: "age", label: "Age (yrs)" },
  { key: "archiveAge", label: "Archive Age" },
  { key: "kwVelocity", label: "KW Velocity" },
  { key: "snippetVelocity", label: "Snippet Vel." },
  { key: "rdVelocity", label: "RD Velocity" },
  { key: "contentVelocity", label: "Content Vel." },
  { key: "kwYield", label: "KW Yield" },
  { key: "snippetYield", label: "Snip Yield" },
  { key: "mentionRate", label: "Mention Rate" },
  { key: "rdYield", label: "RD Yield" },
  { key: "contentYield", label: "Content Yield" },
  { key: "backlinkDensity", label: "BL Density" },
  { key: "informationalDensity", label: "Info Density" },
  { key: "finalScore", label: "Final Score" },
  { key: "averageRank", label: "Avg Rank" },
];

// ─── Inline Cell Editor ───────────────────────────────────────────────────────

function EditableCell({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  function start() { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 0); }
  function commit() { setEditing(false); if (draft !== value) onChange(draft); }

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
          className="w-full text-xs px-1 py-0.5 border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          type={type === "number" ? "text" : type}
        />
      </div>
    );
  }
  return (
    <div onClick={start} className="cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 text-xs min-w-[40px] min-h-[22px] select-none" title="Click to edit">
      {value || <span className="text-muted-foreground text-[10px]">—</span>}
    </div>
  );
}

function RankBadge({ rank, total }: { rank: string; total: number }) {
  if (!rank || rank === "—") return <span className="text-muted-foreground text-xs">—</span>;
  const n = parseInt(rank);
  if (isNaN(n)) return <span className="text-xs">{rank}</span>;
  const pct = n / total;
  const cls = pct <= 0.3 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : pct <= 0.6 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>#{n}</span>;
}

// ─── Main Evaluation Tab ──────────────────────────────────────────────────────

function MainEvalTab({ batch }: { batch: EvalBatch }) {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/eval-batches", batch.id, "competitors"],
    queryFn: () => authedGet(`/api/eval-batches/${batch.id}/competitors`),
  });

  const addRowMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/eval-batches/${batch.id}/competitors`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "competitors"] }),
  });
  const deleteRowMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/eval-competitor-rows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "competitors"] }),
  });
  const updateCellMut = useMutation({
    mutationFn: ({ id, ...rest }: { id: number; [k: string]: any }) => apiRequest("PATCH", `/api/eval-competitor-rows/${id}`, rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "competitors"] }),
  });

  function handleCellChange(row: any, metricKey: string, value: string) {
    updateCellMut.mutate({ id: row.id, metrics: { ...(row.metrics ?? {}), [metricKey]: value } });
  }

  const total = rows.length;
  if (isLoading) return <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} rows · Click any cell to edit manually</p>
        <Button variant="outline" size="sm" onClick={() => addRowMut.mutate({ isClient: false, name: "", websiteUrl: "", metrics: {}, rowOrder: rows.length })} data-testid="button-add-competitor-row">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px]">
              <TableHead className="w-10 text-center sticky left-0 bg-muted/40 z-10">Type</TableHead>
              <TableHead className="min-w-[120px] sticky left-10 bg-muted/40 z-10">Name</TableHead>
              <TableHead className="min-w-[140px]">Website</TableHead>
              {RAW_METRICS.map(m => <TableHead key={m.key} className="text-center" style={{ minWidth: m.width }}>{m.label}</TableHead>)}
              {DERIVED_METRICS.map(m => <TableHead key={m.key} className="text-center bg-blue-50/50 dark:bg-blue-900/10 min-w-[90px]">{m.label}</TableHead>)}
              <TableHead className="w-10 text-center">Del</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: any) => (
              <TableRow key={row.id} className={row.isClient ? "bg-blue-50/60 dark:bg-blue-900/20 font-medium" : ""} data-testid={`row-eval-${row.id}`}>
                <TableCell className="text-center sticky left-0 bg-background z-10 pr-1">
                  {row.isClient ? <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-300 px-1 py-0">Client</Badge> : <Badge variant="outline" className="text-[9px] px-1 py-0">Comp</Badge>}
                </TableCell>
                <TableCell className="sticky left-10 bg-background z-10 pr-2">
                  <EditableCell value={row.name ?? ""} onChange={v => updateCellMut.mutate({ id: row.id, name: v } as any)} />
                </TableCell>
                <TableCell>
                  <EditableCell value={row.websiteUrl ?? ""} onChange={v => updateCellMut.mutate({ id: row.id, websiteUrl: v } as any)} />
                </TableCell>
                {RAW_METRICS.map(m => (
                  <TableCell key={m.key} className="text-center p-1">
                    <EditableCell value={row.metrics?.[m.key] ?? ""} onChange={v => handleCellChange(row, m.key, v)} type={m.type} />
                  </TableCell>
                ))}
                {DERIVED_METRICS.map(m => (
                  <TableCell key={m.key} className="text-center p-1 bg-blue-50/30 dark:bg-blue-900/10">
                    {m.key === "finalScore" || m.key === "averageRank"
                      ? <RankBadge rank={row.ranks?.[m.key] ?? row.computed?.[m.key] ?? "—"} total={total} />
                      : <span className="text-xs text-muted-foreground">{row.computed?.[m.key] ?? "—"}</span>}
                  </TableCell>
                ))}
                <TableCell className="text-center p-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteRowMut.mutate(row.id)} data-testid={`button-delete-row-${row.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Crawl Data Tab ───────────────────────────────────────────────────────────

function CrawlDataTab({ batch }: { batch: EvalBatch }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/eval-batches", batch.id, "crawl-rows"],
    queryFn: () => authedGet(`/api/eval-batches/${batch.id}/crawl-rows`),
  });
  const { data: imports = [] } = useQuery<any[]>({
    queryKey: ["/api/eval-batches", batch.id, "imports"],
    queryFn: () => authedGet(`/api/eval-batches/${batch.id}/imports`),
  });

  const recomputeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/eval-batches/${batch.id}/recompute-summaries`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "summary"] });
      toast({ title: "Distribution tables refreshed" });
    },
  });

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV has no data rows");
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      const parsedRows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return obj;
      });
      const resp = await apiRequest("POST", `/api/eval-batches/${batch.id}/crawl-rows/upload`, { rows: parsedRows, sourceLabel: file.name });
      const result = await resp.json();
      toast({ title: "Crawl data re-uploaded", description: `${result.inserted} rows imported.` });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "crawl-rows"] });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "imports"] });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "summary"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const crawlHeaders = rows.length > 0 ? Object.keys(rows[0]?.crawlFields ?? {}).slice(0, 12) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{rows.length} pages crawled</p>
          {imports.length > 0 && <Badge variant="outline" className="text-[10px]">Last: {new Date(imports[0]?.createdAt).toLocaleDateString()}</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => recomputeMut.mutate()} disabled={recomputeMut.isPending || rows.length === 0} data-testid="button-recompute-dist">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recomputeMut.isPending ? "animate-spin" : ""}`} /> Recompute
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-upload-crawl">
            <FileUp className="w-3.5 h-3.5 mr-1" /> {uploading ? "Uploading..." : "Re-upload SF"}
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
        </div>
      </div>
      {isLoading ? <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div> : rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No crawl data. Return to Setup to upload Screaming Frog data.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-[10px]">
                <TableHead className="min-w-[260px] sticky left-0 bg-muted/40">URL</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">GSC Clicks</TableHead>
                <TableHead className="text-center">GSC Impressions</TableHead>
                <TableHead className="text-center">GA4 Sessions</TableHead>
                <TableHead className="text-center">Status</TableHead>
                {crawlHeaders.map(h => <TableHead key={h} className="text-center">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 200).map((row: any, i: number) => (
                <TableRow key={row.id ?? i} data-testid={`row-crawl-${i}`}>
                  <TableCell className="text-xs font-mono truncate max-w-[260px] sticky left-0 bg-background">{row.url}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[9px]">{row.pageCategory ?? "—"}</Badge></TableCell>
                  <TableCell className="text-center text-xs">{fmtNum(row.performanceFields?.gscClicks)}</TableCell>
                  <TableCell className="text-center text-xs">{fmtNum(row.performanceFields?.gscImpressions)}</TableCell>
                  <TableCell className="text-center text-xs">{fmtNum(row.performanceFields?.ga4Sessions)}</TableCell>
                  <TableCell className="text-center text-xs">{row.statusCode ?? "—"}</TableCell>
                  {crawlHeaders.map(h => <TableCell key={h} className="text-center text-xs">{String(row.crawlFields?.[h] ?? "—").slice(0, 40)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > 200 && <p className="text-[10px] text-muted-foreground p-2 text-center">Showing 200 of {rows.length} rows</p>}
        </div>
      )}
    </div>
  );
}

// ─── Distribution Tab ─────────────────────────────────────────────────────────

function DistributionTab({ batch, tableType }: { batch: EvalBatch; tableType: "clicks_dist" | "traffic_dist" }) {
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/eval-batches", batch.id, "summary", tableType],
    queryFn: () => authedGet(`/api/eval-batches/${batch.id}/summary/${tableType}`),
  });

  const isClicks = tableType === "clicks_dist";
  const totalVal = rows.reduce((s: number, r: any) => s + (Number(isClicks ? r.data?.sumClicks : r.data?.sumSessions) || 0), 0);

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  if (rows.length === 0) return (
    <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
      <PieChart className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No distribution data yet. Generate the evaluation to populate this.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{rows.length} page categories · {isClicks ? "Organic clicks" : "GA4 sessions"} by category</p>
      <div className="space-y-2">
        {rows.map((r: any) => {
          const val = Number(isClicks ? r.data?.sumClicks : r.data?.sumSessions) || 0;
          const pct = totalVal > 0 ? Math.round((val / totalVal) * 100) : 0;
          return (
            <div key={r.category ?? r.id} className="flex items-center gap-3 text-sm" data-testid={`dist-row-${r.category}`}>
              <div className="w-32 shrink-0 text-xs font-medium truncate">{r.category}</div>
              <div className="flex-1 relative h-5 bg-muted rounded overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-primary/30 rounded" style={{ width: `${pct}%` }} />
                <span className="absolute inset-0 flex items-center pl-2 text-[10px] text-foreground font-medium">{pct}% · {fmtNum(val)} {isClicks ? "clicks" : "sessions"}</span>
              </div>
              <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{r.data?.numPages ?? 0} pages</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Setup Panel (pre-generation) ─────────────────────────────────────────────

function SetupPanel({ batch, clientId, onGenerated }: { batch: EvalBatch; clientId: number; onGenerated: (b: EvalBatch) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: clientComps = [] } = useQuery<any[]>({
    queryKey: ["/api/clients", clientId, "competitors"],
    queryFn: () => authedGet(`/api/clients/${clientId}/competitors`),
    enabled: clientId > 0,
  });

  const { data: imports = [] } = useQuery<any[]>({
    queryKey: ["/api/eval-batches", batch.id, "imports"],
    queryFn: () => authedGet(`/api/eval-batches/${batch.id}/imports`),
  });

  const sfImport = imports.find((i: any) => i.sourceType === "screaming_frog");
  const crawlRowCount = sfImport?.rowCount ?? 0;
  const hasCrawlData = crawlRowCount > 0;

  const generateMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/eval-batches/${batch.id}/generate`),
    onSuccess: async resp => {
      const result = await resp.json();
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", { clientId }] });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "competitors"] });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "summary"] });
      if (result.batch) onGenerated(result.batch);
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "CSV only", description: "Please upload a Screaming Frog CSV export.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV appears empty — no data rows found.");
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      const parsedRows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return obj;
      }).filter(r => r.Address || r.url || r["Page URL"]);

      const resp = await apiRequest("POST", `/api/eval-batches/${batch.id}/crawl-rows/upload`, { rows: parsedRows, sourceLabel: file.name });
      const result = await resp.json();
      toast({ title: "Screaming Frog uploaded", description: `${result.inserted} pages ready.` });
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "imports"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div>
        <h2 className="text-lg font-bold mb-1">{batch.evaluationName}</h2>
        <p className="text-sm text-muted-foreground">Complete the steps below, then click <strong>Generate Evaluation</strong> to auto-populate all sheets.</p>
      </div>

      {/* Step 1: Competitors */}
      <div className="rounded-lg border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
          <div>
            <p className="text-sm font-semibold">Competitor List</p>
            <p className="text-xs text-muted-foreground">Auto-loaded from Client Info</p>
          </div>
          {clientComps.length > 0 ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 ml-auto" />
          )}
        </div>
        {clientComps.length === 0 ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            No competitors found in Client Info. Add competitors in the client's profile, or the evaluation will include only the client row. You can also add rows manually after generation.
          </div>
        ) : (
          <div className="space-y-1">
            {clientComps.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground truncate">{c.url}</span>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-1">{clientComps.length} competitor{clientComps.length !== 1 ? "s" : ""} will be seeded automatically.</p>
          </div>
        )}
      </div>

      {/* Step 2: Screaming Frog Upload */}
      <div className="rounded-lg border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">2</div>
          <div>
            <p className="text-sm font-semibold">Screaming Frog Export</p>
            <p className="text-xs text-muted-foreground">Required — Upload a CSV crawl export</p>
          </div>
          {hasCrawlData ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground ml-auto" />
          )}
        </div>

        {hasCrawlData ? (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> {sfImport?.label ?? "Screaming Frog Upload"}
                </p>
                <p className="text-[10px] text-green-700 dark:text-green-400 mt-0.5">{crawlRowCount.toLocaleString()} pages ready to process</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => fileRef.current?.click()} data-testid="button-reupload-sf">
                Replace
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            data-testid="upload-zone-sf"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Parsing crawl data...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium">Drop Screaming Frog CSV here</p>
                <p className="text-xs text-muted-foreground">or click to browse · CSV format required</p>
              </div>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} data-testid="input-sf-upload" />
      </div>

      {/* Generate Button */}
      <div className="flex flex-col items-center gap-3">
        {!hasCrawlData && (
          <p className="text-xs text-muted-foreground">Upload a Screaming Frog file to enable generation.</p>
        )}
        <Button
          size="lg"
          className="w-full max-w-sm gap-2 text-base"
          onClick={() => generateMut.mutate()}
          disabled={!hasCrawlData || generateMut.isPending}
          data-testid="button-generate-evaluation"
        >
          {generateMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          Generate Evaluation
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Pulls SEMrush data for each competitor · Enriches crawl with GSC + GA4 · Auto-computes all metrics and rankings
        </p>
      </div>
    </div>
  );
}

// ─── Generating Panel ─────────────────────────────────────────────────────────

function GeneratingPanel({ batch, onDone }: { batch: EvalBatch; onDone: (b: EvalBatch) => void }) {
  const qc = useQueryClient();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const headers = await getAuthHeaders();
        const r = await fetch(`/api/eval-batches/${batch.id}/status`, { headers });
        const data = await r.json();
        if (data.enrichmentStatus === "generated" || data.enrichmentStatus === "failed") {
          clearInterval(interval);
          const headers2 = await getAuthHeaders();
          const r2 = await fetch(`/api/eval-batches/${batch.id}`, { headers: headers2 });
          const updated = await r2.json();
          qc.invalidateQueries({ queryKey: ["/api/eval-batches"] });
          onDone(updated);
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [batch.id]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <Zap className="w-6 h-6 text-primary absolute inset-0 m-auto" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">Generating Evaluation...</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Pulling SEMrush data for each competitor, enriching crawl rows with GSC and GA4, computing derived metrics and rankings.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Seeding competitor rows from Client Info</div>
        <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching SEMrush domain data</div>
        <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enriching crawl data with GSC / GA4</div>
        <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Computing rankings and distributions</div>
      </div>
    </div>
  );
}

// ─── Failed Panel ─────────────────────────────────────────────────────────────

function FailedPanel({ batch, clientId, onRetry }: { batch: EvalBatch; clientId: number; onRetry: (b: EvalBatch) => void }) {
  const retryMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/eval-batches/${batch.id}`, { enrichmentStatus: "pending" }),
    onSuccess: async resp => {
      const updated = await resp.json();
      onRetry(updated);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <XCircle className="w-12 h-12 text-destructive opacity-70" />
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-destructive">Generation Failed</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Something went wrong during evaluation generation. Check that all integrations are connected and try again.</p>
      </div>
      <Button variant="outline" onClick={() => retryMut.mutate()} disabled={retryMut.isPending} data-testid="button-retry-generation">
        {retryMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
        Reset & Try Again
      </Button>
    </div>
  );
}

// ─── Generated Panel (4 tabs) ─────────────────────────────────────────────────

function GeneratedPanel({ batch, clientId, onRegenerate }: { batch: EvalBatch; clientId: number; onRegenerate: (b: EvalBatch) => void }) {
  const [activeTab, setActiveTab] = useState("main-eval");

  const regenMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/eval-batches/${batch.id}`, { enrichmentStatus: "pending" }),
    onSuccess: async resp => {
      const updated = await resp.json();
      onRegenerate(updated);
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{batch.evaluationName}</h1>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 text-[10px]">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Generated
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{new Date(batch.evaluationDate).toLocaleDateString()} · {(batch.dataSourcesUsed as string[] ?? []).join(", ") || "Screaming Frog"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => regenMut.mutate()} disabled={regenMut.isPending} data-testid="button-goto-setup">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40">
          <TabsTrigger value="main-eval" data-testid="tab-main-eval"><BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Main Evaluation</TabsTrigger>
          <TabsTrigger value="crawl-data" data-testid="tab-crawl-data"><Globe className="w-3.5 h-3.5 mr-1.5" /> Crawl Data</TabsTrigger>
          <TabsTrigger value="clicks-dist" data-testid="tab-clicks-dist"><Activity className="w-3.5 h-3.5 mr-1.5" /> Clicks Distribution</TabsTrigger>
          <TabsTrigger value="traffic-dist" data-testid="tab-traffic-dist"><PieChart className="w-3.5 h-3.5 mr-1.5" /> Traffic Distribution</TabsTrigger>
        </TabsList>
        <TabsContent value="main-eval" className="mt-4"><MainEvalTab batch={batch} /></TabsContent>
        <TabsContent value="crawl-data" className="mt-4"><CrawlDataTab batch={batch} /></TabsContent>
        <TabsContent value="clicks-dist" className="mt-4"><DistributionTab batch={batch} tableType="clicks_dist" /></TabsContent>
        <TabsContent value="traffic-dist" className="mt-4"><DistributionTab batch={batch} tableType="traffic_dist" /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Batch Detail Router ──────────────────────────────────────────────────────

function BatchDetailPanel({ batch: initialBatch, clientId }: { batch: EvalBatch; clientId: number }) {
  const [batch, setBatch] = useState<EvalBatch>(initialBatch);

  useEffect(() => { setBatch(initialBatch); }, [initialBatch.id, initialBatch.enrichmentStatus]);

  const status = batch.enrichmentStatus;

  if (status === "generating") {
    return <GeneratingPanel batch={batch} onDone={setBatch} />;
  }
  if (status === "generated") {
    return <GeneratedPanel batch={batch} clientId={clientId} onRegenerate={setBatch} />;
  }
  if (status === "failed") {
    return <FailedPanel batch={batch} clientId={clientId} onRetry={setBatch} />;
  }
  return <SetupPanel batch={batch} clientId={clientId} onGenerated={setBatch} />;
}

// ─── Batch List ───────────────────────────────────────────────────────────────

function BatchSelector({ clientId, selected, onSelect }: { clientId: number; selected: EvalBatch | null; onSelect: (b: EvalBatch) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: batches = [], isLoading } = useQuery<EvalBatch[]>({
    queryKey: ["/api/eval-batches", { clientId }],
    queryFn: () => authedGet(`/api/eval-batches?clientId=${clientId}`),
    enabled: clientId > 0,
  });

  const createMut = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/eval-batches", {
        clientId,
        evaluationName: name,
        evaluationDate: new Date().toISOString().slice(0, 10),
        status: "draft",
      }),
    onSuccess: async resp => {
      const batch = await resp.json();
      qc.invalidateQueries({ queryKey: ["/api/eval-batches", { clientId }] });
      setNewName("");
      setCreating(false);
      onSelect(batch);
      toast({ title: "Evaluation batch created", description: batch.evaluationName });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/eval-batches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/eval-batches", { clientId }] }),
  });

  function statusColor(s: string) {
    if (s === "generated") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (s === "generating") return "bg-blue-100 text-blue-700";
    if (s === "failed") return "bg-red-100 text-red-700";
    return "";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Evaluation Batches</Label>
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)} data-testid="button-new-batch">
          <Plus className="w-3.5 h-3.5 mr-1" /> New
        </Button>
      </div>

      {creating && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Mar 2026 Mid-Strategy"
            className="text-sm h-8"
            onKeyDown={e => { if (e.key === "Enter") createMut.mutate(newName); if (e.key === "Escape") setCreating(false); }}
            autoFocus
            data-testid="input-batch-name"
          />
          <Button size="sm" onClick={() => createMut.mutate(newName)} disabled={!newName.trim() || createMut.isPending} data-testid="button-create-batch">
            {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)} data-testid="button-cancel-batch"><X className="w-3.5 h-3.5" /></Button>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground p-2">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed rounded p-3 text-center">No batches yet. Create one above.</div>
      ) : (
        <div className="space-y-1">
          {batches.map(b => (
            <div
              key={b.id}
              onClick={() => onSelect(b)}
              className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer transition-colors border ${selected?.id === b.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted/60 border-transparent"}`}
              data-testid={`item-batch-${b.id}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{b.evaluationName}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className={`text-[9px] ${statusColor(b.enrichmentStatus)}`}>{b.enrichmentStatus}</Badge>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); deleteMut.mutate(b.id); }} data-testid={`button-delete-batch-${b.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvalSheetsPage() {
  const [clientId, setClientId] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<EvalBatch | null>(null);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  return (
    <div className="flex h-full">
      <div className="w-64 border-r bg-muted/20 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Evaluation Sheets</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Competitive benchmarking</p>
        </div>
        <div className="p-3 border-b">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Client</Label>
          <Select value={clientId} onValueChange={v => { setClientId(v); setSelectedBatch(null); }}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-eval-client">
              <SelectValue placeholder="Select a client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {clientId && (
          <div className="p-3 flex-1 overflow-y-auto">
            <BatchSelector clientId={parseInt(clientId)} selected={selectedBatch} onSelect={setSelectedBatch} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!clientId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <BarChart3 className="w-12 h-12 opacity-30" />
            <p className="text-sm">Select a client to get started</p>
          </div>
        ) : !selectedBatch ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Table2 className="w-12 h-12 opacity-30" />
            <p className="text-sm">Select or create an evaluation batch</p>
            <p className="text-xs opacity-70">Each batch represents one evaluation period</p>
          </div>
        ) : (
          <BatchDetailPanel batch={selectedBatch} clientId={parseInt(clientId)} />
        )}
      </div>
    </div>
  );
}
