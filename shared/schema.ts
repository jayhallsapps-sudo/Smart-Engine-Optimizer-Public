import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gscSiteUrl: text("gsc_site_url"),
  ga4PropertyId: text("ga4_property_id"),
  callrailCompanyId: text("callrail_company_id"),
  brandTerms: text("brand_terms").array().default(sql`'{}'::text[]`),
  leadEvents: text("lead_events").array().default(sql`'{}'::text[]`),
  moneyPages: text("money_pages").array().default(sql`'{}'::text[]`),
  callrailOrganicSourceTerms: text("callrail_organic_source_terms").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const queryLogs = pgTable("query_logs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  command: text("command").notNull(),
  naturalQuery: text("natural_query").notNull(),
  dateRange: text("date_range").notNull(),
  filters: jsonb("filters"),
  resultSummary: text("result_summary"),
  resultData: jsonb("result_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const apiCredentials = pgTable("api_credentials", {
  id: serial("id").primaryKey(),
  service: text("service").notNull(),
  credentialType: text("credential_type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQueryLogSchema = createInsertSchema(queryLogs).omit({
  id: true,
  createdAt: true,
});

export const insertApiCredentialSchema = createInsertSchema(apiCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type QueryLog = typeof queryLogs.$inferSelect;
export type InsertQueryLog = z.infer<typeof insertQueryLogSchema>;
export type ApiCredential = typeof apiCredentials.$inferSelect;
export type InsertApiCredential = z.infer<typeof insertApiCredentialSchema>;

export const COMMANDS = [
  "gsc_qoq_queries",
  "gsc_qoq_pages",
  "ga4_qoq_organic_funnel",
  "ga4_qoq_organic_landing_pages",
  "callrail_qoq_organic_calls",
  "callrail_qoq_top_landing_pages",
] as const;

export type Command = (typeof COMMANDS)[number];

export interface CommandResult {
  command: Command;
  clientName: string;
  dateRange: string;
  summary: {
    label: string;
    current: string | number;
    previous: string | number;
    delta: string;
    deltaPercent: string;
    isPositive: boolean;
  }[];
  tables: {
    title: string;
    headers: string[];
    rows: (string | number)[][];
  }[];
}
