import type { Client, Command, CommandResult } from "@shared/schema";
import { getGoogleAccessToken, dateRangeToGoogleDates, pctDelta, fmtDelta } from "./googleToken";

async function gscQuery(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 25,
  dimensionFilterGroups?: any[]
): Promise<any[]> {
  const body: any = { startDate, endDate, dimensions, rowLimit };
  if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;

  const resp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.error?.message || `GSC API error ${resp.status}`);
  return data.rows ?? [];
}

function formatNum(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export async function queryGsc(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (!client.gscSiteUrl) return null;
  const accessToken = await getGoogleAccessToken("google_search_console");
  if (!accessToken) return null;

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);
  const siteUrl = client.gscSiteUrl;
  const brandTerms = (client.brandTerms ?? []).map(t => t.toLowerCase());

  function isNonBrand(query: string): boolean {
    if (!brandTerms.length) return true;
    return !brandTerms.some(b => query.toLowerCase().includes(b));
  }

  try {
    if (command === "gsc_top_queries" || command === "gsc_qoq_queries") {
      const [currRows, prevRows] = await Promise.all([
        gscQuery(accessToken, siteUrl, startDate, endDate, ["query"], 25),
        gscQuery(accessToken, siteUrl, prevStartDate, prevEndDate, ["query"], 25),
      ]);

      const prevMap = new Map<string, any>(prevRows.map(r => [r.keys[0], r]));
      const totalCurr = currRows.reduce((s, r) => s + r.clicks, 0);
      const totalPrev = prevRows.reduce((s, r) => s + r.clicks, 0);

      const rows = currRows.map(r => {
        const q = r.keys[0];
        const prev = prevMap.get(q);
        const prevClicks = prev?.clicks ?? 0;
        const prevImpressions = prev?.impressions ?? 0;
        return [
          q,
          formatNum(r.clicks),
          prevClicks > 0 ? fmtDelta(r.clicks, prevClicks) : "new",
          formatNum(r.impressions),
          `${(r.ctr * 100).toFixed(1)}%`,
          r.position.toFixed(1),
          prevImpressions > 0 ? pctDelta(r.impressions, prevImpressions) : "—",
        ];
      });

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Total Clicks", current: formatNum(totalCurr), previous: formatNum(totalPrev), delta: fmtDelta(totalCurr, totalPrev), deltaPercent: pctDelta(totalCurr, totalPrev), isPositive: totalCurr >= totalPrev },
        ],
        tables: [{
          title: "Top Queries by Clicks",
          headers: ["Query", "Clicks", "Δ Clicks", "Impressions", "CTR", "Avg Position", "Δ Impressions"],
          rows,
        }],
      };
    }

    if (command === "gsc_qoq_pages") {
      const [currRows, prevRows] = await Promise.all([
        gscQuery(accessToken, siteUrl, startDate, endDate, ["page"], 20),
        gscQuery(accessToken, siteUrl, prevStartDate, prevEndDate, ["page"], 20),
      ]);
      const prevMap = new Map<string, any>(prevRows.map(r => [r.keys[0], r]));
      const rows = currRows.map(r => {
        const page = r.keys[0].replace(siteUrl.replace(/\/$/, ""), "") || "/";
        const prev = prevMap.get(r.keys[0]);
        return [
          page,
          formatNum(r.clicks),
          prev ? fmtDelta(r.clicks, prev.clicks) : "new",
          formatNum(r.impressions),
          `${(r.ctr * 100).toFixed(1)}%`,
          r.position.toFixed(1),
        ];
      });
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Top Pages by Clicks", headers: ["Page", "Clicks", "Δ Clicks", "Impressions", "CTR", "Avg Position"], rows }],
      };
    }

    if (command === "gsc_query_to_page_map") {
      const rows = await gscQuery(accessToken, siteUrl, startDate, endDate, ["query", "page"], 30);
      const tableRows = rows.map(r => [
        r.keys[0],
        r.keys[1].replace(siteUrl.replace(/\/$/, ""), "") || "/",
        formatNum(r.clicks),
        formatNum(r.impressions),
        `${(r.ctr * 100).toFixed(1)}%`,
        r.position.toFixed(1),
      ]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Query → Page Mapping", headers: ["Query", "Page", "Clicks", "Impressions", "CTR", "Position"], rows: tableRows }],
      };
    }

    if (command === "gsc_high_impressions_low_ctr") {
      const rows = await gscQuery(accessToken, siteUrl, startDate, endDate, ["query"], 100);
      const filtered = rows
        .filter(r => r.impressions > 500 && r.ctr < 0.05 && isNonBrand(r.keys[0]))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20);
      const tableRows = filtered.map(r => [
        r.keys[0],
        formatNum(r.impressions),
        `${(r.ctr * 100).toFixed(2)}%`,
        r.position.toFixed(1),
        r.clicks,
      ]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [{ label: "Opportunities Found", current: tableRows.length, previous: 0, delta: "", deltaPercent: "", isPositive: true }],
        tables: [{ title: "High Impressions / Low CTR Opportunities", headers: ["Query", "Impressions", "CTR", "Avg Position", "Clicks"], rows: tableRows }],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[GSC] ${command} error:`, err.message);
    throw err;
  }
}

export function handlesGscCommand(command: Command): boolean {
  return [
    "gsc_top_queries",
    "gsc_qoq_queries",
    "gsc_qoq_pages",
    "gsc_query_to_page_map",
    "gsc_high_impressions_low_ctr",
  ].includes(command);
}
