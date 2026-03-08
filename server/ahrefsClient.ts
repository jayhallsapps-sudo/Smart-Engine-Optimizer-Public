import type { Client } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";

interface CommandResult {
  command: string;
  clientName: string;
  dateRange: string;
  summary: { label: string; current: string; previous: string; delta: string; deltaPercent: string; isPositive: boolean }[];
  tables: { title: string; headers: string[]; rows: string[][] }[];
}

async function getAhrefsToken(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("ahrefs");
  if (!creds.length) return null;
  return decrypt(creds[0].encryptedValue);
}

async function ahrefsGet(token: string, path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/${path}?${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ahrefs API error ${resp.status}: ${body.substring(0, 200)}`);
  }
  return resp.json();
}

function fmtN(n: number | string | undefined | null): string {
  if (n === undefined || n === null || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);
  return Math.round(num).toLocaleString("en-US");
}

export async function queryAhrefs(
  command: string,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  const domain = extractDomain(client.ahrefsProjectUrl ?? client.gscSiteUrl);
  if (!domain) return null;
  const token = await getAhrefsToken();
  if (!token) return null;

  try {
    if (command === "ahrefs_backlink_overview") {
      const data = await ahrefsGet(token, "overview", {
        select: "domain_rating,url_rating,backlinks,refdomains,org_keywords,org_traffic",
        target: domain,
        mode: "domain",
      });
      const m = data.domain ?? {};
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Domain Rating", current: fmtN(m.domain_rating), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Backlinks", current: fmtN(m.backlinks), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Referring Domains", current: fmtN(m.refdomains), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Organic Keywords", current: fmtN(m.org_keywords), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Organic Traffic", current: fmtN(m.org_traffic), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables: [],
      };
    }

    if (command === "ahrefs_keyword_rankings") {
      const data = await ahrefsGet(token, "organic-keywords", {
        select: "keyword,volume,keyword_difficulty,position,url",
        target: domain,
        mode: "domain",
        limit: "25",
        order_by: "volume:desc",
      });
      const keywords: any[] = data.keywords ?? [];
      const tableRows = keywords.slice(0, 20).map(k => [
        k.keyword ?? "—",
        fmtN(k.position),
        fmtN(k.volume),
        fmtN(k.keyword_difficulty),
        k.url ?? "—",
      ]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          { label: "Keywords Tracked", current: keywords.length.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables: [{ title: "Organic Keyword Rankings", headers: ["Keyword", "Position", "Volume", "KD", "URL"], rows: tableRows }],
      };
    }

    if (command === "ahrefs_competitor_visibility") {
      const data = await ahrefsGet(token, "competing-domains", {
        select: "domain,common_keywords,competition_level",
        target: domain,
        mode: "domain",
        limit: "10",
      });
      const competitors: any[] = data.domains ?? [];
      const tableRows = competitors.slice(0, 10).map(c => [
        c.domain ?? "—",
        fmtN(c.common_keywords),
        c.competition_level != null ? `${(parseFloat(c.competition_level) * 100).toFixed(1)}%` : "—",
      ]);
      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [],
        tables: [{ title: "Competing Domains", headers: ["Domain", "Common Keywords", "Competition Level"], rows: tableRows }],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[Ahrefs] ${command} error:`, err.message);
    throw err;
  }
}

export function handlesAhrefsCommand(command: string): boolean {
  return ["ahrefs_backlink_overview", "ahrefs_keyword_rankings", "ahrefs_competitor_visibility"].includes(command);
}
