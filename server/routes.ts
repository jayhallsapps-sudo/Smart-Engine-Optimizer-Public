import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClientSchema } from "@shared/schema";
import { parseNaturalQuery, getCommandDescription, getDateRangeLabel } from "./nlRouter";
import { generateMockResult } from "./mockData";
import { seedDatabase } from "./seed";
import { encrypt } from "./encryption";

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

  return httpServer;
}
