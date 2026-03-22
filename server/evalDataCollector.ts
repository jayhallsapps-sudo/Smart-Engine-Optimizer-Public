/**
 * Evaluation Data Collector
 * Responsible for fetching, enriching, and computing metrics for an eval batch.
 * Handles: SEMrush, Ahrefs, WHOIS (RDAP), Wayback Machine (CDX), GSC, GA4.
 */

import { storage } from "./storage";
import { queryGsc } from "./gscClient";
import { queryGa4 } from "./ga4Client";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";
import { classifyUrl, DEFAULT_CATEGORY_RULES, type CategoryRule } from "./evalMetricRegistry";

const DASH = "—";

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
  const cleaned = String(s ?? "").replace(/,/g, "").replace(/%$/, "");
  if (!cleaned || cleaned === DASH || cleaned === "—") return 0;
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

// ─── API credential helpers ────────────────────────────────────────────────────

async function getSemrushKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("semrush");
  if (!creds.length) return null;
  try { return decrypt(creds[0].encryptedValue); } catch { return null; }
}

async function getAhrefsToken(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("ahrefs");
  if (!creds.length) return null;
  try { return decrypt(creds[0].encryptedValue); } catch { return null; }
}

function cleanDomainForApi(url: string): string {
  return (extractDomain(url) ?? url).replace(/^www\./, "");
}

// ─── WHOIS via RDAP ───────────────────────────────────────────────────────────

export async function fetchWhoisReg(domain: string): Promise<string> {
  try {
    const d = cleanDomainForApi(domain);
    const resp = await fetch(`https://rdap.org/domain/${encodeURIComponent(d)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return DASH;
    const data = await resp.json();
    // RDAP events: look for "registration" event
    const events: Array<{ eventAction: string; eventDate: string }> = data.events ?? [];
    const reg = events.find(e => e.eventAction === "registration");
    if (reg?.eventDate) {
      // Parse ISO date to YYYY-MM-DD
      return reg.eventDate.slice(0, 10);
    }
    return DASH;
  } catch { return DASH; }
}

// ─── Wayback Machine earliest snapshot via CDX API ───────────────────────────

export async function fetchFirstArchive(domain: string): Promise<{ date: string; url: string }> {
  const empty = { date: DASH, url: DASH };
  try {
    const d = cleanDomainForApi(domain);
    const qs = new URLSearchParams({
      url: d,
      output: "json",
      limit: "1",
      fl: "timestamp",
      fastLatest: "false",
      from: "19900101",
    }).toString();
    const resp = await fetch(`https://web.archive.org/cdx/search/cdx?${qs}`, {
      signal: AbortSignal.timeout(18000),
    });
    if (!resp.ok) { console.warn(`[Wayback] non-ok status ${resp.status} for "${d}"`); return empty; }
    const data = await resp.json();
    // data is [[header], [row]] or [[row]] — first row after header is oldest
    if (!Array.isArray(data) || data.length < 2) { console.log(`[Wayback] no archive found for "${d}"`); return empty; }
    const ts = String(data[1]?.[0] ?? "");
    if (ts.length < 8) return empty;
    // Convert YYYYMMDDHHMMSS to YYYY-MM-DD
    const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    const url = `https://web.archive.org/web/${ts}/${d}`;
    console.log(`[Wayback] OK for "${d}" — first=${date}`);
    return { date, url };
  } catch (err: any) { console.warn(`[Wayback] timeout/error for "${d}":`, err?.message ?? err); return empty; }
}

// ─── SEMrush domain data ──────────────────────────────────────────────────────

async function semrushDomainData(apiKey: string, domain: string): Promise<{
  organicKeywords: string;
  organicTraffic: string;
  indexedPages: string;
  informationalKeywords: string;
  featuredSnippets: string;
} | null> {
  try {
    const d = cleanDomainForApi(domain);

    // Step 1: domain_ranks — fast summary, but only works for domains SEMrush actively tracks (> ~100 visits/mo)
    const rankQs = new URLSearchParams({ type: "domain_ranks", domain: d, database: "us", export_columns: "Or,Ot,Pc", key: apiKey }).toString();
    const rankResp = await fetch(`https://api.semrush.com/?${rankQs}`, { signal: AbortSignal.timeout(12000) });
    const rankText = await rankResp.text();
    let organicKeywords = DASH, organicTraffic = DASH, indexedPages = DASH;
    if (rankResp.ok && rankText && !rankText.startsWith("ERROR")) {
      const lines = rankText.trim().split("\n");
      if (lines.length >= 2) {
        const headers = lines[0].split(";");
        const vals = lines[1].split(";");
        const get = (h: string) => { const i = headers.indexOf(h); return i >= 0 ? vals[i] : null; };
        organicKeywords = fmtNum(get("Organic Keywords") ?? get("Or") ?? null);
        organicTraffic = fmtNum(get("Organic Traffic") ?? get("Ot") ?? null);
        indexedPages = fmtNum(get("Pages Crawled") ?? get("Pc") ?? null);
      } else {
        console.log(`[SEMrush domain_ranks] No data row for ${d} — domain may be below SEMrush tracking threshold. Will try domain_organic fallback.`);
      }
    } else {
      console.log(`[SEMrush domain_ranks] ${rankResp.status} / text: ${rankText.slice(0, 100)} for ${d}`);
    }

    // Step 2: domain_organic — works for any domain regardless of traffic volume.
    // Fetch top 5000 keywords in one call; count rows for organicKeywords fallback,
    // and also derive featuredSnippets + informationalKeywords from the same result set.
    let allKwLines: string[] = [];
    let featuredSnippets = DASH;
    let informationalKeywords = DASH;

    try {
      // Request Ph (keyword), Nq (volume), Po (position), Fk (SERP features), In (intent) columns
      // display_limit capped at 100: each row costs 1 API unit; 100 covers all keywords for
      // small/mid competitor domains while preserving account balance.
      const allKwQs = new URLSearchParams({
        type: "domain_organic", domain: d, database: "us",
        display_limit: "100", export_columns: "Ph,Nq,Po,Fk,In",
        display_sort: "nq_desc",
        key: apiKey,
      }).toString();
      const allKwResp = await fetch(`https://api.semrush.com/?${allKwQs}`, { signal: AbortSignal.timeout(30000) });
      const allKwText = await allKwResp.text();
      if (allKwResp.ok && allKwText && !allKwText.startsWith("ERROR")) {
        // Parse once and derive everything
        const rawLines = allKwText.trim().split("\n").filter(Boolean);
        if (rawLines.length >= 2) {
          const hdr = rawLines[0].split(";");
          allKwLines = rawLines.slice(1); // data rows only

          const fkIdx = hdr.indexOf("Fk");
          const inIdx = hdr.indexOf("In");

          // organicKeywords fallback: if domain_ranks returned nothing, use the domain_organic count
          if (organicKeywords === DASH && allKwLines.length > 0) {
            organicKeywords = String(allKwLines.length);
          }

          // Featured snippets: SERP feature code "Featured snippet" in SEMrush = Fk value containing "12"
          if (fkIdx >= 0) {
            const fsCount = allKwLines.filter(line => {
              const cols = line.split(";");
              const fk = cols[fkIdx] ?? "";
              // SEMrush Fk column: comma-separated codes. 12 = featured snippet
              return fk.split(",").some(code => code.trim() === "12");
            }).length;
            if (fsCount > 0) featuredSnippets = String(fsCount);
          }

          // Informational keywords: In column = "Informational"
          if (inIdx >= 0) {
            const infoCount = allKwLines.filter(line => {
              const cols = line.split(";");
              return (cols[inIdx] ?? "").toLowerCase().includes("informational");
            }).length;
            if (infoCount > 0) informationalKeywords = String(infoCount);
          }

          console.log(`[SEMrush domain_organic] OK for "${d}" — rows=${allKwLines.length} fsCount=${featuredSnippets} infoCount=${informationalKeywords}`);

          // Estimate organic traffic from domain_organic if domain_ranks failed:
          // Sum top-100 keyword volumes × CTR proxy (pos 1=0.28, 2=0.15, 3=0.11, 4-10=0.07, 11+=0.02)
          if (organicTraffic === DASH) {
            const poIdx = hdr.indexOf("Po");
            const nqIdx = hdr.indexOf("Nq");
            if (poIdx >= 0 && nqIdx >= 0) {
              let estTraffic = 0;
              for (const line of allKwLines.slice(0, 100)) {
                const cols = line.split(";");
                const pos = parseInt(cols[poIdx] ?? "0") || 0;
                const vol = parseInt(cols[nqIdx] ?? "0") || 0;
                const ctr = pos === 1 ? 0.28 : pos === 2 ? 0.15 : pos === 3 ? 0.11 : pos <= 10 ? 0.07 : 0.02;
                estTraffic += vol * ctr;
              }
              if (estTraffic > 0) organicTraffic = fmtNum(Math.round(estTraffic));
            }
          }
        } else {
          console.log(`[SEMrush domain_organic] No data rows for ${d}`);
        }
      } else {
        console.log(`[SEMrush domain_organic] ${allKwResp.status} / text: ${allKwText.slice(0, 100)} for ${d}`);
      }
    } catch (e: any) {
      console.error(`[SEMrush domain_organic] Error for ${d}:`, e.message);
    }

    return { organicKeywords, organicTraffic, indexedPages, informationalKeywords, featuredSnippets };
  } catch (e: any) {
    console.error(`[SEMrush semrushDomainData] Outer error for ${domain}:`, e.message);
    return null;
  }
}

// ─── SEMrush keyword gap (client vs competitors) ──────────────────────────────

export async function fetchKeywordGap(
  clientDomain: string,
  competitorDomains: string[],
): Promise<Array<{ keyword: string; volume: number; clientPos: string; competitors: Array<{ domain: string; pos: string }> }>> {
  const apiKey = await getSemrushKey();
  if (!apiKey || competitorDomains.length === 0) return [];

  try {
    const clientD = cleanDomainForApi(clientDomain);

    // Fetch client's top 500 ranking keywords
    const clientQs = new URLSearchParams({
      type: "domain_organic", domain: clientD, database: "us",
      display_limit: "500", export_columns: "Ph,Po,Nq",
      key: apiKey,
    }).toString();
    const clientResp = await fetch(`https://api.semrush.com/?${clientQs}`);
    const clientText = await clientResp.text();
    const clientKeywords = new Map<string, string>(); // keyword -> position
    if (clientResp.ok && clientText && !clientText.startsWith("ERROR")) {
      const lines = clientText.trim().split("\n").slice(1).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(";");
        if (parts[0]) clientKeywords.set(parts[0].trim().toLowerCase(), parts[1]?.trim() ?? DASH);
      }
    }

    // Fetch top competitors' keywords, find gaps
    const gaps: Array<{ keyword: string; volume: number; clientPos: string; competitors: Array<{ domain: string; pos: string }> }> = [];
    const seen = new Set<string>();

    for (const compUrl of competitorDomains.slice(0, 3)) {
      const compD = cleanDomainForApi(compUrl);
      const compQs = new URLSearchParams({
        type: "domain_organic", domain: compD, database: "us",
        display_limit: "200", export_columns: "Ph,Po,Nq",
        display_sort: "nq_desc", key: apiKey,
      }).toString();
      const compResp = await fetch(`https://api.semrush.com/?${compQs}`);
      const compText = await compResp.text();
      if (!compResp.ok || !compText || compText.startsWith("ERROR")) continue;

      const compLines = compText.trim().split("\n").slice(1).filter(Boolean);
      for (const line of compLines) {
        const parts = line.split(";");
        const kw = parts[0]?.trim().toLowerCase() ?? "";
        const pos = parts[1]?.trim() ?? DASH;
        const vol = parseInt(parts[2]?.trim() ?? "0") || 0;
        if (!kw || seen.has(kw)) continue;
        const clientPos = clientKeywords.get(kw);
        // Only include if client doesn't rank top 20 for it
        const clientRank = parseInt(clientPos ?? "999");
        const compRank = parseInt(pos);
        if (compRank <= 10 && (isNaN(clientRank) || clientRank > 20) && vol > 50) {
          seen.add(kw);
          gaps.push({
            keyword: kw,
            volume: vol,
            clientPos: clientPos ?? DASH,
            competitors: [{ domain: compD, pos }],
          });
        }
      }
    }

    return gaps.sort((a, b) => b.volume - a.volume).slice(0, 100);
  } catch { return []; }
}

// ─── Ahrefs v3 endpoints (the /overview endpoint does not exist — use individual endpoints) ───

async function ahrefsDomainRating(token: string, domain: string): Promise<string> {
  try {
    const d = cleanDomainForApi(domain);
    const today = new Date().toISOString().slice(0, 10);
    const qs = new URLSearchParams({ target: d, date: today }).toString();
    const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/domain-rating?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[Ahrefs domain-rating] HTTP ${resp.status} for "${d}": ${body.slice(0, 200)}`);
      return DASH;
    }
    const data = await resp.json();
    // Ahrefs v3 response: { domain_rating: { domain_rating: 52.3, ahrefs_rank: ... } } (nested)
    // OR sometimes: { domain_rating: 52 } (flat). Handle both.
    const raw = data?.domain_rating;
    const dr = typeof raw === "number" ? raw : (raw?.domain_rating ?? data?.domain?.domain_rating ?? null);
    console.log(`[Ahrefs domain-rating] OK for "${d}" — dr=${dr}`);
    return dr != null ? String(Math.round(Number(dr))) : DASH;
  } catch (e: any) {
    console.error(`[Ahrefs domain-rating] Exception for "${domain}":`, e.message);
    return DASH;
  }
}

async function ahrefsBacklinksStats(token: string, domain: string): Promise<{ backlinks: string; referringDomains: string }> {
  const blank = { backlinks: DASH, referringDomains: DASH };
  try {
    const d = cleanDomainForApi(domain);
    const today = new Date().toISOString().slice(0, 10);
    const qs = new URLSearchParams({ target: d, mode: "domain", date: today }).toString();
    const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/backlinks-stats?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[Ahrefs backlinks-stats] HTTP ${resp.status} for "${d}": ${body.slice(0, 200)}`);
      return blank;
    }
    const data = await resp.json();
    // Response shape: { metrics: { live: N, all_time: N, live_refdomains: N, all_time_refdomains: N } }
    const m = data.metrics ?? data;
    const bl = m?.live ?? m?.backlinks ?? null;
    const rd = m?.live_refdomains ?? m?.refdomains ?? m?.referring_domains ?? null;
    console.log(`[Ahrefs backlinks-stats] OK for "${d}" — bl=${bl} rd=${rd}`);
    return {
      backlinks: bl != null ? String(bl) : DASH,
      referringDomains: rd != null ? String(rd) : DASH,
    };
  } catch (e: any) {
    console.error(`[Ahrefs backlinks-stats] Exception for "${domain}":`, e.message);
    return blank;
  }
}

async function ahrefsOrganicKeywordsTotal(token: string, domain: string): Promise<string> {
  try {
    const d = cleanDomainForApi(domain);
    const today = new Date().toISOString().slice(0, 10);
    // Ahrefs v3 organic-keywords endpoint returns { keywords: [...] } — no meta.total.
    // limit=25 matches the plan's per-query row cap; avoids billing for rows that are never returned.
    const qs = new URLSearchParams({ select: "keyword", target: d, mode: "domain", limit: "25", date: today }).toString();
    const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/organic-keywords?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[Ahrefs organic-keywords total] HTTP ${resp.status} for "${d}": ${body.slice(0, 200)}`);
      return DASH;
    }
    const data = await resp.json();
    const count = Array.isArray(data.keywords) ? data.keywords.length : null;
    console.log(`[Ahrefs organic-keywords total] OK for "${d}" — count=${count}`);
    return count !== null && count > 0 ? String(count) : DASH;
  } catch (e: any) {
    console.error(`[Ahrefs organic-keywords total] Exception for "${domain}":`, e.message);
    return DASH;
  }
}

async function ahrefsTop1to3Count(token: string, domain: string): Promise<string> {
  try {
    const d = cleanDomainForApi(domain);
    const today = new Date().toISOString().slice(0, 10);
    // Ahrefs v3: use the boolean column "is_best_position_set_top_3" to filter keywords ranking 1-3
    const where = JSON.stringify({ field: "is_best_position_set_top_3", is: ["eq", true] });
    const qs = new URLSearchParams({ select: "keyword", target: d, mode: "domain", limit: "25", date: today, where }).toString();
    const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/organic-keywords?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[Ahrefs top1-3] HTTP ${resp.status} for "${d}": ${body.slice(0, 150)}`);
      return DASH;
    }
    const data = await resp.json();
    const count = Array.isArray(data.keywords) ? data.keywords.length : null;
    console.log(`[Ahrefs top1-3] OK for "${d}" — count=${count}`);
    return count !== null ? String(count) : DASH;
  } catch (e: any) {
    console.error(`[Ahrefs top1-3] Exception for "${domain}":`, e.message);
    return DASH;
  }
}

async function ahrefsTop4to10Count(token: string, domain: string): Promise<string> {
  try {
    const d = cleanDomainForApi(domain);
    const today = new Date().toISOString().slice(0, 10);
    // Ahrefs v3: best_position_set enum — "top_4_10" = keywords with best position in 4-10
    const where = JSON.stringify({ field: "best_position_set", is: ["eq", "top_4_10"] });
    const qs = new URLSearchParams({ select: "keyword", target: d, mode: "domain", limit: "25", date: today, where }).toString();
    const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/organic-keywords?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[Ahrefs top4-10] HTTP ${resp.status} for "${d}": ${body.slice(0, 200)}`);
      return DASH;
    }
    const data = await resp.json();
    const count = Array.isArray(data.keywords) ? data.keywords.length : null;
    console.log(`[Ahrefs top4-10] OK for "${d}" — count=${count}`);
    return count !== null ? String(count) : DASH;
  } catch (e: any) {
    console.error(`[Ahrefs top4-10] Exception for "${domain}":`, e.message);
    return DASH;
  }
}

// ─── Combined competitor metric fetch ─────────────────────────────────────────

export async function fetchCompetitorEvalMetrics(domain: string, opts?: { includeWhoisWayback?: boolean }): Promise<{
  dr: string; referringDomains: string; backlinks: string;
  organicTraffic: string; organicKeywords: string; top10Keywords: string;
  top1to3Keywords: string; top4to10Keywords: string;
  indexedPages: string; featuredSnippets: string; informationalKeywords: string;
  whoisReg: string; firstArchive: string; archiveUrl: string;
}> {
  const blank = {
    dr: DASH, referringDomains: DASH, backlinks: DASH,
    organicTraffic: DASH, organicKeywords: DASH, top10Keywords: DASH,
    top1to3Keywords: DASH, top4to10Keywords: DASH,
    indexedPages: DASH, featuredSnippets: DASH, informationalKeywords: DASH,
    whoisReg: DASH, firstArchive: DASH, archiveUrl: DASH,
  };

  const [ahrefsToken, semrushKey] = await Promise.all([getAhrefsToken(), getSemrushKey()]);
  const includeWW = opts?.includeWhoisWayback ?? true;

  // Run all API calls in parallel — Ahrefs uses separate v3 endpoints (no /overview)
  const [drResult, blResult, ahrefsKwResult, top1to3Result, top4to10Result, semrushResult, whoisResult, archiveResult] = await Promise.allSettled([
    ahrefsToken ? ahrefsDomainRating(ahrefsToken, domain) : Promise.resolve(DASH),
    ahrefsToken ? ahrefsBacklinksStats(ahrefsToken, domain) : Promise.resolve({ backlinks: DASH, referringDomains: DASH }),
    ahrefsToken ? ahrefsOrganicKeywordsTotal(ahrefsToken, domain) : Promise.resolve(DASH),
    ahrefsToken ? ahrefsTop1to3Count(ahrefsToken, domain) : Promise.resolve(DASH),
    ahrefsToken ? ahrefsTop4to10Count(ahrefsToken, domain) : Promise.resolve(DASH),
    semrushKey ? semrushDomainData(semrushKey, domain) : Promise.resolve(null),
    includeWW ? fetchWhoisReg(domain) : Promise.resolve(DASH),
    includeWW ? fetchFirstArchive(domain) : Promise.resolve({ date: DASH, url: DASH }),
  ]);

  const dr = drResult.status === "fulfilled" ? drResult.value : DASH;
  const bl = blResult.status === "fulfilled" ? blResult.value : { backlinks: DASH, referringDomains: DASH };
  const ahrefsKw = ahrefsKwResult.status === "fulfilled" ? ahrefsKwResult.value : DASH;
  const top1to3 = top1to3Result.status === "fulfilled" ? top1to3Result.value : DASH;
  const top4to10 = top4to10Result.status === "fulfilled" ? top4to10Result.value : DASH;
  const sem = semrushResult.status === "fulfilled" ? semrushResult.value : null;
  const whois = whoisResult.status === "fulfilled" ? whoisResult.value : DASH;
  const archiveResult_ = archiveResult.status === "fulfilled" ? archiveResult.value : { date: DASH, url: DASH };

  // top1to3 = keywords in positions 1-3 (is_best_position_set_top_3 boolean)
  // top4to10 = keywords in positions 4-10 (best_position_set = "top_4_10" enum)
  // top10Combined = true top-10 keyword count (sum of both)
  const top1to3Num = top1to3 !== DASH ? parseInt(top1to3) : null;
  const top4to10Num = top4to10 !== DASH ? parseInt(top4to10) : null;
  const top10Combined =
    top1to3Num !== null && top4to10Num !== null ? String(top1to3Num + top4to10Num) :
    top1to3Num !== null ? String(top1to3Num) :
    top4to10Num !== null ? String(top4to10Num) :
    DASH;

  // organicKeywords: Ahrefs total count first, SEMrush fallback
  const organicKeywords = ahrefsKw !== DASH ? ahrefsKw : (sem?.organicKeywords ?? DASH);
  // organicTraffic: SEMrush only (Ahrefs v3 has no traffic endpoint)
  const organicTraffic = sem?.organicTraffic ?? DASH;

  return {
    dr,
    referringDomains: bl.referringDomains,
    backlinks: bl.backlinks,
    organicTraffic,
    organicKeywords,
    top10Keywords: top10Combined,
    top1to3Keywords: top1to3,
    top4to10Keywords: top4to10,
    indexedPages: sem?.indexedPages ?? DASH,
    featuredSnippets: sem?.featuredSnippets ?? DASH,
    informationalKeywords: sem?.informationalKeywords ?? DASH,
    whoisReg: whois,
    firstArchive: archiveResult_.date,
    archiveUrl: archiveResult_.url,
  };
}

// ─── GSC-priority client metrics ──────────────────────────────────────────────
// For the client row: pull GSC total clicks + total unique pages as org traffic/keywords
// This gives first-party data priority per the data-handling-rules.

export async function fetchClientGscMetrics(clientId: number): Promise<{
  organicTraffic: string;
  organicKeywords: string;
} | null> {
  try {
    const client = await storage.getClient(clientId);
    if (!client) return null;

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    const dateRange = `${start}_${end}`;

    const result = await queryGsc("gsc_qoq_pages" as any, client, dateRange);
    if (!result?.tables?.[0]) return null;

    const rows = result.tables[0].rows;
    let totalClicks = 0;
    const kwSet = new Set<string>();
    for (const row of rows) {
      totalClicks += Number(row[1]) || 0;
      if (row[0]) kwSet.add(String(row[0]));
    }

    return {
      organicTraffic: totalClicks > 0 ? String(totalClicks) : DASH,
      organicKeywords: kwSet.size > 0 ? String(kwSet.size) : DASH,
    };
  } catch { return null; }
}

// ─── Metric computation ───────────────────────────────────────────────────────

export function computeDerivedMetrics(raw: Record<string, any>): Record<string, string> {
  const g = (k: string) => parseNum(raw[k]);

  const age = raw.whoisReg && raw.whoisReg !== DASH ? toYears(raw.whoisReg) : null;
  const archiveAge = raw.firstArchive && raw.firstArchive !== DASH ? toYears(raw.firstArchive) : null;

  return {
    age: age !== null ? String(age) : DASH,
    archiveAge: archiveAge !== null ? String(archiveAge) : DASH,
    kwVelocity: age && g("organicKeywords") ? fmtNum(safeDiv(g("organicKeywords"), age)) : DASH,
    snippetVelocity: age && g("featuredSnippets") ? fmtNum(safeDiv(g("featuredSnippets"), age)) : DASH,
    rdVelocity: age && g("referringDomains") ? fmtNum(safeDiv(g("referringDomains"), age)) : DASH,
    contentVelocity: age && g("indexedPages") ? fmtNum(safeDiv(g("indexedPages"), age)) : DASH,
    kwYield: g("organicKeywords") ? fmtNum(safeDiv(g("organicTraffic"), g("organicKeywords"))) : DASH,
    snippetYield: g("featuredSnippets") ? fmtNum(safeDiv(g("organicTraffic"), g("featuredSnippets"))) : DASH,
    // Store mention rate as plain number (not "30%") so rank engine can parse it
    mentionRate: g("citedSources") ? String(Math.round(safeDiv(g("aiMentions"), g("citedSources")) * 100)) : DASH,
    rdYield: g("referringDomains") ? fmtNum(safeDiv(g("organicTraffic"), g("referringDomains"))) : DASH,
    contentYield: g("indexedPages") ? fmtNum(safeDiv(g("organicTraffic"), g("indexedPages"))) : DASH,
    // backlinkDensity: combined link weight (backlinks + referring domains) per indexed page
    backlinkDensity: g("indexedPages") ? fmtNum(safeDiv(g("backlinks") + g("referringDomains"), g("indexedPages"))) : DASH,
    // snippetDensity: featured snippets per organic keyword (share of kws owning a snippet)
    snippetDensity: g("organicKeywords") ? String(Math.round(safeDiv(g("featuredSnippets"), g("organicKeywords")) * 100)) : DASH,
    // contentDensity: organic keywords per indexed page (keyword coverage efficiency)
    contentDensity: g("indexedPages") ? fmtNum(safeDiv(g("organicKeywords"), g("indexedPages"))) : DASH,
    // Store informational density as plain number (not "30%")
    informationalDensity: g("organicKeywords") ? String(Math.round(safeDiv(g("informationalKeywords"), g("organicKeywords")) * 100)) : DASH,
  };
}

// ─── Rank computation ─────────────────────────────────────────────────────────

// Benchmark metrics with weights for finalScore (higher weight = more important)
const WEIGHTED_BENCHMARKS: Record<string, number> = {
  dr: 2.0,
  organicTraffic: 2.0,
  organicKeywords: 1.5,
  referringDomains: 1.5,
  top10Keywords: 1.5,
  featuredSnippets: 1.0,
  indexedPages: 1.0,
  backlinks: 1.0,
  age: 0.5,
  archiveAge: 0.5,
  kwVelocity: 0.5,
  rdVelocity: 0.5,
  informationalKeywords: 0.5,
};

export function computeRanks(rows: Array<{ metrics: any; computed: any }>): Array<Record<string, string>> {
  const descMetrics = [
    "dr", "referringDomains", "backlinks", "organicTraffic", "organicKeywords",
    "top10Keywords", "indexedPages", "aiVisibilityScore", "aiMentions", "citedSources",
    "informationalKeywords", "featuredSnippets",
    "age", "archiveAge", "kwVelocity", "snippetVelocity", "rdVelocity", "contentVelocity",
    "kwYield", "snippetYield", "rdYield", "contentYield", "backlinkDensity",
    "snippetDensity", "contentDensity",
    "informationalDensity", "mentionRate",
    "top1to3Keywords", "top4to10Keywords",
  ];

  const allMetrics = [...new Set([
    ...Object.keys(rows[0]?.metrics ?? {}),
    ...Object.keys(rows[0]?.computed ?? {}),
  ])].filter(k => k !== "finalScore" && k !== "averageRank");

  const result: Array<Record<string, string>> = rows.map(() => ({}));

  for (const key of allMetrics) {
    const vals = rows.map(r => parseNum((r.metrics as any)[key] ?? (r.computed as any)[key]));
    const sorted = [...vals].map((v, i) => ({ i, v }))
      .filter(x => x.v > 0)
      .sort((a, b) => descMetrics.includes(key) ? b.v - a.v : a.v - b.v);
    for (let ri = 0; ri < rows.length; ri++) {
      const pos = sorted.findIndex(x => x.i === ri);
      result[ri][key] = pos >= 0 ? String(pos + 1) : DASH;
    }
  }

  // averageRank = simple mean of all individual metric ranks
  // finalScore  = weighted mean using only key benchmark metrics
  for (let ri = 0; ri < rows.length; ri++) {
    const allRankVals = Object.entries(result[ri])
      .map(([, v]) => parseInt(v))
      .filter(n => !isNaN(n) && n > 0);

    if (allRankVals.length > 0) {
      const avg = Math.round(allRankVals.reduce((a, b) => a + b, 0) / allRankVals.length * 10) / 10;
      result[ri].averageRank = String(avg);
    } else {
      result[ri].averageRank = DASH;
    }

    // Weighted finalScore
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [metric, weight] of Object.entries(WEIGHTED_BENCHMARKS)) {
      const rankStr = result[ri][metric];
      const rankNum = parseInt(rankStr ?? "");
      if (!isNaN(rankNum) && rankNum > 0) {
        weightedSum += rankNum * weight;
        totalWeight += weight;
      }
    }
    result[ri].finalScore = totalWeight > 0
      ? String(Math.round((weightedSum / totalWeight) * 10) / 10)
      : DASH;
  }

  return result;
}

// ─── Structural issues computation ────────────────────────────────────────────

export interface StructuralIssue {
  severity: "error" | "warning" | "opportunity";
  category: string;
  issue: string;
  count: number;
  urls: string[];
}

export function computeStructuralIssues(
  crawlRows: Array<{
    url: string;
    pageCategory: string;
    statusCode: number | null;
    h1: string | null;
    metaDesc: string | null;
    pageTitle: string | null;
    wordCount: number | null;
    indexability: string | null;
    canonical: string | null;
    inlinks: number | null;
    crawlFields: any;
  }>
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];

  // Helper to get Tier from category
  const isTier1 = (cat: string) => ["Insurance & Admissions", "Detox", "Residential Treatment", "PHP & IOP"].includes(cat);
  const isTier2 = (cat: string) => ["Therapies & Modalities", "About & Trust", "Outpatient & Aftercare", "Mental Health Conditions", "Substance Use Conditions"].includes(cat);

  // 4XX / 5XX errors
  const errors4xx = crawlRows.filter(r => r.statusCode && r.statusCode >= 400 && r.statusCode < 500);
  const errors5xx = crawlRows.filter(r => r.statusCode && r.statusCode >= 500);
  if (errors4xx.length > 0) issues.push({ severity: "error", category: "Crawl & Index", issue: "4XX client errors", count: errors4xx.length, urls: errors4xx.map(r => r.url).slice(0, 10) });
  if (errors5xx.length > 0) issues.push({ severity: "error", category: "Crawl & Index", issue: "5XX server errors", count: errors5xx.length, urls: errors5xx.map(r => r.url).slice(0, 10) });

  // Non-indexable pages (excluding Legal & Utility which are expected)
  const nonIndexable = crawlRows.filter(r =>
    r.indexability && r.indexability !== "Indexable" && r.pageCategory !== "Legal & Utility"
  );
  const tier1NonIndexable = nonIndexable.filter(r => isTier1(r.pageCategory));
  if (tier1NonIndexable.length > 0) issues.push({ severity: "error", category: "Crawl & Index", issue: "Non-indexable Tier 1 pages", count: tier1NonIndexable.length, urls: tier1NonIndexable.map(r => r.url).slice(0, 10) });
  const otherNonIndexable = nonIndexable.filter(r => !isTier1(r.pageCategory));
  if (otherNonIndexable.length > 0) issues.push({ severity: "warning", category: "Crawl & Index", issue: "Non-indexable pages (non-Tier 1)", count: otherNonIndexable.length, urls: otherNonIndexable.map(r => r.url).slice(0, 10) });

  // Missing H1
  const missingH1 = crawlRows.filter(r => !r.h1 || r.h1.trim() === "");
  const tier1MissingH1 = missingH1.filter(r => isTier1(r.pageCategory));
  const tier2MissingH1 = missingH1.filter(r => isTier2(r.pageCategory));
  if (tier1MissingH1.length > 0) issues.push({ severity: "error", category: "Content Quality", issue: "Missing H1 on Tier 1 pages", count: tier1MissingH1.length, urls: tier1MissingH1.map(r => r.url).slice(0, 10) });
  if (tier2MissingH1.length > 0) issues.push({ severity: "warning", category: "Content Quality", issue: "Missing H1 on Tier 2 pages", count: tier2MissingH1.length, urls: tier2MissingH1.map(r => r.url).slice(0, 10) });

  // Missing meta description
  const missingMeta = crawlRows.filter(r => !r.metaDesc || r.metaDesc.trim() === "");
  const tier1MissingMeta = missingMeta.filter(r => isTier1(r.pageCategory));
  if (tier1MissingMeta.length > 0) issues.push({ severity: "warning", category: "Content Quality", issue: "Missing meta description on Tier 1 pages", count: tier1MissingMeta.length, urls: tier1MissingMeta.map(r => r.url).slice(0, 10) });
  const allMissingMeta = missingMeta.filter(r => r.pageCategory !== "Legal & Utility");
  if (allMissingMeta.length > 5) issues.push({ severity: "opportunity", category: "Content Quality", issue: "Missing meta descriptions site-wide", count: allMissingMeta.length, urls: allMissingMeta.map(r => r.url).slice(0, 10) });

  // Orphaned or weakly linked pages (< 2 inlinks), excluding home
  const weaklyLinked = crawlRows.filter(r =>
    r.url && r.url !== "/" && !r.url.match(/\/$/) &&
    r.inlinks !== null && r.inlinks < 2 &&
    (isTier1(r.pageCategory) || isTier2(r.pageCategory))
  );
  if (weaklyLinked.length > 0) issues.push({ severity: "warning", category: "Internal Linking", issue: "Priority pages with fewer than 2 inlinks", count: weaklyLinked.length, urls: weaklyLinked.map(r => r.url).slice(0, 10) });

  // Thin content (< 300 words) on important pages
  const thinContent = crawlRows.filter(r =>
    r.wordCount !== null && r.wordCount < 300 && (isTier1(r.pageCategory) || isTier2(r.pageCategory))
  );
  if (thinContent.length > 0) issues.push({ severity: "warning", category: "Content Quality", issue: "Thin content (< 300 words) on priority pages", count: thinContent.length, urls: thinContent.map(r => r.url).slice(0, 10) });

  // High word count pages (> 5000 words) — may indicate content sprawl
  const bulkyContent = crawlRows.filter(r => r.wordCount !== null && r.wordCount > 5000);
  if (bulkyContent.length > 0) issues.push({ severity: "opportunity", category: "Content Quality", issue: "Excessively long pages (> 5,000 words) — consider splitting", count: bulkyContent.length, urls: bulkyContent.map(r => r.url).slice(0, 10) });

  // Canonicalization issues: pages with canonical that points elsewhere
  const canonicalIssues = crawlRows.filter(r =>
    r.canonical && r.canonical !== r.url && !r.url.endsWith(r.canonical)
  );
  if (canonicalIssues.length > 0) issues.push({ severity: "warning", category: "Crawl & Index", issue: "Pages with external canonical (may be canonicalized away)", count: canonicalIssues.length, urls: canonicalIssues.map(r => r.url).slice(0, 10) });

  // Missing page title
  const missingTitle = crawlRows.filter(r => !r.pageTitle || r.pageTitle.trim() === "");
  if (missingTitle.length > 0) issues.push({ severity: "warning", category: "Content Quality", issue: "Missing page title tags", count: missingTitle.length, urls: missingTitle.map(r => r.url).slice(0, 10) });

  // Check SF crawl fields for duplicate title tags
  const titleCounts: Record<string, string[]> = {};
  for (const row of crawlRows) {
    if (row.pageTitle) {
      const t = row.pageTitle.trim();
      if (!titleCounts[t]) titleCounts[t] = [];
      titleCounts[t].push(row.url);
    }
  }
  const dupTitles = Object.entries(titleCounts).filter(([, urls]) => urls.length > 1);
  if (dupTitles.length > 0) {
    const dupUrls = dupTitles.flatMap(([, urls]) => urls).slice(0, 10);
    issues.push({ severity: "warning", category: "Content Quality", issue: `Duplicate page titles (${dupTitles.length} groups)`, count: dupTitles.length, urls: dupUrls });
  }

  return issues.sort((a, b) => {
    const sev = { error: 0, warning: 1, opportunity: 2 };
    return (sev[a.severity] - sev[b.severity]) || (b.count - a.count);
  });
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
        gscCtr: gsc ? Math.round((gsc.ctr) * 10000) / 100 : 0,
        gscPosition: gsc ? Math.round((gsc.position) * 10) / 10 : 0,
        ga4Sessions: sessions,
      },
    };
  });
}

// ─── SEMrush metrics for client (legacy) ─────────────────────────────────────

export async function fetchClientSemrushMetrics(clientId: number): Promise<{ organicKeywords: string; organicTraffic: string } | null> {
  const client = await storage.getClient(clientId);
  if (!client) return null;
  const semrushKey = await getSemrushKey();
  if (!semrushKey) return null;
  const domain = extractDomain(client.gscSiteUrl ?? client.ahrefsProjectUrl) ?? "";
  if (!domain) return null;
  return semrushDomainData(semrushKey, domain);
}
