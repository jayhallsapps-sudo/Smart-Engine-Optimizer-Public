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
  sfReportId?: number;
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

function prevQuarterBounds(q: number, year: number): { start: Date; end: Date } {
  let pq = q - 1;
  let py = year;
  if (pq < 1) { pq = 4; py = year - 1; }
  return quarterBounds(pq, py);
}

export function computeWindow(pastQuarter: PastQuarter, timezone: string): {
  pastStart: string;
  pastEnd: string;
  prevStart: string;
  prevEnd: string;
  pastWindowLabel: string;
  qNum: number;
  qYear: number;
} {
  const isToDate = pastQuarter.endsWith("_TODATE");
  const qNum = parseInt(pastQuarter.replace("_TODATE", "").replace("Q", "")) as 1 | 2 | 3 | 4;

  const nowLocal = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone || "America/Los_Angeles" })
  );
  const currentYear = nowLocal.getFullYear();
  const currentMonth = nowLocal.getMonth() + 1;
  const currentQNum = Math.ceil(currentMonth / 3);

  let qYear: number;
  if (isToDate) {
    qYear = currentYear;
    const bounds = quarterBounds(qNum, qYear);
    const prev = prevQuarterBounds(qNum, qYear);
    return {
      pastStart: fmt(bounds.start),
      pastEnd: fmt(nowLocal),
      prevStart: fmt(prev.start),
      prevEnd: fmt(prev.end),
      pastWindowLabel: `Q${qNum} ${qYear} (To Date: ${fmt(nowLocal)})`,
      qNum,
      qYear,
    };
  }

  qYear = currentYear;
  const { end } = quarterBounds(qNum, currentYear);
  if (nowLocal <= end) {
    qYear = currentYear - 1;
  }

  const bounds = quarterBounds(qNum, qYear);
  const prev = prevQuarterBounds(qNum, qYear);
  return {
    pastStart: fmt(bounds.start),
    pastEnd: fmt(bounds.end),
    prevStart: fmt(prev.start),
    prevEnd: fmt(prev.end),
    pastWindowLabel: `Q${qNum} ${qYear}`,
    qNum,
    qYear,
  };
}

async function gscFetch(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 200,
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
    if (!resp.ok) {
      console.error("[QBR Prep] GSC error:", data.error?.message);
      return [];
    }
    return data.rows ?? [];
  } catch (e: any) {
    console.error("[QBR Prep] GSC fetch error:", e.message);
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
    if (!resp.ok) {
      console.error("[QBR Prep] GA4 error:", data.error?.message);
      return null;
    }
    return data;
  } catch (e: any) {
    console.error("[QBR Prep] GA4 fetch error:", e.message);
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

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtPctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞%" : "—";
  const ch = ((curr - prev) / prev) * 100;
  return `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
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

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

export async function generateQbrPrep(input: QbrPrepInput): Promise<QbrPrepOutput> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const tz = input.timezone || "America/Los_Angeles";
  const { pastStart, pastEnd, prevStart, prevEnd, pastWindowLabel, qNum, qYear } = computeWindow(
    input.pastQuarter as PastQuarter,
    tz
  );
  const futureLabel = `Q${input.futureQuarter.replace("Q", "")}`;
  const cap = input.opportunityCapPerCategory;

  console.log(`[QBR Prep] Generating for ${client.name} | ${pastWindowLabel} | ${pastStart} → ${pastEnd}`);

  const [gscToken, ga4Token] = await Promise.all([
    getGoogleAccessToken("google_search_console"),
    getGoogleAccessToken("google_analytics_4"),
  ]);

  const gscAvailable = !!(gscToken && client.gscSiteUrl);
  const ga4Available = !!(ga4Token && client.ga4PropertyId);

  console.log(`[QBR Prep] GSC available: ${gscAvailable}, GA4 available: ${ga4Available}`);

  const allSfReports = await storage.getSfReports(client.id).catch(() => []);
  const sfAvailable = allSfReports.length > 0;

  const callrailCreds = await storage.getApiCredentialsByService("callrail").catch(() => []);
  const ctmCreds = await storage.getApiCredentialsByService("ctm").catch(() => []);
  const callTrackingAvailable = (callrailCreds.length > 0 && !!client.callrailCompanyId) ||
    (ctmCreds.length > 0 && !!(client as any).ctmAccountId);

  const ctReports = await storage.getCallTrackingReports(client.id).catch(() => []);
  const ctReportAvailable = ctReports.length > 0;

  const allCategories: OpportunityCategory[] = [];
  const allWins: Win[] = [];

  let gscPageRows: any[] = [];
  let gscPrevPageRows: any[] = [];
  let gscQueryRows: any[] = [];
  let gscPrevQueryRows: any[] = [];
  let ga4LandingRows: any[] = [];
  let ga4PrevLandingRows: any[] = [];
  let ga4Funnel: { sessions: number; conversions: number } | null = null;
  let ga4PrevFunnel: { sessions: number; conversions: number } | null = null;
  let ga4DeviceRows: any[] = [];
  let sfData: Record<string, any>[] = [];
  let sfHeaders: string[] = [];
  let sfCol: Record<string, string> = {};

  if (gscAvailable) {
    console.log(`[QBR Prep] Fetching GSC data...`);
    [gscPageRows, gscPrevPageRows, gscQueryRows, gscPrevQueryRows] = await Promise.all([
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["page"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStart, prevEnd, ["page"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["query"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStart, prevEnd, ["query"], 500),
    ]);
    console.log(`[QBR Prep] GSC: ${gscPageRows.length} pages, ${gscQueryRows.length} queries`);
  }

  if (ga4Available) {
    console.log(`[QBR Prep] Fetching GA4 data...`);
    const leadEvents = client.leadEvents ?? [];
    const [landingData, prevLandingData, funnelData, prevFunnelData, deviceData] = await Promise.all([
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [
          { name: "sessions" }, { name: "conversions" },
          { name: "averageSessionDuration" }, { name: "engagementRate" },
          { name: "bounceRate" },
        ],
        dimensionFilter: organicFilter(),
        limit: 200,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 200,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [
          { startDate: pastStart, endDate: pastEnd },
          { startDate: prevStart, endDate: prevEnd },
        ],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }, { name: "deviceCategory" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "engagementRate" }],
        dimensionFilter: organicFilter(),
        limit: 300,
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
        bounceRate: parseFloat(r.metricValues?.[4]?.value ?? "0"),
      }));
    }

    if (prevLandingData?.rows) {
      ga4PrevLandingRows = prevLandingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
      }));
    }

    if (funnelData?.rows) {
      const rows = funnelData.rows;
      const curr = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_0")
        ?? rows[0];
      const prev = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_1")
        ?? rows[1];
      if (curr) {
        ga4Funnel = {
          sessions: parseFloat(curr.metricValues?.[0]?.value ?? "0"),
          conversions: parseFloat(curr.metricValues?.[1]?.value ?? "0"),
        };
      }
      if (prev) {
        ga4PrevFunnel = {
          sessions: parseFloat(prev.metricValues?.[0]?.value ?? "0"),
          conversions: parseFloat(prev.metricValues?.[1]?.value ?? "0"),
        };
      }
    }

    if (deviceData?.rows) {
      ga4DeviceRows = deviceData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        device: r.dimensionValues?.[1]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
        engagementRate: parseFloat(r.metricValues?.[2]?.value ?? "0"),
      }));
    }

    console.log(`[QBR Prep] GA4: ${ga4LandingRows.length} landing pages, funnel: ${JSON.stringify(ga4Funnel)}`);
  }

  if (sfAvailable) {
    const sfReport = input.sfReportId
      ? (await storage.getSfReport(input.sfReportId).catch(() => null)) ?? allSfReports[0]
      : allSfReports[0];
    sfHeaders = sfReport.headers ?? [];
    sfData = (sfReport.data ?? []) as Record<string, any>[];

    const findCol = (...names: string[]) => sfHeaders.find(h => names.includes(h));
    sfCol = {
      url: findCol("Address", "URL", "address", "url") ?? sfHeaders[0] ?? "",
      status: findCol("Status Code", "Status code", "status_code", "Status") ?? "",
      indexability: findCol("Indexability", "indexability") ?? "",
      indexabilityStatus: findCol("Indexability Status", "indexability_status") ?? "",
      title: findCol("Title 1", "Title", "title", "Page Title") ?? "",
      titleLen: findCol("Title 1 Length", "Title Length", "title_length") ?? "",
      h1: findCol("H1-1", "H1", "h1") ?? "",
      h1Count: findCol("H1-1 count", "H1 Count", "h1_count") ?? "",
      canonical: findCol("Canonical Link Element 1", "canonical", "Canonical") ?? "",
      canonicalSelf: findCol("Canonical Link Element Match Canonical?", "canonical_match") ?? "",
      inlinks: findCol("Inlinks", "inlinks", "Internal Inlinks") ?? "",
      outlinks: findCol("Outlinks", "outlinks") ?? "",
      depth: findCol("Crawl Depth", "crawl_depth", "Depth") ?? "",
      wordCount: findCol("Word Count", "word_count") ?? "",
      metaDesc: findCol("Meta Description 1", "Meta Description", "meta_description") ?? "",
      metaDescLen: findCol("Meta Description 1 Length", "Meta Description Length") ?? "",
      contentType: findCol("Content Type", "content_type", "Content-Type") ?? "",
      response: findCol("Response Time", "response_time") ?? "",
      size: findCol("Size", "size") ?? "",
    };
    console.log(`[QBR Prep] SF: ${sfData.length} URLs, headers: ${sfHeaders.slice(0, 10).join(", ")}`);
  }

  const totalGscClicks = gscPageRows.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const totalGscImpressions = gscPageRows.reduce((s: number, r: any) => s + (r.impressions ?? 0), 0);
  const totalPrevGscClicks = gscPrevPageRows.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const medianImpressions = gscPageRows.length > 0
    ? [...gscPageRows].sort((a: any, b: any) => (a.impressions ?? 0) - (b.impressions ?? 0))[Math.floor(gscPageRows.length / 2)]?.impressions ?? 0
    : 0;
  const medianCtr = totalGscImpressions > 0 ? totalGscClicks / totalGscImpressions : 0.03;
  const siteAvgCtr = medianCtr;

  const gscPrevPageMap = new Map<string, any>(gscPrevPageRows.map((r: any) => [r.keys?.[0], r]));
  const gscPrevQueryMap = new Map<string, any>(gscPrevQueryRows.map((r: any) => [r.keys?.[0], r]));

  const siteCvr = ga4Funnel && ga4Funnel.sessions > 0
    ? ga4Funnel.conversions / ga4Funnel.sessions
    : null;
  const prevSiteCvr = ga4PrevFunnel && ga4PrevFunnel.sessions > 0
    ? ga4PrevFunnel.conversions / ga4PrevFunnel.sessions
    : null;

  const ga4PrevMap = new Map<string, any>(ga4PrevLandingRows.map((r: any) => [r.page, r]));

  if (input.includeContent) {
    const contentOpps: Opportunity[] = [];

    if (gscAvailable && gscPageRows.length > 0) {
      const highImpLowCtr = gscPageRows
        .filter((r: any) => (r.impressions ?? 0) > medianImpressions && (r.ctr ?? 0) < siteAvgCtr * 0.75)
        .sort((a: any, b: any) => {
          const aWasted = (a.impressions ?? 0) * (siteAvgCtr - (a.ctr ?? 0));
          const bWasted = (b.impressions ?? 0) * (siteAvgCtr - (b.ctr ?? 0));
          return bWasted - aWasted;
        })
        .slice(0, 6);

      for (const row of highImpLowCtr) {
        const page = row.keys?.[0] ?? "";
        const pos = (row.position ?? 0).toFixed(1);
        const ctr = fmtPct(row.ctr ?? 0);
        const imp = fmtNum(row.impressions ?? 0);
        const clicks = fmtNum(row.clicks ?? 0);
        const potentialClicks = Math.round((row.impressions ?? 0) * (siteAvgCtr - (row.ctr ?? 0)));
        const prev = gscPrevPageMap.get(page);
        const ctrChange = prev ? fmtPctChange(row.ctr ?? 0, prev.ctr ?? 0) : "no prior data";

        const isTop20ga4 = ga4LandingRows.slice(0, 20).some((l: any) => page.includes(l.page));
        const priority: Opportunity["priority"] = (row.position ?? 100) <= 10 && (row.impressions ?? 0) > medianImpressions * 2 ? "P0" : (row.impressions ?? 0) > medianImpressions * 1.5 ? "P1" : "P2";
        const impact: Opportunity["impact"] = isTop20ga4 || (row.impressions ?? 0) > medianImpressions * 3 ? "High" : (row.impressions ?? 0) > medianImpressions * 1.5 ? "Med" : "Low";

        contentOpps.push({
          opportunity_title: `Low CTR vs Impressions: ${shortUrl(page)}`,
          priority,
          impact,
          effort: "S",
          kpi_affected: "CTR, Rankings",
          urls: [page],
          evidence: `GSC (${pastWindowLabel}): ${imp} impressions, ${clicks} clicks, CTR ${ctr} (site avg ${fmtPct(siteAvgCtr)}), avg position ${pos}. CTR vs prior quarter: ${ctrChange}. Estimated ~${fmtNum(potentialClicks)} clicks lost vs site average CTR.`,
          problem: `This page receives ${imp} impressions but converts at only ${ctr} CTR — well below the ${fmtPct(siteAvgCtr)} site average. The title/meta description is likely misaligned with search intent or not compelling enough to drive clicks at this impression volume.`,
          opportunity: "Rewrite title tag and meta description to match dominant query intent for this page. Add FAQ schema or review snippets to enhance the SERP listing. Adjust H2 structure to signal content relevance to top queries.",
          why_it_matters: `Closing the CTR gap to site average on this page alone could generate roughly ${fmtNum(potentialClicks)} additional organic clicks per quarter.`,
          recommended_next_step: "Pull the top 10 queries driving impressions to this page via GSC. Rewrite the title with the primary query at the front. Update meta description to include a clear value proposition and call to action.",
        });
      }

      const strikingDistance = gscPageRows
        .filter((r: any) => {
          const pos = r.position ?? 100;
          return pos >= 4 && pos <= 15 && (r.impressions ?? 0) > 100;
        })
        .sort((a: any, b: any) => {
          const aScore = (a.impressions ?? 0) / (a.position ?? 10);
          const bScore = (b.impressions ?? 0) / (b.position ?? 10);
          return bScore - aScore;
        })
        .slice(0, 5);

      for (const row of strikingDistance) {
        const page = row.keys?.[0] ?? "";
        const pos = (row.position ?? 0).toFixed(1);
        const imp = fmtNum(row.impressions ?? 0);
        const clicks = fmtNum(row.clicks ?? 0);
        const prev = gscPrevPageMap.get(page);
        const posChange = prev ? ((prev.position ?? row.position) - row.position).toFixed(1) : "no prior data";
        const posChangeNote = prev && Number(posChange) > 0 ? ` (↑${posChange} positions gained vs prior quarter)` : prev ? ` (↓${Math.abs(Number(posChange))} positions lost)` : "";

        const priority: Opportunity["priority"] = (row.position ?? 100) <= 8 && (row.impressions ?? 0) > medianImpressions ? "P1" : "P2";
        const impact: Opportunity["impact"] = (row.impressions ?? 0) > medianImpressions * 2 ? "High" : "Med";

        contentOpps.push({
          opportunity_title: `Striking Distance Page: ${shortUrl(page)}`,
          priority,
          impact,
          effort: "M",
          kpi_affected: "Rankings, CTR, Calls/Forms",
          urls: [page],
          evidence: `GSC (${pastWindowLabel}): avg position ${pos}${posChangeNote}, ${imp} impressions, ${clicks} clicks. This page is within reach of top 3 with targeted improvements.`,
          problem: `Page is ranked position ${pos} — in striking distance of top 3 results but not there yet. High impression volume confirms Google sees this page as highly relevant for target queries, but it's leaving significant click share on the table.`,
          opportunity: "Expand content depth and intent coverage, add semantically related subtopics, improve internal link equity flowing to this page from relevant hub pages and service pages, and refresh content with current statistics and examples.",
          why_it_matters: "Moving from position 4–15 to top 3 typically yields 2–5x more clicks for the same impression count. For pages with this impression volume, that can mean dozens to hundreds of additional monthly organic visits.",
          recommended_next_step: "Perform a content gap analysis against the top 3 ranking pages for this page's primary query cluster. Identify missing subtopics, add 3–5 targeted internal links from related service/blog pages, and add an authoritative FAQ section.",
        });
      }

      if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
        const highTrafficLowCvr = ga4LandingRows
          .filter((r: any) => r.sessions > 20 && pct(r.conversions, r.sessions) < siteCvr * 0.65)
          .sort((a: any, b: any) => b.sessions - a.sessions)
          .slice(0, 4);

        for (const row of highTrafficLowCvr) {
          const pageCvr = pct(row.conversions, row.sessions);
          const prev = ga4PrevMap.get(row.page);
          const sessionChange = prev ? fmtPctChange(row.sessions, prev.sessions) : "no prior data";
          const convChange = prev ? fmtPctChange(row.conversions, prev.conversions) : "no prior data";
          const isTop10 = ga4LandingRows.indexOf(row) < 10;
          const priority: Opportunity["priority"] = isTop10 && row.sessions > 100 ? "P1" : "P2";
          const impact: Opportunity["impact"] = isTop10 ? "High" : row.sessions > 50 ? "Med" : "Low";

          const gscMatch = gscPageRows.find((g: any) => (g.keys?.[0] ?? "").includes(row.page.replace(/^https?:\/\/[^/]+/, "")));
          const gscNote = gscMatch ? `GSC: avg position ${(gscMatch.position ?? 0).toFixed(1)}, ${fmtNum(gscMatch.impressions ?? 0)} impressions.` : "";

          contentOpps.push({
            opportunity_title: `High Traffic, Low CVR: ${shortUrl(row.page)}`,
            priority,
            impact,
            effort: "M",
            kpi_affected: "Forms, Calls",
            urls: [row.page],
            evidence: `GA4 (${pastWindowLabel}): ${fmtNum(row.sessions)} organic sessions, ${fmtNum(row.conversions)} conversions, CVR ${fmtPct(pageCvr)} vs site avg ${fmtPct(siteCvr)}. Sessions QoQ: ${sessionChange}, conversions QoQ: ${convChange}. Engagement rate: ${fmtPct(row.engagementRate)}. ${gscNote}`,
            problem: `This page drives ${fmtNum(row.sessions)} organic sessions but converts at ${fmtPct(pageCvr)} — ${((1 - pageCvr / siteCvr) * 100).toFixed(0)}% below the site average of ${fmtPct(siteCvr)}. Visitors are arriving but not taking action.`,
            opportunity: "Audit CTA placement, messaging, and form friction. Add trust signals (reviews, certifications, statistics) above the fold. Ensure the primary conversion path is visible without scrolling on both desktop and mobile. Consider A/B testing a simplified contact form or click-to-call button.",
            why_it_matters: `Closing the CVR gap to site average on this page would produce approximately ${fmtNum(Math.round(row.sessions * (siteCvr - pageCvr)))} additional conversions per quarter from existing traffic — no additional SEO investment required.`,
            recommended_next_step: "Install a heatmap tool (Hotjar or similar) on this page for 2 weeks. Identify where users drop off before converting. Rewrite CTA copy to be more specific to the visitor's intent (e.g., 'Get Your Free Insurance Verification' vs 'Contact Us').",
          });
        }
      }

      if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
        const droppingConv = ga4LandingRows
          .filter((r: any) => r.sessions > 20)
          .filter((r: any) => {
            const prev = ga4PrevMap.get(r.page);
            if (!prev || prev.conversions === 0) return false;
            const currCvr = pct(r.conversions, r.sessions);
            const prevCvr = pct(prev.conversions, prev.sessions);
            return prevCvr > 0 && (prevCvr - currCvr) / prevCvr > 0.25;
          })
          .sort((a: any, b: any) => {
            const prevA = ga4PrevMap.get(a.page);
            const prevB = ga4PrevMap.get(b.page);
            const dropA = prevA ? (pct(prevA.conversions, prevA.sessions) - pct(a.conversions, a.sessions)) / pct(prevA.conversions, prevA.sessions) : 0;
            const dropB = prevB ? (pct(prevB.conversions, prevB.sessions) - pct(b.conversions, b.sessions)) / pct(prevB.conversions, prevB.sessions) : 0;
            return dropB - dropA;
          })
          .slice(0, 3);

        for (const row of droppingConv) {
          const prev = ga4PrevMap.get(row.page)!;
          const currCvr = pct(row.conversions, row.sessions);
          const prevCvr = pct(prev.conversions, prev.sessions);
          const drop = ((prevCvr - currCvr) / prevCvr * 100).toFixed(0);

          contentOpps.push({
            opportunity_title: `Conversion Drop on ${shortUrl(row.page)}: CVR Down ${drop}% QoQ`,
            priority: "P1",
            impact: row.sessions > 100 ? "High" : "Med",
            effort: "M",
            kpi_affected: "Forms, Calls",
            urls: [row.page],
            evidence: `GA4 QoQ: CVR dropped from ${fmtPct(prevCvr)} to ${fmtPct(currCvr)} (−${drop}%). Sessions: ${fmtNum(row.sessions)} now vs ${fmtNum(prev.sessions)} prior quarter. Conversions: ${fmtNum(row.conversions)} vs ${fmtNum(prev.conversions)} prior quarter.`,
            problem: `A significant conversion rate decline occurred on this page quarter-over-quarter despite stable or growing traffic. This pattern indicates a content, UX, or competitive change is hurting performance.`,
            opportunity: "Audit the page for recent content changes, CTA modifications, or layout changes that may have reduced conversion friction. Check for SERP changes (do a fresh search for the primary query to see if competitors have changed). Review any A/B test results that may have landed on an underperforming variant.",
            why_it_matters: "A −${drop}% CVR drop on a previously high-converting page represents a measurable, ongoing lead loss each week this goes unaddressed.",
            recommended_next_step: "Review page change history (Google Search Console, CMS revision history). Restore high-converting CTA placements or test a new variant. Check Google's cached version of the page for any indexing anomalies.",
          });
        }
      }

    } else if (!gscAvailable && !ga4Available) {
      contentOpps.push({
        opportunity_title: "Connect GSC and GA4 to Enable Content Analysis",
        priority: "P0",
        impact: "High",
        effort: "S",
        kpi_affected: "CTR, Rankings, Tracking Integrity",
        urls: [],
        evidence: "Not available — neither GSC nor GA4 are connected for this client.",
        problem: "Without GSC and GA4 data, all content opportunity detection is blind. We cannot identify underperforming pages, striking distance rankings, or CTR issues.",
        opportunity: "Connect Google Search Console and GA4 in Setup → Analytics & Search to unlock automated content opportunity detection.",
        why_it_matters: "Content optimization is the highest-ROI SEO activity. Without data, content decisions are based on guesswork.",
        recommended_next_step: "Connect GSC and GA4 credentials in Setup, then regenerate this report.",
      });
    }

    allCategories.push({
      category_name: "Content Opportunities",
      opportunities: scoreOpps(contentOpps).slice(0, cap),
    });
  }

  if (input.includeTechnical) {
    const techOpps: Opportunity[] = [];

    if (sfAvailable && sfData.length > 0) {
      const { url: urlCol, status: statusCol, indexability: indexCol, indexabilityStatus: indexStatusCol,
        title: titleCol, titleLen: titleLenCol, h1: h1Col, h1Count: h1CountCol,
        canonical: canonicalCol, canonicalSelf: canonicalSelfCol,
        inlinks: inlinksCol, depth: depthCol, wordCount: wordCol,
        metaDesc: metaCol, metaDescLen: metaLenCol, contentType: ctypeCol } = sfCol;

      const isHtml = (r: Record<string, any>) =>
        !ctypeCol || String(r[ctypeCol] ?? "").toLowerCase().includes("html");

      const htmlRows = ctypeCol ? sfData.filter(isHtml) : sfData;
      const total = sfData.length;
      const htmlTotal = htmlRows.length;

      const errors4xx = statusCol ? sfData.filter(r => {
        const s = Number(r[statusCol]);
        return s >= 400 && s < 500;
      }) : [];
      const errors5xx = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 500) : [];
      const redirects3xx = statusCol ? sfData.filter(r => {
        const s = Number(r[statusCol]);
        return s >= 300 && s < 400;
      }) : [];

      const notIndexable = indexCol
        ? htmlRows.filter(r => r[indexCol] && String(r[indexCol]).toLowerCase() !== "indexable")
        : [];
      const noindexPages = indexStatusCol
        ? notIndexable.filter(r => String(r[indexStatusCol] ?? "").toLowerCase().includes("noindex"))
        : [];
      const canonicalizedPages = indexStatusCol
        ? notIndexable.filter(r => String(r[indexStatusCol] ?? "").toLowerCase().includes("canonical"))
        : [];

      const missingTitle = titleCol
        ? htmlRows.filter(r => !r[titleCol] || String(r[titleCol]).trim() === "")
        : [];
      const duplicateTitles = (() => {
        if (!titleCol) return [];
        const counts = new Map<string, number>();
        for (const r of htmlRows) {
          const t = String(r[titleCol] ?? "").trim();
          if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return htmlRows.filter(r => {
          const t = String(r[titleCol] ?? "").trim();
          return t && (counts.get(t) ?? 0) > 1;
        });
      })();
      const shortTitle = titleLenCol
        ? htmlRows.filter(r => {
            const len = Number(r[titleLenCol] ?? 0);
            return len > 0 && len < 30;
          })
        : [];
      const longTitle = titleLenCol
        ? htmlRows.filter(r => Number(r[titleLenCol] ?? 0) > 65)
        : [];

      const missingH1 = h1Col
        ? htmlRows.filter(r => !r[h1Col] || String(r[h1Col]).trim() === "")
        : [];
      const multipleH1 = h1CountCol
        ? htmlRows.filter(r => Number(r[h1CountCol] ?? 0) > 1)
        : [];

      const missingMeta = metaCol
        ? htmlRows.filter(r => !r[metaCol] || String(r[metaCol]).trim() === "")
        : [];
      const shortMeta = metaLenCol
        ? htmlRows.filter(r => {
            const len = Number(r[metaLenCol] ?? 0);
            return len > 0 && len < 70;
          })
        : [];

      const lowInlinks = inlinksCol
        ? htmlRows.filter(r => Number(r[inlinksCol] ?? 0) <= 1 && r[urlCol])
        : [];
      const zeroInlinks = inlinksCol
        ? htmlRows.filter(r => Number(r[inlinksCol] ?? 0) === 0 && r[urlCol])
        : [];

      const deepPages = depthCol
        ? htmlRows.filter(r => Number(r[depthCol] ?? 0) >= 4)
        : [];
      const veryDeepPages = depthCol
        ? htmlRows.filter(r => Number(r[depthCol] ?? 0) >= 5)
        : [];

      const thinContent = wordCol
        ? htmlRows.filter(r => {
            const wc = Number(r[wordCol] ?? 0);
            return wc > 0 && wc < 300;
          })
        : [];

      const sample = (arr: any[], n = 5) =>
        arr.slice(0, n).map(r => String(r[urlCol] ?? "")).filter(Boolean);

      if (errors4xx.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${errors4xx.length} 4xx Error Pages`,
          priority: "P0",
          impact: errors4xx.length > 10 ? "High" : "Med",
          effort: errors4xx.length > 50 ? "M" : "S",
          kpi_affected: "Indexation, Rankings, Link Equity",
          urls: sample(errors4xx),
          evidence: `Screaming Frog: ${errors4xx.length} URLs returning 4xx status codes out of ${total} total crawled (${((errors4xx.length / total) * 100).toFixed(1)}% of site). Sample: ${sample(errors4xx, 3).map(shortUrl).join(", ")}`,
          problem: `${errors4xx.length} pages are returning client errors. Googlebot is hitting dead ends, wasting crawl budget and losing any link equity that was pointing to these URLs. Internal links to 4xx pages also create a poor user experience.`,
          opportunity: "Redirect all 4xx URLs to the most relevant live page using 301 redirects. Update all internal links pointing to dead URLs. Submit an updated sitemap after remediation.",
          why_it_matters: "4xx pages drain crawl budget, lose accumulated link equity, and create dead ends for both users and Googlebot. Fixing these is one of the highest ROI technical SEO actions.",
          recommended_next_step: `Export all ${errors4xx.length} 4xx URLs from Screaming Frog. Categorize by type (deleted content, renamed pages, old blog posts). Implement 301 redirects for any URL with backlinks or internal links.`,
        });
      }

      if (errors5xx.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${errors5xx.length} 5xx Server Errors`,
          priority: "P0",
          impact: "High",
          effort: "M",
          kpi_affected: "Indexation, Rankings",
          urls: sample(errors5xx),
          evidence: `Screaming Frog: ${errors5xx.length} URLs returning server errors (5xx)`,
          problem: "Server errors prevent Googlebot from accessing and indexing pages. If these affect key service pages, rankings will degrade.",
          opportunity: "Diagnose the root cause of 5xx errors — could be server configuration, plugin conflicts (WordPress), or database issues. Resolve at the server level immediately.",
          why_it_matters: "Server errors on key pages can cause ranking drops within days and undermine the entire crawl.",
          recommended_next_step: "Escalate to the development team immediately. Check server logs for the specific error type and root cause.",
        });
      }

      if (noindexPages.length > 0 || notIndexable.length > 0) {
        const nonIndexCount = notIndexable.length;
        const noindexCount = noindexPages.length;
        const canonCount = canonicalizedPages.length;
        techOpps.push({
          opportunity_title: `Audit ${nonIndexCount} Non-Indexable Pages (${noindexCount} noindex, ${canonCount} canonicalized)`,
          priority: nonIndexCount > 5 ? "P0" : "P1",
          impact: nonIndexCount > htmlTotal * 0.1 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Indexation, Rankings",
          urls: sample(notIndexable),
          evidence: `Screaming Frog: ${nonIndexCount} non-indexable pages out of ${htmlTotal} HTML URLs (${((nonIndexCount / htmlTotal) * 100).toFixed(1)}%). Breakdown: ${noindexCount} noindex, ${canonCount} canonicalized to alternate URL, ${nonIndexCount - noindexCount - canonCount} other.`,
          problem: `${nonIndexCount} pages are explicitly excluded from Google's index. While some may be intentional (thank-you pages, admin pages), non-indexability on service or content pages is a critical ranking issue. Each non-indexable service page is an invisible page that cannot rank.`,
          opportunity: "Audit every non-indexable page. Identify any service pages, location pages, or blog posts accidentally marked noindex or canonicalized to the wrong URL. Remove incorrect noindex tags and fix canonical mismatches.",
          why_it_matters: "A single service page accidentally excluded from the index represents zero organic traffic potential, no matter how good the content or backlinks.",
          recommended_next_step: `Filter non-indexable URLs to service/location/content pages only. Cross-reference with GSC Coverage report. Remove any accidental noindex tags. Update canonical tags on any pages pointing to wrong URLs.`,
        });
      }

      if (redirects3xx.length > 0) {
        techOpps.push({
          opportunity_title: `Resolve ${redirects3xx.length} Redirect Chains / Internal Redirect Links`,
          priority: "P1",
          impact: redirects3xx.length > 20 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Indexation, Link Equity, Page Speed",
          urls: sample(redirects3xx),
          evidence: `Screaming Frog: ${redirects3xx.length} redirect (3xx) URLs crawled. Internal links pointing to redirect URLs waste crawl budget and pass diluted link equity.`,
          problem: "Internal links pointing to redirect URLs (not final destinations) pass diluted PageRank and create unnecessary redirect hops. Each redirect adds latency and reduces crawling efficiency.",
          opportunity: "Update all internal links to point directly to the final destination URL rather than through redirects. This improves crawl efficiency and ensures full link equity is passed.",
          why_it_matters: "Redirect chains accumulate over time from site migrations and content updates. Cleaning them up preserves link equity and improves crawl efficiency.",
          recommended_next_step: "In Screaming Frog, filter 'Inlinks' to redirect URLs. Update each source link to point to the final 200 URL. Prioritize links from high-authority pages.",
        });
      }

      if (missingTitle.length > 0) {
        techOpps.push({
          opportunity_title: `Write Title Tags for ${missingTitle.length} Pages Missing Them`,
          priority: missingTitle.length > 5 ? "P0" : "P1",
          impact: missingTitle.length > 10 ? "High" : "Med",
          effort: "S",
          kpi_affected: "CTR, Rankings",
          urls: sample(missingTitle),
          evidence: `Screaming Frog: ${missingTitle.length} HTML pages missing title tags (${((missingTitle.length / htmlTotal) * 100).toFixed(1)}% of HTML pages). Google will generate its own title, often suboptimal.`,
          problem: `${missingTitle.length} pages have no title tag. Google auto-generates titles for pages without them, typically pulling from H1 text or navigation links — rarely the keyword-optimized result you'd choose.`,
          opportunity: "Write unique, keyword-targeted title tags for all missing pages following the pattern: Primary Keyword – Secondary Keyword | Brand Name. Prioritize service and location pages first.",
          why_it_matters: "Title tags are among the strongest on-page ranking signals and are the first thing users see in search results. Missing titles represent a direct CTR and ranking penalty.",
          recommended_next_step: "Export missing title pages from Screaming Frog, sorted by inlinks (highest first). Write titles for top 20 immediately. Use format: [Service/Topic] in [Location] | [Brand].",
        });
      }

      if (duplicateTitles.length > 0) {
        const uniqueDupTitles = new Set(duplicateTitles.map(r => String(r[titleCol] ?? "")).filter(Boolean)).size;
        techOpps.push({
          opportunity_title: `Fix ${duplicateTitles.length} Duplicate Title Tags (${uniqueDupTitles} shared titles)`,
          priority: duplicateTitles.length > 10 ? "P1" : "P2",
          impact: duplicateTitles.length > 20 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Rankings, CTR",
          urls: sample(duplicateTitles),
          evidence: `Screaming Frog: ${duplicateTitles.length} pages share titles across ${uniqueDupTitles} non-unique title strings.`,
          problem: "Duplicate title tags force Google to choose which page to rank for a given query — often resulting in neither page ranking well. This also causes keyword cannibalization.",
          opportunity: "Audit all duplicate title groups. Determine if pages are genuinely different content (write unique titles) or are duplicates that should be consolidated via canonical or redirect.",
          why_it_matters: "Duplicate titles signal content cannibalization to Google, splitting ranking authority and confusing the crawler about which page to serve for target queries.",
          recommended_next_step: "Export duplicate title report from Screaming Frog. Group by shared title. For service/location pages with duplicate titles, write unique titles incorporating page-specific location or service modifier.",
        });
      }

      if (missingH1.length > 0) {
        techOpps.push({
          opportunity_title: `Add H1 Tags to ${missingH1.length} Pages`,
          priority: missingH1.length > 10 ? "P1" : "P2",
          impact: missingH1.length > 15 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "Rankings",
          urls: sample(missingH1),
          evidence: `Screaming Frog: ${missingH1.length} HTML pages have no H1 tag (${((missingH1.length / htmlTotal) * 100).toFixed(1)}% of HTML pages).`,
          problem: "H1 is a primary on-page relevance signal. Pages missing H1 tags send weaker keyword relevance signals to Google and have suboptimal content structure for both users and crawlers.",
          opportunity: "Add a single, descriptive H1 tag to each affected page that includes the primary target keyword for that page. Ensure H1 is distinct from the title tag but covers the same keyword intent.",
          why_it_matters: "H1 tags help Google understand the primary topic of a page. Missing H1s are a common technical SEO issue that's easy to fix with outsized impact on page-level relevance signals.",
          recommended_next_step: "Filter missing H1 pages to service and location pages first. Add H1 tags that incorporate primary keyword + geographic modifier where relevant.",
        });
      }

      if (multipleH1.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${multipleH1.length} Pages with Multiple H1 Tags`,
          priority: "P2",
          impact: multipleH1.length > 10 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "Rankings",
          urls: sample(multipleH1),
          evidence: `Screaming Frog: ${multipleH1.length} pages have more than one H1 tag, diluting the primary keyword signal.`,
          problem: "Multiple H1 tags dilute the page's primary relevance signal and indicate disorganized page structure. Often caused by theme/template issues or CMS configuration.",
          opportunity: "Audit pages with multiple H1s — typically a theme issue where the site logo, navigation element, or sidebar is wrapped in an H1 tag. Fix at the template level to affect all pages simultaneously.",
          why_it_matters: "While not as severe as missing H1s, multiple H1s weaken the clarity of the page's primary topic signal for Google.",
          recommended_next_step: "Inspect the first 5 affected pages. If the duplicate H1 is in the header/nav, fix the template to change it to a div or span. One fix often resolves all instances.",
        });
      }

      if (zeroInlinks.length > 0 || lowInlinks.length > 0) {
        const orphanCount = zeroInlinks.length;
        const lowLinkCount = lowInlinks.length;
        techOpps.push({
          opportunity_title: `Internal Linking: ${orphanCount} Orphan Pages, ${lowLinkCount} Pages with ≤1 Inlink`,
          priority: "P1",
          impact: lowLinkCount > 30 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Rankings, Indexation",
          urls: sample(zeroInlinks.length > 0 ? zeroInlinks : lowInlinks),
          evidence: `Screaming Frog: ${orphanCount} pages have ZERO internal inlinks (orphaned). ${lowLinkCount} pages have 0–1 internal inlinks total, making them extremely hard for Googlebot to discover and lowly valued by the crawl.`,
          problem: `${orphanCount} pages are completely orphaned — no internal links point to them. These pages rely entirely on their XML sitemap entry for discovery and receive no link equity from the rest of the site. An additional ${lowLinkCount - orphanCount} pages have only 1 internal link.`,
          opportunity: "Build a targeted internal linking plan. Identify which orphaned/low-linked pages are service, location, or blog pages. Add contextual internal links from the homepage, service hub pages, and relevant blog posts. Consider adding a related posts section to blog content.",
          why_it_matters: "Internal links are how PageRank flows through your site. Orphaned pages receive a PageRank score of nearly zero regardless of their content quality. A single internal link from a high-authority page can dramatically increase a page's crawl frequency and ranking potential.",
          recommended_next_step: `Export orphan pages from Screaming Frog. Filter to service/location pages. For each, identify 3 relevant pages on the site that could naturally link to it. Add contextual links using keyword-rich anchor text. Target: every service and location page should have at least 5 internal inlinks.`,
        });
      }

      if (deepPages.length > 0) {
        techOpps.push({
          opportunity_title: `${deepPages.length} Pages at Crawl Depth ≥4 (${veryDeepPages.length} at Depth ≥5)`,
          priority: deepPages.length > 50 ? "P1" : "P2",
          impact: deepPages.length > 100 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Indexation, Rankings, Crawl Budget",
          urls: sample(deepPages),
          evidence: `Screaming Frog: ${deepPages.length} pages are buried at crawl depth 4+. ${veryDeepPages.length} pages are at depth 5+. Google crawls shallower pages more frequently.`,
          problem: "Pages more than 3 clicks from the homepage are effectively invisible to Googlebot unless they have significant external backlinks. Deep pages receive minimal crawl budget allocation, resulting in infrequent indexing and poor PageRank accumulation.",
          opportunity: "Flatten the site architecture by adding navigation links, breadcrumbs, or a filtered category landing page for deep sections. Add deep pages to the XML sitemap and internally link to them from category/hub pages.",
          why_it_matters: "Crawl depth directly affects how often Googlebot visits pages. A page at depth 5 may be crawled once a month vs. a depth-2 page crawled daily.",
          recommended_next_step: "Filter deep pages to service and location content. For pages at depth ≥4 that are important to the business, add direct links from the homepage sidebar, footer, or main navigation. Review sitemap to ensure all important pages are included.",
        });
      }

      if (thinContent.length > 0) {
        techOpps.push({
          opportunity_title: `${thinContent.length} Pages with Thin Content (<300 Words)`,
          priority: thinContent.length > 20 ? "P1" : "P2",
          impact: thinContent.length > 30 ? "High" : "Med",
          effort: "L",
          kpi_affected: "Rankings, CTR",
          urls: sample(thinContent),
          evidence: `Screaming Frog: ${thinContent.length} HTML pages have fewer than 300 words of content. These pages provide minimal informational value and are unlikely to rank for competitive queries.`,
          problem: "Thin content pages signal low quality to Google and rarely rank above position 15 for competitive queries. They can also dilute the overall site quality score for queries beyond their individual page.",
          opportunity: "Audit thin content pages — determine if they should be expanded (service/location pages worth targeting), consolidated (merge similar thin pages), or removed/noindexed (genuinely low-value pages).",
          why_it_matters: "Google's helpful content system evaluates site quality holistically. A large proportion of thin content pages can suppress the ranking potential of the entire domain.",
          recommended_next_step: "Filter thin content to service and location pages (ignore thank-you pages, contact pages). For each important thin page, expand content to 600+ words covering the primary service, local relevance, FAQs, and testimonials.",
        });
      }

      if (missingMeta.length > 0) {
        techOpps.push({
          opportunity_title: `Write Meta Descriptions for ${missingMeta.length} Pages`,
          priority: "P2",
          impact: missingMeta.length > 20 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "CTR",
          urls: sample(missingMeta),
          evidence: `Screaming Frog: ${missingMeta.length} pages are missing meta descriptions. Google will auto-generate snippets, often pulling irrelevant text.`,
          problem: "Missing meta descriptions result in Google auto-generating search snippets from random on-page text — often uninspiring, off-topic, or truncated in a way that reduces click appeal.",
          opportunity: "Write unique, compelling meta descriptions of 140–160 characters for all service, location, and blog pages. Include the primary keyword, a key benefit, and an implicit call to action.",
          why_it_matters: "While meta descriptions don't directly affect rankings, they heavily influence CTR. A well-written description can improve CTR by 2–5% even without ranking changes.",
          recommended_next_step: "Prioritize missing meta descriptions for the top 20 landing pages by GSC impressions. Write descriptions that answer 'why click on this result?' in under 160 characters.",
        });
      }

    } else if (!sfAvailable) {
      techOpps.push({
        opportunity_title: "Upload Screaming Frog Data to Enable Technical Audit",
        priority: "P0",
        impact: "High",
        effort: "S",
        kpi_affected: "Indexation, Rankings",
        urls: [],
        evidence: "Not available — no Screaming Frog crawl data is uploaded for this client.",
        problem: "Without a crawl import, every technical issue on the site (broken pages, orphaned content, missing metadata, thin content, redirect chains) is invisible. Technical issues can silently suppress rankings across the entire domain.",
        opportunity: "Run a full Screaming Frog crawl of the domain and upload the CSV export. Enable all data columns including: Status Code, Indexability, Title, H1, Meta Description, Inlinks, Crawl Depth, Word Count, and Canonical.",
        why_it_matters: "Technical SEO issues are often the reason good content doesn't rank. A crawl audit identifies the structural barriers to ranking that cannot be seen from analytics data alone.",
        recommended_next_step: "Download Screaming Frog (free for up to 500 URLs). Set it to crawl the full domain. After crawl completes: File → Export → All Export → Bulk Export. Upload the Internal All export CSV in SmartEO Setup → Screaming Frog.",
      });
    }

    allCategories.push({
      category_name: "Technical SEO Opportunities",
      opportunities: scoreOpps(techOpps).slice(0, cap),
    });
  }

  if (input.includeLocal) {
    const localOpps: Opportunity[] = [];

    localOpps.push({
      opportunity_title: "Review Generation & Response Velocity",
      priority: "P1",
      impact: "High",
      effort: "M",
      kpi_affected: "GBP Actions, Rankings",
      urls: [],
      evidence: "GBP review velocity and response rate assessment — connect GBP in Setup or check dashboard manually for current velocity.",
      problem: "Review velocity and response rate are primary local ranking signals. Businesses that do not actively generate new reviews and respond to all reviews within 48 hours underperform in the local pack compared to competitors who do.",
      opportunity: "Implement a post-service review request workflow triggered automatically after service completion (via SMS or email CRM automation). Respond to all reviews — positive and negative — within 24 hours using templated but personalized responses.",
      why_it_matters: "Reviews signal trust to both Google and prospective patients/clients. Local pack positions 1–3 in recovery tend to have 3x the review volume of positions 4+. Review response rate is also confirmed by Google as a local ranking factor.",
      recommended_next_step: "Set up automated review request via CRM or a tool like Birdeye/Podium. Create 5 response templates (positive review, negative review, detailed positive, no-rating, treatment-related). Set a goal of 1 new review per week minimum.",
    });

    localOpps.push({
      opportunity_title: "GBP Services & Attributes Completeness",
      priority: "P1",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "Manual GBP audit required — check services, attributes, and profile completeness in Google Business dashboard.",
      problem: "Incomplete GBP profiles — missing service descriptions, attributes (e.g., insurance accepted, accessibility, languages spoken), and product/service listings — underperform in local pack and Local Finder results.",
      opportunity: "Complete all GBP profile sections: (1) Services with full descriptions; (2) Business attributes (insurance accepted, LGBTQ-friendly, accessible, languages); (3) Products/services with prices where applicable; (4) Business description (750 char) with primary keywords; (5) Q&A seeded with 5 common questions.",
      why_it_matters: "Google uses GBP completeness as a local relevance signal. More complete profiles are shown for more search queries. Attribute matching (e.g., 'accepts insurance') directly influences appearance for specific intent queries.",
      recommended_next_step: "Log into GBP dashboard. Check each section against a completeness checklist. Add/update: services with keyword-rich descriptions (each service separately listed), all applicable attributes, and 5 seed Q&A pairs.",
    });

    localOpps.push({
      opportunity_title: "GBP Post Cadence: Regular Content Publishing",
      priority: "P2",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "Review post history in GBP dashboard to assess current posting frequency.",
      problem: "GBP posts that are infrequent or absent signal an inactive profile to Google, which can reduce local pack prominence. Profiles with consistent weekly posts show higher engagement rates.",
      opportunity: "Establish a weekly GBP posting cadence. Content ideas: treatment approach spotlights, team member features, upcoming events/groups, seasonal mental health content, patient success stories (HIPAA-compliant), insurance education, and community involvement.",
      why_it_matters: "Active GBP profiles are shown more prominently in local search and map results. Posts also appear in branded searches, providing an additional touchpoint for prospective clients.",
      recommended_next_step: "Create a 13-post quarterly content calendar. Schedule one post per week using a tool like GBP directly or scheduling software. Include a CTA in every post (Call Now, Learn More, Book Appointment).",
    });

    if (callTrackingAvailable || ctReportAvailable) {
      localOpps.push({
        opportunity_title: "GBP Call Attribution & Source Analysis",
        priority: "P1",
        impact: "High",
        effort: "S",
        kpi_affected: "Calls, GBP Actions",
        urls: [],
        evidence: `Call tracking ${callTrackingAvailable ? "API connected" : "CSV data available"} — analyze GBP vs. organic vs. paid call source breakdown for ${pastWindowLabel}.`,
        problem: "Without understanding what percentage of calls originate from GBP vs. organic website vs. paid ads, it is impossible to assess the true ROI of local SEO efforts or identify which optimization levers drive the most phone leads.",
        opportunity: "Analyze call source attribution data to quantify GBP's contribution to call volume. If GBP calls are a small percentage of total calls relative to local pack prominence, the GBP profile needs optimization. Set up a dedicated GBP call tracking number.",
        why_it_matters: "GBP is often the #1 source of phone calls for local service businesses, but it's frequently untracked. Understanding this attribution changes how SEO resources are allocated.",
        recommended_next_step: "In call tracking dashboard, filter by source/medium to isolate GBP-attributed calls. Calculate GBP call % of total. If below 30% for a location-based service, prioritize GBP profile optimizations.",
      });
    } else {
      localOpps.push({
        opportunity_title: "Set Up GBP Call Tracking Number",
        priority: "P1",
        impact: "High",
        effort: "M",
        kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — no call tracking integration connected, so GBP call volume is unmeasured.",
        problem: "GBP is typically the largest source of phone leads for addiction treatment centers, but without a tracking number, GBP-generated calls are invisible and cannot be attributed, optimized, or reported on.",
        opportunity: "Set up a dedicated CallRail or CTM tracking number for GBP. Configure GBP to use this number as the primary call number. This immediately enables GBP call tracking and attribution.",
        why_it_matters: "Without tracking, GBP optimization decisions are made blind. A tracking number costs ~$30/month and provides full visibility into GBP's call contribution.",
        recommended_next_step: "Create a new tracking number in CallRail. Set the source to 'Google Business Profile'. Update the GBP profile to use this number as primary. Connect CallRail to SmartEO in Setup.",
      });
    }

    allCategories.push({
      category_name: "Local / GBP Opportunities",
      opportunities: scoreOpps(localOpps).slice(0, cap),
    });
  }

  if (input.includeCro) {
    const croOpps: Opportunity[] = [];

    if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
      const deviceMap = new Map<string, { mobile: { s: number; c: number; e: number }; desktop: { s: number; c: number; e: number } }>();
      for (const row of ga4DeviceRows) {
        const key = row.page;
        if (!deviceMap.has(key)) deviceMap.set(key, {
          mobile: { s: 0, c: 0, e: 0 },
          desktop: { s: 0, c: 0, e: 0 },
        });
        const entry = deviceMap.get(key)!;
        if (row.device === "mobile") {
          entry.mobile.s += row.sessions;
          entry.mobile.c += row.conversions;
          entry.mobile.e = row.engagementRate;
        }
        if (row.device === "desktop") {
          entry.desktop.s += row.sessions;
          entry.desktop.c += row.conversions;
          entry.desktop.e = row.engagementRate;
        }
      }

      const mobileCvrGaps: Array<{
        page: string; mobileCvr: number; desktopCvr: number;
        mobileSessions: number; mobilePct: number;
      }> = [];
      for (const [page, data] of deviceMap.entries()) {
        const mobileCvr = pct(data.mobile.c, data.mobile.s);
        const desktopCvr = pct(data.desktop.c, data.desktop.s);
        const totalSessions = data.mobile.s + data.desktop.s;
        if (data.mobile.s > 15 && desktopCvr > 0.005 && mobileCvr < desktopCvr * 0.65) {
          mobileCvrGaps.push({
            page,
            mobileCvr,
            desktopCvr,
            mobileSessions: data.mobile.s,
            mobilePct: totalSessions > 0 ? data.mobile.s / totalSessions : 0,
          });
        }
      }
      mobileCvrGaps.sort((a, b) => b.mobileSessions - a.mobileSessions);

      for (const gap of mobileCvrGaps.slice(0, 3)) {
        const isTop = ga4LandingRows.slice(0, 5).some((l: any) => l.page === gap.page);
        const cvrGapPct = ((1 - gap.mobileCvr / gap.desktopCvr) * 100).toFixed(0);
        const lostConvPerQ = Math.round(gap.mobileSessions * (gap.desktopCvr - gap.mobileCvr));

        croOpps.push({
          opportunity_title: `Mobile CVR Gap on ${shortUrl(gap.page)}: ${cvrGapPct}% Below Desktop`,
          priority: isTop ? "P0" : "P1",
          impact: isTop ? "High" : gap.mobileSessions > 100 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Calls, Forms",
          urls: [gap.page],
          evidence: `GA4 (${pastWindowLabel}): Mobile CVR ${fmtPct(gap.mobileCvr)} vs Desktop CVR ${fmtPct(gap.desktopCvr)} (−${cvrGapPct}%). ${fmtNum(gap.mobileSessions)} mobile sessions (${fmtPct(gap.mobilePct)} of traffic). Estimated ${fmtNum(lostConvPerQ)} conversions lost per quarter vs desktop parity.`,
          problem: `Mobile visitors convert at ${fmtPct(gap.mobileCvr)} — ${cvrGapPct}% lower than desktop users on the same page. With ${fmtPct(gap.mobilePct)} of traffic on mobile, this gap represents a significant and compounding lead loss.`,
          opportunity: "Add a sticky click-to-call bar at the bottom of the viewport on mobile. Reduce form field count to 3 maximum on mobile. Ensure the primary CTA is above the fold on a 375px screen. Remove any mobile interstitials or pop-ups that interrupt the conversion path.",
          why_it_matters: `If mobile CVR matched desktop on this page alone, the site would generate approximately ${fmtNum(lostConvPerQ)} additional conversions per quarter from existing traffic.`,
          recommended_next_step: "Test this page on 3 different physical mobile devices. Check: (1) Is the CTA visible without scrolling? (2) Does the form load correctly? (3) Is click-to-call present? Implement sticky mobile CTA bar within 1 sprint.",
        });
      }

      const highEngageLowConvert = ga4LandingRows
        .filter((r: any) => r.engagementRate > 0.65 && r.sessions > 30 && pct(r.conversions, r.sessions) < siteCvr * 0.45)
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 3);

      for (const row of highEngageLowConvert) {
        const pageCvr = pct(row.conversions, row.sessions);
        const prev = ga4PrevMap.get(row.page);
        const sessionNote = prev ? ` (sessions ${fmtPctChange(row.sessions, prev.sessions)} QoQ)` : "";

        croOpps.push({
          opportunity_title: `High Engagement, Low Conversion: ${shortUrl(row.page)}`,
          priority: row.sessions > 100 ? "P1" : "P2",
          impact: row.sessions > 150 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Calls, Forms",
          urls: [row.page],
          evidence: `GA4 (${pastWindowLabel}): ${fmtPct(row.engagementRate)} engagement rate, avg session ${Math.round(row.avgDuration ?? 0)}s, ${fmtNum(row.sessions)} sessions${sessionNote}, CVR ${fmtPct(pageCvr)} vs site avg ${fmtPct(siteCvr)}.`,
          problem: `Visitors spend significant time engaging with this page (${fmtPct(row.engagementRate)} engagement rate, avg ${Math.round(row.avgDuration ?? 0)} seconds) but convert at only ${fmtPct(pageCvr)} — ${((1 - pageCvr / siteCvr) * 100).toFixed(0)}% below site average. The content is compelling but the conversion path is broken or invisible.`,
          opportunity: "Add a mid-content CTA block after the second or third content section. Include a trust element (testimonial, stat, or certification) directly adjacent to the primary CTA. Test a secondary conversion option (live chat or click-to-call) for users not ready to fill a form.",
          why_it_matters: "High engagement with low conversion is the most recoverable conversion problem — the audience is interested, the CTA is failing. This is a UX fix, not an SEO fix, and results can be seen within days of implementation.",
          recommended_next_step: "Add an inline CTA block after the 2nd paragraph of body content. Copy: 'Ready to take the first step? Call us now' with a large tap-to-call button. Track CTA click events in GA4 to measure improvement.",
        });
      }

      if (ga4Funnel && ga4PrevFunnel) {
        const cvrChange = ((siteCvr! - prevSiteCvr!) / prevSiteCvr!) * 100;
        if (cvrChange < -15) {
          croOpps.push({
            opportunity_title: `Site-Wide CVR Decline: ${cvrChange.toFixed(0)}% Drop QoQ`,
            priority: "P0",
            impact: "High",
            effort: "M",
            kpi_affected: "Calls, Forms",
            urls: [],
            evidence: `GA4: Site-wide organic CVR dropped from ${fmtPct(prevSiteCvr!)} to ${fmtPct(siteCvr!)} (${cvrChange.toFixed(1)}% change). Sessions: ${fmtNum(ga4Funnel.sessions)} vs ${fmtNum(ga4PrevFunnel.sessions)} prior quarter. Conversions: ${fmtNum(ga4Funnel.conversions)} vs ${fmtNum(ga4PrevFunnel.conversions)} prior quarter.`,
            problem: `Organic conversion rate fell by ${Math.abs(cvrChange).toFixed(0)}% quarter-over-quarter across the site. This is not a traffic issue — it's a conversion issue. Something changed with the site, CTAs, forms, or competitive landscape that is suppressing lead generation from the same organic traffic volume.`,
            opportunity: "Audit for recent site changes: CTA text changes, form modifications, page redesigns, pop-up changes. Check if a specific set of landing pages is driving the site-wide decline. Review GA4 form interaction events for submission errors.",
            why_it_matters: "A site-wide CVR drop means you are generating fewer leads from the same marketing investment. If traffic recovers but CVR stays low, every future organic session also underperforms.",
            recommended_next_step: "Segment the CVR decline by top 10 landing pages. Identify which pages drove the most decline. Check form submission success events in GA4 — a broken form can cause an apparent site-wide CVR drop instantly.",
          });
        }
      }
    }

    if (!ga4Available) {
      croOpps.push({
        opportunity_title: "Connect GA4 to Enable CRO Analysis",
        priority: "P0",
        impact: "High",
        effort: "S",
        kpi_affected: "Forms, Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — GA4 not connected.",
        problem: "Without GA4, all landing page CVR, device split, and engagement analysis is impossible. CRO improvements cannot be identified, measured, or validated.",
        opportunity: "Connect GA4 in Setup → Analytics & Search. Ensure conversion events are properly configured (form submissions, click-to-call, chat initiations).",
        why_it_matters: "CRO improvements on high-traffic organic pages are the fastest way to increase lead volume without additional traffic investment.",
        recommended_next_step: "Connect GA4 credentials in Setup. Configure lead events in the Client settings (form submit event names). Regenerate this QBR Prep report.",
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
        opportunity_title: "Authority Data Requires Ahrefs or SEMrush Connection",
        priority: "P2",
        impact: "Med",
        effort: "S",
        kpi_affected: "Rankings",
        urls: [],
        evidence: "Not available — no Ahrefs or SEMrush authority/backlink data connected via integration.",
        problem: "Without backlink data, it is impossible to identify pages that need link support, diagnose ranking suppression due to low authority, or find link-building opportunities.",
        opportunity: "Connect Ahrefs or SEMrush in Setup to unlock: (1) referring domain counts per page, (2) lost links to service pages, (3) competitor backlink gap analysis, and (4) linkable asset identification.",
        why_it_matters: "For competitive treatment-sector queries, domain and page authority is often the difference between position 1–3 and position 6–10. Identifying the authority gap is the first step to closing it.",
        recommended_next_step: "Connect SEMrush or Ahrefs credentials in Setup → SEO Tools. Regenerate this QBR Prep to populate the full authority opportunity section.",
      }],
    });
  }

  if (input.includeTracking) {
    const trackingOpps: Opportunity[] = [];

    if (ga4Available && ga4Funnel !== null) {
      if (ga4Funnel.conversions === 0) {
        trackingOpps.push({
          opportunity_title: "CRITICAL: Zero Conversions in GA4 — Tracking Broken",
          priority: "P0",
          impact: "High",
          effort: "M",
          kpi_affected: "Tracking Integrity, Forms, Calls",
          urls: [],
          evidence: `GA4: 0 conversion events recorded for entire period ${pastStart} → ${pastEnd}. This means either: (1) no one converted, or (2) conversion tracking is broken.`,
          problem: "Zero GA4 conversions across the entire analysis window almost always indicates a tracking problem, not zero actual conversions. This invalidates all CVR metrics and makes performance invisible.",
          opportunity: "Audit GA4 conversion event configuration. Use GA4 DebugView to test form submissions in real time. Check that thank-you page URLs fire the conversion event. Verify GA4 is installed on all pages including thank-you pages.",
          why_it_matters: "Broken conversion tracking means every business decision about which pages to optimize, which campaigns to scale, and which SEO changes worked is based on wrong data.",
          recommended_next_step: "Open GA4 → Admin → Events → Conversions. Verify at least one event is marked as conversion. Open DebugView and submit a test form. If no event fires, the tag is broken and needs immediate remediation.",
        });
      }

      if (gscAvailable && totalGscClicks > 0 && ga4Funnel.sessions > 0) {
        const ratio = ga4Funnel.sessions / totalGscClicks;
        if (ratio < 0.5 || ratio > 2.0) {
          const direction = ratio < 0.5 ? "far fewer" : "far more";
          const note = ratio < 0.5
            ? "GA4 is likely missing the analytics tag on some pages, or there are bot clicks inflating GSC click counts."
            : "GA4 may be counting non-organic sessions, or GSC is undercounting clicks.";
          trackingOpps.push({
            opportunity_title: `GSC vs GA4 Traffic Mismatch: ${fmtPct(ratio * 100)} Ratio (Should Be ~100%)`,
            priority: "P1",
            impact: "High",
            effort: "M",
            kpi_affected: "Tracking Integrity",
            urls: [],
            evidence: `GSC: ${fmtNum(totalGscClicks)} clicks for ${pastWindowLabel}. GA4 organic sessions: ${fmtNum(ga4Funnel.sessions)}. Ratio: ${ratio.toFixed(2)}x — GA4 shows ${direction} sessions than GSC shows clicks. ${note}`,
            problem: `A ${direction === "far fewer" ? "low" : "high"} ratio between GSC clicks and GA4 organic sessions indicates a tracking discrepancy. If GA4 is undercounting, conversion data understates true performance and pages without GA4 may be invisibly converting.`,
            opportunity: "Audit GA4 tag deployment across the full site. Check if tag is present on all page templates, especially high-traffic landing pages. Use a tag auditing tool to scan for missing tags.",
            why_it_matters: "Any GSC-to-GA4 ratio below 0.7 or above 1.5 indicates a significant data quality problem. All performance metrics derived from GA4 are unreliable until resolved.",
            recommended_next_step: "Export GSC top pages by clicks. Cross-reference with GA4 Source/Medium report filtered to organic. Identify specific pages getting GSC clicks but zero GA4 sessions — these pages are missing the analytics tag.",
          });
        }
      }
    }

    if (!callTrackingAvailable && !ctReportAvailable) {
      trackingOpps.push({
        opportunity_title: "Phone Calls Not Tracked — Organic ROI Is Understated",
        priority: "P0",
        impact: "High",
        effort: "M",
        kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — no call tracking integration (CallRail or CTM) connected and no call tracking report imported.",
        problem: "For addiction treatment centers, phone calls are typically the primary intake pathway — often 60–80% of all leads. Without call tracking, organic SEO's contribution to lead generation is systematically undercounted and undervalued.",
        opportunity: "Implement CallRail or CTM with dynamic number insertion (DNI) to attribute calls to their source (organic, GBP, paid, direct). Configure separate tracking numbers for: (1) website organic visitors, (2) GBP profile, (3) paid campaigns.",
        why_it_matters: "If organic SEO drives 40 calls and 10 form submissions per month, but only the 10 form submissions are tracked, the reported organic ROI is 5x smaller than reality. This undermines the business case for SEO investment.",
        recommended_next_step: "Sign up for CallRail (basic plan ~$45/month). Get a DNI snippet installed on the website. Create tracking pools for: website, GBP, and paid. Connect to SmartEO in Setup → Call Tracking.",
      });
    }

    if (gscAvailable && gscPageRows.length > 0 && totalGscClicks > 0) {
      const ctrTrend = totalGscClicks / Math.max(totalPrevGscClicks, 1);
      if (ctrTrend < 0.85) {
        trackingOpps.push({
          opportunity_title: `GSC Click Volume Down ${fmtPctChange(totalGscClicks, totalPrevGscClicks)} QoQ — Investigate Root Cause`,
          priority: "P1",
          impact: "High",
          effort: "S",
          kpi_affected: "Rankings, CTR, Tracking Integrity",
          urls: [],
          evidence: `GSC: ${fmtNum(totalGscClicks)} clicks in ${pastWindowLabel} vs ${fmtNum(totalPrevGscClicks)} prior quarter (${fmtPctChange(totalGscClicks, totalPrevGscClicks)} change). ${fmtNum(totalGscImpressions)} total impressions.`,
          problem: "A significant drop in GSC click volume quarter-over-quarter indicates either: (1) ranking losses on key pages, (2) CTR decline without ranking changes (SERP feature competition), (3) seasonal patterns, or (4) a GSC property issue.",
          opportunity: "Segment the click decline by page and by query to identify the specific source. Diagnose whether this is a ranking issue (pages fell in position) or a CTR issue (impressions stable but fewer clicks).",
          why_it_matters: "A click decline that goes undiagnosed compounds over quarters. Identifying the root cause — and whether it is reversible — is the first step to recovery.",
          recommended_next_step: "In GSC, compare top pages from prior quarter to current. Filter by 'impressions stable, clicks down' to isolate CTR issues. Filter by 'impressions down' to find ranking losses. For each category, generate targeted content or technical fix recommendations.",
        });
      }
    }

    allCategories.push({
      category_name: "Tracking / Measurement Opportunities",
      opportunities: scoreOpps(trackingOpps).slice(0, cap),
    });
  }

  // Build wins from actual data comparison
  if (gscAvailable && gscPageRows.length > 0 && gscPrevPageRows.length > 0) {
    const topClickGain = gscPageRows
      .filter((r: any) => {
        const prev = gscPrevPageMap.get(r.keys?.[0]);
        return prev && (r.clicks ?? 0) > (prev.clicks ?? 0) + 10;
      })
      .sort((a: any, b: any) => {
        const prevA = gscPrevPageMap.get(a.keys?.[0]);
        const prevB = gscPrevPageMap.get(b.keys?.[0]);
        const gainA = (a.clicks ?? 0) - (prevA?.clicks ?? 0);
        const gainB = (b.clicks ?? 0) - (prevB?.clicks ?? 0);
        return gainB - gainA;
      })[0];

    if (topClickGain) {
      const prev = gscPrevPageMap.get(topClickGain.keys?.[0]);
      allWins.push({
        title: `Top Organic Click Gain: ${shortUrl(topClickGain.keys?.[0] ?? "")} +${fmtNum((topClickGain.clicks ?? 0) - (prev?.clicks ?? 0))} clicks`,
        evidence: `GSC: ${fmtNum(topClickGain.clicks ?? 0)} clicks (${pastWindowLabel}) vs ${fmtNum(prev?.clicks ?? 0)} prior quarter. ${fmtPctChange(topClickGain.clicks ?? 0, prev?.clicks ?? 0)} increase. Avg position: ${(topClickGain.position ?? 0).toFixed(1)}.`,
        source: "GSC",
      });
    }

    const bigPositionGain = gscPageRows
      .filter((r: any) => {
        const prev = gscPrevPageMap.get(r.keys?.[0]);
        return prev && (prev.position ?? 100) - (r.position ?? 100) > 3 && (r.impressions ?? 0) > 100;
      })
      .sort((a: any, b: any) => {
        const prevA = gscPrevPageMap.get(a.keys?.[0]);
        const prevB = gscPrevPageMap.get(b.keys?.[0]);
        return ((prevA?.position ?? 0) - (a.position ?? 0)) - ((prevB?.position ?? 0) - (b.position ?? 0));
      }).reverse()[0];

    if (bigPositionGain && allWins.length < 3) {
      const prev = gscPrevPageMap.get(bigPositionGain.keys?.[0]);
      const gain = ((prev?.position ?? 0) - (bigPositionGain.position ?? 0)).toFixed(1);
      allWins.push({
        title: `Ranking Improvement: ${shortUrl(bigPositionGain.keys?.[0] ?? "")} — up ${gain} positions`,
        evidence: `GSC: avg position improved from ${(prev?.position ?? 0).toFixed(1)} to ${(bigPositionGain.position ?? 0).toFixed(1)} (↑${gain} positions). Impressions: ${fmtNum(bigPositionGain.impressions ?? 0)}.`,
        source: "GSC",
      });
    }
  }

  if (ga4Available && ga4Funnel && ga4PrevFunnel && allWins.length < 3) {
    const sessChange = fmtPctChange(ga4Funnel.sessions, ga4PrevFunnel.sessions);
    const convChange = fmtPctChange(ga4Funnel.conversions, ga4PrevFunnel.conversions);
    if (ga4Funnel.sessions > ga4PrevFunnel.sessions || ga4Funnel.conversions > ga4PrevFunnel.conversions) {
      allWins.push({
        title: `Organic Growth: ${sessChange} sessions, ${convChange} conversions QoQ`,
        evidence: `GA4: ${fmtNum(ga4Funnel.sessions)} organic sessions (${sessChange}) and ${fmtNum(ga4Funnel.conversions)} conversions (${convChange}) vs prior quarter.`,
        source: "GA4",
      });
    }
  }

  if (sfAvailable && sfData.length > 0 && allWins.length < 3) {
    allWins.push({
      title: `Site Crawled: ${fmtNum(sfData.length)} URLs Analyzed`,
      evidence: `Screaming Frog: Full crawl of ${fmtNum(sfData.length)} URLs completed. Technical audit data available for all opportunity categories.`,
      source: "Screaming Frog",
    });
  }

  while (allWins.length < 3) {
    const placeholders = [
      { title: "Analytics Connections Needed for Win Detection", evidence: "Connect GSC, GA4, and call tracking to enable automated win detection from real data.", source: "N/A" },
      { title: "Manual Win Identification Required", evidence: "Review performance data in each connected tool to identify the top 3 positive outcomes from the quarter.", source: "N/A" },
      { title: "Prior Quarter Data Not Available", evidence: "Win comparison requires data from both the current and prior quarter.", source: "N/A" },
    ];
    allWins.push(placeholders[allWins.length] ?? placeholders[2]);
  }

  const allOpps: Array<Opportunity & { category: string }> = allCategories.flatMap(cat =>
    cat.opportunities.map(o => ({ ...o, category: cat.category_name }))
  );
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const impactOrder = { High: 0, Med: 1, Low: 2 };

  const sortedForTop = [...allOpps].sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return impactOrder[a.impact] - impactOrder[b.impact];
  });

  const seenCats = new Set<string>();
  const topOpps: TopOpportunity[] = [];
  for (const o of sortedForTop) {
    if (topOpps.length >= 5) break;
    if (!seenCats.has(o.category) || topOpps.length < 3) {
      seenCats.add(o.category);
      topOpps.push({ title: o.opportunity_title, category: o.category, priority: o.priority, impact: o.impact, kpi: o.kpi_affected });
    }
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
      wins: allWins.slice(0, 3),
      top_opportunities: topOpps.slice(0, 5),
    },
    opportunity_backlog: allCategories,
  };

  const markdown = buildMarkdown(json);
  console.log(`[QBR Prep] Done — ${allOpps.length} total opportunities across ${allCategories.length} categories`);
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
  lines.push("## Executive Summary");
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
  lines.push("## Opportunity Backlog");
  const catLetters = ["A", "B", "C", "D", "E", "F"];
  for (let ci = 0; ci < j.opportunity_backlog.length; ci++) {
    const cat = j.opportunity_backlog[ci];
    const letter = catLetters[ci] ?? String(ci + 1);
    lines.push(`### ${letter}. ${cat.category_name}`);
    lines.push("");
    if (cat.opportunities.length === 0) { lines.push("*No opportunities identified.*"); lines.push(""); continue; }
    for (let oi = 0; oi < cat.opportunities.length; oi++) {
      const o = cat.opportunities[oi];
      lines.push(`**${oi + 1}. ${o.opportunity_title}**`);
      lines.push(`- **Priority:** ${o.priority}  **Impact:** ${o.impact}  **Effort:** ${o.effort}  **KPI:** ${o.kpi_affected}`);
      if (o.urls.length > 0) lines.push(`- **URL(s):** ${o.urls.join(", ")}`);
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
