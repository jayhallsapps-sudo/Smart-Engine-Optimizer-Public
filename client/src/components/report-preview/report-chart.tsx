import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const BLUE = "#1B3A6B";
const ACCENT = "#3B82F6";
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
  const palette = colors ?? [BLUE, ACCENT, GREEN, "#D97706", "#7C3AED"];
  return (
    <div>
      {title && <div className="text-xs font-semibold text-[#1B3A6B] mb-1 uppercase tracking-wide">{title}</div>}
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
  const palette = colors ?? [BLUE, ACCENT, GREEN, "#D97706", "#7C3AED"];
  return (
    <div>
      {title && <div className="text-xs font-semibold text-[#1B3A6B] mb-1 uppercase tracking-wide">{title}</div>}
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

interface MetricCardProps {
  label: string;
  current: string;
  previous?: string;
  delta?: string;
  isPositive?: boolean;
}

export function MetricCard({ label, current, previous, delta, isPositive }: MetricCardProps) {
  const arrow = isPositive ? "▲" : "▼";
  const dColor = isPositive ? "#16A34A" : "#DC2626";
  return (
    <div className="bg-[#E8F0FE] border border-[#D1D5DB] rounded-lg p-3 flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] text-[#6B7280] font-medium uppercase tracking-wide truncate">{label}</div>
      <div className="text-xl font-bold text-[#1F2937] truncate">{current}</div>
      {previous && (
        <div className="text-[10px] text-[#6B7280]">
          vs {previous}
          {delta && (
            <span style={{ color: dColor }} className="ml-1 font-semibold">
              {arrow} {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
