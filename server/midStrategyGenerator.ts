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
  domainStrategy?: {
    enabled?: boolean;
    currentDomain?: string;
    proposedDomain?: string;
    recommendation?: string;
    customRationale?: string;
  };
  iaData?: {
    currentNav?: Array<{ label: string; children?: string[] }>;
    futureNav?: Array<{ label: string; children?: string[] }>;
    clusters?: Array<{ hub: string; pages: string[] }>;
    credibilityPages?: Array<{ hub: string; pages: string[] }>;
  };
  firstFocusBullets?: string[];
  whatsNextBullets?: string[];
  webservNextSteps?: string[];
  clientNextSteps?: string[];
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
  try {
    return decrypt(creds[0].encryptedValue);
  } catch (err) {
    console.warn("[midStrategy] Failed to decrypt SEMrush credential — re-auth needed:", (err as Error).message);
    return null;
  }
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
  const slides: Slide[] = [];

  // ── s01: Cover ──────────────────────────────────────────────────────────────
  slides.push({
    id: "s01_title",
    type: "title",
    title: "Building durable organic performance with purpose.",
    subtitle: "Content & SEO Mid-Strategy Check-in",
    clientName,
    date: reportDate,
  });

  if (gapContext && gapContext.hasAnswers) {
    const gapBullets: string[] = [];
    if (gapContext.sentimentContext) gapBullets.push(`Sentiment: ${gapContext.sentimentContext}`);
    if (gapContext.businessChanges) gapBullets.push(`Business: ${gapContext.businessChanges}`);
    if (gapContext.blockers) gapBullets.push(`Blockers: ${gapContext.blockers}`);
    if (gapContext.narrativeNotes) gapBullets.push(`Notes: ${gapContext.narrativeNotes}`);
    if (gapBullets.length > 0) {
      slides.push({ id: "gap_insights", type: "bullets", title: "Gap Analysis Insights", subtitle: "Clarifying context collected before generation", bullets: gapBullets });
    }
  }

  // ── s02: Agenda ─────────────────────────────────────────────────────────────
  const agendaBullets = [
    "Competitive Benchmarking",
  ];
  if (amInputs.domainStrategy?.enabled) agendaBullets.push("Domain Strategy Recommendation");
  agendaBullets.push(
    `Core Focus: Structural Cleanup for ${clientName}`,
    "What's Next",
  );
  slides.push({ id: "s02_agenda", type: "bullets", title: "Mid-Strategy Agenda", bullets: agendaBullets });

  // ── s03: Next Checkpoint ────────────────────────────────────────────────────
  slides.push({
    id: "s03_checkpoint",
    type: "bullets",
    title: "Strategy Month: Next Checkpoint",
    subtitle: "Launch Strategy & Roadmap Review — Date TBD (2 weeks from now)",
    bullets: [
      "Finalizes goals, North Star Metrics, and success benchmarks",
      "Aligns on the execution plan across content, SEO, and site improvements",
      "Confirms launch-ready priorities for the next phase",
      "Signals the transition from planning → active execution",
    ],
    commentary: amInputs.accountFeeling || undefined,
  });

  // ── s04: Domain Strategy Recommendation (conditional) ───────────────────────
  const ds = amInputs.domainStrategy;
  if (ds?.enabled && ds.currentDomain && ds.proposedDomain) {
    slides.push({
      id: "s04_domain_strategy",
      type: "decision-card",
      title: "Domain Strategy Recommendation",
      subtitle: `Should we launch on ${ds.currentDomain} and switch later — or launch directly on ${ds.proposedDomain}?`,
      decisionOptions: [
        {
          label: `Launch on ${ds.currentDomain}, Migrate Later`,
          subtitle: "Higher Complexity + Slower Momentum",
          pros: [],
          cons: [
            "Two full Google reprocessing cycles",
            "Two indexing periods",
            "Additional redirect management",
            "Temporary visibility volatility",
            "More development + SEO overhead",
          ],
        },
        {
          label: `Launch on ${ds.proposedDomain} from Day One`,
          subtitle: "Cleaner + Stronger Long-Term Strategy",
          recommended: true,
          pros: [
            "Aligns brand and domain immediately",
            "No future migration required",
            "Clearer trust + recognition signals",
            "Builds authority in the right place from the start",
          ],
        },
      ],
      decisionConclusion: ds.customRationale || "Result: Stronger foundation and faster compounding authority.",
    });

    // ── s05: Migration / Redirect Logic (conditional) ─────────────────────────
    slides.push({
      id: "s05_migration_logic",
      type: "bullets",
      title: `What Happens to ${ds.currentDomain}?`,
      subtitle: "We Will Implement a Full 301 Redirect Strategy",
      bullets: [
        `301 redirect every page from ${ds.currentDomain} → ${ds.proposedDomain}`,
        "Maintain identical URL paths wherever possible",
        "Preserve any authority or signals tied to the old domain",
        "Submit updated sitemap in Google Search Console",
        "Monitor indexing + traffic during transition",
      ],
    });

    slides.push({
      id: "s05b_migration_risk",
      type: "bullets",
      title: "Why This Is Low Risk",
      bullets: [
        "Site is effectively launching from zero",
        "Minimal authority to protect",
        "No meaningful rankings at risk",
        "Cleaner to migrate now vs. after growth begins",
        "Switching later creates unnecessary disruption.",
        "Switching now creates clarity and compounding growth.",
      ],
    });
  }

  // ── s06: Competitive Baseline — DR + Indexed Pages (chart-ready) ────────────
  const benchmarkChartData = allRows.map(r => ({
    label: r.isClient ? `★ ${r.name}` : r.name,
    DR: parseFloat(String(r.dr).replace(/[^0-9.]/g, "")) || 0,
    "Indexed Pages": parseFloat(String(r.indexedPages).replace(/[^0-9.]/g, "")) || 0,
  }));
  slides.push({
    id: "s06_competitive_dr",
    type: "two-col",
    title: "Competitive Analysis — Authority & Foundation",
    sectionLabel: `${clientName.toUpperCase()}: COMPETITIVE ANALYSIS BASELINE`,
    subtitle: "Where you stand vs. everybody else",
    leftContent: {
      type: "bullets",
      bullets: [
        `${clientName} has a ${parseFloat(String(wb.competitorBenchmark.clientRow.dr).replace(/[^0-9.]/g, "")) > 30 ? "solid" : "developing"} DR foundation, but may have fewer indexed pages than top competitors.`,
        "That means the site is credible, but underrepresented in search — it doesn't have enough optimized, intent-aligned pages to compete across the full set of queries.",
        "Opportunity: Grow efficiently by expanding the right pages (Programs / Treatment / What We Treat / Admissions), strengthening internal linking, and building targeted authority.",
      ],
    },
    rightContent: {
      type: "chart-bar",
      chartData: benchmarkChartData,
      chartKeys: ["DR", "Indexed Pages"],
    },
  });

  // ── s07: Competitive Baseline — AI Visibility + Snippet/AIO ────────────────
  const aiChartData = allRows.map(r => ({
    label: r.isClient ? `★ ${r.name}` : r.name,
    "AI Visibility": parseFloat(String(r.aiVisibilityScore).replace(/[^0-9.]/g, "")) || 0,
    "Featured Snippets": parseFloat(String(r.featuredSnippets).replace(/[^0-9.]/g, "")) || 0,
  }));
  slides.push({
    id: "s07_competitive_ai",
    type: "two-col",
    title: "Competitive Analysis — AI Visibility & Snippet/AIO",
    sectionLabel: `${clientName.toUpperCase()}: COMPETITIVE ANALYSIS BASELINE`,
    subtitle: "Where you stand vs. everybody else",
    leftContent: {
      type: "bullets",
      bullets: [
        "A few competitors are showing up more in AI-generated results and featured snippets — a sign of structured, answer-first content.",
        `${clientName} is in the lower-to-mid range for AI Visibility and has minimal snippet/AIO coverage.`,
        "Focus: increase snippet/AIO wins by building concise FAQ-style answers across key pages, adding clear headings/definitions, and strengthening internal linking.",
      ],
    },
    rightContent: {
      type: "chart-bar",
      chartData: aiChartData,
      chartKeys: ["AI Visibility", "Featured Snippets"],
    },
  });

  // ── s08: Competitive Efficiency Summary ─────────────────────────────────────
  const clientRank = wb.competitorBenchmark.clientRank;
  const total = wb.competitorBenchmark.totalCompetitors + 1;
  const percentile = wb.competitorBenchmark.percentile;
  const scorecardHeaders = ["Name", "Organic KW", "Organic Traffic", "Indexed Pages", "Rank"];
  const scorecardRows = allRows.map(r => [
    r.isClient ? `★ ${r.name}` : r.name,
    r.organicKeywords,
    r.organicTraffic,
    r.indexedPages,
    r.rank !== DASH ? `#${r.rank} of ${total}` : DASH,
  ]);
  slides.push({
    id: "s08_competitive_scorecard",
    type: "scorecard",
    title: "Competitive Efficiency Summary",
    sectionLabel: "COMPETITIVE ANALYSIS BASELINE",
    subtitle: "Where you stand vs. everybody else",
    commentary: `Across all key metrics: authority, visibility, and AI readiness, ${clientName} currently ranks ${clientRank > 0 ? `#${clientRank} of ${total}` : "near the bottom"} — giving us a clear benchmark for where to close the gap. The data shows our fastest growth levers are trust and content depth — not just more pages, but smarter ones that earn visibility across both traditional and AI search.`,
    table: { headers: scorecardHeaders, rows: scorecardRows },
    metrics: [
      { label: "Rank Among Peers", current: clientRank > 0 ? `#${clientRank} of ${total}` : MNE, isPositive: clientRank <= Math.ceil(total / 2) },
      { label: "Percentile", current: percentile > 0 ? `${percentile}th` : MNE, isPositive: percentile >= 50 },
      { label: "Organic Keywords", current: wb.competitorBenchmark.clientRow.organicKeywords, isPositive: true },
      { label: "Organic Traffic", current: wb.competitorBenchmark.clientRow.organicTraffic, isPositive: true },
    ],
  } as any);

  // ── s09: First Focus / Structural Cleanup ───────────────────────────────────
  const firstFocusBullets = amInputs.firstFocusBullets?.length ? amInputs.firstFocusBullets : [
    `Clarify the site's core structure: Define what lives at the top level (treatment, programs, admissions, etc.) and remove navigation ambiguity.`,
    `Align the site with how patients evaluate treatment: Services first, conditions second, education later — reducing friction for users deciding if ${clientName} is the right fit.`,
    "Create a shared prioritization framework for growth: Ensure future blogs, geo pages, and condition pages support core services and scale cleanly without rework.",
    ...(amInputs.amThoughts ? [`Strategist focus: ${amInputs.amThoughts}`] : []),
  ];
  slides.push({
    id: "s09_first_focus",
    type: "bullets",
    title: "Core Services, Conversions & Structural Cleanup",
    sectionLabel: "FIRST FOCUS",
    subtitle: `Our top priority is aligning on a clear, scalable site structure before production begins.`,
    bullets: firstFocusBullets,
    commentary: amInputs.focusNext60Days || undefined,
  });

  // ── s10: Current vs Future IA ───────────────────────────────────────────────
  const ia = amInputs.iaData;
  const currentNav = ia?.currentNav?.length ? ia.currentNav : [
    { label: "ABOUT" }, { label: "PROGRAMS" }, { label: "ADMISSIONS" },
    { label: "TREATMENT" }, { label: "RESOURCES" },
    { label: "VERIFY INSURANCE" }, { label: "CALL NOW" }, { label: "WHAT WE TREAT" },
  ];
  const futureNav = ia?.futureNav?.length ? ia.futureNav : [
    { label: "TREATMENT", children: ["/treatment/", "/treatment/therapies-modalities/", "/treatment/trauma-integrated-care/"] },
    { label: "PROGRAMS", children: ["/programs/", "/programs/residential/", "/programs/detox/", "/programs/php/"] },
    { label: "WHAT WE TREAT", children: ["/what-we-treat/", "/what-we-treat/substance-use/", "/what-we-treat/alcohol/"] },
    { label: "ADMISSIONS", children: ["/admissions/", "/admissions/verify-insurance/", "/admissions/start-here/"] },
    { label: "ABOUT", children: ["/about/", "/about/our-story/", "/about/clinical-team/"] },
    { label: "RESOURCES", children: ["/resources/", "/resources/blog/", "/resources/faq/"] },
  ];
  slides.push({
    id: "s10_ia_comparison",
    type: "ia-comparison",
    title: "Current vs Future Information Architecture",
    commentary: "Our goal: improve both usability and search performance. The new IA creates clear topics that map to real searches and support stronger internal linking — helping key pages rank, earn snippets, and convert.",
    currentIA: currentNav,
    futureIA: futureNav,
  });

  // ── s11: Scalable Blueprint / Cluster Expansion ─────────────────────────────
  const clusters = ia?.clusters?.length ? ia.clusters : [
    { hub: "Treatment", pages: ["/treatment/", "/treatment/therapies-modalities/", "/treatment/trauma-integrated-care/", "/treatment/medical-psychiatry/", "/treatment/wellness-experiential/"] },
    { hub: "Programs", pages: ["/programs/", "/programs/residential/", "/programs/detox/", "/programs/php/", "/programs/iop/", "/programs/aftercare-alumni/"] },
    { hub: "Admissions", pages: ["/admissions/", "/admissions/start-here/", "/admissions/insurance-cost/", "/admissions/verify-insurance/", "/admissions/what-to-bring/"] },
    { hub: "What We Treat", pages: ["/what-we-treat/", "/what-we-treat/substance-use/", "/what-we-treat/alcohol/", "/what-we-treat/opioids/", "/what-we-treat/mental-health/"] },
  ];
  slides.push({
    id: "s11_cluster_blueprint",
    type: "cluster-map",
    title: "Scalable Blueprint: Content Cluster Expansion",
    commentary: `A scalable blueprint for what we publish next. We'll grow these top-level hubs into complete topic clusters — adding the pages that matter most, in the order that drives rankings and admissions.`,
    clusters,
  });

  // ── s12: Credibility Layer / About + Resources ──────────────────────────────
  const credPages = ia?.credibilityPages?.length ? ia.credibilityPages : [
    { hub: "About", pages: ["/about/", "/about/our-story/", "/about/mission-values/", "/about/leadership/", "/about/clinical-team/", "/about/quality-accreditation/", "/about/treatment-outcomes/", "/about/careers/"] },
    { hub: "Resources", pages: ["/resources/", "/resources/blog/", "/resources/continuing-education/", "/resources/in-the-media/", "/resources/faq/"] },
  ];
  slides.push({
    id: "s12_credibility_layer",
    type: "cluster-map",
    title: "Credibility Layer: About + Resources",
    commentary: "About + Resources are the credibility layer. About consolidates core E-E-A-T signals — team, standards, accreditation, and outcomes — so trust is easy to verify. Resources extends that authority through helpful, structured content that answers real questions and supports search visibility over time.",
    clusters: credPages,
  });

  // ── URL Audit slides (conditional — only when crawl data exists) ────────────
  const flagCount = urlAudit.deleteRedirectCount;
  const delta = urlAudit.crawlDelta;
  const hasCrawlData = urlAudit.totalUrlsCrawled > 0;

  if (hasCrawlData) {
    const s10DeltaBullets: string[] = [];
    if (delta?.hasComparison) {
      if (delta.addedUrls.length > 0) s10DeltaBullets.push(`${delta.addedUrls.length} new URL${delta.addedUrls.length !== 1 ? "s" : ""} added since comparison crawl`);
      if (delta.removedUrls.length > 0) s10DeltaBullets.push(`${delta.removedUrls.length} URL${delta.removedUrls.length !== 1 ? "s" : ""} removed since comparison crawl`);
      if (delta.indexableCountDelta !== 0) s10DeltaBullets.push(`Indexable URL count changed by ${delta.indexableCountDelta > 0 ? "+" : ""}${delta.indexableCountDelta}`);
      if (delta.deleteRedirectDelta !== 0) {
        const improving = delta.deleteRedirectDelta < 0;
        s10DeltaBullets.push(`Consolidation candidates ${improving ? "reduced" : "increased"} by ${Math.abs(delta.deleteRedirectDelta)} — ${improving ? "cleanup is working" : "new low-performance pages detected"}`);
      }
    }

    slides.push({
      id: "s_audit_intro",
      type: "bullets",
      title: "Risk Flag: Cannibalization & Low-impact URLs",
      sectionLabel: "URL AUDIT",
      bullets: [
        flagCount > 0 ? `${clientName} currently has ${flagCount} URLs flagged for consolidation — many competing for the same keywords` : `${clientName} has overlapping URLs competing for the same keywords`,
        "Many were created historically to target 'near me,' duplicate location, or thin service variations",
        "Risk: Keyword cannibalization — multiple pages targeting the same core intent dilute authority",
        ...(urlAudit.cannibalizationNotes.length > 0 ? urlAudit.cannibalizationNotes : []),
        ...s10DeltaBullets,
      ],
    });

    if (flagCount > 0) {
      slides.push({
        id: "s_audit_action",
        type: "bullets",
        title: "Redirect & Consolidation Action",
        subtitle: "Structural cleanup in progress",
        bullets: [
          `We are deleting and 301-redirecting ${flagCount} low-impact, cannibalizing URLs — each averaging less than one organic visit over the past three months`,
          "This approach: Reduces internal competition | Improves clarity for Google | Protects existing performance | Creates a stronger foundation for future content",
          "Authority consolidates into the correct primary service pages",
          ...(amInputs.contextAnomalies ? [`Context: ${amInputs.contextAnomalies}`] : []),
        ],
        ...(urlAudit.flaggedRows.length > 0 ? {
          table: {
            headers: ["URL", "Type", "Sessions (3mo)", "Action", "Redirect Target"],
            rows: urlAudit.flaggedRows
              .filter(r => r.action === "delete & redirect")
              .slice(0, 15)
              .map(r => [r.url, r.pageType, r.sessions, r.action, r.redirectTarget || "/"]),
          },
        } : {}),
      });
    }
  }

  // ── What's Next ─────────────────────────────────────────────────────────────
  const whatsNextBullets = amInputs.whatsNextBullets?.length ? amInputs.whatsNextBullets : [
    "Confirm the proposed long-term site structure: Ensure this organization reflects how you want your services and offerings to be understood over time.",
    "Continued Content Planning: In parallel, we'll map out how this works in your current scope.",
    "Local SEO & Visibility Foundations: As we move beyond initial cleanup and core service work, we'll begin laying groundwork for local SEO initiatives, including location relevance, GBP optimization, and supporting infrastructure.",
    ...(amInputs.leadershipNote ? [`For leadership: ${amInputs.leadershipNote}`] : []),
  ];
  slides.push({
    id: "s_whats_next",
    type: "bullets",
    title: "What's Next",
    bullets: whatsNextBullets,
  });

  // ── Next Steps / Ownership ──────────────────────────────────────────────────
  const webservActions = amInputs.webservNextSteps?.length ? amInputs.webservNextSteps : [
    "Content planning for the rest of the quarter",
    `Defining and strengthening ${clientName}'s primary service pages`,
    "Fixing conversion gaps",
    "Phase 1 navigation cleanup (conversion-focused)",
    ...(hasCrawlData ? ["Redirect & archiving cannibalizing URLs"] : []),
    ...(amInputs.focusNext60Days ? [amInputs.focusNext60Days] : []),
  ];
  const clientActions = amInputs.clientNextSteps?.length ? amInputs.clientNextSteps : [
    "Confirm the proposed future site structure",
    ...(hasCrawlData ? ["Confirm the redirect plan for the cannibalizing URLs"] : []),
    ...(amInputs.salesAdmissionsContext ? [amInputs.salesAdmissionsContext] : []),
    ...(amInputs.clientDependencyNotes ? [amInputs.clientDependencyNotes] : []),
  ];
  slides.push({
    id: "s_next_steps",
    type: "two-col",
    title: "Next Steps",
    leftContent: { type: "bullets", bullets: [`Webserv:`, ...webservActions] },
    rightContent: {
      type: "metrics",
      metrics: clientActions.map((action, i) => ({
        label: i === 0 ? `${clientName} Team:` : " ",
        current: action,
        isPositive: true,
      })),
    },
  });

  return slides;
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
