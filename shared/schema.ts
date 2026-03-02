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
  ctmAccountId: text("ctm_account_id"),
  ahrefsProjectUrl: text("ahrefs_project_url"),
  semrushProjectId: text("semrush_project_id"),
  screamingFrogProfile: text("screaming_frog_profile"),
  brandTerms: text("brand_terms").array().default(sql`'{}'::text[]`),
  leadEvents: text("lead_events").array().default(sql`'{}'::text[]`),
  moneyPages: text("money_pages").array().default(sql`'{}'::text[]`),
  callrailOrganicSourceTerms: text("callrail_organic_source_terms").array().default(sql`'{}'::text[]`),
  ctmOrganicSourceTerms: text("ctm_organic_source_terms").array().default(sql`'{}'::text[]`),
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
  accountLabel: text("account_label").notNull().default("Default"),
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

export const DATA_SERVICES = [
  "google_search_console",
  "google_analytics_4",
  "callrail",
  "call_tracking_metrics",
  "ahrefs",
  "semrush",
  "screaming_frog",
] as const;

export type DataService = (typeof DATA_SERVICES)[number];

export const COMMANDS = [
  "gsc_qoq_queries",
  "gsc_qoq_pages",
  "ga4_qoq_organic_funnel",
  "ga4_qoq_organic_landing_pages",
  "callrail_qoq_organic_calls",
  "callrail_qoq_top_landing_pages",
  "ctm_qoq_organic_calls",
  "ctm_qoq_top_landing_pages",
  "ahrefs_backlink_overview",
  "ahrefs_keyword_rankings",
  "semrush_organic_overview",
  "semrush_keyword_rankings",
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

export interface ServiceConfig {
  id: DataService;
  name: string;
  description: string;
  authType: "oauth" | "api_key" | "desktop";
  color: string;
  supportsMultiple: boolean;
  credentialFields: { key: string; label: string; placeholder: string; type: "text" | "password" }[];
}

export const SERVICE_CONFIGS: ServiceConfig[] = [
  {
    id: "google_search_console",
    name: "Google Search Console",
    description: "Search analytics: queries, pages, clicks, impressions, CTR, position.",
    authType: "oauth",
    color: "bg-blue-600",
    supportsMultiple: true,
    credentialFields: [],
  },
  {
    id: "google_analytics_4",
    name: "Google Analytics 4",
    description: "Organic funnel: sessions, users, conversions, CVR, landing page performance.",
    authType: "oauth",
    color: "bg-orange-600",
    supportsMultiple: true,
    credentialFields: [],
  },
  {
    id: "callrail",
    name: "CallRail",
    description: "Call tracking: organic calls, unique callers, duration, qualified leads, landing page attribution.",
    authType: "api_key",
    color: "bg-green-600",
    supportsMultiple: true,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter CallRail API v3 key", type: "password" },
    ],
  },
  {
    id: "call_tracking_metrics",
    name: "CallTrackingMetrics",
    description: "Call tracking & attribution: calls, form fills, texts, chat. Detailed source attribution.",
    authType: "api_key",
    color: "bg-teal-600",
    supportsMultiple: true,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter CTM API key", type: "password" },
      { key: "api_secret", label: "API Secret", placeholder: "Enter CTM API secret", type: "password" },
    ],
  },
  {
    id: "ahrefs",
    name: "Ahrefs",
    description: "Backlink analysis, keyword rankings, organic traffic estimates, domain rating, referring domains.",
    authType: "api_key",
    color: "bg-indigo-600",
    supportsMultiple: true,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter Ahrefs API key", type: "password" },
    ],
  },
  {
    id: "semrush",
    name: "SEMrush",
    description: "Competitive intelligence: organic keywords, traffic estimates, position tracking, domain analysis.",
    authType: "api_key",
    color: "bg-red-600",
    supportsMultiple: true,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter SEMrush API key", type: "password" },
    ],
  },
  {
    id: "screaming_frog",
    name: "Screaming Frog",
    description: "Technical SEO crawler. Desktop app -- import crawl exports (CSV/XLSX) for audit analysis.",
    authType: "desktop",
    color: "bg-yellow-600",
    supportsMultiple: false,
    credentialFields: [],
  },
];
