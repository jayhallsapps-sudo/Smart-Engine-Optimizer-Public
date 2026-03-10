import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gscSiteUrl: text("gsc_site_url"),
  ga4PropertyId: text("ga4_property_id"),
  callrailCompanyId: text("callrail_company_id"),
  callrailAccountId: text("callrail_account_id"),
  ctmAccountId: text("ctm_account_id"),
  ahrefsProjectUrl: text("ahrefs_project_url"),
  semrushProjectId: text("semrush_project_id"),
  screamingFrogProfile: text("screaming_frog_profile"),
  nimbataAccountId: text("nimbata_account_id"),
  airtableBaseId: text("airtable_base_id"),
  airtableTableName: text("airtable_table_name"),
  airtableProductionView: text("airtable_production_view"),
  airtablePublishedView: text("airtable_published_view"),
  brandTerms: text("brand_terms").array().default(sql`'{}'::text[]`),
  leadEvents: text("lead_events").array().default(sql`'{}'::text[]`),
  moneyPages: text("money_pages").array().default(sql`'{}'::text[]`),
  callrailOrganicSourceTerms: text("callrail_organic_source_terms").array().default(sql`'{}'::text[]`),
  ctmOrganicSourceTerms: text("ctm_organic_source_terms").array().default(sql`'{}'::text[]`),
  gbpLocationName: text("gbp_location_name"),
  gbpProfileUrl: text("gbp_profile_url"),
  asanaProjectId: text("asana_project_id"),
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

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

export const sfReports = pgTable("sf_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportDate: text("report_date").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  headers: text("headers").array(),
  data: jsonb("data"),
  assetName: text("asset_name"),
  notes: text("notes"),
  sessionId: text("session_id"),
  sessionName: text("session_name"),
  fileType: text("file_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const callTrackingReports = pgTable("call_tracking_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportDate: text("report_date").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  headers: text("headers").array(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCallTrackingReportSchema = createInsertSchema(callTrackingReports).omit({
  id: true,
  createdAt: true,
});

export type CallTrackingReport = typeof callTrackingReports.$inferSelect;
export type InsertCallTrackingReport = z.infer<typeof insertCallTrackingReportSchema>;

export const insertSfReportSchema = createInsertSchema(sfReports).omit({
  id: true,
  createdAt: true,
});

export type SfReport = typeof sfReports.$inferSelect;
export type InsertSfReport = z.infer<typeof insertSfReportSchema>;

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQueryLogSchema = createInsertSchema(queryLogs).omit({
  id: true,
  createdAt: true,
});

export const qbrPrepReports = pgTable("qbr_prep_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportType: text("report_type").notNull().default("qbr_prep"),
  reportName: text("report_name").notNull(),
  analysisWindowStart: text("analysis_window_start").notNull(),
  analysisWindowEnd: text("analysis_window_end").notNull(),
  planningQuarter: integer("planning_quarter").notNull(),
  planningYear: integer("planning_year").notNull(),
  generatedOn: text("generated_on").notNull(),
  sourceSnapshotJson: jsonb("source_snapshot_json"),
  generatedReportJson: jsonb("generated_report_json"),
  htmlSnapshot: text("html_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSavedAt: timestamp("last_saved_at").defaultNow().notNull(),
  versionLabel: text("version_label"),
}, (t) => [
  index("qbr_prep_reports_client_id_idx").on(t.clientId),
]);

export const insertQbrPrepReportSchema = createInsertSchema(qbrPrepReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSavedAt: true,
});

export type QbrPrepReport = typeof qbrPrepReports.$inferSelect;
export type InsertQbrPrepReport = z.infer<typeof insertQbrPrepReportSchema>;

export const savedReports = pgTable("saved_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportType: text("report_type").notNull(),
  reportName: text("report_name").notNull(),
  reportPeriodLabel: text("report_period_label"),
  analysisWindowStart: text("analysis_window_start"),
  analysisWindowEnd: text("analysis_window_end"),
  planningQuarter: integer("planning_quarter"),
  planningYear: integer("planning_year"),
  generatedOn: text("generated_on").notNull(),
  sourceSnapshotJson: jsonb("source_snapshot_json"),
  generatedReportJson: jsonb("generated_report_json"),
  editsJson: jsonb("edits_json"),
  htmlSnapshot: text("html_snapshot"),
  currentCrawlAssetId: integer("current_crawl_asset_id"),
  comparisonCrawlAssetId: integer("comparison_crawl_asset_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSavedAt: timestamp("last_saved_at").defaultNow().notNull(),
  versionLabel: text("version_label"),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("saved_reports_client_type_idx").on(t.clientId, t.reportType),
  index("saved_reports_client_id_idx").on(t.clientId),
]);

export const insertSavedReportSchema = createInsertSchema(savedReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSavedAt: true,
});

export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;

export const CLIENT_SENTIMENT_OPTIONS = ["Happy", "Neutral", "Concerned", "Frustrated"] as const;
export type ClientSentiment = typeof CLIENT_SENTIMENT_OPTIONS[number];

export const amInputsSchema = z.object({
  clientSentiment: z.enum(CLIENT_SENTIMENT_OPTIONS, { required_error: "Client Sentiment is required" }),
  amThoughts: z.string().min(1, "AM's Thoughts is required"),
  priorityChecks: z.string().min(1, "Priority Checks is required"),
  clientNotes: z.string().optional().default(""),
});

export type AmInputs = z.infer<typeof amInputsSchema>;

export function migrateLegacyAmInputs(raw: Record<string, any>): Partial<AmInputs> {
  return {
    clientSentiment: raw.clientSentiment ?? raw.sentiment ?? undefined,
    amThoughts: raw.amThoughts ?? raw.hypothesis ?? raw.amHypothesis ?? "",
    priorityChecks: raw.priorityChecks ?? raw.auditNotes ?? raw.manualAuditNotes ?? "",
    clientNotes: raw.clientNotes ?? "",
  };
}

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

// ─── Fill in the Gaps ────────────────────────────────────────────────────────

export const GAP_SOURCE_CATEGORIES = [
  "missing_data",
  "source_conflict",
  "business_context_gap",
  "sentiment_gap",
  "SEO_HQ_alignment_gap",
  "report_narrative_gap",
  "priority_gap",
  "tracking_confidence_gap",
  "blocker_dependency_gap",
] as const;

export type GapSourceCategory = (typeof GAP_SOURCE_CATEGORIES)[number];

export const GAP_QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "boolean",
] as const;

export type GapQuestionType = (typeof GAP_QUESTION_TYPES)[number];

export interface GapQuestion {
  id: string;
  prompt: string;
  type: GapQuestionType;
  options?: string[];
  placeholder?: string;
  priorityScore: number;
  rationale: string;
  showRationaleToUser: boolean;
  sourceCategory: GapSourceCategory;
  sourceReference?: string | null;
}

export interface GapAnswer {
  questionId: string;
  answerType: GapQuestionType;
  value: string | string[] | boolean | null;
  skipped: boolean;
  supportingLink?: string | null;
  supportingDocumentName?: string | null;
  supportingDocumentData?: string | null;
}

export interface GapAnalysisResult {
  shouldAskQuestions: boolean;
  questions: GapQuestion[];
  confidenceScore: number;
  notes?: string[];
  seoHqChecksApplied?: string[];
}

export const gapAnalysisSessions = pgTable("gap_analysis_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportType: text("report_type").notNull(),
  questionsJson: jsonb("questions_json").notNull(),
  answersJson: jsonb("answers_json"),
  seoHqChecksApplied: text("seo_hq_checks_applied").array(),
  linkedReportId: integer("linked_report_id"),
  linkedReportType: text("linked_report_type"),
  generatedOn: text("generated_on").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("gap_sessions_client_idx").on(t.clientId),
]);

export type GapAnalysisSession = typeof gapAnalysisSessions.$inferSelect;

// ─── End Fill in the Gaps ────────────────────────────────────────────────────

export const DATA_SERVICES = [
  "google_search_console",
  "google_analytics_4",
  "google_business_profile",
  "callrail",
  "call_tracking_metrics",
  "ahrefs",
  "semrush",
  "screaming_frog",
  "nimbata",
  "airtable",
] as const;

export type DataService = (typeof DATA_SERVICES)[number];

export const COMMANDS = [
  "gsc_qoq_queries",
  "gsc_qoq_pages",
  "ga4_qoq_organic_funnel",
  "ga4_qoq_organic_landing_pages",
  "ga4_combined_funnel",
  "ga4_qtd_totals",
  "ga4_landing_pages_by_sessions",
  "ga4_landing_pages_by_conversions",
  "ga4_session_movers",
  "ga4_conversion_movers",
  "ga4_yoy_comparison",
  "gsc_top_queries",
  "gsc_query_to_page_map",
  "gsc_high_impressions_low_ctr",
  "gsc_high_traffic_low_cvr",
  "gsc_indexation_stability",
  "callrail_qoq_organic_calls",
  "callrail_qoq_top_landing_pages",
  "callrail_summary",
  "ctm_qoq_organic_calls",
  "ctm_qoq_top_landing_pages",
  "ahrefs_backlink_overview",
  "ahrefs_keyword_rankings",
  "ahrefs_competitor_visibility",
  "semrush_organic_overview",
  "semrush_keyword_rankings",
  "semrush_keyword_distribution",
  "semrush_competitor_visibility",
  "content_output_summary",
  "technical_health_summary",
  "sf_issues_summary",
  "core_web_vitals",
  "gbp_local_summary",
  "new_pages_tracker",
  "tracking_anomaly_check",
  "monthly_trendline",
  "quarterly_forecast",
  "airtable_work_log",
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
    id: "google_business_profile",
    name: "Google Business Profile",
    description: "GBP reviews, star ratings, local insights (calls, direction requests, website clicks).",
    authType: "oauth",
    color: "bg-blue-500",
    supportsMultiple: false,
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
    description: "Backlink analysis, keyword rankings, domain rating, and competitor visibility via the Ahrefs API.",
    authType: "api_key",
    color: "bg-indigo-600",
    supportsMultiple: false,
    credentialFields: [
      { key: "api_key", label: "API Token", placeholder: "Enter Ahrefs API token", type: "password" },
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
  {
    id: "nimbata",
    name: "Nimbata",
    description: "Call tracking & analytics: calls, sources, recordings, attribution. Used by Williamsburg House.",
    authType: "api_key",
    color: "bg-violet-600",
    supportsMultiple: true,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter Nimbata API key", type: "password" },
    ],
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Work log tracking. Connect your Airtable base to pull work-completed items into reports by category.",
    authType: "api_key",
    color: "bg-cyan-700",
    supportsMultiple: false,
    credentialFields: [
      { key: "personal_access_token", label: "Personal Access Token", placeholder: "patXXXXXXXXXXXXXX", type: "password" },
    ],
  },
];
