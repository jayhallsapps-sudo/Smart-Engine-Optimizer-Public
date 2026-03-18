import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { dateRangeToGoogleDates, pctDelta, fmtDelta } from "./googleToken";

async function getCallRailKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("callrail");
  if (!creds.length) return null;
  try {
    return decrypt(creds[0].encryptedValue);
  } catch {
    console.warn("[CallRail] Failed to decrypt API key — re-connect in Setup");
    return null;
  }
}

async function callRailGet(apiKey: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.callrail.com/v3/${path}${qs ? "?" + qs : ""}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" },
  });
  const data = await resp.json() as any;
  if (!resp.ok) {
    const errMsg = data.message || data.error || JSON.stringify(data);
    console.error(`[CallRail] API error ${resp.status} for ${url}: ${errMsg}`);
    throw new Error(data.message || `CallRail API error ${resp.status}`);
  }
  return data;
}

// Cache: companyId -> accountId
const companyAccountCache: Record<string, string> = {};

async function resolveAccountId(apiKey: string, companyId: string): Promise<string> {
  if (companyAccountCache[companyId]) return companyAccountCache[companyId];
  // Fetch all accounts and find which contains this company
  let page = 1;
  while (true) {
    const d = await callRailGet(apiKey, `a.json`, { per_page: "100", page: String(page) });
    const accounts: any[] = d.accounts ?? [];
    for (const acc of accounts) {
      const coData = await callRailGet(apiKey, `a/${acc.id}/companies.json`, { per_page: "100" });
      const match = (coData.companies ?? []).find((c: any) => c.id === companyId);
      if (match) {
        companyAccountCache[companyId] = String(acc.id);
        return String(acc.id);
      }
    }
    if (accounts.length === 0 || accounts.length >= (d.total_records ?? accounts.length)) break;
    page++;
  }
  throw new Error(`Could not resolve account ID for CallRail company ${companyId}`);
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

  // Resolve the numeric account ID — use stored value or look it up
  const storedAccountId = (client as any).callrailAccountId as string | undefined;
  const accountId = storedAccountId || await resolveAccountId(apiKey, companyId);
  // Build a helper that always scopes to this company
  const callsPath = `a/${accountId}/calls.json`;
  const companyFilter = { company_id: companyId };

  try {
    if (command === "callrail_summary") {
      const [currData, prevData] = await Promise.all([
        callRailGet(apiKey, callsPath, {
          ...companyFilter,
          start_date: startDate,
          end_date: endDate,
          per_page: "250",
          fields: "total_calls,answered,first_call,source_name",
        }),
        callRailGet(apiKey, callsPath, {
          ...companyFilter,
          start_date: prevStartDate,
          end_date: prevEndDate,
          per_page: "1",
        }),
      ]);

      const currTotal = currData.total_records ?? 0;
      const prevTotal = prevData.total_records ?? 0;

      const summary = [
        { label: "Total Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
      ];

      const answeredData = await callRailGet(apiKey, callsPath, {
        ...companyFilter,
        start_date: startDate,
        end_date: endDate,
        answered: "true",
        per_page: "1",
      });
      const answered = answeredData.total_records ?? 0;
      const answeredRate = currTotal > 0 ? (answered / currTotal) * 100 : 0;
      summary.push({ label: "Answered Rate", current: `${answeredRate.toFixed(1)}%`, previous: "—", delta: "—", deltaPercent: "—", isPositive: answeredRate > 80 });

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

    if (command === "callrail_qoq_organic_calls") {
      // If no organic source terms are configured, fall back to total_records (all calls)
      if (organicSources.length === 0) {
        const [currData, prevData] = await Promise.all([
          callRailGet(apiKey, callsPath, {
            ...companyFilter,
            start_date: startDate,
            end_date: endDate,
            per_page: "1",
          }),
          callRailGet(apiKey, callsPath, {
            ...companyFilter,
            start_date: prevStartDate,
            end_date: prevEndDate,
            per_page: "1",
          }),
        ]);
        const currTotal = currData.total_records ?? 0;
        const prevTotal = prevData.total_records ?? 0;
        return {
          command,
          clientName: client.name,
          dateRange,
          summary: [
            { label: "Total Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
          ],
          tables: [],
        };
      }

      // Organic filter configured — fetch full list and filter client-side
      const [currData, prevData] = await Promise.all([
        callRailGet(apiKey, callsPath, {
          ...companyFilter,
          start_date: startDate,
          end_date: endDate,
          per_page: "250",
          fields: "source_name",
        }),
        callRailGet(apiKey, callsPath, {
          ...companyFilter,
          start_date: prevStartDate,
          end_date: prevEndDate,
          per_page: "250",
          fields: "source_name",
        }),
      ]);

      const filterOrganic = (calls: any[]): number =>
        calls.filter((c: any) => {
          const src = (c.source_name ?? "").toLowerCase();
          return organicSources.some(s => src.includes(s.toLowerCase()));
        }).length;

      const currTotal = filterOrganic(currData.calls ?? []);
      const prevTotal = filterOrganic(prevData.calls ?? []);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Organic Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
        ],
        tables: [],
      };
    }

    if (command === "callrail_qoq_top_landing_pages") {
      const data = await callRailGet(apiKey, callsPath, {
        ...companyFilter,
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
