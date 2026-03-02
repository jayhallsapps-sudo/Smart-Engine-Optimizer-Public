import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  clients,
  queryLogs,
  apiCredentials,
  sfReports,
  callTrackingReports,
  settings,
  type Client,
  type InsertClient,
  type QueryLog,
  type InsertQueryLog,
  type ApiCredential,
  type InsertApiCredential,
  type SfReport,
  type InsertSfReport,
  type CallTrackingReport,
  type InsertCallTrackingReport,
  type Setting,
} from "@shared/schema";

export interface IStorage {
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;

  getQueryLogs(clientId?: number, limit?: number): Promise<QueryLog[]>;
  createQueryLog(log: InsertQueryLog): Promise<QueryLog>;

  getApiCredentials(): Promise<ApiCredential[]>;
  getApiCredentialsByService(service: string): Promise<ApiCredential[]>;
  createApiCredential(cred: InsertApiCredential): Promise<ApiCredential>;
  deleteApiCredential(id: number): Promise<boolean>;

  getSfReports(clientId: number): Promise<SfReport[]>;
  getSfReport(id: number): Promise<SfReport | undefined>;
  createSfReport(report: InsertSfReport): Promise<SfReport>;
  deleteSfReport(id: number): Promise<boolean>;
  getLatestSfReportPerClient(): Promise<Array<{ id: number; clientId: number; reportDate: string; filename: string; rowCount: number; createdAt: Date }>>;
  getCallTrackingReports(clientId: number): Promise<CallTrackingReport[]>;
  getCallTrackingReport(id: number): Promise<CallTrackingReport | undefined>;
  createCallTrackingReport(report: InsertCallTrackingReport): Promise<CallTrackingReport>;
  deleteCallTrackingReport(id: number): Promise<boolean>;
  getLatestCallTrackingReportPerClient(): Promise<Array<{ id: number; clientId: number; reportDate: string; filename: string; rowCount: number; createdAt: Date }>>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;
}

export class DatabaseStorage implements IStorage {
  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db
      .update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return updated;
  }

  async deleteClient(id: number): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id)).returning();
    return result.length > 0;
  }

  async getQueryLogs(clientId?: number, limit = 50): Promise<QueryLog[]> {
    if (clientId) {
      return db
        .select()
        .from(queryLogs)
        .where(eq(queryLogs.clientId, clientId))
        .orderBy(desc(queryLogs.createdAt))
        .limit(limit);
    }
    return db.select().from(queryLogs).orderBy(desc(queryLogs.createdAt)).limit(limit);
  }

  async createQueryLog(log: InsertQueryLog): Promise<QueryLog> {
    const [created] = await db.insert(queryLogs).values(log).returning();
    return created;
  }

  async getApiCredentials(): Promise<ApiCredential[]> {
    return db.select().from(apiCredentials).orderBy(apiCredentials.service, apiCredentials.accountLabel);
  }

  async getApiCredentialsByService(service: string): Promise<ApiCredential[]> {
    return db.select().from(apiCredentials).where(eq(apiCredentials.service, service));
  }

  async createApiCredential(cred: InsertApiCredential): Promise<ApiCredential> {
    const [created] = await db.insert(apiCredentials).values(cred).returning();
    return created;
  }

  async deleteApiCredential(id: number): Promise<boolean> {
    const result = await db.delete(apiCredentials).where(eq(apiCredentials.id, id)).returning();
    return result.length > 0;
  }

  async getSfReports(clientId: number): Promise<SfReport[]> {
    return db
      .select()
      .from(sfReports)
      .where(eq(sfReports.clientId, clientId))
      .orderBy(desc(sfReports.reportDate));
  }

  async getSfReport(id: number): Promise<SfReport | undefined> {
    const [row] = await db.select().from(sfReports).where(eq(sfReports.id, id));
    return row;
  }

  async createSfReport(report: InsertSfReport): Promise<SfReport> {
    const [created] = await db.insert(sfReports).values(report).returning();
    return created;
  }

  async deleteSfReport(id: number): Promise<boolean> {
    const result = await db.delete(sfReports).where(eq(sfReports.id, id)).returning();
    return result.length > 0;
  }

  async getCallTrackingReports(clientId: number): Promise<CallTrackingReport[]> {
    return db
      .select()
      .from(callTrackingReports)
      .where(eq(callTrackingReports.clientId, clientId))
      .orderBy(desc(callTrackingReports.reportDate));
  }

  async getCallTrackingReport(id: number): Promise<CallTrackingReport | undefined> {
    const [row] = await db.select().from(callTrackingReports).where(eq(callTrackingReports.id, id));
    return row;
  }

  async createCallTrackingReport(report: InsertCallTrackingReport): Promise<CallTrackingReport> {
    const [created] = await db.insert(callTrackingReports).values(report).returning();
    return created;
  }

  async deleteCallTrackingReport(id: number): Promise<boolean> {
    const result = await db.delete(callTrackingReports).where(eq(callTrackingReports.id, id)).returning();
    return result.length > 0;
  }

  async getLatestCallTrackingReportPerClient(): Promise<Array<{ id: number; clientId: number; reportDate: string; filename: string; rowCount: number; createdAt: Date }>> {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (client_id)
        id, client_id as "clientId", report_date as "reportDate", filename, row_count as "rowCount", created_at as "createdAt"
      FROM call_tracking_reports
      ORDER BY client_id, report_date DESC
    `);
    return rows.rows as any;
  }

  async getLatestSfReportPerClient(): Promise<Array<{ id: number; clientId: number; reportDate: string; filename: string; rowCount: number; createdAt: Date }>> {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (client_id)
        id, client_id as "clientId", report_date as "reportDate", filename, row_count as "rowCount", created_at as "createdAt"
      FROM sf_reports
      ORDER BY client_id, report_date DESC
    `);
    return rows.rows as any;
  }

  async getSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const [row] = await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
      .returning();
    return row;
  }

  async getAllSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }
}

export const storage = new DatabaseStorage();
