import { storage } from "./storage";
import { getGoogleAccessToken } from "./googleToken";
import { decrypt } from "./encryption";
import type { Client } from "@shared/schema";

export type PastQuarter =
  | "Q1" | "Q2" | "Q3" | "Q4"
  | "Q1_TODATE" | "Q2_TODATE" | "Q3_TODATE" | "Q4_TODATE";
export type FutureQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface QbrPrepInput {
  clientId: number;
  pastQuarter: PastQuarter;
  futureQuarter: FutureQuarter;
  includeContent: boolean;
  includeTechnical: boolean;
  includeLocal: boolean;
  includeCro: boolean;
  includeAuthority: boolean;
  includeTracking: boolean;
  opportunityCapPerCategory: number;
  timezone: string;
}

export interface Opportunity {
  opportunity_title: string;
  priority: "P0" | "P1" | "P2";
  impact: "High" | "Med" | "Low";
  effort: "S" | "M" | "L";
  kpi_affected: string;
  urls: string[];
  evidence: string;
  problem: string;
  opportunity: string;
  why_it_matters: string;
  recommended_next_step: string;
}

export interface OpportunityCategory {
  category_name: string;
  opportunities: Opportunity[];
}

export interface Win {
  title: string;
  evidence: string;
  source: string;
}

export interface TopOpportunity {
  title: string;
  category: string;
  priority: string;
  impact: string;
  kpi: string;
}

export interface QbrPrepJson {
  report_title: string;
  client_name: string;
  past_window_label: string;
  past_start: string;
  past_end: string;
  future_window_label: string;
  generated_at: string;
  executive_summary: {
    wins: Win[];
    top_opportunities: TopOpportunity[];
  };
  opportunity_backlog: OpportunityCategory[];
}

export interface QbrPrepOutput {
  json: QbrPrepJson;
  markdown: string;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function quarterBounds(q: number, year: number): { start: Date; end: Date } {
  const starts = [0, 3, 6, 9];
  const ends   = [2, 5, 8, 11];
  const lastDays = [31, 30, 30, 31];
  const m = starts[q - 1];
  const em = ends[q - 1];
  return {
    start: new Date(year, m, 1),
    end:   new Date(year, em, lastDays[q - 1]),
  };
}

function computeWindow(pastQuarter: PastQuarter, timezone: string): {
  pastStart: string;
  pastEnd: string;
  pastWindowLabel: string;
} {
  const isToDate = pastQuarter.endsWith("_TODATE");
  const qNum = parseInt(pastQuarter.replace("_TODATE", "").replace("Q", "")) as 1 | 2 | 3 | 4;

  const nowLocal = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone || "America/Los_Angeles" })
  );
  const currentYear = nowLocal.getFullYear();
  const currentMonth = nowLocal.getMonth() + 1;
  const currentQNum = Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4;

  if (isToDate) {
    const bounds = quarterBounds(qNum, currentYear);
    const pastStart = fmt(bounds.start);
    const pastEnd = fmt(nowLocal);
    return {
      pastStart,
      pastEnd,
      pastWindowLabel: `Q${qNum} ${currentYear} (To Date: ${pastEnd})`,
    };
  }

  let year = currentYear;
  const { start, end } = quarterBounds(qNum, currentYear);
  if (nowLocal <= end) {
    year = currentYear - 1;
  }

  const bounds = quarterBounds(qNum, year);
  return {
    pastStart: fmt(bounds.start),
    pastEnd: fmt(bounds.end),
    pastWindowLabel: `Q${qNum} ${year}`,
  };
}

async function gscFetch(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 50,
  filters?: any[]
): Promise<any[]> {
  const body: any = { startDate, endDate, dimensions, rowLimit };
  if (filters) body.dimensionFilterGroups = [{ filters }];
  try {
    const resp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) return [];
    return data.rows ?? [];
  } catch {
    return [];
  }
}

async function ga4Fetch(
  accessToken: string,
  propertyId: string,
  body: any
): Promise<any> {
  try {
    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function organicFilter() {
  return {
    filter: {
      fieldName: "sessionDefaultChannelGrouping",
      stringFilter: { value: "Organic Search", matchType: "EXACT" },
    },
  };
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return n / d;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 1 : 0;
  return (curr - prev) / prev;
}

function fmtPctChange(curr: number, prev: number): string {
  const ch = pctChange(curr, prev);
  const sign = ch >= 0 ? "+" : "";
  return `${sign}${(ch * 100).toFixed(1)}%`;
}

function scoreOpps(opps: Opportunity[]): Opportunity[] {
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const impactOrder = { High: 0, Med: 1, Low: 2 };
  return opps.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}

export async function generateQbrPrep(input: QbrPrepInput): Promise<QbrPrepOutput> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const { pastStart, pastEnd, pastWindowLabel } = computeWindow(input.pastQuarter, input.timezone || client.timezone || "America/Los_Angeles");
  const futureLabel = `Q${input.futureQuarter.replace("Q", "")}`;
  const cap = input.opportunityCapPerCategory;

  const [gscToken, ga4Token] = await Promise.all([
    getGoogleAccessToken("google_search_console"),
    getGoogleAccessToken("google_analytics_4"),
  ]);

  const gscAvailable = !!(gscToken && client.gscSiteUrl);
  const ga4Available = !!(ga4Token && client.ga4PropertyId);

  const sfReports = await storage.getSfReports(client.id).catch(() => []);
  const sfAvailable = sfReports.length > 0;

  const callrailCreds = await storage.getApiCredentialsByService("callrail").catch(() => []);
  const ctmCreds = await storage.getApiCredentialsByService("ctm").catch(() => []);
  const callTrackingAvailable = !!(callrailCreds.length && client.callrailCompanyId) || !!(ctmCreds.length && (client as any).ctmAccountId);

  const allCategories: OpportunityCategory[] = [];
  const allWins: Win[] = [];

  let gscPageRows: any[] = [];
  let gscQueryRows: any[] = [];
  let ga4LandingRows: any[] = [];
  let ga4Funnel: { sessions: number; conversions: number } | null = null;
  let ga4DeviceRows: any[] = [];
  let sfData: Record<string, any>[] = [];
  let sfHeaders: string[] = [];

  if (gscAvailable) {
    [gscPageRows, gscQueryRows] = await Promise.all([
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["page"], 50),
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["query"], 50),
    ]);
  }

  if (ga4Available) {
    const [landingData, funnelData, deviceData] = await Promise.all([
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [
          { name: "sessions" },
          { name: "conversions" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
        ],
        dimensionFilter: organicFilter(),
        limit: 50,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }, { name: "deviceCategory" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 100,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
    ]);

    if (landingData?.rows) {
      ga4LandingRows = landingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
        avgDuration: parseFloat(r.metricValues?.[2]?.value ?? "0"),
        engagementRate: parseFloat(r.metricValues?.[3]?.value ?? "0"),
      }));
    }

    if (funnelData?.rows?.length) {
      const mv = funnelData.rows[0].metricValues ?? [];
      ga4Funnel = {
        sessions: parseFloat(mv[0]?.value ?? "0"),
        conversions: parseFloat(mv[1]?.value ?? "0"),
      };
    }

    if (deviceData?.rows) {
      ga4DeviceRows = deviceData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        device: r.dimensionValues?.[1]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
      }));
    }
  }

  if (sfAvailable) {
    const latest = sfReports[0];
    sfHeaders = latest.headers ?? [];
    sfData = (latest.data ?? []) as Record<string, any>[];
  }

  const siteCvr = ga4Funnel && ga4Funnel.sessions > 0
    ? ga4Funnel.conversions / ga4Funnel.sessions
    : null;

  const totalGscClicks = gscPageRows.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const totalGscImpressions = gscPageRows.reduce((s: number, r: any) => s + (r.impressions ?? 0), 0);
  const medianCtr = totalGscImpressions > 0 ? totalGscClicks / totalGscImpressions : 0.03;
  const medianImpressions = gscPageRows.length > 0
    ? gscPageRows.map((r: any) => r.impressions ?? 0).sort((a: number, b: number) => a - b)[Math.floor(gscPageRows.length / 2)]
    : 0;

  if (input.includeContent) {
    const contentOpps: Opportunity[] = [];

    if (gscAvailable && gscPageRows.length > 0) {
      const highImpLowCtr = gscPageRows
        .filter((r: any) => (r.impressions ?? 0) > medianImpressions && (r.ctr ?? 0) < medianCtr)
        .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, 5);

      for (const row of highImpLowCtr) {
        const page = row.keys?.[0] ?? "Unknown";
        const pos = row.position ?? 0;
        const ctrPct = ((row.ctr ?? 0) * 100).toFixed(2);
        const imp = Math.round(row.impressions ?? 0).toLocaleString();
        const clicks = Math.round(row.clicks ?? 0).toLocaleString();
        const isTop20 = ga4LandingRows.slice(0, 20).some((l: any) => l.page && page.includes(l.page));
        const priority: Opportunity["priority"] = pos <= 10 && (row.impressions ?? 0) > medianImpressions * 2 ? "P1" : "P2";
        const impact: Opportunity["impact"] = isTop20 ? "High" : (row.impressions ?? 0) > medianImpressions * 1.5 ? "Med" : "Low";
        contentOpps.push({
          opportunity_title: `Improve CTR: ${page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          priority,
          impact,
          effort: "S",
          kpi_affected: "CTR, Rankings",
          urls: [page],
          evidence: `GSC: ${imp} impressions, ${clicks} clicks, CTR ${ctrPct}% (site median ${(medianCtr * 100).toFixed(2)}%), avg position ${pos.toFixed(1)}`,
          problem: `Page has above-median impressions but CTR is below site median (${ctrPct}% vs ${(medianCtr * 100).toFixed(2)}%), leaving clicks on the table.`,
          opportunity: "Rewrite title tag and meta description to better match search intent. Add FAQ or TL;DR section. Adjust H2 structure to align with top queries.",
          why_it_matters: "Improving CTR from current level toward site median could materially lift organic clicks without any ranking change.",
          recommended_next_step: "Pull top 5 queries for this page from GSC, rewrite title/meta to incorporate primary query at start, A/B test via GSC.",
        });
      }

      const strikingDistance = gscPageRows
        .filter((r: any) => {
          const pos = r.position ?? 100;
          return pos >= 4 && pos <= 15 && (r.impressions ?? 0) > 100;
        })
        .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, 4);

      for (const row of strikingDistance) {
        const page = row.keys?.[0] ?? "Unknown";
        const pos = (row.position ?? 0).toFixed(1);
        const imp = Math.round(row.impressions ?? 0).toLocaleString();
        const clicks = Math.round(row.clicks ?? 0).toLocaleString();
        const posNum = row.position ?? 10;
        const priority: Opportunity["priority"] = posNum <= 8 ? "P1" : "P2";
        const impact: Opportunity["impact"] = (row.impressions ?? 0) > medianImpressions * 2 ? "High" : "Med";
        contentOpps.push({
          opportunity_title: `Striking Distance: ${page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          priority,
          impact,
          effort: "M",
          kpi_affected: "Rankings, CTR",
          urls: [page],
          evidence: `GSC: avg position ${pos}, ${imp} impressions, ${clicks} clicks`,
          problem: `Page is ranked ${pos} — within reach of top 3 but not capitalizing on high impression volume.`,
          opportunity: "Refresh content to expand intent coverage, add internal links from high-authority pages, improve H2 structure and content depth.",
          why_it_matters: "Moving from position 4–15 to top 3 typically yields 2–5x more clicks for the same impression count.",
          recommended_next_step: "Identify query clusters this page ranks for, expand content to cover secondary intents, add 3–5 internal links from relevant pages.",
        });
      }
    }

    if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
      const highTrafficLowCvr = ga4LandingRows
        .slice(0, 20)
        .filter((r: any) => r.sessions > 50 && pct(r.conversions, r.sessions) < siteCvr * 0.7)
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 3);

      for (const row of highTrafficLowCvr) {
        const pageCvr = pct(row.conversions, row.sessions);
        const isTop = ga4LandingRows.indexOf(row) < 5;
        contentOpps.push({
          opportunity_title: `High Traffic, Low CVR: ${row.page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          priority: isTop ? "P1" : "P2",
          impact: isTop ? "High" : "Med",
          effort: "M",
          kpi_affected: "Forms, Calls",
          urls: [row.page],
          evidence: `GA4: ${Math.round(row.sessions).toLocaleString()} organic sessions, CVR ${(pageCvr * 100).toFixed(2)}% vs site avg ${(siteCvr * 100).toFixed(2)}%`,
          problem: `Page drives significant organic traffic but converts at ${(pageCvr * 100).toFixed(2)}%, well below the site average of ${(siteCvr * 100).toFixed(2)}%.`,
          opportunity: "Improve CTA placement, add trust elements, review content-to-intent alignment, test form placement and messaging.",
          why_it_matters: "Closing the CVR gap to site average on a high-traffic page can meaningfully increase lead volume without additional traffic.",
          recommended_next_step: "Run a heatmap/session recording audit; rewrite CTA copy; ensure primary CTA is above the fold.",
        });
      }
    }

    if (contentOpps.length === 0 && !gscAvailable && !ga4Available) {
      contentOpps.push({
        opportunity_title: "GSC / GA4 Data Not Available",
        priority: "P2",
        impact: "Low",
        effort: "S",
        kpi_affected: "Tracking Integrity",
        urls: [],
        evidence: "Not available — GSC and GA4 integrations not connected.",
        problem: "No GSC or GA4 data is available for this client to identify content opportunities.",
        opportunity: "Connect GSC and GA4 to enable automated opportunity detection.",
        why_it_matters: "Without search and analytics data, content prioritization is based on guesswork.",
        recommended_next_step: "Connect Google Search Console and GA4 in the Setup → Analytics & Search section.",
      });
    }

    allCategories.push({
      category_name: "Content Opportunities",
      opportunities: scoreOpps(contentOpps).slice(0, cap),
    });
  }

  if (input.includeTechnical) {
    const techOpps: Opportunity[] = [];

    if (sfAvailable) {
      const urlCol = sfHeaders.find(h => ["Address", "URL", "address", "url"].includes(h)) ?? sfHeaders[0];
      const statusCol = sfHeaders.find(h => ["Status Code", "Status code", "status_code", "Status"].includes(h));
      const indexCol = sfHeaders.find(h => ["Indexability", "indexability"].includes(h));
      const titleCol = sfHeaders.find(h => ["Title 1", "Title", "title", "Page Title"].includes(h));
      const h1Col = sfHeaders.find(h => ["H1-1", "H1", "h1"].includes(h));
      const inlinksCol = sfHeaders.find(h => ["Inlinks", "inlinks", "Internal Inlinks"].includes(h));
      const depthCol = sfHeaders.find(h => ["Crawl Depth", "crawl_depth", "Depth"].includes(h));
      const canonicalCol = sfHeaders.find(h => ["Canonical Link Element 1", "canonical", "Canonical"].includes(h));

      const errors4xx = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 400 && Number(r[statusCol]) < 500) : [];
      const redirects3xx = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 300 && Number(r[statusCol]) < 400) : [];
      const notIndexable = indexCol ? sfData.filter(r => r[indexCol] && String(r[indexCol]).toLowerCase() !== "indexable") : [];
      const missingTitle = titleCol ? sfData.filter(r => !r[titleCol] || String(r[titleCol]).trim() === "") : [];
      const missingH1 = h1Col ? sfData.filter(r => !r[h1Col] || String(r[h1Col]).trim() === "") : [];
      const lowInlinks = inlinksCol ? sfData.filter(r => Number(r[inlinksCol] ?? 0) <= 1 && r[urlCol]) : [];
      const deepPages = depthCol ? sfData.filter(r => Number(r[depthCol] ?? 0) >= 4 && r[urlCol]) : [];

      if (errors4xx.length > 0) {
        const sample = errors4xx.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        techOpps.push({
          opportunity_title: `Fix ${errors4xx.length} 4xx Error URLs`,
          priority: "P0",
          impact: errors4xx.length > 10 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Indexation, Rankings",
          urls: sample,
          evidence: `Screaming Frog: ${errors4xx.length} URLs returning 4xx status codes`,
          problem: `${errors4xx.length} pages are returning 4xx errors, causing crawl budget waste and potential ranking loss if linked pages are affected.`,
          opportunity: "Fix or redirect all 4xx URLs, update internal links pointing to them, and resubmit sitemap.",
          why_it_matters: "4xx errors prevent Googlebot from crawling content and can cause link equity loss from internal links.",
          recommended_next_step: `Audit all ${errors4xx.length} 4xx URLs; redirect to relevant live pages or remove internal links.`,
        });
      }

      if (notIndexable.length > 0) {
        const sample = notIndexable.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        const isHighImpact = notIndexable.length > sfData.length * 0.1;
        techOpps.push({
          opportunity_title: `Review ${notIndexable.length} Non-Indexable URLs`,
          priority: notIndexable.length > 5 ? "P0" : "P1",
          impact: isHighImpact ? "High" : "Med",
          effort: "M",
          kpi_affected: "Indexation",
          urls: sample,
          evidence: `Screaming Frog: ${notIndexable.length} non-indexable URLs (${((notIndexable.length / sfData.length) * 100).toFixed(1)}% of crawl)`,
          problem: `${notIndexable.length} URLs are marked non-indexable (noindex, canonicalized to another URL, or blocked by robots). Verify this is intentional for key pages.`,
          opportunity: "Audit non-indexable URLs — confirm intentional exclusions are correct; fix any money pages accidentally excluded.",
          why_it_matters: "Accidentally blocking key money pages from indexation directly suppresses organic visibility and lead generation.",
          recommended_next_step: "Filter non-indexable URLs to isolate money pages/service pages; remove any accidental noindex directives.",
        });
      }

      if (missingTitle.length > 0) {
        const sample = missingTitle.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        techOpps.push({
          opportunity_title: `Add/Fix ${missingTitle.length} Missing Title Tags`,
          priority: missingTitle.length > 3 ? "P1" : "P2",
          impact: missingTitle.length > 10 ? "High" : "Med",
          effort: "S",
          kpi_affected: "CTR, Rankings",
          urls: sample,
          evidence: `Screaming Frog: ${missingTitle.length} URLs missing title tags`,
          problem: `${missingTitle.length} pages have no title tag, causing Google to generate its own (often sub-optimal) titles.`,
          opportunity: "Write keyword-targeted title tags for all affected pages following the pattern: Primary Keyword – Secondary Keyword | Brand.",
          why_it_matters: "Title tags directly influence SERP CTR. Pages without titles often have lower click-through rates.",
          recommended_next_step: "Prioritize missing titles on service/landing pages; write unique titles incorporating primary query intent.",
        });
      }

      if (missingH1.length > 0) {
        const sample = missingH1.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        techOpps.push({
          opportunity_title: `Fix ${missingH1.length} Missing H1 Tags`,
          priority: "P2",
          impact: missingH1.length > 10 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "Rankings",
          urls: sample,
          evidence: `Screaming Frog: ${missingH1.length} URLs missing H1 tags`,
          problem: `${missingH1.length} pages lack an H1 heading, weakening on-page relevance signals for target queries.`,
          opportunity: "Add a single, keyword-aligned H1 to each affected page.",
          why_it_matters: "H1 tags reinforce keyword relevance signals for Googlebot and improve content structure for users.",
          recommended_next_step: "Add unique H1 tags to all service/landing pages; ensure H1 aligns with the page's primary target query.",
        });
      }

      if (lowInlinks.length > 0) {
        const sample = lowInlinks.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        techOpps.push({
          opportunity_title: `Internal Linking: ${lowInlinks.length} Pages with ≤1 Inlink`,
          priority: "P1",
          impact: lowInlinks.length > 20 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Rankings, Indexation",
          urls: sample,
          evidence: `Screaming Frog: ${lowInlinks.length} pages with 0 or 1 internal inlinks`,
          problem: `${lowInlinks.length} pages have virtually no internal links pointing to them, making them difficult for Googlebot to discover and reducing their authority.`,
          opportunity: "Build a targeted internal linking plan — add contextual links from high-authority hub pages to under-linked service/location pages.",
          why_it_matters: "Internal links distribute PageRank and help Googlebot discover and value pages. Orphan/near-orphan pages rank poorly.",
          recommended_next_step: "Identify which low-inlink pages are priority (service/location pages); add 3+ internal links from relevant existing content.",
        });
      }

      if (deepPages.length > 0) {
        const sample = deepPages.slice(0, 5).map(r => String(r[urlCol] ?? "")).filter(Boolean);
        techOpps.push({
          opportunity_title: `${deepPages.length} Pages at Crawl Depth ≥4`,
          priority: "P2",
          impact: deepPages.length > 30 ? "Med" : "Low",
          effort: "M",
          kpi_affected: "Indexation, Rankings",
          urls: sample,
          evidence: `Screaming Frog: ${deepPages.length} pages at crawl depth 4 or greater`,
          problem: "Pages buried deep in the site structure receive less crawl budget allocation and rank less effectively.",
          opportunity: "Flatten site architecture by adding navigation links, breadcrumbs, or sitemap entries for key deep pages.",
          why_it_matters: "Googlebot crawls shallower pages more frequently. Key pages at depth 4+ may be crawled infrequently.",
          recommended_next_step: "Add priority deep pages to the main navigation or sitemap; create category hub pages to reduce depth.",
        });
      }
    } else {
      techOpps.push({
        opportunity_title: "Screaming Frog Data Not Available",
        priority: "P1",
        impact: "Med",
        effort: "S",
        kpi_affected: "Indexation",
        urls: [],
        evidence: "Not available — no Screaming Frog import found for this client.",
        problem: "Without a crawl import, technical SEO issues (4xx errors, non-indexable pages, missing metadata) cannot be automatically identified.",
        opportunity: "Upload a Screaming Frog crawl export to enable automated technical opportunity detection.",
        why_it_matters: "Technical issues blocking indexation or reducing crawl efficiency can suppress rankings sitewide.",
        recommended_next_step: "Run a Screaming Frog crawl of the domain and upload the CSV export in Setup → Screaming Frog.",
      });
    }

    allCategories.push({
      category_name: "Technical SEO Opportunities",
      opportunities: scoreOpps(techOpps).slice(0, cap),
    });
  }

  if (input.includeLocal) {
    const localOpps: Opportunity[] = [];

    if (!callTrackingAvailable) {
      localOpps.push({
        opportunity_title: "Call Tracking Data Not Available",
        priority: "P1",
        impact: "Med",
        effort: "S",
        kpi_affected: "Calls, GBP Actions",
        urls: [],
        evidence: "Not available — no call tracking integration connected.",
        problem: "Without call tracking, GBP call attribution and call volume trends cannot be measured or optimized.",
        opportunity: "Connect CallRail or CTM to enable GBP call attribution and lead tracking.",
        why_it_matters: "For local businesses, phone calls are a primary lead source; GBP call attribution is essential for Local SEO ROI measurement.",
        recommended_next_step: "Set up CallRail or CTM with a GBP-specific tracking number; connect in Setup.",
      });
    }

    localOpps.push({
      opportunity_title: "GBP Posts Cadence Review",
      priority: "P2",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "GBP API not connected — assess manually via Google Business dashboard.",
      problem: "Inconsistent GBP post cadence reduces profile freshness signals and engagement.",
      opportunity: "Establish a weekly GBP posting schedule (offers, updates, service highlights). Use seasonal and event-based angles.",
      why_it_matters: "Active GBP profiles with regular posts show higher engagement and can improve local pack visibility.",
      recommended_next_step: "Schedule at least 1 GBP post per week for the next quarter; create a 13-post content calendar.",
    });

    localOpps.push({
      opportunity_title: "Review Generation and Response Workflow",
      priority: "P1",
      impact: "Med",
      effort: "M",
      kpi_affected: "GBP Actions, Rankings",
      urls: [],
      evidence: "Review velocity and response rate assessment — check GBP dashboard manually.",
      problem: "Slow review velocity or low response rate to reviews reduces local trust signals and risks losing position in the local pack.",
      opportunity: "Implement a post-service review request workflow (SMS or email). Respond to all reviews within 24–48 hours.",
      why_it_matters: "Review count, velocity, and response rate are well-established local ranking signals and conversion trust factors.",
      recommended_next_step: "Set up an automated review request sequence via CRM or service software; create response templates for common review types.",
    });

    localOpps.push({
      opportunity_title: "GBP Profile Completeness Audit",
      priority: "P2",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "Manual check required — verify services, products, attributes, Q&A, and photos in GBP dashboard.",
      problem: "Incomplete GBP profiles (missing services, attributes, photos) underperform in local search relative to fully optimized competitors.",
      opportunity: "Complete all GBP sections: services with descriptions, attributes (women-led, accessible, etc.), 20+ photos, Q&A seeded with common questions.",
      why_it_matters: "GBP completeness directly correlates with local pack ranking and conversion rate from the profile.",
      recommended_next_step: "Run a GBP completeness checklist; add missing services/attributes; upload 10+ new photos.",
    });

    allCategories.push({
      category_name: "Local / GBP Opportunities",
      opportunities: scoreOpps(localOpps).slice(0, cap),
    });
  }

  if (input.includeCro) {
    const croOpps: Opportunity[] = [];

    if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
      const deviceMap = new Map<string, { mobile: { s: number; c: number }; desktop: { s: number; c: number } }>();
      for (const row of ga4DeviceRows) {
        const key = row.page;
        if (!deviceMap.has(key)) deviceMap.set(key, { mobile: { s: 0, c: 0 }, desktop: { s: 0, c: 0 } });
        const entry = deviceMap.get(key)!;
        if (row.device === "mobile") { entry.mobile.s += row.sessions; entry.mobile.c += row.conversions; }
        if (row.device === "desktop") { entry.desktop.s += row.sessions; entry.desktop.c += row.conversions; }
      }

      const mobileCvrGaps: Array<{ page: string; mobileCvr: number; desktopCvr: number; mobileSessions: number }> = [];
      for (const [page, data] of deviceMap.entries()) {
        const mobileCvr = pct(data.mobile.c, data.mobile.s);
        const desktopCvr = pct(data.desktop.c, data.desktop.s);
        if (data.mobile.s > 20 && desktopCvr > 0 && mobileCvr < desktopCvr * 0.6) {
          mobileCvrGaps.push({ page, mobileCvr, desktopCvr, mobileSessions: data.mobile.s });
        }
      }
      mobileCvrGaps.sort((a, b) => b.mobileSessions - a.mobileSessions);

      for (const gap of mobileCvrGaps.slice(0, 3)) {
        const isTop = ga4LandingRows.slice(0, 5).some((l: any) => l.page === gap.page);
        croOpps.push({
          opportunity_title: `Mobile CRO Gap: ${gap.page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          priority: isTop ? "P0" : "P1",
          impact: isTop ? "High" : "Med",
          effort: "M",
          kpi_affected: "Calls, Forms",
          urls: [gap.page],
          evidence: `GA4: Mobile CVR ${(gap.mobileCvr * 100).toFixed(2)}% vs Desktop CVR ${(gap.desktopCvr * 100).toFixed(2)}% (${Math.round(gap.mobileSessions).toLocaleString()} mobile sessions)`,
          problem: `Mobile converts at ${(gap.mobileCvr * 100).toFixed(2)}% — ${((1 - gap.mobileCvr / gap.desktopCvr) * 100).toFixed(0)}% lower than desktop on this page.`,
          opportunity: "Improve mobile CTA visibility (sticky CTA bar, tap-to-call button), reduce form fields on mobile, ensure CTAs are above the fold on all viewports.",
          why_it_matters: "With majority traffic on mobile for most service businesses, even small mobile CVR improvements drive significant lead volume.",
          recommended_next_step: "Test page on 5 real mobile devices; add sticky click-to-call button; reduce form to 3 fields max on mobile.",
        });
      }

      const highEngageLowConvert = ga4LandingRows
        .filter((r: any) => r.engagementRate > 0.7 && r.sessions > 30 && pct(r.conversions, r.sessions) < siteCvr * 0.5)
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 2);

      for (const row of highEngageLowConvert) {
        const pageCvr = pct(row.conversions, row.sessions);
        croOpps.push({
          opportunity_title: `High Engagement, Low Conversion: ${row.page.replace(/^https?:\/\/[^/]+/, "") || "/"}`,
          priority: "P1",
          impact: row.sessions > 200 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Calls, Forms",
          urls: [row.page],
          evidence: `GA4: ${(row.engagementRate * 100).toFixed(0)}% engagement rate, ${Math.round(row.sessions).toLocaleString()} sessions, CVR ${(pageCvr * 100).toFixed(2)}%`,
          problem: "Visitors are engaged (reading content) but not converting — suggests strong content but weak CTAs or friction in the conversion path.",
          opportunity: "Add a conversion-focused element mid-content (inline CTA, sticky sidebar form, trust block), improve urgency/social proof near the CTA.",
          why_it_matters: "High engagement means the content is attracting the right audience; the conversion gap represents recoverable leads.",
          recommended_next_step: "Insert an inline CTA after the 2nd or 3rd content section; add 3 customer testimonials near the form.",
        });
      }
    }

    if (!ga4Available) {
      croOpps.push({
        opportunity_title: "GA4 Data Not Available for CRO Analysis",
        priority: "P1",
        impact: "Med",
        effort: "S",
        kpi_affected: "Forms, Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — GA4 integration not connected.",
        problem: "Without GA4 data, landing page CVR, device split, and engagement patterns cannot be analyzed for CRO opportunities.",
        opportunity: "Connect GA4 to enable automated CRO opportunity detection.",
        why_it_matters: "CRO improvements on high-traffic organic pages directly increase lead volume from existing traffic.",
        recommended_next_step: "Connect GA4 in Setup → Analytics & Search.",
      });
    }

    allCategories.push({
      category_name: "CRO / Conversion Opportunities",
      opportunities: scoreOpps(croOpps).slice(0, cap),
    });
  }

  if (input.includeAuthority) {
    allCategories.push({
      category_name: "Authority / Links Opportunities",
      opportunities: [{
        opportunity_title: "Authority Data Not Available",
        priority: "P2",
        impact: "Low",
        effort: "S",
        kpi_affected: "Rankings",
        urls: [],
        evidence: "Not available — Ahrefs or SEMrush authority/backlink data not connected via integration.",
        problem: "No backlink or domain authority data is available to identify link opportunities.",
        opportunity: "Connect Ahrefs or SEMrush to enable authority analysis.",
        why_it_matters: "Backlink analysis is essential for identifying pages that need link support and for discovering link-building opportunities.",
        recommended_next_step: "Connect Ahrefs or SEMrush in Setup to unlock authority and backlink opportunity detection.",
      }],
    });
  }

  if (input.includeTracking) {
    const trackingOpps: Opportunity[] = [];

    if (ga4Available && ga4Funnel) {
      if (ga4Funnel.conversions === 0) {
        trackingOpps.push({
          opportunity_title: "Zero GA4 Conversions Detected — Verify Event Configuration",
          priority: "P0",
          impact: "High",
          effort: "M",
          kpi_affected: "Tracking Integrity, Forms",
          urls: [],
          evidence: `GA4: 0 conversion events recorded for ${pastStart} to ${pastEnd}`,
          problem: "No GA4 conversion events are firing in the analysis window. This may indicate missing or broken conversion event setup.",
          opportunity: "Audit GA4 conversion events — verify form submissions, click events, and thank-you page triggers are correctly configured.",
          why_it_matters: "If conversions are not tracked, all CVR analysis and PPC/SEO ROI measurement is invalid.",
          recommended_next_step: "Use GA4 DebugView to test form submissions; verify conversion events are marked as conversions in GA4 Admin.",
        });
      }
    }

    if (!ga4Available && !gscAvailable) {
      trackingOpps.push({
        opportunity_title: "No Analytics Connections — Full Tracking Audit Required",
        priority: "P0",
        impact: "High",
        effort: "L",
        kpi_affected: "Tracking Integrity",
        urls: [],
        evidence: "Not available — neither GSC nor GA4 are connected in SmartEO.",
        problem: "No analytics data sources are connected, preventing any data-driven analysis or opportunity identification.",
        opportunity: "Connect GSC and GA4 at minimum to enable organic performance tracking.",
        why_it_matters: "Without analytics, SEO performance is unverifiable and ROI cannot be demonstrated.",
        recommended_next_step: "Connect Google Search Console and GA4 in Setup → Analytics & Search as first priority.",
      });
    }

    if (gscAvailable && ga4Available) {
      trackingOpps.push({
        opportunity_title: "Verify GSC–GA4 Organic Traffic Alignment",
        priority: "P2",
        impact: "Med",
        effort: "S",
        kpi_affected: "Tracking Integrity",
        urls: [],
        evidence: `GSC: ${totalGscClicks.toLocaleString()} clicks | GA4 organic sessions: ${ga4Funnel ? Math.round(ga4Funnel.sessions).toLocaleString() : "Not available"}`,
        problem: "GSC click counts and GA4 organic sessions often diverge significantly. Discrepancies above 20% suggest tracking gaps (missing analytics on some pages, bot traffic, or attribution issues).",
        opportunity: "Compare GSC clicks to GA4 organic sessions. If divergence >20%, audit missing GA4 tag deployments and bot filtering.",
        why_it_matters: "Accurate attribution is critical for proving SEO ROI and correctly diagnosing lead source performance.",
        recommended_next_step: "Export GSC clicks and GA4 organic sessions for the quarter; flag pages with GSC clicks but zero GA4 sessions.",
      });
    }

    if (!callTrackingAvailable) {
      trackingOpps.push({
        opportunity_title: "Implement Call Tracking for Organic Attribution",
        priority: "P1",
        impact: "High",
        effort: "M",
        kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — no call tracking integration connected.",
        problem: "Without call tracking, organic-sourced phone leads are invisible in reporting and cannot be attributed to specific pages or campaigns.",
        opportunity: "Implement CallRail or CTM with organic-specific tracking numbers and GBP call forwarding.",
        why_it_matters: "For service businesses, calls are often the primary lead type. Without tracking, organic SEO's true lead contribution is undercounted.",
        recommended_next_step: "Set up a CallRail account, configure an organic tracking pool, and set up GBP call forwarding to a tracking number.",
      });
    }

    allCategories.push({
      category_name: "Tracking / Measurement Opportunities",
      opportunities: scoreOpps(trackingOpps).slice(0, cap),
    });
  }

  const wins: Win[] = [];

  if (gscAvailable && gscPageRows.length > 0) {
    const topCtrPage = gscPageRows
      .filter((r: any) => (r.impressions ?? 0) > 100)
      .sort((a: any, b: any) => (b.clicks ?? 0) - (a.clicks ?? 0))[0];
    if (topCtrPage) {
      const page = (topCtrPage.keys?.[0] ?? "").replace(/^https?:\/\/[^/]+/, "") || "/";
      wins.push({
        title: `Top GSC Performer: ${page} — ${Math.round(topCtrPage.clicks ?? 0).toLocaleString()} clicks`,
        evidence: `GSC: ${Math.round(topCtrPage.impressions ?? 0).toLocaleString()} impressions, CTR ${((topCtrPage.ctr ?? 0) * 100).toFixed(1)}%, avg position ${(topCtrPage.position ?? 0).toFixed(1)}`,
        source: "GSC",
      });
    }
  }

  if (ga4Available && ga4LandingRows.length > 0) {
    const topConvPage = ga4LandingRows
      .sort((a: any, b: any) => b.conversions - a.conversions)[0];
    if (topConvPage && topConvPage.conversions > 0) {
      const page = topConvPage.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      const cvr = pct(topConvPage.conversions, topConvPage.sessions);
      wins.push({
        title: `Top Conversion Page: ${page} — ${Math.round(topConvPage.conversions).toLocaleString()} conversions`,
        evidence: `GA4: ${Math.round(topConvPage.sessions).toLocaleString()} organic sessions, CVR ${(cvr * 100).toFixed(2)}%`,
        source: "GA4",
      });
    }
  }

  if (sfAvailable && sfData.length > 0) {
    const urlCol = sfHeaders.find(h => ["Address", "URL", "address", "url"].includes(h)) ?? sfHeaders[0];
    const statusCol = sfHeaders.find(h => ["Status Code", "Status code", "status_code", "Status"].includes(h));
    const errCount = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 400).length : 0;
    const totalCount = sfData.length;
    wins.push({
      title: `Site Crawled: ${totalCount.toLocaleString()} URLs — ${errCount} Errors Found`,
      evidence: `Screaming Frog: ${totalCount.toLocaleString()} URLs crawled, ${errCount} 4xx errors, ${totalCount - errCount} healthy`,
      source: "Screaming Frog",
    });
  }

  while (wins.length < 3) {
    wins.push({
      title: wins.length === 0 ? "Analytics Data Not Sufficient for Win Detection" : "Additional Wins to Be Identified Manually",
      evidence: "Connect GSC, GA4, and call tracking to enable automated win detection.",
      source: "N/A",
    });
  }

  const allOpps: Array<Opportunity & { category: string }> = allCategories.flatMap(cat =>
    cat.opportunities.map(o => ({ ...o, category: cat.category_name }))
  );
  const topPriorityOpps = allOpps
    .filter(o => o.priority === "P0" || o.priority === "P1")
    .sort((a, b) => {
      const po = { P0: 0, P1: 1, P2: 2 };
      const io = { High: 0, Med: 1, Low: 2 };
      const pd = po[a.priority] - po[b.priority];
      if (pd !== 0) return pd;
      return io[a.impact] - io[b.impact];
    });

  const seenCategories = new Set<string>();
  const topOpps: TopOpportunity[] = [];
  for (const o of topPriorityOpps) {
    if (topOpps.length >= 5) break;
    if (!seenCategories.has(o.category) || topOpps.length < 3) {
      seenCategories.add(o.category);
      topOpps.push({
        title: o.opportunity_title,
        category: o.category,
        priority: o.priority,
        impact: o.impact,
        kpi: o.kpi_affected,
      });
    }
  }
  while (topOpps.length < 5 && allOpps.length > topOpps.length) {
    const next = allOpps[topOpps.length];
    if (next) {
      topOpps.push({ title: next.opportunity_title, category: next.category, priority: next.priority, impact: next.impact, kpi: next.kpi_affected });
    } else break;
  }

  const json: QbrPrepJson = {
    report_title: `QBR Prep – ${client.name} – ${pastWindowLabel} → Plan for ${futureLabel}`,
    client_name: client.name,
    past_window_label: pastWindowLabel,
    past_start: pastStart,
    past_end: pastEnd,
    future_window_label: futureLabel,
    generated_at: new Date().toISOString(),
    executive_summary: {
      wins: wins.slice(0, 3),
      top_opportunities: topOpps.slice(0, 5),
    },
    opportunity_backlog: allCategories,
  };

  const markdown = buildMarkdown(json);

  return { json, markdown };
}

function buildMarkdown(j: QbrPrepJson): string {
  const lines: string[] = [];

  lines.push(`# ${j.report_title}`);
  lines.push(`**Generated:** ${new Date(j.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`);
  lines.push(`**Analysis Window:** ${j.past_window_label} (${j.past_start} → ${j.past_end})`);
  lines.push(`**Planning Horizon:** ${j.future_window_label}`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`### Top Wins — ${j.past_window_label}`);
  for (const win of j.executive_summary.wins) {
    lines.push(`- **${win.title}**`);
    lines.push(`  - *Evidence (${win.source}):* ${win.evidence}`);
  }
  lines.push("");
  lines.push(`### Top Opportunities for ${j.future_window_label}`);
  for (const opp of j.executive_summary.top_opportunities) {
    lines.push(`- **[${opp.priority} / ${opp.impact}] ${opp.title}** *(${opp.category})* — KPI: ${opp.kpi}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Opportunity Backlog");
  lines.push("");

  const catLetters = ["A", "B", "C", "D", "E", "F"];
  for (let ci = 0; ci < j.opportunity_backlog.length; ci++) {
    const cat = j.opportunity_backlog[ci];
    const letter = catLetters[ci] ?? String(ci + 1);
    lines.push(`### ${letter}. ${cat.category_name}`);
    lines.push("");

    if (cat.opportunities.length === 0) {
      lines.push("*No opportunities identified for this category.*");
      lines.push("");
      continue;
    }

    for (let oi = 0; oi < cat.opportunities.length; oi++) {
      const o = cat.opportunities[oi];
      lines.push(`**${oi + 1}. ${o.opportunity_title}**`);
      lines.push("");
      lines.push(`- **Priority:** ${o.priority}`);
      lines.push(`- **Impact:** ${o.impact}`);
      lines.push(`- **Effort:** ${o.effort}`);
      lines.push(`- **KPI Affected:** ${o.kpi_affected}`);
      if (o.urls.length > 0) {
        lines.push(`- **URL(s):**`);
        for (const u of o.urls) {
          lines.push(`  - ${u}`);
        }
      } else {
        lines.push(`- **URL(s):** N/A`);
      }
      lines.push(`- **Evidence:** ${o.evidence}`);
      lines.push(`- **Problem:** ${o.problem}`);
      lines.push(`- **Opportunity:** ${o.opportunity}`);
      lines.push(`- **Why it matters:** ${o.why_it_matters}`);
      lines.push(`- **Recommended next step:** ${o.recommended_next_step}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
