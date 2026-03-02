import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  clients,
  queryLogs,
  apiCredentials,
  type Client,
  type InsertClient,
  type QueryLog,
  type InsertQueryLog,
  type ApiCredential,
  type InsertApiCredential,
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
}

export const storage = new DatabaseStorage();
