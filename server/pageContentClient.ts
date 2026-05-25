// ─── pageContentClient.ts ──────────────────────────────────────────────────
// Fetches HTML for a small set of "EEAT-critical" pages on a client's site
// and extracts trust signals: schema presence, author/reviewer markup, byline
// patterns, credential mentions, FAQ count, "last reviewed" dates.
//
// Caches the fetched HTML by (client_id, url, year-month) so repeated report
// generations within the same month don't re-fetch — saves time and avoids
// hammering the client's site. Cache is in-memory; expires monthly.
//
// Page selection strategy:
//   - Top 10 by GSC clicks (highest-traffic pages where EEAT matters most)
//   - Staff/About/Reviewer/Team pages if findable (the EEAT pages themselves)
//   - Top 5 service pages from Airtable (commercial pages where trust drives leads)
//   - Cap total at ~20 pages so generation stays fast
//
// NOT used: Screaming Frog (no API), JS-rendering (we use plain fetch). If a
// page returns a near-empty shell (e.g. heavy SPA), we flag it but proceed.

import * as cheerio from "cheerio";
import type { Client } from "@shared/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PageEeatSignals {
  url: string;
  fetchedOk: boolean;
  fetchError?: string;
  // Schema detection — what structured data is on the page
  schemaTypes: string[];               // e.g. ["Organization", "FAQPage", "Person", "MedicalEntity"]
  hasOrganizationSchema: boolean;
  hasAuthorOrPersonSchema: boolean;
  hasReviewerInSchema: boolean;
  hasFaqSchema: boolean;
  hasMedicalSchema: boolean;
  hasArticleSchema: boolean;
  schemaBlockCount: number;            // raw count of JSON-LD blocks
  // Byline / author / reviewer text patterns (parsed from rendered HTML, not just schema)
  hasBylineText: boolean;              // "By [name]", "Author:", "Written by"
  hasReviewedByText: boolean;          // "Reviewed by", "Medically reviewed", "Clinically reviewed"
  hasLastReviewedDate: boolean;        // "Last reviewed", "Last updated", "Reviewed [date]"
  // Credentials present anywhere in body (rough scan)
  credentialMentions: string[];        // ["MD", "LCSW", "PhD"] etc found
  // FAQ count
  faqItemCount: number;                // count of FAQ items (from schema OR from heuristic pattern)
  // Photos in author/staff bio sections
  hasAuthorPhotos: boolean;            // heuristic — img inside author/bio container
  // External source citations
  externalCitationCount: number;       // count of <a> to external domains in article body
  // Content shape signals
  wordCount: number;
  isShellPage: boolean;                // <body> has <200 chars rendered text — likely JS-rendered
}

export interface SiteEeatSummary {
  totalPagesScanned: number;
  pagesWithAuthorSchema: number;
  pagesWithReviewerInfo: number;       // schema OR text
  pagesWithFaqs: number;
  pagesWithLastReviewed: number;
  pagesWithBylines: number;
  shellPagesDetected: number;          // count of JS-heavy shell pages
  // Per-page signals (max ~20)
  pages: PageEeatSignals[];
  // Aggregate findings AI can use
  topGapsByCategory: Array<{ category: string; pagesAffected: number; sampleUrls: string[] }>;
}

// ─── Cache ─────────────────────────────────────────────────────────────────
// Key format: `${clientId}::${url}::${YYYY-MM}`. In-memory only; survives
// for the process lifetime. For multi-instance deploys this would need to
// move to DB or Redis — current setup is single-instance so this is fine.

const eeatCache = new Map<string, PageEeatSignals>();

function cacheKey(clientId: number, url: string, monthKey: string): string {
  return `${clientId}::${url}::${monthKey}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Page selection ────────────────────────────────────────────────────────

export interface PageSelectionInputs {
  client: Client;
  gscTopPages?: Array<{ url?: string; page?: string }>;       // top pages by clicks (from GSC)
  airtableServicePageUrls?: string[];                          // top service page URLs (from Airtable)
}

// Build the list of pages to fetch for EEAT scanning. ~20 pages max.
export function selectEeatPages(inputs: PageSelectionInputs): string[] {
  const { client, gscTopPages, airtableServicePageUrls } = inputs;
  const baseUrl = client.gscSiteUrl ?? "";
  if (!baseUrl) return [];

  // Normalize the site URL — Search Console sometimes stores `sc-domain:foo.com`
  // or `https://www.foo.com/` formats. We need a clean origin.
  const origin = normalizeOrigin(baseUrl);
  if (!origin) return [];

  const selected = new Set<string>();

  // 1. Top 10 GSC pages
  if (gscTopPages) {
    for (const p of gscTopPages.slice(0, 10)) {
      const u = (p.url ?? p.page ?? "").trim();
      if (u && isOnOrigin(u, origin)) selected.add(normalizeUrl(u));
    }
  }

  // 2. Common EEAT pages — try /about, /staff, /team, /our-staff, /clinical-team, /reviewers
  // Some won't exist; we try them and let the fetch step handle 404s gracefully.
  const eeatPaths = [
    "/about",
    "/about-us",
    "/staff",
    "/our-staff",
    "/team",
    "/our-team",
    "/clinical-team",
    "/medical-team",
    "/reviewers",
    "/our-reviewers",
  ];
  for (const path of eeatPaths) {
    selected.add(normalizeUrl(origin + path));
  }

  // 3. Top 5 service pages from Airtable
  if (airtableServicePageUrls) {
    for (const u of airtableServicePageUrls.slice(0, 5)) {
      if (u && isOnOrigin(u, origin)) selected.add(normalizeUrl(u));
    }
  }

  // 4. Always include homepage
  selected.add(normalizeUrl(origin + "/"));

  // Cap at 22 (10 GSC + 10 EEAT paths + 5 service + 1 homepage) — already capped naturally
  return Array.from(selected).slice(0, 22);
}

// ─── URL helpers ───────────────────────────────────────────────────────────

function normalizeOrigin(input: string): string | null {
  let s = input.trim();
  if (s.startsWith("sc-domain:")) s = "https://" + s.slice("sc-domain:".length);
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    // Strip trailing slashes from path (except root) and drop fragments/search for dedup
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return u;
  }
}

function isOnOrigin(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    return u.host === o.host;
  } catch {
    return false;
  }
}

// ─── Fetching & parsing ────────────────────────────────────────────────────

async function fetchHtml(url: string, timeoutMs = 8000): Promise<{ html: string; ok: boolean; err?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Use a realistic UA — some sites block default fetch UAs (looks like a bot)
        "User-Agent": "Mozilla/5.0 (compatible; SmartEO-EEAT-Scanner/1.0; +https://webserv.io)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { html: "", ok: false, err: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { html, ok: true };
  } catch (err: any) {
    return { html: "", ok: false, err: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Regex patterns used multiple times. Hoisted so we don't rebuild per page.
const BYLINE_PATTERNS = [
  /\bby\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/i,
  /\bwritten\s+by\b/i,
  /\bauthor[:\s]/i,
];
const REVIEWED_BY_PATTERNS = [
  /\breviewed\s+by\b/i,
  /\bmedically\s+reviewed\s+by\b/i,
  /\bclinically\s+reviewed\s+by\b/i,
  /\bedited\s+by\b/i,
  /\bfact[-\s]?checked\s+by\b/i,
];
const LAST_REVIEWED_PATTERNS = [
  /\blast\s+reviewed\b/i,
  /\blast\s+updated\b/i,
  /\bupdated\s+on\b/i,
  /\breviewed\s+on\b/i,
  /\bpublished\s+on\b/i,
];
// Common medical / clinical / behavioral health credentials.
// Word-boundary on both sides so we don't catch "MDx" or "AMA" as MD.
const CREDENTIAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "MD", re: /\bM\.?D\.?\b/ },
  { label: "DO", re: /\bD\.?O\.?\b/ },
  { label: "PhD", re: /\bPh\.?D\.?\b/ },
  { label: "PsyD", re: /\bPsy\.?D\.?\b/ },
  { label: "LCSW", re: /\bL\.?C\.?S\.?W\.?\b/ },
  { label: "LMFT", re: /\bL\.?M\.?F\.?T\.?\b/ },
  { label: "LMHC", re: /\bL\.?M\.?H\.?C\.?\b/ },
  { label: "LPC", re: /\bL\.?P\.?C\.?\b/ },
  { label: "LADC", re: /\bL\.?A\.?D\.?C\.?\b/ },
  { label: "CADC", re: /\bC\.?A\.?D\.?C\.?\b/ },
  { label: "RN", re: /\bR\.?N\.?\b/ },
  { label: "NP", re: /\bN\.?P\.?\b(?!\s*[a-z])/ },     // avoid catching "Np" in random text
  { label: "PA", re: /\bP\.?A\.?\b(?!\s*[a-z])/ },
  { label: "MS", re: /\bM\.?S\.?\b(?!\s*[a-z])/ },
  { label: "MSW", re: /\bM\.?S\.?W\.?\b/ },
];

function parsePage(url: string, html: string): PageEeatSignals {
  const signals: PageEeatSignals = {
    url,
    fetchedOk: true,
    schemaTypes: [],
    hasOrganizationSchema: false,
    hasAuthorOrPersonSchema: false,
    hasReviewerInSchema: false,
    hasFaqSchema: false,
    hasMedicalSchema: false,
    hasArticleSchema: false,
    schemaBlockCount: 0,
    hasBylineText: false,
    hasReviewedByText: false,
    hasLastReviewedDate: false,
    credentialMentions: [],
    faqItemCount: 0,
    hasAuthorPhotos: false,
    externalCitationCount: 0,
    wordCount: 0,
    isShellPage: false,
  };

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch (err: any) {
    signals.fetchedOk = false;
    signals.fetchError = `Parse error: ${err.message}`;
    return signals;
  }

  // ── Schema (JSON-LD) detection ──
  $('script[type="application/ld+json"]').each((_, el) => {
    signals.schemaBlockCount++;
    const raw = $(el).contents().text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // skip malformed JSON-LD blocks
    }
    // JSON-LD can be a single object, an array, or have @graph
    const nodes: any[] = [];
    const enqueue = (n: any) => {
      if (!n) return;
      if (Array.isArray(n)) n.forEach(enqueue);
      else if (typeof n === "object") {
        nodes.push(n);
        if (n["@graph"]) enqueue(n["@graph"]);
      }
    };
    enqueue(parsed);
    for (const node of nodes) {
      const t = node["@type"];
      const types = Array.isArray(t) ? t : t ? [t] : [];
      for (const ty of types) {
        const tyStr = String(ty);
        if (!signals.schemaTypes.includes(tyStr)) signals.schemaTypes.push(tyStr);
        if (/Organization|LocalBusiness/i.test(tyStr)) signals.hasOrganizationSchema = true;
        if (/^Person$/i.test(tyStr) || /Author/i.test(tyStr)) signals.hasAuthorOrPersonSchema = true;
        if (/MedicalEntity|MedicalWebPage|MedicalCondition|Physician/i.test(tyStr)) signals.hasMedicalSchema = true;
        if (/^Article$|^NewsArticle$|^BlogPosting$/i.test(tyStr)) signals.hasArticleSchema = true;
        if (/^FAQPage$/i.test(tyStr)) {
          signals.hasFaqSchema = true;
          // Count mainEntity items
          const me = node.mainEntity;
          if (Array.isArray(me)) signals.faqItemCount += me.length;
          else if (me) signals.faqItemCount += 1;
        }
      }
      // Author / reviewer inside Article schema
      if (node.author || node.reviewedBy) signals.hasAuthorOrPersonSchema = true;
      if (node.reviewedBy || node.editor) signals.hasReviewerInSchema = true;
    }
  });

  // ── Body text scan ──
  // Strip script/style first so we don't pick up code as "credentials"
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  signals.wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  signals.isShellPage = bodyText.length < 200;

  // Byline patterns
  signals.hasBylineText = BYLINE_PATTERNS.some(re => re.test(bodyText));
  signals.hasReviewedByText = REVIEWED_BY_PATTERNS.some(re => re.test(bodyText));
  signals.hasLastReviewedDate = LAST_REVIEWED_PATTERNS.some(re => re.test(bodyText));

  // Credentials
  for (const { label, re } of CREDENTIAL_PATTERNS) {
    if (re.test(bodyText) && !signals.credentialMentions.includes(label)) {
      signals.credentialMentions.push(label);
    }
  }

  // FAQ count fallback — if no FAQ schema but page has H2/H3 followed by short answers
  if (signals.faqItemCount === 0) {
    // Heuristic: count <details> or `.faq` class instances or question-mark headings
    const detailsCount = $("details").length;
    const faqClassCount = $("[class*='faq'], [class*='FAQ']").length;
    const qHeadings = $("h2, h3, h4").filter((_, el) => /\?$/.test($(el).text().trim())).length;
    signals.faqItemCount = Math.max(detailsCount, Math.floor(faqClassCount / 2), qHeadings);
  }

  // Author photos — img inside common author/bio containers
  $("[class*='author'], [class*='bio'], [class*='staff'], [class*='team-member']").each((_, el) => {
    if ($(el).find("img").length > 0) signals.hasAuthorPhotos = true;
  });

  // External citations — count <a href> pointing off-domain inside article-ish containers
  try {
    const pageHost = new URL(url).host;
    $("article a[href], main a[href], [class*='content'] a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      try {
        const linkHost = new URL(href, url).host;
        if (linkHost && linkHost !== pageHost) signals.externalCitationCount++;
      } catch {
        // skip malformed hrefs
      }
    });
  } catch {
    // skip if URL parse fails
  }

  return signals;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export async function scanSiteForEeat(inputs: PageSelectionInputs): Promise<SiteEeatSummary> {
  const { client } = inputs;
  const urls = selectEeatPages(inputs);
  const monthKey = currentMonthKey();

  // Fetch (or read from cache) all selected pages in parallel
  const results = await Promise.all(
    urls.map(async (url) => {
      const key = cacheKey(client.id, url, monthKey);
      const cached = eeatCache.get(key);
      if (cached) return cached;

      const { html, ok, err } = await fetchHtml(url);
      if (!ok) {
        const failed: PageEeatSignals = {
          url,
          fetchedOk: false,
          fetchError: err,
          schemaTypes: [],
          hasOrganizationSchema: false,
          hasAuthorOrPersonSchema: false,
          hasReviewerInSchema: false,
          hasFaqSchema: false,
          hasMedicalSchema: false,
          hasArticleSchema: false,
          schemaBlockCount: 0,
          hasBylineText: false,
          hasReviewedByText: false,
          hasLastReviewedDate: false,
          credentialMentions: [],
          faqItemCount: 0,
          hasAuthorPhotos: false,
          externalCitationCount: 0,
          wordCount: 0,
          isShellPage: false,
        };
        // Don't cache failures — let them retry next run
        return failed;
      }
      const parsed = parsePage(url, html);
      eeatCache.set(key, parsed);
      return parsed;
    })
  );

  // Build the summary
  const okPages = results.filter(p => p.fetchedOk);
  const summary: SiteEeatSummary = {
    totalPagesScanned: okPages.length,
    pagesWithAuthorSchema: okPages.filter(p => p.hasAuthorOrPersonSchema).length,
    pagesWithReviewerInfo: okPages.filter(p => p.hasReviewerInSchema || p.hasReviewedByText).length,
    pagesWithFaqs: okPages.filter(p => p.hasFaqSchema || p.faqItemCount > 0).length,
    pagesWithLastReviewed: okPages.filter(p => p.hasLastReviewedDate).length,
    pagesWithBylines: okPages.filter(p => p.hasBylineText).length,
    shellPagesDetected: results.filter(p => p.isShellPage).length,
    pages: results,
    topGapsByCategory: [],
  };

  // Compute top gaps — categories where pages-without-the-signal is high
  const gapCategories: Array<{ category: string; missing: PageEeatSignals[] }> = [
    { category: "Missing author or reviewer schema", missing: okPages.filter(p => !p.hasAuthorOrPersonSchema && !p.hasReviewerInSchema) },
    { category: "No 'reviewed by' or 'medically reviewed' text", missing: okPages.filter(p => !p.hasReviewedByText) },
    { category: "Missing 'last reviewed' or 'last updated' date", missing: okPages.filter(p => !p.hasLastReviewedDate) },
    { category: "No FAQ schema or visible FAQs", missing: okPages.filter(p => !p.hasFaqSchema && p.faqItemCount === 0) },
    { category: "No external citations in content", missing: okPages.filter(p => p.externalCitationCount === 0) },
  ];
  summary.topGapsByCategory = gapCategories
    .filter(c => c.missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length)
    .slice(0, 4)
    .map(c => ({
      category: c.category,
      pagesAffected: c.missing.length,
      sampleUrls: c.missing.slice(0, 3).map(p => p.url),
    }));

  return summary;
}

// Used for testing / cache clearing if needed
export function clearEeatCache(): void {
  eeatCache.clear();
}
