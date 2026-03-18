import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { dateRangeToGoogleDates, pctDelta, fmtDelta } from "./googleToken";
import { normalizeCtmCall } from "./callNormalizer";

async function getCtmCreds(): Promise<{ apiKey: string; apiSecret: string } | null> {
  const creds = await storage.getApiCredentialsByService("call_tracking_metrics");
  if (creds.length < 2) return null;
  const keyCred = creds.find(c => c.credentialType === "api_key");
  const secretCred = creds.find(c => c.credentialType === "api_secret");
  if (!keyCred || !secretCred) return null;
  return { apiKey: decrypt(keyCred.encryptedValue), apiSecret: decrypt(secretCred.encryptedValue) };
}

async function ctmGet(apiKey: string, apiSecret: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.calltrackingmetrics.com/api/v1/${path}${qs ? "?" + qs : ""}`;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const resp = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
  });
  const data = await resp.json() as any;
  if (!resp.ok) {
    const msg = data.message ?? data.error ?? data.errors?.join(", ") ?? `CTM API error ${resp.status}`;
    console.error(`[CTM] ${resp.status} from ${path}?${qs.substring(0, 120)}:`, msg);
    throw new Error(msg);
  }
  return data;
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export async function queryCtm(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (!client.ctmAccountId) return null;
  const creds = await getCtmCreds();
  if (!creds) return null;

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);
  const accountId = client.ctmAccountId;
  const organicSources = client.ctmOrganicSourceTerms ?? [];

  try {
    if (command === "ctm_qoq_organic_calls") {
      // Fetch full call list and filter by organic source terms client-side.
      // total_entries would count ALL calls; we need organic-only count.
      // If no organicSources terms are configured, total_entries is used as fallback.
      if (organicSources.length === 0) {
        // No organic filter configured — fall back to total_entries count
        const [currData, prevData] = await Promise.all([
          ctmGet(creds.apiKey, creds.apiSecret, `accounts/${accountId}/calls`, {
            start_date: startDate,
            end_date: endDate,
            per_page: "1",
          }),
          ctmGet(creds.apiKey, creds.apiSecret, `accounts/${accountId}/calls`, {
            start_date: prevStartDate,
            end_date: prevEndDate,
            per_page: "1",
          }),
        ]);
        const currTotal = currData.total_entries ?? 0;
        const prevTotal = prevData.total_entries ?? 0;
        return {
          command,
          clientName: client.name,
          dateRange,
          summary: [
            { label: "Total CTM Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
          ],
          tables: [],
        };
      }

      // Fetch full lists and apply organic source filter
      const [currData, prevData] = await Promise.all([
        ctmGet(creds.apiKey, creds.apiSecret, `accounts/${accountId}/calls`, {
          start_date: startDate,
          end_date: endDate,
          per_page: "250",
        }),
        ctmGet(creds.apiKey, creds.apiSecret, `accounts/${accountId}/calls`, {
          start_date: prevStartDate,
          end_date: prevEndDate,
          per_page: "250",
        }),
      ]);

      const filterOrganic = (calls: any[]): number =>
        calls.map((c: any) => normalizeCtmCall(c, organicSources))
             .filter(nc => nc.isOrganic !== false).length;

      const currTotal = filterOrganic(currData.calls ?? []);
      const prevTotal = filterOrganic(prevData.calls ?? []);

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Organic CTM Calls", current: fmtN(currTotal), previous: fmtN(prevTotal), delta: fmtDelta(currTotal, prevTotal), deltaPercent: pctDelta(currTotal, prevTotal), isPositive: currTotal >= prevTotal },
        ],
        tables: [],
      };
    }

    if (command === "ctm_qoq_top_landing_pages" || command === "ctm_qoq_sources") {
      const data = await ctmGet(creds.apiKey, creds.apiSecret, `accounts/${accountId}/calls`, {
        start_date: startDate,
        end_date: endDate,
        per_page: "100",
      });

      const calls = data.calls ?? [];

      if (command === "ctm_qoq_top_landing_pages") {
        const byPage: Record<string, number> = {};
        for (const call of calls) {
          const page = call.referrer_url ?? call.landing_page_url ?? "unknown";
          byPage[page] = (byPage[page] ?? 0) + 1;
        }
        const tableRows = Object.entries(byPage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([page, cnt]) => [page.replace(/^https?:\/\/[^/]+/, "") || "/", fmtN(cnt)]);
        return {
          command,
          clientName: client.name,
          dateRange,
          summary: [],
          tables: [{ title: "Top Landing Pages by CTM Calls", headers: ["Landing Page", "Calls"], rows: tableRows }],
        };
      }

      if (command === "ctm_qoq_sources") {
        const bySource: Record<string, number> = {};
        for (const call of calls) {
          const src = call.traffic_source ?? call.source ?? "Unknown";
          bySource[src] = (bySource[src] ?? 0) + 1;
        }
        const tableRows = Object.entries(bySource)
          .sort((a, b) => b[1] - a[1])
          .map(([src, cnt]) => [src, fmtN(cnt)]);
        return {
          command,
          clientName: client.name,
          dateRange,
          summary: [{ label: "Total CTM Calls", current: fmtN(calls.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: true }],
          tables: [{ title: "CTM Calls by Source", headers: ["Source", "Calls"], rows: tableRows }],
        };
      }
    }

    return null;
  } catch (err: any) {
    console.error(`[CTM] ${command} error:`, err.message);
    throw err;
  }
}

export function handlesCtmCommand(command: Command): boolean {
  return ["ctm_qoq_organic_calls", "ctm_qoq_top_landing_pages", "ctm_qoq_sources"].includes(command);
}
