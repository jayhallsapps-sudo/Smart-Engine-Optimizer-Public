import { useState, useRef } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronDown,
  Loader2,
  BarChart3,
  Globe,
  FileUp,
  Edit3,
  Check,
  X,
  PieChart,
  Table2,
  Activity,
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

// Raw metric keys that users enter manually
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

function EditableCell({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
          className="w-full text-xs px-1 py-0.5 border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          type={type === "number" ? "text" : type}
        />
      </div>
    );
  }

  return (
    <div
      onClick={start}
      className="cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 text-xs min-w-[40px] min-h-[22px] select-none"
      title="Click to edit"
    >
      {value || <span className="text-muted-foreground text-[10px]">—</span>}
    </div>
  );
}

// ─── Rank badge ───────────────────────────────────────────────────────────────

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
  const { toast } = useToast();
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
    mutationFn: ({ id, ...rest }: { id: number; [k: string]: any }) =>
      apiRequest("PATCH", `/api/eval-competitor-rows/${id}`, rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/eval-batches", batch.id, "competitors"] }),
  });

  function handleCellChange(row: any, metricKey: string, value: string) {
    const updated = { ...(row.metrics ?? {}), [metricKey]: value };
    updateCellMut.mutate({ id: row.id, metrics: updated });
  }

  function handleAddRow(isClient: boolean) {
    addRowMut.mutate({ isClient, name: isClient ? "Client" : "", websiteUrl: "", metrics: {}, rowOrder: rows.length });
  }

  const total = rows.length;

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} rows · Click any cell to edit</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAddRow(true)} data-testid="button-add-client-row">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Client Row
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAddRow(false)} data-testid="button-add-competitor-row">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Competitor
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px]">
              <TableHead className="w-10 text-center sticky left-0 bg-muted/40 z-10">Type</TableHead>
              <TableHead className="min-w-[120px] sticky left-10 bg-muted/40 z-10">Name</TableHead>
              <TableHead className="min-w-[140px]">Website</TableHead>
              {RAW_METRICS.map(m => (
                <TableHead key={m.key} className="text-center" style={{ minWidth: m.width }}>{m.label}</TableHead>
              ))}
              {DERIVED_METRICS.map(m => (
                <TableHead key={m.key} className="text-center bg-blue-50/50 dark:bg-blue-900/10 min-w-[90px]">{m.label}</TableHead>
              ))}
              <TableHead className="w-10 text-center">Del</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: any) => (
              <TableRow
                key={row.id}
                className={row.isClient ? "bg-blue-50/60 dark:bg-blue-900/20 font-medium" : ""}
                data-testid={`row-eval-${row.id}`}
              >
                <TableCell className="text-center sticky left-0 bg-background z-10 pr-1">
                  {row.isClient ? (
                    <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-300 px-1 py-0">Client</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">Comp</Badge>
                  )}
                </TableCell>
                <TableCell className="sticky left-10 bg-background z-10 pr-2">
                  <EditableCell
                    value={row.name ?? ""}
                    onChange={v => updateCellMut.mutate({ id: row.id, name: v } as any)}
                  />
                </TableCell>
                <TableCell>
                  <EditableCell
                    value={row.websiteUrl ?? ""}
                    onChange={v => updateCellMut.mutate({ id: row.id, websiteUrl: v } as any)}
                  />
                </TableCell>
                {RAW_METRICS.map(m => (
                  <TableCell key={m.key} className="text-center p-1">
                    <EditableCell
                      value={row.metrics?.[m.key] ?? ""}
                      onChange={v => handleCellChange(row, m.key, v)}
                      type={m.type}
                    />
                  </TableCell>
                ))}
                {DERIVED_METRICS.map(m => (
                  <TableCell key={m.key} className="text-center p-1 bg-blue-50/30 dark:bg-blue-900/10">
                    {m.key === "finalScore" || m.key === "averageRank" ? (
                      <RankBadge rank={row.ranks?.[m.key] ?? row.computed?.[m.key] ?? "—"} total={total} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{row.computed?.[m.key] ?? "—"}</span>
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-center p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRowMut.mutate(row.id)}
                    data-testid={`button-delete-row-${row.id}`}
                  >
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
      toast({ title: "Distribution tables refreshed", description: "Clicks & Traffic distribution updated." });
    },
  });

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      let rows: any[] = [];

      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length < 2) throw new Error("CSV has no data rows");
        const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
        rows = lines.slice(1).map(line => {
          const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
          return obj;
        });
      } else {
        throw new Error("Please upload a CSV file (Screaming Frog export).");
      }

      const resp = await apiRequest("POST", `/api/eval-batches/${batch.id}/crawl-rows/upload`, {
        rows,
        sourceLabel: file.name,
      });
      const result = await resp.json();
      toast({ title: "Crawl data uploaded", description: `${result.inserted} rows imported. Distributions rebuilt.` });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{rows.length} pages crawled</p>
          {imports.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              Last import: {new Date(imports[0]?.createdAt).toLocaleDateString()}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeMut.mutate()}
            disabled={recomputeMut.isPending || rows.length === 0}
            data-testid="button-recompute-dist"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recomputeMut.isPending ? "animate-spin" : ""}`} />
            Recompute
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-crawl"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            Upload SF CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <FileUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No crawl data yet. Upload a Screaming Frog CSV export above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-[10px]">
                <TableHead className="min-w-[280px]">URL</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Page Title</TableHead>
                <TableHead className="text-center">Words</TableHead>
                <TableHead className="text-center">Inlinks</TableHead>
                <TableHead className="text-center">Depth</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 500).map((row: any) => (
                <TableRow key={row.id} data-testid={`row-crawl-${row.id}`}>
                  <TableCell className="text-xs max-w-xs truncate">
                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 dark:text-blue-400">
                      {row.url}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{row.pageCategory || "Other"}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs font-mono ${row.statusCode === 200 ? "text-green-600" : "text-red-500"}`}>
                      {row.statusCode ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{row.pageTitle ?? "—"}</TableCell>
                  <TableCell className="text-center text-xs">{row.wordCount ?? "—"}</TableCell>
                  <TableCell className="text-center text-xs">{row.inlinks ?? "—"}</TableCell>
                  <TableCell className="text-center text-xs">{row.crawlDepth ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > 500 && (
            <p className="text-center text-xs text-muted-foreground py-2">Showing 500 of {rows.length} rows</p>
          )}
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

  const headers = isClicks
    ? ["Page Category", "# of Pages", "Sum of Clicks", "Clicks per Page", "Share of GSC Clicks (%)"]
    : ["Page Category", "# of Pages", "Sum of Total Sessions", "Sessions per Page", "Share of Sessions (%)"];

  const total = rows.reduce((s: number, r: any) => s + (isClicks ? (r.data?.sumClicks ?? 0) : (r.data?.sumSessions ?? 0)), 0);

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  if (rows.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No distribution data yet. Upload crawl data first, then click Recompute on the Crawl Data tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {rows.length} categories · Total {isClicks ? "clicks" : "sessions"}: {total.toLocaleString()}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {headers.map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: any) => {
              const d = row.data ?? {};
              const share = isClicks ? d.shareOfClicks : d.shareOfSessions;
              const shareVal = typeof share === "number" ? share : parseFloat(share ?? "0");
              return (
                <TableRow key={row.id ?? row.category} data-testid={`row-dist-${row.category}`}>
                  <TableCell className="font-medium text-sm">{row.category}</TableCell>
                  <TableCell className="text-sm">{isClicks ? d.numPages : d.numPages}</TableCell>
                  <TableCell className="text-sm">{isClicks ? fmtNum(d.sumClicks) : fmtNum(d.sumSessions)}</TableCell>
                  <TableCell className="text-sm">{isClicks ? fmtNum(d.clicksPerPage) : fmtNum(d.sessionsPerPage)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.min(100, shareVal)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">{shareVal.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Batch List ───────────────────────────────────────────────────────────────

function BatchSelector({
  clientId,
  selected,
  onSelect,
}: {
  clientId: number;
  selected: EvalBatch | null;
  onSelect: (b: EvalBatch) => void;
}) {
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
            placeholder="Batch name (e.g. Mar 2026 Mid-Strategy)"
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
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed rounded p-3 text-center">No batches yet. Create one above.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {batches.map(b => (
            <div
              key={b.id}
              className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${selected?.id === b.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/60 border border-transparent"}`}
              onClick={() => onSelect(b)}
              data-testid={`item-batch-${b.id}`}
            >
              <div>
                <p className="text-sm font-medium">{b.evaluationName}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={e => { e.stopPropagation(); deleteMut.mutate(b.id); }}
                  data-testid={`button-delete-batch-${b.id}`}
                >
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
  const [activeTab, setActiveTab] = useState("main-eval");

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients.find(c => c.id === parseInt(clientId));

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
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
            <BatchSelector
              clientId={parseInt(clientId)}
              selected={selectedBatch}
              onSelect={setSelectedBatch}
            />
          </div>
        )}
      </div>

      {/* Main content */}
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
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{selectedBatch.evaluationName}</h1>
                <p className="text-sm text-muted-foreground">{selectedClient?.name} · Created {new Date(selectedBatch.createdAt).toLocaleDateString()}</p>
              </div>
              <Badge data-testid={`status-batch-${selectedBatch.id}`}>{selectedBatch.status}</Badge>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-muted/40">
                <TabsTrigger value="main-eval" data-testid="tab-main-eval">
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Main Evaluation
                </TabsTrigger>
                <TabsTrigger value="crawl-data" data-testid="tab-crawl-data">
                  <Globe className="w-3.5 h-3.5 mr-1.5" /> Crawl Data
                </TabsTrigger>
                <TabsTrigger value="clicks-dist" data-testid="tab-clicks-dist">
                  <Activity className="w-3.5 h-3.5 mr-1.5" /> Clicks Distribution
                </TabsTrigger>
                <TabsTrigger value="traffic-dist" data-testid="tab-traffic-dist">
                  <PieChart className="w-3.5 h-3.5 mr-1.5" /> Traffic Distribution
                </TabsTrigger>
              </TabsList>

              <TabsContent value="main-eval" className="mt-4">
                <MainEvalTab batch={selectedBatch} />
              </TabsContent>

              <TabsContent value="crawl-data" className="mt-4">
                <CrawlDataTab batch={selectedBatch} />
              </TabsContent>

              <TabsContent value="clicks-dist" className="mt-4">
                <DistributionTab batch={selectedBatch} tableType="clicks_dist" />
              </TabsContent>

              <TabsContent value="traffic-dist" className="mt-4">
                <DistributionTab batch={selectedBatch} tableType="traffic_dist" />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
