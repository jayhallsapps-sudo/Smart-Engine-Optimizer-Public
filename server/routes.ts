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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

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
      const tables = Object.entries(data.byCategory).map(([category, items]) => ({
        title: category,
        headers: ["Task", "Date", "URL / Page"],
        rows: items.map(item => [item.task, item.date, item.url ?? "—"]),
      }));

      const result = {
        command: "airtable_work_log" as const,
        clientName: data.clientName,
        dateRange: data.dateRange,
        summary: [
          { label: "Total Items", current: data.totalItems.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
          { label: "Categories", current: Object.keys(data.byCategory).length.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        ],
        tables,
      };

      await storage.createQueryLog({
        clientId: intent.clientId,
        command: intent.command,
        naturalQuery: query,
        dateRange: intent.dateRange,
        filters: intent.filters,
        resultSummary: `Work log: ${data.totalItems} items across ${Object.keys(data.byCategory).length} categories`,
        resultData: result as any,
      });

      return res.json({
        success: true,
        commandDescription: getCommandDescription(intent.command),
        dateRangeLabel: data.dateRange,
        result,
      });
    }

    const result = generateMockResult(intent.command, client.name, intent.dateRange);

    await storage.createQueryLog({
      clientId: intent.clientId,
      command: intent.command,
      naturalQuery: query,
      dateRange: intent.dateRange,
      filters: intent.filters,
      resultSummary: result.summary.map(s => `${s.label}: ${s.current} (${s.deltaPercent})`).join("; "),
      resultData: result as any,
    });

    res.json({
      success: true,
      commandDescription: getCommandDescription(intent.command),
      dateRangeLabel: getDateRangeLabel(intent.dateRange),
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

  return httpServer;
}
