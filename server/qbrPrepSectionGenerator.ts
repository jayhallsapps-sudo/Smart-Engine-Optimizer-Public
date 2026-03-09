import { storage } from "./storage";
import { getGoogleAccessToken } from "./googleToken";
import { fetchNsmGoals } from "./sheetsClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog } from "./asanaClient";
import { queryCallRail } from "./callrailClient";
import type { Client } from "@shared/schema";
import type {
  QbrPrepReportData,
  QbrPrepMeta,
  Section1Goals,
  Section2Conversions,
  Section3Traffic,
  Section4Services,
  Section5Diagnosis,
  Section6Priorities,
  Section7Tracking,
  SourceSnapshot,
  GenerationMeta,
  GoalRow,
  ConvertingPageRow,
  ConvertingSourceRow,
  TrafficTopicRow,
  TrafficPageRow,
  ServiceRow,
  PriorityRow,
  TrackingRow,
} from "./qbrPrepTypes";
import {
  inferQuarter,
  isBrandedQuery,
  classifyPageType,
  classifyAdmitConnection,
  classifyQueryTopic,
  clusterQueriesByTopic,
  topicAdmitConnection,
  diagnoseTier,
  analyzeSfForTierInput,
  type QuarterInfo,
  type TierDiagnosisInput,
} from "./qbrPrepHelpers";

const ME = "Manual entry needed";

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

async function gscFetch(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 200
): Promise<any[]> {
  try {
    const body: any = { startDate, endDate, dimensions, rowLimit };
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

async function ga4Fetch(accessToken: string, propertyId: string, body: any): Promise<any> {
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

export interface QbrPrepGenerateInput {
  clientId: number;
  generationDate: string;
  sentiment?: string;
  hypothesis?: string;
  auditNotes?: string;
}

export async function generateQbrPrepReport(input: QbrPrepGenerateInput): Promise<QbrPrepReportData> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const genDate = new Date(input.generationDate + "T12:00:00");
  const quarter = inferQuarter(genDate);

  console.log(`[QBR Prep V2] Generating for ${client.name} | Analysis: ${quarter.analysisStart} → ${quarter.analysisEnd} | Planning: Q${quarter.planningQ} ${quarter.planningYear}`);

  const [gscToken, ga4Token] = await Promise.all([
    getGoogleAccessToken("google_search_console"),
    getGoogleAccessToken("google_analytics_4"),
  ]);

  const sfReports = await storage.getSfReports(client.id).catch(() => []);
  const latestSf = sfReports[0];
  const sfData = latestSf ? ((latestSf.data ?? []) as Record<string, any>[]) : [];
  const sfHeaders = latestSf ? (latestSf.headers ?? []) : [];

  const dataSources: string[] = [];
  const missingData: string[] = [];

  let nsmData: any = null;
  try {
    nsmData = await fetchNsmGoals(client.name);
    if (nsmData && nsmData.quarter !== "—") dataSources.push("Google Sheets NSM Tracker");
    else nsmData = null;
  } catch {
    nsmData = null;
  }
  if (!nsmData) missingData.push("NSM Tracker");

  let gscQueryRows: any[] = [];
  let gscPageRows: any[] = [];
  let gscQueryPageRows: any[] = [];
  const gscAvailable = !!(gscToken && client.gscSiteUrl);
  if (gscAvailable) {
    [gscQueryRows, gscPageRows, gscQueryPageRows] = await Promise.all([
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["query"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["page"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["query", "page"], 100),
    ]);
    if (gscQueryRows.length > 0) dataSources.push("Google Search Console");
    else missingData.push("GSC");
  } else {
    missingData.push("GSC");
  }

  let ga4LandingRows: any[] = [];
  let ga4FunnelCurr: { sessions: number; conversions: number } | null = null;
  const ga4Available = !!(ga4Token && client.ga4PropertyId);
  if (ga4Available) {
    const [landingData, funnelData] = await Promise.all([
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: quarter.analysisStart, endDate: quarter.analysisEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 100,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: quarter.analysisStart, endDate: quarter.analysisEnd }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
    ]);

    if (landingData?.rows) {
      ga4LandingRows = landingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
      }));
      dataSources.push("Google Analytics 4");
    } else {
      missingData.push("GA4");
    }

    if (funnelData?.rows?.[0]) {
      ga4FunnelCurr = {
        sessions: parseFloat(funnelData.rows[0].metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(funnelData.rows[0].metricValues?.[1]?.value ?? "0"),
      };
    }
  } else {
    missingData.push("GA4");
  }

  if (sfData.length > 0) dataSources.push("Screaming Frog");
  else missingData.push("Screaming Frog");

  let callTrackingData: any = null;
  let callTrackingLandingPages: Array<{ page: string; calls: number }> = [];
  let callTrackingSources: Array<{ source: string; calls: number }> = [];
  try {
    if (client.callrailCompanyId) {
      const dateRange = `custom:${quarter.analysisStart}:${quarter.analysisEnd}`;
      const [landingResult, sourceResult] = await Promise.allSettled([
        queryCallRail("callrail_qoq_top_landing_pages", client, dateRange),
        queryCallRail("callrail_qoq_organic_calls", client, dateRange),
      ]);
      if (landingResult.status === "fulfilled" && landingResult.value) {
        const rows = landingResult.value.tables?.[0]?.rows ?? [];
        callTrackingLandingPages = rows.map((r: string[]) => ({
          page: r[0] ?? "/",
          calls: parseInt((r[1] ?? "0").replace(/,/g, ""), 10) || 0,
        })).filter((r: { page: string; calls: number }) => r.calls > 0);
      }
      if (sourceResult.status === "fulfilled" && sourceResult.value) {
        const rows = sourceResult.value.tables?.[0]?.rows ?? [];
        callTrackingSources = rows.map((r: string[]) => ({
          source: r[0] ?? "Unknown",
          calls: parseInt((r[1] ?? "0").replace(/,/g, ""), 10) || 0,
        })).filter((r: { source: string; calls: number }) => r.calls > 0);
      }
      if (callTrackingLandingPages.length > 0 || callTrackingSources.length > 0) {
        dataSources.push("CallRail");
      }
      callTrackingData = { landingPages: callTrackingLandingPages, sources: callTrackingSources };
    }
  } catch (err: any) {
    console.warn("[QBR Prep] Call tracking fetch failed:", err.message);
  }

  let airtableItems: any[] = [];
  try {
    const atResult = await fetchAirtableWorkLog(client, quarter.analysisStart, quarter.analysisEnd, "work");
    if (atResult.success && atResult.data) {
      airtableItems = Object.values(atResult.data.byCreditType).flat();
      if (airtableItems.length > 0) dataSources.push("Airtable");
    }
  } catch {}

  let asanaTasks: any[] = [];
  try {
    if (client.asanaProjectId) {
      const asanaResult = await fetchAsanaWorkLog(client, quarter.analysisStart, quarter.analysisEnd);
      if (asanaResult?.tasks) {
        asanaTasks = asanaResult.tasks;
        if (asanaTasks.length > 0) dataSources.push("Asana");
      }
    }
  } catch {}

  const domain = client.gscSiteUrl?.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "") ?? ME;

  const meta: QbrPrepMeta = {
    site: client.name,
    domain,
    primaryLocation: inferLocation(sfData, sfHeaders, client),
    programPositioning: inferProgram(sfData, sfHeaders),
    analysisWindow: quarter.analysisWindowLabel,
    analysisWindowStart: quarter.analysisStart,
    analysisWindowEnd: quarter.analysisEnd,
    planningQuarter: quarter.planningQuarterLabel,
    planningYear: quarter.planningYear,
    generatedOn: input.generationDate,
  };

  const section1 = generateSection1(nsmData, ga4FunnelCurr, quarter);
  const section2 = generateSection2(ga4LandingRows, gscPageRows, sfData, sfHeaders, client, callTrackingLandingPages, callTrackingSources);
  const section3 = generateSection3(gscQueryRows, gscPageRows, ga4LandingRows, client);
  const section4 = generateSection4(sfData, sfHeaders, client);

  const sfTierInput = analyzeSfForTierInput(sfData, sfHeaders);
  const tierInput: TierDiagnosisInput = {
    sfData,
    sfHeaders,
    totalUrls: sfTierInput.totalUrls ?? sfData.length,
    errors4xx5xx: sfTierInput.errors4xx5xx ?? 0,
    redirects: sfTierInput.redirects ?? 0,
    nonIndexable: sfTierInput.nonIndexable ?? 0,
    missingTitles: sfTierInput.missingTitles ?? 0,
    missingH1s: sfTierInput.missingH1s ?? 0,
    servicePageTypes: sfTierInput.servicePageTypes ?? [],
    hasVobPage: sfTierInput.hasVobPage ?? false,
    hasContactPage: sfTierInput.hasContactPage ?? false,
    hasDetoxPage: sfTierInput.hasDetoxPage ?? false,
    hasResidentialPage: sfTierInput.hasResidentialPage ?? false,
    hasConditionsHub: sfTierInput.hasConditionsHub ?? false,
    hasTherapiesHub: sfTierInput.hasTherapiesHub ?? false,
    hasLocationPage: sfTierInput.hasLocationPage ?? false,
    highIntentTrafficLandsOnClearUrls: checkHighIntentLanding(gscPageRows, sfData, sfHeaders),
    duplicateServicePages: sfTierInput.duplicateServicePages ?? 0,
    thinPages: sfTierInput.thinPages ?? 0,
    overlapGeoPages: sfTierInput.overlapGeoPages ?? 0,
    hasAboutPage: sfTierInput.hasAboutPage ?? false,
    hasTeamPage: sfTierInput.hasTeamPage ?? false,
    hasAlumniPage: sfTierInput.hasAlumniPage ?? false,
  };

  const tierDiagnosis = diagnoseTier(tierInput);
  const section5: Section5Diagnosis = {
    tier: tierDiagnosis.tier,
    tierName: tierDiagnosis.tierName,
    diagnosis: tierDiagnosis.diagnosis,
  };

  const completedWork = [...airtableItems.map(i => i.task), ...asanaTasks.filter((t: any) => t.completed).map((t: any) => t.name)];
  const section6 = generateSection6(
    section1, section2, section3, section4, section5, tierInput,
    completedWork, input.sentiment, input.hypothesis, input.auditNotes
  );
  const section7 = generateSection7(section6, section5);

  const sourceSnapshot: SourceSnapshot = {
    smartSeoClientMeta: { name: client.name, domain, brandTerms: client.brandTerms },
    nsmTracker: nsmData,
    gsc: gscQueryRows.length > 0 ? { queryCount: gscQueryRows.length, pageCount: gscPageRows.length } : null,
    ga4: ga4FunnelCurr,
    gbp: null,
    callTracking: callTrackingData,
    screamingFrog: sfData.length > 0 ? { totalUrls: sfData.length, errors: tierInput.errors4xx5xx } : null,
    airtable: airtableItems.length > 0 ? { itemCount: airtableItems.length } : null,
    asana: asanaTasks.length > 0 ? { taskCount: asanaTasks.length } : null,
    manualInputs: {
      sentiment: input.sentiment,
      hypothesis: input.hypothesis,
      auditNotes: input.auditNotes,
    },
  };

  return {
    meta,
    section1Goals: section1,
    section2Conversions: section2,
    section3Traffic: section3,
    section4Services: section4,
    section5Diagnosis: section5,
    section6Priorities: section6,
    section7Tracking: section7,
    sourceSnapshot,
    generationMeta: {
      generatedAt: new Date().toISOString(),
      dataSources,
      missingData,
    },
  };
}

function inferLocation(sfData: Record<string, any>[], sfHeaders: string[], client: Client): string {
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const urls = sfData.map(r => String(r[urlCol] ?? "").toLowerCase());

  const knownCities = [
    "huntington-beach", "costa-mesa", "irvine", "laguna-beach", "laguna-hills",
    "laguna-niguel", "newport-beach", "anaheim", "san-diego", "los-angeles",
    "orange-county", "santa-ana", "long-beach", "torrance", "pasadena",
    "santa-monica", "culver-city", "burbank", "glendale", "pomona",
  ];

  const exactCityPattern = new RegExp(`\\/(${knownCities.join("|")})(?:\\/|$|-ca\\b|-california\\b)`, "i");

  const generalPatterns = [
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-california\b/i,
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-ca\b/i,
  ];

  for (const url of urls) {
    const exact = url.match(exactCityPattern);
    if (exact) {
      return exact[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
    }
    for (const p of generalPatterns) {
      const m = url.match(p);
      if (m) {
        const words = m[1].split("-").filter(w => w.length >= 2);
        if (words.length > 0) {
          return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
        }
      }
    }
  }

  if (client.gbpLocationName) return client.gbpLocationName;
  return ME;
}

function inferProgram(sfData: Record<string, any>[], sfHeaders: string[]): string {
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const titleCol = sfHeaders.find(h => /^title/i.test(h)) ?? "";
  const urls = sfData.map(r => ({
    url: String(r[urlCol] ?? "").toLowerCase(),
    title: String(r[titleCol] ?? "").toLowerCase(),
  }));

  const hasWomens = urls.some(u => /women|woman|female/i.test(u.url) || /women|woman|female/i.test(u.title));
  const hasMens = urls.some(u => /\bmen\b|male/i.test(u.url) || /\bmen\b|male/i.test(u.title));
  const hasDualDiagnosis = urls.some(u => /dual.?diagnosis|co.?occurring/i.test(u.url));
  const hasDetox = urls.some(u => /detox/i.test(u.url));

  const parts: string[] = [];
  if (hasWomens) parts.push("Women's");
  if (hasMens) parts.push("Men's");
  if (hasDetox) parts.push("Detox");
  parts.push("Addiction Treatment");
  if (hasDualDiagnosis) parts.push("& Dual Diagnosis");

  return parts.length > 1 ? parts.join(" ") : ME;
}

function generateSection1(nsmData: any, ga4Funnel: any, quarter: QuarterInfo): Section1Goals {
  const rows: GoalRow[] = [];

  if (nsmData) {
    const sessGoal = nsmData.sessionsGoal !== "—" ? nsmData.sessionsGoal : null;
    const sessActual = nsmData.sessionsActual !== "—" ? nsmData.sessionsActual : null;
    const sessPct = nsmData.sessionsPercent !== "—" ? nsmData.sessionsPercent : null;
    const sessOnTrack = nsmData.sessionsOnTrack !== "—" ? nsmData.sessionsOnTrack : null;

    let recommendedGoal = sessGoal ?? ME;
    let goalShift = "Maintain";
    let reason = ME;

    if (sessGoal && sessActual && sessPct) {
      const actualNum = parseInt(String(sessActual).replace(/[^0-9]/g, ""), 10);
      const goalNum = parseInt(String(sessGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(actualNum) && !isNaN(goalNum) && goalNum > 0) {
        const pacing = actualNum / goalNum;
        if (pacing >= 0.9) {
          recommendedGoal = fmtNum(Math.round(goalNum * 1.05));
          goalShift = "+5%";
          reason = `On pace at ${sessPct} through current quarter. Modest increase is realistic given current trajectory.`;
        } else if (pacing >= 0.7) {
          recommendedGoal = fmtNum(goalNum);
          goalShift = "Maintain";
          reason = `Tracking at ${sessPct} — maintaining current goal is realistic while addressing site improvements.`;
        } else {
          recommendedGoal = fmtNum(Math.round(goalNum * 0.95));
          goalShift = "-5%";
          reason = `Behind pace at ${sessPct}. Slight reduction reflects realistic expectations while focusing on site fundamentals.`;
        }
      }
    }

    rows.push({
      goalType: "Primary Goal",
      goal: `${recommendedGoal} organic sessions`,
      measurementSource: "Google Sheets NSM + GA4",
      goalShift,
      reason,
    });

    const mvpType = nsmData.mvpType !== "—" ? nsmData.mvpType : "Calls";
    const mvpGoal = nsmData.mvpGoal !== "—" ? nsmData.mvpGoal : null;
    const mvpActual = nsmData.mvpActual !== "—" ? nsmData.mvpActual : null;

    let mvpRecommended = mvpGoal ?? ME;
    let mvpShift = "Maintain";
    let mvpReason = ME;

    if (mvpGoal && mvpActual) {
      const mvpActNum = parseInt(String(mvpActual).replace(/[^0-9]/g, ""), 10);
      const mvpGoalNum = parseInt(String(mvpGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(mvpActNum) && !isNaN(mvpGoalNum) && mvpGoalNum > 0) {
        const pacing = mvpActNum / mvpGoalNum;
        if (pacing >= 0.9) {
          mvpRecommended = fmtNum(Math.round(mvpGoalNum * 1.05));
          mvpShift = "+5%";
          mvpReason = `${mvpType} on pace. Slight increase is achievable.`;
        } else {
          mvpRecommended = fmtNum(mvpGoalNum);
          mvpShift = "Maintain";
          mvpReason = `${mvpType} tracking at ${mvpActual}/${mvpGoal}. Maintaining goal while improving conversion paths.`;
        }
      }
    }

    rows.push({
      goalType: "Secondary Goal",
      goal: `${mvpRecommended} ${mvpType.toLowerCase()}`,
      measurementSource: `Google Sheets NSM + ${mvpType === "Calls" || mvpType === "Leads" ? "Call Tracking" : "GA4"}`,
      goalShift: mvpShift,
      reason: mvpReason,
    });
  } else if (ga4Funnel) {
    rows.push({
      goalType: "Primary Goal",
      goal: `${fmtNum(ga4Funnel.sessions)} organic sessions (QTD baseline)`,
      measurementSource: "GA4",
      goalShift: ME,
      reason: `${ME}: NSM tracker not available. Using GA4 QTD sessions as baseline.`,
    });
    rows.push({
      goalType: "Secondary Goal",
      goal: ga4Funnel.conversions > 0 ? `${fmtNum(ga4Funnel.conversions)} conversions (QTD baseline)` : ME,
      measurementSource: "GA4",
      goalShift: ME,
      reason: `${ME}: conversion goal needs manual validation`,
    });
  } else {
    rows.push(
      { goalType: "Primary Goal", goal: ME, measurementSource: ME, goalShift: ME, reason: `${ME}: no data sources available` },
      { goalType: "Secondary Goal", goal: ME, measurementSource: ME, goalShift: ME, reason: `${ME}: no data sources available` },
    );
  }

  return { rows };
}

function generateSection2(
  ga4Landing: any[],
  gscPages: any[],
  sfData: Record<string, any>[],
  sfHeaders: string[],
  client: Client,
  callLandingPages: Array<{ page: string; calls: number }> = [],
  callSources: Array<{ source: string; calls: number }> = []
): Section2Conversions {
  const topConvertingPages: ConvertingPageRow[] = [];
  const topConvertingSources: ConvertingSourceRow[] = [];

  // --- TOP CONVERTING PAGES ---
  // Priority 1: GA4 organic conversions
  const ga4WithConversions = ga4Landing
    .filter(r => (r.conversions ?? 0) > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 8);

  const totalGa4Conversions = ga4Landing.reduce((s, r) => s + (r.conversions ?? 0), 0);

  for (const row of ga4WithConversions) {
    const pageType = classifyPageType(row.page);
    topConvertingPages.push({
      type: pageType,
      page: shortUrl(row.page),
      conversionSource: `${fmtNum(row.conversions)} conversions (GA4 organic)`,
      notes: getConversionNote(pageType, row.conversions, row.sessions),
    });
  }

  // Priority 2: CallRail top organic call landing pages (fill remaining slots up to 8)
  if (callLandingPages.length > 0) {
    const seenPages = new Set(ga4WithConversions.map(r => shortUrl(r.page)));
    const crRows = callLandingPages
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8);
    for (const row of crRows) {
      if (topConvertingPages.length >= 8) break;
      const normalized = row.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      const shortP = normalized.length > 60 ? normalized.slice(0, 57) + "…" : normalized;
      if (seenPages.has(shortP)) continue;
      const pageType = classifyPageType(row.page);
      topConvertingPages.push({
        type: pageType,
        page: shortP,
        conversionSource: `${fmtNum(row.calls)} organic calls (CallRail)`,
        notes: getConversionNote(pageType, row.calls, 0),
      });
      seenPages.add(shortP);
    }
  }

  // Priority 3: Client money pages (always configured — inferred signal)
  const moneyPages: string[] = (client as any).moneyPages ?? [];
  if (moneyPages.length > 0 && topConvertingPages.length === 0) {
    for (const mp of moneyPages.slice(0, 6)) {
      const pageType = classifyPageType(mp);
      topConvertingPages.push({
        type: pageType,
        page: shortUrl(mp),
        conversionSource: "Priority service page surfaced as a likely conversion target; direct page-level attribution unavailable",
        notes: getConversionNote(pageType, 0, 0),
      });
    }
  }

  // Priority 4: GSC top pages by clicks (visibility proxy when no conversion data)
  if (topConvertingPages.length === 0 && gscPages.length > 0) {
    const topGsc = gscPages
      .sort((a: any, b: any) => (b.clicks ?? 0) - (a.clicks ?? 0))
      .slice(0, 6);
    for (const row of topGsc) {
      const pageUrl = row.keys?.[0] ?? "";
      const pageType = classifyPageType(pageUrl);
      topConvertingPages.push({
        type: pageType,
        page: shortUrl(pageUrl),
        conversionSource: `${fmtNum(row.clicks ?? 0)} organic clicks (GSC — conversion data unavailable)`,
        notes: getConversionNote(pageType, 0, 0),
      });
    }
  }

  // Final fallback
  if (topConvertingPages.length === 0) {
    topConvertingPages.push({
      type: ME,
      page: ME,
      conversionSource: `${ME}: no conversion data available from GA4, CallRail, or GSC`,
      notes: ME,
    });
  }

  // --- TOP CONVERTING SOURCES ---
  // Priority 1: GA4 page-type aggregation (conversions)
  if (ga4WithConversions.length > 0) {
    const sourceMap = new Map<string, { conversions: number; pages: string[] }>();
    for (const row of ga4WithConversions) {
      const pageType = classifyPageType(row.page);
      if (!sourceMap.has(pageType)) sourceMap.set(pageType, { conversions: 0, pages: [] });
      const entry = sourceMap.get(pageType)!;
      entry.conversions += row.conversions;
      entry.pages.push(shortUrl(row.page));
    }
    for (const [source, data] of [...sourceMap.entries()]
      .sort((a, b) => b[1].conversions - a[1].conversions)
      .slice(0, 5)) {
      topConvertingSources.push({
        source,
        whatsConverting: `${fmtNum(data.conversions)} conversions across ${data.pages.length} page${data.pages.length !== 1 ? "s" : ""}`,
        notes: classifyAdmitConnection(source, data.conversions, totalGa4Conversions) === "Direct"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
      });
    }
  }

  // Priority 2: CallRail organic sources (call volume by source)
  if (callSources.length > 0 && topConvertingSources.length < 5) {
    const existingSources = new Set(topConvertingSources.map(s => s.source));
    const totalCalls = callSources.reduce((s, r) => s + r.calls, 0);
    for (const src of callSources.sort((a, b) => b.calls - a.calls).slice(0, 5)) {
      if (topConvertingSources.length >= 5) break;
      if (existingSources.has(src.source)) continue;
      const pct = totalCalls > 0 ? Math.round(src.calls / totalCalls * 100) : 0;
      topConvertingSources.push({
        source: src.source,
        whatsConverting: `${fmtNum(src.calls)} organic calls (${pct}% of tracked calls)`,
        notes: "Call tracking source — confirm with admissions team",
      });
      existingSources.add(src.source);
    }
  }

  // Priority 3: Infer from CallRail landing page types if still empty
  if (topConvertingSources.length === 0 && callLandingPages.length > 0) {
    const typeMap = new Map<string, { calls: number; pages: number }>();
    for (const row of callLandingPages) {
      const pt = classifyPageType(row.page);
      if (!typeMap.has(pt)) typeMap.set(pt, { calls: 0, pages: 0 });
      const e = typeMap.get(pt)!;
      e.calls += row.calls;
      e.pages++;
    }
    for (const [pageType, data] of [...typeMap.entries()]
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 5)) {
      topConvertingSources.push({
        source: pageType,
        whatsConverting: `${fmtNum(data.calls)} calls from ${data.pages} page${data.pages !== 1 ? "s" : ""} (CallRail)`,
        notes: classifyAdmitConnection(pageType, data.calls, callLandingPages.reduce((s, r) => s + r.calls, 0)) === "Direct"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
      });
    }
  }

  // Priority 4: Infer from money page types
  if (topConvertingSources.length === 0 && moneyPages.length > 0) {
    const typeSet = new Map<string, number>();
    for (const mp of moneyPages) {
      const pt = classifyPageType(mp);
      typeSet.set(pt, (typeSet.get(pt) ?? 0) + 1);
    }
    for (const [pt, cnt] of [...typeSet.entries()].slice(0, 4)) {
      topConvertingSources.push({
        source: pt,
        whatsConverting: `${cnt} configured priority page${cnt !== 1 ? "s" : ""} (no tracking data)`,
        notes: classifyAdmitConnection(pt, 0, 0) === "Direct"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
      });
    }
  }

  // Final fallback
  if (topConvertingSources.length === 0) {
    topConvertingSources.push({
      source: ME,
      whatsConverting: `${ME}: no source attribution available from GA4, CallRail, or config`,
      notes: ME,
    });
  }

  return { topConvertingPages, topConvertingSources };
}

function getConversionNote(pageType: string, conversions: number, sessions: number): string {
  const cvr = sessions > 0 ? (conversions / sessions * 100).toFixed(1) : "—";
  if (pageType === "Verify Insurance") return `VOB page — strongest conversion assist. ${cvr}% CVR.`;
  if (pageType === "Contact / Admissions") return `Direct admissions path. ${cvr}% CVR.`;
  if (pageType === "Detox" || pageType === "Residential / Inpatient") return `High-intent service page. ${cvr}% CVR.`;
  if (pageType === "PHP / IOP") return `Treatment level page contributing to conversion funnel. ${cvr}% CVR.`;
  if (pageType === "Homepage") return `Branded entry point. ${cvr}% CVR — likely navigational.`;
  return `${cvr}% CVR`;
}

function generateSection3(
  gscQueries: any[],
  gscPages: any[],
  ga4Landing: any[],
  client: Client
): Section3Traffic {
  const topTrafficTopics: TrafficTopicRow[] = [];
  const topTrafficPages: TrafficPageRow[] = [];

  if (gscQueries.length > 0) {
    const queryData = gscQueries.map(r => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    const clusters = clusterQueriesByTopic(queryData, client);
    const topicSummaries = [...clusters.entries()]
      .map(([topic, queries]) => ({
        topic,
        totalClicks: queries.reduce((s, q) => s + q.clicks, 0),
        totalImpressions: queries.reduce((s, q) => s + q.impressions, 0),
        avgCtr: queries.length > 0 ? queries.reduce((s, q) => s + q.ctr, 0) / queries.length : 0,
        examples: queries.sort((a, b) => b.clicks - a.clicks).slice(0, 3).map(q => q.query),
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks)
      .slice(0, 8);

    const totalClicks = gscQueries.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);

    for (const ts of topicSummaries) {
      const connection = topicAdmitConnection(ts.topic);
      let insight = "";
      const clickShare = totalClicks > 0 ? (ts.totalClicks / totalClicks * 100).toFixed(0) : "—";
      if (ts.topic === "Branded Navigation") {
        insight = `${clickShare}% of clicks are branded — ${ts.totalClicks > totalClicks * 0.5 ? "heavy reliance on brand traffic" : "healthy brand presence"}`;
      } else if (connection === "Direct") {
        insight = `${clickShare}% of clicks. High-intent service traffic — directly tied to admissions.`;
      } else if (connection === "Assisted") {
        insight = `${clickShare}% of clicks. Supporting traffic that assists conversion pathway.`;
      } else {
        insight = `${clickShare}% of clicks. Low admit connection — mostly informational.`;
      }

      topTrafficTopics.push({
        topic: ts.topic,
        exampleQueries: ts.examples.join(", "),
        connectionToAdmits: connection,
        insight,
      });
    }
  }

  if (gscPages.length > 0) {
    const topPages = [...gscPages]
      .sort((a: any, b: any) => (b.clicks ?? 0) - (a.clicks ?? 0))
      .slice(0, 10);

    const totalConversions = ga4Landing.reduce((s, r) => s + (r.conversions ?? 0), 0);

    for (const row of topPages) {
      const page = row.keys?.[0] ?? "";
      const pageType = classifyPageType(page);
      const connection = classifyAdmitConnection(pageType, 0, totalConversions);

      topTrafficPages.push({
        page: shortUrl(page),
        clicks: fmtNum(row.clicks ?? 0),
        ctr: fmtPct(row.ctr ?? 0),
        connectionToAdmits: connection,
        insight: pageType !== "Other" ? `${pageType} page` : "",
      });
    }
  }

  if (topTrafficTopics.length === 0) {
    topTrafficTopics.push({
      topic: ME,
      exampleQueries: ME,
      connectionToAdmits: ME,
      insight: `${ME}: GSC query data unavailable`,
    });
  }

  if (topTrafficPages.length === 0) {
    topTrafficPages.push({
      page: ME,
      clicks: "—",
      ctr: "—",
      connectionToAdmits: ME,
      insight: `${ME}: GSC page data unavailable`,
    });
  }

  return { topTrafficTopics, topTrafficPages };
}

function generateSection4(
  sfData: Record<string, any>[],
  sfHeaders: string[],
  client: Client
): Section4Services {
  const services: ServiceRow[] = [];
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";

  const serviceTargets = [
    { service: "Detox", pattern: /\/detox/i },
    { service: "Residential / Inpatient", pattern: /\/residential|\/inpatient/i },
    { service: "PHP / IOP", pattern: /\/php|\/iop|\/partial|\/intensive/i },
    { service: "Outpatient", pattern: /\/outpatient(?!.*intensive)/i },
    { service: "Dual Diagnosis", pattern: /\/dual.?diagnosis|\/co.?occurring/i },
    { service: "Verify Insurance", pattern: /\/verify|\/vob|\/insurance/i },
    { service: "Contact / Admissions", pattern: /\/contact|\/admissions|\/get.?help/i },
    { service: "Primary Location", pattern: /\/location|\/campus|\/facility/i },
    { service: "Therapies", pattern: /\/therap(y|ies)|\/treatment.?modalities/i },
    { service: "Conditions", pattern: /\/conditions|\/mental.?health|\/disorders/i },
  ];

  if (sfData.length > 0 && urlCol) {
    const urls = sfData.map(r => String(r[urlCol] ?? ""));

    for (const target of serviceTargets) {
      const match = urls.find(u => target.pattern.test(u));
      if (match) {
        services.push({
          service: target.service,
          examplePage: shortUrl(match),
        });
      }
    }
  }

  if (services.length < 5) {
    for (const target of serviceTargets) {
      if (!services.find(s => s.service === target.service)) {
        services.push({
          service: target.service,
          examplePage: ME,
        });
      }
      if (services.length >= 8) break;
    }
  }

  return { services: services.slice(0, 8) };
}

function checkHighIntentLanding(gscPages: any[], sfData: Record<string, any>[], sfHeaders: string[]): boolean {
  if (gscPages.length === 0) return true;
  const topPages = gscPages.slice(0, 20);
  let highIntentOnClearUrl = 0;
  for (const row of topPages) {
    const page = row.keys?.[0] ?? "";
    const type = classifyPageType(page);
    if (["Verify Insurance", "Contact / Admissions", "Detox", "Residential / Inpatient", "PHP / IOP"].includes(type)) {
      highIntentOnClearUrl++;
    }
  }
  return highIntentOnClearUrl >= 3;
}

function generateSection6(
  section1: Section1Goals,
  section2: Section2Conversions,
  section3: Section3Traffic,
  section4: Section4Services,
  section5: Section5Diagnosis,
  tierInput: TierDiagnosisInput,
  completedWork: string[],
  sentiment?: string,
  hypothesis?: string,
  auditNotes?: string
): Section6Priorities {
  const priorities: PriorityRow[] = [];
  const completedLower = completedWork.map(w => w.toLowerCase());

  function isAlreadyDone(keyword: string): boolean {
    return completedLower.some(w => w.includes(keyword.toLowerCase()));
  }

  if (section5.tier <= 1) {
    if (!tierInput.hasDetoxPage || !tierInput.hasResidentialPage) {
      if (!isAlreadyDone("service page") && !isAlreadyDone("detox") && !isAlreadyDone("residential")) {
        priorities.push({
          priority: 1,
          initiative: "Core Service Page Foundation",
          tier: "Tier 1",
          action: "Refresh and consolidate primary detox and residential intent so Google sees one clear service path per treatment level",
          reason: "Core service pages are the foundation for search trust — without clear primary URLs, nothing else compounds",
        });
      }
    }
    if (!tierInput.hasVobPage || !tierInput.hasContactPage) {
      if (!isAlreadyDone("insurance") && !isAlreadyDone("vob") && !isAlreadyDone("admissions")) {
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Admissions Pathway Clarity",
          tier: "Tier 1",
          action: "Strengthen Verify Insurance and admissions entry points to reduce friction on high-intent traffic",
          reason: "VOB and contact pages are the primary conversion mechanism — unclear pathways lose admits",
        });
      }
    }
  }

  if (section5.tier <= 2 && priorities.length < 7) {
    if (!tierInput.hasConditionsHub && !isAlreadyDone("conditions hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Conditions Hub Structure",
        tier: "Tier 2",
        action: "Build a conditions hub to support authority flow into existing service pages",
        reason: "Hub structure lets Google understand topical relationships and pass authority to conversion pages",
      });
    }
    if (!tierInput.hasTherapiesHub && !isAlreadyDone("therapies hub") && !isAlreadyDone("therapy hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Therapies Architecture",
        tier: "Tier 2",
        action: "Organize treatment modalities into a therapies hub that reinforces service page authority",
        reason: "Therapy pages support E-E-A-T and differentiate the program in competitive searches",
      });
    }
  }

  if (section5.tier <= 3 && priorities.length < 7) {
    if (tierInput.errors4xx5xx > 10 && !isAlreadyDone("404") && !isAlreadyDone("error")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Technical Cleanup",
        tier: "Tier 3",
        action: `Resolve ${tierInput.errors4xx5xx} error pages (4xx/5xx) and clean up redirect chains suppressing crawl efficiency`,
        reason: "Error pages create structural drag — cleaning them improves crawl budget allocation to revenue pages",
      });
    }
    if (tierInput.overlapGeoPages > 5 && !isAlreadyDone("geo") && !isAlreadyDone("location")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Location Consolidation",
        tier: "Tier 3",
        action: "Retire overlapping near-me and legacy geo pages into the primary location architecture",
        reason: "Duplicate geo pages dilute authority and confuse Google about the primary service area",
      });
    }
  }

  if (hypothesis && priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "AM-Identified Focus",
      tier: `Tier ${section5.tier}`,
      action: hypothesis,
      reason: "Account manager identified this as a priority based on client relationship and strategic context",
    });
  }

  if (auditNotes && priorities.length < 7) {
    const noteActions = auditNotes.split(/[.;\n]/).filter(n => n.trim().length > 10).slice(0, 2);
    for (const note of noteActions) {
      if (priorities.length >= 7) break;
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Audit Finding",
        tier: `Tier ${Math.min(section5.tier + 1, 5)}`,
        action: note.trim(),
        reason: "Identified during manual audit review",
      });
    }
  }

  const unclearTrafficPages = section3.topTrafficPages.filter(p => p.connectionToAdmits === "Unclear");
  const topUnclearPage = unclearTrafficPages[0];
  const goalBehind = section1.rows.some(r => r.goalShift === "-5%");
  const hasMissingH1s = tierInput.missingH1s > 10;
  const hasThinPages = tierInput.thinPages > 15;
  const topTrafficTopic = section3.topTrafficTopics.find(t => t.connectionToAdmits === "Unclear" || t.connectionToAdmits === "Assisted");
  const thinPagesNote = hasThinPages ? ` (${tierInput.thinPages} thin pages detected in crawl)` : "";

  const evidenceFillers: Array<{ initiative: string; tier: string; action: string; reason: string; condition: boolean }> = [
    {
      initiative: "Internal Linking — High-Traffic to Conversion",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: topUnclearPage
        ? `Add internal links from "${topUnclearPage.page}" (${topUnclearPage.clicks} clicks, unclear conversion connection) to primary service and VOB pages`
        : "Add internal links from high-traffic informational pages to primary service and VOB pages",
      reason: topUnclearPage
        ? `${topUnclearPage.clicks} organic clicks land on a page with no clear path to admissions — linking directly to service pages converts that existing traffic`
        : "Traffic data shows high-volume pages with unclear admit connection — internal linking is the lowest-cost conversion lever",
      condition: unclearTrafficPages.length > 0 && !priorities.find(p => p.initiative.includes("Internal Link")),
    },
    {
      initiative: "Conversion Path Audit",
      tier: `Tier ${Math.min(section5.tier, 4)}`,
      action: goalBehind
        ? `Audit and repair the organic-to-VOB path — goal is behind pace and conversion leakage is the most likely cause`
        : "Audit and strengthen the path from organic landing pages to VOB/contact submission",
      reason: goalBehind
        ? `Organic sessions are behind Q pace — improving conversion rate on existing traffic is higher ROI than acquiring new traffic`
        : "Conversion path gaps compound slowly; fixing them now avoids a larger gap by end of quarter (lower confidence without GA4 data)",
      condition: !priorities.find(p => p.initiative.includes("Conversion")),
    },
    {
      initiative: "Content Refresh — Highest-Traffic Assisted Pages",
      tier: `Tier ${Math.min(section5.tier + 1, 5)}`,
      action: topTrafficTopic
        ? `Refresh content in the "${topTrafficTopic.topic}" cluster (${topTrafficTopic.insight.split(".")[0]}) to improve engagement and strengthen links to service pages`
        : `Refresh highest-traffic assisted-conversion pages${thinPagesNote}`,
      reason: topTrafficTopic
        ? `The "${topTrafficTopic.topic}" topic drives meaningful traffic but shows ${topTrafficTopic.connectionToAdmits.toLowerCase()} admit connection — refreshed content with stronger CTAs and internal links captures more value from existing impressions`
        : `Existing high-traffic pages${hasThinPages ? ` and ${tierInput.thinPages} detected thin pages` : ""} are the fastest path to improving organic conversion without new content investment`,
      condition: !priorities.find(p => p.initiative.includes("Content Refresh")) && !isAlreadyDone("content refresh"),
    },
    {
      initiative: "Title & Meta Optimization",
      tier: "Tier 1",
      action: hasMissingH1s
        ? `Fix ${tierInput.missingH1s} pages with missing H1 tags and audit meta descriptions on top-traffic pages to improve CTR`
        : "Audit title tags and meta descriptions on highest-impression pages to improve organic CTR",
      reason: hasMissingH1s
        ? `Crawl shows ${tierInput.missingH1s} pages without H1 tags — these pages are structurally weak and likely suppressed in rankings; fixing them requires low effort for potentially high impact`
        : "CTR improvements on existing impression volume require no new traffic — they are free growth on what the site already earns",
      condition: !priorities.find(p => p.initiative.includes("Title") || p.initiative.includes("Meta")),
    },
  ];

  for (const f of evidenceFillers) {
    if (priorities.length >= 5) break;
    if (f.condition) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: f.initiative,
        tier: f.tier,
        action: f.action,
        reason: f.reason,
      });
    }
  }

  if (priorities.length < 5) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Organic Channel Health Review",
      tier: `Tier ${section5.tier}`,
      action: "Review organic channel baseline metrics QoQ to identify acceleration or decay signals before setting Q3 strategy",
      reason: "Establishing a clean QoQ baseline is prerequisite to any growth investment — without it, directional decisions are made without evidence",
    });
  }

  return { priorities: priorities.slice(0, 7) };
}

function generateSection7(section6: Section6Priorities, section5: Section5Diagnosis): Section7Tracking {
  const tracking: TrackingRow[] = [];

  const metricMap: Record<string, TrackingRow> = {
    "Core Service Page Foundation": {
      focusArea: "Service Page Visibility",
      metric: "GSC clicks to primary service pages (detox, residential, PHP/IOP)",
      source: "Google Search Console",
      whyItMatters: "Measures whether core pages are capturing high-intent search demand",
    },
    "Admissions Pathway Clarity": {
      focusArea: "Admissions Conversions",
      metric: "VOB submissions + qualified organic calls",
      source: "GA4 + Call Tracking",
      whyItMatters: "Directly measures admission-driving actions from organic traffic",
    },
    "Conditions Hub Structure": {
      focusArea: "Authority Coverage",
      metric: "Organic sessions to conditions hub pages",
      source: "GA4",
      whyItMatters: "Tracks whether hub structure is attracting topical authority traffic",
    },
    "Therapies Architecture": {
      focusArea: "Therapy Page Performance",
      metric: "GSC impressions and clicks for therapy-related queries",
      source: "Google Search Console",
      whyItMatters: "Measures whether therapy content is capturing differentiation searches",
    },
    "Technical Cleanup": {
      focusArea: "Crawl Health",
      metric: "Reduction in 4xx/5xx errors and redirect chains",
      source: "Screaming Frog",
      whyItMatters: "Fewer errors = better crawl budget allocation to revenue pages",
    },
    "Location Consolidation": {
      focusArea: "Local Visibility",
      metric: "GBP calls + direction requests + local organic sessions",
      source: "GBP + GA4",
      whyItMatters: "Validates that location consolidation improves local conversion signals",
    },
    "Conversion Path Optimization": {
      focusArea: "Conversion Rate",
      metric: "Organic conversion rate on top landing pages",
      source: "GA4",
      whyItMatters: "Higher CVR on existing traffic is the most capital-efficient growth lever",
    },
    "Content Refresh — Highest-Value Pages": {
      focusArea: "Content Performance",
      metric: "CTR improvement on high-impression non-brand queries",
      source: "Google Search Console",
      whyItMatters: "CTR gains on existing impressions drive incremental traffic without new content",
    },
  };

  for (const priority of section6.priorities) {
    const mapped = metricMap[priority.initiative];
    if (mapped && !tracking.find(t => t.focusArea === mapped.focusArea)) {
      tracking.push(mapped);
    }
  }

  const defaults: TrackingRow[] = [
    {
      focusArea: "Organic Sessions",
      metric: "Total organic sessions (QoQ)",
      source: "GA4",
      whyItMatters: "Primary volume indicator for organic channel health",
    },
    {
      focusArea: "Qualified Calls",
      metric: "Organic phone calls (answered, 60s+)",
      source: "Call Tracking",
      whyItMatters: "Strongest proxy for admits when direct admit tracking is unavailable",
    },
  ];

  for (const d of defaults) {
    if (tracking.length >= 7) break;
    if (!tracking.find(t => t.focusArea === d.focusArea)) {
      tracking.push(d);
    }
  }

  return { tracking: tracking.slice(0, 7) };
}
