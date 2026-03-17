import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { buildSectionCommandsAutoMap, getReportFamily } from "@shared/reportRegistry";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertClientSchema } from "@shared/schema";
import {
  createSavedReport,
  updateSavedReport,
  getSavedReportById,
  listSavedReportsByClientAndType,
  listSavedReportsByClient,
  listAllSavedReports,
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
import { fetchAirtableWorkLog, fetchAirtableTaskItems } from "./airtable";
import { fetchAsanaOpenTasks } from "./asanaClient";
import { seedDatabase } from "./seed";
import { encrypt, decrypt, deriveInternalToken } from "./encryption";
import { buildGoogleAuthUrl, exchangeCodeForToken, callbackHtml, isGoogleConfigured } from "./googleAuth";
import { testCredential } from "./connectionTest";
import { insertSfReportSchema, insertCallTrackingReportSchema, amInputsSchema, migrateLegacyAmInputs, insertReportCommentSchema, updateReportCommentSchema } from "@shared/schema";
import { generateBiweeklyDocx, generatePptx, generateMidStrategyPptx, generateQbrPrepDocx } from "./reportGenerators";
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
import { getGoogleAccessToken, getAllGoogleAccessTokens } from "./googleToken";
import { generateQbrPrepReport } from "./qbrPrepSectionGenerator";
import { generateQbrPrepV2Docx } from "./qbrPrepDocxGenerator";
import { analyzeReportGaps, loadSEOHQContext, type AccountContext } from "./gapAnalysisEngine";
import { resolveClientMonthlyCredits, CLIENT_MONTHLY_CREDIT_MAP } from "./clientCreditMap";
import { validateQbrPrepExportReadiness } from "./qbrPrepExportValidator";


// Section → data-commands map is now derived from the report registry.
// To add or change a report's data dependencies, update shared/reportRegistry.ts.
const SECTION_COMMANDS_AUTO: Record<string, Record<string, string[]>> = {
  // Registry-driven entries (Phase 1 reports with non-empty manifests)
  ...buildSectionCommandsAutoMap(),
  // Legacy alias: routes.ts uses "qbr" as the key for qbr_full sections
  qbr: buildSectionCommandsAutoMap()["qbr_full"] ?? {
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

// Patterns that indicate internal prompt/implementation text was accidentally submitted as AM input.
// These are phrases that would only appear in developer instructions, not in genuine AM field notes.
const PROMPT_ARTIFACT_PATTERNS = [
  /PRIMARY PRODUCT GOAL/i,
  /CURRENT PROBLEMS THAT MUST BE FIXED/i,
  /NON-NEGOTIABLE PRODUCT RULES/i,
  /WHAT MID-STRATEGY SHOULD ACTUALLY ANALYZE/i,
  /REQUIRED OUTPUT/i,
  /FINAL WARNING/i,
  /SLIDE GENERATION PHILOSOPHY/i,
  /DESIGN REQUIREMENT.*MUST MATCH/i,
  /COLOUR \+ LAYOUT RULES/i,
  /CRITICAL WORDING RULE/i,
  /AGENDA RULE/i,
  /NON-NEGOTIABLE FIX REQUIREMENTS/i,
  /IMPLEMENTATION REQUIREMENTS/i,
  /STRICT QA ACCEPTANCE CRITERIA/i,
];

function containsPromptArtifact(text: string): boolean {
  if (!text) return false;
  return PROMPT_ARTIFACT_PATTERNS.some(p => p.test(text));
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
  // Reject submissions where AM input fields contain internal prompt/implementation artifacts.
  // This prevents developer/implementation text from being saved into generated report JSON.
  if (containsPromptArtifact(migrated.amThoughts ?? "")) {
    return { error: "AM Inputs validation failed: AM's Hypothesis contains internal system text and cannot be submitted. Please enter actual account notes." };
  }
  if (containsPromptArtifact(migrated.priorityChecks ?? "")) {
    return { error: "AM Inputs validation failed: Priority Checks contains internal system text and cannot be submitted. Please enter actual priority notes." };
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
    "/auth/admin-verify",
    "/auth/google/start",
    "/auth/google/callback",
    "/auth/google/configured",
    "/template/header",
    "/print-cache/",
  ];
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (AUTH_PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + "?") || (p.endsWith("/") && req.path.startsWith(p)))) return next();
    const provided = req.headers["x-internal-token"];
    if (provided !== INTERNAL_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  // ─── Admin auth ───────────────────────────────────────────────────────────────
  // ADMIN_TOKEN lives only in the server environment.  The client calls
  // POST /api/auth/admin-verify (public) to validate a code; on success the
  // client stores the raw token in sessionStorage and sends it as X-Admin-Token
  // on all subsequent admin write requests.

  const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
  if (!ADMIN_TOKEN) {
    console.warn("[SmartEO] ADMIN_TOKEN env var is not set — admin write endpoints are unprotected!");
  }

  app.post("/api/auth/admin-verify", (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!ADMIN_TOKEN) {
      return res.status(503).json({ message: "Admin auth not configured (ADMIN_TOKEN missing)." });
    }
    if (!token || token.trim() !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, message: "Invalid admin code." });
    }
    return res.json({ ok: true });
  });

  /** Middleware: require a valid X-Admin-Token header for admin write routes. */
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!ADMIN_TOKEN) {
      return res.status(503).json({ message: "Admin auth not configured — ADMIN_TOKEN env var is missing." });
    }
    const provided = req.headers["x-admin-token"] as string | undefined;
    if (!provided || provided !== ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required. Please unlock admin features in the app." });
    }
    next();
  }

  app.use("/api/reports", heavyLimiter);

  const LARGE_BODY_ROUTES = [
    "/crawl-assets", "/sf-reports", "/call-tracking-reports", "/print-cache",
    "/reports/export", "/reports/upload-to-drive",
  ];
  const EXPORT_PATH_PATTERNS = ["/docx", "/pptx", "/docx-v2", "/upload-to-drive", "/preview-pdf", "/export", "/pdf"];
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

  async function fetchAllGa4Properties(): Promise<{ propertyId: string; displayName: string; accountName: string }[]> {
    const tokens = await getAllGoogleAccessTokens("google_analytics_4");
    const seen = new Set<string>();
    const all: { propertyId: string; displayName: string; accountName: string }[] = [];
    for (const token of tokens) {
      try {
        let pageToken: string | undefined;
        do {
          const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
          url.searchParams.set("pageSize", "200");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const resp = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resp.ok) break;
          const data = await resp.json() as any;
          for (const account of (data.accountSummaries ?? [])) {
            for (const prop of (account.propertySummaries ?? [])) {
              if (!seen.has(prop.property)) {
                seen.add(prop.property);
                all.push({ propertyId: prop.property, displayName: prop.displayName, accountName: account.displayName });
              }
            }
          }
          pageToken = data.nextPageToken;
        } while (pageToken);
      } catch {
        continue;
      }
    }
    return all;
  }

  app.get("/api/ga4/properties", async (_req, res) => {
    try {
      const tokens = await getAllGoogleAccessTokens("google_analytics_4");
      if (!tokens.length) {
        return res.status(401).json({ message: "GA4 is not connected. Connect it in Setup → Analytics & Search." });
      }
      const properties = await fetchAllGa4Properties();
      res.json({ properties });
    } catch (err: any) {
      console.error("[GA4] /api/ga4/properties error:", err.message);
      res.status(500).json({ message: "Failed to fetch GA4 properties: " + err.message });
    }
  });

  // Auto-match GA4 properties to clients by name/domain
  app.post("/api/ga4/auto-assign", async (_req, res) => {
    try {
      const tokens = await getAllGoogleAccessTokens("google_analytics_4");
      if (!tokens.length) {
        return res.status(401).json({ message: "GA4 is not connected. Connect it in Setup → Analytics & Search." });
      }

      const properties = await fetchAllGa4Properties();

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

      function scoreMatch(clientName: string, brandTerms: string[], prop: typeof properties[0]): number {
        const cn = norm(clientName);
        const pn = norm(prop.displayName);
        const an = norm(prop.accountName);
        if (pn === cn) return 100;
        if (an === cn) return 95;
        if (pn.includes(cn) || cn.includes(pn)) return 80;
        if (an.includes(cn) || cn.includes(an)) return 70;

        let best = 0;

        // Generic healthcare words that appear in many property/client names and shouldn't drive matching alone
        const genericWords = new Set(["treatment", "healing", "recovery", "center", "health", "wellness",
          "rehab", "services", "institute", "group", "care", "medical", "clinic", "mental",
          "behavioral", "detox", "residential", "outpatient", "inpatient", "sober", "living"]);

        // Brand term checks — substring first, then word-ratio on distinctive words only
        for (const term of brandTerms) {
          const bt = norm(term);
          if (!bt) continue;
          if (pn === bt || an === bt) return 95;
          if (pn.includes(bt) || bt.includes(pn)) { best = Math.max(best, 78); continue; }
          if (an.includes(bt) || bt.includes(an)) { best = Math.max(best, 68); continue; }
          // Word-ratio matching using only DISTINCTIVE words (filters out generic healthcare terms)
          // e.g. "Sol" → "Sol Mental Wellness" via brand term "sol treatment" → only "sol" is distinctive
          const distinctiveBtWords = bt.split(" ").filter(w => w.length >= 3 && !genericWords.has(w));
          if (distinctiveBtWords.length === 0) continue;
          const pnSet = new Set(pn.split(" "));
          const anSet = new Set(an.split(" "));
          const pnHits = distinctiveBtWords.filter(w => pnSet.has(w)).length;
          const anHits = distinctiveBtWords.filter(w => anSet.has(w)).length;
          const maxHits = Math.max(pnHits, anHits);
          if (maxHits > 0) {
            const ratio = maxHits / distinctiveBtWords.length;
            // ≥50% of distinctive brand term words match gives ≥60
            best = Math.max(best, Math.round(40 + ratio * 40));
          }
        }
        if (best >= 60) return best;

        // Client name word scoring (fallback, words > 3 chars only)
        const cnWords = cn.split(" ").filter(w => w.length > 3);
        const pnWords = new Set(pn.split(" "));
        const anWords = new Set(an.split(" "));
        const pnHits = cnWords.filter(w => pnWords.has(w)).length;
        const anHits = cnWords.filter(w => anWords.has(w)).length;
        return Math.max(best, Math.max(pnHits, anHits) * 20);
      }

      const clients = await storage.getClients();
      const matches: { clientId: number; clientName: string; propertyId: string; displayName: string; accountName: string; score: number; currentPropertyId: string }[] = [];

      for (const client of clients) {
        let best: typeof properties[0] | null = null;
        let bestScore = 0;
        for (const prop of properties) {
          const s = scoreMatch(client.name, client.brandTerms ?? [], prop);
          if (s > bestScore) { bestScore = s; best = prop; }
        }
        if (best && bestScore >= 60) {
          matches.push({
            clientId: client.id,
            clientName: client.name,
            propertyId: best.propertyId,
            displayName: best.displayName,
            accountName: best.accountName,
            score: bestScore,
            currentPropertyId: client.ga4PropertyId ?? "",
          });
        }
      }

      const matchedIds = new Set(matches.map(m => m.clientId));
      const unmatched = clients
        .filter(c => !matchedIds.has(c.id))
        .map(c => ({ clientId: c.id, clientName: c.name, currentPropertyId: c.ga4PropertyId ?? "" }));

      res.json({ matches, unmatched, total: properties.length, properties });
    } catch (err: any) {
      console.error("[GA4] auto-assign error:", err.message);
      res.status(500).json({ message: "Auto-assign failed: " + err.message });
    }
  });

  // Apply a set of GA4 property assignments
  app.patch("/api/ga4/apply-assignments", async (req, res) => {
    try {
      const assignments = req.body.assignments as { clientId: number; propertyId: string }[];
      if (!Array.isArray(assignments)) return res.status(400).json({ message: "assignments array required" });
      const results = [];
      for (const { clientId, propertyId } of assignments) {
        const updated = await storage.updateClient(clientId, { ga4PropertyId: propertyId });
        results.push({ clientId, propertyId, ok: !!updated });
      }
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  // ─── Client Competitors ──────────────────────────────────────────────────────

  app.get("/api/clients/:id/competitors", async (req, res) => {
    const clientId = Number(req.params.id);
    const competitors = await storage.getClientCompetitors(clientId);
    res.json(competitors);
  });

  app.post("/api/clients/:id/competitors", async (req, res) => {
    const clientId = Number(req.params.id);
    const { name = "", url = "", ordinal } = req.body;
    const competitor = await storage.createClientCompetitor({ clientId, name, url, ordinal });
    res.json(competitor);
  });

  app.patch("/api/clients/:id/competitors/:competitorId", async (req, res) => {
    const competitorId = Number(req.params.competitorId);
    const { name, url, ordinal } = req.body;
    const updated = await storage.updateClientCompetitor(competitorId, { name, url, ordinal });
    if (!updated) return res.status(404).json({ message: "Competitor not found" });
    res.json(updated);
  });

  app.delete("/api/clients/:id/competitors/:competitorId", async (req, res) => {
    const competitorId = Number(req.params.competitorId);
    const deleted = await storage.deleteClientCompetitor(competitorId);
    if (!deleted) return res.status(404).json({ message: "Competitor not found" });
    res.json({ success: true });
  });

  app.put("/api/clients/:id/competitors", async (req, res) => {
    const clientId = Number(req.params.id);
    const { competitors } = req.body as { competitors: { name: string; url: string }[] };
    if (!Array.isArray(competitors)) return res.status(400).json({ message: "competitors must be an array" });
    const rows = await storage.replaceClientCompetitors(clientId, competitors);
    res.json(rows);
  });

  // Ahrefs competitor auto-fetch
  app.get("/api/clients/:id/competitors/ahrefs", async (req, res) => {
    const clientId = Number(req.params.id);
    try {
      const client = await storage.getClient(clientId);
      if (!client?.ahrefsProjectUrl) {
        return res.json({ competitors: [], message: "No Ahrefs project URL configured for this client." });
      }
      const creds = await storage.getApiCredentialsByService("ahrefs");
      const tokenCred = creds.find(c => c.credentialType === "bearer_token") ?? creds.find(c => c.credentialType === "api_key");
      if (!tokenCred) {
        return res.json({ competitors: [], message: "No Ahrefs credentials configured." });
      }
      const token = decrypt(tokenCred.encryptedValue);
      const { extractDomain } = await import("./googleToken");
      const targetDomain = extractDomain(client.ahrefsProjectUrl) ?? client.ahrefsProjectUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const today = new Date().toISOString().split("T")[0];
      const qs = new URLSearchParams({
        select: "competitor_domain,traffic,domain_rating,keywords_common",
        target: targetDomain,
        mode: "domain",
        limit: "10",
        date: today,
        country: "us",
      }).toString();
      const ahrefsRes = await fetch(
        `https://api.ahrefs.com/v3/site-explorer/organic-competitors?${qs}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!ahrefsRes.ok) {
        const body = await ahrefsRes.text();
        return res.json({ competitors: [], message: `Ahrefs returned ${ahrefsRes.status}: ${body.substring(0, 200)}` });
      }
      const ahrefsData = await ahrefsRes.json();
      const competitors = (ahrefsData?.competitors ?? []).slice(0, 10).map((c: any) => ({
        name: c.competitor_domain ?? "",
        url: c.competitor_domain ? `https://${c.competitor_domain}` : "",
      }));
      res.json({ competitors });
    } catch (err: any) {
      res.json({ competitors: [], message: err.message ?? "Ahrefs fetch failed" });
    }
  });

  // ─── ACA: Ask Claude Anything ───────────────────────────────────────────────

  app.post("/api/aca/chat", heavyLimiter, async (req: Request, res: Response) => {
    const { messages, clientId, integrations } = req.body as {
      messages?: { role: string; content: string }[];
      clientId?: number | null;
      integrations?: string[];
    };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "messages array is required" });
    }

    try {
      const { runAcaChat } = await import("./claudeService");

      const acaMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Resolve client context if a client is selected
      let clientContext: { id: number; name: string } | undefined;
      if (clientId) {
        const client = await storage.getClient(clientId);
        if (client) {
          clientContext = { id: client.id, name: client.name };
        }
      }

      const toolCalls: string[] = [];
      const { response, provider } = await runAcaChat(
        acaMessages,
        clientContext,
        integrations || [],
        (toolName) => { toolCalls.push(toolName); }
      );

      res.json({ response, provider, toolCalls });
    } catch (err: any) {
      console.error("[ACA] Chat error:", err);
      if (err.message?.includes("unconfigured") || err.message?.includes("API key")) {
        return res.status(503).json({
          message: "The AI service is not configured. Please contact your administrator.",
        });
      }
      const errMsg = (err.message || "").toLowerCase();
      if (err.status === 429 || errMsg.includes("rate limit") || (errMsg.includes("token") && errMsg.includes("limit"))) {
        return res.status(503).json({
          message: "The AI service is temporarily at capacity. Please wait a moment and try again.",
        });
      }
      res.status(500).json({ message: "Something went wrong processing your request. Please try again." });
    }
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

  /**
   * Execution reference picker — returns open Asana tasks + Airtable production records for a client.
   * Used by the FindingChatPanel to let AMs link findings to real work items.
   * Gracefully returns empty arrays when credentials/config are missing.
   */
  app.get("/api/clients/:id/execution-refs", async (req, res) => {
    const clientId = Number(req.params.id);
    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const asanaProjectId = (client as any).asanaProjectId as string | null;

    const [asanaTasks, airtableItems] = await Promise.all([
      asanaProjectId
        ? fetchAsanaOpenTasks(asanaProjectId).catch(() => [])
        : Promise.resolve([] as { gid: string; name: string; url: string }[]),
      fetchAirtableTaskItems(clientId).catch(() => []),
    ]);

    const asana = asanaTasks.map(t => ({
      type: "asana" as const,
      ref: t.gid,
      title: t.name,
      url: t.url,
    }));

    const airtable = airtableItems.map(item => ({
      type: "airtable" as const,
      ref: item.id,
      title: item.title,
    }));

    res.json({ asana, airtable });
  });

  app.post("/api/clients/:id/finding-history/query", async (req, res) => {
    const clientId = Number(req.params.id);
    const { reportType } = req.body as { reportType: string };
    if (!reportType) return res.status(400).json({ error: "reportType required" });
    const rows = await storage.queryFindingHistory(clientId, reportType);
    res.json(rows);
  });

  app.post("/api/clients/:id/finding-history", async (req, res) => {
    const clientId = Number(req.params.id);
    const { reportType, periodLabel, findings } = req.body as {
      reportType: string;
      periodLabel: string;
      findings: Array<{
        areaId: string;
        body: string;
        bodyHash: string;
        bucket: string | null;
        executionStatus: string | null;
        linkedRefTitle: string | null;
      }>;
    };
    if (!reportType || !Array.isArray(findings)) {
      return res.status(400).json({ error: "reportType and findings[] required" });
    }
    const rows = findings.map(f => ({
      clientId,
      reportType,
      areaId: f.areaId,
      bodyHash: f.bodyHash,
      body: f.body,
      bucket: f.bucket ?? null,
      executionStatus: f.executionStatus ?? null,
      linkedRefTitle: f.linkedRefTitle ?? null,
      periodLabel: periodLabel ?? null,
    }));
    await storage.saveFindingHistoryBatch(rows);
    res.json({ saved: rows.length });
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

  // Test all credentials in parallel — used by the integrations page on load
  app.get("/api/credentials/health", async (_req, res) => {
    const all = await storage.getApiCredentials();
    const results = await Promise.all(
      all.map(async (cred) => {
        const result = await testCredential(cred.id);
        return [cred.id, result] as const;
      })
    );
    res.json(Object.fromEntries(results));
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
      const { fetchStrategyBank, clearStrategyBankCache, getNotionPages } = await import("./notionClient");
      clearStrategyBankCache();
      const data = await fetchStrategyBank(true);
      const pages = await getNotionPages();
      res.json({
        success: true,
        entries: data.entries.length,
        pageCount: pages.length,
        source: data.source ?? "none",
        error: data.error ?? null,
        accessible: !data.error,
      });
    } catch (err: any) {
      res.json({ success: false, entries: 0, error: err.message, accessible: false });
    }
  });

  app.get("/api/notion-pages", async (_req, res) => {
    try {
      const { getNotionPages } = await import("./notionClient");
      const pages = await getNotionPages();
      res.json(pages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notion-pages", async (req, res) => {
    try {
      const { getNotionPages, saveNotionPages, extractNotionPageId, clearStrategyBankCache } = await import("./notionClient");
      const { url, label } = req.body as { url: string; label: string };
      if (!url?.trim() || !label?.trim()) {
        return res.status(400).json({ message: "url and label are required" });
      }
      const pageId = extractNotionPageId(url.trim());
      if (!pageId || pageId.length < 10) {
        return res.status(400).json({ message: "Could not extract a valid Notion page ID from that URL" });
      }
      const pages = await getNotionPages();
      if (pages.find(p => p.id === pageId)) {
        return res.status(409).json({ message: "That page is already in your list" });
      }
      pages.push({ id: pageId, label: label.trim(), addedAt: new Date().toISOString() });
      await saveNotionPages(pages);
      clearStrategyBankCache();
      res.json({ success: true, id: pageId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/notion-pages/:pageId", async (req, res) => {
    try {
      const { getNotionPages, saveNotionPages, clearStrategyBankCache } = await import("./notionClient");
      const { pageId } = req.params;
      const { label } = req.body as { label: string };
      if (!label?.trim()) return res.status(400).json({ message: "label is required" });
      const pages = await getNotionPages();
      const idx = pages.findIndex(p => p.id === pageId);
      if (idx === -1) return res.status(404).json({ message: "Page not found" });
      pages[idx] = { ...pages[idx], label: label.trim() };
      await saveNotionPages(pages);
      clearStrategyBankCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/notion-pages/:pageId", async (req, res) => {
    try {
      const { getNotionPages, saveNotionPages, clearStrategyBankCache } = await import("./notionClient");
      const { pageId } = req.params;
      const pages = await getNotionPages();
      const filtered = pages.filter(p => p.id !== pageId);
      await saveNotionPages(filtered);
      clearStrategyBankCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notion-pages/:pageId/test", async (req, res) => {
    try {
      const { fetchSinglePageEntries } = await import("./notionClient");
      const { pageId } = req.params;
      const result = await fetchSinglePageEntries(pageId);
      res.json(result);
    } catch (err: any) {
      res.json({ success: false, entries: 0, childPages: 0, source: "none", error: err.message });
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
      const filename = `QBS_${slug}_${reportData.meta?.planningQuarter?.replace(/\s+/g, "_") ?? "report"}.docx`;
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
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // ── Step 1: Initiate a resumable upload session (small body — safe through proxy) ──
      const initRes = await connectors.proxy(
        "google-drive",
        `/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": DOCX_MIME,
            "X-Upload-Content-Length": String(docxBuffer.length),
          },
          body: Buffer.from(JSON.stringify({ name: filename })),
        }
      );

      if (!initRes.ok) {
        const errBody = await initRes.json().catch(() => ({})) as any;
        const msg = errBody?.error?.message || initRes.statusText;
        return res.status(initRes.status).json({ message: `Google Drive upload init failed: ${msg}` });
      }

      // The session URI is returned in the Location header
      const sessionUri = initRes.headers.get("location") as string;
      if (!sessionUri) {
        return res.status(502).json({ message: "Google Drive did not return a resumable upload session URI" });
      }

      // ── Step 2: Upload the file directly to the session URI (bypasses proxy body limit) ──
      // No extra auth needed — Google's resumable session URI is self-contained (auth embedded in URL)
      const uploadRes = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          "Content-Type": DOCX_MIME,
          "Content-Length": String(docxBuffer.length),
          // The session URI already embeds the auth token — no extra auth needed
        },
        body: docxBuffer,
      });

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
    const { clientId, startDate, endDate, preparedBy } = req.body;
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

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
      });
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
    const { report, edits, json } = req.body as { report?: any; edits?: Record<string, string>; json?: any };
    const reportData = report ?? json;
    if (!reportData) return res.status(400).json({ message: "report is required" });
    try {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      printCache.set(id, { data: { report: reportData, edits: edits ?? {} }, ts: Date.now() });
      const buffer = await generatePdfViaPuppeteer(id);
      printCache.delete(id);
      const clientName = edits?.["client_name"] ?? reportData.client_name ?? "report";
      const date = edits?.["report_date"] ?? reportData.date ?? "";
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
      printCache.delete(err._cacheId);
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
  app.post("/api/reports/mid-strategy/health-check", async (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ message: "clientId is required" });
    try {
      const client = await storage.getClient(Number(clientId));
      if (!client) return res.status(404).json({ message: "Client not found" });

      const checks: Record<string, { status: string; detail?: string }> = {};

      const crawls = await storage.getSfReports(Number(clientId));
      checks["Screaming Frog"] = crawls.length > 0
        ? { status: "connected", detail: `${crawls.length} crawl${crawls.length !== 1 ? "s" : ""} uploaded` }
        : { status: "not connected", detail: "No crawl assets uploaded" };

      const gscUrl = client.gscSiteUrl;
      checks["Google Search Console"] = gscUrl
        ? { status: "connected", detail: gscUrl }
        : { status: "not connected", detail: "No GSC property configured" };

      const ga4Prop = client.ga4PropertyId;
      checks["Google Analytics 4"] = ga4Prop
        ? { status: "connected", detail: `Property: ${ga4Prop}` }
        : { status: "not connected", detail: "No GA4 property configured" };

      try {
        const { fetchNsmGoals } = await import("./sheetsClient");
        const nsmData = await fetchNsmGoals(Number(clientId));
        checks["NSM Sheet"] = nsmData
          ? { status: "connected", detail: "Goals loaded" }
          : { status: "connected but no data", detail: "Sheet accessible but no goals for this client" };
      } catch {
        checks["NSM Sheet"] = { status: "not connected", detail: "Sheet unavailable" };
      }

      const gbpAccountId = client.gbpAccountId;
      checks["Google Business Profile"] = gbpAccountId
        ? { status: "connected", detail: `Account: ${gbpAccountId}` }
        : { status: "not connected", detail: "No GBP configured" };

      const callCreds = await storage.getApiCredentialsByService("callrail");
      const ctmCreds = await storage.getApiCredentialsByService("calltrackingmetrics");
      if (callCreds.length > 0) {
        checks["Call Tracking"] = { status: "connected", detail: "CallRail" };
      } else if (ctmCreds.length > 0) {
        checks["Call Tracking"] = { status: "connected", detail: "CallTrackingMetrics" };
      } else {
        checks["Call Tracking"] = { status: "not connected", detail: "No call tracking vendor configured" };
      }

      const airtableCreds = await storage.getApiCredentialsByService("airtable");
      checks["Airtable"] = airtableCreds.length > 0
        ? { status: "connected" }
        : { status: "not connected" };

      try {
        const { ReplitConnectors } = await import("@replit/connectors-sdk");
        const connectors = new ReplitConnectors();
        const asanaRes = await connectors.proxy("asana", "/api/1.0/users/me", { method: "GET" });
        checks["Asana"] = asanaRes.ok
          ? { status: "connected" }
          : { status: "not connected", detail: "Connector returned error" };
      } catch {
        checks["Asana"] = { status: "not connected", detail: "Connector unavailable" };
      }

      const semrushCreds = await storage.getApiCredentialsByService("semrush");
      checks["SEMrush"] = semrushCreds.length > 0
        ? { status: "connected" }
        : { status: "not connected", detail: "Optional — used for competitive benchmarks" };

      const ahrefsCreds = await storage.getApiCredentialsByService("ahrefs");
      checks["Ahrefs"] = ahrefsCreds.length > 0
        ? { status: "connected", detail: "Optional" }
        : { status: "not connected", detail: "Optional" };

      res.json({ checks });
    } catch (err: any) {
      res.status(500).json({ message: "Health check failed: " + err.message });
    }
  });

  app.post("/api/reports/mid-strategy/generate", async (req, res) => {
    const { clientId, currentCrawlAssetId, comparisonCrawlAssetId, clientInsights, includeDomainStrategy, domainStrategy } = req.body;
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

    try {
      const client = await storage.getClient(Number(clientId));
      if (!client) return res.status(404).json({ message: "Client not found" });
      const { generateMidStrategy } = await import("./midStrategyGenerator");
      const output = await generateMidStrategy({
        clientId: Number(clientId),
        currentCrawlAssetId: currentCrawlAssetId ? Number(currentCrawlAssetId) : null,
        comparisonCrawlAssetId: comparisonCrawlAssetId ? Number(comparisonCrawlAssetId) : null,
        clientInsights: clientInsights ?? undefined,
        includeDomainStrategy: includeDomainStrategy ?? false,
        domainStrategy: domainStrategy ?? undefined,
      });
      if (!output || !Array.isArray(output.slides) || output.slides.length < 1) {
        return res.status(500).json({ message: "Mid-Strategy generator produced no slides." });
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
        .filter((s: any) => s.type !== "title" && s.exportAllowed !== false)
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const comm = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (comm) items.push({ manualText: comm });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.bullets) items.push({ manualText: (s.leftContent.bullets as string[]).map((b: string) => `• ${b}`).join("\n") });
          if (s.rightContent?.bullets) items.push({ manualText: (s.rightContent.bullets as string[]).map((b: string) => `• ${b}`).join("\n") });
          if (s.rightContent?.metrics) items.push({ summary: s.rightContent.metrics.map((m: any) => ({ label: m.label, current: m.current, isPositive: m.isPositive ?? true })) });
          if (s.type === "decision-card" && s.decisionOptions?.length) {
            const optText = (s.decisionOptions as any[]).map((opt: any, oi: number) => {
              const lbl = edits?.[`${s.id}_opt_${oi}_label`] ?? opt.label;
              const pros = (opt.pros ?? []).map((p: string, pi: number) => `  ✓ ${edits?.[`${s.id}_opt_${oi}_pro_${pi}`] ?? p}`).join("\n");
              const cons = (opt.cons ?? []).map((c: string, ci: number) => `  ✗ ${edits?.[`${s.id}_opt_${oi}_con_${ci}`] ?? c}`).join("\n");
              return `${opt.recommended ? "★ " : ""}${lbl}${opt.subtitle ? ` — ${opt.subtitle}` : ""}\n${pros}${cons ? "\n" + cons : ""}`;
            }).join("\n\n");
            items.push({ manualText: optText });
            const conclusion = edits?.[`${s.id}_conclusion`] ?? s.decisionConclusion;
            if (conclusion) items.push({ manualText: `Recommendation: ${conclusion}` });
          }
          if (s.type === "ia-comparison") {
            const curItems = (s.currentIA ?? []).map((item: any, ii: number) => {
              const lbl = edits?.[`${s.id}_cur_${ii}`] ?? item.label;
              const children = (item.children ?? []).map((c: string) => `    — ${c}`).join("\n");
              return `${lbl}${children ? "\n" + children : ""}`;
            }).join("\n");
            const futItems = (s.futureIA ?? []).map((item: any, ii: number) => {
              const lbl = edits?.[`${s.id}_fut_${ii}`] ?? item.label;
              const children = (item.children ?? []).map((c: string) => `    — ${c}`).join("\n");
              return `${lbl}${children ? "\n" + children : ""}`;
            }).join("\n");
            items.push({ manualText: `CURRENT STRUCTURE:\n${curItems}\n\n→ FUTURE STRUCTURE:\n${futItems}` });
          }
          if (s.type === "cluster-map" && s.clusters?.length) {
            const clusterRows = (s.clusters as any[]).flatMap((cl: any, ci: number) => {
              const hub = edits?.[`${s.id}_cluster_${ci}_hub`] ?? cl.hub;
              return (cl.pages ?? []).map((pg: string, pi: number) => [hub, edits?.[`${s.id}_cluster_${ci}_page_${pi}`] ?? pg]);
            });
            items.push({ tables: [{ title: "Content Clusters", headers: ["Hub", "Page"], rows: clusterRows }] });
          }
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const clientName = json.client_name ?? "Client";
      const reportTitle = json.report_title ?? "Mid-Strategy SEO Report";
      const generatedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generateMidStrategyPptx(clientName, reportTitle, generatedAt, sections);
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

  app.post("/api/reports/mid-strategy/pdf", async (req, res) => {
    const t0 = Date.now();
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json || !json.slides?.length) { logExport("Mid-Strategy PDF", t0, false, "No slides"); return res.status(400).json({ message: "No slide data found. Generate the report first." }); }
    const id = randomUUID();
    const pdfJson = { ...json, slides: (json.slides ?? []).filter((s: any) => s.exportAllowed !== false) };
    printCache.set(id, { data: { report: pdfJson, edits: edits ?? {} }, ts: Date.now() });
    try {
      const buffer = await generatePdfViaPuppeteer(id, "mid-strategy/pdf-render");
      const clientName = json.client_name ?? "Client";
      const slug = clientName.toLowerCase().replace(/\s+/g, "_");
      logExport("Mid-Strategy PDF", t0, true);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_Mid_Strategy.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      logExport("Mid-Strategy PDF", t0, false, err.message);
      res.status(500).json({ message: "Failed to generate PDF: " + err.message });
    } finally {
      printCache.delete(id);
    }
  });

  app.post("/api/reports/mid-strategy/upload-to-drive", async (req, res) => {
    const { json, edits } = req.body as { json: any; edits?: Record<string, string> };
    if (!json) return res.status(400).json({ message: "json is required" });
    try {
      const sections: SectionData[] = (json.slides ?? [])
        .filter((s: any) => s.type !== "title" && s.exportAllowed !== false)
        .map((s: any, idx: number) => {
          const items: any[] = [];
          if (s.metrics?.length) items.push({ summary: s.metrics.map((m: any) => ({ label: m.label, current: m.current, previous: m.previous ?? "—", deltaPercent: m.delta ?? "—", isPositive: m.isPositive ?? true })) });
          const comm2 = edits?.[`${s.id}_commentary`] ?? s.commentary;
          if (comm2) items.push({ manualText: comm2 });
          if (s.table) { const resolvedRows = (s.table.rows as any[][]).map((row: any[], ri: number) => row.map((cell: any, ci: number) => edits?.[`${s.id}_cell_${ri}_${ci}`] ?? String(cell))); const tableKey = s.type === "scorecard" ? `${s.id}_scorecard` : `${s.id}_table`; const crRows = parseCustomRowsFromEdits(edits, tableKey); items.push({ tables: [{ title: edits?.[`${s.id}_subtitle`] ?? s.subtitle ?? "", headers: s.table.headers, rows: [...resolvedRows, ...crRows] }] }); }
          if (s.bullets) items.push({ manualText: (s.bullets as string[]).map((b: string, bi: number) => edits?.[`${s.id}_bullet_${bi}`] ?? b).join("\n") });
          if (s.leftContent?.bullets) items.push({ manualText: (s.leftContent.bullets as string[]).join("\n") });
          if (s.type === "decision-card" && s.decisionOptions?.length) {
            const optText = (s.decisionOptions as any[]).map((opt: any, oi: number) => {
              const lbl = edits?.[`${s.id}_opt_${oi}_label`] ?? opt.label;
              const pros = (opt.pros ?? []).map((p: string, pi: number) => `  ✓ ${edits?.[`${s.id}_opt_${oi}_pro_${pi}`] ?? p}`).join("\n");
              const cons = (opt.cons ?? []).map((c: string, ci: number) => `  ✗ ${edits?.[`${s.id}_opt_${oi}_con_${ci}`] ?? c}`).join("\n");
              return `${opt.recommended ? "★ " : ""}${lbl}${opt.subtitle ? ` — ${opt.subtitle}` : ""}\n${pros}${cons ? "\n" + cons : ""}`;
            }).join("\n\n");
            items.push({ manualText: optText });
            const conclusion = edits?.[`${s.id}_conclusion`] ?? s.decisionConclusion;
            if (conclusion) items.push({ manualText: `Recommendation: ${conclusion}` });
          }
          if (s.type === "ia-comparison") {
            const curItems = (s.currentIA ?? []).map((item: any, ii: number) => {
              const lbl = edits?.[`${s.id}_cur_${ii}`] ?? item.label;
              const children = (item.children ?? []).map((c: string) => `    — ${c}`).join("\n");
              return `${lbl}${children ? "\n" + children : ""}`;
            }).join("\n");
            const futItems = (s.futureIA ?? []).map((item: any, ii: number) => {
              const lbl = edits?.[`${s.id}_fut_${ii}`] ?? item.label;
              const children = (item.children ?? []).map((c: string) => `    — ${c}`).join("\n");
              return `${lbl}${children ? "\n" + children : ""}`;
            }).join("\n");
            items.push({ manualText: `CURRENT STRUCTURE:\n${curItems}\n\n→ FUTURE STRUCTURE:\n${futItems}` });
          }
          if (s.type === "cluster-map" && s.clusters?.length) {
            const clusterRows = (s.clusters as any[]).flatMap((cl: any, ci: number) => {
              const hub = edits?.[`${s.id}_cluster_${ci}_hub`] ?? cl.hub;
              return (cl.pages ?? []).map((pg: string, pi: number) => [hub, edits?.[`${s.id}_cluster_${ci}_page_${pi}`] ?? pg]);
            });
            items.push({ tables: [{ title: "Content Clusters", headers: ["Hub", "Page"], rows: clusterRows }] });
          }
          return { sectionId: `slide_${idx}`, title: edits?.[`${s.id}_title`] ?? s.title ?? "", items };
        });
      const msClientName = json.client_name ?? "Client";
      const msReportTitle = json.report_title ?? "Mid-Strategy SEO Report";
      const msGeneratedAt = json.generated_at ? new Date(json.generated_at).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US");
      const buffer = await generateMidStrategyPptx(msClientName, msReportTitle, msGeneratedAt, sections);
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
      const rawClientId = req.query.clientId as string | undefined;
      const reportType = req.query.reportType as string | undefined;
      if (!rawClientId) {
        const reports = await listAllSavedReports();
        return res.json(reports);
      }
      const clientId = Number(rawClientId);
      if (isNaN(clientId)) return res.status(400).json({ message: "Invalid clientId" });
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

  app.delete("/api/saved-reports/:id", async (req, res) => {
    try {
      const deleted = await softDeleteSavedReport(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
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

  // ─── Report Comments ────────────────────────────────────────────────────────

  app.get("/api/comments", async (req, res) => {
    try {
      const { reportType, clientId, savedReportId } = req.query;
      const sid = savedReportId && savedReportId !== "null" ? Number(savedReportId) : null;
      // reportType is required only when savedReportId is absent — when sid is set,
      // the storage layer filters by savedReportId alone and ignores reportType.
      if (sid === null && (!reportType || typeof reportType !== "string")) {
        return res.status(400).json({ message: "reportType is required when savedReportId is not provided" });
      }
      const cid = clientId && clientId !== "null" ? Number(clientId) : null;
      const comments = await storage.getReportComments(
        typeof reportType === "string" ? reportType : "",
        cid,
        sid
      );
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/comments", async (req, res) => {
    try {
      const parsed = insertReportCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const comment = await storage.createReportComment(parsed.data);
      res.status(201).json(comment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = updateReportCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const updated = await storage.updateReportComment(id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Comment not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const ok = await storage.deleteReportComment(id);
      if (!ok) return res.status(404).json({ message: "Comment not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Workflow: Finding AI Chat ─────────────────────────────────────────────
  // Mock AI analyst layer. Structured so the mock response generation can be
  // replaced with a real LLM call (OpenAI, Anthropic, etc.) without changing
  // the request/response contract or any frontend code.

  app.post("/api/workflow/finding-chat", (req, res) => {
    // Accept full Finding object (new contract) or legacy flat fields for compat.
    // New shape: { finding: Finding, messages[] }
    // The finding object exposes: id, areaId, areaLabel, body, originalBody,
    // status, selected, evidence?, confidence?, sourceMetadata?, notes?
    const finding = req.body.finding as {
      id?: string;
      areaId: string;
      areaLabel: string;
      body: string;
      originalBody?: string;
      status?: string;
      confidence?: "low" | "medium" | "high";
      evidence?: string;
      sourceMetadata?: Record<string, unknown>;
      notes?: string[];
    } | undefined;

    const messages: Array<{ role: "user" | "assistant"; content: string }> = req.body.messages ?? [];

    // Support both new (finding.body) and legacy (findingBody) shapes
    const findingBody: string = finding?.body ?? req.body.findingBody ?? "";
    const areaId: string = finding?.areaId ?? req.body.areaId ?? "";
    const areaLabel: string = finding?.areaLabel ?? req.body.areaLabel ?? "";
    const confidence = finding?.confidence;
    const evidence = finding?.evidence;

    if (!findingBody || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "finding body and messages are required" });
    }

    const lastUser = messages.filter(m => m.role === "user").pop()?.content?.toLowerCase() ?? "";

    // ── Intent detection ──────────────────────────────────────────────────────
    const isExplain = /why|surface|trigger|signal|data|came from|how did/.test(lastUser);
    const isStrengthen = /strengthen|stronger|evidence|data.*support|support.*data|specific|validate|back/.test(lastUser);
    const isRewrite = /rewrite|clearer|cleaner|better|improve|rephrase|simpler/.test(lastUser);
    const isConcise = /concise|shorter|brief|tighten|trim|fewer words|compact/.test(lastUser);
    const isClientFacing = /client.facing|client.ready|client language|client delivery|jargon|deliverable|client.friendly/.test(lastUser);
    const isStrategic = /strategic|internal|am.*perspective|account.*direction|positioning|strategy/.test(lastUser);
    const isDefend = /defend|matter|important|why.*care|pitch|convince|skeptic|case for/.test(lastUser);
    const isUncertain = /uncertain|uncertainty|flag|validation|validate|caveat|unconfirmed|more evidence|weak signal/.test(lastUser);
    const isCautious = /cautious|hedge|careful|conditional|might|may|possibly|soften|weaker/.test(lastUser);
    const isDirect = /direct|decisive|action|strong|assertive|bold|firm|definitive/.test(lastUser);
    const isTechnical = /technical|infra|crawl|render|core web/.test(lastUser);
    const isContent = /content|copy|rewrite|page|cluster|keyword/.test(lastUser);
    const isCategory = /technical or content|content or technical|category|which type|classify/.test(lastUser);
    const isLocal = /local|gbp|map pack|citation/.test(lastUser);
    const isMerge = /merge|combine|similar|another finding|consolidate/.test(lastUser);

    // ── Area-specific context map ─────────────────────────────────────────────
    const areaContext: Record<string, string> = {
      content_refresh: "declining organic clicks, keyword drift, content staleness signals, or cannibalization patterns in GSC data",
      new_content: "keyword gap analysis, competitor footprint research, GSC impression-without-click signals, and DR-weighted opportunity scoring",
      cro_content: "high organic traffic pages with low conversion rates, user journey friction, CTA absence or placement issues, or bounce rate patterns",
      technical_infra: "Screaming Frog crawl output, GSC coverage errors, Core Web Vitals reports, and redirect chain analysis",
      technical_content: "on-page SEO audits, title tag and meta description analysis, internal link graph review, and schema markup gaps",
      advanced_technical: "server log analysis, JavaScript rendering validation, hreflang configuration checks, and crawl frequency anomalies",
      local_gbp: "GBP profile completeness scores, map pack visibility tracking, NAP consistency audits, and location page performance",
      discoverability: "entity coverage analysis, structured data audits, AI overview appearance tracking, and topical authority mapping",
    };

    const signals = areaContext[areaId] ?? "data signals relevant to this area";

    // ── Response generation ───────────────────────────────────────────────────
    let reply = "";
    let suggestedRevision: string | null = null;

    // Extract the core action from the finding body for use in responses
    const bodyLower = findingBody.toLowerCase();
    const hasNumbers = /\d/.test(findingBody);
    const recommendWord = findingBody.match(/recommend[a-z]*/i)?.[0] ?? "recommend";

    if (isExplain) {
      const evidenceNote = evidence
        ? `\n\nEvidence on file: ${evidence}`
        : ``;
      const confidenceNote = confidence === "low"
        ? `\n\nNote: this finding is marked low confidence — the pattern is visible but the underlying data is directional. Treat the recommendation as a hypothesis that needs validation before committing.`
        : confidence === "high"
        ? `\n\nNote: this finding is marked high confidence — the underlying data pattern is clear and consistent.`
        : "";
      reply = `This finding surfaced based on ${signals}.\n\n` +
        `The pattern it describes — ${findingBody.split("—")[0].trim().toLowerCase()} — typically emerges when the underlying data shows a measurable gap between current performance and expected outcome for an account at this stage.\n\n` +
        `In ${areaLabel} analysis, findings like this are flagged when the severity or frequency exceeds normal variance. ` +
        (hasNumbers
          ? `The specific numbers in this finding are indicative benchmarks drawn from the analysis data available — they should be verified against the client's actual live data before committing.`
          : `The recommendation is based on pattern recognition across the relevant data sources — specific quantification would require pulling the client's live metrics.`) +
        evidenceNote + confidenceNote;
    } else if (isStrengthen) {
      reply = `To strengthen this finding, consider adding:\n\n` +
        `1. **Specific URLs or pages** affected, not just a count estimate\n` +
        `2. **Time range** for the decline or gap being observed (e.g., "since Q4 2025" or "last 90 days")\n` +
        `3. **Comparison benchmarks** — how does this compare to the prior period or industry norms?\n` +
        `4. **Estimated impact** — if this were addressed, what outcome change is realistic?\n\n` +
        `For ${areaLabel} specifically, the strongest supporting evidence usually comes from ${signals}. Pulling explicit data points from those sources before the report session will let you make this recommendation with more precision.`;
    } else if (isRewrite) {
      const revised = findingBody
        .replace(/\d–\d/g, (m) => m)
        .replace(/recommend[a-z]*/i, "Action required:")
        .replace(/^([^—]+)—\s*/, (_, lead) => lead.trim() + " — ");
      suggestedRevision = revised !== findingBody ? revised : findingBody.replace(/\.$/, "") + " — prioritize for Q2 sprint.";
      reply = `Here's a cleaner rewrite of this finding:\n\n"${suggestedRevision}"\n\nThe main changes: leading with the observed condition more directly, and ending with a more explicit action signal. You can accept this revision below or tweak it further.`;
    } else if (isConcise) {
      // Trim to the core action — drop qualifiers, shorten the sentence
      const words = findingBody.split(/\s+/);
      let concise = findingBody;
      if (words.length > 20) {
        // Remove parenthetical asides and trailing qualifiers
        concise = findingBody
          .replace(/\s*\([^)]+\)/g, "")
          .replace(/\s*—\s*[^—.]+$/, "")
          .replace(/\s*,\s*and\s+[^.]+$/, "")
          .trim()
          .replace(/[,;]$/, "");
        concise = concise.charAt(0).toUpperCase() + concise.slice(1);
        if (!concise.endsWith(".")) concise += ".";
      }
      suggestedRevision = concise !== findingBody ? concise : findingBody.replace(/\s+/g, " ").trim();
      reply = `Here's a tighter version:\n\n"${suggestedRevision}"\n\nThis removes qualifiers and asides to get to the core recommendation in fewer words. If the removed context is important, add it back as a separate note.`;
    } else if (isClientFacing) {
      const clientVer = findingBody
        .replace(/\brecommend\b/i, "We suggest")
        .replace(/\binfrastructure\b/gi, "site performance")
        .replace(/\bcrawl\b/gi, "site audit")
        .replace(/\bGSC\b/g, "search data")
        .replace(/\bCWV\b/g, "page speed")
        .replace(/\bCTR\b/g, "click rate")
        .replace(/\bSERP\b/g, "search results")
        .replace(/\bcanonical\b/gi, "URL structure");
      suggestedRevision = clientVer !== findingBody ? clientVer : "We recommend " + findingBody.charAt(0).toLowerCase() + findingBody.slice(1);
      reply = `Here's a client-facing version:\n\n"${suggestedRevision}"\n\nThis swaps technical jargon for plain language suitable for client delivery. Check that no nuance is lost — some technical specifics may need to stay for accuracy.`;
    } else if (isStrategic) {
      const isTech = ["technical_infra", "technical_content", "advanced_technical"].includes(areaId);
      const strategyAngle = isTech
        ? `From a technical investment perspective, this finding signals a site health issue that is likely suppressing organic ceiling. Resolving it is a prerequisite for meaningful rankings growth — it's a foundation fix, not a nice-to-have.`
        : `From an account positioning perspective, this finding gives you an editorial narrative to work with. Content-side momentum is visible in client reporting and easy to attribute — which makes this a strong "proof of strategy" talking point for the QBR.`;
      reply = `Strategic lens for this ${areaLabel} finding:\n\n${strategyAngle}\n\nFor account direction: this should be framed as a compounding investment (fixing this now multiplies the value of other active work) rather than a one-off task. That framing tends to land well in strategic reviews.`;
    } else if (isDefend) {
      const impactCase = confidence === "high"
        ? `The signal strength here is high — this is a data-backed recommendation, not a heuristic guess.`
        : confidence === "low"
        ? `The signal is early-stage, but the pattern is recognizable. Frame it as a proactive catch rather than a confirmed problem — "we're catching this before it becomes visible in ranking drops" is a strong client pitch.`
        : `This recommendation is grounded in ${signals}. The evidence is directional — not necessarily pinpoint — but the pattern is consistent with what causes real ranking impact.`;
      reply = `Here's how to defend this finding:\n\n${impactCase}\n\nThe pitch:\n1. What's happening: ${findingBody.split("—")[0].trim()}\n2. Why it matters: unaddressed, this type of issue typically compounds over 2–3 months and shows up as ranking stagnation or traffic ceiling\n3. What the fix unlocks: clearing this creates headroom for other active work to perform better\n\nIf challenged, the strongest counter is specificity — can you pull one concrete data point (a URL, a date range, a metric) to ground it?`;
    } else if (isUncertain) {
      const needsValidation = findingBody
        .replace(/recommend[a-z]*/i, "may warrant")
        .replace(/\bwill\b/g, "may")
        .replace(/\bconfirmed\b/gi, "indicated")
        .replace(/\brequired\b/g, "worth reviewing");
      suggestedRevision = needsValidation !== findingBody
        ? needsValidation + (needsValidation.includes("—") ? "" : " — pending data validation.")
        : `Signal detected: ${findingBody.charAt(0).toLowerCase() + findingBody.slice(1).replace(/\.$/, "")} — confirm before including in final report.`;
      reply = `Here's a version that flags this as needing validation:\n\n"${suggestedRevision}"\n\nThis is appropriate when the underlying data is directional but not conclusive — it keeps the finding in scope while signalling to the reviewer that a data check is needed before committing. If you accept this revision, consider also adding a note in the AM context field.`;
    } else if (isCautious) {
      const cautious = findingBody
        .replace(/recommend[a-z]*/i, "may warrant")
        .replace(/\bwill\b/g, "could")
        .replace(/\bneeded\b/g, "worth reviewing")
        .replace(/\brequired\b/g, "recommended");
      suggestedRevision = cautious !== findingBody ? cautious : `Based on available signals, ${findingBody.charAt(0).toLowerCase() + findingBody.slice(1).replace(/\.$/, "")} — validate before prioritizing.`;
      reply = `Here's a more cautious framing:\n\n"${suggestedRevision}"\n\nThis version positions the finding as conditional on further validation rather than a definitive recommendation. Use this if the underlying data is directional but not conclusive.`;
    } else if (isDirect) {
      const direct = findingBody
        .replace(/\brecommend\b/i, "Fix:")
        .replace(/may be|could be|might be/gi, "is")
        .replace(/consider/gi, "implement");
      suggestedRevision = direct !== findingBody ? direct : findingBody.replace(/\.$/, "") + " Complete by end of sprint.";
      reply = `Here's a more direct version:\n\n"${suggestedRevision}"\n\nThis framing removes hedging language and treats the recommendation as a decision, not a suggestion. Use this when the evidence is solid and the client is in execution mode.`;
    } else if (isCategory) {
      const isTech = ["technical_infra", "technical_content", "advanced_technical"].includes(areaId);
      const isContentArea = ["content_refresh", "new_content", "cro_content"].includes(areaId);
      reply = isTech
        ? `This is a technical finding. It sits in the ${areaLabel} strategy area, which means the root cause and fix path are infrastructure/code-level rather than content-level. That said, the downstream impact is often visible in organic performance, so it may need coordination with the content team on timing.`
        : isContentArea
        ? `This is a content finding. The work required here is editorial — page-level copy, structure, or targeting decisions. Technical changes (redirects, canonicals) may support it but the core action is content-side.`
        : `This finding sits in ${areaLabel}, which spans both technical and content dimensions. The ${bodyLower.includes("schema") || bodyLower.includes("tag") || bodyLower.includes("crawl") ? "primary action is technical" : "primary action is content-related"}, though cross-team coordination is likely needed.`;
    } else if (isLocal) {
      reply = `Local SEO findings like this one typically involve three parallel tracks: GBP optimization, on-page location signals, and citation/NAP consistency. The most impactful first step is usually auditing the GBP profile completeness score and cross-checking NAP data across the major aggregators (Neustar, Acxiom, Foursquare). That foundation unlocks the map pack visibility work downstream.`;
    } else if (isMerge) {
      reply = `Merging findings is supported in a future phase of the workflow. For now, if you think this overlaps with another finding, note it in your context notes and handle the consolidation when writing the report section. The key is that both findings are selected and visible — the report author can then decide how to present them together.`;
    } else {
      // General analyst-style response based on the area
      const followUps: Record<string, string> = {
        content_refresh: "Is there a specific cluster of pages where you've observed this pattern, or is this spread across the site?",
        new_content: "Do you have the keyword gap report pulled, or are we working from impression data alone right now?",
        cro_content: "What's the current conversion mechanism on the affected pages — form, call button, chat widget?",
        technical_infra: "Do we have a recent Screaming Frog crawl or is this based on GSC coverage data?",
        technical_content: "Are the affected pages high-priority by traffic, or are these lower-volume pages that have been overlooked?",
        advanced_technical: "Has Googlebot rendering been validated recently, or is this based on crawl log inference?",
        local_gbp: "Is the GBP profile currently verified and actively managed, or has it been neglected?",
        discoverability: "Has the client appeared in any AI overview results for target queries, or is this entirely absent?",
      };
      const followUp = followUps[areaId] ?? "What additional context do you have on this from recent client conversations?";
      reply = `Good question. For this ${areaLabel} finding, the key consideration is how confident we are in the underlying signal.\n\n${findingBody}\n\nThe strength of a ${recommendWord.toLowerCase()} like this depends heavily on how recent and how specific the data is. ${followUp}`;
    }

    return res.json({ reply, suggestedRevision });
  });

  // ─── Admin Guidance ────────────────────────────────────────────────────────

  app.get("/api/admin/guidance", async (req, res) => {
    const { reportType, workflowArea, status } = req.query as Record<string, string>;
    const items = await storage.listAdminGuidance({
      reportType: reportType || undefined,
      workflowArea: workflowArea || undefined,
      status: status || undefined,
    });
    res.json(items);
  });

  app.get("/api/admin/guidance/:id", async (req, res) => {
    const id = Number(req.params.id);
    const item = await storage.getAdminGuidance(id);
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  });

  app.post("/api/admin/guidance", requireAdmin, async (req, res) => {
    const { insertAdminGuidanceSchema } = await import("@shared/schema");
    const parsed = insertAdminGuidanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const created = await storage.createAdminGuidance(parsed.data);
    return res.status(201).json(created);
  });

  app.patch("/api/admin/guidance/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { updateAdminGuidanceSchema } = await import("@shared/schema");
    const parsed = updateAdminGuidanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await storage.updateAdminGuidance(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  });

  app.delete("/api/admin/guidance/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await storage.deleteAdminGuidance(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.status(204).end();
  });

  // ── Admin Config Overrides ──────────────────────────────────────────────────
  // GET  /api/admin/config-overrides?namespace=X  → list all (or by namespace) — unprotected (read-only, used by AM workflow pages)
  // PUT  /api/admin/config-overrides              → upsert (body: {namespace, itemKey, field, value}) — admin write
  // DELETE /api/admin/config-overrides/:id        → delete by id — admin write

  app.get("/api/admin/config-overrides", async (req, res) => {
    const { namespace } = req.query as Record<string, string>;
    const items = await storage.listConfigOverrides(namespace || undefined);
    return res.json(items);
  });

  // ── Report Template Sections ───────────────────────────────────────────────
  // GET  — unprotected (runtime pages read section config)
  // PUT  — requireAdmin (upsert a single section override)
  // DELETE — requireAdmin (reset section to defaults by removing DB row)

  app.get("/api/admin/template-sections", async (req, res) => {
    const { reportType } = req.query as Record<string, string>;
    const items = await storage.listTemplateSections(reportType || undefined);
    return res.json(items);
  });

  app.put("/api/admin/template-sections", requireAdmin, async (req, res) => {
    const { insertReportTemplateSectionSchema } = await import("@shared/schema");
    const parsed = insertReportTemplateSectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Guard: reject attempts to disable an alwaysEnabled section
    if (parsed.data.enabled === false) {
      const { TEMPLATE_DEFAULTS } = await import("@shared/templateDefaults");
      const defs = TEMPLATE_DEFAULTS[parsed.data.reportType] ?? [];
      const def = defs.find(d => d.sectionKey === parsed.data.sectionKey);
      if (def?.alwaysEnabled) {
        return res.status(400).json({ error: `Section '${parsed.data.sectionKey}' is structurally required and cannot be disabled.` });
      }
    }

    const item = await storage.upsertTemplateSection(parsed.data);
    return res.json(item);
  });

  app.delete("/api/admin/template-sections/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await storage.deleteTemplateSection(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.status(204).end();
  });

  app.put("/api/admin/config-overrides", requireAdmin, async (req, res) => {
    const { insertAdminConfigOverrideSchema } = await import("@shared/schema");
    const parsed = insertAdminConfigOverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const item = await storage.upsertConfigOverride(parsed.data);
    return res.json(item);
  });

  app.delete("/api/admin/config-overrides/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await storage.deleteConfigOverride(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.status(204).end();
  });

  // ─── Evaluation Batches ─────────────────────────────────────────────────────

  app.get("/api/eval-batches", async (req, res) => {
    try {
      const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
      const batches = await storage.listEvalBatches(clientId);
      res.json(batches);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/eval-batches/:id", async (req, res) => {
    try {
      const batch = await storage.getEvalBatch(Number(req.params.id));
      if (!batch) return res.status(404).json({ error: "Not found" });
      res.json(batch);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/eval-batches", async (req, res) => {
    try {
      const { insertEvalBatchSchema } = await import("@shared/schema");
      const data = insertEvalBatchSchema.parse(req.body);
      const batch = await storage.createEvalBatch(data);
      res.status(201).json(batch);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.patch("/api/eval-batches/:id", async (req, res) => {
    try {
      const updated = await storage.updateEvalBatch(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/eval-batches/:id", async (req, res) => {
    try {
      const ok = await storage.deleteEvalBatch(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Eval Competitor Rows ───────────────────────────────────────────────────

  app.get("/api/eval-batches/:batchId/competitors", async (req, res) => {
    try {
      const rows = await storage.getEvalCompetitorRows(Number(req.params.batchId));
      // Compute derived metrics and ranks inline
      const { computeDerivedMetrics, computeRanks } = await import("./evalDataCollector");
      const withComputed = rows.map(r => ({
        ...r,
        computed: computeDerivedMetrics({ ...((r.metrics as any) ?? {}), ...((r.computed as any) ?? {}) }),
      }));
      const ranks = computeRanks(withComputed.map(r => ({ metrics: r.metrics, computed: r.computed })));
      const result = withComputed.map((r, i) => ({ ...r, ranks: ranks[i] }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/eval-batches/:batchId/competitors", async (req, res) => {
    try {
      const row = await storage.upsertEvalCompetitorRow({ ...req.body, evalBatchId: Number(req.params.batchId) });
      res.status(201).json(row);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/eval-batches/:batchId/competitors", async (req, res) => {
    try {
      const rows = await storage.replaceEvalCompetitorRows(Number(req.params.batchId), req.body);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/eval-competitor-rows/:id", async (req, res) => {
    try {
      const row = await storage.upsertEvalCompetitorRow({ ...req.body, id: Number(req.params.id) });
      res.json(row);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/eval-competitor-rows/:id", async (req, res) => {
    try {
      const ok = await storage.deleteEvalCompetitorRow(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Eval Crawl Rows ────────────────────────────────────────────────────────

  app.get("/api/eval-batches/:batchId/crawl-rows", async (req, res) => {
    try {
      const rows = await storage.getEvalCrawlRows(Number(req.params.batchId));
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/eval-batches/:batchId/crawl-rows/upload", async (req, res) => {
    try {
      const batchId = Number(req.params.batchId);
      const { rows, sourceLabel } = req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });

      const { classifyUrl, DEFAULT_CATEGORY_RULES } = await import("./evalMetricRegistry");
      const batch = await storage.getEvalBatch(batchId);
      const customRules = (batch?.categoryRules as any[]) ?? undefined;

      await storage.deleteEvalCrawlRows(batchId);
      const toInsert = rows.map((r: any, i: number) => ({
        evalBatchId: batchId,
        url: String(r.url ?? r.Address ?? r["Page URL"] ?? ""),
        pageCategory: classifyUrl(String(r.url ?? r.Address ?? r["Page URL"] ?? ""), customRules),
        manualCategoryOverride: null,
        crawlFields: r,
        performanceFields: {},
        pageTitle: r.Title ?? r["Meta Title 1"] ?? null,
        metaDesc: r["Meta Description 1"] ?? null,
        h1: r.H1_1 ?? r["H1-1"] ?? null,
        statusCode: r["Status Code"] ? Number(r["Status Code"]) : null,
        wordCount: r["Word Count"] ? Number(r["Word Count"]) : null,
        indexability: r.Indexability ?? null,
        canonical: r.Canonical ?? null,
        crawlDepth: r["Crawl Depth"] ? Number(r["Crawl Depth"]) : null,
        inlinks: r.Inlinks ? Number(r.Inlinks) : null,
      }));

      await storage.bulkInsertEvalCrawlRows(toInsert);

      // Record source import
      await storage.createEvalSourceImport({
        evalBatchId: batchId,
        sourceType: "screaming_frog",
        label: sourceLabel ?? "Screaming Frog Upload",
        status: "done",
        rowCount: toInsert.length,
        importedFields: Object.keys(rows[0] ?? {}),
        notes: null,
      });

      // Build clicks + traffic distribution from SF data
      const allRows = await storage.getEvalCrawlRows(batchId);
      const { buildClicksDistribution, buildTrafficDistribution } = await import("./evalDataCollector");
      const clicksDist = buildClicksDistribution(allRows as any);
      const trafficDist = buildTrafficDistribution(allRows as any);

      await storage.replaceEvalSummaryRows(batchId, "clicks_dist", clicksDist.map(r => ({
        category: r.category,
        data: { numPages: r.numPages, sumClicks: r.sumClicks, clicksPerPage: r.clicksPerPage, shareOfClicks: r.shareOfClicks },
      })));
      await storage.replaceEvalSummaryRows(batchId, "traffic_dist", trafficDist.map(r => ({
        category: r.category,
        data: { numPages: r.numPages, sumSessions: r.sumSessions, sessionsPerPage: r.sessionsPerPage, shareOfSessions: r.shareOfSessions },
      })));

      res.json({ inserted: toInsert.length, clicksDistRows: clicksDist.length, trafficDistRows: trafficDist.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/eval-crawl-rows/:id/category", async (req, res) => {
    try {
      const { category } = req.body;
      if (!category) return res.status(400).json({ error: "category required" });
      await storage.updateEvalCrawlRowCategory(Number(req.params.id), category);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Eval Summary Tables ────────────────────────────────────────────────────

  app.get("/api/eval-batches/:batchId/summary/:tableType", async (req, res) => {
    try {
      const rows = await storage.getEvalSummaryRows(Number(req.params.batchId), req.params.tableType);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/eval-batches/:batchId/summary/:tableType", async (req, res) => {
    try {
      const { rows } = req.body;
      await storage.replaceEvalSummaryRows(Number(req.params.batchId), req.params.tableType, rows);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Eval Source Imports ────────────────────────────────────────────────────

  app.get("/api/eval-batches/:batchId/imports", async (req, res) => {
    try {
      const imports = await storage.getEvalSourceImports(Number(req.params.batchId));
      res.json(imports);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Mid-Strategy Decks ─────────────────────────────────────────────────────

  app.get("/api/mid-strategy-decks", async (req, res) => {
    try {
      const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
      const decks = await storage.listMidStrategyDecks(clientId);
      res.json(decks);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/mid-strategy-decks/:id", async (req, res) => {
    try {
      const deck = await storage.getMidStrategyDeck(Number(req.params.id));
      if (!deck) return res.status(404).json({ error: "Not found" });
      res.json(deck);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/mid-strategy-decks", async (req, res) => {
    try {
      const { insertMidStrategyDeckSchema } = await import("@shared/schema");
      const data = insertMidStrategyDeckSchema.parse(req.body);
      const deck = await storage.createMidStrategyDeck(data);
      res.status(201).json(deck);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.patch("/api/mid-strategy-decks/:id", async (req, res) => {
    try {
      const updated = await storage.updateMidStrategyDeck(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/mid-strategy-decks/:id", async (req, res) => {
    try {
      const ok = await storage.deleteMidStrategyDeck(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Generate / preview deck slides
  app.post("/api/mid-strategy-decks/:id/generate", async (req, res) => {
    try {
      const deckId = Number(req.params.id);
      const deck = await storage.getMidStrategyDeck(deckId);
      if (!deck) return res.status(404).json({ error: "Deck not found" });

      const existingEdits = (deck.editsJson as Record<string, string>) ?? {};
      const { generateMidStrategyDeck } = await import("./midStrategyDeckGenerator");
      const payload = await generateMidStrategyDeck(deckId, existingEdits);

      // Persist slides back to deck
      await storage.updateMidStrategyDeck(deckId, { slidesJson: payload.slides as any, reportStatus: "draft" } as any);

      res.json(payload);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Save an edited block to the deck's editsJson
  app.patch("/api/mid-strategy-decks/:id/edits", async (req, res) => {
    try {
      const deckId = Number(req.params.id);
      const deck = await storage.getMidStrategyDeck(deckId);
      if (!deck) return res.status(404).json({ error: "Deck not found" });

      const current = (deck.editsJson as Record<string, string>) ?? {};
      const merged = { ...current, ...req.body };
      const updated = await storage.updateMidStrategyDeck(deckId, { editsJson: merged as any });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Update IA structure on a deck
  app.patch("/api/mid-strategy-decks/:id/ia-structure", async (req, res) => {
    try {
      const deckId = Number(req.params.id);
      const deck = await storage.getMidStrategyDeck(deckId);
      if (!deck) return res.status(404).json({ error: "Deck not found" });
      const updated = await storage.updateMidStrategyDeck(deckId, { iaStructureJson: req.body as any });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Recompute summary tables from crawl rows for a batch
  app.post("/api/eval-batches/:batchId/recompute-summaries", async (req, res) => {
    try {
      const batchId = Number(req.params.batchId);
      const allRows = await storage.getEvalCrawlRows(batchId);
      const { buildClicksDistribution, buildTrafficDistribution } = await import("./evalDataCollector");
      const clicksDist = buildClicksDistribution(allRows as any);
      const trafficDist = buildTrafficDistribution(allRows as any);
      await storage.replaceEvalSummaryRows(batchId, "clicks_dist", clicksDist.map(r => ({
        category: r.category,
        data: { numPages: r.numPages, sumClicks: r.sumClicks, clicksPerPage: r.clicksPerPage, shareOfClicks: r.shareOfClicks },
      })));
      await storage.replaceEvalSummaryRows(batchId, "traffic_dist", trafficDist.map(r => ({
        category: r.category,
        data: { numPages: r.numPages, sumSessions: r.sumSessions, sessionsPerPage: r.sessionsPerPage, shareOfSessions: r.shareOfSessions },
      })));
      res.json({ clicksDistRows: clicksDist.length, trafficDistRows: trafficDist.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return httpServer;
}
