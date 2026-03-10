import { storage } from "./storage";
import { queryGsc } from "./gscClient";
import { queryGa4 } from "./ga4Client";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";
import { fetchQssbData } from "./qssbClient";
import { fetchStrategyBank } from "./notionClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";
import { type GapContext } from "./gapAnswerContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MNE = "Manual entry needed";
const DASH = "—";

// ─── Workbook-backed Data Schema ──────────────────────────────────────────────
// This is Layer 2's intermediate truth structure — analogous to the spreadsheet tabs

export interface BenchmarkRow {
  name: string;
  url: string;
  domainAge: string;
  dr: string;
  referringDomains: string;
  backlinks: string;
  indexedPages: string;
  aiVisibilityScore: string;
  aiMentions: string;
  citedSources: string;
  organicKeywords: string;
  top10Keywords: string;
  organicTraffic: string;
  featuredSnippets: string;
  finalScore: string;
  averageRank: string;
  rank: string;
  isClient: boolean;
}

export interface UrlAuditRow {
  url: string;
  pageType: string;
  sessions: string;
  action: string;
  redirectTarget: string;
  statusCode: string;
  indexability: string;
  title: string;
  h1: string;
}

export interface CrawlDelta {
  hasComparison: boolean;
  comparisonCrawledCount: number;
  addedUrls: string[];
  removedUrls: string[];
  indexableCountDelta: number;
  deleteRedirectDelta: number;
  keepCountDelta: number;
  cannibalizationGroupDelta: number;
  comparisonDeleteRedirectCount: number;
  comparisonKeepCount: number;
  comparisonIndexableCount: number;
  comparisonCannibalizationGroups: number;
}

export interface WorkbookState {
  tabName: string;
  competitorBenchmark: {
    clientRow: BenchmarkRow;
    competitorRows: BenchmarkRow[];
    clientRank: number;
    totalCompetitors: number;
    percentile: number;
    clientFinalScore: string;
  };
  urlAudit: {
    totalUrlsCrawled: number;
    deleteRedirectCount: number;
    keepCount: number;
    lowPerformanceSessions: number;
    flaggedRows: UrlAuditRow[];
    cannibalizationNotes: string[];
    crawlDelta: CrawlDelta | null;
  };
  buildStatus: {
    completedFields: number;
    missingFields: string[];
    builtAt: string;
    dataSourcesUsed: string[];
  };
}

export interface MidStrategyAmInputs {
  clientSentiment?: string;
  amThoughts?: string;
  priorityChecks?: string;
  clientNotes?: string;
  accountFeeling?: string;
  hypothesis?: string;
  auditNotes?: string;
  contextAnomalies?: string;
  leadershipNote?: string;
  focusNext60Days?: string;
  salesAdmissionsContext?: string;
  clientDependencyNotes?: string;
}

function normalizeMidStrategyAmInputs(raw: MidStrategyAmInputs): MidStrategyAmInputs {
  return {
    ...raw,
    amThoughts: raw.amThoughts || raw.hypothesis || "",
    priorityChecks: raw.priorityChecks || raw.auditNotes || "",
  };
}

export interface MidStrategyReportJson {
  report_title: string;
  client_name: string;
  report_date: string;
  generated_at: string;
  workbook: WorkbookState;
  slides: Slide[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | string | undefined): string {
  if (n === undefined || n === null || n === "") return DASH;
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function getSemrushKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("semrush");
  if (!creds.length) return null;
  return decrypt(creds[0].encryptedValue);
}

async function semrushDomainRanks(apiKey: string, domain: string): Promise<{ organicKw: string; organicTraffic: string } | null> {
  try {
    const qs = new URLSearchParams({ type: "domain_ranks", domain, database: "us", export_columns: "Or,Ot", key: apiKey }).toString();
    const resp = await fetch(`https://api.semrush.com/?${qs}`);
    const text = await resp.text();
    if (!resp.ok || text.startsWith("ERROR") || !text.trim()) return null;
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(";");
    const vals = lines[1].split(";");
    const get = (h: string) => vals[headers.indexOf(h)] ?? DASH;
    const kw = get("Organic Keywords");
    const tr = get("Organic Traffic");
    return { organicKw: fmtNum(kw), organicTraffic: fmtNum(tr) };
  } catch {
    return null;
  }
}

async function semrushTopCompetitors(apiKey: string, domain: string): Promise<string[]> {
  try {
    const qs = new URLSearchParams({
      type: "domain_organic_competitors",
      domain,
      database: "us",
      display_limit: "10",
      export_columns: "Dn",
      key: apiKey,
    }).toString();
    const resp = await fetch(`https://api.semrush.com/?${qs}`);
    const text = await resp.text();
    if (!resp.ok || text.startsWith("ERROR") || !text.trim()) return [];
    const lines = text.trim().split("\n").slice(1);
    return lines.map(l => l.split(";")[0]?.trim()).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
}

function emptyBenchmarkRow(name: string, url: string, isClient = false): BenchmarkRow {
  return {
    name, url, domainAge: DASH, dr: DASH, referringDomains: DASH, backlinks: DASH,
    indexedPages: DASH, aiVisibilityScore: DASH, aiMentions: DASH, citedSources: DASH,
    organicKeywords: MNE, top10Keywords: DASH, organicTraffic: MNE,
    featuredSnippets: DASH, finalScore: DASH, averageRank: DASH, rank: DASH,
    isClient,
  };
}

function rankOf(val: string, allVals: string[], higherIsBetter = true): string {
  const num = (s: string) => parseFloat(s.replace(/[K,M]/g, m => m === "K" ? "000" : "000000")) || 0;
  const sorted = allVals
    .map((v, i) => ({ idx: i, n: num(v) }))
    .filter(x => !isNaN(x.n) && x.n > 0)
    .sort((a, b) => higherIsBetter ? b.n - a.n : a.n - b.n);
  const myNum = num(val);
  if (isNaN(myNum) || myNum === 0) return DASH;
  const rank = sorted.findIndex(x => x.n === myNum) + 1;
  return rank > 0 ? String(rank) : DASH;
}

// ─── Layer 1: Source Normalization ───────────────────────────────────────────

async function normalizeSources(clientId: number, currentCrawlId: number | null, comparisonCrawlId: number | null) {
  const client = await storage.getClient(clientId);
  if (!client) throw new Error("Client not found");

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const dateRange = `${startOfMonth.toISOString().slice(0, 10)}_${today.toISOString().slice(0, 10)}`;

  const [gscResult, ga4Result] = await Promise.allSettled([
    queryGsc("gsc_qoq_queries" as any, client, dateRange),
    queryGa4("ga4_landing_pages_by_sessions" as any, client, dateRange),
  ]);

  const semrushKey = await getSemrushKey();
  const clientDomain = extractDomain(client.gscSiteUrl ?? client.ahrefsProjectUrl) ?? "";

  let clientSemrush: { organicKw: string; organicTraffic: string } | null = null;
  let competitorDomains: string[] = [];
  if (semrushKey && clientDomain) {
    [clientSemrush, competitorDomains] = await Promise.all([
      semrushDomainRanks(semrushKey, clientDomain),
      semrushTopCompetitors(semrushKey, clientDomain),
    ]);
  }

  // Load current crawl (explicit selection or auto-latest)
  let crawlRows: Record<string, string>[] = [];
  let crawlHeaders: string[] = [];
  if (currentCrawlId) {
    const asset = await storage.getSfReport(currentCrawlId);
    if (asset) {
      crawlRows = (asset.data ?? []) as Record<string, string>[];
      crawlHeaders = asset.headers ?? [];
    }
  } else {
    const latest = await storage.getSfReports(clientId);
    if (latest.length) {
      crawlRows = (latest[0].data ?? []) as Record<string, string>[];
      crawlHeaders = latest[0].headers ?? [];
    }
  }

  // Load comparison crawl (only if explicitly selected — never auto-latest for comparison)
  let comparisonCrawlRows: Record<string, string>[] = [];
  let comparisonCrawlHeaders: string[] = [];
  if (comparisonCrawlId) {
    const compAsset = await storage.getSfReport(comparisonCrawlId);
    if (compAsset) {
      comparisonCrawlRows = (compAsset.data ?? []) as Record<string, string>[];
      comparisonCrawlHeaders = compAsset.headers ?? [];
    }
  }

  const ga4LandingPages: Record<string, number> = {};
  if (ga4Result.status === "fulfilled" && ga4Result.value?.tables?.[0]) {
    for (const row of ga4Result.value.tables[0].rows) {
      const url = String(row[0] ?? "");
      const sessions = Number(row[1]) || 0;
      if (url) ga4LandingPages[url] = sessions;
    }
  }

  return { client, clientDomain, clientSemrush, competitorDomains, semrushKey, crawlRows, crawlHeaders, comparisonCrawlRows, comparisonCrawlHeaders, ga4LandingPages, gscResult, today };
}

// ─── URL Audit Processor (shared between current and comparison) ───────────────

interface AuditSummary {
  indexableCount: number;
  deleteRedirectCount: number;
  keepCount: number;
  urlSet: Set<string>;
  cannibalizationGroups: number;
  flaggedRows: UrlAuditRow[];
  cannibalizationNotes: string[];
  lowPerformanceSessions: number;
}

function processUrlAuditRows(
  crawlRows: Record<string, string>[],
  crawlHeaders: string[],
  ga4LandingPages: Record<string, number>
): AuditSummary {
  const urlCol = crawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? crawlHeaders[0];
  const statusCol = crawlHeaders.find(h => ["Status Code", "Status code"].includes(h));
  const indexCol = crawlHeaders.find(h => ["Indexability"].includes(h));
  const titleCol = crawlHeaders.find(h => ["Title 1", "Title"].includes(h));
  const h1Col = crawlHeaders.find(h => ["H1-1", "H1"].includes(h));
  const wordCountCol = crawlHeaders.find(h => h.toLowerCase().includes("word count"));

  const flaggedRows: UrlAuditRow[] = [];
  let deleteRedirectCount = 0;
  let keepCount = 0;
  let indexableCount = 0;
  const cannibalizationNotes: string[] = [];
  const titleGroups: Record<string, string[]> = {};
  const urlSet = new Set<string>();

  for (const row of crawlRows) {
    const url = String(row[urlCol] ?? "");
    if (!url || !url.startsWith("http")) continue;
    urlSet.add(url);

    const status = String(row[statusCol ?? ""] ?? "200");
    const indexability = String(row[indexCol ?? ""] ?? "Indexable");
    const title = String(row[titleCol ?? ""] ?? "");
    const h1 = String(row[h1Col ?? ""] ?? "");
    const words = parseInt(String(row[wordCountCol ?? ""] ?? "0")) || 0;
    const sessions = ga4LandingPages[url] ?? ga4LandingPages[url.replace(/\/$/, "")] ?? 0;

    if (indexability === "Indexable") indexableCount++;

    const isThin = words > 0 && words < 200;
    const isLowTraffic = sessions < 5;
    const isDuplicate = title && title.length > 10 && Object.values(titleGroups).some(arr => arr.some(t => {
      const sim = (a: string, b: string) => {
        const aw = a.toLowerCase().split(/\s+/), bw = b.toLowerCase().split(/\s+/);
        const common = aw.filter(w => bw.includes(w));
        return common.length / Math.max(aw.length, bw.length);
      };
      return sim(title, t) > 0.7;
    }));

    if (title) {
      const key = title.toLowerCase().slice(0, 20);
      if (!titleGroups[key]) titleGroups[key] = [];
      titleGroups[key].push(title);
    }

    let action = "keep";
    if (indexability === "Indexable" && status === "200" && isLowTraffic && (isThin || isDuplicate)) {
      action = "delete & redirect";
      deleteRedirectCount++;
    } else if (indexability === "Indexable" && status === "200") {
      action = "keep";
      keepCount++;
    } else {
      action = status.startsWith("3") ? "redirect" : "review";
    }

    flaggedRows.push({
      url: url.replace(/^https?:\/\/[^/]+/, "") || "/",
      pageType: url.includes("/blog/") || url.includes("/post/") ? "Post" : "Page",
      sessions: String(sessions),
      action,
      redirectTarget: action === "delete & redirect" ? "/" : "",
      statusCode: status,
      indexability,
      title: title.slice(0, 60) || DASH,
      h1: h1.slice(0, 60) || DASH,
    });
  }

  const cannibalGroups = Object.entries(titleGroups).filter(([, titles]) => titles.length > 1);
  if (cannibalGroups.length > 0) {
    cannibalizationNotes.push(`${cannibalGroups.length} groups of pages with overlapping title patterns detected`);
  }
  const lowPerformanceSessions = flaggedRows
    .filter(r => r.action === "delete & redirect")
    .reduce((sum, r) => sum + (parseInt(r.sessions) || 0), 0);
  if (deleteRedirectCount > 0) {
    cannibalizationNotes.push(`${deleteRedirectCount} URLs flagged for consolidation — only ${lowPerformanceSessions} total organic sessions combined`);
  }

  return {
    indexableCount,
    deleteRedirectCount,
    keepCount,
    urlSet,
    cannibalizationGroups: cannibalGroups.length,
    flaggedRows: flaggedRows.slice(0, 100),
    cannibalizationNotes,
    lowPerformanceSessions,
  };
}

// ─── Layer 2: Workbook Builder ────────────────────────────────────────────────

async function buildWorkbook(
  sources: Awaited<ReturnType<typeof normalizeSources>>,
  amInputs: MidStrategyAmInputs
): Promise<WorkbookState> {
  const { client, clientDomain, clientSemrush, competitorDomains, semrushKey, crawlRows, crawlHeaders, comparisonCrawlRows, comparisonCrawlHeaders, ga4LandingPages, today } = sources;

  const missingFields: string[] = [];
  const dataSourcesUsed: string[] = [];
  const tabName = monthLabel(today);

  // ── Client benchmark row ──────────────────────────────────────────────────
  const clientRow = emptyBenchmarkRow(client.name, clientDomain ? `https://${clientDomain}/` : MNE, true);
  if (clientSemrush) {
    clientRow.organicKeywords = clientSemrush.organicKw;
    clientRow.organicTraffic = clientSemrush.organicTraffic;
    dataSourcesUsed.push("SEMrush");
  } else {
    missingFields.push("Client organic keywords (SEMrush not connected)");
    missingFields.push("Client organic traffic (SEMrush not connected)");
  }

  // Indexed pages from crawl
  if (crawlRows.length > 0) {
    const indexCol = crawlHeaders.find(h => ["Indexability", "indexability"].includes(h));
    const indexable = indexCol ? crawlRows.filter(r => r[indexCol]?.toLowerCase() === "indexable").length : crawlRows.length;
    clientRow.indexedPages = fmtNum(indexable);
    dataSourcesUsed.push("Screaming Frog crawl");
  } else {
    missingFields.push("Indexed pages (no crawl loaded)");
  }

  // ── Competitor benchmark rows ─────────────────────────────────────────────
  let competitorRows: BenchmarkRow[] = [];
  if (competitorDomains.length > 0 && semrushKey) {
    const results = await Promise.allSettled(
      competitorDomains.slice(0, 10).map(d => semrushDomainRanks(semrushKey, d))
    );
    competitorRows = competitorDomains.slice(0, 10).map((domain, i) => {
      const row = emptyBenchmarkRow(domain, `https://${domain}/`);
      const res = results[i];
      if (res.status === "fulfilled" && res.value) {
        row.organicKeywords = res.value.organicKw;
        row.organicTraffic = res.value.organicTraffic;
      }
      return row;
    });
  } else if (competitorDomains.length === 0) {
    missingFields.push("Competitor list (SEMrush not connected or no competitor data)");
  }

  // Compute rough ranks for organic KW and traffic
  const allRows = [clientRow, ...competitorRows];
  const allKw = allRows.map(r => r.organicKeywords);
  const allTr = allRows.map(r => r.organicTraffic);
  allRows.forEach((r, i) => {
    r.rank = rankOf(r.organicTraffic, allTr);
  });

  // Client rank / percentile
  const clientRankNum = parseInt(clientRow.rank) || allRows.length;
  const totalCompetitors = competitorRows.length;
  const percentile = totalCompetitors > 0
    ? Math.round(((totalCompetitors + 1 - clientRankNum) / (totalCompetitors + 1)) * 100)
    : 0;

  // ── URL Audit (redirect map) — current crawl ────────────────────────────────
  let currentAudit: AuditSummary | null = null;
  if (crawlRows.length > 0) {
    dataSourcesUsed.push("URL audit crawl");
    currentAudit = processUrlAuditRows(crawlRows, crawlHeaders, ga4LandingPages);
  } else {
    missingFields.push("URL audit (no crawl loaded — upload a Screaming Frog export)");
  }

  // ── URL Audit — comparison crawl & delta ────────────────────────────────────
  // Comparison crawl is processed without GA4 join (no historical sessions available).
  // We compare structural metrics only: URL sets, indexability, action classifications.
  // We only compute a delta when both crawls share the same URL column header (same schema).
  let crawlDelta: CrawlDelta | null = null;
  if (currentAudit && comparisonCrawlRows.length > 0) {
    const currentUrlCol = crawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? crawlHeaders[0];
    const compUrlCol = comparisonCrawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? comparisonCrawlHeaders[0];

    // Only compute delta if both crawls have a recognisable URL column
    if (currentUrlCol && compUrlCol) {
      dataSourcesUsed.push("Comparison crawl");
      // Process comparison crawl with empty GA4 map (structural analysis only)
      const compAudit = processUrlAuditRows(comparisonCrawlRows, comparisonCrawlHeaders, {});

      // Compute URL set differences
      const addedUrls = Array.from(currentAudit.urlSet)
        .filter(u => !compAudit.urlSet.has(u))
        .map(u => u.replace(/^https?:\/\/[^/]+/, "") || "/")
        .slice(0, 20);
      const removedUrls = Array.from(compAudit.urlSet)
        .filter(u => !currentAudit!.urlSet.has(u))
        .map(u => u.replace(/^https?:\/\/[^/]+/, "") || "/")
        .slice(0, 20);

      crawlDelta = {
        hasComparison: true,
        comparisonCrawledCount: comparisonCrawlRows.length,
        addedUrls,
        removedUrls,
        indexableCountDelta: currentAudit.indexableCount - compAudit.indexableCount,
        deleteRedirectDelta: currentAudit.deleteRedirectCount - compAudit.deleteRedirectCount,
        keepCountDelta: currentAudit.keepCount - compAudit.keepCount,
        cannibalizationGroupDelta: currentAudit.cannibalizationGroups - compAudit.cannibalizationGroups,
        comparisonDeleteRedirectCount: compAudit.deleteRedirectCount,
        comparisonKeepCount: compAudit.keepCount,
        comparisonIndexableCount: compAudit.indexableCount,
        comparisonCannibalizationGroups: compAudit.cannibalizationGroups,
      };
    }
  }

  const flaggedRows = currentAudit?.flaggedRows ?? [];
  const deleteRedirectCount = currentAudit?.deleteRedirectCount ?? 0;
  const keepCount = currentAudit?.keepCount ?? 0;
  const cannibalizationNotes = currentAudit?.cannibalizationNotes ?? [];
  const lowPerformanceSessions = currentAudit?.lowPerformanceSessions ?? 0;

  const completedFields = (clientSemrush ? 2 : 0) + (crawlRows.length ? 3 : 0) + (competitorRows.length ? 2 : 0) + (crawlDelta ? 1 : 0);

  return {
    tabName,
    competitorBenchmark: {
      clientRow,
      competitorRows,
      clientRank: clientRankNum,
      totalCompetitors,
      percentile,
      clientFinalScore: clientRow.finalScore,
    },
    urlAudit: {
      totalUrlsCrawled: crawlRows.length,
      deleteRedirectCount,
      keepCount,
      lowPerformanceSessions,
      flaggedRows,
      cannibalizationNotes,
      crawlDelta,
    },
    buildStatus: {
      completedFields,
      missingFields,
      builtAt: new Date().toISOString(),
      dataSourcesUsed: [...new Set(dataSourcesUsed)],
    },
  };
}

// ─── Layer 3: Slide Generator ─────────────────────────────────────────────────

function generateSlides(
  wb: WorkbookState,
  clientName: string,
  reportDate: string,
  amInputs: MidStrategyAmInputs,
  gapContext?: GapContext
): Slide[] {
  const allRows = [wb.competitorBenchmark.clientRow, ...wb.competitorBenchmark.competitorRows];
  const { urlAudit } = wb;

  const allSlides: Slide[] = [];

  // ── s01: Title ─────────────────────────────────────────────────────────────
  const s01: Slide = {
    id: "s01_title",
    type: "title",
    title: "Building durable organic performance with purpose.",
    subtitle: "Content & SEO Mid-Strategy Check-in",
    clientName,
    date: reportDate,
  };
  allSlides.push(s01);

  if (gapContext && gapContext.hasAnswers) {
    const gapBullets: string[] = [];
    if (gapContext.sentimentContext) gapBullets.push(`Sentiment: ${gapContext.sentimentContext}`);
    if (gapContext.businessChanges) gapBullets.push(`Business: ${gapContext.businessChanges}`);
    if (gapContext.blockers) gapBullets.push(`Blockers: ${gapContext.blockers}`);
    if (gapContext.narrativeNotes) gapBullets.push(`Notes: ${gapContext.narrativeNotes}`);

    allSlides.push({
      id: "gap_insights",
      type: "bullets",
      title: "Gap Analysis Insights",
      subtitle: "Clarifying context collected before generation",
      bullets: gapBullets,
    });
  }

  // ── s02: Agenda ────────────────────────────────────────────────────────────
  const s02: Slide = {
    id: "s02_agenda",
    type: "bullets",
    title: "Mid-Strategy Agenda",
    bullets: [
      "Competitive Benchmarking",
      "Immediate Focus: Core Services, Conversions & Structural Cleanup",
      "Risk Flag: Cannibalization & Low-impact URLs",
      "What's Next",
    ],
  };

  // ── s03: Next Checkpoint ───────────────────────────────────────────────────
  const s03: Slide = {
    id: "s03_checkpoint",
    type: "bullets",
    title: "Strategy Month: Next Checkpoint",
    subtitle: "Launch Strategy & Roadmap Review — Date TBD",
    bullets: [
      "Finalizes goals, North Star Metrics, and success benchmarks",
      "Aligns on the execution plan across content, SEO, and site improvements",
      "Confirms launch-ready priorities for the next phase",
      "Signals the transition from planning → active execution",
    ],
    commentary: amInputs.accountFeeling || undefined,
  };

  // ── s04: Competitive Analysis — Authority / Foundation ─────────────────────
  const authorityHeaders = ["Name", "Website", "Domain Age (yrs)", "DR", "Ref. Domains", "Backlinks", "Indexed Pages"];
  const authorityRows = allRows.map(r => [
    r.isClient ? `★ ${r.name}` : r.name,
    r.url.replace("https://", "").replace(/\/$/, "").slice(0, 30),
    r.domainAge,
    r.dr,
    r.referringDomains,
    r.backlinks,
    r.indexedPages,
  ]);
  const s04: Slide = {
    id: "s04_competitive_authority",
    type: "table",
    title: "Competitive Analysis — Authority & Foundation",
    subtitle: "Where you stand vs. everybody else",
    commentary: `Top competitors have established authority through years of consistent publishing. ${clientName}'s smaller footprint means we can grow faster by focusing resources on the pages and clusters that matter most.`,
    table: { headers: authorityHeaders, rows: authorityRows },
  };

  // ── s05: Competitive Analysis — Keyword Visibility ─────────────────────────
  const visibilityHeaders = ["Name", "Organic KW", "Top 10 KW", "Organic Traffic", "Featured Snippets", "KW Velocity"];
  const visibilityRows = allRows.map(r => [
    r.isClient ? `★ ${r.name}` : r.name,
    r.organicKeywords,
    r.top10Keywords,
    r.organicTraffic,
    r.featuredSnippets,
    DASH,
  ]);
  const s05: Slide = {
    id: "s05_competitive_visibility",
    type: "table",
    title: "Competitive Analysis — Keyword Visibility",
    subtitle: "Where you stand vs. everybody else",
    commentary: `Competitors ranking for thousands of keywords don't always convert that into visibility — many have shallow Top 10 presence. ${clientName} has a good mix of both, which we can use to leverage growth.`,
    table: { headers: visibilityHeaders, rows: visibilityRows },
  };

  // ── s06: Competitive Analysis — AI Visibility ──────────────────────────────
  const aiHeaders = ["Name", "AI Visibility Score", "AI Mentions", "Cited Sources", "Mention Rate %"];
  const aiRows = allRows.map(r => [
    r.isClient ? `★ ${r.name}` : r.name,
    r.aiVisibilityScore,
    r.aiMentions,
    r.citedSources,
    DASH,
  ]);
  const s06: Slide = {
    id: "s06_competitive_ai",
    type: "table",
    title: "Competitive Analysis — AI Visibility",
    subtitle: "Where you stand vs. everybody else",
    commentary: `A few competitors appear in AI-generated results — an early sign of structured, information-rich content. We'll focus efforts on appearing more in Google snippets by providing concise, direct answers to common questions.`,
    table: { headers: aiHeaders, rows: aiRows },
  };

  // ── s07: Competitive Scorecard ─────────────────────────────────────────────
  const clientRank = wb.competitorBenchmark.clientRank;
  const total = wb.competitorBenchmark.totalCompetitors + 1;
  const percentile = wb.competitorBenchmark.percentile;
  const scorecardHeaders = ["Name", "Organic KW", "Organic Traffic", "Indexed Pages", "Rank Among Peers"];
  const scorecardRows = allRows.map((r, i) => [
    r.isClient ? `★ ${r.name}` : r.name,
    r.organicKeywords,
    r.organicTraffic,
    r.indexedPages,
    r.rank !== DASH ? `#${r.rank} of ${total}` : DASH,
  ]);
  const s07: Slide = {
    id: "s07_competitive_scorecard",
    type: "scorecard",
    title: "Competitive Efficiency Scorecard",
    subtitle: "Where you stand vs. everybody else",
    commentary: `Across all key metrics: authority, visibility, and AI readiness, ${clientName} currently ranks ${clientRank > 0 ? `#${clientRank} of ${total}` : "near the bottom"} — giving us a clear benchmark for where to close the gap. The data shows our fastest growth levers are structure and depth: not just more pages, but smarter ones.`,
    table: { headers: scorecardHeaders, rows: scorecardRows },
    metrics: [
      { label: "Rank Among Peers", current: clientRank > 0 ? `#${clientRank} of ${total}` : MNE, isPositive: clientRank <= Math.ceil(total / 2) },
      { label: "Percentile", current: percentile > 0 ? `${percentile}th` : MNE, isPositive: percentile >= 50 },
      { label: "Organic Keywords", current: wb.competitorBenchmark.clientRow.organicKeywords, isPositive: true },
      { label: "Organic Traffic", current: wb.competitorBenchmark.clientRow.organicTraffic, isPositive: true },
    ],
  } as any;

  // ── s08: Immediate Focus ───────────────────────────────────────────────────
  const s08: Slide = {
    id: "s08_immediate_focus",
    type: "bullets",
    title: "Core Services, Conversions & Structural Cleanup",
    subtitle: "Immediate Focus",
    bullets: [
      `Defining and strengthening ${clientName}'s primary service pages`,
      "Fixing conversion gaps — Verify Insurance CRO updates, launching a clear standalone Contact Us page",
      "Addressing structural SEO issues that are currently suppressing performance",
      "Phase 1 navigation cleanup (conversion-focused)",
      `Moving Admissions-related pages under About Us`,
      "Replacing the Admissions nav item with Verify Insurance",
      ...(amInputs.amThoughts ? [`AM's Thoughts: ${amInputs.amThoughts}`] : []),
    ],
    commentary: amInputs.focusNext60Days || undefined,
  };

  // ── s09: Navigation Structure ──────────────────────────────────────────────
  const s09: Slide = {
    id: "s09_nav_structure",
    type: "bullets",
    title: "Phase 1 Navigation Cleanup",
    subtitle: "Conversion-focused restructuring",
    bullets: [
      "About Us → How to Get Started, Admissions, Leadership & Clinical Team, Tour Our Facility, Testimonials",
      "Programs → (no change)",
      "Addictions Treated → (no change)",
      "Therapies & Experiences → (no change)",
      "Verify Insurance → /verify-insurance/ (new top-level nav item)",
      "Contact Us → /contact-us/ (new standalone page)",
    ],
    commentary: "Phase 1 is designed to improve conversions by giving users direct access to Verify Insurance and a true Contact page, while moving Admissions and How to Get Started into About Us for a clearer, more logical path to care.",
  };

  // ── s10: Cannibalization Intro ─────────────────────────────────────────────
  const overlappingCount = urlAudit.deleteRedirectCount > 0 ? urlAudit.deleteRedirectCount : null;
  const delta = urlAudit.crawlDelta;

  // Build delta context lines for s10 when comparison crawl is available
  const s10DeltaBullets: string[] = [];
  if (delta?.hasComparison) {
    if (delta.addedUrls.length > 0) {
      s10DeltaBullets.push(`${delta.addedUrls.length} new URL${delta.addedUrls.length !== 1 ? "s" : ""} added since comparison crawl: ${delta.addedUrls.slice(0, 3).join(", ")}${delta.addedUrls.length > 3 ? " and more" : ""}`);
    }
    if (delta.removedUrls.length > 0) {
      s10DeltaBullets.push(`${delta.removedUrls.length} URL${delta.removedUrls.length !== 1 ? "s" : ""} removed since comparison crawl: ${delta.removedUrls.slice(0, 3).join(", ")}${delta.removedUrls.length > 3 ? " and more" : ""}`);
    }
    if (delta.indexableCountDelta !== 0) {
      const dir = delta.indexableCountDelta > 0 ? "+" : "";
      s10DeltaBullets.push(`Indexable URL count changed by ${dir}${delta.indexableCountDelta} (${delta.comparisonIndexableCount} → ${delta.comparisonIndexableCount + delta.indexableCountDelta})`);
    }
    if (delta.deleteRedirectDelta !== 0) {
      const improving = delta.deleteRedirectDelta < 0;
      s10DeltaBullets.push(`Consolidation candidates ${improving ? "reduced" : "increased"} by ${Math.abs(delta.deleteRedirectDelta)} since comparison crawl (${delta.comparisonDeleteRedirectCount} → ${delta.comparisonDeleteRedirectCount + delta.deleteRedirectDelta}) — ${improving ? "cleanup is working" : "new low-performance pages detected"}`);
    }
  }

  const s10: Slide = {
    id: "s10_cannibalization_intro",
    type: "bullets",
    title: "Risk Flag: Cannibalization & Low-impact URLs",
    subtitle: "Core Services, Conversions & Structural Cleanup",
    bullets: [
      overlappingCount
        ? `${clientName} currently has ${overlappingCount} URLs flagged for consolidation — many competing for the same keywords`
        : `${clientName} currently has multiple overlapping URLs competing for the same keywords (${MNE} — upload crawl for details)`,
      "Many of these were created historically to target 'near me,' duplicate location, or thin service variations",
      "Risk flag: Keyword cannibalization — multiple pages targeting the same core intent dilute authority",
      ...(urlAudit.cannibalizationNotes.length > 0 ? urlAudit.cannibalizationNotes : []),
      ...s10DeltaBullets,
      ...(amInputs.priorityChecks ? [`Priority Checks: ${amInputs.priorityChecks}`] : []),
    ],
  };

  // ── s11: Cannibalization Data ──────────────────────────────────────────────
  const totalSessions = urlAudit.lowPerformanceSessions;
  const flagCount = urlAudit.deleteRedirectCount;

  // Build comparison metrics for s11 when delta is available
  const s11Metrics: any[] = flagCount > 0 ? [
    {
      label: "URLs Flagged",
      current: String(flagCount),
      previous: delta?.hasComparison ? String(delta.comparisonDeleteRedirectCount) : DASH,
      deltaPercent: delta?.hasComparison && delta.comparisonDeleteRedirectCount > 0
        ? `${Math.round(((flagCount - delta.comparisonDeleteRedirectCount) / delta.comparisonDeleteRedirectCount) * 100)}%`
        : DASH,
      isPositive: false,
    },
    {
      label: "Combined Sessions (3mo)",
      current: String(totalSessions),
      previous: DASH,
      deltaPercent: DASH,
      isPositive: false,
    },
    {
      label: "Avg Sessions/Page",
      current: flagCount > 0 ? String(Math.round(totalSessions / flagCount)) : DASH,
      previous: DASH,
      deltaPercent: DASH,
      isPositive: false,
    },
    {
      label: "Crawled URLs Total",
      current: fmtNum(urlAudit.totalUrlsCrawled),
      previous: delta?.hasComparison ? fmtNum(delta.comparisonCrawledCount) : DASH,
      deltaPercent: delta?.hasComparison && delta.comparisonCrawledCount > 0
        ? `${Math.round(((urlAudit.totalUrlsCrawled - delta.comparisonCrawledCount) / delta.comparisonCrawledCount) * 100)}%`
        : DASH,
      isPositive: true,
    },
  ] : [];

  const s11: Slide = {
    id: "s11_cannibalization_data",
    type: "bullets",
    title: "Key Insight: Low-Performance Page Data",
    bullets: [
      "Despite the volume of pages, their actual performance is extremely low.",
      flagCount > 0
        ? `The ${flagCount} pages identified for consolidation generated only ${totalSessions} organic sessions total over the last 3 months`
        : `Pages identified for consolidation: ${MNE} — upload a crawl to populate this data`,
      ...(delta?.hasComparison && delta.deleteRedirectDelta < 0
        ? [`Progress vs. comparison crawl: ${Math.abs(delta.deleteRedirectDelta)} fewer consolidation candidates — redirect cleanup is having an effect`]
        : []),
      ...(delta?.hasComparison && delta.deleteRedirectDelta > 0
        ? [`Trend vs. comparison crawl: ${delta.deleteRedirectDelta} more consolidation candidates than before — the problem is growing`]
        : []),
      "This confirms: They are not meaningful traffic drivers — They are not revenue-critical pages — Their removal carries minimal risk",
      "The real issue isn't traffic loss — it's structural drag",
      "These low-performing pages: Dilute authority across dozens of URLs | Create internal competition for high-value keywords | Slow down ranking gains for core service pages | Add unnecessary crawl and index bloat",
    ],
    metrics: s11Metrics.length > 0 ? s11Metrics : undefined,
  };

  // ── s12: January Action ────────────────────────────────────────────────────
  const s12: Slide = {
    id: "s12_january_action",
    type: "bullets",
    title: "Redirect & Consolidation Action",
    subtitle: "Structural cleanup in progress",
    bullets: [
      flagCount > 0
        ? `We are deleting and 301-redirecting ${flagCount} low-impact, cannibalizing URLs — each averaging less than one organic visit over the past three months`
        : `Redirect and consolidation plan: ${MNE} — upload a crawl to generate the list`,
      "This approach: Reduces internal competition | Improves clarity for Google | Protects existing performance | Creates a stronger foundation for future content",
      "Authority consolidates into the correct primary service pages",
      ...(amInputs.contextAnomalies ? [`Context: ${amInputs.contextAnomalies}`] : []),
    ],
    ...(flagCount > 0 && urlAudit.flaggedRows.length > 0 ? {
      table: {
        headers: ["URL", "Type", "Sessions (3mo)", "Action", "Redirect Target"],
        rows: urlAudit.flaggedRows
          .filter(r => r.action === "delete & redirect")
          .slice(0, 15)
          .map(r => [r.url, r.pageType, r.sessions, r.action, r.redirectTarget || "/"]),
      },
    } : {}),
  };

  // ── s13: What's Next Detail ────────────────────────────────────────────────
  const s13: Slide = {
    id: "s13_whats_next_detail",
    type: "bullets",
    title: "What's Next",
    bullets: [
      "Redirect Review & Confirmation: We'll share a list of the URLs identified for removal along with their corresponding redirect targets — giving you full visibility before implementation.",
      "Continued Content Planning: Mapping out the next phase of content and site expansion — a clear roadmap focused on supporting core services, strengthening topical authority, and improving conversions.",
      "Local SEO & Visibility Foundations: As we move beyond initial cleanup and core service work, we'll begin laying groundwork for local SEO initiatives, including location relevance, GBP optimization, and supporting infrastructure.",
      ...(amInputs.leadershipNote ? [`For leadership: ${amInputs.leadershipNote}`] : []),
    ],
  };

  // ── s14: Next Steps ────────────────────────────────────────────────────────
  const webservActions = [
    "Content planning for the rest of the quarter",
    `Defining and strengthening ${clientName}'s primary service pages`,
    "Fixing conversion gaps",
    "Phase 1 navigation cleanup (conversion-focused)",
    "Redirect & archiving cannibalizing URLs",
    ...(amInputs.focusNext60Days ? [amInputs.focusNext60Days] : []),
  ];
  const clientActions = [
    "Confirm the redirect plan for the cannibalizing URLs",
    "Confirm the Phase 1 menu adjustment",
    ...(amInputs.salesAdmissionsContext ? [amInputs.salesAdmissionsContext] : []),
    ...(amInputs.clientDependencyNotes ? [amInputs.clientDependencyNotes] : []),
  ];
  const s14: Slide = {
    id: "s14_next_steps",
    type: "two-col",
    title: "Next Steps",
    leftContent: {
      type: "bullets",
      bullets: [`Webserv:`, ...webservActions],
    },
    rightContent: {
      type: "metrics",
      metrics: clientActions.map((action, i) => ({
        label: i === 0 ? `${clientName} Team:` : " ",
        current: action,
        isPositive: true,
      })),
    },
  };

  // AM Inputs standalone slide removed. AM context (sentiment, thoughts, priority checks,
  // notes) is used inline within the relevant strategy sections above, not as a separate block.

  const allSlides = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14];

  return allSlides;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function generateMidStrategy({
  clientId,
  currentCrawlAssetId,
  comparisonCrawlAssetId,
  amInputs = {},
  gapContext,
}: {
  clientId: number;
  currentCrawlAssetId?: number | null;
  comparisonCrawlAssetId?: number | null;
  amInputs?: MidStrategyAmInputs;
  gapContext?: GapContext;
}): Promise<MidStrategyReportJson> {
  const normalizedAmInputs = normalizeMidStrategyAmInputs(amInputs);
  const sources = await normalizeSources(clientId, currentCrawlAssetId ?? null, comparisonCrawlAssetId ?? null);
  const workbook = await buildWorkbook(sources, normalizedAmInputs);
  const slides = generateSlides(workbook, sources.client.name, fmtDate(sources.today), normalizedAmInputs, gapContext);

  try {
    const [qssbData, strategyBank] = await Promise.all([fetchQssbData(), fetchStrategyBank()]);
    if (qssbData.clientInsights.length > 0) {
      slides.push({
        id: "qssb_insights",
        type: "bullets",
        title: "Client Insights",
        subtitle: "Questions to Ask the Client",
        bullets: qssbData.clientInsights.slice(0, 10),
      });
    }
    const opps = [
      ...qssbData.additionalOpportunities.map(o => `${o.service}${o.description ? ": " + o.description : ""}`),
      ...strategyBank.entries.map(e => `${e.service}${e.description ? ": " + e.description : ""}`),
    ];
    if (opps.length > 0) {
      slides.push({
        id: "qssb_opportunities",
        type: "bullets",
        title: "Additional Opportunities",
        subtitle: "Cross-sell & Upsell Recommendations",
        bullets: opps.slice(0, 12),
      });
    }
  } catch (qssbErr: any) {
    console.warn("[Mid-Strategy] QSSB/Strategy Bank fetch failed:", qssbErr.message);
  }

  return {
    report_title: "Content & SEO Mid-Strategy Check-in",
    client_name: sources.client.name,
    report_date: fmtDate(sources.today),
    generated_at: new Date().toISOString(),
    workbook,
    slides,
  };
}
