/**
 * liveCrawler.ts — Live website crawler for QBS report generation.
 *
 * Implements the source hierarchy mandated by the QBS spec:
 *   1. Live website + sitemap  = primary truth for site structure / page inventory
 *   2. GA4 + call tracking     = primary truth for conversions
 *   3. GSC                     = primary truth for organic demand / visibility
 *   4. Screaming Frog          = technical audit context only
 *
 * The crawler discovers ALL pages on a site (not just a fixed slug list) by:
 *   - Reading the live homepage HTML → nav + footer links
 *   - Reading robots.txt → sitemap URLs
 *   - Reading sitemap.xml → complete page inventory
 *   - Fetching individual pages → title + H1 for content-based classification
 */

const UA = "Mozilla/5.0 (compatible; SmartEO-QBR/1.0; +https://smarteo.co)";
const MAX_PAGES_TO_INSPECT = 40;   // max pages to fetch title/H1 for
const BATCH_SIZE = 8;              // concurrent page fetches
const PAGE_TIMEOUT_MS = 5000;
const SITEMAP_TIMEOUT_MS = 8000;
const MAX_SITEMAP_URLS = 500;

// ── Types ────────────────────────────────────────────────────────────────────

export type PageCategory =
  | "detox"
  | "residential"
  | "php-iop"
  | "outpatient"
  | "dual-diagnosis"
  | "contact-admissions"
  | "verify-insurance"
  | "primary-location"
  | "about"
  | "team"
  | "alumni"
  | "blog"
  | "homepage"
  | "other";

export interface LivePage {
  url: string;
  path: string;
  title: string;
  h1: string;
  category: PageCategory;
  inNav: boolean;
  inFooter: boolean;
  inSitemap: boolean;
  inspected: boolean;
}

export interface NavAccessibility {
  vobInNav: boolean;
  vobInFooter: boolean;
  contactInNav: boolean;
  contactInFooter: boolean;
  dataAvailable: boolean;
}

export interface LivePageInventory {
  domain: string;
  baseUrl: string;
  pages: LivePage[];
  bestByCategory: Partial<Record<PageCategory, LivePage>>;
  pathSet: Set<string>;
  navPaths: Set<string>;
  footerPaths: Set<string>;
  sitemapPaths: Set<string>;
  navAccessibility: NavAccessibility;
  crawlComplete: boolean;
  crawledAt: string;
}

// ── Classification rules ─────────────────────────────────────────────────────
// Each rule scores a page: title match = 3, h1 match = 3, slug match = 1.
// Category with highest score (minimum 2) wins.

interface CategoryRule {
  category: PageCategory;
  titleRe: RegExp;
  h1Re: RegExp;
  slugRe: RegExp;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "detox",
    titleRe: /detox(?:ification)?|medical[\s-]detox|alcohol[\s-]detox|drug[\s-]detox|withdrawal management|detox program/i,
    h1Re:    /detox(?:ification)?|medical[\s-]detox|withdrawal management/i,
    slugRe:  /\/detox(?:ification)?/i,
  },
  {
    category: "residential",
    titleRe: /residential[\s-]treatment|inpatient[\s-](?:rehab|treatment|program)|long[\s-]term[\s-](?:rehab|treatment)/i,
    h1Re:    /residential[\s-]treatment|inpatient(?:[\s-]treatment)?|long[\s-]term(?:[\s-]treatment)?/i,
    slugRe:  /\/residential|\/inpatient|\/long[\s-]term/i,
  },
  {
    category: "php-iop",
    titleRe: /partial[\s-]hospitalization|intensive[\s-]outpatient|day[\s-]treatment|\bphp\b|\biop\b/i,
    h1Re:    /partial[\s-]hospitalization|intensive[\s-]outpatient|\bphp\b|\biop\b/i,
    slugRe:  /\/php(?!p)|\/iop\b|\/partial[\s-]?hosp|\/intensive[\s-]?out|\/day[\s-]?treat/i,
  },
  {
    category: "outpatient",
    // Must not match intensive outpatient (which is php-iop) — use negative lookahead
    titleRe: /\boutpatient(?:\s+treatment|\s+program|\s+services?|\s+care)?\b(?!.*intensive)/i,
    h1Re:    /\boutpatient(?!\s*(?:intensive|iop|php))/i,
    slugRe:  /\/outpatient(?!.*intensive)/i,
  },
  {
    category: "dual-diagnosis",
    titleRe: /dual[\s-]diagnosis|co[\s-]occurring/i,
    h1Re:    /dual[\s-]diagnosis|co[\s-]occurring/i,
    slugRe:  /\/dual[\s-]?diag|\/co[\s-]?occurring/i,
  },
  {
    category: "verify-insurance",
    titleRe: /verify[\s-]insurance|insurance[\s-]verification|check[\s-](?:your\s+)?insurance|using insurance|does.*insurance|pay for rehab|insurance coverage|\bvob\b/i,
    h1Re:    /verify[\s-]insurance|insurance[\s-]verification|\bvob\b|insurance coverage/i,
    slugRe:  /\/verify[\s-]?insur|\/vob\b|\/insurance[\s-]?verif|\/check[\s-]?insur|\/insurance\b/i,
  },
  {
    category: "contact-admissions",
    titleRe: /contact\s+us|(?:our\s+)?admissions|get[\s-]help|start[\s-]treatment|reach[\s-]out|\bintake\b|speak[\s-]with/i,
    h1Re:    /contact\s+us|(?:our\s+)?admissions|get[\s-]help|start[\s-]treatment/i,
    slugRe:  /\/contact(?!.*insur)|\/admissions(?!.*insurance)|\/get[\s-]?help|\/intake\b|\/reach[\s-]?out/i,
  },
  {
    category: "primary-location",
    titleRe: /our\s+(?:location|campus|facility)|address.*map|directions?\s+to\b/i,
    h1Re:    /our\s+(?:location|campus|facility)|where\s+(?:we\s+are|to\s+find)/i,
    slugRe:  /\/(?:our[\s-]?)?(?:location|campus|facility)\b(?!\w)/i,
  },
  {
    category: "about",
    titleRe: /about\s+us|our\s+story|who\s+we\s+are|our\s+mission|our\s+approach|about\s+our\s+program/i,
    h1Re:    /about\s+us|our\s+story|who\s+we\s+are|our\s+mission/i,
    slugRe:  /\/about(?:[\s-]us)?(?:[^a-z]|$)/i,
  },
  {
    category: "team",
    titleRe: /(?:our\s+)?(?:team|staff)|meet\s+(?:the|our)\s+(?:team|staff|doctors)|(?:our\s+)?providers|clinical\s+team/i,
    h1Re:    /(?:our\s+)?(?:team|staff)|meet\s+(?:the|our)|providers\b/i,
    slugRe:  /\/(?:our[\s-]?)?(?:team|staff|providers|leadership)\b/i,
  },
  {
    category: "alumni",
    titleRe: /alumni(?:\s+program)?|aftercare\s+program/i,
    h1Re:    /alumni|aftercare/i,
    slugRe:  /\/alumni|\/aftercare/i,
  },
  {
    category: "blog",
    titleRe: /\b(?:blog|resources?|news|articles?|learning\s+center|resource\s+hub)\b/i,
    h1Re:    /\b(?:blog|resources?|news|articles?)\b/i,
    slugRe:  /\/(?:blog|resources?|news|articles?)\b/i,
  },
];

// ── HTML extraction utilities ────────────────────────────────────────────────

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]).trim().slice(0, 200) : "";
}

function extractH1(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripTags(m[1]).trim().slice(0, 200) : "";
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

/**
 * Extract hrefs from nav and header blocks.
 * Falls back to any element with class/id containing "nav" or "menu".
 */
function extractNavHrefs(html: string): string[] {
  const blocks: string[] = [];
  // <nav> blocks
  const navRe = /<nav[\s>][^]*?<\/nav>/gi;
  let m: RegExpExecArray | null;
  while ((m = navRe.exec(html)) !== null) blocks.push(m[0]);
  // <header> blocks
  const headerRe = /<header[\s>][^]*?<\/header>/gi;
  while ((m = headerRe.exec(html)) !== null) blocks.push(m[0]);
  // Div/ul with nav/menu class (common in WordPress themes)
  const menuRe = /<(?:ul|div)[^>]+class=["'][^"']*\b(?:nav|menu|navigation)[^"']*["'][^>]*>[^]*?<\/(?:ul|div)>/gi;
  while ((m = menuRe.exec(html)) !== null) blocks.push(m[0]);
  return blocks.flatMap(extractHrefs);
}

function extractFooterHrefs(html: string): string[] {
  const blocks: string[] = [];
  const footerRe = /<footer[\s>][^]*?<\/footer>/gi;
  let m: RegExpExecArray | null;
  while ((m = footerRe.exec(html)) !== null) blocks.push(m[0]);
  return blocks.flatMap(extractHrefs);
}

/**
 * Normalize a raw href to an absolute internal path.
 * Returns null if the href is external, an anchor, or non-page (image/pdf/etc).
 */
function normalizeHref(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(href, baseUrl);
    // Must be same domain
    if (resolved.hostname !== base.hostname) return null;
    const path = resolved.pathname.replace(/\/$/, "") || "/";
    // Skip non-page resources
    if (/\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|css|js|woff|woff2|ttf|xml|json|txt)$/i.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

// ── Sitemap utilities ────────────────────────────────────────────────────────

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

/** Parse all <loc> entries from a sitemap or sitemap index XML. */
function parseSitemapLocs(xml: string): { isSitemapIndex: boolean; locs: string[] } {
  const isSitemapIndex = /<sitemapindex/i.test(xml);
  const locs: string[] = [];
  const re = /<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return { isSitemapIndex, locs };
}

/** Read robots.txt and extract Sitemap: directives. */
async function fetchRobotsSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const text = await fetchText(`${baseUrl}/robots.txt`, 5000);
    const urls: string[] = [];
    for (const line of text.split("\n")) {
      const m = line.match(/^Sitemap:\s*(https?:\/\/\S+)/i);
      if (m) urls.push(m[1].trim());
    }
    return urls;
  } catch {
    return [];
  }
}

/**
 * Fetch the complete sitemap URL inventory.
 * Handles sitemap index by fetching child sitemaps (1 level deep).
 */
async function fetchAllSitemapUrls(baseUrl: string): Promise<string[]> {
  const collected: string[] = [];

  // Step 1: find sitemap URL(s)
  let sitemapUrls = await fetchRobotsSitemapUrls(baseUrl);
  if (sitemapUrls.length === 0) {
    // Fallback: try common locations
    for (const candidate of [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`, `${baseUrl}/wp-sitemap.xml`]) {
      try {
        await fetchText(candidate, 4000);
        sitemapUrls = [candidate];
        break;
      } catch {
        // continue
      }
    }
  }

  // Step 2: fetch and parse each sitemap
  for (const sitemapUrl of sitemapUrls.slice(0, 5)) {
    try {
      const xml = await fetchText(sitemapUrl, SITEMAP_TIMEOUT_MS);
      const { isSitemapIndex, locs } = parseSitemapLocs(xml);
      if (isSitemapIndex) {
        // Fetch child sitemaps (page sitemaps, not image/news sitemaps)
        const childSitemaps = locs.filter(l => !/image|news|video/i.test(l)).slice(0, 10);
        await Promise.allSettled(childSitemaps.map(async (childUrl) => {
          try {
            const childXml = await fetchText(childUrl, SITEMAP_TIMEOUT_MS);
            const { locs: childLocs } = parseSitemapLocs(childXml);
            collected.push(...childLocs.slice(0, 200));
          } catch {
            // ignore individual child failures
          }
        }));
      } else {
        collected.push(...locs);
      }
    } catch {
      // ignore sitemap fetch failure
    }
    if (collected.length >= MAX_SITEMAP_URLS) break;
  }

  return collected.slice(0, MAX_SITEMAP_URLS);
}

// ── Page classification ──────────────────────────────────────────────────────

function classifyPage(title: string, h1: string, path: string): PageCategory {
  if (path === "/" || path === "") return "homepage";

  let bestCategory: PageCategory = "other";
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    if (rule.titleRe.test(title)) score += 3;
    if (rule.h1Re.test(h1)) score += 3;
    if (rule.slugRe.test(path)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  // Require minimum score of 2 to classify (prevents slug-only false positives)
  return bestScore >= 2 ? bestCategory : "other";
}

/** Score a page within its category — higher = better representative. */
function scoreCategoryMatch(page: LivePage, rule: CategoryRule): number {
  let score = 0;
  if (rule.titleRe.test(page.title)) score += 3;
  if (rule.h1Re.test(page.h1)) score += 3;
  if (rule.slugRe.test(page.path)) score += 1;
  if (page.inNav) score += 2;   // nav presence is a strong quality signal
  if (page.inSitemap) score += 1;
  return score;
}

// ── Page URL filtering ───────────────────────────────────────────────────────

const ASSET_RE = /\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|css|js|woff|woff2|ttf|xml|json|txt|rss)(?:[?#]|$)/i;
const CDN_RE = /(?:static\.|cdn\.|assets\.|media\.|img\.|images?\.)/i;
const WP_ADMIN_RE = /\/wp-(?:admin|includes|json|login|content\/plugins|content\/themes)(?:\/|$)/i;

function isPageUrl(url: string, baseDomain: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== baseDomain && !u.hostname.endsWith(`.${baseDomain}`)) return false;
    if (CDN_RE.test(u.hostname)) return false;
    const path = u.pathname;
    if (ASSET_RE.test(path)) return false;
    if (WP_ADMIN_RE.test(path)) return false;
    if (/\?.*\bfeed=rss/.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Prioritize candidate URLs for inspection.
 * Pages likely to be LOC or utility pages come first.
 */
const LOC_SLUG_RE = /detox|residential|inpatient|php|iop|partial|outpatient|dual.?diag|co.?occurring|insurance|verify|vob|contact|admissions|get.?help|intake|alumni|aftercare/i;

function prioritizeForInspection(paths: string[]): string[] {
  const high: string[] = [];
  const mid: string[] = [];
  const low: string[] = [];
  for (const p of paths) {
    if (LOC_SLUG_RE.test(p)) high.push(p);
    else if (/\/(?:about|team|staff|location|campus|therapies?|modalities)/.test(p)) mid.push(p);
    else low.push(p);
  }
  return [...high, ...mid, ...low];
}

// ── Main crawl function ──────────────────────────────────────────────────────

function emptyInventory(baseUrl: string, domain: string): LivePageInventory {
  return {
    domain,
    baseUrl,
    pages: [],
    bestByCategory: {},
    pathSet: new Set(),
    navPaths: new Set(),
    footerPaths: new Set(),
    sitemapPaths: new Set(),
    navAccessibility: { vobInNav: false, vobInFooter: false, contactInNav: false, contactInFooter: false, dataAvailable: false },
    crawlComplete: false,
    crawledAt: new Date().toISOString(),
  };
}

/**
 * Crawl a live website to build a comprehensive page inventory.
 *
 * Steps:
 *  1. Fetch homepage → extract nav/footer links + title/H1
 *  2. Fetch robots.txt → find sitemap URLs
 *  3. Fetch sitemap → collect all page URLs
 *  4. Inspect up to MAX_PAGES_TO_INSPECT candidate pages (title + H1)
 *  5. Classify each page using content signals
 *  6. Return LivePageInventory shared across all report sections
 */
export async function crawlSite(baseUrl: string): Promise<LivePageInventory> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  let domain: string;
  try {
    domain = new URL(cleanBase.startsWith("http") ? cleanBase : `https://${cleanBase}`).hostname;
  } catch {
    console.warn(`[LiveCrawler] Invalid baseUrl: ${baseUrl}`);
    return emptyInventory(baseUrl, "");
  }

  // Ensure baseUrl starts with https://
  const httpsBase = cleanBase.startsWith("http") ? cleanBase : `https://${cleanBase}`;
  const inv = emptyInventory(httpsBase, domain);

  try {
    // ── Step 1: Fetch homepage ───────────────────────────────────────────────
    let homepageHtml = "";
    try {
      const homepageResp = await fetch(httpsBase, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (homepageResp.ok) {
        homepageHtml = await homepageResp.text();
        console.log(`[LiveCrawler] Homepage fetched: ${homepageHtml.length} chars`);
      }
    } catch (e: any) {
      console.warn(`[LiveCrawler] Homepage fetch failed: ${e.message}`);
    }

    // Extract nav / footer hrefs from homepage
    const rawNavHrefs = extractNavHrefs(homepageHtml);
    const rawFooterHrefs = extractFooterHrefs(homepageHtml);

    for (const href of rawNavHrefs) {
      const path = normalizeHref(href, httpsBase);
      if (path && path !== "/") inv.navPaths.add(path);
    }
    for (const href of rawFooterHrefs) {
      const path = normalizeHref(href, httpsBase);
      if (path && path !== "/") inv.footerPaths.add(path);
    }

    console.log(`[LiveCrawler] Nav paths discovered: ${inv.navPaths.size}, footer paths: ${inv.footerPaths.size}`);

    // ── Step 2: Fetch sitemap ────────────────────────────────────────────────
    const [sitemapUrls] = await Promise.allSettled([fetchAllSitemapUrls(httpsBase)]);
    const rawSitemapUrls = sitemapUrls.status === "fulfilled" ? sitemapUrls.value : [];
    for (const url of rawSitemapUrls) {
      if (isPageUrl(url, domain)) {
        try {
          const path = new URL(url).pathname.replace(/\/$/, "") || "/";
          if (path !== "/") inv.sitemapPaths.add(path);
        } catch { }
      }
    }
    console.log(`[LiveCrawler] Sitemap paths discovered: ${inv.sitemapPaths.size}`);

    // ── Step 3: Build candidate URL set ─────────────────────────────────────
    // Union of nav + footer + sitemap, deduplicated
    const candidatePathSet = new Set<string>([
      ...inv.navPaths,
      ...inv.footerPaths,
      ...inv.sitemapPaths,
    ]);
    const candidatePaths = prioritizeForInspection([...candidatePathSet]);

    // ── Step 4: Inspect top candidate pages ─────────────────────────────────
    const toInspect = candidatePaths.slice(0, MAX_PAGES_TO_INSPECT);
    const inspectedPages: LivePage[] = [];

    // Also add homepage as a page
    const homepageTitle = extractTitle(homepageHtml);
    const homepageH1 = extractH1(homepageHtml);
    inspectedPages.push({
      url: httpsBase,
      path: "/",
      title: homepageTitle,
      h1: homepageH1,
      category: "homepage",
      inNav: false,
      inFooter: false,
      inSitemap: inv.sitemapPaths.has("/"),
      inspected: !!homepageHtml,
    });

    // Batch-fetch pages
    const FETCH_BATCH = BATCH_SIZE;
    const allInspected: Array<{ path: string; title: string; h1: string } | null> = [];

    for (let i = 0; i < toInspect.length; i += FETCH_BATCH) {
      const batch = toInspect.slice(i, i + FETCH_BATCH);
      const results = await Promise.allSettled(
        batch.map(async (path) => {
          const url = `${httpsBase}${path}`;
          try {
            const resp = await fetch(url, {
              headers: { "User-Agent": UA },
              signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
              redirect: "follow",
            });
            if (!resp.ok) return null;
            const html = await resp.text();
            return { path, title: extractTitle(html), h1: extractH1(html) };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) {
        allInspected.push(r.status === "fulfilled" ? r.value : null);
      }
      if (i + FETCH_BATCH < toInspect.length) {
        await new Promise(res => setTimeout(res, 100));
      }
    }

    // Build LivePage objects for inspected pages
    toInspect.forEach((path, idx) => {
      const result = allInspected[idx];
      const inspected = result !== null;
      const title = result?.title ?? "";
      const h1 = result?.h1 ?? "";
      const category = classifyPage(title, h1, path);
      inspectedPages.push({
        url: `${httpsBase}${path}`,
        path,
        title,
        h1,
        category,
        inNav: inv.navPaths.has(path),
        inFooter: inv.footerPaths.has(path),
        inSitemap: inv.sitemapPaths.has(path),
        inspected,
      });
    });

    // For sitemap paths NOT in the inspect list, add slug-classified entries
    const inspectedPathSet = new Set(inspectedPages.map(p => p.path));
    for (const path of inv.sitemapPaths) {
      if (inspectedPathSet.has(path)) continue;
      const category = classifyPage("", "", path);  // slug-only, lower confidence
      inspectedPages.push({
        url: `${httpsBase}${path}`,
        path,
        title: "",
        h1: "",
        category,
        inNav: inv.navPaths.has(path),
        inFooter: inv.footerPaths.has(path),
        inSitemap: true,
        inspected: false,
      });
    }

    inv.pages = inspectedPages;

    // ── Step 5: Build pathSet ────────────────────────────────────────────────
    // Only inspected pages (status 200) go into pathSet — slug-only entries are weaker
    for (const p of inspectedPages) {
      if (p.inspected || p.path === "/") {
        inv.pathSet.add(p.path);
      }
    }
    // Also add all sitemap paths (they are declared as indexable by the site)
    for (const p of inv.sitemapPaths) {
      inv.pathSet.add(p);
    }

    // ── Step 6: Build bestByCategory ────────────────────────────────────────
    const byCategory = new Map<PageCategory, LivePage[]>();
    for (const page of inspectedPages) {
      if (page.category === "other" || page.category === "homepage") continue;
      const arr = byCategory.get(page.category) ?? [];
      arr.push(page);
      byCategory.set(page.category, arr);
    }

    for (const [cat, pages] of byCategory) {
      const rule = CATEGORY_RULES.find(r => r.category === cat);
      if (!rule) {
        inv.bestByCategory[cat] = pages[0];
        continue;
      }
      // Pick the page with the highest category match score
      const sorted = pages.slice().sort((a, b) => scoreCategoryMatch(b, rule) - scoreCategoryMatch(a, rule));
      inv.bestByCategory[cat] = sorted[0];
    }

    // ── Step 7: NavAccessibility from discovered nav/footer paths ─────────────
    const VOB_RE = /verify.?insur|\/vob\b|\/insurance.?verif|\/check.?insur|\/insurance\b/i;
    const CONTACT_RE = /\/contact(?!.*insur)|\/admissions|\/get.?help|\/intake\b|\/reach/i;

    inv.navAccessibility = {
      vobInNav:      [...inv.navPaths].some(p => VOB_RE.test(p)),
      vobInFooter:   [...inv.footerPaths].some(p => VOB_RE.test(p)),
      contactInNav:  [...inv.navPaths].some(p => CONTACT_RE.test(p)),
      contactInFooter: [...inv.footerPaths].some(p => CONTACT_RE.test(p)),
      dataAvailable: !!homepageHtml,
    };

    inv.crawlComplete = true;
    console.log(`[LiveCrawler] Complete. Pages: ${inv.pages.length}, pathSet: ${inv.pathSet.size}, bestByCategory keys: ${Object.keys(inv.bestByCategory).join(", ")}`);

  } catch (e: any) {
    console.warn(`[LiveCrawler] Fatal crawl error: ${e.message}`);
  }

  return inv;
}
