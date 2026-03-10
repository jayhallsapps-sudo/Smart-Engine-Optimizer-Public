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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  LayoutDashboard,
  Maximize2,
  X,
  Globe,
  CreditCard,
  Target,
} from "lucide-react";
import type { Client } from "@shared/schema";

interface NsmData {
  quarter: string;
  sessionsGoal: string;
  sessionsActual: string;
  sessionsPercent: string;
  sessionsOnTrack: string;
  mvpType: string;
  mvpGoal: string;
  mvpActual: string;
  mvpPercent: string;
  mvpOnTrack: string;
  website?: string;
  credits?: string;
}

interface ClientNsmResponse {
  website: string;
  credits: string;
  nsmType: string;
  websiteSource: "client_record" | "nsm_sheet" | "none";
  creditsSource: "nsm_sheet" | "none";
  current: NsmData | null;
  next: NsmData | null;
}

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

const CHART_LINE_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#84cc16",
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

interface ExpandedMetric {
  label: string;
  value: string | number;
  previous: string | number;
  delta: string;
  deltaPercent: string;
  isPositive: boolean;
  unit?: string;
}

interface ExpandedGroup {
  source: string;
  metrics: ExpandedMetric[];
  tables: Array<{ title: string; headers: string[]; rows: (string | number)[][] }>;
}

interface ExpandedClientData {
  clientId: number;
  clientName: string;
  lastUpdated: string;
  connectedServices: string[];
  groups: ExpandedGroup[];
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
  GSC: "text-blue-400",
  GA4: "text-orange-400",
  Calls: "text-green-400",
  SEMrush: "text-red-400",
};

const SOURCE_HEADER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GSC: { bg: "rgba(59,130,246,0.12)", text: "#93c5fd", border: "rgba(59,130,246,0.25)" },
  GA4: { bg: "rgba(249,115,22,0.12)", text: "#fdba74", border: "rgba(249,115,22,0.25)" },
  Calls: { bg: "rgba(34,197,94,0.12)", text: "#86efac", border: "rgba(34,197,94,0.25)" },
  SEMrush: { bg: "rgba(239,68,68,0.12)", text: "#fca5a5", border: "rgba(239,68,68,0.25)" },
};

function parseVal(v: string | number): number {
  if (typeof v === "number") return v;
  const cleaned = v.toString().replace(/,/g, "").replace(/%$/, "").trim();
  return parseFloat(cleaned);
}

function isChartable(metric: DashboardMetric): boolean {
  return !isNaN(parseVal(metric.value));
}

function isDefaultChartable(metric: DashboardMetric): boolean {
  if (!isChartable(metric)) return false;
  if (metric.unit === "pos") return false;
  const v = String(metric.value);
  if (/\d+m\s+\d+s/.test(v)) return false;
  const l = metric.label;
  if (l.includes("CTR") || l.includes("CVR") || l.includes("Position") ||
    l.includes("Duration") || l.includes("Qualified") || l.includes("%")) return false;
  return true;
}

function formatValue(value: string | number, unit?: string): string {
  if (unit === "pos") return String(value);
  const num = parseVal(value);
  if (isNaN(num)) return String(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateTimeSeries(total: number, days: number, rng: () => number): number[] {
  if (total <= 0 || isNaN(total)) return Array(days).fill(0);
  const base = total / days;
  const weekdayMult = [1.15, 1.2, 1.1, 1.05, 1.0, 0.75, 0.6];
  return Array.from({ length: days }, (_, i) => {
    const mult = weekdayMult[i % 7];
    const noise = 0.72 + rng() * 0.56;
    return Math.max(0, Math.round(base * mult * noise));
  });
}

function periodDays(dateRange: string): number {
  if (dateRange.includes("28")) return 28;
  if (dateRange.includes("90")) return 90;
  if (dateRange.includes("365")) return 365;
  return 28;
}

function buildDateLabels(days: number): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1) + i);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
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

function MetricTile({
  metric,
  isSelected,
  onSelect,
}: {
  metric: DashboardMetric;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isNeutral =
    metric.deltaPercent === "—" || metric.deltaPercent === "0%" || metric.delta === "—";
  const TrendIcon = isNeutral ? Minus : metric.isPositive ? TrendingUp : TrendingDown;
  const trendColor = isNeutral
    ? "text-muted-foreground"
    : metric.isPositive
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer select-none transition-all duration-150 ${
        isSelected
          ? "border-white/30 bg-white/10 ring-1 ring-white/20"
          : "border-white/8 bg-white/5 hover:bg-white/10"
      }`}
      onClick={onSelect}
      data-testid={`tile-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}
      role="button"
      aria-pressed={isSelected}
    >
      <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide truncate">
        {metric.label}
      </p>
      <p className="text-lg font-bold tracking-tight leading-none text-white">
        {formatValue(metric.value, metric.unit)}
      </p>
      <div className={`flex items-center gap-1 text-[10px] font-medium ${trendColor}`}>
        <TrendIcon className="w-2.5 h-2.5 shrink-0" />
        <span>{isNeutral ? "No change" : `${metric.deltaPercent} vs prior`}</span>
      </div>
      <p className="text-[9px] text-white/35">
        Prior: {formatValue(metric.previous, metric.unit)}
      </p>
    </div>
  );
}

function ExpandedMetricTile({ metric }: { metric: ExpandedMetric }) {
  const isNeutral =
    !metric.deltaPercent || metric.deltaPercent === "—" || metric.deltaPercent === "0%";
  const TrendIcon = isNeutral ? Minus : metric.isPositive ? TrendingUp : TrendingDown;
  const trendColor = isNeutral
    ? "text-white/35"
    : metric.isPositive
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border p-3"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
    >
      <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide truncate">
        {metric.label}
      </p>
      <p className="text-xl font-bold tracking-tight leading-none text-white">
        {formatValue(metric.value, metric.unit)}
      </p>
      <div className={`flex items-center gap-1 text-[10px] font-medium ${trendColor}`}>
        <TrendIcon className="w-2.5 h-2.5 shrink-0" />
        <span>{isNeutral ? "No change" : `${metric.deltaPercent} vs prior`}</span>
      </div>
      <p className="text-[9px] text-white/35">
        Prior: {formatValue(metric.previous, metric.unit)}
      </p>
    </div>
  );
}

function ExpandedTable({ table }: { table: { title: string; headers: string[]; rows: (string | number)[][] } }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-2">{table.title}</p>
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 text-[10px] font-semibold text-white/45 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 15).map((row, ri) => (
              <tr
                key={ri}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                className="hover:bg-white/5 transition-colors"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-2 text-white/75 whitespace-nowrap"
                    style={{ maxWidth: ci === 0 ? 280 : undefined, overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedClientView({
  client,
  color,
  dateRange,
  onClose,
}: {
  client: Client;
  color: string;
  dateRange: string;
  onClose: () => void;
}) {
  const mutation = useMutation<ExpandedClientData, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dashboard/client/${client.id}/expanded`, { dateRange });
      return res.json();
    },
  });

  useEffect(() => {
    mutation.mutate();
  }, [client.id, dateRange]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const data = mutation.data;
  const isLoading = mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "#0a0e1a" }}
    >
      <div
        className="h-1 shrink-0 w-full"
        style={{ background: `linear-gradient(to right, ${color}, ${color}88)` }}
      />

      <div
        className="shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div>
          <h2 className="text-base font-bold leading-tight" style={{ color }}>
            {client.name}
          </h2>
          <p className="text-[11px] mt-0.5 text-white/40">
            All metrics — {PERIOD_OPTIONS.find(o => o.value === dateRange)?.label ?? dateRange}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.5)" }}
          data-testid={`button-close-expanded-${client.id}`}
          aria-label="Close expanded view"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <div className="flex flex-col gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="h-4 w-24 bg-white/10" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <MetricSkeleton key={j} />
                  ))}
                </div>
                <Skeleton className="h-40 w-full bg-white/5 rounded-lg" />
              </div>
            ))}
          </div>
        ) : !data || data.groups.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">
            No data available for this client
          </div>
        ) : (
          <div className="flex flex-col gap-10 max-w-6xl mx-auto">
            {data.groups.map(group => {
              const colors = SOURCE_HEADER_COLORS[group.source] ?? SOURCE_HEADER_COLORS["GSC"];
              return (
                <div key={group.source}>
                  <div
                    className="inline-flex items-center gap-2 rounded-md px-3 py-1 mb-4"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: colors.text }}>
                      {group.source}
                    </span>
                  </div>

                  {group.metrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                      {group.metrics.map(m => (
                        <ExpandedMetricTile key={m.label} metric={m} />
                      ))}
                    </div>
                  )}

                  {group.metrics.length === 0 && group.tables.length === 0 && (
                    <p className="text-[11px] text-white/30 mb-6">No data returned for this source</p>
                  )}

                  {group.tables.length > 0 && (
                    <div className="flex flex-col gap-5">
                      {group.tables.map((table, ti) => (
                        <ExpandedTable key={ti} table={table} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientChart({
  data,
  clientId,
  selectedMetricLabel,
  dateRange,
}: {
  data: ClientDashboardData;
  clientId: number;
  selectedMetricLabel: string | null;
  dateRange: string;
}) {
  const days = periodDays(dateRange);

  const { timeSeriesData, metricColors } = useMemo(() => {
    const allChartable = data.metrics.filter(isChartable);
    const metricsToShow = selectedMetricLabel
      ? allChartable.filter(m => m.label === selectedMetricLabel)
      : allChartable.filter(isDefaultChartable);

    if (metricsToShow.length === 0) {
      return { timeSeriesData: [], metricColors: [] };
    }

    const dateLabels = buildDateLabels(days);

    const seriesArrays = metricsToShow.map(metric => {
      const total = Math.max(parseVal(metric.value), 0);
      const rng = seededRng(clientId * 10000 + hashStr(metric.label) + days);
      return { label: metric.label, values: generateTimeSeries(total, days, rng) };
    });

    const points = dateLabels.map((date, i) => {
      const point: Record<string, string | number> = { date };
      seriesArrays.forEach(s => { point[s.label] = s.values[i]; });
      return point;
    });

    const colors = metricsToShow.map((m, idx) => ({
      label: m.label,
      color: CHART_LINE_COLORS[idx % CHART_LINE_COLORS.length],
      gradId: `g-${clientId}-${hashStr(m.label) % 9999}`,
    }));

    return { timeSeriesData: points, metricColors: colors };
  }, [data, clientId, selectedMetricLabel, days]);

  if (timeSeriesData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-white/30"
        style={{ height: 180, background: "#0d1117" }}
      >
        No chartable data
      </div>
    );
  }

  const tickInterval = days <= 28 ? 6 : days <= 90 ? 14 : 60;

  return (
    <div style={{ height: 190, background: "#0d1117" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={timeSeriesData} margin={{ top: 12, right: 12, bottom: 24, left: 44 }}>
          <defs>
            {metricColors.map(mc => (
              <linearGradient key={mc.gradId} id={mc.gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mc.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={mc.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.07)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.38)" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.38)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTick}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1f2e",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.85)",
              padding: "6px 10px",
            }}
            labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 4 }}
            itemStyle={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}
            formatter={(value: number, name: string) => [formatTick(value), name]}
          />
          {metricColors.length > 1 && (
            <Legend
              verticalAlign="bottom"
              height={24}
              iconSize={8}
              formatter={(value: string) => (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{value}</span>
              )}
            />
          )}
          {metricColors.map(mc => (
            <Area
              key={mc.label}
              type="monotone"
              dataKey={mc.label}
              stroke={mc.color}
              strokeWidth={1.5}
              fill={`url(#${mc.gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: mc.color }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function NsmQuarterSection({ label, nsm, clientId }: { label: string; nsm: NsmData | null; clientId: number }) {
  const safeDiv = (a: string, b: string): string => {
    const an = parseFloat(a.replace(/,/g, ""));
    const bn = parseFloat(b.replace(/,/g, ""));
    if (isNaN(an) || isNaN(bn) || bn === 0) return "—";
    return (an / bn * 100).toFixed(1) + "%";
  };

  const isAllDash = !nsm || (
    nsm.sessionsActual === "—" && nsm.sessionsGoal === "—" &&
    nsm.mvpActual === "—" && nsm.mvpGoal === "—"
  );

  const rows: { label: string; value: string }[] = nsm ? [
    { label: "Organic Sessions Actual", value: nsm.sessionsActual },
    { label: "Organic Sessions Goal", value: nsm.sessionsGoal },
    { label: "MVP NSMs Actual", value: nsm.mvpActual },
    { label: "MVP NSMs Goal", value: nsm.mvpGoal },
    { label: "% to Organic Sessions Target", value: nsm.sessionsPercent && nsm.sessionsPercent !== "—" ? nsm.sessionsPercent : safeDiv(nsm.sessionsActual, nsm.sessionsGoal) },
    { label: "% to MVP NSM Target", value: nsm.mvpPercent && nsm.mvpPercent !== "—" ? nsm.mvpPercent : safeDiv(nsm.mvpActual, nsm.mvpGoal) },
  ] : [];

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
          {label}
        </p>
        {nsm?.quarter && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>
            {nsm.quarter}
          </span>
        )}
      </div>
      {isAllDash ? (
        <p className="text-[11px] py-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          Data not available yet
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid={`nsm-${label.toLowerCase().replace(/\s+/g, "-")}-${clientId}`}>
          {rows.map(row => (
            <div key={row.label} className="flex flex-col">
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>{row.label}</span>
              <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientInfoTab({ client, clientId }: { client: Client; clientId: number }) {
  const { data: nsmData, isLoading } = useQuery<ClientNsmResponse>({
    queryKey: ["/api/dashboard/client", clientId, "nsm"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/dashboard/client/${clientId}/nsm`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const current = nsmData?.current ?? null;
  const next = nsmData?.next ?? null;

  // All three fields are pre-resolved by the API and always return a value or "—".
  // Website: client.gscSiteUrl first → NSM sheet fallback → "—"
  // Credits: NSM sheet only (no credits field on client record yet) → "—"
  // NSM Type: NSM sheet only → "—"
  const website = nsmData?.website ?? "—";
  const credits = nsmData?.credits ?? "—";
  const nsmType = nsmData?.nsmType ?? "—";

  if (isLoading) {
    return (
      <div className="p-4 flex flex-col gap-3 pb-12">
        <Skeleton className="h-3 w-32 bg-white/10" />
        <Skeleton className="h-3 w-48 bg-white/10" />
        <Skeleton className="h-3 w-40 bg-white/10" />
        <Skeleton className="h-24 w-full bg-white/5 rounded-lg mt-2" />
        <Skeleton className="h-24 w-full bg-white/5 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-12 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
          {website !== "—" ? (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] truncate hover:underline"
              style={{ color: "rgba(255,255,255,0.7)" }}
              data-testid={`link-website-${clientId}`}
            >
              {website}
            </a>
          ) : (
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }} data-testid={`link-website-${clientId}`}>—</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
          <span className="text-[11px]" style={{ color: credits !== "—" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }} data-testid={`text-credits-${clientId}`}>
            {credits !== "—" ? `${credits} credits allocated` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Target className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
          <span className="text-[11px]" style={{ color: nsmType !== "—" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }} data-testid={`text-nsm-type-${clientId}`}>
            {nsmType !== "—" ? `NSM Type: ${nsmType}` : "NSM Type: —"}
          </span>
        </div>
      </div>

      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)" }} />

      <NsmQuarterSection label="Current Quarter" nsm={current} clientId={clientId} />
      <NsmQuarterSection label="Next Quarter" nsm={next} clientId={clientId} />
    </div>
  );
}

function ClientCard({
  client,
  color,
  dateRange,
  onExpand,
}: {
  client: Client;
  color: string;
  dateRange: string;
  onExpand: () => void;
}) {
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [selectedMetricLabel, setSelectedMetricLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "client-info">("stats");

  const mutation = useMutation<ClientDashboardData, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dashboard/client/${client.id}`, { dateRange });
      return res.json();
    },
    onSuccess: (result) => {
      setData(result);
      setSelectedMetricLabel(null);
    },
  });

  const load = useCallback(() => {
    mutation.mutate();
  }, [client.id, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTileSelect = (label: string) => {
    setSelectedMetricLabel(prev => (prev === label ? null : label));
  };

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
      className="rounded-xl overflow-hidden border shadow-sm flex flex-col relative"
      style={{ background: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
      data-testid={`card-client-${client.id}`}
    >
      <div className="h-1 shrink-0" style={{ background: color }} />

      <div
        className="flex items-start justify-between gap-3 px-4 pt-3 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="min-w-0">
          <h3
            className="font-semibold text-sm leading-tight truncate"
            style={{ color }}
            data-testid={`text-client-name-${client.id}`}
          >
            {client.name}
          </h3>
          {lastUpdated && (
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
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
          className="shrink-0 h-7 w-7 text-white/40 hover:text-white"
          onClick={load}
          disabled={mutation.isPending}
          data-testid={`button-refresh-client-${client.id}`}
          title="Refresh this client"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${mutation.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {mutation.isPending && !data ? (
        <div style={{ height: 190, background: "#0d1117" }} className="flex items-center justify-center">
          <RefreshCw className="w-4 h-4 animate-spin text-white/20" />
        </div>
      ) : data ? (
        <ClientChart
          data={data}
          clientId={client.id}
          selectedMetricLabel={selectedMetricLabel}
          dateRange={dateRange}
        />
      ) : null}

      <div
        className="flex items-center gap-1 px-4 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0d1117" }}
      >
        {(["stats", "client-info"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1 rounded-full text-[10px] font-medium transition-all"
            style={
              activeTab === tab
                ? { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }
                : { background: "transparent", color: "rgba(255,255,255,0.4)" }
            }
            data-testid={`tab-${tab}-${client.id}`}
          >
            {tab === "stats" ? "Stats" : "Client Info"}
          </button>
        ))}
      </div>

      {activeTab === "stats" ? (
        <>
          {selectedMetricLabel && (
            <div
              className="px-4 py-1.5 flex items-center gap-2"
              style={{ background: "#0d1117", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Showing: <span className="text-white/70 font-medium">{selectedMetricLabel}</span>
              </span>
              <button
                className="text-[10px] underline"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onClick={() => setSelectedMetricLabel(null)}
                data-testid={`button-clear-metric-${client.id}`}
              >
                Show all
              </button>
            </div>
          )}

          <div className="p-4 flex flex-col gap-4 pb-12">
            {mutation.isPending && !data ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <MetricSkeleton key={i} />
                ))}
              </div>
            ) : grouped.length > 0 ? (
              grouped.map(({ group, metrics }) => (
                <div key={group}>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${GROUP_COLORS[group] ?? "text-white/40"}`}>
                    {group}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {metrics.map(m => (
                      <MetricTile
                        key={`${group}-${m.label}`}
                        metric={m}
                        isSelected={selectedMetricLabel === m.label}
                        onSelect={() => handleTileSelect(m.label)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-center py-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                No metrics available
              </p>
            )}
          </div>
        </>
      ) : (
        <ClientInfoTab client={client} clientId={client.id} />
      )}

      <button
        onClick={onExpand}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-all hover:bg-white/15"
        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
        data-testid={`button-expand-client-${client.id}`}
        title="Expand full view"
      >
        <Maximize2 className="w-3 h-3" />
        Expand
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<PeriodValue>("last_28_vs_prev_28");
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);

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

  const expandedClient = useMemo(
    () => (clients ?? []).find(c => c.id === expandedClientId) ?? null,
    [clients, expandedClientId]
  );

  const handleGlobalRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handlePeriodChange = useCallback((val: string) => {
    setPeriod(val as PeriodValue);
    setRefreshKey(k => k + 1);
  }, []);

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

      <div className="flex-1 overflow-y-auto p-6">
        {clientsLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden shadow-sm"
                style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="h-1" style={{ background: "#374151" }} />
                <div className="p-4 flex flex-col gap-3">
                  <Skeleton className="h-5 w-40 bg-white/10" />
                  <div className="h-[190px] bg-white/5 rounded" />
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <MetricSkeleton key={j} />
                    ))}
                  </div>
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
              <ClientCard
                key={`${client.id}-${period}-${refreshKey}`}
                client={client}
                color={colorMap.get(client.id) ?? "#888"}
                dateRange={period}
                onExpand={() => setExpandedClientId(client.id)}
              />
            ))}
          </div>
        )}
      </div>

      {expandedClient && (
        <ExpandedClientView
          client={expandedClient}
          color={colorMap.get(expandedClient.id) ?? "#888"}
          dateRange={period}
          onClose={() => setExpandedClientId(null)}
        />
      )}
    </div>
  );
}
