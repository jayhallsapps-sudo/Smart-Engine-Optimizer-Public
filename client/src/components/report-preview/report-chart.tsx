import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const RED = "#C0392B";
const CHART_PALETTE_1 = "#C0392B";
const CHART_PALETTE_2 = "#2563EB";
const GREEN = "#16A34A";

interface ChartDataPoint {
  label: string;
  [key: string]: string | number;
}

interface ReportBarChartProps {
  data: ChartDataPoint[];
  keys: string[];
  colors?: string[];
  height?: number;
  title?: string;
}

export function ReportBarChart({ data, keys, colors, height = 220, title }: ReportBarChartProps) {
  const palette = colors ?? [CHART_PALETTE_1, CHART_PALETTE_2, GREEN, "#D97706", "#7C3AED"];
  return (
    <div>
      {title && <div style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6B7280" }} />
          <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} width={36} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={palette[i % palette.length]} radius={[2, 2, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ReportLineChartProps {
  data: ChartDataPoint[];
  keys: string[];
  colors?: string[];
  height?: number;
  title?: string;
}

export function ReportLineChart({ data, keys, colors, height = 220, title }: ReportLineChartProps) {
  const palette = colors ?? [CHART_PALETTE_1, CHART_PALETTE_2, GREEN, "#D97706", "#7C3AED"];
  return (
    <div>
      {title && <div style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6B7280" }} />
          <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} width={36} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={palette[i % palette.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  GA4:             { bg: "#DBEAFE", text: "#1D4ED8" },
  GSC:             { bg: "#D1FAE5", text: "#065F46" },
  CallRail:        { bg: "#F3E8FF", text: "#7E22CE" },
  Airtable:        { bg: "#FEF3C7", text: "#92400E" },
  Asana:           { bg: "#FFE4E1", text: "#BE123C" },
  NSM:             { bg: "#E0E7FF", text: "#3730A3" },
  "Multi-source":  { bg: "#FEE2E2", text: "#991B1B" },
};

interface MetricCardProps {
  label: string;
  current: string;
  previous?: string;
  delta?: string;
  isPositive?: boolean;
  source?: string;
}

export function MetricCard({ label, current, previous, delta, isPositive, source }: MetricCardProps) {
  const arrow = isPositive ? "▲" : "▼";
  const dColor = isPositive ? "#16A34A" : "#DC2626";
  const sc = source ? (SOURCE_COLORS[source] ?? { bg: "#F3F4F6", text: "#374151" }) : null;
  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderTop: `3px solid ${RED}`, borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {sc && (
          <span style={{ background: sc.bg, color: sc.text, fontSize: 7, fontWeight: 600, padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap" }}>
            {source}
          </span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current}</div>
      {previous && (
        <div style={{ fontSize: 9, color: "#6B7280" }}>
          vs {previous}
          {delta && (
            <span style={{ color: dColor, marginLeft: 4, fontWeight: 700 }}>
              {arrow} {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
