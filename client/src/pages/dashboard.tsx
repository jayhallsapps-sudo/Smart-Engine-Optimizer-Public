import { useState, useCallback, useEffect, useMemo } from "react";
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
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from "recharts";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  LayoutDashboard,
  BarChart2,
} from "lucide-react";
import type { Client } from "@shared/schema";

const PERIOD_OPTIONS = [
  { value: "last_28_vs_prev_28", label: "Last 28 days" },
  { value: "last_90_vs_prev_90", label: "Last 90 days" },
  { value: "last_365_vs_prev_365", label: "Last 365 days" },
  { value: "qtd", label: "Quarter to date" },
] as const;

type PeriodValue = typeof PERIOD_OPTIONS[number]["value"];

const CLIENT_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

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

function parseVal(v: string | number): number {
  if (typeof v === "number") return v;
  const cleaned = v.toString().replace(/,/g, "").replace(/%$/, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

function isChartable(metric: DashboardMetric): boolean {
  const n = parseVal(metric.value);
  return !isNaN(n);
}

function formatValue(value: string | number, unit?: string): string {
  if (unit === "pos") return String(value);
  const num = parseVal(value);
  if (isNaN(num)) return String(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  if (unit === "%") return `${value}%`;
  return String(value);
}

function hexWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function MetricTile({ metric }: { metric: DashboardMetric }) {
  const isNeutral =
    metric.deltaPercent === "—" || metric.deltaPercent === "0%" || metric.delta === "—";
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

function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length <= 2 ? name : words.slice(0, 2).join(" ");
}

function DashboardChart({
  clientData,
  selectedIds,
  chartMetric,
  onMetricChange,
  colorMap,
  allMetricLabels,
}: {
  clientData: Map<number, ClientDashboardData>;
  selectedIds: Set<number>;
  chartMetric: string;
  onMetricChange: (m: string) => void;
  colorMap: Map<number, string>;
  allMetricLabels: string[];
}) {
  const visibleIds =
    selectedIds.size > 0
      ? Array.from(selectedIds)
      : Array.from(clientData.keys());

  const chartData = visibleIds
    .map(id => {
      const d = clientData.get(id);
      if (!d) return null;
      const metric = d.metrics.find(m => m.label === chartMetric);
      const current = metric ? parseVal(metric.value) : 0;
      const previous = metric ? parseVal(metric.previous) : 0;
      return {
        clientId: id,
        name: shortName(d.clientName),
        color: colorMap.get(id) ?? "#888",
        current: isNaN(current) ? 0 : current,
        previous: isNaN(previous) ? 0 : previous,
      };
    })
    .filter(Boolean) as { clientId: number; name: string; color: string; current: number; previous: number }[];

  const isEmpty = chartData.length === 0 || chartData.every(d => d.current === 0 && d.previous === 0);

  const formatTick = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div className="shrink-0 border-b bg-card">
      <div className="flex items-center justify-between px-6 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {selectedIds.size > 0
              ? `${selectedIds.size} client${selectedIds.size > 1 ? "s" : ""} selected`
              : "All clients"}
          </span>
          {selectedIds.size > 0 && (
            <span className="text-[11px] text-muted-foreground">— click a card to deselect</span>
          )}
        </div>
        <Select value={chartMetric} onValueChange={onMetricChange}>
          <SelectTrigger className="h-7 w-[170px] text-xs" data-testid="select-chart-metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allMetricLabels.map(label => (
              <SelectItem key={label} value={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="px-4 pb-4" style={{ height: 240 }}>
        {isEmpty || clientData.size === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
            <BarChart2 className="w-4 h-4 opacity-40" />
            <span>
              {clientData.size === 0
                ? "Loading data…"
                : "No data for this metric"}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
              barCategoryGap="20%"
              barGap={3}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                type="number"
                tickFormatter={formatTick}
                tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.8 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid rgba(128,128,128,0.2)",
                  background: "var(--background, #fff)",
                  color: "var(--foreground, #000)",
                  padding: "6px 10px",
                }}
                formatter={(value: number, name: string) => [
                  formatTick(value),
                  name === "current" ? "Current" : "Prior period",
                ]}
                labelFormatter={(label) => label}
              />
              <Legend
                verticalAlign="bottom"
                height={24}
                iconSize={10}
                formatter={(value) => (
                  <span style={{ fontSize: 10, opacity: 0.7 }}>
                    {value === "current" ? "Current period" : "Prior period"}
                  </span>
                )}
              />
              <Bar dataKey="current" name="current" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {chartData.map(entry => (
                  <Cell key={`cur-${entry.clientId}`} fill={entry.color} />
                ))}
              </Bar>
              <Bar dataKey="previous" name="previous" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {chartData.map(entry => (
                  <Cell key={`pre-${entry.clientId}`} fill={hexWithOpacity(entry.color, 0.28)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  color,
  isSelected,
  onSelect,
  onDataLoaded,
  dateRange,
}: {
  client: Client;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onDataLoaded: (data: ClientDashboardData) => void;
  dateRange: string;
}) {
  const [data, setData] = useState<ClientDashboardData | null>(null);

  const mutation = useMutation<ClientDashboardData, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dashboard/client/${client.id}`, { dateRange });
      return res.json();
    },
    onSuccess: (result) => {
      setData(result);
      onDataLoaded(result);
    },
  });

  const load = useCallback(() => {
    mutation.mutate();
  }, [client.id, dateRange]);

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
      className={`rounded-xl border bg-card shadow-sm flex flex-col gap-0 overflow-hidden cursor-pointer transition-all duration-150 ${
        isSelected
          ? "ring-2 shadow-md"
          : "hover:shadow-md hover:border-border/80"
      }`}
      style={
        isSelected
          ? { borderColor: color, ringColor: color, boxShadow: `0 0 0 2px ${hexWithOpacity(color, 0.5)}` }
          : {}
      }
      onClick={onSelect}
      data-testid={`card-client-${client.id}`}
      role="button"
      aria-pressed={isSelected}
    >
      <div
        className="h-1 w-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 border-b">
        <div className="min-w-0">
          <h3
            className="font-semibold text-sm leading-tight truncate"
            style={{ color }}
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
          onClick={e => { e.stopPropagation(); load(); }}
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
  const [period, setPeriod] = useState<PeriodValue>("last_28_vs_prev_28");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [clientData, setClientData] = useState<Map<number, ClientDashboardData>>(new Map());
  const [chartMetric, setChartMetric] = useState("Total Clicks");

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const colorMap = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    (clients ?? []).forEach((c, i) => {
      map.set(c.id, CLIENT_PALETTE[i % CLIENT_PALETTE.length]);
    });
    return map;
  }, [clients]);

  const handleDataLoaded = useCallback((data: ClientDashboardData) => {
    setClientData(prev => {
      const next = new Map(prev);
      next.set(data.clientId, data);
      return next;
    });
  }, []);

  const handleToggleClient = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGlobalRefresh = useCallback(() => {
    setClientData(new Map());
    setRefreshKey(k => k + 1);
  }, []);

  const handlePeriodChange = useCallback((val: string) => {
    setPeriod(val as PeriodValue);
    setClientData(new Map());
    setRefreshKey(k => k + 1);
    setSelectedIds(new Set());
  }, []);

  const allMetricLabels = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const d of clientData.values()) {
      for (const m of d.metrics) {
        if (!seen.has(m.label) && isChartable(m)) {
          seen.add(m.label);
          labels.push(m.label);
        }
      }
    }
    return labels;
  }, [clientData]);

  useEffect(() => {
    if (allMetricLabels.length > 0 && !allMetricLabels.includes(chartMetric)) {
      setChartMetric(allMetricLabels[0]);
    }
  }, [allMetricLabels, chartMetric]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold leading-tight" data-testid="text-page-title">
            Dashboard
          </h1>
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
            disabled={clientsLoading}
            size="sm"
            variant="outline"
            className="gap-2 h-8"
            data-testid="button-refresh-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh All
          </Button>
        </div>
      </div>

      {!clientsLoading && clients && clients.length > 0 && (
        <DashboardChart
          clientData={clientData}
          selectedIds={selectedIds}
          chartMetric={chartMetric}
          onMetricChange={setChartMetric}
          colorMap={colorMap}
          allMetricLabels={allMetricLabels}
        />
      )}

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
          <>
            {selectedIds.size > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} client{selectedIds.size > 1 ? "s" : ""} highlighted in chart
                </span>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelectedIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  Clear selection
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {clients.map(client => (
                <ClientCard
                  key={`${client.id}-${period}-${refreshKey}`}
                  client={client}
                  color={colorMap.get(client.id) ?? "#888"}
                  isSelected={selectedIds.has(client.id)}
                  onSelect={() => handleToggleClient(client.id)}
                  onDataLoaded={handleDataLoaded}
                  dateRange={period}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
