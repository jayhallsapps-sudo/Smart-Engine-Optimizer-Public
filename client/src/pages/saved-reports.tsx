import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { History, ArrowRight, Trash2, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client, SavedReport } from "@shared/schema";

const TYPE_LABELS: Record<string, string> = {
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  qbr_full: "QBR",
  qbr_prep: "QBS",
  mid_strategy: "Mid-Strategy",
};

const TYPE_COLORS: Record<string, string> = {
  biweekly: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  monthly: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  qbr_full: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  qbr_prep: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  mid_strategy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const TYPE_NORMALIZE: Record<string, string> = {
  qbr: "qbr_full",
  mid_strategy_seo: "mid_strategy",
};

function normalizeType(t: string): string {
  return TYPE_NORMALIZE[t] ?? t;
}

function loadHref(report: SavedReport): string {
  const base = `?client=${report.clientId}&load=${report.id}`;
  switch (normalizeType(report.reportType)) {
    case "biweekly":     return `/biweekly${base}`;
    case "monthly":      return `/monthly${base}`;
    case "qbr_prep":     return `/qbr-prep${base}`;
    case "qbr_full":     return `/qbr${base}`;
    case "mid_strategy": return `/mid-strategy${base}`;
    default:             return `/biweekly${base}`;
  }
}

export default function SavedReportsPage() {
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const queryKey = clientFilter !== "all"
    ? [`/api/saved-reports?clientId=${clientFilter}`]
    : ["/api/saved-reports"];

  const { data: reports = [], isLoading } = useQuery<SavedReport[]>({ queryKey });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => {
        const k = q.queryKey[0];
        return typeof k === "string" && k.includes("/api/saved-reports");
      }});
      toast({ title: "Report deleted" });
    },
    onError: () => toast({ title: "Could not delete report", variant: "destructive" }),
  });

  const filtered = reports
    .filter(r => typeFilter === "all" || normalizeType(r.reportType) === typeFilter)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.lastSavedAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.lastSavedAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });

  const grouped: Record<string, SavedReport[]> = {};
  for (const r of filtered) {
    const key = normalizeType(r.reportType);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const clientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client ${id}`;

  function formatSavedAt(ts: string | Date | null | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts as string);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b px-5 py-3 flex items-center gap-3">
        <History className="w-4 h-4 text-[#7C3AED]" />
        <h1 className="text-sm font-semibold">Past Reports</h1>
        <div className="ml-auto flex items-center gap-2">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-7 text-xs w-44" data-testid="select-client-filter">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-type-filter">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center text-muted-foreground">
            <History className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No saved reports found</p>
            <p className="text-xs mt-1">Generate a report from the Bi-Weekly or other modules — it will auto-save here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([type, rows]) => (
              <div key={type}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  {TYPE_LABELS[type] ?? type}
                </h2>
                <div className="space-y-1.5">
                  {rows.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-md border bg-card px-4 py-2.5 hover:bg-muted/40 transition-colors"
                      data-testid={`saved-report-${r.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{r.reportName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[normalizeType(r.reportType)] ?? "bg-muted text-muted-foreground"}`}>
                            {TYPE_LABELS[normalizeType(r.reportType)] ?? r.reportType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {formatSavedAt(r.lastSavedAt)}
                          </span>
                          <span>{clientName(r.clientId)}</span>
                        </div>
                      </div>
                      <Link href={loadHref(r)}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 shrink-0"
                          data-testid={`btn-open-report-${r.id}`}
                        >
                          Open <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          if (confirm("Delete this saved report?")) deleteMut.mutate(r.id);
                        }}
                        data-testid={`btn-delete-report-${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
