import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClientSchema } from "@shared/schema";
import { parseNaturalQuery, getCommandDescription, getDateRangeLabel } from "./nlRouter";
import { generateMockResult } from "./mockData";
import { fetchAirtableWorkLog } from "./airtable";
import { seedDatabase } from "./seed";
import { encrypt } from "./encryption";
import { buildGoogleAuthUrl, exchangeCodeForToken, callbackHtml, isGoogleConfigured } from "./googleAuth";
import { testCredential } from "./connectionTest";
import { insertSfReportSchema, insertCallTrackingReportSchema } from "@shared/schema";
import { generateBiweeklyDocx, generatePptx } from "./reportGenerators";
import type { SectionData } from "./reportGenerators";
import { generateQbrPrep } from "./qbrPrepGenerator";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { queryGbp } from "./gbpClient";
import { querySfReport, handlesSfCommand } from "./sfClient";
import { getGoogleAccessToken } from "./googleToken";

const AHREFS_COMMANDS = new Set([
  "ahrefs_backlink_overview",
  "ahrefs_keyword_rankings",
  "ahrefs_competitor_visibility",
]);

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

const AHREFS_BLOCKED_DOMAIN = "api.ahrefs.com";

function guardAhrefsOutbound(url: string): void {
  try {
    const host = new URL(url).hostname;
    if (host === AHREFS_BLOCKED_DOMAIN || host.endsWith("." + AHREFS_BLOCKED_DOMAIN)) {
      throw new Error(
        `[GUARDRAIL] Outbound request to ${AHREFS_BLOCKED_DOMAIN} is blocked. ` +
        "Ahrefs data is only available via Ahrefs Connect / MCP integration on this plan."
      );
    }
  } catch (e: any) {
    if (e.message.startsWith("[GUARDRAIL]")) throw e;
  }
}

interface AhrefsUsageEntry {
  clientId: number;
  clientName: string;
  command: string;
  requestedAt: string;
  blockedReason: string;
}

const ahrefsUsageLog: AhrefsUsageEntry[] = [];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  // Fetch GBP accounts + locations using stored OAuth token
  app.get("/api/gbp/locations", async (_req, res) => {
    try {
      const accessToken = await getGoogleAccessToken("google_business_profile");
      if (!accessToken) {
        return res.status(401).json({ message: "Google Business Profile not connected. Connect it in Setup → Analytics & Search." });
      }

      const accountsResp = await fetch(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const accountsData = await accountsResp.json() as any;
      if (!accountsResp.ok) {
        const rawMsg: string = accountsData.error?.message ?? "";
        // Detect API not enabled error and provide actionable link
        if (rawMsg.toLowerCase().includes("quota") || rawMsg.toLowerCase().includes("rate limit")) {
          return res.status(429).json({ message: "Google API rate limit hit — wait 60 seconds and try again." });
        }
        if (rawMsg.includes("has not been used") || rawMsg.includes("is disabled")) {
          const projectMatch = rawMsg.match(/project (\d+)/);
          const projectId = projectMatch?.[1] ?? "";
          const enableUrl = projectId
            ? `https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=${projectId}`
            : "https://console.developers.google.com/apis/library/mybusinessaccountmanagement.googleapis.com";
          return res.status(403).json({
            message: "The Google My Business Account Management API is not enabled for your Google Cloud project. Enable it here, wait ~1 minute, then try again.",
            enableUrl,
          });
        }
        return res.status(accountsResp.status).json({ message: rawMsg || "Failed to fetch GBP accounts" });
      }

      const accounts: any[] = accountsData.accounts ?? [];
      if (!accounts.length) {
        return res.json({ locations: [] });
      }

      const allLocations: { name: string; displayName: string; address: string; resourceName: string }[] = [];

      await Promise.all(
        accounts.map(async (account: any) => {
          try {
            const locResp = await fetch(
              `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const locData = await locResp.json() as any;
            const locs: any[] = locData.locations ?? [];
            for (const loc of locs) {
              const addr = loc.storefrontAddress;
              const addressLine = addr
                ? [addr.locality, addr.administrativeArea].filter(Boolean).join(", ")
                : "";
              allLocations.push({
                name: loc.title ?? loc.name,
                displayName: loc.title ?? loc.name,
                address: addressLine,
                resourceName: `${account.name}/${loc.name}`,
              });
            }
          } catch {
            // skip accounts with no location access
          }
        })
      );

      res.json({ locations: allLocations });
    } catch (err: any) {
      console.error("[GBP] /api/gbp/locations error:", err.message);
      res.status(500).json({ message: "Failed to fetch GBP locations: " + err.message });
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

    if (AHREFS_COMMANDS.has(intent.command)) {
      ahrefsUsageLog.push({
        clientId: intent.clientId,
        clientName: client.name,
        command: intent.command,
        requestedAt: new Date().toISOString(),
        blockedReason: "Ahrefs Connect / MCP integration not available on this plan",
      });
      return res.json({
        success: false,
        error: "Ahrefs not connected via integrations on this plan. Ahrefs data is only available through Ahrefs Connect / MCP — not via direct API. Please contact your plan administrator.",
        ahrefsBlocked: true,
      });
    }

    // Live data dispatch — priority: Google → Screaming Frog → CallRail/CTM → SEMrush → GBP → mock
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
      if (!result && intent.command === "gbp_local_summary") {
        result = await queryGbp(intent.command, client, intent.dateRange);
        if (result) liveSource = "gbp";
      }
    } catch (liveErr: any) {
      console.warn(`[Live] ${intent.command} failed (${liveErr.message}) — falling back to mock`);
    }

    if (!result) {
      result = generateMockResult(intent.command, client.name, intent.dateRange);
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

  app.get("/api/ahrefs/usage", (_req, res) => {
    res.json({
      status: "blocked",
      reason: "Ahrefs Connect / MCP integration is not available on this Replit plan. Direct API access to api.ahrefs.com is disabled by guardrail.",
      totalBlockedRequests: ahrefsUsageLog.length,
      entries: ahrefsUsageLog.slice(-50),
    });
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
      const refreshToken = decrypt(sheetsCreds[0].encryptedValue);

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

  app.get("/api/clients/:id/sf-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const reports = await storage.getSfReports(clientId);
    res.json(reports.map(r => ({ id: r.id, clientId: r.clientId, reportDate: r.reportDate, filename: r.filename, rowCount: r.rowCount, headers: r.headers, createdAt: r.createdAt })));
  });

  app.post("/api/clients/:id/sf-reports", async (req, res) => {
    const clientId = Number(req.params.id);
    const parsed = insertSfReportSchema.safeParse({ ...req.body, clientId });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid SF report data", errors: parsed.error.issues });
    }
    const report = await storage.createSfReport(parsed.data);
    const allReports = await storage.getSfReports(clientId);
    const MAX_SF_REPORTS = 24;
    if (allReports.length > MAX_SF_REPORTS) {
      const toDelete = allReports.slice(MAX_SF_REPORTS);
      for (const old of toDelete) {
        await storage.deleteSfReport(old.id);
      }
    }
    res.status(201).json({ id: report.id, clientId: report.clientId, reportDate: report.reportDate, filename: report.filename, rowCount: report.rowCount, headers: report.headers, createdAt: report.createdAt });
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
    const ok = await storage.deleteSfReport(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
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
    const ok = await storage.deleteCallTrackingReport(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
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
    if (AHREFS_COMMANDS.has(command as any)) return null;
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
      if (!result && command === "gbp_local_summary") { result = await queryGbp(command as any, client, dateRange); if (result) liveSource = "gbp"; }
    } catch { /* fall through to mock */ }
    if (!result) result = generateMockResult(command as any, client.name, dateRange);
    return { result, liveSource, description: getCommandDescription(command as any), dateRangeLabel: getDateRangeLabel(dateRange) };
  }

  app.post("/api/reports/qbr-prep/generate", async (req, res) => {
    const {
      clientId,
      pastQuarter,
      futureQuarter,
      includeContent = true,
      includeTechnical = true,
      includeLocal = true,
      includeCro = true,
      includeAuthority = true,
      includeTracking = true,
      opportunityCapPerCategory = 10,
      timezone = "America/Los_Angeles",
    } = req.body;

    if (!clientId || !pastQuarter || !futureQuarter) {
      return res.status(400).json({ message: "clientId, pastQuarter, and futureQuarter are required" });
    }

    try {
      const output = await generateQbrPrep({
        clientId: Number(clientId),
        pastQuarter,
        futureQuarter,
        includeContent: Boolean(includeContent),
        includeTechnical: Boolean(includeTechnical),
        includeLocal: Boolean(includeLocal),
        includeCro: Boolean(includeCro),
        includeAuthority: Boolean(includeAuthority),
        includeTracking: Boolean(includeTracking),
        opportunityCapPerCategory: Number(opportunityCapPerCategory),
        timezone: String(timezone),
      });
      res.json(output);
    } catch (err: any) {
      console.error("QBR Prep generation error:", err);
      res.status(500).json({ message: "Failed to generate QBR Prep: " + err.message });
    }
  });

  app.post("/api/reports/qbr-prep/upload-to-drive", async (req, res) => {
    const { markdown, reportTitle, clientId } = req.body;
    if (!markdown) return res.status(400).json({ message: "markdown is required" });

    try {
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();

      const filename = reportTitle ?? "QBR Prep Report";
      const metadata = JSON.stringify({ name: filename, mimeType: "application/vnd.google-apps.document" });
      const boundary = "-------smarteo_qbr_boundary";
      const CRLF = "\r\n";

      const metaBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}${metadata}${CRLF}`, "utf8");
      const filePrefixBuf = Buffer.from(`--${boundary}${CRLF}Content-Type: text/plain; charset=UTF-8${CRLF}${CRLF}`, "utf8");
      const contentBuf = Buffer.from(markdown, "utf8");
      const closeBuf = Buffer.from(`${CRLF}--${boundary}--`, "utf8");
      const bodyBuffer = Buffer.concat([metaBuf, filePrefixBuf, contentBuf, closeBuf]);

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
      console.error("QBR Prep Drive upload error:", err);
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

  return httpServer;
}
