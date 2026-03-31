import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, serial, index, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Auth / User System ───────────────────────────────────────────────────────

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATES = ["active", "suspended", "first_login_required", "password_reset_required"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const MODULE_KEYS = [
  "ama",
  "prepare_report",
  "past_reports",
  "client_info",
  "client_integrations",
  "integrations",
  "discoverability_tool",
  "templates",
  "theme",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const REPORT_SUB_KEYS = [
  "biweekly",
  "monthly",
  "qbr_prep",
  "qbr_full",
  "mid_strategy",
  "quarterly_content_roadmap",
] as const;
export type ReportSubKey = (typeof REPORT_SUB_KEYS)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<UserRole>().default("user"),
  accountState: text("account_state").notNull().$type<AccountState>().default("first_login_required"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: integer("suspended_by"),
  createdBy: integer("created_by"),
  lastLoginAt: timestamp("last_login_at"),
  tempCredentialBlock: text("temp_credential_block"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_email_idx").on(t.email),
]);

export const userSessions = pgTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  invalidatedAt: timestamp("invalidated_at"),
});

export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  module: text("module").notNull().$type<ModuleKey>(),
}, (t) => [
  uniqueIndex("user_permissions_unique_idx").on(t.userId, t.module),
]);

export const userReportPermissions = pgTable("user_report_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportSubKey: text("report_sub_key").notNull().$type<ReportSubKey>(),
}, (t) => [
  uniqueIndex("user_report_perms_unique_idx").on(t.userId, t.reportSubKey),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  suspendedAt: true,
});

export type UserSession = typeof userSessions.$inferSelect;
export type UserPermission = typeof userPermissions.$inferSelect;
export type UserReportPermission = typeof userReportPermissions.$inferSelect;

export interface UserWithPermissions extends User {
  modules: ModuleKey[];
  reportSubKeys: ReportSubKey[];
}

export type SafeUser = Omit<User, "passwordHash"> & {
  modules: ModuleKey[];
  reportSubKeys: ReportSubKey[];
};

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
  attentionAccountId: text("attention_account_id"),
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
  primaryGoal: text("primary_goal"),
  aboutPageUrl: text("about_page_url"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  slackChannelId: text("slack_channel_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clientCompetitors = pgTable("client_competitors", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  url: text("url").notNull().default(""),
  ordinal: integer("ordinal").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientCompetitorSchema = createInsertSchema(clientCompetitors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ClientCompetitor = typeof clientCompetitors.$inferSelect;
export type InsertClientCompetitor = z.infer<typeof insertClientCompetitorSchema>;

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

// ─── Report Schedules ─────────────────────────────────────────────────────────

export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull().default("biweekly"),
  recurrenceDay: integer("recurrence_day").notNull().default(1),
  recurrenceHour: integer("recurrence_hour").notNull().default(8),
  timezone: text("timezone").notNull().default("America/New_York"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("report_schedules_client_idx").on(t.clientId),
  index("report_schedules_next_run_idx").on(t.nextRunAt),
]);

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
});

export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;

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
  isScheduled: boolean("is_scheduled").notNull().default(false),
  scheduleId: integer("schedule_id"),
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

export const reportComments = pgTable("report_comments", {
  id: serial("id").primaryKey(),
  reportType: text("report_type").notNull(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  savedReportId: integer("saved_report_id").references(() => savedReports.id, { onDelete: "cascade" }),
  anchorId: text("anchor_id").notNull().default("report"),
  anchorLabel: text("anchor_label"),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => reportComments.id, { onDelete: "cascade" }),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("report_comments_saved_idx").on(t.savedReportId),
  index("report_comments_type_client_idx").on(t.reportType, t.clientId),
  index("report_comments_parent_idx").on(t.parentId),
]);

export const insertReportCommentSchema = createInsertSchema(reportComments).omit({
  id: true,
  createdAt: true,
});

export const updateReportCommentSchema = z.object({
  body: z.string().min(1).optional(),
  resolved: z.boolean().optional(),
});

export type ReportComment = typeof reportComments.$inferSelect;
export type InsertReportComment = z.infer<typeof insertReportCommentSchema>;

// ─── Admin Guidance ───────────────────────────────────────────────────────────

export const GUIDANCE_STATUSES = ["draft", "active", "archived"] as const;
export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

export const adminGuidance = pgTable("admin_guidance", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  reportType: varchar("report_type", { length: 64 }),
  workflowArea: varchar("workflow_area", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdminGuidanceSchema = createInsertSchema(adminGuidance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAdminGuidanceSchema = insertAdminGuidanceSchema.partial();

export type AdminGuidance = typeof adminGuidance.$inferSelect;
export type InsertAdminGuidance = z.infer<typeof insertAdminGuidanceSchema>;
export type UpdateAdminGuidance = z.infer<typeof updateAdminGuidanceSchema>;

// ─── Admin Config Overrides ──────────────────────────────────────────────────
// Stores admin-editable annotations on top of code-driven config objects.
// Structural keys (IDs, routes, field names) remain code-only; only safe
// metadata fields (notes, descriptions, labels) are stored here.
//
// Namespace values:  "reportType" | "fieldMap" | "qbsMap"
// Field values:      "note"  (currently the only editable field)
// ItemKey examples:  "biweekly" | "monthly:amThoughts" | "amFocusNextQuarter"
//
// Fallback behavior: if no override exists, the calling code uses the
// code-defined default value (displayName, sourceHint, etc.).

export const adminConfigOverrides = pgTable("admin_config_overrides", {
  id: serial("id").primaryKey(),
  namespace: varchar("namespace", { length: 64 }).notNull(),
  itemKey: varchar("item_key", { length: 128 }).notNull(),
  field: varchar("field", { length: 64 }).notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdminConfigOverrideSchema = z.object({
  namespace: z.string().min(1).max(64),
  itemKey: z.string().min(1).max(128),
  field: z.string().min(1).max(64),
  value: z.string(),
});

export type AdminConfigOverride = typeof adminConfigOverrides.$inferSelect;
export type InsertAdminConfigOverride = z.infer<typeof insertAdminConfigOverrideSchema>;

// ─── Report Template Sections ────────────────────────────────────────────────
// Stores admin overrides for report section structure.
// sectionKey is ALWAYS code-defined and immutable — only safe surface fields
// (label, enabled, order, helperCopy) are stored here.
// Null fields mean "use the code-defined default" — rows are only created when
// an admin has explicitly overridden at least one field.

export const reportTemplateSections = pgTable("report_template_sections", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type", { length: 32 }).notNull(),
  sectionKey: varchar("section_key", { length: 64 }).notNull(),
  sectionLabel: varchar("section_label", { length: 120 }),
  enabled: boolean("enabled"),
  displayOrder: integer("display_order"),
  helperCopy: text("helper_copy"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReportTemplateSectionSchema = z.object({
  reportType: z.string().min(1).max(32),
  sectionKey: z.string().min(1).max(64),
  sectionLabel: z.string().max(120).nullable().optional(),
  enabled: z.boolean().nullable().optional(),
  displayOrder: z.number().int().nullable().optional(),
  helperCopy: z.string().nullable().optional(),
});

export type ReportTemplateSection = typeof reportTemplateSections.$inferSelect;
export type InsertReportTemplateSection = z.infer<typeof insertReportTemplateSectionSchema>;

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
  supportingDocumentMimeType?: string | null;
  supportingDocumentSizeBytes?: number | null;
  supportingDocumentUploadedAt?: string | null;
}

export const ALLOWED_GAP_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

export const MAX_GAP_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_URL_SCHEMES = ["http:", "https:"] as const;

export const GAP_CONTEXT_FIELD_LABELS: Record<string, string> = {
  sentimentContext: "Sentiment framing",
  businessChanges: "Business context",
  trackingNotes: "Tracking notes",
  priorityContext: "Priority framing",
  blockers: "Blockers / dependencies",
  narrativeNotes: "Report narrative",
  competitorContext: "Competitive context",
  conversionContext: "Conversion context",
};

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
  seoHqLoadStatus: text("seo_hq_load_status"),
  answerUsageJson: jsonb("answer_usage_json"),
  linkedReportId: integer("linked_report_id"),
  linkedReportType: text("linked_report_type"),
  generatedOn: text("generated_on").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("gap_sessions_client_idx").on(t.clientId),
]);

export type GapAnalysisSession = typeof gapAnalysisSessions.$inferSelect;

// ─── End Fill in the Gaps ────────────────────────────────────────────────────

// ─── Finding History (Cross-Period Memory) ────────────────────────────────────

export const findingHistory = pgTable("finding_history", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  areaId: varchar("area_id", { length: 100 }).notNull(),
  bodyHash: varchar("body_hash", { length: 8 }).notNull(),
  body: text("body").notNull(),
  bucket: varchar("bucket", { length: 30 }),
  executionStatus: varchar("execution_status", { length: 30 }),
  linkedRefTitle: varchar("linked_ref_title", { length: 255 }),
  periodLabel: varchar("period_label", { length: 200 }),
  seenAt: timestamp("seen_at").defaultNow().notNull(),
}, (t) => [
  index("finding_history_client_type_idx").on(t.clientId, t.reportType),
  index("finding_history_client_area_idx").on(t.clientId, t.reportType, t.areaId),
]);

export const insertFindingHistorySchema = createInsertSchema(findingHistory).omit({
  id: true,
  seenAt: true,
});

export type FindingHistory = typeof findingHistory.$inferSelect;
export type InsertFindingHistory = z.infer<typeof insertFindingHistorySchema>;

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
  "attention",
  "airtable",
  "asana",
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
  "ctm_qoq_sources",
  "attention_recent_conversations",
  "attention_call_summary",
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
  authType: "oauth" | "api_key" | "desktop" | "replit_connector";
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
    id: "attention",
    name: "Attention",
    description: "AI conversation intelligence: call recordings, transcripts, sentiment analysis, action items, and AI summaries of sales calls.",
    authType: "api_key",
    color: "bg-indigo-600",
    supportsMultiple: false,
    credentialFields: [
      { key: "api_key", label: "API Key", placeholder: "Enter Attention API key", type: "password" },
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
  {
    id: "asana",
    name: "Asana",
    description: "Project and task tracking. Pull completed work items from Asana into reports to document SEO activities.",
    authType: "replit_connector",
    color: "bg-rose-500",
    supportsMultiple: false,
    credentialFields: [],
  },
];

// ─── Mid-Strategy Evaluation Sheets ──────────────────────────────────────────

export const EVAL_BATCH_STATUSES = ["draft", "ready", "linked", "archived"] as const;
export type EvalBatchStatus = typeof EVAL_BATCH_STATUSES[number];

export const evalBatches = pgTable("eval_batches", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  clientNameSnapshot: text("client_name_snapshot").notNull().default(""),
  evaluationName: text("evaluation_name").notNull(),
  evaluationDate: text("evaluation_date").notNull(),
  preparedBy: text("prepared_by").notNull().default(""),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  linkedMidStrategyDeckId: integer("linked_mid_strategy_deck_id"),
  categoryRules: jsonb("category_rules"),
  crawlUploadId: integer("crawl_upload_id"),
  dataSourcesUsed: text("data_sources_used").array().default(sql`'{}'::text[]`),
  enrichmentStatus: text("enrichment_status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("eval_batches_client_idx").on(t.clientId),
]);

export const insertEvalBatchSchema = createInsertSchema(evalBatches).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type EvalBatch = typeof evalBatches.$inferSelect;
export type InsertEvalBatch = z.infer<typeof insertEvalBatchSchema>;

// Competitor rows in the Main Evaluation sheet
export const evalCompetitorRows = pgTable("eval_competitor_rows", {
  id: serial("id").primaryKey(),
  evalBatchId: integer("eval_batch_id").notNull().references(() => evalBatches.id, { onDelete: "cascade" }),
  rowOrder: integer("row_order").notNull().default(0),
  isClient: boolean("is_client").notNull().default(false),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull().default(""),
  // Raw metrics (stored as strings to handle dashes/MNE/formatted numbers)
  metrics: jsonb("metrics").notNull().default({}),
  // Computed/derived metrics
  computed: jsonb("computed").notNull().default({}),
  // Rank columns (per-metric rank within this batch)
  ranks: jsonb("ranks").notNull().default({}),
  // Source traceability: which tool provided each metric
  sourceTrace: jsonb("source_trace").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("eval_competitor_rows_batch_idx").on(t.evalBatchId),
]);

export const insertEvalCompetitorRowSchema = createInsertSchema(evalCompetitorRows).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type EvalCompetitorRow = typeof evalCompetitorRows.$inferSelect;
export type InsertEvalCompetitorRow = z.infer<typeof insertEvalCompetitorRowSchema>;

// Crawl data rows (from Screaming Frog upload or future crawl engine)
export const evalCrawlRows = pgTable("eval_crawl_rows", {
  id: serial("id").primaryKey(),
  evalBatchId: integer("eval_batch_id").notNull().references(() => evalBatches.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  pageCategory: text("page_category").notNull().default("Other"),
  manualCategoryOverride: text("manual_category_override"),
  tier: text("tier"),
  // All crawl fields stored in flexible JSON
  crawlFields: jsonb("crawl_fields").notNull().default({}),
  // Performance fields from GSC/GA4
  performanceFields: jsonb("performance_fields").notNull().default({}),
  // Source: "screaming_frog_upload" | "enriched_gsc" | "enriched_ga4" | "enriched_ahrefs"
  dataSource: text("data_source").notNull().default("screaming_frog_upload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("eval_crawl_rows_batch_idx").on(t.evalBatchId),
  index("eval_crawl_rows_batch_url_idx").on(t.evalBatchId, t.url),
]);

export type EvalCrawlRow = typeof evalCrawlRows.$inferSelect;

// Derived summary tables: Pivot Table 2, Clicks Distribution, Traffic Distribution
export const evalSummaryRows = pgTable("eval_summary_rows", {
  id: serial("id").primaryKey(),
  evalBatchId: integer("eval_batch_id").notNull().references(() => evalBatches.id, { onDelete: "cascade" }),
  tableType: varchar("table_type", { length: 32 }).notNull(), // "pivot2" | "clicks_dist" | "traffic_dist"
  rowOrder: integer("row_order").notNull().default(0),
  category: text("category").notNull(),
  data: jsonb("data").notNull().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("eval_summary_rows_batch_type_idx").on(t.evalBatchId, t.tableType),
]);

export type EvalSummaryRow = typeof evalSummaryRows.$inferSelect;

// Source import tracking
export const evalSourceImports = pgTable("eval_source_imports", {
  id: serial("id").primaryKey(),
  evalBatchId: integer("eval_batch_id").notNull().references(() => evalBatches.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 64 }).notNull(), // "screaming_frog_upload" | "ahrefs_pull" | "semrush_pull" | "gsc_pull" | "ga4_pull" | "whois_lookup" | "wayback_lookup"
  sourceTool: varchar("source_tool", { length: 64 }).notNull(),
  fileName: text("file_name"),
  uploadedAt: timestamp("uploaded_at"),
  fetchRunId: text("fetch_run_id"),
  parseStatus: varchar("parse_status", { length: 32 }).notNull().default("pending"), // "pending" | "success" | "failed" | "partial"
  enrichmentStatus: varchar("enrichment_status", { length: 32 }).notNull().default("pending"),
  rowCount: integer("row_count").notNull().default(0),
  rawPayload: jsonb("raw_payload"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("eval_source_imports_batch_idx").on(t.evalBatchId),
]);

export type EvalSourceImport = typeof evalSourceImports.$inferSelect;

// Mid-Strategy Deck records (the generated slide deck, linked to eval batch)
export const MID_STRATEGY_DECK_STATUSES = ["not_generated", "draft", "finalized"] as const;
export type MidStrategyDeckStatus = typeof MID_STRATEGY_DECK_STATUSES[number];

export const midStrategyDecks = pgTable("mid_strategy_decks", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  evalBatchId: integer("eval_batch_id").references(() => evalBatches.id, { onDelete: "set null" }),
  reportName: text("report_name").notNull(),
  reportStatus: varchar("report_status", { length: 32 }).notNull().default("not_generated"),
  reportDate: text("report_date").notNull(),
  preparedBy: text("prepared_by").notNull().default(""),
  slidesJson: jsonb("slides_json"),
  editsJson: jsonb("edits_json"),
  iaStructureJson: jsonb("ia_structure_json"), // IA nav/blueprint data
  slideContentJson: jsonb("slide_content_json"), // generated slide content/narrative
  exportPayload: jsonb("export_payload"),
  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("mid_strategy_decks_client_idx").on(t.clientId),
  index("mid_strategy_decks_eval_idx").on(t.evalBatchId),
]);

export const insertMidStrategyDeckSchema = createInsertSchema(midStrategyDecks).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type MidStrategyDeck = typeof midStrategyDecks.$inferSelect;
export type InsertMidStrategyDeck = z.infer<typeof insertMidStrategyDeckSchema>;

// ─── Metric Registry Types ────────────────────────────────────────────────────

export interface MetricDefinition {
  metricKey: string;
  label: string;
  sourceTool: string;
  sourceType: "integration" | "derived" | "uploaded" | "web_retrieval" | "system";
  retrievalMethod?: string;
  calculationFormula?: string;
  rankDirection: "desc" | "asc"; // desc = higher is better
  refreshable: boolean;
  fallbackBehavior?: string;
  notes?: string;
}

// ─── IA Structure Types ───────────────────────────────────────────────────────

export interface IANavItem {
  id: string;
  label: string;
  slug: string;
  parentId?: string;
  order: number;
  type: "normal" | "cta" | "dropdown";
  emphasis?: string;
  visible: boolean;
  children?: IANavItem[];
}

export interface IAHubPage {
  slug: string;
  label: string;
  children: { slug: string; label: string; subChildren?: { slug: string; label: string }[] }[];
}

export interface IAStructure {
  currentNav: IANavItem[];
  futureNav: IANavItem[];
  contentHubs: IAHubPage[];
  aboutSubpages: { slug: string; label: string }[];
  resourcesSubpages: { slug: string; label: string }[];
}

// ─── Discoverability Tool (Keyword Research Engine) ──────────────────────────

export const discoverabilityWorkspaces = pgTable("discoverability_workspaces", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text("name").notNull().default("Untitled Workspace"),
  businessProfile: jsonb("business_profile"),
  clusters: jsonb("clusters").default(sql`'[]'::jsonb`),
  keywords: jsonb("keywords").default(sql`'[]'::jsonb`),
  scoringWeights: jsonb("scoring_weights"),
  internalLinkSuggestions: jsonb("internal_link_suggestions"),
  changeLog: jsonb("change_log").default(sql`'[]'::jsonb`),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("discoverability_workspaces_client_idx").on(t.clientId),
]);

export const insertDiscoverabilityWorkspaceSchema = createInsertSchema(discoverabilityWorkspaces).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type DiscoverabilityWorkspace = typeof discoverabilityWorkspaces.$inferSelect;
export type InsertDiscoverabilityWorkspace = z.infer<typeof insertDiscoverabilityWorkspaceSchema>;

// ─── AMA Conversations ────────────────────────────────────────────────────────

export const amaConversations = pgTable("ama_conversations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  clientName: text("client_name"),
  title: text("title").notNull().default("New Conversation"),
  integrations: text("integrations").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ama_conversations_created_idx").on(t.createdAt),
]);

export const amaMessages = pgTable("ama_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => amaConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  provider: text("provider"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAmaConversationSchema = createInsertSchema(amaConversations).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertAmaMessageSchema = createInsertSchema(amaMessages).omit({
  id: true, createdAt: true,
});
export type AmaConversation = typeof amaConversations.$inferSelect;
export type AmaMessage = typeof amaMessages.$inferSelect;
export type InsertAmaConversation = z.infer<typeof insertAmaConversationSchema>;
export type InsertAmaMessage = z.infer<typeof insertAmaMessageSchema>;

// ─── Theme System ─────────────────────────────────────────────────────────────

export interface BackgroundDef {
  type: "solid" | "gradient" | "none";
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientDirection: string;
  overlay: boolean;
  overlayColor: string;
  overlayOpacity: number;
}

export interface ThemeTokens {
  brandName: string;
  tagline: string;

  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;

  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  headingXL: number;
  headingLG: number;
  headingMD: number;
  headingSM: number;
  bodyLG: number;
  bodyMD: number;
  bodySM: number;

  borderRadius: number;

  backgrounds: {
    global: BackgroundDef;
    titleSlide: BackgroundDef;
    sectionDivider: BackgroundDef;
    kpiSlide: BackgroundDef;
    chartSlide: BackgroundDef;
    tableSlide: BackgroundDef;
    contentSlide: BackgroundDef;
    summarySlide: BackgroundDef;
  };

  tableHeaderBg: string;
  tableHeaderText: string;
  tableAltRowBg: string;
  tableBorderColor: string;
  tableBodyText: string;

  cardBg: string;
  cardBorderColor: string;
  calloutBg: string;
  calloutBorderColor: string;
  calloutText: string;

  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
  headerColor: string;
  footerColor: string;
  headerTextColor: string;
  footerTextColor: string;
}

const defaultBg = (type: "solid" | "gradient" | "none", solidColor: string, from?: string, to?: string): BackgroundDef => ({
  type,
  solidColor,
  gradientFrom: from ?? solidColor,
  gradientTo: to ?? solidColor,
  gradientDirection: "135deg",
  overlay: false,
  overlayColor: "#000000",
  overlayOpacity: 0.3,
});

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  brandName: "Webserv",
  tagline: "SEO Performance Report",

  primaryColor: "#1B3A6B",
  secondaryColor: "#C0392B",
  accentColor: "#0891B2",
  successColor: "#059669",
  warningColor: "#D97706",
  errorColor: "#DC2626",

  headingFont: "Montserrat",
  bodyFont: "Inter",
  headingWeight: 700,
  headingXL: 28,
  headingLG: 22,
  headingMD: 18,
  headingSM: 14,
  bodyLG: 14,
  bodyMD: 12,
  bodySM: 11,

  borderRadius: 8,

  backgrounds: {
    global: defaultBg("solid", "#FFFFFF"),
    titleSlide: defaultBg("gradient", "#1B3A6B", "#1B3A6B", "#2A5298"),
    sectionDivider: defaultBg("solid", "#1B3A6B"),
    kpiSlide: defaultBg("solid", "#FFFFFF"),
    chartSlide: defaultBg("solid", "#FFFFFF"),
    tableSlide: defaultBg("solid", "#FFFFFF"),
    contentSlide: defaultBg("solid", "#FFFFFF"),
    summarySlide: defaultBg("gradient", "#1B3A6B", "#1B3A6B", "#C0392B"),
  },

  tableHeaderBg: "#1B3A6B",
  tableHeaderText: "#FFFFFF",
  tableAltRowBg: "#F8FAFC",
  tableBorderColor: "#E2E8F0",
  tableBodyText: "#1E293B",

  cardBg: "#FFFFFF",
  cardBorderColor: "#E2E8F0",
  calloutBg: "#EFF6FF",
  calloutBorderColor: "#1B3A6B",
  calloutText: "#1E293B",

  showHeader: true,
  showFooter: true,
  showPageNumbers: true,
  headerColor: "#1B3A6B",
  footerColor: "#F8FAFC",
  headerTextColor: "#FFFFFF",
  footerTextColor: "#64748B",
};

export const themes = pgTable("themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  tokens: jsonb("tokens").notNull().$type<ThemeTokens>(),
  draftTokens: jsonb("draft_tokens").$type<ThemeTokens>(),
  hasDraft: boolean("has_draft").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Theme = typeof themes.$inferSelect;
export type InsertTheme = typeof themes.$inferInsert;

// ─── Slide / Page Type Library ────────────────────────────────────────────────

export interface SlideTypeDef {
  id: string;
  label: string;
  description: string;
  category: "structure" | "data" | "content" | "layout";
  usedIn: string[];
  icon: string;
}

export const SLIDE_TYPES: SlideTypeDef[] = [
  { id: "title", label: "Title Slide", description: "Cover slide with report name, client, and period", category: "structure", usedIn: ["monthly-pptx", "qbr-pptx", "quarterly-content-roadmap"], icon: "🏛" },
  { id: "section-divider", label: "Section Divider", description: "Visual separator between major report sections", category: "structure", usedIn: ["monthly-pptx", "qbr-pptx", "quarterly-content-roadmap"], icon: "🔷" },
  { id: "kpi-summary", label: "KPI Summary", description: "Grid of performance metrics with values and deltas", category: "data", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "📊" },
  { id: "chart-bar", label: "Bar Chart", description: "Vertical or horizontal bar chart visualization", category: "data", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "📉" },
  { id: "chart-line", label: "Line Chart", description: "Trend line for performance over time", category: "data", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "📈" },
  { id: "table", label: "Data Table", description: "Structured table with headers, rows, and source badges", category: "data", usedIn: ["monthly-pptx", "qbr-pptx", "biweekly-docx"], icon: "📋" },
  { id: "two-column", label: "Two-Column Layout", description: "Split layout: data on left, insights on right", category: "layout", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "⬛" },
  { id: "bullets", label: "Bullets / Strategy", description: "Numbered or bulleted list for strategy or work log", category: "content", usedIn: ["monthly-pptx", "qbr-pptx", "quarterly-content-roadmap", "biweekly-docx"], icon: "📝" },
  { id: "roadmap", label: "Roadmap Slide", description: "Forward-looking plan with categorized initiatives", category: "content", usedIn: ["qbr-pptx", "monthly-pptx"], icon: "🗺" },
  { id: "callout", label: "Callout / Insight", description: "Highlighted insight or analyst commentary box", category: "content", usedIn: ["monthly-pptx", "qbr-pptx", "biweekly-docx"], icon: "💡" },
  { id: "scorecard", label: "Scorecard", description: "QTD or QoQ pacing table with performance targets", category: "data", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "🎯" },
  { id: "summary", label: "Closing Summary", description: "Executive closing slide with key takeaways", category: "content", usedIn: ["monthly-pptx", "qbr-pptx"], icon: "✅" },
  { id: "production-table", label: "Production Table", description: "Content deliverable table by category/month", category: "data", usedIn: ["quarterly-content-roadmap"], icon: "🗂" },
  { id: "work-log", label: "Work Log Section", description: "Two-column table: What We Did vs What's Next", category: "layout", usedIn: ["biweekly-docx"], icon: "✏️" },
];

// ─── Template Structures ──────────────────────────────────────────────────────

export interface SlideEntry {
  id: string;
  typeId: string;
  label: string;
}

export const templateStructures = pgTable("template_structures", {
  id: serial("id").primaryKey(),
  templateId: text("template_id").notNull().unique(),
  slides: jsonb("slides").notNull().$type<SlideEntry[]>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TemplateStructure = typeof templateStructures.$inferSelect;

export const DEFAULT_TEMPLATE_SLIDES: Record<string, SlideEntry[]> = {
  "monthly-pptx": [
    { id: "s1", typeId: "title", label: "Title Slide" },
    { id: "s2", typeId: "kpi-summary", label: "Performance Overview" },
    { id: "s3", typeId: "bullets", label: "Strategy Focus" },
    { id: "s4", typeId: "table", label: "Conversion Sources" },
    { id: "s5", typeId: "table", label: "Top Queries" },
    { id: "s6", typeId: "table", label: "Query Groups" },
    { id: "s7", typeId: "scorecard", label: "QTD Scorecard" },
    { id: "s8", typeId: "bullets", label: "Work Log" },
    { id: "s9", typeId: "bullets", label: "Next Steps" },
  ],
  "qbr-pptx": [
    { id: "s1", typeId: "title", label: "Title Slide" },
    { id: "s2", typeId: "kpi-summary", label: "QoQ Performance" },
    { id: "s3", typeId: "two-column", label: "Top Pages Analysis" },
    { id: "s4", typeId: "two-column", label: "Top Queries Analysis" },
    { id: "s5", typeId: "chart-bar", label: "Conversion Funnel" },
    { id: "s6", typeId: "roadmap", label: "Next Quarter Roadmap" },
    { id: "s7", typeId: "summary", label: "Closing Summary" },
  ],
  "quarterly-content-roadmap": [
    { id: "s1", typeId: "title", label: "Title Slide" },
    { id: "s2", typeId: "section-divider", label: "Month 1 Divider" },
    { id: "s3", typeId: "bullets", label: "Month 1 Strategy" },
    { id: "s4", typeId: "production-table", label: "Month 1 Production" },
    { id: "s5", typeId: "section-divider", label: "Month 2 Divider" },
    { id: "s6", typeId: "bullets", label: "Month 2 Strategy" },
    { id: "s7", typeId: "production-table", label: "Month 2 Production" },
    { id: "s8", typeId: "section-divider", label: "Month 3 Divider" },
    { id: "s9", typeId: "bullets", label: "Month 3 Strategy" },
    { id: "s10", typeId: "production-table", label: "Month 3 Production" },
  ],
  "biweekly-docx": [
    { id: "s1", typeId: "title", label: "Document Header" },
    { id: "s2", typeId: "kpi-summary", label: "Performance Pulse" },
    { id: "s3", typeId: "work-log", label: "Content Work Log" },
    { id: "s4", typeId: "work-log", label: "Optimization Work Log" },
    { id: "s5", typeId: "work-log", label: "Technical Work Log" },
    { id: "s6", typeId: "work-log", label: "Local SEO Work Log" },
    { id: "s7", typeId: "callout", label: "Technical Priorities" },
    { id: "s8", typeId: "bullets", label: "Partnership Notes" },
  ],
};
