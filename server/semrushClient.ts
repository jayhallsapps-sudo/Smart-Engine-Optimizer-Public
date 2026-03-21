import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";

async function getSemrushKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("semrush");
  if (!creds.length) return null;
  return decrypt(creds[0].encryptedValue);
}

async function semrushGet(apiKey: string, params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams({ ...params, key: apiKey }).toString();
  const resp = await fetch(`https://api.semrush.com/?${qs}`);
  const text = await resp.text();
  if (!resp.ok || text.startsWith("ERROR")) {
    throw new Error(`SEMrush API error: ${text.substring(0, 200)}`);
  }
  return text;
}

function parseSemrushCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(";").map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(";").map(c => c.trim()));
  return { headers, rows };
}

function fmtN(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);
  return Math.round(num).toLocaleString("en-US");
}

export async function querySemrush(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  // SEMrush API calls are currently disabled to preserve account credits.
  // Return null so callers fall back to mock data or leave the section blank.
  return null;
  const domain = extractDomain(client.gscSiteUrl ?? client.ahrefsProjectUrl);
  if (!domain) return null;
  const apiKey = await getSemrushKey();
  if (!apiKey) return null;

  try {
    if (command === "semrush_organic_overview") {
      const text = await semrushGet(apiKey, {
        type: "domain_ranks",
        domain,
        database: "us",
        export_columns: "Or,Ot,Oc,Oad",
      });
      const { headers, rows } = parseSemrushCsv(text);
      if (!rows.length) return null;
      const row = rows[0];
      const colMap: Record<string, string> = {};
      headers.forEach((h, i) => { colMap[h] = row[i] ?? "—"; });
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Organic Keywords", current: fmtN(colMap["Organic Keywords"] ?? colMap["Or"] ?? "—"), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Organic Traffic", current: fmtN(colMap["Organic Traffic"] ?? colMap["Ot"] ?? "—"), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Organic Cost", current: `$${fmtN(colMap["Organic Cost"] ?? colMap["Oc"] ?? "—")}`, previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables: [],
      };
    }

    if (command === "semrush_keyword_rankings") {
      const text = await semrushGet(apiKey, {
        type: "domain_organic",
        domain,
        database: "us",
        display_limit: "25",
        export_columns: "Ph,Po,Pp,Pd,Nq,Cp,Ur",
        display_sort: "nq_desc",
      });
      const { rows } = parseSemrushCsv(text);
      const tableRows = rows.slice(0, 20).map(r => [r[0] ?? "—", r[1] ?? "—", r[5] ?? "—", r[4] ?? "—", r[6] ?? "—"]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [{ label: "Keywords Tracked", current: rows.length.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true }],
        tables: [{ title: "Organic Keyword Rankings", headers: ["Keyword", "Position", "Prev Position", "Volume", "URL"], rows: tableRows }],
      };
    }

    if (command === "semrush_keyword_distribution") {
      const text = await semrushGet(apiKey, {
        type: "domain_organic",
        domain,
        database: "us",
        display_limit: "500",
        export_columns: "Ph,Po",
      });
      const { rows } = parseSemrushCsv(text);
      let top3 = 0, top10 = 0, top20 = 0, top50 = 0;
      for (const row of rows) {
        const pos = parseInt(row[1] ?? "999");
        if (pos <= 3) top3++;
        if (pos <= 10) top10++;
        if (pos <= 20) top20++;
        if (pos <= 50) top50++;
      }
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Top 3", current: top3.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Top 4–10", current: (top10 - top3).toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Top 11–20", current: (top20 - top10).toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Top 21–50", current: (top50 - top20).toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables: [[{ title: "Keyword Distribution by Position Tier", headers: ["Tier", "Keywords"], rows: [["Top 3", top3.toString()], ["Top 4–10", (top10 - top3).toString()], ["Top 11–20", (top20 - top10).toString()], ["Top 21–50", (top50 - top20).toString()]] }][0]],
      };
    }

    if (command === "semrush_competitor_visibility") {
      const text = await semrushGet(apiKey, {
        type: "domain_organic_organic",
        domain,
        database: "us",
        display_limit: "10",
        export_columns: "Dn,Cr,Or",
      });
      const { rows } = parseSemrushCsv(text);
      const tableRows = rows.slice(0, 10).map(r => [r[0] ?? "—", r[2] ?? "—", `${(parseFloat(r[1] ?? "0") * 100).toFixed(1)}%`]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Competitor Organic Visibility", headers: ["Domain", "Organic Keywords", "Competition Level"], rows: tableRows }],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[SEMrush] ${command} error:`, err.message);
    throw err;
  }
}

export function handlesSemrushCommand(command: Command): boolean {
  return ["semrush_organic_overview", "semrush_keyword_rankings", "semrush_keyword_distribution", "semrush_competitor_visibility"].includes(command);
}
