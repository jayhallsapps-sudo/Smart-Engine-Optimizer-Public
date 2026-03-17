/**
 * Evaluation Data Collector
 * Responsible for fetching, enriching, and computing metrics for an eval batch.
 * Handles: SEMrush, Ahrefs (via saved metrics), WHOIS, Wayback, GSC, GA4.
 * Keeps computation isolated from the slide generator.
 */

import { storage } from "./storage";
import { queryGsc } from "./gscClient";
import { queryGa4 } from "./ga4Client";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";
import { classifyUrl, DEFAULT_CATEGORY_RULES, type CategoryRule } from "./evalMetricRegistry";

const DASH = "—";
const MNE = "Manual entry needed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtNum(n: number | string | undefined | null): string {
  if (n === undefined || n === null || n === "") return DASH;
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
}

export function parseNum(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  const cleaned = String(s ?? "").replace(/,/g, "");
  if (!cleaned || cleaned === DASH || cleaned === MNE) return 0;
  const m = cleaned.match(/^([\d.]+)([KMB]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2]?.toUpperCase() === "K" ? 1_000 : m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "B" ? 1_000_000_000 : 1;
  return n * mult;
}

function toYears(dateStr: string): number | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(diff * 10) / 10;
  } catch { return null; }
}

function safeDiv(a: number, b: number): number {
  if (!b || b === 0) return 0;
  return Math.round((a / b) * 100) / 100;
}

// ─── SEMrush helpers ──────────────────────────────────────────────────────────

async function getSemrushKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("semrush");
  if (!creds.length) return null;
  try { return decrypt(creds[0].encryptedValue); } catch { return null; }
}

async function semrushDomainData(apiKey: string, domain: string): Promise<{
  organicKeywords: string;
  organicTraffic: string;
  informationalKeywords: string;
  featuredSnippets: string;
} | null> {
  try {
    // Domain ranks (organic keywords + traffic)
    const qs = new URLSearchParams({ type: "domain_ranks", domain, database: "us", export_columns: "Or,Ot", key: apiKey }).toString();
    const resp = await fetch(`https://api.semrush.com/?${qs}`);
    const text = await resp.text();
    if (!resp.ok || text.startsWith("ERROR") || !text.trim()) return null;
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(";");
    const vals = lines[1].split(";");
    const get = (h: string) => vals[headers.indexOf(h)] ?? DASH;
    return {
      organicKeywords: fmtNum(get("Organic Keywords")),
      organicTraffic: fmtNum(get("Organic Traffic")),
      informationalKeywords: DASH,
      featuredSnippets: DASH,
    };
  } catch { return null; }
}

// ─── Metric computation ───────────────────────────────────────────────────────

export function computeDerivedMetrics(raw: Record<string, any>): Record<string, string> {
  const g = (k: string) => parseNum(raw[k]);
  const today = new Date();

  const age = raw.whoisReg ? toYears(raw.whoisReg) : null;
  const archiveAge = raw.firstArchive ? toYears(raw.firstArchive) : null;

  const derived: Record<string, string> = {
    age: age !== null ? String(age) : DASH,
    archiveAge: archiveAge !== null ? String(archiveAge) : DASH,
    kwVelocity: age && g("organicKeywords") ? fmtNum(safeDiv(g("organicKeywords"), age)) : DASH,
    snippetVelocity: age && g("featuredSnippets") ? fmtNum(safeDiv(g("featuredSnippets"), age)) : DASH,
    rdVelocity: age && g("referringDomains") ? fmtNum(safeDiv(g("referringDomains"), age)) : DASH,
    contentVelocity: age && g("indexedPages") ? fmtNum(safeDiv(g("indexedPages"), age)) : DASH,
    kwYield: g("organicKeywords") ? fmtNum(safeDiv(g("organicTraffic"), g("organicKeywords"))) : DASH,
    snippetYield: g("featuredSnippets") ? fmtNum(safeDiv(g("organicTraffic"), g("featuredSnippets"))) : DASH,
    mentionRate: g("citedSources") ? fmtNum(Math.round(safeDiv(g("aiMentions"), g("citedSources")) * 100)) + "%" : DASH,
    rdYield: g("referringDomains") ? fmtNum(safeDiv(g("organicTraffic"), g("referringDomains"))) : DASH,
    contentYield: g("indexedPages") ? fmtNum(safeDiv(g("organicTraffic"), g("indexedPages"))) : DASH,
    backlinkDensity: g("referringDomains") ? fmtNum(safeDiv(g("backlinks"), g("referringDomains"))) : DASH,
    informationalDensity: g("organicKeywords") ? fmtNum(Math.round(safeDiv(g("informationalKeywords"), g("organicKeywords")) * 100)) + "%" : DASH,
  };

  return derived;
}

// ─── Rank computation ─────────────────────────────────────────────────────────

export function computeRanks(rows: Array<{ metrics: any; computed: any }>): Array<Record<string, string>> {
  // Metrics where higher = better rank 1
  const descMetrics = [
    "dr", "referringDomains", "backlinks", "organicTraffic", "organicKeywords",
    "top10Keywords", "indexedPages", "aiVisibilityScore", "aiMentions", "citedSources",
    "informationalKeywords", "featuredSnippets",
    "age", "archiveAge", "kwVelocity", "snippetVelocity", "rdVelocity", "contentVelocity",
    "kwYield", "snippetYield", "rdYield", "contentYield", "backlinkDensity",
  ];

  const allMetrics = [...new Set([...Object.keys(rows[0]?.metrics ?? {}), ...Object.keys(rows[0]?.computed ?? {})])];
  const result: Array<Record<string, string>> = rows.map(() => ({}));

  for (const key of allMetrics) {
    const vals = rows.map(r => parseNum((r.metrics as any)[key] ?? (r.computed as any)[key]));
    const sorted = [...vals].map((v, i) => ({ i, v })).filter(x => x.v > 0).sort((a, b) => descMetrics.includes(key) ? b.v - a.v : a.v - b.v);
    for (let ri = 0; ri < rows.length; ri++) {
      const pos = sorted.findIndex(x => x.i === ri);
      result[ri][key] = pos >= 0 ? String(pos + 1) : DASH;
    }
  }

  // Average rank and final score
  for (let ri = 0; ri < rows.length; ri++) {
    const rankVals = Object.values(result[ri]).map(v => parseInt(v)).filter(n => !isNaN(n) && n > 0);
    if (rankVals.length > 0) {
      const avg = Math.round(rankVals.reduce((a, b) => a + b, 0) / rankVals.length * 10) / 10;
      result[ri].averageRank = String(avg);
      result[ri].finalScore = String(avg);
    } else {
      result[ri].averageRank = DASH;
      result[ri].finalScore = DASH;
    }
  }

  return result;
}

// ─── Summary table generators ─────────────────────────────────────────────────

export interface ClicksDistRow {
  category: string;
  numPages: number;
  sumClicks: number;
  clicksPerPage: number;
  shareOfClicks: number;
  notes?: string;
}

export interface TrafficDistRow {
  category: string;
  numPages: number;
  sumSessions: number;
  sessionsPerPage: number;
  shareOfSessions: number;
  notes?: string;
}

export function buildClicksDistribution(crawlRows: Array<{ pageCategory: string; performanceFields: any }>): ClicksDistRow[] {
  const byCategory: Record<string, { pages: number; clicks: number }> = {};
  let totalClicks = 0;

  for (const row of crawlRows) {
    const cat = row.pageCategory || "Other";
    const clicks = parseNum((row.performanceFields as any)?.gscClicks ?? 0);
    if (!byCategory[cat]) byCategory[cat] = { pages: 0, clicks: 0 };
    byCategory[cat].pages++;
    byCategory[cat].clicks += clicks;
    totalClicks += clicks;
  }

  return Object.entries(byCategory)
    .map(([category, { pages, clicks }]) => ({
      category,
      numPages: pages,
      sumClicks: clicks,
      clicksPerPage: pages > 0 ? Math.round((clicks / pages) * 100) / 100 : 0,
      shareOfClicks: totalClicks > 0 ? Math.round((clicks / totalClicks) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.sumClicks - a.sumClicks);
}

export function buildTrafficDistribution(crawlRows: Array<{ pageCategory: string; performanceFields: any }>): TrafficDistRow[] {
  const byCategory: Record<string, { pages: number; sessions: number }> = {};
  let totalSessions = 0;

  for (const row of crawlRows) {
    const cat = row.pageCategory || "Other";
    const sessions = parseNum((row.performanceFields as any)?.ga4Sessions ?? 0);
    if (!byCategory[cat]) byCategory[cat] = { pages: 0, sessions: 0 };
    byCategory[cat].pages++;
    byCategory[cat].sessions += sessions;
    totalSessions += sessions;
  }

  return Object.entries(byCategory)
    .map(([category, { pages, sessions }]) => ({
      category,
      numPages: pages,
      sumSessions: sessions,
      sessionsPerPage: pages > 0 ? Math.round((sessions / pages) * 100) / 100 : 0,
      shareOfSessions: totalSessions > 0 ? Math.round((sessions / totalSessions) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.sumSessions - a.sumSessions);
}

// ─── GSC / GA4 enrichment for crawl rows ─────────────────────────────────────

export async function enrichCrawlRowsWithPerformance(
  clientId: number,
  crawlRows: Array<{ url: string; pageCategory: string; crawlFields: any; performanceFields: any }>,
): Promise<Array<{ url: string; pageCategory: string; crawlFields: any; performanceFields: any }>> {
  const client = await storage.getClient(clientId);
  if (!client) return crawlRows;

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);
  const dateRange = `${start}_${end}`;

  const gscPageMap: Record<string, { clicks: number; impressions: number; ctr: number; position: number }> = {};
  const ga4SessionMap: Record<string, number> = {};

  try {
    const [gscResult, ga4Result] = await Promise.allSettled([
      queryGsc("gsc_qoq_pages" as any, client, dateRange),
      queryGa4("ga4_landing_pages_by_sessions" as any, client, dateRange),
    ]);

    if (gscResult.status === "fulfilled" && gscResult.value?.tables?.[0]) {
      for (const row of gscResult.value.tables[0].rows) {
        const url = String(row[0] ?? "");
        if (url) gscPageMap[url] = { clicks: Number(row[1]) || 0, impressions: Number(row[2]) || 0, ctr: Number(row[3]) || 0, position: Number(row[4]) || 0 };
      }
    }

    if (ga4Result.status === "fulfilled" && ga4Result.value?.tables?.[0]) {
      for (const row of ga4Result.value.tables[0].rows) {
        const url = String(row[0] ?? "");
        if (url) ga4SessionMap[url] = Number(row[1]) || 0;
      }
    }
  } catch { /* silent */ }

  return crawlRows.map(row => {
    const gsc = gscPageMap[row.url] ?? gscPageMap[row.url.replace(/\/$/, "")] ?? null;
    const sessions = ga4SessionMap[row.url] ?? ga4SessionMap[row.url.replace(/\/$/, "")] ?? 0;
    return {
      ...row,
      performanceFields: {
        ...(row.performanceFields as any ?? {}),
        gscClicks: gsc?.clicks ?? 0,
        gscImpressions: gsc?.impressions ?? 0,
        gscCtr: gsc?.ctr ?? 0,
        gscPosition: gsc?.position ?? 0,
        ga4Sessions: sessions,
      },
    };
  });
}

// ─── SEMrush metrics for client ───────────────────────────────────────────────

export async function fetchClientSemrushMetrics(clientId: number): Promise<{ organicKeywords: string; organicTraffic: string } | null> {
  const client = await storage.getClient(clientId);
  if (!client) return null;
  const semrushKey = await getSemrushKey();
  if (!semrushKey) return null;
  const domain = extractDomain(client.gscSiteUrl ?? client.ahrefsProjectUrl) ?? "";
  if (!domain) return null;
  return semrushDomainData(semrushKey, domain);
}
