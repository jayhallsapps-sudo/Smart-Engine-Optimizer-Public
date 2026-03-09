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

const JUNK_UNICODE_RE = /[\uFFFD\uFFFE\uFFFF\uF8FF\u00AD\u2060]/g;

function sanitizeString(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;

  // A) Replace junk unicode separators with hyphens (covers slug and label cases)
  out = out.replace(JUNK_UNICODE_RE, "-");
  // Collapse consecutive hyphens introduced by the above (but preserve URL paths)
  out = out.replace(/([^/])-{2,}([^/])/g, "$1-$2");

  // B) Remove zero-width / control chars and BOM
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // C) Remove line/paragraph separators
  out = out.replace(/\u2028|\u2029/g, " ");
  // D) Remove percent-encoded junk
  out = out.replace(/%E2%80%[0-9A-Fa-f]{2}/g, "");

  // E) Specific known broken patterns — fix before whitespace normalization
  out = out.replace(/\bSource pending confirmation via\s+\w{0,8}\.?\s*$/gi, "Source pending confirmation.");
  out = out.replace(/\s+via\s+\w{1,8}\.?\s*$/gi, ".");
  out = out.replace(/\s+via\s*\.?\s*$/gi, ".");
  out = out.replace(/\bnot\s*\.\s*$/gi, "");
  out = out.replace(/\balready\s+\w{1,5}\.?\s*$/gi, "");
  out = out.replace(/\bunde\w{0,6}\.?\s*$/gi, "");

  // F) Whitespace/punctuation normalization
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  out = out.replace(/([.!?])\s*\.\s*$/g, "$1");
  out = out.trim();

  return out;
}

const SOURCE_NORMALIZE_MAP: [RegExp, string][] = [
  [/\bga4\b|\bgoogle analytics 4\b|\bgoogle analytics\b/i, "GA4"],
  [/\bgoogle search console\b|\bgsc\b/i, "GSC"],
  [/\bcallrail\b|\bcall rail\b/i, "CallRail"],
  [/\bcall tracking metrics\b|\bctm\b/i, "CTM"],
  [/\bscreaming frog\b/i, "Screaming Frog"],
  [/\bmulti.?source\b/i, "Multi-source"],
  [/\bgbp\b|\bgoogle business profile\b/i, "GBP"],
  [/\bairtable\b/i, "Airtable"],
];

function normalizeSrcName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [re, normalized] of SOURCE_NORMALIZE_MAP) {
    if (re.test(lower)) return normalized;
  }
  return raw;
}

function extractUsedSourcesFromReport(report: QbrPrepReportData): Set<string> {
  const used = new Set<string>();
  const SOURCE_FIELD_KEYS = new Set(["source", "measurementSource", "dataSource"]);

  const walk = (obj: any): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    for (const key of Object.keys(obj)) {
      if (SOURCE_FIELD_KEYS.has(key) && typeof obj[key] === "string") {
        const val = obj[key];
        for (const [re, normalized] of SOURCE_NORMALIZE_MAP) {
          if (re.test(val)) used.add(normalized);
        }
      } else if (typeof obj[key] === "object") {
        walk(obj[key]);
      }
    }
  };
  walk(report.section1Goals);
  walk(report.section2Conversions);
  walk(report.section3Traffic);
  walk(report.section4Services);
  walk(report.section7Tracking);
  return used;
}

function sanitizeReport(report: QbrPrepReportData): void {
  const walk = (obj: any): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "string") {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === "object") {
        walk(obj[key]);
      }
    }
  };
  walk(report.section1Goals);
  walk(report.section2Conversions);
  walk(report.section3Traffic);
  walk(report.section4Services);
  walk(report.section5Diagnosis);
  walk(report.section6Priorities);
  walk(report.section7Tracking);
  if (report.meta) walk(report.meta);
}
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
  forwardLooking?: boolean;
}

export function normalizeKpiLabel(mvpType: string): string {
  if (!mvpType || mvpType === "—" || mvpType === "-") return "Admits";
  const lower = mvpType.toLowerCase().trim();
  if (/admits?$/i.test(lower)) return "Admits";
  if (/viable\s*vob/i.test(lower) || /^vobs?$/i.test(lower)) return "Viable VOBs";
  if (/organic.*gmb.*ai.*llm.*calls/i.test(lower)) return "Organic + GMB + AI LLM Calls";
  if (/qualified.*calls/i.test(lower)) return "Qualified Calls";
  if (/leads?$/i.test(lower)) return "Leads";
  if (/contacts?$/i.test(lower)) return "Contacts";
  return mvpType.trim();
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
    nsmData = await fetchNsmGoals(client.name, input.forwardLooking);
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

  if (sfData.length > 0) dataSources.push("Multi-source");
  else missingData.push("Multi-source");

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

  const section1 = generateSection1(nsmData, ga4FunnelCurr, quarter, client, callTrackingSources);
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
  const section7Evidence: Section7EvidenceFlags = {
    ga4Active: ga4LandingRows.length > 0 || ga4FunnelCurr !== null,
    gscActive: gscQueryRows.length > 0 || gscPageRows.length > 0,
    callActive: callTrackingLandingPages.length > 0 || callTrackingSources.length > 0,
    gbpActive: false,
  };
  const section7 = generateSection7(section6, section5, section7Evidence);

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
      clientSentiment: input.sentiment,
      amThoughts: input.hypothesis,
      priorityChecks: input.auditNotes,
      clientNotes: (input as any).clientNotes ?? "",
      sentiment: input.sentiment,
      hypothesis: input.hypothesis,
      auditNotes: input.auditNotes,
    },
  };

  const report: QbrPrepReportData = {
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
      missingData: missingData,
    },
  };

  // Sanitize all string fields first
  sanitizeReport(report);

  // After full assembly + sanitization, scan every source field in the report
  // to build the true set of used sources, then suppress them from missingData.
  const usedInContent = extractUsedSourcesFromReport(report);
  const finalMissing = missingData.filter(m => {
    const norm = normalizeSrcName(m);
    return !usedInContent.has(norm);
  });
  report.generationMeta!.missingData = finalMissing;

  return report;
}

const INSURANCE_BLACKLIST = [
  "blue-shield", "blue-cross", "blue-cross-blue-shield", "anthem",
  "aetna", "cigna", "geha", "highmark", "horizon", "humana",
  "kaiser", "magellan", "optum", "tricare", "unitedhealthcare",
  "uhc", "health-net", "molina", "medicare", "medicaid",
  "bcbs", "bcbsca", "united-health", "united-healthcare",
  "coventry", "medi-cal", "champva", "champ-va",
];

function isInsuranceTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return INSURANCE_BLACKLIST.some(term => lower.includes(term));
}

function inferLocation(sfData: Record<string, any>[], sfHeaders: string[], client: Client): string {
  const candidates: Array<{ location: string; source: string }> = [];
  const rejected: Array<{ candidate: string; reason: string }> = [];

  // Priority 0: Client canonical location (gbpLocationName) — most reliable
  if (client.gbpLocationName && client.gbpLocationName.trim()) {
    console.log(`[Location] Using canonical gbpLocationName: ${client.gbpLocationName}`);
    return client.gbpLocationName.trim();
  }

  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const urls = sfData.map(r => String(r[urlCol] ?? "").toLowerCase());

  const knownCities = [
    "huntington-beach", "costa-mesa", "irvine", "laguna-beach", "laguna-hills",
    "laguna-niguel", "newport-beach", "anaheim", "san-diego", "los-angeles",
    "orange-county", "santa-ana", "long-beach", "torrance", "pasadena",
    "santa-monica", "culver-city", "burbank", "glendale", "pomona",
    "san-francisco", "san-jose", "sacramento", "fresno", "riverside",
    "bakersfield", "stockton", "chula-vista", "fremont", "modesto",
  ];

  const exactCityPattern = new RegExp(`\\/(${knownCities.join("|")})(?:\\/|$|-ca\\b|-california\\b)`, "i");

  const generalPatterns = [
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-california\b/i,
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-ca\b/i,
  ];

  for (const url of urls) {
    // Priority 1: Exact known-city match
    const exact = url.match(exactCityPattern);
    if (exact) {
      const raw = exact[1];
      if (isInsuranceTerm(raw)) {
        rejected.push({ candidate: raw, reason: "Blacklisted insurance/payer term in known-city match" });
        continue;
      }
      const location = raw.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
      candidates.push({ location, source: `exact-url-match: ${url}` });
      break;
    }
  }

  if (candidates.length === 0) {
    // Priority 2: General -california / -ca pattern (with blacklist)
    for (const url of urls) {
      for (const p of generalPatterns) {
        const m = url.match(p);
        if (m) {
          const raw = m[1];
          if (isInsuranceTerm(raw)) {
            rejected.push({ candidate: raw, reason: "Blacklisted insurance/payer term in general pattern" });
            continue;
          }
          // Additional guard: reject if the segment looks like a service-area or brand slug
          if (raw.length > 40 || raw.split("-").length > 4) {
            rejected.push({ candidate: raw, reason: "Candidate too long — likely a service-area slug, not a city" });
            continue;
          }
          const words = m[1].split("-").filter(w => w.length >= 2);
          if (words.length > 0) {
            const location = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
            candidates.push({ location, source: `general-pattern: ${url}` });
            break;
          }
        }
      }
      if (candidates.length > 0) break;
    }
  }

  if (rejected.length > 0) {
    console.log(`[Location] Rejected candidates: ${rejected.map(r => `${r.candidate} (${r.reason})`).join("; ")}`);
  }

  if (candidates.length > 0) {
    console.log(`[Location] Selected: ${candidates[0].location} from ${candidates[0].source}`);
    return candidates[0].location;
  }

  console.log(`[Location] No URL match found — returning Manual entry needed`);
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

  // Derive gender qualifier — avoid "Women's Men's" combined label
  let genderPrefix = "";
  if (hasWomens && hasMens) genderPrefix = "Co-ed";
  else if (hasWomens) genderPrefix = "Women's";
  else if (hasMens) genderPrefix = "Men's";

  const parts: string[] = [];
  if (genderPrefix) parts.push(genderPrefix);
  parts.push("Addiction Treatment");
  if (hasDualDiagnosis) parts.push("& Dual Diagnosis");

  return parts.join(" ");
}

function detectCallTrackingProvider(client: Client): string | null {
  if (client.callrailCompanyId) return "CallRail";
  if (client.ctmAccountId) return "CallTrackingMetrics";
  if (client.nimbataAccountId) return "Nimbata";
  return null;
}

function generateSection1(nsmData: any, ga4Funnel: any, quarter: QuarterInfo, client: Client, callTrackingSources: Array<{ source: string; calls: number }> = []): Section1Goals {
  const rows: GoalRow[] = [];

  const callTrackingProvider = detectCallTrackingProvider(client);

  console.log(`[Section1] client=${client.name}`);
  console.log(`[Section1] callTrackingProvider=${callTrackingProvider ?? "none"}`);
  console.log(`[Section1] nsmData present=${!!nsmData}, ga4Funnel present=${!!ga4Funnel}`);

  const primaryKpiLabel = nsmData ? normalizeKpiLabel(nsmData.mvpType) : "Admits";
  console.log(`[Section1] Primary KPI label from mvpType: "${primaryKpiLabel}" (raw mvpType: "${nsmData?.mvpType ?? "—"}")`);

  let admitsGoalDisplay: string = primaryKpiLabel;
  let admitsShift = "—";
  let admitsReason = `${primaryKpiLabel} is the strategic primary KPI. Reporting source is not yet confirmed — this goal will be updated once a tracking source is connected.`;
  let admitsSource = "Source pending confirmation";

  let nsmMvpActNum: number | null = null;
  let nsmMvpGoalNum: number | null = null;

  if (nsmData) {
    const mvpGoal = nsmData.mvpGoal !== "—" ? nsmData.mvpGoal : null;
    const mvpActual = nsmData.mvpActual !== "—" ? nsmData.mvpActual : null;
    if (mvpGoal && mvpActual) {
      const actN = parseInt(String(mvpActual).replace(/[^0-9]/g, ""), 10);
      const goalN = parseInt(String(mvpGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(actN) && !isNaN(goalN) && goalN > 0) {
        nsmMvpActNum = actN;
        nsmMvpGoalNum = goalN;
      }
    }
  }

  if (nsmMvpGoalNum !== null && nsmMvpActNum !== null) {
    admitsSource = "NSM Tracker";
    const pacing = nsmMvpActNum / nsmMvpGoalNum!;
    const kpiLower = primaryKpiLabel.toLowerCase();
    if (pacing >= 0.9) {
      const target = fmtNum(Math.round(nsmMvpGoalNum! * 1.05));
      admitsGoalDisplay = `${target} ${kpiLower}`;
      admitsShift = "+5%";
      admitsReason = `${primaryKpiLabel} on pace (${nsmMvpActNum}/${nsmMvpGoalNum}). Slight increase is achievable given current trajectory.`;
    } else if (pacing >= 0.7) {
      const target = fmtNum(nsmMvpGoalNum!);
      admitsGoalDisplay = `${target} ${kpiLower}`;
      admitsShift = "Maintain";
      admitsReason = `${primaryKpiLabel} tracking at ${nsmMvpActNum}/${nsmMvpGoalNum}. Maintaining goal while improving conversion paths.`;
    } else {
      const target = fmtNum(Math.round(nsmMvpGoalNum! * 0.95));
      admitsGoalDisplay = `${target} ${kpiLower}`;
      admitsShift = "-5%";
      admitsReason = `${primaryKpiLabel} behind pace (${nsmMvpActNum}/${nsmMvpGoalNum}). Modest adjustment reflects realistic expectations given current trajectory.`;
    }
  }

  console.log(`[Section1] Primary Goal=${primaryKpiLabel}, goal=${admitsGoalDisplay}, source=${admitsSource}, shift=${admitsShift}`);

  rows.push({
    goalType: "Primary Goal",
    goal: admitsGoalDisplay,
    measurementSource: admitsSource,
    goalShift: admitsShift,
    reason: admitsReason,
  });

  // ── Secondary Goal: Calls ──────────────────────────────────────────────
  const callsSource = callTrackingProvider ?? ME;
  let callsGoal: string = ME;
  let callsShift = "Maintain";
  let callsReason = callTrackingProvider
    ? `Qualified organic calls tracked via ${callTrackingProvider}. Calls serve as the primary operational proxy for ${primaryKpiLabel.toLowerCase()} until a direct tracking source is confirmed.`
    : `${ME}: Call tracking provider not configured`;

  if (callTrackingSources.length > 0) {
    const totalCalls = callTrackingSources.reduce((s, r) => s + r.calls, 0);
    callsGoal = `${fmtNum(totalCalls)} tracked calls (QTD)`;
    callsReason = `${fmtNum(totalCalls)} organic calls tracked via ${callTrackingProvider ?? "call tracking"} this quarter. Calls are the primary measurable operational proxy for ${primaryKpiLabel.toLowerCase()}.`;
  }

  console.log(`[Section1] Secondary Goal=Calls, source=${callsSource}, shift=${callsShift}`);

  rows.push({
    goalType: "Secondary Goal",
    goal: callsGoal,
    measurementSource: callsSource,
    goalShift: callsShift,
    reason: callsReason,
  });

  // ── Tertiary Goal: Organic Sessions ────────────────────────────────────
  let sessRecommended: string = ME;
  let sessShift = "Maintain";
  let sessReason = ME;

  if (nsmData) {
    const sessGoal = nsmData.sessionsGoal !== "—" ? nsmData.sessionsGoal : null;
    const sessActual = nsmData.sessionsActual !== "—" ? nsmData.sessionsActual : null;
    const sessPct = nsmData.sessionsPercent !== "—" ? nsmData.sessionsPercent : null;

    sessRecommended = sessGoal ?? ME;

    if (sessGoal && sessActual && sessPct) {
      const actualNum = parseInt(String(sessActual).replace(/[^0-9]/g, ""), 10);
      const goalNum = parseInt(String(sessGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(actualNum) && !isNaN(goalNum) && goalNum > 0) {
        const pacing = actualNum / goalNum;
        if (pacing >= 0.9) {
          sessRecommended = fmtNum(Math.round(goalNum * 1.05));
          sessShift = "+5%";
          sessReason = `On pace at ${sessPct} through current quarter. Modest increase is realistic given current trajectory.`;
        } else if (pacing >= 0.7) {
          sessRecommended = fmtNum(goalNum);
          sessShift = "Maintain";
          sessReason = `Tracking at ${sessPct} — maintaining current goal is realistic while addressing site improvements.`;
        } else {
          sessRecommended = fmtNum(Math.round(goalNum * 0.95));
          sessShift = "-5%";
          sessReason = `Behind pace at ${sessPct}. Slight reduction reflects realistic expectations while focusing on site fundamentals.`;
        }
      }
    }
  } else if (ga4Funnel) {
    sessRecommended = `${fmtNum(ga4Funnel.sessions)} organic sessions (QTD baseline)`;
    sessReason = `${ME}: Goal target needs manual validation against prior quarter`;
  } else {
    sessReason = `${ME}: no data sources available`;
  }

  console.log(`[Section1] Tertiary Goal=Organic Sessions, target=${sessRecommended}, source=GA4 / GSC, shift=${sessShift}`);

  rows.push({
    goalType: "Tertiary Goal",
    goal: sessRecommended !== ME ? `${sessRecommended} organic sessions` : ME,
    measurementSource: "GA4 / GSC",
    goalShift: sessShift,
    reason: sessReason,
  });

  return { rows };
}

const TRACKING_GAP_PHRASES = [
  "no direct conversion tracking detected yet",
  "verify form tracking is active",
  "event tracking here would directly measure",
  "track user engagement and exits",
  "confirm with admissions team",
  "conversion tracking needed",
  "tracking validation recommended",
  "add form tracking",
  "add call or form tracking",
  "add event tracking",
];

const ADMIT_CONNECTION_DEFINITIONS: Record<string, string> = {
  "High": "Service/admissions/VOB/contact pages or clearly treatment-intent traffic likely closest to conversion",
  "Medium": "Educational, branded, trust/evaluation, or mid-journey traffic that supports later conversion but is not a direct admit action",
  "Low": "Awareness-stage traffic with weak commercial/admissions intent",
};

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
  // Confidence-scored candidate pool. Higher = stronger conversion evidence.
  // 5 = GA4-backed, 4 = call-tracking-backed, 3 = SF service page, 2 = GSC high-intent, 1 = GSC informational
  interface PageCandidate { row: ConvertingPageRow; confidence: number; }
  const pagePool: PageCandidate[] = [];
  const seenPageKeys = new Set<string>();

  const callTrackingSource = detectCallTrackingProvider(client) ?? "CallRail";

  // P1 — GA4 conversion-backed rows (confidence 5)
  const ga4WithConversions = ga4Landing
    .filter(r => (r.conversions ?? 0) > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 8);

  const totalGa4Conversions = ga4Landing.reduce((s, r) => s + (r.conversions ?? 0), 0);

  for (const row of ga4WithConversions) {
    const pageKey = shortUrl(row.page);
    if (seenPageKeys.has(pageKey)) continue;
    seenPageKeys.add(pageKey);
    const internalType = classifyPageType(row.page);
    pagePool.push({
      confidence: 5,
      row: {
        type: clientReadableType(internalType),
        page: buildPagePattern(row.page, internalType, "GA4"),
        notes: buildConvertingPageNote(internalType, "GA4", row.conversions, row.sessions),
        dataSource: "GA4",
      },
    });
  }

  // P2 — Call tracking landing-page rows (confidence 4)
  if (callLandingPages.length > 0) {
    for (const row of callLandingPages.sort((a, b) => b.calls - a.calls).slice(0, 8)) {
      const normalized = row.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      const shortP = normalized.length > 60 ? normalized.slice(0, 57) + "…" : normalized;
      if (seenPageKeys.has(shortP)) continue;
      seenPageKeys.add(shortP);
      const internalType = classifyPageType(row.page);
      pagePool.push({
        confidence: 4,
        row: {
          type: clientReadableType(internalType),
          page: buildPagePattern(row.page, internalType, callTrackingSource),
          notes: buildConvertingPageNote(internalType, callTrackingSource, row.calls, 0),
          dataSource: callTrackingSource,
        },
      });
    }
  }

  // P3 — SF high-intent service pages (confidence 3) — better than GSC blog rows
  // Ordered by conversion importance: admissions → insurance → detox → residential → PHP → therapies → dual dx → outpatient
  const sfServicePriority: Array<{ pattern: RegExp; internalType: string }> = [
    { pattern: /\/contact\b|\/admissions\b|\/get.?help\b|\/admit\b/i, internalType: "Contact / Admissions" },
    { pattern: /\/verify.?insur|\/vob\b|\/insurance.?verif|\/check.?insur|\/insurance\b/i, internalType: "Verify Insurance" },
    { pattern: /\/detox/i, internalType: "Detox" },
    { pattern: /\/residential|\/inpatient/i, internalType: "Residential / Inpatient" },
    { pattern: /\/php(?!p)|\/iop|\/partial.?hospital|\/intensive.?out/i, internalType: "PHP / IOP" },
    { pattern: /\/therap(y|ies)\b|\/modalities/i, internalType: "Therapies" },
    { pattern: /\/dual.?diagnosis|\/co.?occurring/i, internalType: "Dual Diagnosis" },
    { pattern: /\/outpatient(?!.*intensive)/i, internalType: "Outpatient" },
  ];

  if (sfData.length > 0) {
    const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
    const sfPageUrls = sfData.map(r => String(r[urlCol] ?? "")).filter(isValidPageUrl);
    for (const { pattern, internalType } of sfServicePriority) {
      const matches = sfPageUrls.filter(u => pattern.test(u));
      if (matches.length === 0) continue;
      matches.sort((a, b) => scorePage4Url(b) - scorePage4Url(a));
      const best = shortUrl(matches[0]);
      if (seenPageKeys.has(best)) continue;
      seenPageKeys.add(best);
      pagePool.push({
        confidence: 3,
        row: {
          type: clientReadableType(internalType),
          page: best,
          notes: buildConvertingPageNote(internalType, "Multi-source", 0, 0),
          dataSource: "Multi-source",
        },
      });
    }
  }

  // P4/P5 — GSC pages split into high-intent (2) and informational (1)
  const HIGH_INTENT_TYPES = new Set(["Verify Insurance", "Contact / Admissions", "Detox", "Residential / Inpatient", "PHP / IOP", "Outpatient", "Dual Diagnosis", "Therapies"]);
  if (gscPages.length > 0) {
    const sortedGsc = [...gscPages].sort((a: any, b: any) => (b.clicks ?? 0) - (a.clicks ?? 0));
    for (const row of sortedGsc) {
      const pageUrl = row.keys?.[0] ?? "";
      if (!pageUrl) continue;
      const pageKey = shortUrl(pageUrl);
      if (seenPageKeys.has(pageKey)) continue;
      seenPageKeys.add(pageKey);
      const internalType = classifyPageType(pageUrl);
      const isHighIntent = HIGH_INTENT_TYPES.has(internalType);
      pagePool.push({
        confidence: isHighIntent ? 2 : 1,
        row: {
          type: clientReadableType(internalType),
          page: shortUrl(pageUrl),
          notes: buildConvertingPageNote(internalType, "GSC", 0, 0),
          dataSource: "GSC",
        },
      });
    }
  }

  // Sort pool by confidence descending, then apply diversity rules and fill up to 5 rows
  pagePool.sort((a, b) => b.confidence - a.confidence);

  const typeCount = new Map<string, number>();
  let gscInfoCount = 0;

  for (const { row, confidence } of pagePool) {
    if (topConvertingPages.length >= 5) break;
    // Cap purely-informational GSC rows at 2 to prevent them dominating
    if (confidence <= 1) {
      if (gscInfoCount >= 2) continue;
      gscInfoCount++;
    }
    // Diversity cap: no more than 2 rows of the same type if confidence < 4
    const typeKey = row.type;
    const currentCount = typeCount.get(typeKey) ?? 0;
    if (currentCount >= 2 && confidence < 4) continue;
    typeCount.set(typeKey, currentCount + 1);
    topConvertingPages.push(row);
  }

  // Final fallback
  if (topConvertingPages.length === 0) {
    topConvertingPages.push({ type: ME, page: ME, notes: ME, dataSource: undefined });
  }

  console.log(`[Section2] Top Converting Pages: ${topConvertingPages.length} rows (pool had ${pagePool.length} candidates; GA4=${pagePool.filter(c=>c.confidence===5).length}, callTracking=${pagePool.filter(c=>c.confidence===4).length}, SF=${pagePool.filter(c=>c.confidence===3).length}, GSC-hi=${pagePool.filter(c=>c.confidence===2).length}, GSC-info=${pagePool.filter(c=>c.confidence===1).length})`);
  for (const r of topConvertingPages) {
    console.log(`[Section2]   → [${r.dataSource}] ${r.type} | ${r.page}`);
  }

  // --- TOP CONVERTING SOURCES ---
  const moneyPages: string[] = (client as any).moneyPages ?? [];

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
        notes: classifyAdmitConnection(source, data.conversions, totalGa4Conversions) === "High"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
        dataSource: "GA4",
      });
    }
  }

  // Priority 2: CallRail sources (call volume by source)
  const PPC_KEYWORDS = /\bppc\b|\bpaid\b|\bcpc\b|\badwords\b|\bgoogle\s*ads\b|\bbing\s*ads\b/i;
  if (callSources.length > 0 && topConvertingSources.length < 5) {
    const existingSources = new Set(topConvertingSources.map(s => s.source));
    const totalCalls = callSources.reduce((s, r) => s + r.calls, 0);
    for (const src of callSources.sort((a, b) => b.calls - a.calls).slice(0, 5)) {
      if (topConvertingSources.length >= 5) break;
      if (existingSources.has(src.source)) continue;
      const pct = totalCalls > 0 ? Math.round(src.calls / totalCalls * 100) : 0;
      const isPPC = PPC_KEYWORDS.test(src.source);
      const channelLabel = isPPC ? "tracked calls" : "organic calls";
      topConvertingSources.push({
        source: src.source,
        whatsConverting: `${fmtNum(src.calls)} ${channelLabel} (${pct}% of tracked calls)`,
        notes: isPPC
          ? "Paid source — tracked calls, not organic attribution"
          : "Call tracking source — confirm with admissions team",
        dataSource: "CallRail",
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
        notes: classifyAdmitConnection(pageType, data.calls, callLandingPages.reduce((s, r) => s + r.calls, 0)) === "High"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
        dataSource: "CallRail",
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
        notes: classifyAdmitConnection(pt, 0, 0) === "High"
          ? "Directly tied to admission pathway"
          : "Supports conversion through content/awareness",
        dataSource: "Manual entry needed",
      });
    }
  }

  // Final fallback
  if (topConvertingSources.length === 0) {
    topConvertingSources.push({
      source: ME,
      whatsConverting: `${ME}: no source attribution available from GA4, CallRail, or config`,
      notes: ME,
      dataSource: "Manual entry needed",
    });
  }

  const allNotes = [...topConvertingPages.map(p => p.notes), ...topConvertingSources.map(s => s.notes)].join(" ").toLowerCase();
  const hasGaps = TRACKING_GAP_PHRASES.some(phrase => allNotes.includes(phrase));
  const trackingDisclaimer = hasGaps
    ? "Due to missing tracking data, connection to admits is inferred from page intent and journey position. Confidence level may be lower than reported."
    : undefined;

  return { topConvertingPages, topConvertingSources, trackingDisclaimer };
}

function clientReadableType(internalType: string): string {
  const map: Record<string, string> = {
    "Verify Insurance": "Verify Insurance",
    "Contact / Admissions": "Contact / Admissions",
    "Detox": "Service Page",
    "Residential / Inpatient": "Service Page",
    "PHP / IOP": "Service Page",
    "Outpatient": "Service Page",
    "Dual Diagnosis": "Service Page",
    "Therapies": "Service Page",
    "Conditions": "Service Page",
    "Homepage": "Homepage",
    "Staff / Team": "Staff Page",
    "Blog / Resource": "Blog / Resource",
    "FAQ": "FAQ Page",
    "Local Treatment Intent": "Service Page",
    "Branded Navigation": "Homepage",
    "Substance-Specific": "Blog / Resource",
    "Informational / Education": "Blog / Resource",
  };
  return map[internalType] ?? "Service Page";
}

function buildPagePattern(page: string, internalType: string, dataSource: string): string {
  const clean = shortUrl(page);
  let action = "";
  if (dataSource === "CallRail" || dataSource === "CTM" || dataSource === "Nimbata") {
    action = "Phone Clicks";
  } else if (dataSource === "GA4") {
    if (internalType === "Verify Insurance") action = "VOB Form Start";
    else if (internalType === "Contact / Admissions") action = "Contact Form Start";
    else action = "Conversion Event";
  }
  return action ? `${clean} — ${action}` : clean;
}

function buildConvertingPageNote(internalType: string, dataSource: string, conversions: number, sessions: number): string {
  const isCallTracking = ["CallRail", "CTM", "Nimbata", "CallTrackingMetrics"].includes(dataSource);
  const isGA4 = dataSource === "GA4";
  const isGSC = dataSource === "GSC";
  const isSF = dataSource === "Multi-source";
  const cvr = isGA4 && sessions > 0 ? ` ${(conversions / sessions * 100).toFixed(1)}% CVR.` : "";

  if (isGA4) {
    if (internalType === "Verify Insurance") return `Strongest trackable on-site conversion path — VOB form activity directly precedes admissions intake.${cvr}`;
    if (internalType === "Contact / Admissions") return `Primary on-site form conversion point — users submitting here are actively requesting contact from admissions.${cvr}`;
    if (internalType === "Homepage") return `Homepage conversion events detected — validate GA4 event type to confirm these are admit-aligned actions vs navigational clicks.${cvr}`;
    if (internalType === "Staff Page" || internalType === "Staff / Team") return `Conversion event on staff page — users evaluating clinical credibility before taking action. Strong trust signal.${cvr}`;
    return `On-site conversion event detected — confirm the GA4 event name to validate alignment with admissions pathway.${cvr}`;
  }

  if (isCallTracking) {
    if (internalType === "Homepage") return "Primary call-driver and likely local-entry page — phone intent is concentrated here. Verify organic vs paid attribution segmentation for call quality.";
    if (internalType === "Staff / Team" || internalType === "Staff Page") return "Trust and credibility research before calling — users evaluating the clinical team as part of their admissions decision.";
    if (internalType === "FAQ" || internalType === "FAQ Page") return "Pre-call evaluation behavior — users validating fit before committing. Strong intent signal even without a form conversion.";
    if (internalType === "Blog / Resource" || internalType === "Substance-Specific" || internalType === "Informational / Education") return "Pre-call research path — informational content is generating awareness that converts to phone contact. Monitor call quality to confirm admit alignment.";
    if (internalType === "Verify Insurance") return "Insurance page is driving direct call behavior — users checking coverage before calling admissions. One of the clearest non-homepage conversion paths.";
    if (internalType === "Contact / Admissions") return "Direct admissions contact page generating phone clicks — users landing here are actively seeking intake contact.";
    return "One of the clearest non-homepage conversion paths — users are moving from service evaluation to direct action.";
  }

  if (isSF) {
    if (internalType === "Contact / Admissions") return "Priority admissions page confirmed in site crawl — no direct conversion tracking detected yet. Adding contact form submit tracking here would directly validate admit attribution.";
    if (internalType === "Verify Insurance") return "Priority VOB/insurance page confirmed in site crawl — highest-value conversion target on the site. Adding Verify Insurance / VOB form submit tracking here would directly measure admissions pipeline activity.";
    if (internalType === "Detox" || internalType === "Residential / Inpatient" || internalType === "PHP / IOP" || internalType === "Service Page") return "Priority service page confirmed in site crawl — high-intent organic candidate. Track user engagement and exits to identify friction in the admissions path.";
    return "Strategic page confirmed in site crawl — conversion tracking needed to validate admit contribution.";
  }

  if (isGSC) {
    if (internalType === "Verify Insurance") return "Insurance page with organic visibility — add Verify Insurance / VOB form submit tracking to confirm direct admit contribution.";
    if (internalType === "Contact / Admissions") return "Contact page receiving organic traffic — verify contact form submit tracking is active to capture admission-driving events.";
    if (internalType === "Homepage") return "Homepage is the top organic entry point — brand and direct traffic dominate here; validate quality of organic sessions reaching admissions.";
    if (internalType === "Service Page" || ["Detox", "Residential / Inpatient", "PHP / IOP", "Outpatient", "Dual Diagnosis", "Therapies"].includes(internalType)) return "High-visibility service page with likely support value — direct conversion attribution is limited; add call or form tracking to confirm.";
    return "High-visibility page with likely support value, but direct conversion attribution is limited. Add event tracking to validate whether this page contributes to admits.";
  }

  return "Strategic page identified for conversion contribution — manual tracking validation recommended.";
}

function classifyTrafficPageConnection(pageType: string, url: string): string {
  const path = url.toLowerCase();
  switch (pageType) {
    case "Verify Insurance":
    case "Contact / Admissions":
    case "Detox":
    case "Residential / Inpatient":
    case "PHP / IOP":
      return "High";
    case "Substance-Specific":
    case "Conditions":
    case "Dual Diagnosis":
    case "Therapies":
    case "Outpatient":
    case "Population-Specific":
    case "Location":
    case "Aftercare / Alumni":
    case "Homepage":
    case "About / Team":
      return "Medium";
    case "Blog / Resource":
      return "Low";
    default:
      if (/meet|\/team|\/staff|\/about|\/who-we-are|\/leadership/.test(path)) return "Medium";
      if (/\/review|\/testimonial/.test(path)) return "Medium";
      return "Low";
  }
}

function buildTrafficPageInsight(pageType: string, url: string, clicksStr: string): string {
  const path = url.toLowerCase();
  const clicks = parseInt(clicksStr.replace(/,/g, "")) || 0;
  const hiVol = clicks > 200;

  switch (pageType) {
    case "Verify Insurance":
      return "High-intent admissions entry point — users here are actively seeking insurance verification before intake. Primary conversion surface; friction on this page directly impacts admits.";
    case "Contact / Admissions":
      return "Primary admissions contact page. Traffic signals users in final decision-making stage — page clarity and response speed have the highest direct impact on admits.";
    case "Detox":
      return "Core service page for high-intent detox-seekers. Visitors are actively evaluating programs — page quality and admissions CTA directly influence intake conversion.";
    case "Residential / Inpatient":
      return "Residential treatment service page. Traffic here signals users comparing inpatient programs — differentiation and a clear admissions path are the priority.";
    case "PHP / IOP":
      return "Step-down or flexible care service page. Users are weighing level-of-care options — a clear admissions path can improve conversion from this already-evaluated segment.";
    case "Substance-Specific": {
      if (/alcohol/.test(path)) return `${hiVol ? "High-volume" : "Moderate-volume"} alcohol-awareness content. Entry-stage traffic that needs a clear route from educational content to detox or treatment program pages.`;
      if (/opioid|heroin|fentanyl/.test(path)) return "Opioid-specific informational entry point. Early-funnel users researching substances — internal links to detox and residential pages capture the highest conversion value.";
      if (/meth/.test(path)) return "Methamphetamine-specific awareness content. Mostly early-funnel — route toward detox and dual-diagnosis pages where appropriate.";
      if (/cocaine|coke/.test(path)) return "Cocaine-specific awareness content. Educational traffic that supports later conversion when paired with clear internal links to service pages.";
      if (/benzo/.test(path)) return "Benzodiazepine-specific information page. Medical detox intent is elevated for this substance — route users toward detox and residential program pages.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} substance-specific awareness content. Educational entry point that needs targeted internal links to appropriate service pages to convert traffic.`;
    }
    case "Conditions":
      return "Condition-specific content attracting users researching symptoms or mental health concerns. Should route toward dual-diagnosis or appropriate treatment program pages.";
    case "Dual Diagnosis":
      return "Dual diagnosis content attracting users with complex or co-occurring treatment needs. Higher conversion intent than general conditions traffic — route toward program details and admissions.";
    case "Therapies":
      return "Therapy and modalities content that supports program differentiation. Trust-building for users actively comparing programs — reinforce with links to service and admissions pages.";
    case "Population-Specific":
      if (/women|female/.test(path)) return "Women's program content targeting a defined audience. Evaluation-stage traffic from users assessing program fit — route toward program details and admissions.";
      if (/men|male/.test(path)) return "Men's program content attracting a specific audience segment. Route toward program details and admissions to capture high-intent users.";
      return "Audience-segmented content attracting a defined population. Evaluation-stage traffic that needs clear routing to relevant program and admissions pages.";
    case "About / Team":
      return "Trust-building page supporting late-stage evaluation. Users here are assessing credibility before committing — strong links to admissions pages can convert this high-consideration intent.";
    case "Aftercare / Alumni":
      return "Aftercare and alumni content that demonstrates outcomes and builds credibility. Influences prospective clients and families during program evaluation — trust-building before admissions.";
    case "Blog / Resource":
      return `Informational content entry point with ${hiVol ? "high" : "lower"} organic volume. Awareness-stage traffic — targeted internal links toward service and admissions pages are the highest-ROI improvement.`;
    case "Location":
      return "Location or facility page attracting geo-targeted traffic. Local intent users searching for nearby treatment — important for admissions volume from the primary service area.";
    case "Outpatient":
      return "Outpatient program page attracting users seeking flexible or lower-acuity care. Assisted admission path — users may be open to stepping up to higher levels of care if properly guided.";
    case "Homepage":
      return "Primary branded entry point serving a mix of direct, branded, and first-time visitors. Should route efficiently to service pages and the admissions path for maximum conversion.";
    default: {
      if (/meet|\/team|\/staff/.test(path)) return "Trust-building page that supports credibility evaluation. Late-stage visitors — internal links to admissions and program pages can convert this research intent.";
      if (/\/review|\/testimonial|\/alumni/.test(path)) return "Social proof content that builds confidence in the program. Can move hesitant users toward admissions contact when paired with clear CTAs.";
      if (/\/faq|\/guide/.test(path)) return "FAQ or guide attracting users with specific treatment questions. Informational stage — structured links to relevant service and admissions pages improve conversion.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} informational entry point with limited direct admit linkage. Awareness-stage content — internal links to service pages are the highest-ROI improvement for this traffic.`;
    }
  }
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
      } else if (connection === "High") {
        insight = `${clickShare}% of clicks. High-intent service traffic — directly tied to admissions.`;
      } else if (connection === "Medium") {
        insight = `${clickShare}% of clicks. Supporting traffic that assists conversion pathway.`;
      } else {
        insight = `${clickShare}% of clicks. Low admit connection — mostly informational.`;
      }

      topTrafficTopics.push({
        topic: ts.topic,
        exampleQueries: ts.examples.join(", "),
        connectionToAdmits: connection,
        insight,
        dataSource: "GSC",
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
      const clicksFormatted = fmtNum(row.clicks ?? 0);
      const connection = classifyTrafficPageConnection(pageType, page);
      const insight = buildTrafficPageInsight(pageType, page, clicksFormatted);

      topTrafficPages.push({
        page: shortUrl(page),
        clicks: clicksFormatted,
        ctr: fmtPct(row.ctr ?? 0),
        connectionToAdmits: connection,
        insight,
        dataSource: "",
      });
    }
  }

  if (topTrafficTopics.length === 0) {
    topTrafficTopics.push({
      topic: ME,
      exampleQueries: ME,
      connectionToAdmits: ME,
      insight: `${ME}: GSC query data unavailable`,
      dataSource: "Manual entry needed",
    });
  }

  if (topTrafficPages.length === 0) {
    topTrafficPages.push({
      page: ME,
      clicks: "—",
      ctr: "—",
      connectionToAdmits: ME,
      insight: `${ME}: GSC page data unavailable`,
      dataSource: "Manual entry needed",
    });
  }

  return { topTrafficTopics, topTrafficPages };
}

// ── Section 4 URL filtering helpers ──────────────────────────────────────────

const S4_REJECT_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|ico|js|css|json|xml|pdf|zip|woff|woff2|ttf|mp4|mp3|avi|mov|eot|otf|map|txt|csv|rss|atom)(\?|#|$)/i;

const S4_REJECT_PATH_SEGMENTS = [
  /\/wp-content\//i,
  /\/wp-includes\//i,
  /\/wp-admin\//i,
  /\/wp-json\//i,
  /\/xmlrpc\.php/i,
  /\/feed\//i,
  /\/\?feed=/i,
  /\/tag\//i,
  /\/author\//i,
  /\/page\/\d+/i,
  /\/attachment\//i,
  /\?replytocom=/i,
  /[?&]amp\b/i,
  /[?&]ver=/i,
  /\/sitemap/i,
  /\/robots\.txt/i,
  /\/cron\.php/i,
  /\/__trashed\//i,
  /\/embed\//i,
  /\/trackback\//i,
  /\/comment-page-/i,
];

function isValidPageUrl(url: string): boolean {
  if (!url || url.trim() === "") return false;
  // Must look like a URL path (absolute or relative starting with /)
  const path = url.includes("://") ? (() => { try { return new URL(url).pathname + new URL(url).search; } catch { return url; } })() : url;
  if (S4_REJECT_EXTENSIONS.test(path)) return false;
  if (S4_REJECT_PATH_SEGMENTS.some(re => re.test(path))) return false;
  return true;
}

function scorePage4Url(url: string): number {
  // Prefer shorter clean slugs and paths that end with /
  let score = 0;
  const path = shortUrl(url);
  // Penalize very long paths (deep nesting)
  const depth = (path.match(/\//g) ?? []).length;
  score -= depth * 2;
  // Penalize long slugs
  score -= Math.floor(path.length / 10);
  // Prefer paths ending with /
  if (path.endsWith("/")) score += 3;
  // Prefer paths that are clearly a direct service page (short slug with one keyword)
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 2) score += 5;
  return score;
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
    { service: "PHP / IOP", pattern: /\/php(?!p)|\/iop|\/partial.?hospital|\/intensive.?out/i },
    { service: "Outpatient", pattern: /\/outpatient(?!.*intensive)/i },
    { service: "Dual Diagnosis", pattern: /\/dual.?diagnosis|\/co.?occurring/i },
    { service: "Verify Insurance", pattern: /\/verify.?insur|\/vob\b|\/insurance.?verif|\/check.?insur/i },
    { service: "Contact / Admissions", pattern: /\/contact\b|\/admissions\b|\/get.?help\b|\/admit\b/i },
    { service: "Primary Location", pattern: /\/location\b|\/campus\b|\/facility\b|\/our.?location/i },
    { service: "Therapies", pattern: /\/therap(y|ies)\b|\/treatment.?modalities|\/modalities/i },
    { service: "Conditions", pattern: /\/conditions\b|\/mental.?health\b|\/disorders\b/i },
  ];

  // Insurance landing pages (common but broad) — allow as fallback for Verify Insurance
  const insuranceBroadPattern = /\/insurance\b/i;

  if (sfData.length > 0 && urlCol) {
    const allUrls = sfData.map(r => String(r[urlCol] ?? ""));
    // Filter to only valid page URLs before any matching
    const pageUrls = allUrls.filter(isValidPageUrl);

    console.log(`[Section4] Total SF URLs: ${allUrls.length}, valid page URLs after filtering: ${pageUrls.length}`);

    for (const target of serviceTargets) {
      // Collect all candidates for this service
      let candidates = pageUrls.filter(u => target.pattern.test(u));

      // Fallback for Verify Insurance: allow the broader /insurance/ path if no specific match
      if (candidates.length === 0 && target.service === "Verify Insurance") {
        candidates = pageUrls.filter(u => insuranceBroadPattern.test(u));
      }

      if (candidates.length > 0) {
        // Sort by score — best candidate first
        candidates.sort((a, b) => scorePage4Url(b) - scorePage4Url(a));
        const best = candidates[0];
        console.log(`[Section4] ${target.service} → ${shortUrl(best)} (${candidates.length} candidates, rejected ${pageUrls.length === 0 ? 0 : allUrls.filter(u => target.pattern.test(u) && !isValidPageUrl(u)).length} assets)`);
        services.push({ service: target.service, examplePage: shortUrl(best) });
      } else {
        const rejectedCount = allUrls.filter(u => target.pattern.test(u) && !isValidPageUrl(u)).length;
        if (rejectedCount > 0) {
          console.log(`[Section4] ${target.service} → ${ME} (${rejectedCount} asset matches rejected, no valid page found)`);
        }
      }
    }
  }

  // Fill missing services with ME up to 8 rows
  for (const target of serviceTargets) {
    if (services.length >= 8) break;
    if (!services.find(s => s.service === target.service)) {
      services.push({ service: target.service, examplePage: ME });
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

interface AmContext {
  sentimentKey: string | null;
  hypothesisSignals: string[];
  hypothesisSummary: string | null;
  auditSignals: string[];
  auditSummary: string | null;
}

function parseAmContext(sentiment?: string, hypothesis?: string, auditNotes?: string): AmContext {
  const hypothesisSignals: string[] = [];
  const hypothesisSummary = hypothesis?.trim() ? hypothesis.trim().slice(0, 160) : null;

  if (hypothesis) {
    const h = hypothesis.toLowerCase();
    if (/admissions|vob|insurance.*verif|contact form|conversion path/.test(h)) hypothesisSignals.push("admissions_path");
    if (/service.?page|program page|trust/.test(h)) hypothesisSignals.push("service_page");
    if (/convert|cvr|conversion rate|cta/.test(h)) hypothesisSignals.push("conversion");
    if (/internal.?link/.test(h)) hypothesisSignals.push("internal_linking");
    if (/local|gbp|google business|map pack|location page/.test(h)) hypothesisSignals.push("local");
    if (/content|blog|refresh|article|copywrite/.test(h)) hypothesisSignals.push("content");
    if (/technical|crawl|site.?speed|core web|performance|site.?health/.test(h)) hypothesisSignals.push("technical");
    if (/cannibali|duplicate.?content/.test(h)) hypothesisSignals.push("cannibalization");
    if (/keyword|rank|position|serp/.test(h)) hypothesisSignals.push("rankings");
  }

  const auditSignals: string[] = [];
  const auditSummary = auditNotes?.trim() ? auditNotes.trim().slice(0, 200) : null;

  if (auditNotes) {
    const a = auditNotes.toLowerCase();
    if (/title|meta desc|h1|heading tag/.test(a)) auditSignals.push("metadata");
    if (/internal.?link/.test(a)) auditSignals.push("internal_linking");
    if (/thin content|thin pages|duplicate|cannibali/.test(a)) auditSignals.push("thin_content");
    if (/redirect|404|broken link|error page/.test(a)) auditSignals.push("crawl_errors");
    if (/speed|core web vitals|lcp|cls|fid|page speed/.test(a)) auditSignals.push("page_speed");
    if (/admissions|vob|contact|conversion/.test(a)) auditSignals.push("admissions_path");
    if (/service.?page|program page/.test(a)) auditSignals.push("service_page");
    if (/schema|structured data/.test(a)) auditSignals.push("schema");
  }

  return {
    sentimentKey: sentiment ?? null,
    hypothesisSignals,
    hypothesisSummary,
    auditSignals,
    auditSummary,
  };
}

function enrichWithAmContext(priorities: PriorityRow[], amCtx: AmContext): void {
  for (const p of priorities) {
    const initLower = p.initiative.toLowerCase();

    if (amCtx.hypothesisSignals.includes("admissions_path") &&
      /admissions|conversion path|vob/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("service_page") &&
      /service page|service foundation/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("internal_linking") &&
      /internal link/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM context: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("content") &&
      /content refresh/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM context: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("technical") &&
      /technical cleanup/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }

    if (amCtx.auditSignals.includes("metadata") && /title|meta/.test(initLower)) {
      p.reason += " Manual audit confirms: metadata gaps present — title and description optimization will improve click-through on current impressions.";
    }
    if (amCtx.auditSignals.includes("internal_linking") && /internal link/.test(initLower)) {
      p.reason += " Manual audit confirms: internal linking gaps identified — high-traffic pages are not passing authority to conversion pages.";
    }
    if (amCtx.auditSignals.includes("thin_content") && /content refresh/.test(initLower)) {
      p.reason += " Manual audit confirms: thin or duplicate content detected — refreshing these pages directly improves crawl quality and topical authority.";
    }
    if (amCtx.auditSignals.includes("crawl_errors") && /technical cleanup/.test(initLower)) {
      p.reason += " Manual audit confirms: redirect chains and error pages identified — resolving these improves crawl efficiency and page equity flow.";
    }
    if (amCtx.auditSignals.includes("admissions_path") && /admissions|conversion path|vob/.test(initLower)) {
      p.reason += " Manual audit flags the admissions/VOB path as a friction point — aligns with this initiative.";
    }
    if (amCtx.auditSignals.includes("service_page") && /service page|service foundation/.test(initLower)) {
      p.reason += " Manual audit flagged service page gaps — consolidation and refresh are confirmed priorities.";
    }
  }
}

function addNetNewAmPriorities(
  priorities: PriorityRow[],
  amCtx: AmContext,
  section5: Section5Diagnosis
): void {
  const covered = priorities.map(p => p.initiative.toLowerCase());

  if (amCtx.hypothesisSignals.includes("local") &&
    !covered.some(c => /local|gbp/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Local Presence Optimization",
      tier: "Tier 3",
      action: "Strengthen Google Business Profile signals and local service-area content to improve map-pack visibility in the primary target market",
      reason: amCtx.hypothesisSummary
        ? `Strategic focus this quarter: ${amCtx.hypothesisSummary.slice(0, 100).replace(/\.$/, "")}. Local signals are a compounding factor for treatment center visibility in geo-targeted searches.`
        : "Local presence improvements compound with organic rankings — GBP signals, local citations, and location content reinforce market-area authority",
      source: "Manual entry needed",
    });
  }

  if (amCtx.hypothesisSignals.includes("rankings") &&
    !covered.some(c => /keyword rank|ranking accel/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Keyword Ranking Acceleration",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: "Identify the 10–15 highest-value keywords where the site ranks on page 2 and build targeted content and link equity to push them to page 1",
      reason: amCtx.hypothesisSummary
        ? `Strategic direction: ${amCtx.hypothesisSummary.slice(0, 100).replace(/\.$/, "")}. Page 2 keywords are the fastest path to meaningful organic traffic gains without new content investment.`
        : "Page 2 rankings represent ready-to-capture traffic — closing that gap is higher ROI than launching net-new content",
      source: "GSC",
    });
  }

  if (amCtx.auditSignals.includes("page_speed") &&
    !covered.some(c => /speed|core web|performance/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Core Web Vitals / Page Speed",
      tier: "Tier 3",
      action: "Audit and improve LCP, CLS, and FID scores on primary service and admissions pages to meet Google's performance threshold",
      reason: "Manual audit flagged page speed as an issue — slow load times on high-intent pages suppress both rankings and on-site conversion rates",
      source: "Manual entry needed",
    });
  }

  if (amCtx.auditSignals.includes("schema") &&
    !covered.some(c => /schema|structured data/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Schema Markup Implementation",
      tier: "Tier 3",
      action: "Implement LocalBusiness, MedicalOrganization, and FAQ schema on core service and admissions pages",
      reason: "Manual audit identified missing structured data — schema markup improves SERP feature eligibility and helps Google confirm treatment center entity context",
      source: "Manual entry needed",
    });
  }

  if (amCtx.hypothesisSignals.includes("cannibalization") &&
    !covered.some(c => /cannibali|consolidat/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Keyword Cannibalization Cleanup",
      tier: "Tier 3",
      action: "Identify pages competing for the same service and condition keywords and consolidate or differentiate them to protect primary ranking pages",
      reason: amCtx.hypothesisSummary
        ? `AM focus area: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}. Cannibalization dilutes authority on core service pages.`
        : "Pages competing for the same keywords split ranking signals — consolidation protects the primary service page hierarchy",
      source: "Manual entry needed",
    });
  }
}

function hasTrackingGaps(section2: Section2Conversions): boolean {
  const allNotes = [
    ...section2.topConvertingPages.map(p => p.notes),
    ...section2.topConvertingSources.map(s => s.notes),
  ].join(" ").toLowerCase();
  return TRACKING_GAP_PHRASES.some(phrase => allNotes.includes(phrase));
}

const S6_BUSINESS_ORDER: string[] = [
  "Tracking & Attribution Setup",
  "Admissions Pathway Clarity",
  "Core Service Page Foundation",
  "Conversion Path Audit",
  "Internal Linking — High-Traffic to Conversion",
  "Content Refresh — Highest-Traffic Assisted Pages",
  "Title & Meta Optimization",
  "Conditions Hub Structure",
  "Therapies Architecture",
  "Technical Cleanup",
  "Location Consolidation",
  "Organic Channel Health Review",
];

function sortByBusinessOrder(priorities: PriorityRow[]): void {
  priorities.sort((a, b) => {
    const ai = S6_BUSINESS_ORDER.indexOf(a.initiative);
    const bi = S6_BUSINESS_ORDER.indexOf(b.initiative);
    const aIdx = ai >= 0 ? ai : S6_BUSINESS_ORDER.length;
    const bIdx = bi >= 0 ? bi : S6_BUSINESS_ORDER.length;
    return aIdx - bIdx;
  });
  priorities.forEach((p, i) => { p.priority = i + 1; });
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

  if (hasTrackingGaps(section2) && !isAlreadyDone("tracking") && !isAlreadyDone("attribution")) {
    priorities.push({
      priority: 1,
      initiative: "Tracking & Attribution Setup",
      tier: "Tier 1",
      action: "Implement or verify GA4 and call-tracking instrumentation on key admissions-path pages — track contact form submits separately from Verify Insurance / VOB form submits, starting with Contact, Verify Insurance, and highest-intent service pages.",
      reason: "Reporting confidence is limited where conversion tracking is missing. Instrumentation must be in place before page-level admit connection can be quantified reliably.",
      source: "Multi-source",
    });
  }

  if (section5.tier <= 1) {
    if (!tierInput.hasDetoxPage || !tierInput.hasResidentialPage) {
      if (!isAlreadyDone("service page") && !isAlreadyDone("detox") && !isAlreadyDone("residential")) {
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Core Service Page Foundation",
          tier: "Tier 1",
          action: "Refresh and consolidate primary detox and residential intent so Google sees one clear service path per treatment level",
          reason: "Core service pages are the foundation for search trust — without clear primary URLs, nothing else compounds",
          source: "Multi-source",
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
          source: "Multi-source",
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
        source: "Multi-source",
      });
    }
    if (!tierInput.hasTherapiesHub && !isAlreadyDone("therapies hub") && !isAlreadyDone("therapy hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Therapies Architecture",
        tier: "Tier 2",
        action: "Organize treatment modalities into a therapies hub that reinforces service page authority",
        reason: "Therapy pages support E-E-A-T and differentiate the program in competitive searches",
        source: "Multi-source",
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
        source: "Multi-source",
      });
    }
    if (tierInput.overlapGeoPages > 5 && !isAlreadyDone("geo") && !isAlreadyDone("location")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Location Consolidation",
        tier: "Tier 3",
        action: "Retire overlapping near-me and legacy geo pages into the primary location architecture",
        reason: "Duplicate geo pages dilute authority and confuse Google about the primary service area",
        source: "Multi-source",
      });
    }
  }

  const unclearTrafficPages = section3.topTrafficPages.filter(p =>
    p.connectionToAdmits === "Low" || p.connectionToAdmits === "Medium"
  );
  const topUnclearPage = unclearTrafficPages[0];
  const goalBehind = section1.rows.some(r => r.goalShift === "-5%");
  const hasMissingH1s = tierInput.missingH1s > 10;
  const hasThinPages = tierInput.thinPages > 15;
  const topTrafficTopic = section3.topTrafficTopics.find(t => t.connectionToAdmits === "Low" || t.connectionToAdmits === "Medium");
  const thinPagesNote = hasThinPages ? ` (${tierInput.thinPages} thin pages detected in crawl)` : "";

  const evidenceFillers: Array<{ initiative: string; tier: string; action: string; reason: string; condition: boolean; source: string }> = [
    {
      initiative: "Internal Linking — High-Traffic to Conversion",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: topUnclearPage
        ? `Add internal links from "${topUnclearPage.page}" (${topUnclearPage.clicks} clicks, ${topUnclearPage.connectionToAdmits.toLowerCase()} admit connection) to primary service and VOB pages`
        : "Add internal links from high-traffic informational pages to primary service and VOB pages",
      reason: topUnclearPage
        ? `${topUnclearPage.clicks} organic clicks land on a page with limited path to admissions — targeted internal links to service and VOB pages are the lowest-cost lever to convert that existing traffic`
        : "Traffic data shows high-volume informational pages with weak admit connection — internal linking is the lowest-cost conversion lever",
      condition: unclearTrafficPages.length > 0 && !priorities.find(p => p.initiative.includes("Internal Link")),
      source: "GSC",
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
      source: "GA4",
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
      source: "GSC",
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
      source: "Multi-source",
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
        source: f.source,
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
      source: "GA4",
    });
  }

  const amCtx = parseAmContext(sentiment, hypothesis, auditNotes);

  enrichWithAmContext(priorities, amCtx);

  addNetNewAmPriorities(priorities, amCtx, section5);

  if (amCtx.sentimentKey === "concerned" || amCtx.sentimentKey === "frustrated") {
    if (priorities.length > 0) {
      priorities[0].reason = `Given the current client situation, this is the highest-leverage action to address performance concerns. ${priorities[0].reason}`;
    }
  } else if (amCtx.sentimentKey === "happy") {
    if (priorities.length > 0) {
      priorities[0].reason = `Building on current momentum, ${priorities[0].reason.charAt(0).toLowerCase() + priorities[0].reason.slice(1)}`;
    }
  }

  sortByBusinessOrder(priorities);

  return { priorities: priorities.slice(0, 7) };
}

interface Section7EvidenceFlags {
  ga4Active: boolean;   // GA4 returned usable data (landing rows OR funnel)
  gscActive: boolean;   // GSC returned usable query/page rows
  callActive: boolean;  // Call tracking (CallRail/CTM) returned usable rows
  gbpActive: boolean;   // GBP data available
}

function generateSection7(section6: Section6Priorities, section5: Section5Diagnosis, evidence: Section7EvidenceFlags): Section7Tracking {
  const tracking: TrackingRow[] = [];

  const { ga4Active, gscActive, callActive } = evidence;

  function inferStatus(source: string): string {
    const s = source.toLowerCase();
    if (s.includes("ga4") || s.includes("google analytics")) return ga4Active ? "Live" : "Missing Setup";
    if (s.includes("call tracking") || s.includes("callrail") || s.includes("ctm") || s.includes("nimbata")) return callActive ? "Live" : "Missing Setup";
    if (s.includes("gsc") || s.includes("google search console") || s.includes("search console")) return gscActive ? "Live" : "Missing Setup";
    if (s.includes("multi-source")) return "Needs Verification";
    if (s.includes("gbp")) return "Needs Verification";
    return "Needs Verification";
  }

  const metricMap: Record<string, TrackingRow> = {
    "Tracking & Attribution Setup": {
      focusArea: "Admissions Conversions",
      metric: "Verify Insurance / VOB form submits + contact form submits + qualified organic calls",
      source: "GA4 / Call Tracking",
      status: ga4Active && callActive ? "Needs Verification" : "Missing Setup",
      whyItMatters: "Directly measures admission-driving actions from organic traffic",
    },
    "Core Service Page Foundation": {
      focusArea: "Service Page Visibility",
      metric: "GSC clicks to primary service pages (detox, residential, PHP/IOP)",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "Measures whether core pages are capturing high-intent search demand",
    },
    "Admissions Pathway Clarity": {
      focusArea: "Admissions Conversions",
      metric: "Verify Insurance / VOB form submits + contact form submits + qualified organic calls",
      source: "GA4 + Call Tracking",
      status: ga4Active && callActive ? "Live" : "Missing Setup",
      whyItMatters: "Directly measures admission-driving actions from organic traffic",
    },
    "Conditions Hub Structure": {
      focusArea: "Authority Coverage",
      metric: "Organic sessions to conditions hub pages",
      source: "GA4",
      status: inferStatus("GA4"),
      whyItMatters: "Tracks whether hub structure is attracting topical authority traffic",
    },
    "Therapies Architecture": {
      focusArea: "Therapy Page Performance",
      metric: "GSC impressions and clicks for therapy-related queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "Measures whether therapy content is capturing differentiation searches",
    },
    "Technical Cleanup": {
      focusArea: "Crawl Health",
      metric: "Reduction in 4xx/5xx errors and redirect chains",
      source: "Multi-source",
      status: "Live",
      whyItMatters: "Fewer errors = better crawl budget allocation to revenue pages",
    },
    "Location Consolidation": {
      focusArea: "Local Visibility",
      metric: "GBP calls + direction requests + local organic sessions",
      source: "GBP + GA4",
      status: "Needs Verification",
      whyItMatters: "Validates that location consolidation improves local conversion signals",
    },
    "Conversion Path Audit": {
      focusArea: "Conversion Rate",
      metric: "Organic conversion rate on top landing pages",
      source: "GA4",
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Higher CVR on existing traffic is the most capital-efficient growth lever",
    },
    "Conversion Path Optimization": {
      focusArea: "Conversion Rate",
      metric: "Organic conversion rate on top landing pages",
      source: "GA4",
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Higher CVR on existing traffic is the most capital-efficient growth lever",
    },
    "Internal Linking — High-Traffic to Conversion": {
      focusArea: "Internal Link Effectiveness",
      metric: "Click-through from informational pages to service/VOB pages",
      source: "GA4",
      status: ga4Active ? "Inferred Only" : "Missing Setup",
      whyItMatters: "Measures whether internal linking strategy converts existing traffic to admissions pages",
    },
    "Content Refresh — Highest-Traffic Assisted Pages": {
      focusArea: "Content Performance",
      metric: "CTR improvement on high-impression non-brand queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "CTR gains on existing impressions drive incremental traffic without new content",
    },
    "Content Refresh — Highest-Value Pages": {
      focusArea: "Content Performance",
      metric: "CTR improvement on high-impression non-brand queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
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
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Primary volume indicator for organic channel health",
    },
    {
      focusArea: "Qualified Calls",
      metric: "Organic phone calls (answered, 60s+)",
      source: "Call Tracking",
      status: callActive ? "Live" : "Missing Setup",
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
