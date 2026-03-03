import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { dateRangeToGoogleDates, pctDelta, fmtDelta } from "./googleToken";

async function getCallRailKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("callrail");
  if (!creds.length) return null;
  return decrypt(creds[0].encryptedValue);
}

async function callRailGet(apiKey: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.callrail.com/v3/${path}${qs ? "?" + qs : ""}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" },
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.message || `CallRail API error ${resp.status}`);
  return data;
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export async function queryCallRail(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (!client.callrailCompanyId) return null;
  const apiKey = await getCallRailKey();
  if (!apiKey) return null;

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);
  const companyId = client.callrailCompanyId;
  const organicSources = client.callrailOrganicSourceTerms ?? [];

  try {
    if (command === "callrail_summary" || command === "callrail_qoq_organic_calls") {
      const [currData, prevData] = await Promise.all([
        callRailGet(apiKey, `a/${companyId}/calls.json`, {
          date_range: "custom",
          start_date: startDate,
          end_date: endDate,
          per_page: "1",
          fields: "total_calls,answered,first_call,good_lead_call_count",
        }),
        callRailGet(apiKey, `a/${companyId}/calls.json`, {
          date_range: "custom",
          start_date: prevStartDate,
          end_date: prevEndDate,
          per_page: "1",
          fields: "total_calls",
        }),
      ]);

      const currTotal = currData.total_records ?? 0;
      const prevTotal = prevData.total_records ?? 0;

      const summary = [
        { label: "Total Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
      ];

      if (command === "callrail_summary") {
        const answeredData = await callRailGet(apiKey, `a/${companyId}/calls.json`, {
          date_range: "custom",
          start_date: startDate,
          end_date: endDate,
          answered: "true",
          per_page: "1",
        });
        const answered = answeredData.total_records ?? 0;
        const answeredRate = currTotal > 0 ? (answered / currTotal) * 100 : 0;
        summary.push({ label: "Answered Rate", current: `${answeredRate.toFixed(1)}%`, previous: "—", delta: "—", deltaPercent: "—", isPositive: answeredRate > 80 });
      }

      const calls = currData.calls ?? [];
      const bySource: Record<string, number> = {};
      for (const call of calls) {
        const src = call.source_name ?? "Unknown";
        bySource[src] = (bySource[src] ?? 0) + 1;
      }
      const sourceRows = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([src, cnt]) => [src, fmtN(cnt)]);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary,
        tables: sourceRows.length ? [{ title: "Calls by Source", headers: ["Source", "Calls"], rows: sourceRows }] : [],
      };
    }

    if (command === "callrail_qoq_top_landing_pages") {
      const data = await callRailGet(apiKey, `a/${companyId}/calls.json`, {
        date_range: "custom",
        start_date: startDate,
        end_date: endDate,
        per_page: "250",
        fields: "landing_page_url,source_name",
      });

      const calls = data.calls ?? [];
      const byPage: Record<string, number> = {};
      for (const call of calls) {
        const page = call.landing_page_url ?? "unknown";
        const src = (call.source_name ?? "").toLowerCase();
        const isOrganic = organicSources.length === 0 || organicSources.some(s => src.includes(s.toLowerCase()));
        if (isOrganic) byPage[page] = (byPage[page] ?? 0) + 1;
      }

      const tableRows = Object.entries(byPage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([page, cnt]) => {
          const shortPage = page.replace(/^https?:\/\/[^/]+/, "") || "/";
          return [shortPage, fmtN(cnt)];
        });

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Top Landing Pages by Organic Calls", headers: ["Landing Page", "Calls"], rows: tableRows }],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[CallRail] ${command} error:`, err.message);
    throw err;
  }
}

export function handlesCallRailCommand(command: Command): boolean {
  return ["callrail_summary", "callrail_qoq_organic_calls", "callrail_qoq_top_landing_pages"].includes(command);
}
