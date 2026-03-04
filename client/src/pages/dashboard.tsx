import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  LayoutDashboard,
} from "lucide-react";
import type { Client } from "@shared/schema";

const PERIOD_OPTIONS = [
  { value: "last_28_vs_prev_28", label: "Last 28 days" },
  { value: "last_90_vs_prev_90", label: "Last 90 days" },
  { value: "last_365_vs_prev_365", label: "Last 365 days" },
  { value: "qtd", label: "Quarter to date" },
] as const;

type PeriodValue = typeof PERIOD_OPTIONS[number]["value"];

interface DashboardMetric {
  label: string;
  value: string | number;
  previous: string | number;
  delta: string;
  deltaPercent: string;
  isPositive: boolean;
  unit?: string;
  group: string;
}

interface ClientDashboardData {
  clientId: number;
  clientName: string;
  lastUpdated: string;
  connectedServices: string[];
  metrics: DashboardMetric[];
}

const SERVICE_LABELS: Record<string, { label: string; color: string }> = {
  gsc: { label: "GSC", color: "bg-blue-600" },
  ga4: { label: "GA4", color: "bg-orange-500" },
  callrail: { label: "CallRail", color: "bg-green-600" },
  ctm: { label: "CTM", color: "bg-teal-600" },
  semrush: { label: "SEMrush", color: "bg-red-600" },
  gbp: { label: "GBP", color: "bg-blue-500" },
  airtable: { label: "Airtable", color: "bg-cyan-700" },
};

const GROUP_ORDER = ["GSC", "GA4", "Calls"];
const GROUP_COLORS: Record<string, string> = {
  GSC: "text-blue-600 dark:text-blue-400",
  GA4: "text-orange-500 dark:text-orange-400",
  Calls: "text-green-600 dark:text-green-400",
};

function formatValue(value: string | number, unit?: string): string {
  if (unit === "pos" || unit === "%") return String(value);
  const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(num)) return String(value);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(value);
}

function MetricTile({ metric }: { metric: DashboardMetric }) {
  const isNeutral = metric.deltaPercent === "—" || metric.deltaPercent === "0%" || metric.delta === "—";
  const TrendIcon = isNeutral ? Minus : metric.isPositive ? TrendingUp : TrendingDown;
  const trendColor = isNeutral
    ? "text-muted-foreground"
    : metric.isPositive
    ? "text-emerald-500"
    : "text-red-500";

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border bg-card p-3"
      data-testid={`tile-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
        {metric.label}
      </p>
      <p className="text-xl font-bold tracking-tight leading-none">
        {formatValue(metric.value, metric.unit)}
        {metric.unit === "%" && <span className="text-sm font-normal ml-0.5">%</span>}
      </p>
      <div className={`flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
        <TrendIcon className="w-3 h-3 shrink-0" />
        <span>{isNeutral ? "No change" : `${metric.deltaPercent} vs prior`}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Prior: {formatValue(metric.previous, metric.unit)}
      </p>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  );
}

function ClientCard({ client, dateRange, onRefresh }: { client: Client; dateRange: string; onRefresh?: () => void }) {
  const [data, setData] = useState<ClientDashboardData | null>(null);

  const mutation = useMutation<ClientDashboardData, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dashboard/client/${client.id}`, { dateRange });
      return res.json();
    },
    onSuccess: (result) => {
      setData(result);
      onRefresh?.();
    },
  });

  const load = useCallback(() => {
    mutation.mutate();
  }, [client.id]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = GROUP_ORDER.map(group => ({
    group,
    metrics: (data?.metrics ?? []).filter(m => m.group === group),
  })).filter(g => g.metrics.length > 0);

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const connectedServices = data?.connectedServices ?? [];

  return (
    <div
      className="rounded-xl border bg-card shadow-sm flex flex-col gap-0 overflow-hidden"
      data-testid={`card-client-${client.id}`}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b">
        <div className="min-w-0">
          <h3
            className="font-semibold text-sm leading-tight truncate"
            data-testid={`text-client-name-${client.id}`}
          >
            {client.name}
          </h3>
          {lastUpdated && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Refreshed at {lastUpdated}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {connectedServices.map(svc => {
              const cfg = SERVICE_LABELS[svc];
              if (!cfg) return null;
              return (
                <span
                  key={svc}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold text-white ${cfg.color}`}
                  data-testid={`badge-service-${svc}-${client.id}`}
                >
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-7 w-7"
          onClick={load}
          disabled={mutation.isPending}
          data-testid={`button-refresh-client-${client.id}`}
          title="Refresh this client"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${mutation.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {mutation.isPending && !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <MetricSkeleton key={i} />
            ))}
          </div>
        ) : grouped.length > 0 ? (
          grouped.map(({ group, metrics }) => (
            <div key={group}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${GROUP_COLORS[group] ?? "text-muted-foreground"}`}>
                {group}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {metrics.map(m => (
                  <MetricTile key={`${group}-${m.label}`} metric={m} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">No metrics available</p>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [lastGlobalRefresh, setLastGlobalRefresh] = useState<Date | null>(null);
  const [period, setPeriod] = useState<PeriodValue>("last_28_vs_prev_28");

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const handleGlobalRefresh = useCallback(() => {
    setGlobalRefreshing(true);
    setRefreshKey(k => k + 1);
    setTimeout(() => {
      setGlobalRefreshing(false);
      setLastGlobalRefresh(new Date());
    }, 1500);
  }, []);

  const handlePeriodChange = useCallback((val: string) => {
    setPeriod(val as PeriodValue);
    setRefreshKey(k => k + 1);
    setLastGlobalRefresh(null);
  }, []);

  const lastRefreshLabel = lastGlobalRefresh
    ? lastGlobalRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold leading-tight" data-testid="text-page-title">
              Dashboard
            </h1>
            {lastRefreshLabel && (
              <p className="text-[10px] text-muted-foreground">
                Last refreshed at {lastRefreshLabel}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`option-period-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleGlobalRefresh}
            disabled={globalRefreshing || clientsLoading}
            size="sm"
            variant="outline"
            className="gap-2 h-8"
            data-testid="button-refresh-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${globalRefreshing ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {clientsLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <MetricSkeleton key={j} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !clients || clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
            <Users className="w-12 h-12 text-muted-foreground opacity-40" />
            <div>
              <p className="font-semibold text-sm">No clients yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first client to start seeing metrics here.
              </p>
            </div>
            <Link href="/clients">
              <Button size="sm" data-testid="button-add-first-client">
                Add a Client
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {clients.map(client => (
              <ClientCard key={`${client.id}-${period}-${refreshKey}`} client={client} dateRange={period} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
