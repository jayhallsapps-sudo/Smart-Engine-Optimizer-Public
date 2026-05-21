import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import type { ParsedPage, PageType } from "./types";

const UA = "Mozilla/5.0 (compatible; SmartEO-QBR/1.0; +https://smarteo.co)";

export interface CrawlOptions {
  baseUrl: string;
  maxUrls?: number;
  concurrency?: number;
  timeoutMs?: number;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

export interface CrawlResult {
  pages: ParsedPage[];
  urlStatusMap: Map<string, number>;
  redirectMap: Map<string, string>;
  errors: Array<{ url: string; error: string }>;
  durationMs: number;
}

async function fetchText(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  allowedBaseHostname?: string,
): Promise<{ text: string; status: number; finalUrl: string }> {
  // Pre-check resolved IPs for the requested URL
  const reqHostname = new URL(url).hostname.toLowerCase();
  if (await isResolvedHostPrivate(reqHostname)) {
    throw new Error(`Host ${reqHostname} resolves to a private/internal IP and is blocked`);
  }

  const resp = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const text = await resp.text();
  const finalUrl = resp.url;

  if (allowedBaseHostname && !isAllowedUrl(finalUrl, allowedBaseHostname)) {
    throw new Error(`Redirect target ${finalUrl} is not allowed for this crawl`);
  }

  // Post-check resolved IPs for the final URL after redirects
  const finalHostname = new URL(finalUrl).hostname.toLowerCase();
  if (await isResolvedHostPrivate(finalHostname)) {
    throw new Error(`Final host ${finalHostname} resolves to a private/internal IP and is blocked`);
  }

  return { text, status: resp.status, finalUrl };
}

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

async function fetchRobotsSitemapUrls(baseUrl: string, baseHostname: string): Promise<string[]> {
  try {
    if (!isAllowedUrl(`${baseUrl}/robots.txt`, baseHostname)) return [];
    const { text } = await fetchText(`${baseUrl}/robots.txt`, 5000, undefined, baseHostname);
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

function getBaseHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isPrivateIp(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "localhost") return true;
    if (/^127\./.test(hostname)) return true;
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    if (/^::1$/.test(hostname)) return true;
    if (/^fc00:/.test(hostname)) return true;
    if (/^fd00:/.test(hostname)) return true;
    if (/^fe80:/.test(hostname)) return true;
    return false;
  } catch {
    return true; // reject unparseable
  }
}

function isAllowedUrl(url: string, baseHostname: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isPrivateIp(url)) return false;
    return u.hostname.toLowerCase() === baseHostname;
  } catch {
    return false;
  }
}

function isResolvedIpPrivate(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^0\./.test(ip) || /^::ffff:0\./.test(ip)) return true;
  if (/^fc00:/i.test(ip) || /^fd00:/i.test(ip) || /^fe80:/i.test(ip)) return true;
  if (/^::ffff:127\./.test(ip)) return true;
  if (/^::ffff:10\./.test(ip)) return true;
  if (/^::ffff:192\.168\./.test(ip)) return true;
  return false;
}

async function isResolvedHostPrivate(hostname: string): Promise<boolean> {
  try {
    const { address } = await lookup(hostname);
    if (isResolvedIpPrivate(address)) return true;
    return false;
  } catch {
    return true; // DNS failure treated as blocked
  }
}

async function discoverSitemapUrls(baseUrl: string, maxUrls: number): Promise<string[]> {
  const collected: string[] = [];
  const baseHostname = getBaseHostname(baseUrl);
  if (!baseHostname) return [];

  let sitemapUrls = await fetchRobotsSitemapUrls(baseUrl, baseHostname);
  sitemapUrls = sitemapUrls.filter(u => isAllowedUrl(u, baseHostname));

  if (sitemapUrls.length === 0) {
    for (const candidate of [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`, `${baseUrl}/wp-sitemap.xml`]) {
      if (!isAllowedUrl(candidate, baseHostname)) continue;
      try {
        await fetchText(candidate, 4000, undefined, baseHostname);
        sitemapUrls = [candidate];
        break;
      } catch {
        // continue
      }
    }
  }

  for (const sitemapUrl of sitemapUrls.slice(0, 5)) {
    if (!isAllowedUrl(sitemapUrl, baseHostname)) continue;
    try {
      const { text: xml } = await fetchText(sitemapUrl, 8000, undefined, baseHostname);
      const { isSitemapIndex, locs } = parseSitemapLocs(xml);
      if (isSitemapIndex) {
        const childSitemaps = locs.filter(l => !/image|news|video/i.test(l) && isAllowedUrl(l, baseHostname)).slice(0, 10);
        await Promise.allSettled(
          childSitemaps.map(async (childUrl) => {
            try {
              const { text: childXml } = await fetchText(childUrl, 8000, undefined, baseHostname);
              const { locs: childLocs } = parseSitemapLocs(childXml);
              collected.push(...childLocs.filter(u => isAllowedUrl(u, baseHostname)).slice(0, 200));
            } catch {
              // ignore
            }
          }),
        );
      } else {
        collected.push(...locs.filter(u => isAllowedUrl(u, baseHostname)));
      }
    } catch {
      // ignore
    }
    if (collected.length >= maxUrls) break;
  }

  return Array.from(new Set(collected)).slice(0, maxUrls);
}

function isSameDomain(url1: string, url2: string): boolean {
  try {
    return new URL(url1).hostname === new URL(url2).hostname;
  } catch {
    return false;
  }
}

function parsePage(url: string, html: string, status: number): ParsedPage {
  const $ = cheerio.load(html);
  const path = new URL(url).pathname || "/";

  const title = $("title").text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || null;
  const noindex = /noindex/i.test($('meta[name="robots"]').attr("content") ?? "");

  const h1s: string[] = [];
  const headings: Array<{ level: number; text: string }> = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    $(`h${lvl}`).each((_i, el) => {
      const text = $(el).text().trim();
      if (text) {
        headings.push({ level: lvl, text });
        if (lvl === 1) h1s.push(text);
      }
    });
  }

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, url).href;
      if (isSameDomain(abs, url)) {
        internalLinks.push(abs);
      } else {
        externalLinks.push(abs);
      }
    } catch {
      // ignore
    }
  });

  const images: Array<{ src: string; alt: string | null }> = [];
  $("img").each((_i, el) => {
    const src = $(el).attr("src");
    if (src) {
      images.push({ src: new URL(src, url).href, alt: $(el).attr("alt")?.trim() ?? null });
    }
  });

  const jsonLdBlocks: any[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const text = $(el).text().trim();
      if (text) jsonLdBlocks.push(JSON.parse(text));
    } catch {
      // ignore malformed JSON-LD
    }
  });

  const faqDetected = headings.some(h => /faq/i.test(h.text)) || jsonLdBlocks.some(b => b["@type"] === "FAQPage");
  const tldrDetected = headings.some(h => /^tl;?dr$/i.test(h.text.trim()));
  const keyTakeawaysDetected = headings.some(h => /^(the )?key takeaways?$/i.test(h.text.trim()));

  // introInternalLink: first paragraph after H1 (before next H2) contains an internal <a>
  let introInternalLink = false;
  const h1Els = $("h1");
  if (h1Els.length > 0) {
    const firstH1 = h1Els.first()[0];
    const allEls = $("body *").toArray();
    const h1Index = allEls.indexOf(firstH1);
    if (h1Index >= 0) {
      for (let i = h1Index + 1; i < allEls.length; i++) {
        const el = allEls[i];
        if (el.tagName.toLowerCase() === "h2") break;
        if (el.tagName.toLowerCase() === "p") {
          const pHtml = $(el).html() ?? "";
          if (/<a\s/i.test(pHtml)) {
            // Check if the link is internal
            const hrefMatch = pHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
            if (hrefMatch) {
              try {
                const abs = new URL(hrefMatch[1], url).href;
                if (isSameDomain(abs, url)) {
                  introInternalLink = true;
                  break;
                }
              } catch {
                // ignore
              }
            }
          }
        }
      }
    }
  }

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  return {
    url,
    path,
    status,
    html,
    title,
    metaDescription,
    canonical,
    noindex,
    h1s,
    headings,
    internalLinks: Array.from(new Set(internalLinks)),
    externalLinks: Array.from(new Set(externalLinks)),
    images,
    jsonLdBlocks,
    faqDetected,
    tldrDetected,
    keyTakeawaysDetected,
    introInternalLink,
    bodyText,
    wordCount,
    pageType: "general",
    fetchedAt: new Date().toISOString(),
  };
}

export async function crawlFullCorpus(opts: CrawlOptions): Promise<CrawlResult> {
  const t0 = Date.now();
  const maxUrls = opts.maxUrls ?? 1000;
  const concurrency = opts.concurrency ?? 8;
  const timeoutMs = opts.timeoutMs ?? 10000;

  const baseHostname = getBaseHostname(opts.baseUrl);
  if (!baseHostname) {
    return { pages: [], urlStatusMap: new Map(), redirectMap: new Map(), errors: [], durationMs: 0 };
  }
  if (!isAllowedUrl(opts.baseUrl, baseHostname)) {
    return { pages: [], urlStatusMap: new Map(), redirectMap: new Map(), errors: [], durationMs: 0 };
  }
  if (await isResolvedHostPrivate(baseHostname)) {
    return { pages: [], urlStatusMap: new Map(), redirectMap: new Map(), errors: [], durationMs: 0 };
  }

  const rawUrls = await discoverSitemapUrls(opts.baseUrl, maxUrls);
  const urls = Array.from(new Set(rawUrls)).slice(0, maxUrls);
  if (rawUrls.length > maxUrls) {
    console.warn(`[QCR Crawler] Sitemap had ${rawUrls.length} URLs, capped to ${maxUrls}`);
  }

  const pages: ParsedPage[] = [];
  const urlStatusMap = new Map<string, number>();
  const redirectMap = new Map<string, string>();
  const errors: Array<{ url: string; error: string }> = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    if (opts.signal?.aborted) break;
    const batch = urls.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const { text, status, finalUrl } = await fetchText(url, timeoutMs, opts.signal, baseHostname);
          urlStatusMap.set(url, status);
          if (finalUrl !== url) redirectMap.set(url, finalUrl);
          if (status === 200) {
            return parsePage(url, text, status);
          }
          return {
            url,
            path: new URL(url).pathname || "/",
            status,
            html: "",
            title: null,
            metaDescription: null,
            canonical: null,
            noindex: false,
            h1s: [],
            headings: [],
            internalLinks: [],
            externalLinks: [],
            images: [],
            jsonLdBlocks: [],
            faqDetected: false,
            tldrDetected: false,
            keyTakeawaysDetected: false,
            introInternalLink: false,
            bodyText: "",
            wordCount: 0,
            pageType: "general" as PageType,
            fetchedAt: new Date().toISOString(),
            fetchError: `HTTP ${status}`,
          };
        } catch (err: any) {
          errors.push({ url, error: err?.message ?? String(err) });
          urlStatusMap.set(url, 0);
          return {
            url,
            path: new URL(url).pathname || "/",
            status: 0,
            html: "",
            title: null,
            metaDescription: null,
            canonical: null,
            noindex: false,
            h1s: [],
            headings: [],
            internalLinks: [],
            externalLinks: [],
            images: [],
            jsonLdBlocks: [],
            faqDetected: false,
            tldrDetected: false,
            keyTakeawaysDetected: false,
            introInternalLink: false,
            bodyText: "",
            wordCount: 0,
            pageType: "general" as PageType,
            fetchedAt: new Date().toISOString(),
            fetchError: err?.message ?? String(err),
          };
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        pages.push(r.value);
      }
    }
    opts.onProgress?.(Math.min(i + batch.length, urls.length), urls.length);
  }

  return {
    pages,
    urlStatusMap,
    redirectMap,
    errors,
    durationMs: Date.now() - t0,
  };
}
