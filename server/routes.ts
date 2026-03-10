import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertClientSchema } from "@shared/schema";
import {
  createSavedReport,
  updateSavedReport,
  getSavedReportById,
  listSavedReportsByClientAndType,
  listSavedReportsByClient,
  softDeleteSavedReport,
} from "./savedReportService";
import {
  buildAssetName,
  createCrawlAsset,
  listCrawlAssets,
  listCrawlSessions,
  getCrawlAsset,
  getCrawlAssetWithData,
  deleteCrawlAsset,
} from "./crawlAssetService";
import { parseNaturalQuery, getCommandDescription, getDateRangeLabel } from "./nlRouter";
import { fetchAirtableWorkLog } from "./airtable";
import { seedDatabase } from "./seed";
import { encrypt, decrypt, deriveInternalToken } from "./encryption";
import { buildGoogleAuthUrl, exchangeCodeForToken, callbackHtml, isGoogleConfigured } from "./googleAuth";
import { testCredential } from "./connectionTest";
import { insertSfReportSchema, insertCallTrackingReportSchema, amInputsSchema, migrateLegacyAmInputs } from "@shared/schema";
import { generateBiweeklyDocx, generatePptx, generateQbrPrepDocx } from "./reportGenerators";
import { generateBiweeklyPdf, generateMonthlyPdf } from "./pdfGenerator";
import { generatePdfViaPuppeteer } from "./puppeteerPdfGenerator";
import type { SectionData } from "./reportGenerators";
import { getSampleBiweeklySections, getSampleMonthlySections, getSampleQbrSections, getSampleQbrPrepJson, SAMPLE_CLIENT_NAME, SAMPLE_ATTENDEES } from "./sampleData";
import { type GapContext, buildGapContext, gapContextToString, getAnswerUsageMap } from "./gapAnswerContext";
import { validateAndSanitizeGapAnswers } from "./gapAnswerValidator";
import { generateQbrPrep } from "./qbrPrepGenerator";
import type { QbrPrepJson } from "./qbrPrepGenerator";
import { generateBiweekly } from "./biweeklyGenerator";
import { generateMonthly } from "./monthlyGenerator";
import { generateQbrFull } from "./qbrFullGenerator";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { queryAhrefs, handlesAhrefsCommand } from "./ahrefsClient";
import { queryGbp } from "./gbpClient";
import { querySfReport, handlesSfCommand } from "./sfClient";
import { getGoogleAccessToken } from "./googleToken";
import { generateQbrPrepReport } from "./qbrPrepSectionGenerator";
import { generateQbrPrepV2Docx } from "./qbrPrepDocxGenerator";
import { analyzeReportGaps, loadSEOHQContext, type AccountContext } from "./gapAnalysisEngine";
import { resolveClientMonthlyCredits, CLIENT_MONTHLY_CREDIT_MAP } from "./clientCreditMap";
import { validateQbrPrepExportReadiness } from "./qbrPrepExportValidator";


const SECTION_COMMANDS_AUTO: Record<string, Record<string, string[]>> = {
  biweekly: {
    bw_pulse: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "ga4_session_movers"],
    bw_progress: ["airtable_work_log"],
  },
  monthly: {
    mo_qtd: ["ga4_qtd_totals"],
    mo_conversion: ["ga4_landing_pages_by_conversions", "callrail_qoq_top_landing_pages"],
    mo_gsc: ["gsc_qoq_queries", "gsc_top_queries"],
    mo_keywords: ["semrush_keyword_distribution", "semrush_keyword_rankings"],
    mo_initiatives: ["airtable_work_log"],
    mo_audit: ["technical_health_summary"],
    mo_content: ["content_output_summary", "new_pages_tracker"],
  },
  qbr: {
    qbr_performance: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "semrush_organic_overview"],
    qbr_strategy: ["ga4_qoq_organic_landing_pages", "gsc_qoq_pages", "semrush_keyword_distribution"],
  },
};

const COMMAND_DATE_OVERRIDES: Record<string, string> = {
  ga4_qtd_totals: "qtd",
};


// Simple in-memory cache for expensive Google API calls
const apiCache: Record<string, { data: any; expiresAt: number }> = {};
function getCached(key: string) {
  const entry = apiCache[key];
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}
function setCache(key: string, data: any, ttlMs: number) {
  apiCache[key] = { data, expiresAt: Date.now() + ttlMs };
}

const printCache = new Map<string, { data: any; ts: number }>();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, v] of printCache) if (v.ts < cutoff) printCache.delete(k);
}, 60_000);

const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please wait a minute before trying again." },
  skip: (_req) => process.env.NODE_ENV === "test",
});

function parseCustomRowsFromEdits(edits: Record<string, string> | undefined, tableId: string): string[][] {
  if (!edits) return [];
  try {
    const raw = edits["__cr__" + tableId];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[][]) : [];
  } catch { return []; }
}

function logExport(label: string, startMs: number, ok: boolean, err?: string) {
  const dur = Date.now() - startMs;
  if (ok) console.log(`[Export] ${label} — OK (${dur}ms)`);
  else console.error(`[Export] ${label} — FAILED (${dur}ms): ${err ?? "unknown"}`);
}

function validateExportPayload(
  reportType: string,
  data: any,
  requiredKeys: string[]
): string | null {
  if (!data) return `No payload provided for ${reportType} export`;
  for (const key of requiredKeys) {
    if (data[key] === undefined || data[key] === null) {
      return `Missing required field "${key}" for ${reportType} export`;
    }
  }
  return null;
}

function validateAmInputs(body: any): { error: string } | { amInputs: { clientSentiment: string; amThoughts: string; priorityChecks: string; clientNotes: string } } {
  const raw = body.amInputs ?? body;
  const migrated = migrateLegacyAmInputs({
    clientSentiment: raw.clientSentiment ?? raw.sentiment,
    amThoughts: raw.amThoughts ?? raw.hypothesis,
    priorityChecks: raw.priorityChecks ?? raw.auditNotes,
    clientNotes: raw.clientNotes ?? "",
  });
  const result = amInputsSchema.safeParse(migrated);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message).join("; ");
    return { error: `AM Inputs validation failed: ${messages}` };
  }
  return { amInputs: result.data };
}

function injectQbrPrepCustomRows(reportData: any, edits: Record<string, string> | undefined) {
  if (!reportData || !edits) return reportData;
  const rd = { ...reportData };
  if (rd.section1Goals?.rows) {
    const cr = parseCustomRowsFromEdits(edits, "s1");
    rd.section1Goals = { ...rd.section1Goals, rows: [...rd.section1Goals.rows, ...cr.map(r => ({ goalType: r[0] ?? "", goal: r[1] ?? "", measurementSource: r[2] ?? "", goalShift: r[3] ?? "", reason: r[4] ?? "" }))] };
  }
  if (rd.section2Conversions?.topConvertingPages) {
    const cr = parseCustomRowsFromEdits(edits, "s2a");
    rd.section2Conversions = { ...rd.section2Conversions, topConvertingPages: [...rd.section2Conversions.topConvertingPages, ...cr.map(r => ({ type: r[0] ?? "", page: r[1] ?? "", notes: r[2] ?? "" }))] };
  }
  if (rd.section2Conversions?.topConvertingSources) {
    const cr = parseCustomRowsFromEdits(edits, "s2b");
    rd.section2Conversions = { ...rd.section2Conversions, topConvertingSources: [...rd.section2Conversions.topConvertingSources, ...cr.map(r => ({ source: r[0] ?? "", whatsConverting: r[1] ?? "", notes: r[2] ?? "" }))] };
  }
  if (rd.section3Traffic?.topTrafficTopics) {
    const cr = parseCustomRowsFromEdits(edits, "s3a");
    rd.section3Traffic = { ...rd.section3Traffic, topTrafficTopics: [...rd.section3Traffic.topTrafficTopics, ...cr.map(r => ({ topic: r[0] ?? "", exampleQueries: r[1] ?? "", connectionToAdmits: r[2] ?? "", insight: r[3] ?? "" }))] };
  }
  if (rd.section3Traffic?.topTrafficPages) {
    const cr = parseCustomRowsFromEdits(edits, "s3b");
    rd.section3Traffic = { ...rd.section3Traffic, topTrafficPages: [...rd.section3Traffic.topTrafficPages, ...cr.map(r => ({ page: r[0] ?? "", clicks: r[1] ?? "", ctr: r[2] ?? "", connectionToAdmits: r[3] ?? "", insight: r[4] ?? "" }))] };
  }
  if (rd.section4Services?.services) {
    const cr = parseCustomRowsFromEdits(edits, "s4");
    rd.section4Services = { ...rd.section4Services, services: [...rd.section4Services.services, ...cr.map(r => ({ service: r[0] ?? "", examplePage: r[1] ?? "" }))] };
  }
  if (rd.section6Priorities?.priorities) {
    const cr = parseCustomRowsFromEdits(edits, "s6");
    rd.section6Priorities = { ...rd.section6Priorities, priorities: [...rd.section6Priorities.priorities, ...cr.map((r, i) => ({ priority: rd.section6Priorities.priorities.length + i + 1, initiative: r[1] ?? "", tier: r[2] ?? "", action: r[3] ?? "", reason: r[4] ?? "" }))] };
  }
  if (rd.section7Tracking?.tracking) {
    const cr = parseCustomRowsFromEdits(edits, "s7");
    rd.section7Tracking = { ...rd.section7Tracking, tracking: [...rd.section7Tracking.tracking, ...cr.map(r => ({ focusArea: r[0] ?? "", metric: r[1] ?? "", source: r[2] ?? "", whyItMatters: r[3] ?? "" }))] };
  }
  return rd;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  const INTERNAL_TOKEN = deriveInternalToken();

  app.get("/api/auth/bootstrap", (req: Request, res: Response) => {
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      const origin  = (req.headers["origin"]  as string | undefined) ?? "";
      const referer = (req.headers["referer"] as string | undefined) ?? "";
      const host    = (req.headers["host"]    as string | undefined) ?? "";
      const source  = origin || referer;
      if (!source) {
        return res.status(403).json({ message: "Forbidden: bootstrap requires a same-origin browser request" });
      }
      let sourceHost: string;
      try {
        sourceHost = new URL(source).host;
      } catch {
        return res.status(403).json({ message: "Forbidden: invalid Origin/Referer header" });
      }
      if (sourceHost !== host) {
        return res.status(403).json({
          message: `Forbidden: cross-origin bootstrap rejected (expected ${host}, got ${sourceHost})`,
        });
      }
    }
    res.json({ token: INTERNAL_TOKEN });
  });

  const AUTH_PUBLIC_PATHS = [
    "/auth/bootstrap",
    "/auth/google/start",
    "/auth/google/callback",
    "/auth/google/configured",
    "/template/header",
  ];
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (AUTH_PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + "?"))) return next();
    const provided = req.headers["x-internal-token"];
    if (provided !== INTERNAL_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  app.use("/api/reports", heavyLimiter);

  const LARGE_BODY_ROUTES = [
    "/crawl-assets", "/sf-reports", "/call-tracking-reports", "/print-cache",
    "/reports/export", "/reports/upload-to-drive",
  ];
  const EXPORT_PATH_PATTERNS = ["/docx", "/pptx", "/docx-v2", "/upload-to-drive", "/preview-pdf", "/export"];
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (!contentLength) return next();
    const isLargeRoute =
      LARGE_BODY_ROUTES.some((r) => req.path.startsWith(r)) ||
      EXPORT_PATH_PATTERNS.some((p) => req.path.endsWith(p));
    const limitBytes = isLargeRoute ? 50 * 1024 * 1024 : 2 * 1024 * 1024;
    if (contentLength > limitBytes) {
      return res.status(413).json({ message: `Request body too large (max ${isLargeRoute ? "50" : "2"}MB for this endpoint)` });
    }
    next();
  });

  app.post("/api/print-cache", (req, res) => {
    const id = randomUUID();
    printCache.set(id, { data: req.body, ts: Date.now() });
    res.json({ id });
  });

  app.get("/api/print-cache/:id", (req, res) => {
    const entry = printCache.get(req.params.id);
    if (!entry) return res.status(404).json({ message: "Not found or expired" });
    res.json(entry.data);
  });

  // Helper: fetch all locations using v1 Account Management API
  async function fetchGbpLocationsV1(accessToken: string) {
    const accountsResp = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const accountsData = await accountsResp.json() as any;
    if (!accountsResp.ok) return { ok: false, status: accountsResp.status, data: accountsData };

    const accounts: any[] = accountsData.accounts ?? [];
    const allLocations: { displayName: string; address: string; resourceName: string }[] = [];
    await Promise.all(accounts.map(async (account: any) => {
      try {
        const locResp = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const locData = await locResp.json() as any;
        for (const loc of (locData.locations ?? [])) {
          const addr = loc.storefrontAddress;
          allLocations.push({
            displayName: loc.title ?? loc.name,
            address: addr ? [addr.locality, addr.administrativeArea].filter(Boolean).join(", ") : "",
            resourceName: `${account.name}/${loc.name}`,
          });
        }
      } catch { /* skip */ }
    }));
    return { ok: true, locations: allLocations };
  }

  // Helper: fetch locations using legacy v4 API (separate quota from v1)
  async function fetchGbpLocationsV4(accessToken: string) {
    const accountsResp = await fetch(
      "https://mybusiness.googleapis.com/v4/accounts",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!accountsResp.ok) return { ok: false };
    const accountsData = await accountsResp.json() as any;
    const accounts: any[] = accountsData.accounts ?? [];
    const allLocations: { displayName: string; address: string; resourceName: string }[] = [];
    await Promise.all(accounts.map(async (account: any) => {
      try {
        const locResp = await fetch(
          `https://mybusiness.googleapis.com/v4/${account.name}/locations?readMask=name,locationName,address&pageSize=100`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!locResp.ok) return;
        const locData = await locResp.json() as any;
        for (const loc of (locData.locations ?? [])) {
          const addr = loc.address;
          allLocations.push({
            displayName: loc.locationName ?? loc.name,
            address: addr ? [addr.locality, addr.administrativeArea].filter(Boolean).join(", ") : "",
            resourceName: loc.name,
          });
        }
      } catch { /* skip */ }
    }));
    return { ok: true, locations: allLocations };
  }

  // Fetch GBP accounts + locations using stored OAuth token
  app.get("/api/gbp/locations", async (_req, res) => {
    const cached = getCached("gbp_locations");
    if (cached) return res.json(cached);
    try {
      const accessToken = await getGoogleAccessToken("google_business_profile");
      if (!accessToken) {
        return res.status(401).json({ message: "Google Business Profile not connected. Connect it in Setup → Analytics & Search." });
      }

      const v1Result = await fetchGbpLocationsV1(accessToken);
      if (v1Result.ok) {
        const payload = { locations: v1Result.locations };
        setCache("gbp_locations", payload, 10 * 60 * 1000);
        return res.json(payload);
      }

      // v1 failed — inspect the error
      const rawMsg: string = v1Result.data?.error?.message ?? "";
      const rawStatus = v1Result.status as number;
      const rawReason = v1Result.data?.error?.status ?? v1Result.data?.error?.code ?? "";
      console.error(`[GBP] v1 accounts API error ${rawStatus}: msg="${rawMsg}" status="${rawReason}"`);

      const details = v1Result.data?.error?.details ?? [];
      const quotaDetail = details.find((d: any) => d["@type"]?.includes("ErrorInfo") && d.reason === "RATE_LIMIT_EXCEEDED");
      const isQuotaZero = rawStatus === 429 && quotaDetail?.metadata?.quota_limit_value === "0";

      if (isQuotaZero) {
        // Try legacy v4 API as fallback — separate quota
        console.log("[GBP] v1 quota=0, trying legacy v4 API...");
        const v4Result = await fetchGbpLocationsV4(accessToken);
        if (v4Result.ok && v4Result.locations) {
          console.log(`[GBP] v4 fallback succeeded, found ${v4Result.locations.length} locations`);
          const payload = { locations: v4Result.locations, source: "v4_fallback" };
          setCache("gbp_locations", payload, 10 * 60 * 1000);
          return res.json(payload);
        }
        // Both failed — return actionable error
        const projectMatch = rawMsg.match(/project[_ ](?:number:)?(\d+)/);
        const projectId = projectMatch?.[1] ?? "";
        const quotaUrl = projectId
          ? `https://console.cloud.google.com/iam-admin/quotas?service=mybusinessaccountmanagement.googleapis.com&project=${projectId}`
          : "https://console.cloud.google.com/iam-admin/quotas?service=mybusinessaccountmanagement.googleapis.com";
        return res.status(429).json({
          message: "The My Business Account Management API quota is 0. A quota increase has been requested — once approved, this will auto-populate. In the meantime, paste your location resource name (accounts/XXX/locations/YYY) directly in the field below.",
          enableUrl: quotaUrl,
          linkLabel: "Check quota increase status in Google Cloud Console",
        });
      }

      if (rawMsg.includes("has not been used") || rawMsg.includes("is disabled") || rawReason === "API_NOT_ACTIVATED") {
        const projectMatch = rawMsg.match(/project[_ ](?:number:)?(\d+)/);
        const projectId = projectMatch?.[1] ?? "";
        const enableUrl = projectId
          ? `https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=${projectId}`
          : "https://console.developers.google.com/apis/library/mybusinessaccountmanagement.googleapis.com";
        return res.status(403).json({
          message: "The Google My Business Account Management API is not enabled. Enable it, wait ~1 minute, then try again.",
          enableUrl,
        });
      }

      return res.status(rawStatus || 500).json({ message: rawMsg || "Failed to fetch GBP accounts" });
    } catch (err: any) {
      console.error("[GBP] /api/gbp/locations error:", err.message);
      res.status(500).json({ message: "Failed to fetch GBP locations: " + err.message });
    }
  });

  // Search for a GBP location by business name (uses Business Information API — separate quota)
  app.get("/api/gbp/detect-location", async (req, res) => {
    const q = ((req.query.q as string) ?? "").trim();
    if (!q) return res.status(400).json({ message: "Query required" });
    try {
      const accessToken = await getGoogleAccessToken("google_business_profile");
      if (!accessToken) return res.status(401).json({ message: "Google Business Profile not connected." });

      const searchResp = await fetch(
        "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, pageSize: 5 }),
        }
      );
      const searchData = await searchResp.json() as any;
      if (!searchResp.ok) {
        return res.status(searchResp.status).json({ message: searchData.error?.message || "Search failed" });
      }

      const results = (searchData.googleLocations ?? []).map((loc: any) => ({
        resourceName: loc.name,
        displayName: loc.location?.title ?? loc.name,
        address: [
          loc.location?.address?.addressLines?.[0],
          loc.location?.address?.locality,
          loc.location?.address?.administrativeArea,
        ].filter(Boolean).join(", "),
        requestAdminRightsUrl: loc.requestAdminRightsUrl ?? null,
      }));

      res.json({ locations: results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/ga4/properties", async (_req, res) => {
    try {
      const accessToken = await getGoogleAccessToken("google_analytics_4");
      if (!accessToken) {
        return res.status(401).json({ message: "GA4 is not connected. Connect it in Setup → Analytics & Search." });
      }
      const resp = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json() as any;
      if (!resp.ok) {
        const msg: string = data.error?.message ?? resp.statusText;
        if (msg.includes("has not been used") || msg.includes("is disabled")) {
          const projectMatch = msg.match(/project (\d+)/);
          const projectId = projectMatch?.[1] ?? "";
          const enableUrl = projectId
            ? `https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=${projectId}`
            : "https://console.developers.google.com/apis/library/analyticsadmin.googleapis.com";
          return res.status(403).json({ message: "Google Analytics Admin API is not enabled. Enable it in Google Cloud Console.", enableUrl });
        }
        return res.status(resp.status).json({ message: msg });
      }
      const properties: { propertyId: string; displayName: string; accountName: string }[] = [];
      for (const account of (data.accountSummaries ?? [])) {
        for (const prop of (account.propertySummaries ?? [])) {
          properties.push({
            propertyId: prop.property,
            displayName: prop.displayName,
            accountName: account.displayName,
          });
        }
      }
      res.json({ properties });
    } catch (err: any) {
      console.error("[GA4] /api/ga4/properties error:", err.message);
      res.status(500).json({ message: "Failed to fetch GA4 properties: " + err.message });
    }
  });

  app.get("/api/gsc/sites", async (_req, res) => {
    try {
      const accessToken = await getGoogleAccessToken("google_search_console");
      if (!accessToken) {
        return res.status(401).json({ message: "Google Search Console is not connected. Connect it in Setup → Analytics & Search." });
      }
      const resp = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json() as any;
      if (!resp.ok) {
        return res.status(resp.status).json({ message: data.error?.message ?? resp.statusText });
      }
      const sites = (data.siteEntry ?? []).map((s: any) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      }));
      res.json({ sites });
    } catch (err: any) {
      console.error("[GSC] /api/gsc/sites error:", err.message);
      res.status(500).json({ message: "Failed to fetch GSC sites: " + err.message });
    }
  });

  app.get("/api/callrail/companies", async (_req, res) => {
    try {
      const creds = await storage.getApiCredentialsByService("callrail");
      if (!creds.length) {
        return res.status(401).json({ message: "CallRail is not connected. Connect it in Setup → Analytics & Search." });
      }
      let apiKey: string;
      try {
        apiKey = decrypt(creds[0].encryptedValue);
      } catch {
        return res.status(401).json({ message: "CallRail credential is corrupted. Please re-connect it in Setup → Analytics & Search." });
      }
      const crHeaders = { Authorization: `Token token="${apiKey}"` };

      // Fetch all accounts (paginated)
      const allAccounts: any[] = [];
      let accountPage = 1;
      while (true) {
        const r = await fetch(`https://api.callrail.com/v3/a.json?per_page=100&page=${accountPage}`, { headers: crHeaders });
        const d = await r.json() as any;
        if (!r.ok) return res.status(r.status).json({ message: d.error || r.statusText });
        const batch: any[] = d.accounts ?? [];
        allAccounts.push(...batch);
        if (allAccounts.length >= (d.total_records ?? batch.length) || batch.length === 0) break;
        accountPage++;
      }

      // For each account, fetch all companies (paginated)
      const companies: { companyId: string; name: string; accountId: string; accountName: string }[] = [];
      for (const account of allAccounts) {
        let page = 1;
        while (true) {
          const r = await fetch(`https://api.callrail.com/v3/a/${account.id}/companies.json?per_page=100&page=${page}`, { headers: crHeaders });
          const d = await r.json() as any;
          if (!r.ok) break;
          const batch: any[] = d.companies ?? [];
          for (const co of batch) {
            companies.push({ companyId: co.id, name: co.name, accountId: account.id, accountName: account.name ?? account.id });
          }
          if (companies.filter(c => c.accountId === account.id).length >= (d.total_records ?? batch.length) || batch.length === 0) break;
          page++;
        }
      }

      // Sort alphabetically by name
      companies.sort((a, b) => a.name.localeCompare(b.name));
      res.json({ companies });
    } catch (err: any) {
      console.error("[CallRail] /api/callrail/companies error:", err.message);
      res.status(500).json({ message: "Failed to fetch CallRail companies: " + err.message });
    }
  });

  app.get("/api/clients", async (_req, res) => {
    const clients = await storage.getClients();
    res.json(clients);
  });

  app.get("/api/clients/:id", async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.post("/api/clients", async (req, res) => {
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid client data", errors: parsed.error.issues });
    }
    const client = await storage.createClient(parsed.data);
    res.status(201).json(client);
  });

  app.patch("/api/clients/:id", async (req, res) => {
    const partialSchema = insertClientSchema.partial();
    const parsed = partialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid client data", errors: parsed.error.issues });
    }
    const client = await storage.updateClient(Number(req.params.id), parsed.data);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.delete("/api/clients/:id", async (req, res) => {
    const deleted = await storage.deleteClient(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Client not found" });
    res.json({ success: true });
  });

  app.post("/api/query", async (req, res) => {
    const { query, clientId } = req.body;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const clients = await storage.getClients();

    let filteredClients = clients;
    if (clientId) {
      filteredClients = clients.filter(c => c.id === clientId);
    }

    const parsed = parseNaturalQuery(query, filteredClients);

    if (!parsed.intent) {
      return res.json({
        success: false,
        error: parsed.error,
        suggestions: parsed.suggestions,
      });
    }

    const { intent } = parsed;
    const client = await storage.getClient(intent.clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    if (intent.command === "airtable_work_log") {
      const { startDate, endDate } = dateRangeToActualDates(intent.dateRange);
      const airtableResult = await fetchAirtableWorkLog(intent.clientId, startDate, endDate);

      if (!airtableResult.success) {
        return res.json({
          success: false,
          error: airtableResult.error,
          setupRequired: (airtableResult as any).setupRequired,
        });
      }

      const { data } = airtableResult;
      const CREDIT_TYPE_LABELS: Record<string, string> = {
        Scale: "New Content (Scale)",
        Optimization: "Content Optimization",
        "CRO Update": "CRO/UX Update",
      };
      const tables = Object.entries(data.byCreditType).map(([creditType, items]) => ({
        title: CREDIT_TYPE_LABELS[creditType] ?? creditType,
        headers: ["Task", "Status", "Due Date", "URL / Page"],
        rows: items.map(item => [item.task, item.status ?? "—", item.date, item.url ?? "—"]),
      }));

      const result = {
        command: "airtable_work_log" as const,
        clientName: data.clientName,
        dateRange: data.dateRange,
        summary: [
          { label: "Total Items", current: data.totalItems.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Work Types", current: Object.keys(data.byCreditType).length.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables,
      };

      await storage.createQueryLog({
        clientId: intent.clientId,
        command: intent.command,
        naturalQuery: query,
        dateRange: intent.dateRange,
        filters: intent.filters,
        resultSummary: `Work log: ${data.totalItems} items across ${Object.keys(data.byCreditType).length} work types`,
        resultData: result as any,
      });

      return res.json({
        success: true,
        commandDescription: getCommandDescription(intent.command),
        dateRangeLabel: data.dateRange,
        result,
      });
    }

    // Live data dispatch — priority: Google → Screaming Frog → CallRail/CTM → SEMrush → Ahrefs → GBP → mock
    let result: any = null;
    let liveSource: string | null = null;

    try {
      if (handlesGscCommand(intent.command)) {
        result = await queryGsc(intent.command, client, intent.dateRange);
        if (result) liveSource = "gsc";
      }
      if (!result && handlesGa4Command(intent.command)) {
        result = await queryGa4(intent.command, client, intent.dateRange);
        if (result) liveSource = "ga4";
      }
      if (!result && handlesSfCommand(intent.command)) {
        result = await querySfReport(intent.command, client, intent.dateRange);
        if (result) liveSource = "screaming_frog";
      }
      if (!result && handlesCallRailCommand(intent.command)) {
        result = await queryCallRail(intent.command, client, intent.dateRange);
        if (result) liveSource = "callrail";
      }
      if (!result && handlesCtmCommand(intent.command)) {
        result = await queryCtm(intent.command, client, intent.dateRange);
        if (result) liveSource = "ctm";
      }
      if (!result && handlesSemrushCommand(intent.command)) {
        result = await querySemrush(intent.command, client, intent.dateRange);
        if (result) liveSource = "semrush";
      }
      if (!result && handlesAhrefsCommand(intent.command)) {
        result = await queryAhrefs(intent.command, client, intent.dateRange);
        if (result) liveSource = "ahrefs";
      }
      if (!result && intent.command === "gbp_local_summary") {
        result = await queryGbp(intent.command, client, intent.dateRange);
        if (result) liveSource = "gbp";
      }
    } catch (liveErr: any) {
      console.warn(`[Live] ${intent.command} failed: ${liveErr.message}`);
    }

    if (!result) {
      return res.status(503).json({
        success: false,
        message: `Data unavailable for "${intent.command}". Check that the required service credentials are connected for this client.`,
        command: intent.command,
        dataUnavailable: true,
      });
    }

    await storage.createQueryLog({
      clientId: intent.clientId,
      command: intent.command,
      naturalQuery: query,
      dateRange: intent.dateRange,
      filters: intent.filters,
      resultSummary: result.summary.map((s: any) => `${s.label}: ${s.current} (${s.deltaPercent})`).join("; "),
      resultData: result as any,
    });

    res.json({
      success: true,
      commandDescription: getCommandDescription(intent.command),
      dateRangeLabel: getDateRangeLabel(intent.dateRange),
      liveSource,
      result,
    });
  });

  function dateRangeToActualDates(dateRange: string): { startDate: string; endDate: string } {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const sub = (d: Date, days: number) => { const r = new Date(d); r.setDate(r.getDate() - days); return r; };
    const end = fmt(now);
    switch (dateRange) {
      case "last_14_vs_prev_14": return { startDate: fmt(sub(now, 14)), endDate: end };
      case "last_28_vs_prev_28": return { startDate: fmt(sub(now, 28)), endDate: end };
      case "last_30_vs_prev_30": return { startDate: fmt(sub(now, 30)), endDate: end };
      case "last_365_vs_prev_365": return { startDate: fmt(sub(now, 365)), endDate: end };
      case "qtd": {
        const month = now.getMonth();
        const qStart = new Date(now.getFullYear(), Math.floor(month / 3) * 3, 1);
        return { startDate: fmt(qStart), endDate: end };
      }
      default: return { startDate: fmt(sub(now, 90)), endDate: end };
    }
  }

  app.get("/api/clients/:id/airtable-work-log", async (req, res) => {
    const clientId = Number(req.params.id);
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const sub = (d: Date, days: number) => { const r = new Date(d); r.setDate(r.getDate() - days); return r; };
    const result = await fetchAirtableWorkLog(
      clientId,
      startDate ?? fmt(sub(now, 90)),
      endDate ?? fmt(now)
    );
    if (!result.success) {
      return res.status(result.setupRequired ? 422 : 500).json({ message: result.error, setupRequired: result.setupRequired });
    }
    res.json(result.data);
  });

  app.get("/api/query-logs", async (req, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const logs = await storage.getQueryLogs(clientId);
    res.json(logs);
  });


  app.get("/api/credentials", async (_req, res) => {
    const creds = await storage.getApiCredentials();
    const safe = creds.map(c => ({
      id: c.id,
      service: c.service,
      credentialType: c.credentialType,
      accountLabel: c.accountLabel,
      hasValue: !!c.encryptedValue,
      metadata: c.metadata,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    res.json(safe);
  });

  app.post("/api/credentials", async (req, res) => {
    const { service, credentialType, value, accountLabel, metadata } = req.body;
    if (!service || !credentialType || !value) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const cred = await storage.createApiCredential({
      service,
      credentialType,
      accountLabel: accountLabel || "Default",
      encryptedValue: encrypt(value),
      metadata: metadata || null,
    });
    res.json({ id: cred.id, service: cred.service, credentialType: cred.credentialType, accountLabel: cred.accountLabel });
  });

  app.delete("/api/credentials/:id", async (req, res) => {
    const deleted = await storage.deleteApiCredential(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Credential not found" });
    res.json({ success: true });
  });

  app.post("/api/credentials/:id/test", async (req, res) => {
    const result = await testCredential(Number(req.params.id));
    res.json(result);
  });

  app.get("/api/auth/google/configured", (_req, res) => {
    res.json({ configured: isGoogleConfigured() });
  });

  app.get("/api/auth/google/start", (req, res) => {
    try {
      const service = req.query.service as string;
      const accountLabel = req.query.accountLabel as string;
      if (!service || !accountLabel) {
        return res.status(400).send("Missing service or accountLabel");
      }
      const url = buildGoogleAuthUrl(service, accountLabel);
      res.redirect(url);
    } catch (err: any) {
      res.status(500).send(callbackHtml(false, err.message));
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error || !code || !state) {
      return res.send(callbackHtml(false, error || "Authorization was denied"));
    }
    try {
      await exchangeCodeForToken(code, state);
      res.send(callbackHtml(true, "Connected"));
    } catch (err: any) {
      res.send(callbackHtml(false, err.message));
    }
  });

  app.get("/api/sheet-data", async (_req, res) => {
    try {
      const sheetUrl = await storage.getSetting("google_sheet_url");
      if (!sheetUrl) return res.status(404).json({ message: "No sheet URL configured" });

      const sheetsCreds = await storage.getApiCredentialsByService("google_sheets");
      if (!sheetsCreds.length) return res.status(401).json({ message: "Google Sheets not authorized. Please authorize in Setup." });

      const { decrypt } = await import("./encryption");
      let refreshToken: string;
      try {
        refreshToken = decrypt(sheetsCreds[0].encryptedValue);
      } catch {
        return res.status(401).json({ message: "Google Sheets credential is corrupted. Please re-authorize in Setup." });
      }

      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const tokenData = (await tokenResp.json()) as any;
      if (!tokenData.access_token) {
        return res.status(401).json({ message: "Failed to get Google access token. Try re-authorizing in Setup." });
      }

      const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) return res.status(400).json({ message: "Invalid Google Sheet URL" });
      const spreadsheetId = match[1];

      const sheetsResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const sheetsData = (await sheetsResp.json()) as any;
      if (!sheetsResp.ok) {
        return res.status(sheetsResp.status).json({ message: sheetsData.error?.message || "Failed to read sheet" });
      }

      const sheets = sheetsData.sheets?.map((s: any) => s.properties?.title) ?? [];

      const valuesResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z500`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const valuesData = (await valuesResp.json()) as any;

      res.json({ title: sheetsData.properties?.title, sheets, values: valuesData.values ?? [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    const all = await storage.getAllSettings();
    const obj: Record<string, string> = {};
    all.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  });

  app.put("/api/settings/:key", async (req, res) => {
    const { value } = req.body;
    if (typeof value !== "string") return res.status(400).json({ message: "value must be a string" });
    const setting = await storage.setSetting(req.params.key, value);
    res.json(setting);
  });

  app.get("/api/qssb/test", async (_req, res) => {
    try {
      const { fetchQssbData } = await import("./qssbClient");
      const data = await fetchQssbData();
      res.json({ success: true, insights: data.clientInsights.length, opportunities: data.additionalOpportunities.length });
    } catch (err: any) {
      res.json({ success: false, message: err.message });
    }
  });

  app.get("/api/strategy-bank/test", async (_req, res) => {
    try {
      const { fetchStrategyBank, clearStrategyBankCache } = await import("./notionClient");
      clearStrategyBankCache();
      const data = await fetchStrategyBank(true);
      const pageId = await storage.getSetting("strategy_bank_page_id");
      res.json({
        success: true,
        entries: data.entries.length,
        pageId: pageId ?? null,
        source: data.source ?? "none",
        error: data.error ?? null,
        accessible: !data.error,
      });
    } catch (err: any) {
      res.json({ success: false, entries: 0, error: err.message, accessible: false });
    }
  });

  app.get("/api/clients/:id/sf-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const reports = await storage.getSfReports(clientId);
    res.json(reports.map(r => ({ id: r.id, clientId: r.clientId, reportDate: r.reportDate, filename: r.filename, rowCount: r.rowCount, headers: r.headers, assetName: r.assetName, sessionId: r.sessionId, sessionName: r.sessionName, fileType: r.fileType, createdAt: r.createdAt })));
  });

  app.post("/api/clients/:id/sf-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const parsed = insertSfReportSchema.safeParse({ ...req.body, clientId });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid SF report data", errors: parsed.error.issues });
    }
    const client = await storage.getClient(clientId);
    const assetName = buildAssetName(
      client?.name ?? "Unknown",
      parsed.data.reportDate
    );
    const report = await storage.createSfReport({ ...parsed.data, assetName });
    const allReports = await storage.getSfReports(clientId);
    const MAX_SF_REPORTS = 24;
    if (allReports.length > MAX_SF_REPORTS) {
      const toDelete = allReports.slice(MAX_SF_REPORTS);
      for (const old of toDelete) {
        await storage.deleteSfReport(old.id);
      }
    }
    res.status(201).json({ id: report.id, clientId: report.clientId, reportDate: report.reportDate, filename: report.filename, rowCount: report.rowCount, headers: report.headers, assetName: report.assetName, sessionId: report.sessionId, sessionName: report.sessionName, fileType: report.fileType, createdAt: report.createdAt });
  });

  app.get("/api/clients/:id/crawl-sessions", async (req, res) => {
    try {
      const clientId = Number(req.params.id);
      if (!clientId || isNaN(clientId)) return res.status(400).json({ message: "Invalid clientId" });
      const sessions = await listCrawlSessions(clientId);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sf-reports/summary", async (req, res) => {
    const rows = await storage.getLatestSfReportPerClient();
    res.json(rows);
  });

  app.get("/api/sf-reports/:id/download", async (req, res) => {
    const report = await storage.getSfReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Not found" });
    const headers = (report.headers || []);
    const rows = ((report.data || []) as Record<string, any>[]);
    const escape = (v: any) => JSON.stringify(String(v ?? ""));
    const csvLines = [headers.map(escape).join(",")];
    for (const row of rows) {
      csvLines.push(headers.map((h: string) => escape(row[h])).join(","));
    }
    const csv = csvLines.join("\n");
    const safeName = (report.filename || ("sf-report-" + report.id)).replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName + "\"");
    res.send(csv);
  });

  app.get("/api/sf-reports/:id", async (req, res) => {
    const report = await storage.getSfReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Not found" });
    res.json(report);
  });

  app.delete("/api/sf-reports/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const report = await storage.getSfReport(id);
      if (!report) return res.status(404).json({ message: "Not found" });
      const requestedClientId = Number(req.query.clientId || req.body?.clientId);
      if (requestedClientId && report.clientId !== requestedClientId) {
        return res.status(403).json({ message: "Forbidden: report does not belong to this client" });
      }
      const ok = await storage.deleteSfReport(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/clients/:id/sf-diff", async (req, res) => {
    const clientId = Number(req.params.id);
    const reports = await storage.getSfReports(clientId);
    if (reports.length < 2) {
      return res.status(400).json({ message: "Need at least 2 Screaming Frog crawls on file to compare. Upload a new crawl to see what changed." });
    }
    const [newReport, oldReport] = reports;
    const URL_COL = ["Address", "URL", "address", "url"].find(k => (newReport.headers || []).includes(k)) ?? "Address";
    const STATUS_COL = ["Status Code", "Status code", "status_code", "Status"].find(k => (newReport.headers || []).includes(k)) ?? "Status Code";
    const INDEX_COL = ["Indexability", "indexability"].find(k => (newReport.headers || []).includes(k)) ?? "Indexability";
    const H1_COL = ["H1-1", "H1", "h1"].find(k => (newReport.headers || []).includes(k)) ?? "H1-1";

    const oldRows = (oldReport.data || []) as Record<string, any>[];
    const newRows = (newReport.data || []) as Record<string, any>[];
    const oldByUrl = new Map(oldRows.map(r => [r[URL_COL], r]));
    const newByUrl = new Map(newRows.map(r => [r[URL_COL], r]));

    type DiffItem = { url: string; oldStatus?: string; newStatus?: string; oldIndex?: string; newIndex?: string; change: string };
    const fixed: DiffItem[] = [];
    const newIssues: DiffItem[] = [];
    const statusChanges: DiffItem[] = [];
    const newPages: string[] = [];
    const removedPages: string[] = [];

    const isError = (code: string | undefined) => {
      const n = Number(code);
      return n >= 400;
    };

    for (const [url, newRow] of Array.from(newByUrl)) {
      const oldRow = oldByUrl.get(url);
      if (!oldRow) { newPages.push(url); continue; }
      const oldStatus = String(oldRow[STATUS_COL] ?? "");
      const newStatus = String(newRow[STATUS_COL] ?? "");
      if (oldStatus !== newStatus) {
        const wasError = isError(oldStatus);
        const isNowError = isError(newStatus);
        if (wasError && !isNowError) {
          fixed.push({ url, oldStatus, newStatus, change: "fixed" });
        } else if (!wasError && isNowError) {
          newIssues.push({ url, oldStatus, newStatus, change: "broken" });
        } else {
          statusChanges.push({ url, oldStatus, newStatus, change: "changed" });
        }
      }
    }
    for (const [url] of Array.from(oldByUrl)) {
      if (!newByUrl.has(url)) removedPages.push(url);
    }

    res.json({
      oldReport: { id: oldReport.id, filename: oldReport.filename, reportDate: oldReport.reportDate, rowCount: oldReport.rowCount },
      newReport: { id: newReport.id, filename: newReport.filename, reportDate: newReport.reportDate, rowCount: newReport.rowCount },
      summary: {
        fixed: fixed.length,
        newIssues: newIssues.length,
        statusChanges: statusChanges.length,
        newPages: newPages.length,
        removedPages: removedPages.length,
      },
      fixed,
      newIssues,
      statusChanges,
      newPages: newPages.slice(0, 50),
      removedPages: removedPages.slice(0, 50),
    });
  });

  app.get("/api/call-tracking-reports/summary", async (req, res) => {
    const rows = await storage.getLatestCallTrackingReportPerClient();
    res.json(rows);
  });

  app.get("/api/call-tracking-reports/:id/download", async (req, res) => {
    const report = await storage.getCallTrackingReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Not found" });
    const headers = (report.headers || []);
    const rows = ((report.data || []) as Record<string, any>[]);
    const escape = (v: any) => JSON.stringify(String(v ?? ""));
    const csvLines = [headers.map(escape).join(",")];
    for (const row of rows) {
      csvLines.push(headers.map((h: string) => escape(row[h])).join(","));
    }
    const csv = csvLines.join("\n");
    const safeName = (report.filename || ("ct-report-" + report.id)).replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName + "\"");
    res.send(csv);
  });

  app.get("/api/clients/:id/call-tracking-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const reports = await storage.getCallTrackingReports(clientId);
    res.json(reports.map(r => ({ id: r.id, clientId: r.clientId, reportDate: r.reportDate, filename: r.filename, rowCount: r.rowCount, headers: r.headers, createdAt: r.createdAt })));
  });

  app.post("/api/clients/:id/call-tracking-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const parsed = insertCallTrackingReportSchema.safeParse({ ...req.body, clientId });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid call tracking report data", errors: parsed.error.issues });
    }
    const report = await storage.createCallTrackingReport(parsed.data);
    res.status(201).json({ id: report.id, clientId: report.clientId, reportDate: report.reportDate, filename: report.filename, rowCount: report.rowCount, headers: report.headers, createdAt: report.createdAt });
  });

  app.delete("/api/call-tracking-reports/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const report = await storage.getCallTrackingReport(id);
      if (!report) return res.status(404).json({ message: "Not found" });
      const requestedClientId = Number(req.query.clientId || req.body?.clientId);
      if (requestedClientId && report.clientId !== requestedClientId) {
        return res.status(403).json({ message: "Forbidden: report does not belong to this client" });
      }
      const ok = await storage.deleteCallTrackingReport(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/reports/gap-analysis", async (req, res) => {
    try {
      const { reportType, clientId, amInputs, reportContext } = req.body;
      if (!reportType || !clientId || !amInputs) {
        return res.status(400).json({ message: "reportType, clientId, and amInputs are required" });
      }

      const client = await storage.getClient(Number(clientId));
      if (!client) return res.status(404).json({ message: "Client not found" });

      const validation = validateAmInputs(amInputs);
      if ("error" in validation) {
        return res.status(400).json({ message: validation.error });
      }

      // Determine available data sources
      const availableDataSources: string[] = [];
      if (client.gscSiteUrl) availableDataSources.push("google_search_console");
      if (client.ga4PropertyId) availableDataSources.push("google_analytics_4");
      if (client.gbpLocationName) availableDataSources.push("google_business_profile");
      if (client.callrailCompanyId) availableDataSources.push("callrail");
      if (client.ctmAccountId) availableDataSources.push("call_tracking_metrics");
      if (client.ahrefsProjectUrl) availableDataSources.push("ahrefs");
      if (client.semrushProjectId) availableDataSources.push("semrush");
      if (client.nimbataAccountId) availableDataSources.push("nimbata");
      if (client.airtableBaseId) availableDataSources.push("airtable");
      if (client.screamingFrogProfile) availableDataSources.push("screaming_frog");

      const accountContext: AccountContext = {
        client,
        availableDataSources,
        recentReports: [], // Could be populated if needed
      };

      const { context: seoHqContext, status: seoHqLoadStatus } = await loadSEOHQContext();
      const result = await analyzeReportGaps(reportType, validation.amInputs as any, accountContext, seoHqContext);

      res.json({ ...result, seoHqLoadStatus });
    } catch (err: any) {
      console.error("[GapAnalysis] Error:", err);
      res.status(500).json({ message: "Failed to run gap analysis: " + err.message });
    }
  });

  app.post("/api/reports/gap-analysis/session", async (req, res) => {
    try {
      const { clientId, reportType, questions, answers, seoHqChecksApplied, seoHqLoadStatus } = req.body;
      if (!clientId || !reportType || !questions) {
        return res.status(400).json({ message: "clientId, reportType, and questions are required" });
      }

      const session = await storage.createGapSession({
        clientId: Number(clientId),
        reportType,
        questions,
        seoHqChecksApplied,
        seoHqLoadStatus: seoHqLoadStatus ? JSON.stringify(seoHqLoadStatus) : undefined,
      });

      if (answers && answers.length > 0) {
        const validation = validateAndSanitizeGapAnswers(answers);
        if (validation.errors.length > 0) {
          const errMsg = validation.errors.map(e => `Q${e.questionId} ${e.field}: ${e.message}`).join("; ");
          console.warn(`[GapSession] Validation warnings (sanitized): ${errMsg}`);
        }
        await storage.updateGapSession(session.id, { answers: validation.valid });
      }

      res.status(201).json({ sessionId: session.id });
    } catch (err: any) {
      console.error("[GapAnalysis] Session creation error:", err);
      res.status(500).json({ message: "Failed to create gap session: " + err.message });
    }
  });

  app.get("/api/reports/gap-analysis/session/:id", async (req, res) => {
    try {
      const session = await storage.getGapSession(Number(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found" });
      const raw = (session as any).answerUsageJson;
      const answerUsage: Record<string, string> | null =
        raw && typeof raw === "object" ? raw :
        raw && typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() :
        null;
      res.json({ sessionId: session.id, answerUsage });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch session: " + err.message });
    }
  });

  app.post("/api/reports/export", async (req, res) => {
    const { reportType, clientId, sections, attendees, date } = req.body;
    if (!reportType || !sections) {
      return res.status(400).json({ message: "reportType and sections are required" });
    }
    const client = clientId ? await storage.getClient(Number(clientId)) : null;
    const clientName = client?.name ?? "Client";
    const reportDate = date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const MONTHLY_LABEL = "Monthly SEO Report";
    const QBR_LABEL = "Quarterly Business Review";
    const BIWEEKLY_LABEL = "Bi-Weekly SEO Meeting";

    try {
      if (reportType === "biweekly") {
        const buffer = await generateBiweeklyDocx(clientName, attendees || "", reportDate, sections as SectionData[]);
        const filename = `${clientName.toLowerCase().replace(/\s+/g, "_")}_biweekly_${Date.now()}.docx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
      } else {
        const label = reportType === "monthly" ? MONTHLY_LABEL : QBR_LABEL;
        const buffer = await generatePptx(clientName, label, reportDate, sections as SectionData[]);
        const filename = `${clientName.toLowerCase().replace(/\s+/g, "_")}_${reportType}_${Date.now()}.pptx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
      }
    } catch (err: any) {
      console.error("Report generation error:", err);
      res.status(500).json({ message: "Failed to generate report: " + err.message });
    }
  });

  app.post("/api/reports/upload-to-drive", async (req, res) => {
    const { reportType, clientId, sections, attendees, date } = req.body;
    if (!reportType || !sections) {
      return res.status(400).json({ message: "reportType and sections are required" });
    }

    const client = clientId ? await storage.getClient(Number(clientId)) : null;
    const clientName = client?.name ?? "Client";
    const reportDate = date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const MONTHLY_LABEL = "Monthly SEO Report";
    const QBR_LABEL = "Quarterly Business Review";

    try {
      let fileBuffer: Buffer;
      let mimeType: string;
      let filename: string;
      let driveConvertMime: string;

      if (reportType === "biweekly") {
        fileBuffer = await generateBiweeklyDocx(clientName, attendees || "", reportDate, sections as SectionData[]);
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${clientName} — Bi-Weekly SEO Meeting ${reportDate}`;
        driveConvertMime = "application/vnd.google-apps.document";
      } else {
        const label = reportType === "monthly" ? MONTHLY_LABEL : QBR_LABEL;
        fileBuffer = await generatePptx(clientName, label, reportDate, sections as SectionData[]);
        mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        filename = `${clientName} — ${label} ${reportDate}`;
        driveConvertMime = "application/vnd.google-apps.presentation";
      }

      // Use Replit Google Drive connector — handles OAuth token injection & refresh automatically
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();

      const boundary = "-------webserv_drive_boundary";
      const CRLF = "\r\n";
      const metadata = JSON.stringify({ name: filename, mimeType: driveConvertMime });

      const metaBuf = Buffer.from(
        `--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`,
        "utf8"
      );
      const filePrefixBuf = Buffer.from(
        `--${boundary}${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`,
        "utf8"
      );
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, fileBuffer, closeBuf]);

      const uploadRes = await connectors.proxy(
        "google-drive",
        "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: bodyBuffer,
        }
      );

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as any;
        const msg = errBody?.error?.message || uploadRes.statusText;
        return res.status(uploadRes.status).json({ message: `Google Drive upload failed: ${msg}` });
      }

      const driveFile = await uploadRes.json() as { id: string; name: string; webViewLink: string };
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      console.error("Drive upload error:", err);
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  async function runCommand(
    command: string,
    client: any,
    defaultDateRange: string
  ): Promise<{ result: any; liveSource: string | null; description: string; dateRangeLabel: string } | null> {
    const dateRange = COMMAND_DATE_OVERRIDES[command] ?? defaultDateRange;

    if (command === "airtable_work_log") {
      const { startDate, endDate } = dateRangeToActualDates(dateRange);
      const airtableResult = await fetchAirtableWorkLog(client.id, startDate, endDate);
      if (!airtableResult.success) return null;
      const { data } = airtableResult;
      const CREDIT_TYPE_LABELS: Record<string, string> = {
        Scale: "New Content (Scale)",
        Optimization: "Content Optimization",
        "CRO Update": "CRO/UX Update",
      };
      const tables = Object.entries(data.byCreditType).map(([creditType, items]) => ({
        title: CREDIT_TYPE_LABELS[creditType] ?? creditType,
        headers: ["Task", "Status", "Due Date", "URL / Page"],
        rows: (items as any[]).map(item => [item.task, item.status ?? "—", item.date, item.url ?? "—"]),
      }));
      const result = {
        command: "airtable_work_log",
        clientName: data.clientName,
        dateRange: data.dateRange,
        summary: [
          { label: "Total Items", current: data.totalItems.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Work Types", current: Object.keys(data.byCreditType).length.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables,
      };
      return { result, liveSource: "airtable", description: getCommandDescription("airtable_work_log"), dateRangeLabel: data.dateRange };
    }

    let result: any = null;
    let liveSource: string | null = null;
    try {
      if (handlesGscCommand(command as any)) { result = await queryGsc(command as any, client, dateRange); if (result) liveSource = "gsc"; }
      if (!result && handlesGa4Command(command as any)) { result = await queryGa4(command as any, client, dateRange); if (result) liveSource = "ga4"; }
      if (!result && handlesSfCommand(command as any)) { result = await querySfReport(command as any, client, dateRange); if (result) liveSource = "screaming_frog"; }
      if (!result && handlesCallRailCommand(command as any)) { result = await queryCallRail(command as any, client, dateRange); if (result) liveSource = "callrail"; }
      if (!result && handlesCtmCommand(command as any)) { result = await queryCtm(command as any, client, dateRange); if (result) liveSource = "ctm"; }
      if (!result && handlesSemrushCommand(command as any)) { result = await querySemrush(command as any, client, dateRange); if (result) liveSource = "semrush"; }
      if (!result && handlesAhrefsCommand(command)) { result = await queryAhrefs(command, client, dateRange); if (result) liveSource = "ahrefs"; }
      if (!result && command === "gbp_local_summary") { result = await queryGbp(command as any, client, dateRange); if (result) liveSource = "gbp"; }
    } catch { /* live fetch failed — result stays null */ }
    return { result, liveSource, description: getCommandDescription(command as any), dateRangeLabel: getDateRangeLabel(dateRange), dataUnavailable: !result };
  }

  // V1 QBR Prep generate route removed — use /generate-v2 instead


  const SF_FRESHNESS_DAYS = 90;

  app.post("/api/reports/qbr-prep/generate-v2", async (req, res) => {
    const { clientId, generationDate, currentCrawlAssetId, gapAnswers, gapSessionId } = req.body;
    const sentimentVal = req.body.sentiment ?? req.body.clientSentiment;
    const amThoughtsVal = req.body.amThoughts ?? req.body.hypothesis ?? "";
    const prevQtrAssessmentVal = req.body.prevQtrAssessment ?? "";
    const priorityChecksVal = req.body.priorityChecks ?? req.body.auditNotes ?? "";
    const clientNotesVal = req.body.clientNotes ?? "";
    const creditUsageVal = req.body.creditUsage ?? "";
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

    const amValidation = validateAmInputs({ clientSentiment: sentimentVal, amThoughts: amThoughtsVal, priorityChecks: priorityChecksVal, clientNotes: clientNotesVal });
    if ("error" in amValidation) return res.status(400).json({ message: amValidation.error });

    let latestSf: any;
    if (currentCrawlAssetId) {
      const asset = await getCrawlAsset(Number(currentCrawlAssetId));
      if (!asset) return res.status(400).json({ message: "Specified crawl asset not found." });
      latestSf = { id: asset.id, createdAt: asset.createdAt, reportDate: asset.reportDate };
    } else {
      const sfReports = await storage.getSfReports(Number(clientId));
      if (!sfReports || sfReports.length === 0) {
        return res.status(400).json({ message: "A Screaming Frog crawl is required before generating a QBR Prep report. Please upload one first." });
      }
      latestSf = sfReports[0];
    }

    const sfUploadedAt = latestSf.createdAt instanceof Date ? latestSf.createdAt : new Date(latestSf.createdAt);
    const asOf = generationDate ? new Date(generationDate + "T12:00:00") : new Date();
    const daysSinceUpload = Math.floor((asOf.getTime() - sfUploadedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceUpload > SF_FRESHNESS_DAYS) {
      return res.status(400).json({
        message: `Screaming Frog crawl is stale (${daysSinceUpload} days old, limit is ${SF_FRESHNESS_DAYS}). Please upload a fresh crawl before generating.`,
        staleDays: daysSinceUpload,
        freshnessLimitDays: SF_FRESHNESS_DAYS,
        uploadedAt: sfUploadedAt.toISOString(),
      });
    }

    try {
      // Resolve monthly content credits from the shared canonical source (clientCreditMap.ts).
      const clientForCredits = await import("./storage").then(m => m.storage.getClient(Number(clientId)));
      const resolvedMonthlyCredits = resolveClientMonthlyCredits(clientForCredits?.name ?? "");

      const reportData = await generateQbrPrepReport({
        clientId: Number(clientId),
        generationDate: generationDate ?? new Date().toISOString().split("T")[0],
        sentiment: sentimentVal,
        hypothesis: amThoughtsVal,
        prevQtrAssessment: prevQtrAssessmentVal || undefined,
        auditNotes: priorityChecksVal,
        clientNotes: clientNotesVal,
        creditUsage: creditUsageVal || undefined,
        forwardLooking: true,
        gapAnswers,
        monthlyCredits: resolvedMonthlyCredits,
      });
      if (gapAnswers?.length && gapSessionId) {
        storage.updateGapSession(Number(gapSessionId), { answerUsage: getAnswerUsageMap(gapAnswers) }).catch(() => {});
      }

      res.json({ reportData });
    } catch (err: any) {
      console.error("QBR Prep V2 generation error:", err);
      res.status(500).json({ message: "Failed to generate QBR Prep: " + err.message });
    }
  });

  app.post("/api/reports/qbr-prep/docx-v2", async (req, res) => {
    const t0 = Date.now();
    const { reportData, edits, hiddenSections = {}, hiddenTables = {} } = req.body;
    const validErr = validateExportPayload("QBR Prep DOCX", reportData, ["meta", "section1Goals"]);
    if (validErr) { logExport("QBR Prep DOCX", t0, false, validErr); return res.status(400).json({ message: validErr }); }
    const readiness = validateQbrPrepExportReadiness(reportData, edits ?? {});
    if (!readiness.canExport) {
      logExport("QBR Prep DOCX", t0, false, readiness.reasons.join("; "));
      return res.status(422).json({ ok: false, code: readiness.code, reasons: readiness.reasons });
    }
    try {
      const buffer = await generateQbrPrepV2Docx(injectQbrPrepCustomRows(reportData, edits), edits, hiddenSections, hiddenTables);
      const slug = (reportData.meta?.site ?? "report").toLowerCase().replace(/\s+/g, "_");
      const filename = `${slug}_qbr_prep_${reportData.meta?.planningQuarter?.replace(/\s+/g, "_") ?? "report"}.docx`;
      logExport("QBR Prep DOCX", t0, true);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      logExport("QBR Prep DOCX", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate DOCX: " + err.message });
    }
  });

  app.post("/api/reports/qbr-prep/upload-to-drive-v2", async (req, res) => {
    const { reportData, edits, reportTitle, hiddenSections = {}, hiddenTables = {} } = req.body;
    if (!reportData) return res.status(400).json({ message: "reportData is required" });
    const readiness = validateQbrPrepExportReadiness(reportData, edits ?? {});
    if (!readiness.canExport) {
      return res.status(422).json({ ok: false, code: readiness.code, reasons: readiness.reasons });
    }
    try {
      const docxBuffer = await generateQbrPrepV2Docx(injectQbrPrepCustomRows(reportData, edits), edits, hiddenSections, hiddenTables);
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();

      const filename = (reportTitle ?? "QBR Prep Report") + ".docx";
      const metadata = JSON.stringify({ name: filename });
      const boundary = "-------smarteo_qbrv2_boundary";
      const CRLF = "\r\n";

      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document${CRLF}${CRLF}`, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, docxBuffer, closeBuf]);

      const uploadRes = await connectors.proxy(
        "google-drive",
        "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: bodyBuffer,
        }
      );

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as any;
        const msg = errBody?.error?.message || uploadRes.statusText;
        return res.status(uploadRes.status).json({ message: `Google Drive upload failed: ${msg}` });
      }

      const driveFile = await uploadRes.json() as { id: string; name: string; webViewLink: string };
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      console.error("QBR Prep V2 Drive upload error:", err);
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  app.post("/api/reports/qbr-prep/preview-pdf", async (req, res) => {
    const t0 = Date.now();
    const { reportData, edits } = req.body;
    const validErr = validateExportPayload("QBR Prep PDF", reportData, ["meta"]);
    if (validErr) { logExport("QBR Prep PDF", t0, false, validErr); return res.status(400).json({ message: validErr }); }
    const readiness = validateQbrPrepExportReadiness(reportData, edits ?? {});
    if (!readiness.canExport) {
      logExport("QBR Prep PDF", t0, false, readiness.reasons.join("; "));
      return res.status(422).json({ ok: false, code: readiness.code, reasons: readiness.reasons });
    }
    const id = "qbr-prep-" + Date.now();
    printCache.set(id, { data: { reportData, edits }, ts: Date.now() });
    try {
      const buffer = await generatePdfViaPuppeteer(id, "qbr-prep-print");
      printCache.delete(id);
      const slug = (reportData.meta?.site ?? "report").toLowerCase().replace(/\s+/g, "_");
      logExport("QBR Prep PDF", t0, true);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_qbr_prep.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      printCache.delete(id);
      logExport("QBR Prep PDF", t0, false, err.message);
      res.status(500).json({ message: "PDF generation failed: " + err.message });
    }
  });

  app.post("/api/reports/biweekly/generate", async (req, res) => {
    const { clientId, startDate, endDate, preparedBy, gapAnswers, gapSessionId } = req.body;
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

    const amValidation = validateAmInputs(req.body);
    if ("error" in amValidation) return res.status(400).json({ message: amValidation.error });

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const sub = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() - n); return r; };
    const now = new Date();
    const resolvedEnd = endDate ?? fmt(sub(now, 1));
    const resolvedStart = startDate ?? fmt(sub(now, 14));
    try {
      const output = await generateBiweekly({
        clientId: Number(clientId),
        startDate: resolvedStart,
        endDate: resolvedEnd,
        preparedBy: preparedBy ?? "JAY HALL",
        amInputs: ("error" in amValidation) ? {} : amValidation.amInputs,
        gapContext: gapAnswers ? buildGapContext(gapAnswers) : undefined,
      });
      if (gapAnswers?.length && gapSessionId) {
        storage.updateGapSession(Number(gapSessionId), { answerUsage: getAnswerUsageMap(gapAnswers) }).catch(() => {});
      }
      res.json(output);
    } catch (err: any) {
      console.error("Biweekly generation error:", err);
      res.status(500).json({ message: "Failed to generate Biweekly report: " + err.message });
    }
  });

  app.post("/api/reports/biweekly/docx", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.sections ?? []).map((s: any) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        if (s.bullets?.length) items.push({ manualText: (s.bullets as string[]).map((b, bi) => edits?.[`${s.id}_bullet_${bi}`] ?? b).filter(Boolean).join("\n") });
        if (s.workLog?.length) {
          const baseRows = (s.workLog as any[]).map((r: any, ri: number) => { const editedDid = edits?.[`${s.id}_worklog_${ri}_did`]; const editedNext = edits?.[`${s.id}_worklog_${ri}_next`]; return { area: r.area, whatWeDid: editedDid ?? r.whatWeDid, whatsNext: editedNext ?? r.whatsNext, items: editedDid !== undefined ? undefined : r.items, nextItems: editedNext !== undefined ? undefined : r.nextItems }; });
          const crProgress = parseCustomRowsFromEdits(edits, `${s.id}_progress`);
          const allRows = [...baseRows, ...crProgress.map(cr => ({ area: cr[0] ?? "", whatWeDid: cr[1] ?? "", whatsNext: cr[2] ?? "" }))];
          items.push({ tableRows: allRows });
        }
        if (s.table) items.push({ tables: [{ title: s.title, headers: s.table.headers, rows: s.table.rows }] });
        if (s.technicalTable) {
          const tbl = s.technicalTable as { headers: string[]; rows: string[][] };
          const resolvedRows = (tbl.rows ?? []).map((row: string[], ri: number) =>
            row.map((cell: string, ci: number) => edits?.[`${s.id}_tech_${ri}_${ci}`] ?? cell)
          );
          const crTech = parseCustomRowsFromEdits(edits, `${s.id}_technical`);
          items.push({ tables: [{ title: s.title ?? "", headers: tbl.headers, rows: [...resolvedRows, ...crTech] }] });
        }
        return { sectionId: s.id, title: s.title ?? "", items };
      });
      const clientName = edits?.["client_name"] ?? json.client_name;
      const preparedBy = edits?.["preparedBy"] ?? json.preparedBy ?? edits?.["attendees"] ?? json.attendees ?? "";
      const date = edits?.["report_date"] ?? json.date;
      const buffer = await generateBiweeklyDocx(clientName, preparedBy, date, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      const filename = `${slug}_biweekly_${date.replace(/[\s,]/g, "_")}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Biweekly DOCX error:", err);
      res.status(500).json({ message: "Failed to generate DOCX: " + err.message });
    }
  });

  app.post("/api/reports/biweekly/upload-to-drive", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.sections ?? []).map((s: any) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        if (s.bullets?.length) items.push({ manualText: (s.bullets as string[]).map((b, bi) => edits?.[`${s.id}_bullet_${bi}`] ?? b).filter(Boolean).join("\n") });
        if (s.workLog?.length) {
          const baseRows = (s.workLog as any[]).map((r: any, ri: number) => { const editedDid = edits?.[`${s.id}_worklog_${ri}_did`]; const editedNext = edits?.[`${s.id}_worklog_${ri}_next`]; return { area: r.area, whatWeDid: editedDid ?? r.whatWeDid, whatsNext: editedNext ?? r.whatsNext, items: editedDid !== undefined ? undefined : r.items, nextItems: editedNext !== undefined ? undefined : (r.nextItemsRich ?? r.nextItems) }; });
          const crProgress = parseCustomRowsFromEdits(edits, `${s.id}_progress`);
          items.push({ tableRows: [...baseRows, ...crProgress.map(cr => ({ area: cr[0] ?? "", whatWeDid: cr[1] ?? "", whatsNext: cr[2] ?? "" }))] });
        }
        if (s.table) items.push({ tables: [{ title: s.title, headers: s.table.headers, rows: s.table.rows }] });
        return { sectionId: s.id, title: s.title ?? "", items };
      });
      const clientName = edits?.["client_name"] ?? json.client_name;
      const date = edits?.["report_date"] ?? json.date;
      const preparedBy = edits?.["preparedBy"] ?? json.preparedBy ?? "";
      const buffer = await generateBiweeklyPdf(clientName, preparedBy, date, sections);
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();
      const filename = `${clientName} Biweekly SEO ${date}.pdf`;
      const metadata = JSON.stringify({ name: filename });
      const boundary = "-------smarteo_bw_boundary";
      const CRLF = "\r\n";
      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/pdf${CRLF}${CRLF}`, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, buffer, closeBuf]);
      const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: bodyBuffer });
      if (!uploadRes.ok) { const e = await uploadRes.json().catch(() => ({}) as any); return res.status(uploadRes.status).json({ message: `Drive upload failed: ${(e as any)?.error?.message ?? uploadRes.statusText}` }); }
      const driveFile = await uploadRes.json() as any;
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  app.post("/api/reports/biweekly/preview-pdf", async (req, res) => {
    const t0 = Date.now();
    const { report, edits } = req.body as { report: any; edits?: Record<string, string> };
    if (!report) return res.status(400).json({ message: "report is required" });
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    printCache.set(id, { data: { report, edits: edits ?? {} }, ts: Date.now() });
    try {
      const buffer = await generatePdfViaPuppeteer(id);
      printCache.delete(id);
      const clientName = edits?.["client_name"] ?? report.client_name ?? "report";
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      const dateSlug = (edits?.["report_date"] ?? report.date ?? "").replace(/[\s,]/g, "_");
      logExport("Biweekly PDF", t0, true);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_biweekly_${dateSlug}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      printCache.delete(id);
      logExport("Biweekly PDF", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate PDF: " + err.message });
    }
  });

  app.post("/api/reports/biweekly/pdf", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.sections ?? []).map((s: any) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        if (s.bullets?.length) items.push({ manualText: (s.bullets as string[]).map((b, bi) => edits?.[`${s.id}_bullet_${bi}`] ?? b).filter(Boolean).join("\n") });
        if (s.workLog?.length) {
          const baseRows = (s.workLog as any[]).map((r: any, ri: number) => { const editedDid = edits?.[`${s.id}_worklog_${ri}_did`]; const editedNext = edits?.[`${s.id}_worklog_${ri}_next`]; return { area: r.area, whatWeDid: editedDid ?? r.whatWeDid, whatsNext: editedNext ?? r.whatsNext, items: editedDid !== undefined ? undefined : r.items, nextItems: editedNext !== undefined ? undefined : (r.nextItemsRich ?? r.nextItems) }; });
          const crProgress = parseCustomRowsFromEdits(edits, `${s.id}_progress`);
          items.push({ tableRows: [...baseRows, ...crProgress.map(cr => ({ area: cr[0] ?? "", whatWeDid: cr[1] ?? "", whatsNext: cr[2] ?? "" }))] });
        }
        if (s.table) items.push({ tables: [{ title: s.title, headers: s.table.headers, rows: s.table.rows }] });
        return { sectionId: s.id, title: s.title ?? "", items };
      });
      const clientName = edits?.["client_name"] ?? json.client_name;
      const date = edits?.["report_date"] ?? json.date;
      const preparedBy = edits?.["preparedBy"] ?? json.preparedBy ?? "";
      const buffer = await generateBiweeklyPdf(clientName, preparedBy, date, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_biweekly_${date.replace(/[\s,]/g, "_")}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Biweekly PDF error:", err);
      res.status(500).json({ message: "Failed to generate PDF: " + err.message });
    }
  });

  app.post("/api/reports/monthly/generate", async (req, res) => {
    const { clientId, month, year, timezone, amInputs, currentCrawlAssetId, comparisonCrawlAssetId, gapAnswers, gapSessionId } = req.body;
    if (!clientId || !month || !year) return res.status(400).json({ message: "clientId, month, year are required" });

    const amValidation = validateAmInputs(req.body);
    if ("error" in amValidation) return res.status(400).json({ message: amValidation.error });

    try {
      const output = await generateMonthly({
        clientId: Number(clientId),
        month: Number(month),
        year: Number(year),
        timezone: timezone ?? "America/Los_Angeles",
        amInputs: ("error" in amValidation) ? {} : amValidation.amInputs,
        currentCrawlAssetId: currentCrawlAssetId ?? null,
        comparisonCrawlAssetId: comparisonCrawlAssetId ?? null,
        gapContext: gapAnswers ? buildGapContext(gapAnswers) : undefined,
      });
      if (gapAnswers?.length && gapSessionId) {
        storage.updateGapSession(Number(gapSessionId), { answerUsage: getAnswerUsageMap(gapAnswers) }).catch(() => {});
      }
      res.json(output);
    } catch (err: any) {
      console.error("Monthly generation error:", err);
      res.status(500).json({ message: "Failed to generate Monthly report: " + err.message });
    }
  });

  app.post("/api/reports/monthly/pptx", async (req, res) => {
    const t0 = Date.now();
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json || !json.slides?.length) { logExport("Monthly PPTX", t0, false, "No slides"); return res.status(400).json({ message: "No slide data found. Generate the report first." }); }
    try {
      const sections: SectionData[] = (json.slides ?? []).filter((s: any) => s.type !== "title").map((s: any, idx: number) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        const commentary = edits?.[`${s.id}_commentary`] ?? s.commentary;
        if (commentary) items.push({ manualText: commentary });
        if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
        if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
        return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
      });
      const clientName = edits?.["title_client"] ?? json.client_name ?? "Client";
      const reportTitle = edits?.["title_title"] ?? json.report_title ?? "Monthly Report";
      const generatedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(clientName, reportTitle, generatedAt, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      const monthSlug = (json.month_label ?? "report").replace(/\s/g, "_");
      logExport("Monthly PPTX", t0, true);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_monthly_${monthSlug}.pptx"`);
      res.send(buffer);
    } catch (err: any) {
      logExport("Monthly PPTX", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate PPTX: " + err.message });
    }
  });

  app.post("/api/reports/monthly/upload-to-drive", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.slides ?? []).filter((s: any) => s.type !== "title").map((s: any, idx: number) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        const driveCommentary = edits?.[`${s.id}_commentary`] ?? s.commentary;
        if (driveCommentary) items.push({ manualText: driveCommentary });
        if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
        if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
        return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
      });
      const driveClientName = edits?.["title_client"] ?? json.client_name ?? "Client";
      const driveReportTitle = edits?.["title_title"] ?? json.report_title ?? "Monthly Report";
      const driveGeneratedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(driveClientName, driveReportTitle, driveGeneratedAt, sections);
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();
      const filename = `${driveClientName} Monthly SEO ${json.month_label ?? "Report"}.pptx`;
      const metadata = JSON.stringify({ name: filename });
      const boundary = "-------smarteo_mo_boundary";
      const CRLF = "\r\n";
      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation${CRLF}${CRLF}`, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, buffer, closeBuf]);
      const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: bodyBuffer });
      if (!uploadRes.ok) { const e = await uploadRes.json().catch(() => ({}) as any); return res.status(uploadRes.status).json({ message: `Drive upload failed: ${(e as any)?.error?.message ?? uploadRes.statusText}` }); }
      const driveFile = await uploadRes.json() as any;
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  app.post("/api/reports/monthly/pdf", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.slides ?? []).filter((s: any) => s.type !== "title" && s.type !== "chart-bar" && s.type !== "chart-line").map((s: any, idx: number) => {
        const items: any[] = [];
        if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
        if (s.table) { const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: s.subtitle ?? "", headers: s.table.headers, rows: [...s.table.rows, ...crRows] }] }); }
        if (s.bullets) items.push({ manualText: (s.bullets as string[]).join("\n") });
        return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
      });
      const clientName = edits?.["title_client"] ?? json.client_name;
      const monthLabel = json.month_label ?? "";
      const buffer = await generateMonthlyPdf(clientName, monthLabel, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_monthly_${monthLabel.replace(/\s/g, "_")}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Monthly PDF error:", err);
      res.status(500).json({ message: "Failed to generate PDF: " + err.message });
    }
  });

  app.post("/api/reports/qbr-full/generate", async (req, res) => {
    const { clientId, quarter, year, timezone, amInputs, currentCrawlAssetId, comparisonCrawlAssetId, gapAnswers, gapSessionId } = req.body;
    if (!clientId || !quarter || !year) return res.status(400).json({ message: "clientId, quarter, year are required" });

    const amValidation = validateAmInputs(req.body);
    if ("error" in amValidation) return res.status(400).json({ message: amValidation.error });

    try {
      const output = await generateQbrFull({
        clientId: Number(clientId),
        quarter: Number(quarter),
        year: Number(year),
        timezone: timezone ?? "America/Los_Angeles",
        amInputs: ("error" in amValidation) ? {} : amValidation.amInputs,
        currentCrawlAssetId: currentCrawlAssetId ?? null,
        comparisonCrawlAssetId: comparisonCrawlAssetId ?? null,
        gapContext: gapAnswers ? buildGapContext(gapAnswers) : undefined,
      });
      if (gapAnswers?.length && gapSessionId) {
        storage.updateGapSession(Number(gapSessionId), { answerUsage: getAnswerUsageMap(gapAnswers) }).catch(() => {});
      }
      res.json(output);
    } catch (err: any) {
      console.error("QBR Full generation error:", err);
      res.status(500).json({ message: "Failed to generate QBR report: " + err.message });
    }
  });

  app.post("/api/reports/qbr-full/pptx", async (req, res) => {
    const t0 = Date.now();
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json || !json.slides?.length) { logExport("QBR Full PPTX", t0, false, "No slides"); return res.status(400).json({ message: "No slide data found. Generate the report first." }); }
    try {
      const sections: SectionData[] = (json.slides ?? [])
        .filter((s: any) => s.type !== "title" && s.type !== "divider")
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const commentary = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (commentary) items.push({ manualText: commentary });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.table) items.push({ tables: [{ title: "", headers: s.leftContent.table.headers, rows: s.leftContent.table.rows }] });
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const clientName = edits?.["s01_title_client"] ?? json.client_name ?? "Client";
      const reportTitle = edits?.["s01_title_title"] ?? json.report_title ?? "QBR Report";
      const generatedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(clientName, reportTitle, generatedAt, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      const qtrSlug = (json.quarter_label ?? "qbr").replace(/\s/g, "_");
      logExport("QBR Full PPTX", t0, true);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_QBR_${qtrSlug}.pptx"`);
      res.send(buffer);
    } catch (err: any) {
      logExport("QBR Full PPTX", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate PPTX: " + err.message });
    }
  });

  app.post("/api/reports/qbr-full/upload-to-drive", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.slides ?? [])
        .filter((s: any) => s.type !== "title" && s.type !== "divider")
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const driveCommentary = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (driveCommentary) items.push({ manualText: driveCommentary });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.table) items.push({ tables: [{ title: "", headers: s.leftContent.table.headers, rows: s.leftContent.table.rows }] });
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const driveClientName = edits?.["s01_title_client"] ?? json.client_name ?? "Client";
      const driveReportTitle = edits?.["s01_title_title"] ?? json.report_title ?? "QBR Report";
      const driveGeneratedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(driveClientName, driveReportTitle, driveGeneratedAt, sections);
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();
      const filename = `${driveClientName} QBR ${json.quarter_label ?? "Report"}.pptx`;
      const metadata = JSON.stringify({ name: filename });
      const boundary = "-------smarteo_qbrf_boundary";
      const CRLF = "\r\n";
      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation${CRLF}${CRLF}`, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, buffer, closeBuf]);
      const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: bodyBuffer });
      if (!uploadRes.ok) { const e = await uploadRes.json().catch(() => ({}) as any); return res.status(uploadRes.status).json({ message: `Drive upload failed: ${(e as any)?.error?.message ?? uploadRes.statusText}` }); }
      const driveFile = await uploadRes.json() as any;
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  // ─── Mid-Strategy SEO Report ─────────────────────────────────────────────
  app.post("/api/reports/mid-strategy/generate", async (req, res) => {
    const { clientId, currentCrawlAssetId, comparisonCrawlAssetId, amInputs, gapAnswers, gapSessionId } = req.body;
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

    const amValidation = validateAmInputs(req.body);
    if ("error" in amValidation) return res.status(400).json({ message: amValidation.error });

    try {
      const client = await storage.getClient(Number(clientId));
      if (!client) return res.status(404).json({ message: "Client not found" });
      const { generateMidStrategy } = await import("./midStrategyGenerator");
      const output = await generateMidStrategy({
        clientId: Number(clientId),
        currentCrawlAssetId: currentCrawlAssetId ?? null,
        comparisonCrawlAssetId: comparisonCrawlAssetId ?? null,
        amInputs: ("error" in amValidation) ? {} : amValidation.amInputs,
        gapContext: gapAnswers ? buildGapContext(gapAnswers) : undefined,
      });
      if (gapAnswers?.length && gapSessionId) {
        storage.updateGapSession(Number(gapSessionId), { answerUsage: getAnswerUsageMap(gapAnswers) }).catch(() => {});
      }
      if (!output || !Array.isArray(output.slides) || output.slides.length < 1) {
        return res.status(500).json({ message: "Mid-Strategy generator produced no slides. Ensure at least one data source or manual input is provided." });
      }
      res.json(output);
    } catch (err: any) {
      console.error("Mid-Strategy generation error:", err);
      res.status(500).json({ message: "Failed to generate Mid-Strategy report: " + err.message });
    }
  });

  app.post("/api/reports/mid-strategy/pptx", async (req, res) => {
    const t0 = Date.now();
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json || !json.slides?.length) { logExport("Mid-Strategy PPTX", t0, false, "No slides"); return res.status(400).json({ message: "No slide data found. Generate the report first." }); }
    try {
      const sections: SectionData[] = (json.slides ?? [])
        .filter((s: any) => s.type !== "title")
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const comm = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (comm) items.push({ manualText: comm });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.bullets) items.push({ manualText: (s.leftContent.bullets as string[]).join("\n") });
          if (s.rightContent?.metrics) items.push({ summary: s.rightContent.metrics.map((m: any) => ({ label: m.label, current: m.current, isPositive: m.isPositive ?? true })) });
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const clientName = json.client_name ?? "Client";
      const reportTitle = json.report_title ?? "Mid-Strategy SEO Report";
      const generatedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(clientName, reportTitle, generatedAt, sections);
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      logExport("Mid-Strategy PPTX", t0, true);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_Mid_Strategy.pptx"`);
      res.send(buffer);
    } catch (err: any) {
      logExport("Mid-Strategy PPTX", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate PPTX: " + err.message });
    }
  });

  app.post("/api/reports/mid-strategy/upload-to-drive", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.slides ?? [])
        .filter((s: any) => s.type !== "title")
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const comm2 = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (comm2) items.push({ manualText: comm2 });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.bullets) items.push({ manualText: (s.leftContent.bullets as string[]).join("\n") });
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const msClientName = json.client_name ?? "Client";
      const msReportTitle = json.report_title ?? "Mid-Strategy SEO Report";
      const msGeneratedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generatePptx(msClientName, msReportTitle, msGeneratedAt, sections);
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();
      const filename = `${msClientName} Mid-Strategy SEO Report.pptx`;
      const metadata = JSON.stringify({ name: filename });
      const boundary = "-------smarteo_mss_boundary";
      const CRLF = "\r\n";
      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation${CRLF}${CRLF}`, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, buffer, closeBuf]);
      const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: bodyBuffer });
      if (!uploadRes.ok) { const e = await uploadRes.json().catch(() => ({}) as any); return res.status(uploadRes.status).json({ message: `Drive upload failed: ${(e as any)?.error?.message ?? uploadRes.statusText}` }); }
      const driveFile = await uploadRes.json() as any;
      res.json({ success: true, fileId: driveFile.id, fileName: driveFile.name, webViewLink: driveFile.webViewLink });
    } catch (err: any) {
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  });

  app.get("/api/reports/auto-build", async (req, res) => {
    const clientId = Number(req.query.clientId);
    const reportType = String(req.query.reportType ?? "monthly");
    const defaultDateRange = String(req.query.dateRange ?? "last_30_vs_prev_30");

    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: string, data: any) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    req.on("close", () => { if (!res.writableEnded) res.end(); });

    const sectionCommandsForType = SECTION_COMMANDS_AUTO[reportType] ?? {};
    const sectionIds = Object.keys(sectionCommandsForType);

    send("init", { clientName: client.name, reportType, sectionIds });

    await Promise.all(sectionIds.map(async (sectionId) => {
      const commands = sectionCommandsForType[sectionId];
      send("section_loading", { sectionId });

      const committedItems: any[] = [];
      await Promise.all(commands.map(async (command) => {
        try {
          const outcome = await runCommand(command, client, defaultDateRange);
          if (!outcome) return;
          committedItems.push({
            sectionId,
            response: {
              success: true,
              result: outcome.result,
              commandDescription: outcome.description,
              dateRangeLabel: outcome.dateRangeLabel,
              liveSource: outcome.liveSource,
            },
            committedAt: new Date().toISOString(),
          });
        } catch { /* silent */ }
      }));

      send("section_done", { sectionId, items: committedItems });
    }));

    send("complete", { success: true });
    res.end();
  });

  // Dashboard: NSM tracker data for a client (current + next quarter)
  app.get("/api/dashboard/client/:id/nsm", async (req, res) => {
    try {
      const clientId = Number(req.params.id);
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const { fetchNsmGoals } = await import("./sheetsClient");
      const [current, next] = await Promise.all([
        fetchNsmGoals(client.name, false).catch(() => null),
        fetchNsmGoals(client.name, true).catch(() => null),
      ]);

      // Website priority: 1) client.gscSiteUrl, 2) NSM sheet fallback, 3) "—"
      // client.gscSiteUrl is the canonical website URL stored on every client record.
      const websiteFromClient = (client.gscSiteUrl ?? "").trim() || null;
      const websiteFromSheet = (current?.website ?? "").trim().replace(/^—$/, "") || null;
      const websiteResolved = websiteFromClient ?? websiteFromSheet ?? null;
      const website = websiteResolved ?? "—";
      const websiteSource: "client_record" | "nsm_sheet" | "none" =
        websiteFromClient ? "client_record" : websiteFromSheet ? "nsm_sheet" : "none";

      // Credits: sourced from the shared CLIENT_MONTHLY_CREDIT_MAP (clientCreditMap.ts)
      // which is the single canonical source per data-handling-rules skill.
      const rawCredits = Object.entries(CLIENT_MONTHLY_CREDIT_MAP).find(([key]) =>
        client.name.toLowerCase().includes(key)
      )?.[1] ?? null;
      const credits = rawCredits !== null ? String(rawCredits) : "—";
      const creditsSource: "nsm_sheet" | "none" = rawCredits !== null ? "nsm_sheet" : "none";

      // NSM Type: NSM sheet only (no client-record equivalent)
      const nsmTypeFromSheet = (current?.mvpType ?? "").trim().replace(/^—$/, "") || null;
      const nsmType = nsmTypeFromSheet ?? "—";

      return res.json({
        website,
        credits,
        nsmType,
        websiteSource,
        creditsSource,
        current: current ?? null,
        next: next ?? null,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message ?? "Failed to fetch NSM data" });
    }
  });

  // Dashboard: fetch key metrics for a single client
  app.post("/api/dashboard/client/:id", async (req, res) => {
    const clientId = Number(req.params.id);
    const dateRange = (req.body?.dateRange as string) || "last_28_vs_prev_28";

    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    interface DashboardMetric {
      label: string;
      value: string | number;
      previous: string | number;
      delta: string;
      deltaPercent: string;
      isPositive: boolean;
      unit?: string;
      group: string;
    }

    async function runCommand(command: string): Promise<any> {
      let result: any = null;
      try {
        if (handlesGscCommand(command)) {
          result = await queryGsc(command, client, dateRange);
        }
        if (!result && handlesGa4Command(command)) {
          result = await queryGa4(command, client, dateRange);
        }
        if (!result && handlesCallRailCommand(command)) {
          result = await queryCallRail(command, client, dateRange);
        }
        if (!result && handlesCtmCommand(command)) {
          result = await queryCtm(command, client, dateRange);
        }
        if (!result && handlesSemrushCommand(command)) {
          result = await querySemrush(command, client, dateRange);
        }
      } catch (err: any) {
        console.warn(`[Dashboard] ${command} live fetch failed: ${err.message}`);
      }
      return result;
    }

    const callsCommand = client.callrailCompanyId
      ? "callrail_qoq_organic_calls"
      : client.ctmAccountId
      ? "ctm_qoq_organic_calls"
      : "callrail_qoq_organic_calls";

    const [gscResult, ga4Result, callsResult] = await Promise.all([
      runCommand("gsc_qoq_queries"),
      runCommand("ga4_qoq_organic_funnel"),
      runCommand(callsCommand),
    ]);

    const metrics: DashboardMetric[] = [];

    const mapSummary = (result: any, group: string, unitMap: Record<string, string> = {}) => {
      if (!result?.summary) return;
      for (const s of result.summary) {
        metrics.push({
          label: s.label,
          value: s.current,
          previous: s.previous,
          delta: s.delta,
          deltaPercent: s.deltaPercent,
          isPositive: s.isPositive,
          unit: unitMap[s.label],
          group,
        });
      }
    };

    mapSummary(gscResult, "GSC", { "Avg Position": "pos" });
    mapSummary(ga4Result, "GA4", { "CVR": "%" });
    mapSummary(callsResult, "Calls");

    const connectedServices: string[] = [];
    if (client.gscSiteUrl) connectedServices.push("gsc");
    if (client.ga4PropertyId) connectedServices.push("ga4");
    if (client.callrailCompanyId) connectedServices.push("callrail");
    if (client.ctmAccountId) connectedServices.push("ctm");
    const semrushCreds = await storage.getApiCredentialsByService("semrush").catch(() => []);
    if (semrushCreds.length > 0) connectedServices.push("semrush");
    if (client.ahrefsProjectUrl) connectedServices.push("ahrefs");
    if (client.gbpLocationName) connectedServices.push("gbp");
    if (client.airtableBaseId) connectedServices.push("airtable");

    res.json({
      clientId: client.id,
      clientName: client.name,
      lastUpdated: new Date().toISOString(),
      connectedServices,
      metrics,
    });
  });

  // Dashboard: fetch ALL metrics for expanded client view
  app.post("/api/dashboard/client/:id/expanded", async (req, res) => {
    const clientId = Number(req.params.id);
    const dateRange = (req.body?.dateRange as string) || "last_28_vs_prev_28";

    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    async function runCmd(command: string): Promise<any> {
      let result: any = null;
      try {
        if (handlesGscCommand(command)) result = await queryGsc(command, client, dateRange);
        if (!result && handlesGa4Command(command)) result = await queryGa4(command, client, dateRange);
        if (!result && handlesCallRailCommand(command)) result = await queryCallRail(command, client, dateRange);
        if (!result && handlesCtmCommand(command)) result = await queryCtm(command, client, dateRange);
        if (!result && handlesSemrushCommand(command)) result = await querySemrush(command, client, dateRange);
      } catch (err: any) {
        console.warn(`[Dashboard:expanded] ${command} failed: ${err.message}`);
      }
      return result;
    }

    const callsCmd = client.callrailCompanyId ? "callrail_summary"
      : client.ctmAccountId ? "ctm_qoq_organic_calls"
      : "callrail_summary";

    const semrushCreds = await storage.getApiCredentialsByService("semrush").catch(() => []);
    const hasSemrush = semrushCreds.length > 0;

    const [gscQueries, gscPages, ga4Funnel, ga4Pages, callsResult, semrushResult] = await Promise.all([
      runCmd("gsc_qoq_queries"),
      runCmd("gsc_qoq_pages"),
      runCmd("ga4_qoq_organic_funnel"),
      runCmd("ga4_qoq_organic_landing_pages"),
      client.callrailCompanyId || client.ctmAccountId ? runCmd(callsCmd) : Promise.resolve(null),
      hasSemrush ? runCmd("semrush_organic_overview") : Promise.resolve(null),
    ]);

    interface ExpandedGroup {
      source: string;
      metrics: Array<{ label: string; value: string | number; previous: string | number; delta: string; deltaPercent: string; isPositive: boolean; unit?: string }>;
      tables: Array<{ title: string; headers: string[]; rows: (string | number)[][] }>;
    }

    const groups: ExpandedGroup[] = [];

    if (gscQueries || gscPages) {
      const g: ExpandedGroup = { source: "GSC", metrics: [], tables: [] };
      if (gscQueries?.summary) {
        g.metrics.push(...gscQueries.summary.map((s: any) => ({ label: s.label, value: s.current, previous: s.previous, delta: s.delta, deltaPercent: s.deltaPercent, isPositive: s.isPositive, unit: s.label === "Avg Position" ? "pos" : undefined })));
      }
      if (gscQueries?.tables?.[0]) g.tables.push(gscQueries.tables[0]);
      if (gscPages?.tables?.[0]) g.tables.push(gscPages.tables[0]);
      groups.push(g);
    }

    if (ga4Funnel || ga4Pages) {
      const g: ExpandedGroup = { source: "GA4", metrics: [], tables: [] };
      if (ga4Funnel?.summary) {
        g.metrics.push(...ga4Funnel.summary.map((s: any) => ({ label: s.label, value: s.current, previous: s.previous, delta: s.delta, deltaPercent: s.deltaPercent, isPositive: s.isPositive, unit: s.label === "Organic CVR" ? "%" : undefined })));
      }
      if (ga4Pages?.tables?.[0]) g.tables.push(ga4Pages.tables[0]);
      else if (ga4Funnel?.tables?.[0]) g.tables.push(ga4Funnel.tables[0]);
      groups.push(g);
    }

    if (callsResult) {
      const g: ExpandedGroup = { source: "Calls", metrics: [], tables: [] };
      if (callsResult.summary) {
        g.metrics.push(...callsResult.summary.map((s: any) => ({ label: s.label, value: s.current, previous: s.previous, delta: s.delta, deltaPercent: s.deltaPercent, isPositive: s.isPositive })));
      }
      if (callsResult.tables?.[0]) g.tables.push(callsResult.tables[0]);
      groups.push(g);
    }

    if (semrushResult) {
      const g: ExpandedGroup = { source: "SEMrush", metrics: [], tables: [] };
      if (semrushResult.summary) {
        g.metrics.push(...semrushResult.summary.map((s: any) => ({ label: s.label, value: s.current, previous: s.previous, delta: s.delta ?? "—", deltaPercent: s.deltaPercent ?? "—", isPositive: s.isPositive })));
      }
      if (semrushResult.tables?.[0]) g.tables.push(semrushResult.tables[0]);
      groups.push(g);
    }

    const connectedServices: string[] = [];
    if (client.gscSiteUrl) connectedServices.push("gsc");
    if (client.ga4PropertyId) connectedServices.push("ga4");
    if (client.callrailCompanyId) connectedServices.push("callrail");
    if (client.ctmAccountId) connectedServices.push("ctm");
    if (hasSemrush) connectedServices.push("semrush");
    if (client.ahrefsProjectUrl) connectedServices.push("ahrefs");
    if (client.gbpLocationName) connectedServices.push("gbp");
    if (client.airtableBaseId) connectedServices.push("airtable");

    res.json({ clientId: client.id, clientName: client.name, lastUpdated: new Date().toISOString(), connectedServices, groups });
  });

  app.get("/api/reports/biweekly/sample", async (_req, res) => {
    try {
      const sections = getSampleBiweeklySections();
      const date = "March 5, 2026";
      const buffer = await generateBiweeklyDocx(SAMPLE_CLIENT_NAME, SAMPLE_ATTENDEES, date, sections);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="Sample_Biweekly_AcmePlumbing.docx"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Sample Biweekly error:", err);
      res.status(500).json({ message: "Failed to generate sample: " + err.message });
    }
  });

  app.get("/api/reports/biweekly/sample/pdf", async (_req, res) => {
    try {
      const sections = getSampleBiweeklySections();
      const date = "March 5, 2026";
      const buffer = await generateBiweeklyPdf(SAMPLE_CLIENT_NAME, SAMPLE_ATTENDEES, date, sections);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Sample_Biweekly_AcmePlumbing.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Sample Biweekly PDF error:", err);
      res.status(500).json({ message: "Failed to generate PDF: " + err.message });
    }
  });

  app.get("/api/reports/monthly/sample", async (_req, res) => {
    try {
      const sections = getSampleMonthlySections();
      const buffer = await generatePptx(SAMPLE_CLIENT_NAME, "Monthly SEO Report", "March 2026", sections);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="Sample_Monthly_AcmePlumbing.pptx"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Sample Monthly error:", err);
      res.status(500).json({ message: "Failed to generate sample: " + err.message });
    }
  });

  app.get("/api/reports/qbr/sample", async (_req, res) => {
    try {
      const sections = getSampleQbrSections();
      const buffer = await generatePptx(SAMPLE_CLIENT_NAME, "Quarterly Business Review", "Q1 2025", sections);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="Sample_QBR_AcmePlumbing.pptx"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Sample QBR error:", err);
      res.status(500).json({ message: "Failed to generate sample: " + err.message });
    }
  });

  app.get("/api/reports/qbr-prep/sample", async (_req, res) => {
    try {
      const json = getSampleQbrPrepJson();
      const buffer = await generateQbrPrepDocx(json);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="Sample_QBRPrep_AcmePlumbing.docx"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Sample QBR Prep error:", err);
      res.status(500).json({ message: "Failed to generate sample: " + err.message });
    }
  });

  const TEMPLATE_CONFIG_PATH = path.join(process.cwd(), "server", "assets", "template_config.json");
  const HEADER_IMAGE_PATH = path.join(process.cwd(), "server", "assets", "biweekly_header.png");

  function readTemplateConfig() {
    try {
      if (fs.existsSync(TEMPLATE_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(TEMPLATE_CONFIG_PATH, "utf8"));
      }
    } catch {}
    return { accentColor: "C0392B" };
  }

  app.get("/api/template/config", (_req, res) => {
    const cfg = readTemplateConfig();
    const headerImageExists = fs.existsSync(HEADER_IMAGE_PATH);
    res.json({ ...cfg, headerImageExists });
  });

  app.get("/api/template/header", (_req, res) => {
    if (!fs.existsSync(HEADER_IMAGE_PATH)) {
      return res.status(404).json({ message: "No header image" });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    res.send(fs.readFileSync(HEADER_IMAGE_PATH));
  });

  app.post("/api/template/save", (req, res) => {
    try {
      const { templateType, accentColor, purposeText, footerText, sectionTitles, imageBase64 } = req.body as {
        templateType?: "biweekly" | "monthly" | "qbr";
        accentColor?: string;
        purposeText?: string;
        footerText?: string;
        sectionTitles?: Record<string, string>;
        imageBase64?: string;
      };
      const cfg = readTemplateConfig();
      const type = templateType ?? "biweekly";
      if (!cfg[type]) cfg[type] = {};
      if (accentColor !== undefined) cfg[type].accentColor = accentColor.replace("#", "");
      if (purposeText !== undefined) cfg[type].purposeText = purposeText;
      if (footerText !== undefined) cfg[type].footerText = footerText;
      if (sectionTitles !== undefined) cfg[type].sectionTitles = sectionTitles;
      // Top-level accentColor kept for backward compat
      if (type === "biweekly" && accentColor !== undefined) cfg.accentColor = accentColor.replace("#", "");
      fs.writeFileSync(TEMPLATE_CONFIG_PATH, JSON.stringify(cfg, null, 2));
      if (imageBase64 && type === "biweekly") {
        const imgBuf = Buffer.from(imageBase64, "base64");
        fs.writeFileSync(HEADER_IMAGE_PATH, imgBuf);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Saved Reports API ────────────────────────────────────────────────────────
  app.get("/api/saved-reports", async (req, res) => {
    try {
      const clientId = Number(req.query.clientId);
      const reportType = req.query.reportType as string | undefined;
      if (!clientId || isNaN(clientId)) {
        return res.status(400).json({ message: "clientId required" });
      }
      const reports = reportType
        ? await listSavedReportsByClientAndType(clientId, reportType)
        : await listSavedReportsByClient(clientId);
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/saved-reports/:id", async (req, res) => {
    try {
      const report = await getSavedReportById(Number(req.params.id));
      if (!report) return res.status(404).json({ message: "Not found" });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/saved-reports", async (req, res) => {
    try {
      const {
        clientId, reportType, reportName, reportPeriodLabel,
        analysisWindowStart, analysisWindowEnd, planningQuarter, planningYear,
        generatedOn, sourceSnapshotJson, generatedReportJson, editsJson,
        htmlSnapshot, currentCrawlAssetId, comparisonCrawlAssetId, versionLabel,
      } = req.body;
      if (!clientId || !reportType || !reportName || !generatedOn) {
        return res.status(400).json({ message: "clientId, reportType, reportName, generatedOn are required" });
      }
      const created = await createSavedReport({
        clientId: Number(clientId),
        reportType,
        reportName,
        reportPeriodLabel,
        analysisWindowStart,
        analysisWindowEnd,
        planningQuarter: planningQuarter != null ? Number(planningQuarter) : undefined,
        planningYear: planningYear != null ? Number(planningYear) : undefined,
        generatedOn,
        sourceSnapshotJson,
        generatedReportJson,
        editsJson,
        currentCrawlAssetId: currentCrawlAssetId != null ? Number(currentCrawlAssetId) : undefined,
        comparisonCrawlAssetId: comparisonCrawlAssetId != null ? Number(comparisonCrawlAssetId) : undefined,
        versionLabel,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/saved-reports/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getSavedReportById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const requestedClientId = Number(req.body.clientId ?? existing.clientId);
      if (requestedClientId && existing.clientId !== requestedClientId) {
        return res.status(403).json({ message: "Forbidden: report does not belong to this client" });
      }
      const { clientId: _drop, ...rest } = req.body;
      const updated = await updateSavedReport(id, rest);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/saved-reports/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getSavedReportById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const requestedClientId = Number(req.query.clientId || req.body?.clientId);
      if (requestedClientId && existing.clientId !== requestedClientId) {
        return res.status(403).json({ message: "Forbidden: report does not belong to this client" });
      }
      const ok = await softDeleteSavedReport(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Crawl Assets API ─────────────────────────────────────────────────────────
  app.get("/api/crawl-assets", async (req, res) => {
    try {
      const clientId = Number(req.query.clientId);
      if (!clientId || isNaN(clientId)) {
        return res.status(400).json({ message: "clientId required" });
      }
      const assets = await listCrawlAssets(clientId);
      res.json(assets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/crawl-assets/:id", async (req, res) => {
    try {
      const asset = await getCrawlAsset(Number(req.params.id));
      if (!asset) return res.status(404).json({ message: "Not found" });
      res.json(asset);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/crawl-assets", async (req, res) => {
    try {
      const { clientId, clientName, filename, reportDate, headers, data, notes, sessionId, sessionName, fileType } = req.body;
      if (!clientId || !filename || !headers || !data) {
        return res.status(400).json({ message: "clientId, filename, headers, data required" });
      }
      const date = reportDate ?? new Date().toISOString().split("T")[0];
      const created = await createCrawlAsset(
        Number(clientId),
        clientName ?? "Unknown",
        filename,
        date,
        headers,
        data,
        notes,
        sessionId ?? null,
        sessionName ?? null,
        fileType ?? null,
      );
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/crawl-assets/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const asset = await getCrawlAsset(id);
      if (!asset) return res.status(404).json({ message: "Not found" });
      const requestedClientId = Number(req.query.clientId || req.body?.clientId);
      if (requestedClientId && asset.clientId !== requestedClientId) {
        return res.status(403).json({ message: "Forbidden: asset does not belong to this client" });
      }
      const ok = await deleteCrawlAsset(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
