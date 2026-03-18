import { storage } from "./storage";
import { queryGsc } from "./gscClient";
import { queryGa4 } from "./ga4Client";
import { decrypt } from "./encryption";
import { extractDomain } from "./googleToken";
import { fetchQssbData } from "./qssbClient";
import { fetchStrategyBank } from "./notionClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";

// ─── Constants ────────────────────────────────────────────────────────────────

const DASH = "—";
const MNE = DASH;

// ─── Input / Output Interfaces ────────────────────────────────────────────────

export interface MidStrategyInput {
  clientId: number;
  currentCrawlAssetId?: number | null;
  comparisonCrawlAssetId?: number | null;
  clientInsights?: string;
  includeDomainStrategy?: boolean;
  domainStrategy?: {
    currentDomain?: string;
    proposedDomain?: string;
    customRationale?: string;
  };
}

export interface BenchmarkRow {
  name: string; url: string; domainAge: string; dr: string;
  referringDomains: string; backlinks: string; indexedPages: string;
  aiVisibilityScore: string; aiMentions: string; citedSources: string;
  organicKeywords: string; top10Keywords: string; organicTraffic: string;
  featuredSnippets: string; finalScore: string; averageRank: string;
  rank: string; isClient: boolean;
}

export interface UrlAuditRow {
  url: string; pageType: string; sessions: string; action: string;
  redirectTarget: string; statusCode: string; indexability: string;
  title: string; h1: string;
}

export interface CrawlDelta {
  hasComparison: boolean; comparisonCrawledCount: number;
  addedUrls: string[]; removedUrls: string[];
  indexableCountDelta: number; deleteRedirectDelta: number;
  keepCountDelta: number; cannibalizationGroupDelta: number;
  comparisonDeleteRedirectCount: number; comparisonKeepCount: number;
  comparisonIndexableCount: number; comparisonCannibalizationGroups: number;
}

export interface WorkbookState {
  tabName: string;
  competitorBenchmark: {
    clientRow: BenchmarkRow; competitorRows: BenchmarkRow[];
    clientRank: number; totalCompetitors: number;
    percentile: number; clientFinalScore: string;
  };
  urlAudit: {
    totalUrlsCrawled: number; deleteRedirectCount: number;
    keepCount: number; lowPerformanceSessions: number;
    flaggedRows: UrlAuditRow[]; cannibalizationNotes: string[];
    crawlDelta: CrawlDelta | null;
  };
  buildStatus: {
    completedFields: number; missingFields: string[];
    builtAt: string; dataSourcesUsed: string[];
  };
}

export interface MidStrategyReportJson {
  report_title: string; client_name: string; report_date: string;
  generated_at: string; workbook: WorkbookState; slides: Slide[];
}

// ─── Finding Model ─────────────────────────────────────────────────────────────

interface FindingOption {
  label: string;
  description: string;
  effort: "low" | "medium" | "high";
  recommended?: boolean;
}

interface DiagnosticFinding {
  headline: string;
  evidence: string[];
  impact: string;
  options: FindingOption[];
  confidence: "data-backed" | "mixed-source" | "ai-synthesized" | "missing-data";
  sources: string[];
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

// Parse a formatted number string like "12.3K" or "1.2M" back into a raw number for chart scaling
function parseFormattedNum(s: string | number | undefined): number {
  if (typeof s === "number") return s;
  const cleaned = String(s ?? "").replace(/,/g, "");
  if (cleaned === DASH || cleaned === MNE || cleaned === "") return 0;
  const m = cleaned.match(/^([\d.]+)([KMB]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2]?.toUpperCase() === "K" ? 1_000 : m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "B" ? 1_000_000_000 : 1;
  return n * mult;
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
  try { return decrypt(creds[0].encryptedValue); } catch { return null; }
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
    return { organicKw: fmtNum(get("Organic Keywords")), organicTraffic: fmtNum(get("Organic Traffic")) };
  } catch { return null; }
}

async function semrushTopCompetitors(apiKey: string, domain: string): Promise<string[]> {
  try {
    const qs = new URLSearchParams({ type: "domain_organic_competitors", domain, database: "us", display_limit: "10", export_columns: "Dn", key: apiKey }).toString();
    const resp = await fetch(`https://api.semrush.com/?${qs}`);
    const text = await resp.text();
    if (!resp.ok || text.startsWith("ERROR") || !text.trim()) return [];
    return text.trim().split("\n").slice(1).map(l => l.split(";")[0]?.trim()).filter(Boolean).slice(0, 10);
  } catch { return []; }
}

function emptyBenchmarkRow(name: string, url: string, isClient = false): BenchmarkRow {
  return { name, url, domainAge: DASH, dr: DASH, referringDomains: DASH, backlinks: DASH, indexedPages: DASH, aiVisibilityScore: DASH, aiMentions: DASH, citedSources: DASH, organicKeywords: MNE, top10Keywords: DASH, organicTraffic: MNE, featuredSnippets: DASH, finalScore: DASH, averageRank: DASH, rank: DASH, isClient };
}

function rankOf(val: string, allVals: string[]): string {
  const num = (s: string) => parseFloat(s.replace(/[K,M]/g, m => m === "K" ? "000" : "000000")) || 0;
  const sorted = allVals.map((v, i) => ({ idx: i, n: num(v) })).filter(x => !isNaN(x.n) && x.n > 0).sort((a, b) => b.n - a.n);
  const myNum = num(val);
  if (isNaN(myNum) || myNum === 0) return DASH;
  const rank = sorted.findIndex(x => x.n === myNum) + 1;
  return rank > 0 ? String(rank) : DASH;
}

// ─── Layer 1: Source Normalization ────────────────────────────────────────────

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

  let crawlRows: Record<string, string>[] = [];
  let crawlHeaders: string[] = [];
  if (currentCrawlId) {
    const asset = await storage.getSfReport(currentCrawlId);
    if (asset) { crawlRows = (asset.data ?? []) as Record<string, string>[]; crawlHeaders = asset.headers ?? []; }
  } else {
    const latest = await storage.getSfReports(clientId);
    if (latest.length) { crawlRows = (latest[0].data ?? []) as Record<string, string>[]; crawlHeaders = latest[0].headers ?? []; }
  }

  let comparisonCrawlRows: Record<string, string>[] = [];
  let comparisonCrawlHeaders: string[] = [];
  if (comparisonCrawlId) {
    const compAsset = await storage.getSfReport(comparisonCrawlId);
    if (compAsset) { comparisonCrawlRows = (compAsset.data ?? []) as Record<string, string>[]; comparisonCrawlHeaders = compAsset.headers ?? []; }
  }

  const ga4LandingPages: Record<string, number> = {};
  if (ga4Result.status === "fulfilled" && ga4Result.value?.tables?.[0]) {
    for (const row of ga4Result.value.tables[0].rows) {
      const url = String(row[0] ?? ""); const sessions = Number(row[1]) || 0;
      if (url) ga4LandingPages[url] = sessions;
    }
  }

  const gscTopPages: string[] = [];
  if (gscResult.status === "fulfilled" && gscResult.value?.tables?.[0]) {
    for (const row of gscResult.value.tables[0].rows) {
      const query = String(row[0] ?? "");
      if (query) gscTopPages.push(query);
    }
  }

  return { client, clientDomain, clientSemrush, competitorDomains, semrushKey, crawlRows, crawlHeaders, comparisonCrawlRows, comparisonCrawlHeaders, ga4LandingPages, gscTopPages, gscResult, today };
}

// ─── URL Audit Processor ──────────────────────────────────────────────────────

interface AuditSummary {
  indexableCount: number; deleteRedirectCount: number; keepCount: number;
  urlSet: Set<string>; cannibalizationGroups: number; flaggedRows: UrlAuditRow[];
  cannibalizationNotes: string[]; lowPerformanceSessions: number;
}

function processUrlAuditRows(crawlRows: Record<string, string>[], crawlHeaders: string[], ga4LandingPages: Record<string, number>): AuditSummary {
  const urlCol = crawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? crawlHeaders[0];
  const statusCol = crawlHeaders.find(h => ["Status Code", "Status code"].includes(h));
  const indexCol = crawlHeaders.find(h => ["Indexability"].includes(h));
  const titleCol = crawlHeaders.find(h => ["Title 1", "Title"].includes(h));
  const h1Col = crawlHeaders.find(h => ["H1-1", "H1"].includes(h));
  const wordCountCol = crawlHeaders.find(h => h.toLowerCase().includes("word count"));

  const flaggedRows: UrlAuditRow[] = [];
  let deleteRedirectCount = 0, keepCount = 0, indexableCount = 0;
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
      const aw = t.toLowerCase().split(/\s+/), bw = title.toLowerCase().split(/\s+/);
      const common = aw.filter(w => bw.includes(w));
      return common.length / Math.max(aw.length, bw.length) > 0.7;
    }));
    if (title) { const key = title.toLowerCase().slice(0, 20); if (!titleGroups[key]) titleGroups[key] = []; titleGroups[key].push(title); }
    let action = "keep";
    if (indexability === "Indexable" && status === "200" && isLowTraffic && (isThin || isDuplicate)) { action = "delete & redirect"; deleteRedirectCount++; }
    else if (indexability === "Indexable" && status === "200") { action = "keep"; keepCount++; }
    else { action = status.startsWith("3") ? "redirect" : "review"; }
    flaggedRows.push({ url: url.replace(/^https?:\/\/[^/]+/, "") || "/", pageType: url.includes("/blog/") || url.includes("/post/") ? "Post" : "Page", sessions: String(sessions), action, redirectTarget: action === "delete & redirect" ? "/" : "", statusCode: status, indexability, title: title.slice(0, 60) || DASH, h1: h1.slice(0, 60) || DASH });
  }
  const cannibalGroups = Object.entries(titleGroups).filter(([, titles]) => titles.length > 1);
  if (cannibalGroups.length > 0) cannibalizationNotes.push(`${cannibalGroups.length} groups of pages with overlapping title patterns detected`);
  const lowPerformanceSessions = flaggedRows.filter(r => r.action === "delete & redirect").reduce((sum, r) => sum + (parseInt(r.sessions) || 0), 0);
  if (deleteRedirectCount > 0) cannibalizationNotes.push(`${deleteRedirectCount} URLs flagged for consolidation — only ${lowPerformanceSessions} total organic sessions combined`);
  return { indexableCount, deleteRedirectCount, keepCount, urlSet, cannibalizationGroups: cannibalGroups.length, flaggedRows: flaggedRows.slice(0, 100), cannibalizationNotes, lowPerformanceSessions };
}

// ─── Website Analysis ─────────────────────────────────────────────────────────

interface WebsiteAnalysis {
  totalUrls: number;
  indexableUrls: number;
  crawlAvailable: boolean;
  navSegments: Array<{ segment: string; count: number }>;
  missingKeyPages: string[];
  technicalIssues: Array<{ issue: string; count: number; severity: "high" | "medium" | "low"; examples: string[] }>;
  thinPages: Array<{ url: string; words: number; sessions: number }>;
  missingMetaDesc: number;
  missingH1: number;
  fourXxCount: number;
  noindexCount: number;
  duplicateTitleCount: number;
  trustPages: {
    hasAbout: boolean; hasTeam: boolean; hasAccreditations: boolean;
    hasTestimonials: boolean; hasAdmissions: boolean; hasInsurance: boolean;
    hasBlog: boolean; hasFaq: boolean; hasContact: boolean;
    missingTrustPages: string[];
  };
  conversionPages: { url: string; sessions: number }[];
  blogPosts: number;
  thinBlogPosts: number;
}

function analyzeWebsite(
  crawlRows: Record<string, string>[],
  crawlHeaders: string[],
  ga4LandingPages: Record<string, number>
): WebsiteAnalysis {
  const urlCol = crawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? crawlHeaders[0];
  const statusCol = crawlHeaders.find(h => ["Status Code", "Status code"].includes(h));
  const indexCol = crawlHeaders.find(h => ["Indexability"].includes(h));
  const titleCol = crawlHeaders.find(h => ["Title 1", "Title"].includes(h));
  const h1Col = crawlHeaders.find(h => ["H1-1", "H1"].includes(h));
  const metaCol = crawlHeaders.find(h => h.toLowerCase().includes("meta description") && h.includes("1"));
  const wordCountCol = crawlHeaders.find(h => h.toLowerCase().includes("word count"));

  if (!crawlRows.length) {
    return {
      totalUrls: 0, indexableUrls: 0, crawlAvailable: false,
      navSegments: [], missingKeyPages: [], technicalIssues: [],
      thinPages: [], missingMetaDesc: 0, missingH1: 0, fourXxCount: 0,
      noindexCount: 0, duplicateTitleCount: 0,
      trustPages: { hasAbout: false, hasTeam: false, hasAccreditations: false, hasTestimonials: false, hasAdmissions: false, hasInsurance: false, hasBlog: false, hasFaq: false, hasContact: false, missingTrustPages: [] },
      conversionPages: [], blogPosts: 0, thinBlogPosts: 0,
    };
  }

  const segmentCounts: Record<string, number> = {};
  const thinPages: Array<{ url: string; words: number; sessions: number }> = [];
  const titleMap: Record<string, string[]> = {};
  const trustPages = { hasAbout: false, hasTeam: false, hasAccreditations: false, hasTestimonials: false, hasAdmissions: false, hasInsurance: false, hasBlog: false, hasFaq: false, hasContact: false, missingTrustPages: [] as string[] };
  const conversionPageUrls = ["/admissions", "/insurance", "/verify", "/contact", "/apply", "/get-help"];
  const conversionPages: Array<{ url: string; sessions: number }> = [];
  let indexableUrls = 0, missingMetaDesc = 0, missingH1 = 0, fourXxCount = 0, noindexCount = 0, blogPosts = 0, thinBlogPosts = 0;

  for (const row of crawlRows) {
    const url = String(row[urlCol] ?? "");
    if (!url || !url.startsWith("http")) continue;
    const path = url.replace(/^https?:\/\/[^/]+/, "").toLowerCase();
    const status = String(row[statusCol ?? ""] ?? "200");
    const indexability = String(row[indexCol ?? ""] ?? "Indexable");
    const title = String(row[titleCol ?? ""] ?? "");
    const h1 = String(row[h1Col ?? ""] ?? "");
    const meta = String(row[metaCol ?? ""] ?? "");
    const words = parseInt(String(row[wordCountCol ?? ""] ?? "0")) || 0;
    const sessions = ga4LandingPages[url] ?? ga4LandingPages[url.replace(/\/$/, "")] ?? 0;

    // Segment analysis
    const seg = path.split("/").filter(Boolean)[0];
    if (seg) segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;

    // Technical
    if (indexability === "Indexable") indexableUrls++;
    if (status.startsWith("4")) fourXxCount++;
    if (indexability === "Non-Indexable" || indexability?.toLowerCase().includes("noindex")) noindexCount++;
    if (!meta || meta.length < 50) missingMetaDesc++;
    if (!h1 || h1.length < 5) missingH1++;

    // Thin content
    if (words > 0 && words < 300 && indexability === "Indexable" && status === "200") {
      thinPages.push({ url: path, words, sessions });
    }

    // Blog detection
    const isBlog = path.includes("/blog/") || path.includes("/post/") || path.includes("/news/") || path.includes("/resources/blog");
    if (isBlog) { blogPosts++; if (words < 400) thinBlogPosts++; }

    // Duplicate titles
    if (title && title.length > 15) {
      const key = title.toLowerCase().slice(0, 25);
      if (!titleMap[key]) titleMap[key] = [];
      titleMap[key].push(path);
    }

    // Trust page detection
    if (path.includes("/about")) trustPages.hasAbout = true;
    if (path.includes("/team") || path.includes("/staff") || path.includes("/clinical")) trustPages.hasTeam = true;
    if (path.includes("/accreditation") || path.includes("/licensure") || path.includes("/certification") || path.includes("/joint-commission")) trustPages.hasAccreditations = true;
    if (path.includes("/testimonial") || path.includes("/review") || path.includes("/alumni")) trustPages.hasTestimonials = true;
    if (path.includes("/admission")) trustPages.hasAdmissions = true;
    if (path.includes("/insurance") || path.includes("/verify") || path.includes("/vob")) trustPages.hasInsurance = true;
    if (isBlog || path.includes("/resources")) trustPages.hasBlog = true;
    if (path.includes("/faq") || path.includes("/frequently")) trustPages.hasFaq = true;
    if (path.includes("/contact") || path.includes("/get-help") || path.includes("/reach-us")) trustPages.hasContact = true;

    // Conversion pages
    if (conversionPageUrls.some(cu => path.includes(cu))) {
      conversionPages.push({ url: path, sessions });
    }
  }

  // Missing trust pages
  if (!trustPages.hasTeam) trustPages.missingTrustPages.push("Clinical team / staff page");
  if (!trustPages.hasAccreditations) trustPages.missingTrustPages.push("Accreditations / licensure page");
  if (!trustPages.hasTestimonials) trustPages.missingTrustPages.push("Testimonials / alumni page");
  if (!trustPages.hasInsurance) trustPages.missingTrustPages.push("Verify insurance / VOB page");
  if (!trustPages.hasAdmissions) trustPages.missingTrustPages.push("Admissions page");
  if (!trustPages.hasFaq) trustPages.missingTrustPages.push("FAQ page");

  const duplicateTitleCount = Object.values(titleMap).filter(v => v.length > 1).length;

  // Sort segments by count
  const navSegments = Object.entries(segmentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([segment, count]) => ({ segment, count }));

  // Missing key pages
  const allPaths = crawlRows.map(r => String(r[urlCol] ?? "").replace(/^https?:\/\/[^/]+/, "").toLowerCase());
  const missingKeyPages: string[] = [];
  const keyPages = [
    { check: (p: string) => p.includes("/verify-insurance") || p.includes("/insurance-verification"), label: "Verify Insurance / VOB" },
    { check: (p: string) => p.includes("/admissions"), label: "Admissions" },
    { check: (p: string) => p.includes("/contact"), label: "Contact page" },
    { check: (p: string) => p.includes("/about"), label: "About page" },
    { check: (p: string) => p.includes("/faq"), label: "FAQ / Resources" },
  ];
  for (const kp of keyPages) {
    if (!allPaths.some(kp.check)) missingKeyPages.push(kp.label);
  }

  // Technical issues summary
  const technicalIssues: WebsiteAnalysis["technicalIssues"] = [];
  if (fourXxCount > 0) technicalIssues.push({ issue: "4xx error pages (broken links/crawl errors)", count: fourXxCount, severity: "high", examples: [] });
  if (duplicateTitleCount > 3) technicalIssues.push({ issue: "Duplicate or near-duplicate page titles", count: duplicateTitleCount, severity: "medium", examples: [] });
  if (noindexCount > 5) technicalIssues.push({ issue: "Noindex pages (may be over-blocking important content)", count: noindexCount, severity: "medium", examples: [] });
  if (missingMetaDesc > crawlRows.length * 0.3) technicalIssues.push({ issue: "Pages missing meta descriptions", count: missingMetaDesc, severity: "medium", examples: [] });
  if (missingH1 > crawlRows.length * 0.2) technicalIssues.push({ issue: "Pages missing H1 tags", count: missingH1, severity: "medium", examples: [] });
  if (thinPages.length > 5) technicalIssues.push({ issue: "Thin pages under 300 words", count: thinPages.length, severity: thinPages.length > 20 ? "high" : "medium", examples: thinPages.slice(0, 3).map(p => p.url) });

  return { totalUrls: crawlRows.length, indexableUrls, crawlAvailable: true, navSegments, missingKeyPages, technicalIssues, thinPages, missingMetaDesc, missingH1, fourXxCount, noindexCount, duplicateTitleCount, trustPages, conversionPages, blogPosts, thinBlogPosts };
}

// ─── Integration Gap Analysis ─────────────────────────────────────────────────

interface IntegrationGap {
  service: string;
  status: "connected" | "missing" | "partial";
  issue: string;
  impact: string;
  fix: string;
}

function analyzeIntegrationGaps(client: any): IntegrationGap[] {
  const gaps: IntegrationGap[] = [];

  if (!client.ga4PropertyId) {
    gaps.push({ service: "GA4", status: "missing", issue: "Google Analytics 4 not connected", impact: "No visibility into site sessions, user behavior, or conversion paths — cannot measure SEO-to-admissions performance", fix: "Connect GA4 property in client settings and verify organic session tracking" });
  }
  if (!client.gscSiteUrl) {
    gaps.push({ service: "Google Search Console", status: "missing", issue: "GSC not connected", impact: "No keyword-level visibility — cannot identify which queries drive traffic or where rankings are dropping", fix: "Add the verified property in GSC and connect in client settings" });
  }
  if (!client.callrailCompanyId && !client.ctmAccountId) {
    gaps.push({ service: "Call Tracking", status: "missing", issue: "No call tracking integration connected (CallRail or CTM)", impact: "Cannot measure organic-to-call conversion — the highest-value admissions action is invisible in reporting", fix: "Connect CallRail or CTM to tie organic sessions to inbound call volume" });
  }
  if (!client.gbpLocationName) {
    gaps.push({ service: "Google Business Profile", status: "missing", issue: "GBP not configured", impact: "No local pack data or GBP signal tracking — local SEO performance is unmonitored", fix: "Add GBP location name and profile URL in client settings" });
  }
  if (!client.airtableBaseId) {
    gaps.push({ service: "Airtable Content Calendar", status: "missing", issue: "Content workflow not connected via Airtable", impact: "Content planning, production tracking, and published page reporting are manual — no automated content delivery tracking", fix: "Connect Airtable base with content production and published content views" });
  }
  if (!client.semrushProjectId && !client.ahrefsProjectUrl) {
    gaps.push({ service: "SEO Authority Tracking", status: "missing", issue: "Neither SEMrush project nor Ahrefs connected", impact: "Cannot measure domain authority growth, keyword ranking trends, or competitive position over time", fix: "Connect SEMrush project ID or Ahrefs project URL for ongoing authority and keyword tracking" });
  }
  if (!client.asanaProjectId) {
    gaps.push({ service: "Project Management (Asana)", status: "missing", issue: "Asana project not connected", impact: "No automated task-level delivery tracking — work done cannot be mapped to results in reporting", fix: "Connect Asana project to enable work log and delivery tracking in reports" });
  }

  return gaps;
}

// ─── Workbook Builder ─────────────────────────────────────────────────────────

async function buildWorkbook(sources: Awaited<ReturnType<typeof normalizeSources>>): Promise<WorkbookState> {
  const { client, clientDomain, clientSemrush, competitorDomains, semrushKey, crawlRows, crawlHeaders, comparisonCrawlRows, comparisonCrawlHeaders, ga4LandingPages, today } = sources;
  const missingFields: string[] = [];
  const dataSourcesUsed: string[] = [];
  const tabName = monthLabel(today);

  const clientRow = emptyBenchmarkRow(client.name, clientDomain ? `https://${clientDomain}/` : MNE, true);
  if (clientSemrush) { clientRow.organicKeywords = clientSemrush.organicKw; clientRow.organicTraffic = clientSemrush.organicTraffic; dataSourcesUsed.push("SEMrush"); }
  else { missingFields.push("Client organic keywords (SEMrush not connected)"); }

  if (crawlRows.length > 0) {
    const indexCol = crawlHeaders.find(h => ["Indexability", "indexability"].includes(h));
    const indexable = indexCol ? crawlRows.filter(r => r[indexCol]?.toLowerCase() === "indexable").length : crawlRows.length;
    clientRow.indexedPages = fmtNum(indexable);
    dataSourcesUsed.push("Screaming Frog crawl");
  } else { missingFields.push("Indexed pages (no crawl loaded)"); }

  let competitorRows: BenchmarkRow[] = [];
  if (competitorDomains.length > 0 && semrushKey) {
    const results = await Promise.allSettled(competitorDomains.slice(0, 10).map(d => semrushDomainRanks(semrushKey, d)));
    competitorRows = competitorDomains.slice(0, 10).map((domain, i) => {
      const row = emptyBenchmarkRow(domain, `https://${domain}/`);
      const res = results[i];
      if (res.status === "fulfilled" && res.value) { row.organicKeywords = res.value.organicKw; row.organicTraffic = res.value.organicTraffic; }
      return row;
    });
  } else if (competitorDomains.length === 0) { missingFields.push("Competitor list (SEMrush not connected)"); }

  const allRows = [clientRow, ...competitorRows];
  const allTr = allRows.map(r => r.organicTraffic);
  allRows.forEach(r => { r.rank = rankOf(r.organicTraffic, allTr); });
  const clientRankNum = parseInt(clientRow.rank) || allRows.length;
  const totalCompetitors = competitorRows.length;
  const percentile = totalCompetitors > 0 ? Math.round(((totalCompetitors + 1 - clientRankNum) / (totalCompetitors + 1)) * 100) : 0;

  let currentAudit: AuditSummary | null = null;
  if (crawlRows.length > 0) {
    dataSourcesUsed.push("URL audit crawl");
    currentAudit = processUrlAuditRows(crawlRows, crawlHeaders, ga4LandingPages);
  } else { missingFields.push("URL audit (no crawl loaded)"); }

  let crawlDelta: CrawlDelta | null = null;
  if (currentAudit && comparisonCrawlRows.length > 0) {
    const currentUrlCol = crawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? crawlHeaders[0];
    const compUrlCol = comparisonCrawlHeaders.find(h => ["Address", "URL", "address"].includes(h)) ?? comparisonCrawlHeaders[0];
    if (currentUrlCol && compUrlCol) {
      dataSourcesUsed.push("Comparison crawl");
      const compAudit = processUrlAuditRows(comparisonCrawlRows, comparisonCrawlHeaders, {});
      const addedUrls = Array.from(currentAudit.urlSet).filter(u => !compAudit.urlSet.has(u)).map(u => u.replace(/^https?:\/\/[^/]+/, "") || "/").slice(0, 20);
      const removedUrls = Array.from(compAudit.urlSet).filter(u => !currentAudit!.urlSet.has(u)).map(u => u.replace(/^https?:\/\/[^/]+/, "") || "/").slice(0, 20);
      crawlDelta = { hasComparison: true, comparisonCrawledCount: comparisonCrawlRows.length, addedUrls, removedUrls, indexableCountDelta: currentAudit.indexableCount - compAudit.indexableCount, deleteRedirectDelta: currentAudit.deleteRedirectCount - compAudit.deleteRedirectCount, keepCountDelta: currentAudit.keepCount - compAudit.keepCount, cannibalizationGroupDelta: currentAudit.cannibalizationGroups - compAudit.cannibalizationGroups, comparisonDeleteRedirectCount: compAudit.deleteRedirectCount, comparisonKeepCount: compAudit.keepCount, comparisonIndexableCount: compAudit.indexableCount, comparisonCannibalizationGroups: compAudit.cannibalizationGroups };
    }
  }

  return {
    tabName,
    competitorBenchmark: { clientRow, competitorRows, clientRank: clientRankNum, totalCompetitors, percentile, clientFinalScore: clientRow.finalScore },
    urlAudit: { totalUrlsCrawled: crawlRows.length, deleteRedirectCount: currentAudit?.deleteRedirectCount ?? 0, keepCount: currentAudit?.keepCount ?? 0, lowPerformanceSessions: currentAudit?.lowPerformanceSessions ?? 0, flaggedRows: currentAudit?.flaggedRows ?? [], cannibalizationNotes: currentAudit?.cannibalizationNotes ?? [], crawlDelta },
    buildStatus: { completedFields: (clientSemrush ? 2 : 0) + (crawlRows.length ? 3 : 0) + (competitorRows.length ? 2 : 0), missingFields, builtAt: new Date().toISOString(), dataSourcesUsed: [...new Set(dataSourcesUsed)] },
  };
}

// ─── Slide Generator ──────────────────────────────────────────────────────────

function generateSlides(
  wb: WorkbookState,
  website: WebsiteAnalysis,
  integrationGaps: IntegrationGap[],
  sources: Awaited<ReturnType<typeof normalizeSources>>,
  input: MidStrategyInput
): Slide[] {
  const clientName = sources.client.name;
  const reportDate = fmtDate(sources.today);
  const allRows = [wb.competitorBenchmark.clientRow, ...wb.competitorBenchmark.competitorRows];
  const { urlAudit } = wb;
  const slides: Slide[] = [];
  const hasCrawl = website.crawlAvailable;
  const hasCompetitors = wb.competitorBenchmark.totalCompetitors > 0;

  // ── Cover ─────────────────────────────────────────────────────────────────
  slides.push({
    id: "s01_title",
    type: "title",
    title: "Diagnosing what holds you back. Building what moves you forward.",
    subtitle: "Content & SEO Mid-Strategy Check-in",
    clientName,
    date: reportDate,
  });

  // ── Agenda ────────────────────────────────────────────────────────────────
  const agendaItems = [
    "Competitive Benchmarking",
    "Website Findings",
    "Content Quality & Gap Analysis",
    "Technical & Integration Findings",
    "Trust, Credibility & Conversion",
    "Priority Fixes",
    "What's Next",
  ];
  if (input.includeDomainStrategy && input.domainStrategy?.currentDomain) agendaItems.splice(1, 0, "Domain Strategy Recommendation");
  slides.push({ id: "s02_agenda", type: "bullets", title: "Mid-Strategy Agenda", sectionLabel: `${clientName.toUpperCase()} · CONTENT & SEO MID-STRATEGY CHECK-IN`, bullets: agendaItems });

  // ── Next Checkpoint ───────────────────────────────────────────────────────
  const checkpointMonth = sources.today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  slides.push({
    id: "s03_checkpoint",
    type: "bullets",
    title: `Strategy Month: ${checkpointMonth}`,
    sectionLabel: "NEXT CHECKPOINT",
    subtitle: "Launch Strategy & Roadmap Review — what happens at our next touchpoint",
    bullets: [
      "Review this diagnostic against actual data — confirm findings hold or update based on new crawl/analytics evidence",
      "Finalize the execution plan: content briefs, technical cleanup timeline, integration fixes, and ownership",
      "Align on North Star Metrics and success benchmarks for the next 60–90 days",
      "Confirm any upcoming changes, campaigns, new programs, or events to incorporate into the strategy",
      "Greenlight — signal the formal transition from strategy → active execution",
    ],
  });

  // ── Domain Strategy (optional) ────────────────────────────────────────────
  if (input.includeDomainStrategy && input.domainStrategy?.currentDomain && input.domainStrategy?.proposedDomain) {
    const ds = input.domainStrategy;
    slides.push({
      id: "s04_domain_strategy",
      type: "decision-card",
      title: "Domain Strategy Recommendation",
      subtitle: `Should we stay on ${ds.currentDomain} or migrate to ${ds.proposedDomain}?`,
      decisionOptions: [
        {
          label: `Migrate to ${ds.proposedDomain}`,
          subtitle: "Cleaner long-term brand & SEO foundation",
          recommended: true,
          pros: ["Single domain authority — no split equity", "Stronger brand clarity in search and AI results", "Cleaner URL structure and sitemap from launch", "No future redirect tax or reprocessing lag"],
          cons: ["Requires thorough 301 redirect mapping", "Brief Google reprocessing period (3–8 weeks)", "Coordination with dev team for launch timing"],
        },
        {
          label: `Stay on ${ds.currentDomain}`,
          subtitle: "Lower short-term lift",
          pros: ["No migration risk or redirect complexity", "Retains any existing link equity"],
          cons: ["Perpetuates brand ambiguity", "Leaves long-term SEO split between two domains", "Limits authority consolidation"],
        },
      ],
      decisionConclusion: ds.customRationale || `Recommend launching on ${ds.proposedDomain} — the cleaner, stronger long-term path.`,
    } as any);
  }

  // ── Competitive Baseline ──────────────────────────────────────────────────
  const benchmarkChartData = allRows.map(r => ({
    label: r.isClient ? `★ ${r.name}` : r.name,
    "Organic KW": parseFormattedNum(r.organicKeywords),
    "Organic Traffic": parseFormattedNum(r.organicTraffic),
  }));

  const clientDR = parseFloat(String(wb.competitorBenchmark.clientRow.dr).replace(/[^0-9.]/g, "")) || 0;
  const clientKw = wb.competitorBenchmark.clientRow.organicKeywords;
  const clientRank = wb.competitorBenchmark.clientRank;
  const total = wb.competitorBenchmark.totalCompetitors + 1;
  const percentile = wb.competitorBenchmark.percentile;

  const competitivePositionSummary = hasCompetitors
    ? `${clientName} currently ranks ${clientRank > 0 ? `#${clientRank} of ${total}` : "in the lower tier"} among identified local/regional competitors by organic traffic. ${percentile >= 50 ? "The site is in the upper half of the competitive set — with focused execution it can move to the top." : "There is meaningful ground to close — the opportunity is real and the gap is beatable with the right content structure."}`
    : `Competitor data requires SEMrush connection. The analysis below is based on site structure and crawl data.`;

  slides.push({
    id: "s05_competitive_baseline",
    type: "two-col",
    title: "Competitive Landscape — Where We Stand",
    sectionLabel: `${clientName.toUpperCase()}: COMPETITIVE ANALYSIS`,
    subtitle: "Local and regional addiction treatment search landscape",
    leftContent: {
      type: "bullets",
      bullets: [
        competitivePositionSummary,
        hasCompetitors ? `Organic keywords tracked: ${clientKw} — competitors in the top tier typically have 2–5x this footprint for the same market` : "Organic keyword and traffic data requires SEMrush connection",
        hasCrawl ? `${clientName} has ${website.indexableUrls} indexable pages — ${website.indexableUrls < 40 ? "a lean footprint that needs strategic expansion across programs, treatment, and admissions" : "a reasonable base that needs quality and structure improvements"}` : "Site footprint requires crawl data",
        "Fastest path to competitive improvement: fix site structure, deepen program content, and strengthen trust architecture — before increasing volume",
      ],
    },
    rightContent: {
      type: "chart-bar",
      chartData: hasCompetitors ? benchmarkChartData : [{ label: "No competitor data", "Organic KW": 0, "Organic Traffic": 0 }],
      chartKeys: ["Organic KW", "Organic Traffic"],
    },
    confidence: hasCompetitors ? "data-backed" : "missing-data",
    sources: hasCompetitors ? ["SEMrush"] : [],
  } as any);

  // ── Competitive Opportunities ──────────────────────────────────────────────
  const topCompetitors = wb.competitorBenchmark.competitorRows.slice(0, 3).map(r => r.name);
  slides.push({
    id: "s06_competitive_opportunities",
    type: "bullets",
    title: "Competitive Opportunities — Where We Can Win",
    sectionLabel: "COMPETITIVE ANALYSIS",
    subtitle: "Realistic paths to gain ground against local treatment competitors",
    bullets: [
      ...(topCompetitors.length ? [`Key competitors identified: ${topCompetitors.slice(0, 3).join(", ")} — each with a different structural strength worth understanding`] : ["Identifying local competitors requires SEMrush connection — currently analyzing site structure and content gaps only"]),
      "Content depth: Most local competitors are thin on program-level content — detailed treatment pages (what to expect, timeline, approach, outcomes) can differentiate and rank",
      "Trust layer: Accreditation pages, clinical team bios, and genuine testimonials are consistently underdeveloped across the treatment space — a meaningful opportunity for EEAT",
      "Local visibility: GBP optimization, location-specific content, and service-area pages are frequently missing or weak among local competitors",
      "Conversion structure: 'Verify Insurance' and 'Admissions' pages are often buried or under-optimized — prominently structured CTAs are an underused advantage",
      hasCompetitors ? `${clientName} has a realistic path to top-3 positioning among local/regional competitors with focused structural and content improvements` : "Full competitive gap analysis available once SEMrush data loads",
    ],
    confidence: hasCompetitors ? "mixed-source" : "ai-synthesized",
    sources: ["SEMrush (if connected)", "Website structure analysis"],
  } as any);

  // ── Core Services, Conversions & Structural Cleanup ──────────────────────
  const structuralFindings: string[] = [];
  const structuralFixes: string[] = [];

  if (hasCrawl) {
    if (website.navSegments.length > 8) {
      structuralFindings.push(`Navigation is overloaded — ${website.navSegments.length} top-level URL segments, making it hard for users and search engines to identify priority content`);
      structuralFixes.push("Consolidate top-level navigation to 5–7 clear sections aligned to patient journey stages");
    } else if (website.navSegments.length < 3) {
      structuralFindings.push("Site structure is shallow — very few distinct content sections, limiting keyword coverage and user flow");
      structuralFixes.push("Expand content architecture to cover programs, treatment modalities, admissions, and trust sections");
    } else {
      structuralFindings.push(`Site has ${website.navSegments.length} main content sections — structure is reasonable but likely needs depth and hierarchy improvements`);
      structuralFixes.push("Audit each section for depth, intent alignment, and internal linking quality");
    }

    const topSections = website.navSegments.slice(0, 5).map(s => `/${s.segment}/ (${s.count} pages)`);
    if (topSections.length) structuralFindings.push(`Largest sections: ${topSections.join(", ")}`);

    if (website.missingKeyPages.length > 0) {
      structuralFindings.push(`Missing or hard-to-find pages: ${website.missingKeyPages.join(", ")} — high-intent pages that should be prominent in navigation and URL structure`);
      structuralFixes.push(`Create and properly link: ${website.missingKeyPages.slice(0, 3).join(", ")}`);
    }

    if (urlAudit.deleteRedirectCount > 0) {
      structuralFindings.push(`${urlAudit.deleteRedirectCount} URLs flagged for consolidation — thin, duplicate, or overlapping pages that dilute authority`);
      structuralFixes.push(`Consolidate ${urlAudit.deleteRedirectCount} low-value URLs via 301 redirects to strengthen core pages`);
    }
  } else {
    structuralFindings.push("Site structure analysis requires a Screaming Frog crawl — upload a current crawl export to get detailed findings");
    structuralFindings.push("Based on the treatment center profile, common structural issues include: fragmented program pages, weak admissions flow, missing service depth under main navigation items");
    structuralFixes.push("Upload a Screaming Frog crawl to get data-backed structural findings");
  }

  structuralFixes.push("Map each program page to a clear patient journey stage: awareness → consideration → conversion");
  structuralFixes.push("Ensure 'Verify Insurance' and 'Admissions' are reachable within 2 clicks from every major section");

  slides.push({
    id: "s07_core_services",
    type: "two-col",
    title: "Core Services, Conversions & Structural Cleanup",
    sectionLabel: "WEBSITE FINDINGS",
    subtitle: "What the site structure says — and what needs to change first",
    leftContent: {
      type: "bullets",
      bullets: ["WHAT WE'RE SEEING:", ...structuralFindings.slice(0, 4)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["WHAT WE'RE FIXING:", ...structuralFixes.slice(0, 4)],
    },
    confidence: hasCrawl ? "data-backed" : "ai-synthesized",
    sources: hasCrawl ? ["Screaming Frog crawl", "GA4"] : [],
  } as any);

  // ── Website Architecture / Navigation ────────────────────────────────────
  const navFindings: string[] = [];
  const navOptions: string[] = [];

  if (hasCrawl) {
    const corePrograms = website.navSegments.filter(s => ["programs", "treatment", "services", "what-we-treat", "therapies"].includes(s.segment));
    const conversionSections = website.navSegments.filter(s => ["admissions", "insurance", "verify-insurance", "contact", "apply"].includes(s.segment));

    if (corePrograms.length === 0) navFindings.push("No dedicated programs, treatment, or services section detected in URL structure — core offerings may be buried or missing");
    else navFindings.push(`Core program sections: ${corePrograms.map(s => `/${s.segment}/ (${s.count} pages)`).join(", ")}`);

    if (conversionSections.length === 0) navFindings.push("Admissions and insurance sections are missing or not clearly structured — high-intent conversion pages may be hard to find");
    else navFindings.push(`Conversion sections present: ${conversionSections.map(s => `/${s.segment}/`).join(", ")}`);

    const blogSection = website.navSegments.find(s => ["blog", "resources", "news", "articles"].includes(s.segment));
    if (blogSection) navFindings.push(`Content/resources section present: /${blogSection.segment}/ (${blogSection.count} pages) — quality and structure to be assessed`);
    else navFindings.push("No blog or resources section found — content marketing footprint is limited");

    navOptions.push("Option 1 (Recommended): Restructure navigation around patient journey — Treatment → Programs → Admissions → About/Trust → Resources");
    navOptions.push("Option 2 (Lower lift): Improve existing structure with better internal linking, clearer CTAs, and missing page additions without full reorganization");
    navOptions.push("Option 3 (Future state): Build a fully hierarchical IA with service clusters, location sub-pages, and expanded what-we-treat taxonomy — after baseline improvements land");
  } else {
    navFindings.push("Navigation analysis requires a Screaming Frog crawl — current assessment is based on site profile and typical treatment center patterns");
    navFindings.push("Common navigation issues in treatment sites: too many top-level items, missing dedicated admissions path, program pages not clearly separated from blog content");
    navOptions.push("Upload a crawl to get specific navigation findings and a client-specific IA recommendation");
  }

  slides.push({
    id: "s08_architecture",
    type: "two-col",
    title: "Website Architecture & Navigation Findings",
    sectionLabel: "WEBSITE FINDINGS",
    subtitle: "Is the menu structure helping or hurting visibility and conversions?",
    leftContent: {
      type: "bullets",
      bullets: ["FINDINGS:", ...navFindings.slice(0, 4)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["RECOMMENDED PATH FORWARD:", ...navOptions.slice(0, 3)],
    },
    confidence: hasCrawl ? "data-backed" : "ai-synthesized",
    sources: hasCrawl ? ["Screaming Frog crawl"] : [],
  } as any);

  // ── Content Quality & Gaps ────────────────────────────────────────────────
  const contentFindings: string[] = [];
  const contentFixes: string[] = [];

  if (hasCrawl) {
    if (website.thinPages.length > 0) {
      contentFindings.push(`${website.thinPages.length} pages under 300 words — thin content that cannot rank competitively or earn featured snippets`);
      const thinExamples = website.thinPages.slice(0, 3).map(p => p.url);
      if (thinExamples.length) contentFindings.push(`Examples: ${thinExamples.join(", ")}`);
      contentFixes.push(`Expand the top thin pages with intent-aligned, structured content — minimum 600 words for program pages, 400+ for supporting pages`);
    }

    if (website.blogPosts > 0) {
      contentFindings.push(`${website.blogPosts} blog posts detected — ${website.thinBlogPosts} under 400 words (too thin to rank or earn links)`);
      if (website.thinBlogPosts > website.blogPosts * 0.4) {
        contentFindings.push("Blog strategy is producing too much thin, low-value content — quantity over quality without a clear topic cluster strategy");
        contentFixes.push("Audit blog content: consolidate or expand thin posts, eliminate those with no search value, build topic clusters around core service areas");
      } else {
        contentFindings.push("Blog content volume is reasonable — focus needed on topical depth, internal linking, and alignment to search intent");
        contentFixes.push("Strengthen blog structure with proper internal links to program pages and a clear topic cluster framework");
      }
    } else {
      contentFindings.push("No blog or resources content detected — missing a significant organic traffic acquisition channel");
      contentFixes.push("Build a content strategy around behavioral health search queries: condition pages, treatment FAQs, patient resources, alumni stories");
    }

    contentFindings.push("Content gaps typically found in treatment sites: condition-specific treatment pages, insurance carrier pages, local/geo pages, FAQ for admissions process, and outcome/testimonial content");
    contentFixes.push("Identify and fill high-value content gaps with intent-aligned, structured pages that directly support the admissions funnel");
  } else {
    contentFindings.push("Content quality analysis requires crawl data — upload a Screaming Frog export to identify thin pages, gaps, and blog quality issues");
    contentFindings.push("Based on treatment center profile: common content gaps include thin program descriptions, missing condition-specific pages, weak FAQ structure, and under-developed blog strategy");
    contentFixes.push("Priority content investments for behavioral health SEO: program-level detail pages, condition/what-we-treat expansion, admissions process content, and trust-building FAQ");
  }

  slides.push({
    id: "s09_content_quality",
    type: "two-col",
    title: "Content Quality, Blog & Content Gap Findings",
    sectionLabel: "WEBSITE FINDINGS",
    subtitle: "Is the content aligned to search intent, trust, and admissions relevance?",
    leftContent: {
      type: "bullets",
      bullets: ["FINDINGS:", ...contentFindings.slice(0, 4)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["RECOMMENDED ACTIONS:", ...contentFixes.slice(0, 4)],
    },
    confidence: hasCrawl ? "data-backed" : "ai-synthesized",
    sources: hasCrawl ? ["Screaming Frog crawl", "GSC", "GA4"] : [],
  } as any);

  // ── Technical / Crawl Findings ────────────────────────────────────────────
  const techFindings: string[] = [];
  const techFixes: string[] = [];

  if (hasCrawl) {
    for (const issue of website.technicalIssues) {
      techFindings.push(`${issue.issue}: ${issue.count} instances ${issue.severity === "high" ? "⚠" : ""}`);
    }
    if (website.duplicateTitleCount > 0) techFindings.push(`${website.duplicateTitleCount} groups of duplicate or near-duplicate page titles — signals of cannibalization risk`);
    if (website.missingMetaDesc > 5) techFindings.push(`${website.missingMetaDesc} pages missing meta descriptions — limits click-through rates in search results`);
    if (website.missingH1 > 5) techFindings.push(`${website.missingH1} pages missing H1 tags — a fundamental on-page signal gap`);

    if (urlAudit.deleteRedirectCount > 0) {
      techFindings.push(`${urlAudit.deleteRedirectCount} URLs identified for consolidation via 301 redirect — averaging under 1 organic session per page`);
      techFixes.push(`Execute redirect plan: 301 consolidate ${urlAudit.deleteRedirectCount} low-value URLs to relevant primary pages`);
    }
    if (website.fourXxCount > 0) techFixes.push(`Fix ${website.fourXxCount} broken pages (4xx errors) — check internal links and update or remove references`);
    techFixes.push("Resolve meta description and H1 gaps on all indexable pages — prioritize program and conversion pages first");
    techFixes.push("Review noindex pages to ensure important content is not accidentally blocked from search");

    if (hasCrawl && urlAudit.flaggedRows.length > 0) {
      slides.push({
        id: "s09b_url_audit",
        type: "bullets",
        title: "Crawl Audit: Redirect & Consolidation Plan",
        sectionLabel: "TECHNICAL FINDINGS",
        subtitle: `${urlAudit.deleteRedirectCount} URLs flagged for cleanup — consolidating diluted authority`,
        bullets: [
          urlAudit.deleteRedirectCount > 0 ? `${urlAudit.deleteRedirectCount} thin, low-traffic, or duplicate URLs will be 301 redirected to their primary equivalents` : "URL structure is clean — no consolidation needed at this time",
          ...(urlAudit.cannibalizationNotes ?? []),
          "Redirect consolidation: strengthens authority on core pages | improves crawl efficiency | removes cannibalization signals",
        ],
        ...(urlAudit.flaggedRows.length > 0 ? {
          table: {
            headers: ["URL", "Type", "Sessions", "Action", "Redirect Target"],
            rows: urlAudit.flaggedRows.filter(r => r.action === "delete & redirect").slice(0, 12).map(r => [r.url, r.pageType, r.sessions, r.action, r.redirectTarget || "/"]),
          },
        } : {}),
      } as any);
    }
  } else {
    techFindings.push("Technical analysis requires a Screaming Frog crawl — upload a current export to identify errors, indexation issues, and metadata gaps");
    techFindings.push("Common technical issues in treatment center sites: orphan pages, thin redirecting pages, missing canonicals, over-noindexed content, and tag duplication");
    techFixes.push("Upload a Screaming Frog crawl to generate a data-backed technical priority list");
  }

  if (!techFindings.length) techFindings.push("No significant technical issues detected in crawl — site is technically sound at the surface level");
  slides.push({
    id: "s10_technical",
    type: "two-col",
    title: "Technical & Crawl Findings",
    sectionLabel: "TECHNICAL FINDINGS",
    subtitle: "Crawl health, indexation quality, and metadata coverage",
    leftContent: {
      type: "bullets",
      bullets: ["FINDINGS:", ...techFindings.slice(0, 5)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["PRIORITY FIXES:", ...techFixes.slice(0, 5)],
    },
    confidence: hasCrawl ? "data-backed" : "ai-synthesized",
    sources: hasCrawl ? ["Screaming Frog crawl"] : [],
  } as any);

  // ── Trust / Credibility / Conversion ─────────────────────────────────────
  const trustFindings: string[] = [];
  const trustFixes: string[] = [];

  if (hasCrawl) {
    const tp = website.trustPages;
    if (tp.missingTrustPages.length > 0) {
      trustFindings.push(`Missing trust pages: ${tp.missingTrustPages.join(", ")}`);
      trustFixes.push(`Create and link these missing trust assets: ${tp.missingTrustPages.slice(0, 3).join(", ")}`);
    }
    if (tp.hasInsurance) trustFindings.push("Verify Insurance / VOB page exists — verify it is prominent in navigation and has clear conversion CTAs");
    else { trustFindings.push("Verify Insurance page is missing — this is the #1 high-intent conversion page for behavioral health sites"); trustFixes.push("Create a prominent Verify Insurance / VOB page and add it to the main navigation"); }

    if (!tp.hasTeam) { trustFindings.push("No clinical team or staff page detected — a critical E-E-A-T gap for behavioral health"); trustFixes.push("Build or improve a clinical team page with bios, credentials, and photos"); }
    if (!tp.hasAccreditations) { trustFindings.push("No accreditation or licensure page found — SAMHSA / Joint Commission / state licensure should be prominently documented"); }

    const convHighTraffic = website.conversionPages.filter(p => p.sessions > 10);
    if (convHighTraffic.length > 0) trustFindings.push(`Active conversion pages: ${convHighTraffic.slice(0, 3).map(p => p.url).join(", ")} — verify CTAs, form placement, and mobile experience`);

    trustFixes.push("Add accreditation badges, licenses, and certifications to the footer and About/Trust pages");
    trustFixes.push("Ensure all conversion pages (Admissions, Insurance, Contact) have clear, prominent CTAs and minimal friction");
  } else {
    trustFindings.push("Trust and credibility analysis requires crawl data — key findings include: trust page presence, conversion path clarity, and E-E-A-T signal coverage");
    trustFindings.push("Typical treatment center trust gaps: underdeveloped team pages, missing accreditation documentation, buried verify-insurance pages, weak testimonial coverage");
    trustFixes.push("Priority trust actions: verify insurance page placement in main nav, clinical team page with credentials, accreditation page, and structured testimonials");
  }

  slides.push({
    id: "s11_trust",
    type: "two-col",
    title: "Trust, Credibility & Conversion Findings",
    sectionLabel: "WEBSITE FINDINGS",
    subtitle: "Is the site built to earn trust and convert qualified admissions?",
    leftContent: {
      type: "bullets",
      bullets: ["TRUST AUDIT:", ...trustFindings.slice(0, 4)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["TRUST ACTIONS:", ...trustFixes.slice(0, 4)],
    },
    confidence: hasCrawl ? "data-backed" : "ai-synthesized",
    sources: hasCrawl ? ["Screaming Frog crawl", "GA4"] : [],
  } as any);

  // ── Integration Gaps ──────────────────────────────────────────────────────
  const gapBullets = integrationGaps.length > 0
    ? integrationGaps.map(g => `${g.service}: ${g.issue} — ${g.impact}`)
    : ["All key integrations are connected — no critical gaps detected"];
  const fixBullets = integrationGaps.length > 0
    ? integrationGaps.map(g => `${g.service}: ${g.fix}`)
    : ["Maintain current integrations and monitor for data quality issues"];

  slides.push({
    id: "s12_integrations",
    type: "two-col",
    title: "Integration Holes & Tracking Gaps",
    sectionLabel: "INTEGRATION ANALYSIS",
    subtitle: "What is connected, what is missing, and what it costs us in visibility",
    leftContent: {
      type: "bullets",
      bullets: [`${integrationGaps.length > 0 ? `${integrationGaps.length} integration gaps identified:` : "Integration status:"}`, ...gapBullets.slice(0, 5)],
    },
    rightContent: {
      type: "bullets",
      bullets: ["RECOMMENDED FIXES:", ...fixBullets.slice(0, 5)],
    },
    confidence: "data-backed",
    sources: ["Client configuration data"],
  } as any);

  // ── Priority Fixes ────────────────────────────────────────────────────────
  // Build a ranked list of the most important actions across all findings
  const allPriorityItems: Array<{ priority: number; area: string; action: string }> = [];
  
  // High priority: missing conversion infrastructure
  if (!website.trustPages.hasInsurance && hasCrawl) allPriorityItems.push({ priority: 1, area: "Conversion", action: "Create Verify Insurance / VOB page and add to main navigation" });
  if (website.fourXxCount > 0 && hasCrawl) allPriorityItems.push({ priority: 1, area: "Technical", action: `Fix ${website.fourXxCount} broken pages (4xx errors)` });
  if (urlAudit.deleteRedirectCount > 0) allPriorityItems.push({ priority: 1, area: "Technical", action: `Execute 301 redirect plan for ${urlAudit.deleteRedirectCount} thin/duplicate URLs` });
  if (integrationGaps.some(g => g.service === "Call Tracking")) allPriorityItems.push({ priority: 1, area: "Tracking", action: "Connect call tracking (CallRail or CTM) to measure organic-to-admissions conversion" });
  if (integrationGaps.some(g => g.service === "GA4")) allPriorityItems.push({ priority: 1, area: "Tracking", action: "Connect Google Analytics 4 — no session or conversion data without it" });
  
  // Medium priority: structural and content improvements
  if (website.missingKeyPages.length > 0 && hasCrawl) allPriorityItems.push({ priority: 2, area: "Structure", action: `Create missing key pages: ${website.missingKeyPages.slice(0, 2).join(", ")}` });
  if (!website.trustPages.hasTeam && hasCrawl) allPriorityItems.push({ priority: 2, area: "Trust", action: "Build clinical team page with bios, credentials, and photos" });
  if (!website.trustPages.hasAccreditations && hasCrawl) allPriorityItems.push({ priority: 2, area: "Trust", action: "Create accreditation and licensure page (SAMHSA, Joint Commission, state)" });
  if (website.thinPages.length > 5 && hasCrawl) allPriorityItems.push({ priority: 2, area: "Content", action: `Expand ${Math.min(website.thinPages.length, 10)} thin pages with intent-aligned content` });
  if (website.thinBlogPosts > 3 && hasCrawl) allPriorityItems.push({ priority: 2, area: "Content", action: "Audit and consolidate thin blog content — build topic clusters instead of isolated posts" });
  
  // Lower priority: optimization
  if (website.missingMetaDesc > 10 && hasCrawl) allPriorityItems.push({ priority: 3, area: "On-Page SEO", action: `Write meta descriptions for ${website.missingMetaDesc} pages missing them` });
  if (!hasCrawl) allPriorityItems.push({ priority: 1, area: "Analysis", action: "Upload a Screaming Frog crawl to enable data-backed technical and content analysis" });

  const priorityItems = allPriorityItems.sort((a, b) => a.priority - b.priority).slice(0, 8);
  
  const scorecardRows = priorityItems.map((item, i) => [
    `#${i + 1}`,
    item.area,
    item.action,
    item.priority === 1 ? "🔴 High" : item.priority === 2 ? "🟡 Medium" : "🟢 Low",
  ]);

  slides.push({
    id: "s13_priorities",
    type: "scorecard",
    title: "Priority Fixes — What We're Addressing First",
    sectionLabel: "PRIORITY ACTIONS",
    subtitle: "Ranked by impact on visibility, trust, and admissions performance",
    table: {
      headers: ["#", "Area", "Action", "Priority"],
      rows: scorecardRows.length > 0 ? scorecardRows : [["1", "Analysis", "Upload Screaming Frog crawl to generate data-backed priority list", "🔴 High"]],
    },
    commentary: `These are the highest-leverage moves to improve ${clientName}'s organic performance, admissions visibility, and conversion infrastructure. We address the structural foundation first — then build the content and authority layer on top of it.`,
  } as any);

  // ── What's Next ────────────────────────────────────────────────────────────
  const whatsNextBullets: string[] = [
    "Finalize the site structure and content architecture based on findings from this review",
    "Execute the technical cleanup plan — redirect consolidation, broken link fixes, metadata improvements",
    ...(integrationGaps.length > 0 ? [`Connect missing integrations to close measurement gaps (${integrationGaps.map(g => g.service).slice(0, 3).join(", ")})`] : []),
    "Begin content sprint: expand thin program pages, create missing trust assets, build FAQ structure",
    "Strengthen conversion infrastructure: Verify Insurance placement, Admissions clarity, CTA consistency",
    "Local SEO: GBP optimization, geo-targeted content, and local citation review",
  ];
  if (input.clientInsights) whatsNextBullets.push(`Client context: ${input.clientInsights}`);

  slides.push({
    id: "s14_whats_next",
    type: "bullets",
    title: "What's Next",
    subtitle: "The strategic sequence that will move the needle most",
    bullets: whatsNextBullets,
    confidence: "mixed-source",
    sources: ["Diagnostic findings", "Client context"],
  } as any);

  // ── Next Steps ─────────────────────────────────────────────────────────────
  const clientNextSteps = [
    "Review this diagnostic and confirm the priority sequence aligns with internal goals",
    input.trustPages?.hasInsurance === false
      ? "Work with developer to create or update the Verify Insurance / VOB page and add it to main navigation"
      : "Confirm redirect plan and technical cleanup timeline with internal team and developer",
    input.clientInsights
      ? `Provide any additional context on upcoming changes: ${input.clientInsights.slice(0, 120)}`
      : "Flag any upcoming site changes, campaigns, new programs, or events that should be incorporated",
    "Confirm next checkpoint date and format (call, async update, or presentation)",
  ];
  slides.push({
    id: "s15_next_steps",
    type: "two-col",
    title: "Next Steps",
    leftContent: {
      type: "bullets",
      bullets: [
        "Webserv:",
        "Finalize site structure plan and share proposed IA for review",
        "Begin redirect map and technical cleanup execution",
        "Deliver content briefs for the top priority pages identified in this audit",
        "Set up any missing integrations and verify tracking coverage",
        "Schedule next checkpoint in 2 weeks",
      ],
    },
    rightContent: {
      type: "bullets",
      bullets: [
        "Client Team:",
        ...clientNextSteps,
      ],
    },
  } as any);

  return slides;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function generateMidStrategy(input: MidStrategyInput): Promise<MidStrategyReportJson> {
  const sources = await normalizeSources(input.clientId, input.currentCrawlAssetId ?? null, input.comparisonCrawlAssetId ?? null);
  const workbook = await buildWorkbook(sources);
  const website = analyzeWebsite(sources.crawlRows, sources.crawlHeaders, sources.ga4LandingPages);
  const integrationGaps = analyzeIntegrationGaps(sources.client);
  
  // Pass trust pages info to next steps slide
  (input as any).trustPages = website.trustPages;
  
  const slides = generateSlides(workbook, website, integrationGaps, sources, input);

  try {
    const [qssbData, strategyBank] = await Promise.all([fetchQssbData(), fetchStrategyBank()]);
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
        bullets: opps.slice(0, 10),
      });
    }
  } catch (err: any) {
    console.warn("[Mid-Strategy] QSSB/Strategy Bank fetch failed:", err.message);
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
