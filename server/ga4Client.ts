import type { Client, Command, CommandResult } from "@shared/schema";
import { getGoogleAccessToken, dateRangeToGoogleDates, pctDelta, fmtDelta } from "./googleToken";

async function runReport(
  accessToken: string,
  propertyId: string,
  body: any
): Promise<any> {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.error?.message || `GA4 API error ${resp.status}`);
  return data;
}

function organicFilter() {
  return {
    filter: {
      fieldName: "sessionDefaultChannelGrouping",
      stringFilter: { value: "Organic Search", matchType: "EXACT" },
    },
  };
}

function extractRows(data: any): { dimensions: string[]; metrics: number[] }[] {
  if (!data.rows) return [];
  return data.rows.map((row: any) => ({
    dimensions: (row.dimensionValues ?? []).map((d: any) => d.value ?? ""),
    metrics: (row.metricValues ?? []).map((m: any) => parseFloat(m.value ?? "0")),
  }));
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export async function queryGa4(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (!client.ga4PropertyId) return null;
  const accessToken = await getGoogleAccessToken("google_analytics_4");
  if (!accessToken) return null;

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);
  const propertyId = client.ga4PropertyId;
  const leadEvents = client.leadEvents ?? [];

  try {
    if (command === "ga4_combined_funnel" || command === "ga4_qoq_organic_funnel") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        metrics: [
          { name: "sessions" },
          { name: "conversions" },
        ],
        dimensionFilter: organicFilter(),
      });

      const curr = (data.rows?.[0]?.metricValues ?? []).map((m: any) => parseFloat(m.value || "0"));
      const prev = (data.rows?.[1]?.metricValues ?? []).map((m: any) => parseFloat(m.value || "0"));
      const currSessions = curr[0] ?? 0;
      const prevSessions = prev[0] ?? 0;
      const currConversions = curr[1] ?? 0;
      const prevConversions = prev[1] ?? 0;
      const currCvr = currSessions > 0 ? currConversions / currSessions : 0;
      const prevCvr = prevSessions > 0 ? prevConversions / prevSessions : 0;

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Organic Sessions", current: fmtN(currSessions), previous: fmtN(prevSessions), delta: fmtDelta(currSessions, prevSessions), deltaPercent: pctDelta(currSessions, prevSessions), isPositive: currSessions >= prevSessions },
          { label: "Organic Conversions", current: fmtN(currConversions), previous: fmtN(prevConversions), delta: fmtDelta(currConversions, prevConversions), deltaPercent: pctDelta(currConversions, prevConversions), isPositive: currConversions >= prevConversions },
          { label: "Organic CVR", current: fmtPct(currCvr), previous: fmtPct(prevCvr), delta: "", deltaPercent: pctDelta(currCvr, prevCvr), isPositive: currCvr >= prevCvr },
        ],
        tables: [],
      };
    }

    if (command === "ga4_landing_pages_by_sessions" || command === "ga4_qoq_organic_landing_pages") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 20,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      });

      const rows = extractRows(data);
      const tableRows = rows
        .filter(r => r.dimensions[0] !== "(not set)")
        .slice(0, 15)
        .map(r => {
          const page = r.dimensions[0].replace(/^https?:\/\/[^/]+/, "") || "/";
          const currS = r.metrics[0];
          const currC = r.metrics[1];
          return [page, fmtN(currS), fmtN(currC), currS > 0 ? fmtPct(currC / currS) : "—"];
        });

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Top Landing Pages by Organic Sessions", headers: ["Page", "Sessions", "Conversions", "CVR"], rows: tableRows }],
      };
    }

    if (command === "ga4_landing_pages_by_conversions") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 20,
        orderBys: [{ metric: { metricName: "conversions" }, desc: true }],
      });

      const rows = extractRows(data);
      const tableRows = rows
        .filter(r => r.dimensions[0] !== "(not set)" && r.metrics[1] > 0)
        .slice(0, 15)
        .map(r => {
          const page = r.dimensions[0].replace(/^https?:\/\/[^/]+/, "") || "/";
          return [page, fmtN(r.metrics[1]), fmtN(r.metrics[0]), r.metrics[0] > 0 ? fmtPct(r.metrics[1] / r.metrics[0]) : "—"];
        });

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Top Pages by Organic Conversions", headers: ["Page", "Conversions", "Sessions", "CVR"], rows: tableRows }],
      };
    }

    if (command === "ga4_qtd_totals") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "newUsers" }],
        dimensionFilter: organicFilter(),
      });

      const curr = (data.rows?.[0]?.metricValues ?? []).map((m: any) => parseFloat(m.value || "0"));
      const prev = (data.rows?.[1]?.metricValues ?? []).map((m: any) => parseFloat(m.value || "0"));

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Organic Sessions", current: fmtN(curr[0] ?? 0), previous: fmtN(prev[0] ?? 0), delta: fmtDelta(curr[0] ?? 0, prev[0] ?? 0), deltaPercent: pctDelta(curr[0] ?? 0, prev[0] ?? 0), isPositive: (curr[0] ?? 0) >= (prev[0] ?? 0) },
          { label: "Organic Conversions", current: fmtN(curr[1] ?? 0), previous: fmtN(prev[1] ?? 0), delta: fmtDelta(curr[1] ?? 0, prev[1] ?? 0), deltaPercent: pctDelta(curr[1] ?? 0, prev[1] ?? 0), isPositive: (curr[1] ?? 0) >= (prev[1] ?? 0) },
          { label: "New Users", current: fmtN(curr[2] ?? 0), previous: fmtN(prev[2] ?? 0), delta: fmtDelta(curr[2] ?? 0, prev[2] ?? 0), deltaPercent: pctDelta(curr[2] ?? 0, prev[2] ?? 0), isPositive: (curr[2] ?? 0) >= (prev[2] ?? 0) },
        ],
        tables: [],
      };
    }

    if (command === "ga4_session_movers") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: organicFilter(),
        limit: 50,
      });

      const rows = extractRows(data);
      const withDelta = rows
        .filter(r => r.dimensions[0] !== "(not set)")
        .map(r => ({ page: r.dimensions[0].replace(/^https?:\/\/[^/]+/, "") || "/", curr: r.metrics[0], prev: r.metrics[1] ?? 0 }))
        .filter(r => r.prev > 0)
        .map(r => ({ ...r, delta: r.curr - r.prev, pct: ((r.curr - r.prev) / r.prev) * 100 }));

      const gainers = [...withDelta].sort((a, b) => b.delta - a.delta).slice(0, 5);
      const losers = [...withDelta].sort((a, b) => a.delta - b.delta).slice(0, 5);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [
          { title: "Top Session Gainers", headers: ["Page", "Current", "Previous", "Δ Sessions", "% Change"], rows: gainers.map(r => [r.page, fmtN(r.curr), fmtN(r.prev), `+${fmtN(r.delta)}`, `+${r.pct.toFixed(1)}%`]) },
          { title: "Top Session Losers", headers: ["Page", "Current", "Previous", "Δ Sessions", "% Change"], rows: losers.map(r => [r.page, fmtN(r.curr), fmtN(r.prev), fmtN(r.delta), `${r.pct.toFixed(1)}%`]) },
        ],
      };
    }

    if (command === "ga4_yoy_comparison") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        dimensions: [{ name: "month" }, { name: "year" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        orderBys: [{ dimension: { dimensionName: "year" } }, { dimension: { dimensionName: "month" } }],
      });

      const rows = extractRows(data);
      const tableRows = rows.map(r => [
        `${r.dimensions[1]}-${r.dimensions[0]}`,
        fmtN(r.metrics[0]),
        fmtN(r.metrics[1]),
        r.metrics[0] > 0 ? fmtPct(r.metrics[1] / r.metrics[0]) : "—",
      ]);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Year-over-Year Monthly Comparison", headers: ["Month", "Sessions", "Conversions", "CVR"], rows: tableRows }],
      };
    }

    if (command === "ga4_conversion_movers") {
      const data = await runReport(accessToken, propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 50,
      });

      const rows = extractRows(data);
      const withDelta = rows
        .filter(r => r.dimensions[0] !== "(not set)")
        .map(r => ({ page: r.dimensions[0].replace(/^https?:\/\/[^/]+/, "") || "/", curr: r.metrics[0], prev: r.metrics[1] ?? 0 }))
        .filter(r => r.prev > 0 || r.curr > 0)
        .map(r => ({ ...r, delta: r.curr - r.prev, pct: r.prev > 0 ? ((r.curr - r.prev) / r.prev) * 100 : 100 }));

      const gainers = [...withDelta].sort((a, b) => b.delta - a.delta).slice(0, 5);
      const losers = [...withDelta].sort((a, b) => a.delta - b.delta).slice(0, 5);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [
          { title: "Top Conversion Gainers", headers: ["Page", "Current", "Previous", "Δ Conversions", "% Change"], rows: gainers.map(r => [r.page, fmtN(r.curr), fmtN(r.prev), `+${fmtN(r.delta)}`, `+${r.pct.toFixed(1)}%`]) },
          { title: "Top Conversion Losers", headers: ["Page", "Current", "Previous", "Δ Conversions", "% Change"], rows: losers.map(r => [r.page, fmtN(r.curr), fmtN(r.prev), fmtN(r.delta), `${r.pct.toFixed(1)}%`]) },
        ],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[GA4] ${command} error:`, err.message);
    throw err;
  }
}

export interface Ga4DailyTrendPoint {
  date: string;
  sessions: number;
  engagedSessions: number;
}

export async function fetchGa4DailyTrend(
  client: Client,
  dateRange: string
): Promise<{ current: Ga4DailyTrendPoint[]; previous: Ga4DailyTrendPoint[] }> {
  if (!client.ga4PropertyId) return { current: [], previous: [] };
  const accessToken = await getGoogleAccessToken("google_analytics_4");
  if (!accessToken) return { current: [], previous: [] };

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);
  const propertyId = client.ga4PropertyId;

  try {
    const [currData, prevData] = await Promise.all([
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
        dimensionFilter: organicFilter(),
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 500,
      }),
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: prevStartDate, endDate: prevEndDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
        dimensionFilter: organicFilter(),
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 500,
      }),
    ]);

    const toPoints = (data: any): Ga4DailyTrendPoint[] =>
      extractRows(data).map(r => ({
        date: r.dimensions[0],
        sessions: r.metrics[0],
        engagedSessions: r.metrics[1],
      })).sort((a, b) => a.date.localeCompare(b.date));

    return { current: toPoints(currData), previous: toPoints(prevData) };
  } catch (err: any) {
    console.error("[GA4] fetchGa4DailyTrend error:", err.message);
    return { current: [], previous: [] };
  }
}

export function handlesGa4Command(command: Command): boolean {
  return [
    "ga4_combined_funnel",
    "ga4_qoq_organic_funnel",
    "ga4_landing_pages_by_sessions",
    "ga4_qoq_organic_landing_pages",
    "ga4_landing_pages_by_conversions",
    "ga4_qtd_totals",
    "ga4_session_movers",
    "ga4_conversion_movers",
    "ga4_yoy_comparison",
  ].includes(command);
}
