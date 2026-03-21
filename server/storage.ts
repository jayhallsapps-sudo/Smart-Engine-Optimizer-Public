import { db } from "./db";
import { eq, and, desc, sql, isNull, gte } from "drizzle-orm";
import {
  clients,
  queryLogs,
  apiCredentials,
  sfReports,
  callTrackingReports,
  settings,
  qbrPrepReports,
  gapAnalysisSessions,
  reportComments,
  adminGuidance,
  adminConfigOverrides,
  findingHistory,
  reportTemplateSections,
  clientCompetitors,
  evalBatches,
  evalCompetitorRows,
  evalCrawlRows,
  evalSummaryRows,
  evalSourceImports,
  midStrategyDecks,
  discoverabilityWorkspaces,
  type FindingHistory,
  type InsertFindingHistory,
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
  type QbrPrepReport,
  type InsertQbrPrepReport,
  type GapAnalysisSession,
  type GapQuestion,
  type GapAnswer,
  type ReportComment,
  type InsertReportComment,
  type AdminGuidance,
  type InsertAdminGuidance,
  type UpdateAdminGuidance,
  type AdminConfigOverride,
  type InsertAdminConfigOverride,
  type ReportTemplateSection,
  type InsertReportTemplateSection,
  type ClientCompetitor,
  type EvalBatch,
  type InsertEvalBatch,
  type EvalCompetitorRow,
  type InsertEvalCompetitorRow,
  type EvalCrawlRow,
  type EvalSummaryRow,
  type EvalSourceImport,
  type MidStrategyDeck,
  type InsertMidStrategyDeck,
  type DiscoverabilityWorkspace,
  type InsertDiscoverabilityWorkspace,
  amaConversations,
  amaMessages,
  type AmaConversation,
  type AmaMessage,
} from "@shared/schema";

export interface IStorage {
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;

  getClientCompetitors(clientId: number): Promise<ClientCompetitor[]>;
  createClientCompetitor(data: { clientId: number; name: string; url: string; ordinal?: number }): Promise<ClientCompetitor>;
  updateClientCompetitor(id: number, data: { name?: string; url?: string; ordinal?: number }): Promise<ClientCompetitor | undefined>;
  deleteClientCompetitor(id: number): Promise<boolean>;
  replaceClientCompetitors(clientId: number, competitors: { name: string; url: string }[]): Promise<ClientCompetitor[]>;

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

  getQbrPrepReports(clientId: number): Promise<QbrPrepReport[]>;
  getQbrPrepReport(id: number): Promise<QbrPrepReport | undefined>;
  createQbrPrepReport(report: InsertQbrPrepReport): Promise<QbrPrepReport>;
  updateQbrPrepReport(id: number, data: Partial<InsertQbrPrepReport>): Promise<QbrPrepReport | undefined>;
  deleteQbrPrepReport(id: number): Promise<boolean>;
  getAllQbrPrepReports(): Promise<QbrPrepReport[]>;

  createGapSession(data: { clientId: number; reportType: string; questions: GapQuestion[]; seoHqChecksApplied?: string[]; seoHqLoadStatus?: string }): Promise<GapAnalysisSession>;
  updateGapSession(id: number, data: { answers?: GapAnswer[]; linkedReportId?: number; linkedReportType?: string; answerUsage?: Record<string, string> }): Promise<GapAnalysisSession | undefined>;
  getGapSession(id: number): Promise<GapAnalysisSession | undefined>;
  getGapSessionsByClient(clientId: number): Promise<GapAnalysisSession[]>;

  getReportComments(reportType: string, clientId: number | null, savedReportId: number | null): Promise<ReportComment[]>;
  createReportComment(data: InsertReportComment): Promise<ReportComment>;
  updateReportComment(id: number, data: { body?: string; resolved?: boolean }): Promise<ReportComment | undefined>;
  deleteReportComment(id: number): Promise<boolean>;

  listAdminGuidance(filters?: { reportType?: string; workflowArea?: string; status?: string }): Promise<AdminGuidance[]>;
  getAdminGuidance(id: number): Promise<AdminGuidance | undefined>;
  createAdminGuidance(data: InsertAdminGuidance): Promise<AdminGuidance>;
  updateAdminGuidance(id: number, data: UpdateAdminGuidance): Promise<AdminGuidance | undefined>;
  deleteAdminGuidance(id: number): Promise<boolean>;

  // Admin Config Overrides
  listConfigOverrides(namespace?: string): Promise<AdminConfigOverride[]>;
  upsertConfigOverride(data: InsertAdminConfigOverride): Promise<AdminConfigOverride>;
  deleteConfigOverride(id: number): Promise<boolean>;

  // Report Template Sections
  listTemplateSections(reportType?: string): Promise<ReportTemplateSection[]>;
  upsertTemplateSection(data: InsertReportTemplateSection): Promise<ReportTemplateSection>;
  deleteTemplateSection(id: number): Promise<boolean>;

  // Finding History (Cross-Period Memory)
  saveFindingHistoryBatch(rows: InsertFindingHistory[]): Promise<void>;
  queryFindingHistory(clientId: number, reportType: string): Promise<FindingHistory[]>;

  // Evaluation Batches (Mid-Strategy Evaluation Sheets)
  listEvalBatches(clientId?: number): Promise<EvalBatch[]>;
  getEvalBatch(id: number): Promise<EvalBatch | undefined>;
  createEvalBatch(data: InsertEvalBatch): Promise<EvalBatch>;
  updateEvalBatch(id: number, data: Partial<InsertEvalBatch>): Promise<EvalBatch | undefined>;
  deleteEvalBatch(id: number): Promise<boolean>;

  // Eval Competitor Rows
  getEvalCompetitorRows(evalBatchId: number): Promise<EvalCompetitorRow[]>;
  upsertEvalCompetitorRow(data: InsertEvalCompetitorRow & { id?: number }): Promise<EvalCompetitorRow>;
  deleteEvalCompetitorRow(id: number): Promise<boolean>;
  replaceEvalCompetitorRows(evalBatchId: number, rows: Omit<InsertEvalCompetitorRow, "evalBatchId">[]): Promise<EvalCompetitorRow[]>;

  // Eval Crawl Rows
  getEvalCrawlRows(evalBatchId: number): Promise<EvalCrawlRow[]>;
  bulkInsertEvalCrawlRows(rows: Omit<EvalCrawlRow, "id" | "createdAt">[]): Promise<void>;
  deleteEvalCrawlRows(evalBatchId: number): Promise<void>;
  updateEvalCrawlRowCategory(id: number, category: string): Promise<void>;
  updateEvalCrawlRowPerformance(id: number, performanceFields: any): Promise<void>;

  // Eval Summary Rows
  getEvalSummaryRows(evalBatchId: number, tableType: string): Promise<EvalSummaryRow[]>;
  replaceEvalSummaryRows(evalBatchId: number, tableType: string, rows: { category: string; data: any; notes?: string }[]): Promise<void>;

  // Eval Source Imports
  getEvalSourceImports(evalBatchId: number): Promise<EvalSourceImport[]>;
  createEvalSourceImport(data: Omit<EvalSourceImport, "id" | "createdAt">): Promise<EvalSourceImport>;
  updateEvalSourceImport(id: number, data: Partial<Omit<EvalSourceImport, "id" | "createdAt">>): Promise<void>;

  // Mid-Strategy Decks
  listMidStrategyDecks(clientId?: number): Promise<MidStrategyDeck[]>;
  getMidStrategyDeck(id: number): Promise<MidStrategyDeck | undefined>;
  createMidStrategyDeck(data: InsertMidStrategyDeck): Promise<MidStrategyDeck>;
  updateMidStrategyDeck(id: number, data: Partial<InsertMidStrategyDeck>): Promise<MidStrategyDeck | undefined>;
  deleteMidStrategyDeck(id: number): Promise<boolean>;

  // Discoverability Workspaces
  listDiscoverabilityWorkspaces(clientId?: number): Promise<DiscoverabilityWorkspace[]>;
  getDiscoverabilityWorkspace(id: number): Promise<DiscoverabilityWorkspace | undefined>;
  createDiscoverabilityWorkspace(data: InsertDiscoverabilityWorkspace): Promise<DiscoverabilityWorkspace>;
  updateDiscoverabilityWorkspace(id: number, data: Partial<InsertDiscoverabilityWorkspace>): Promise<DiscoverabilityWorkspace | undefined>;
  deleteDiscoverabilityWorkspace(id: number): Promise<boolean>;

  // AMA Conversations
  listAmaConversations(clientId?: number | null): Promise<AmaConversation[]>;
  getAmaConversation(id: number): Promise<AmaConversation | undefined>;
  createAmaConversation(data: { clientId?: number | null; clientName?: string | null; title: string; integrations?: string[] }): Promise<AmaConversation>;
  updateAmaConversation(id: number, data: { title?: string }): Promise<AmaConversation | undefined>;
  deleteAmaConversation(id: number): Promise<boolean>;
  getAmaMessages(conversationId: number): Promise<AmaMessage[]>;
  addAmaMessage(data: { conversationId: number; role: string; content: string; toolCalls?: any; provider?: string }): Promise<AmaMessage>;
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

  async getClientCompetitors(clientId: number): Promise<ClientCompetitor[]> {
    return db
      .select()
      .from(clientCompetitors)
      .where(eq(clientCompetitors.clientId, clientId))
      .orderBy(clientCompetitors.ordinal, clientCompetitors.createdAt);
  }

  async createClientCompetitor(data: { clientId: number; name: string; url: string; ordinal?: number }): Promise<ClientCompetitor> {
    const [created] = await db.insert(clientCompetitors).values({
      clientId: data.clientId,
      name: data.name,
      url: data.url,
      ordinal: data.ordinal ?? 0,
    }).returning();
    return created;
  }

  async updateClientCompetitor(id: number, data: { name?: string; url?: string; ordinal?: number }): Promise<ClientCompetitor | undefined> {
    const [updated] = await db
      .update(clientCompetitors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientCompetitors.id, id))
      .returning();
    return updated;
  }

  async deleteClientCompetitor(id: number): Promise<boolean> {
    const result = await db.delete(clientCompetitors).where(eq(clientCompetitors.id, id)).returning();
    return result.length > 0;
  }

  async replaceClientCompetitors(clientId: number, competitors: { name: string; url: string }[]): Promise<ClientCompetitor[]> {
    await db.delete(clientCompetitors).where(eq(clientCompetitors.clientId, clientId));
    if (competitors.length === 0) return [];
    const rows = await db.insert(clientCompetitors).values(
      competitors.map((c, i) => ({ clientId, name: c.name, url: c.url, ordinal: i }))
    ).returning();
    return rows;
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

  async getQbrPrepReports(clientId: number): Promise<QbrPrepReport[]> {
    return db
      .select()
      .from(qbrPrepReports)
      .where(eq(qbrPrepReports.clientId, clientId))
      .orderBy(desc(qbrPrepReports.createdAt));
  }

  async getQbrPrepReport(id: number): Promise<QbrPrepReport | undefined> {
    const [row] = await db.select().from(qbrPrepReports).where(eq(qbrPrepReports.id, id));
    return row;
  }

  async createQbrPrepReport(report: InsertQbrPrepReport): Promise<QbrPrepReport> {
    const [created] = await db.insert(qbrPrepReports).values(report).returning();
    return created;
  }

  async updateQbrPrepReport(id: number, data: Partial<InsertQbrPrepReport>): Promise<QbrPrepReport | undefined> {
    const [updated] = await db
      .update(qbrPrepReports)
      .set({ ...data, updatedAt: new Date(), lastSavedAt: new Date() })
      .where(eq(qbrPrepReports.id, id))
      .returning();
    return updated;
  }

  async deleteQbrPrepReport(id: number): Promise<boolean> {
    const result = await db.delete(qbrPrepReports).where(eq(qbrPrepReports.id, id)).returning();
    return result.length > 0;
  }

  async getAllQbrPrepReports(): Promise<QbrPrepReport[]> {
    return db.select().from(qbrPrepReports).orderBy(desc(qbrPrepReports.createdAt));
  }

  async createGapSession(data: { clientId: number; reportType: string; questions: GapQuestion[]; seoHqChecksApplied?: string[]; seoHqLoadStatus?: string }): Promise<GapAnalysisSession> {
    const [session] = await db.insert(gapAnalysisSessions).values({
      clientId: data.clientId,
      reportType: data.reportType,
      questionsJson: data.questions as any,
      seoHqChecksApplied: data.seoHqChecksApplied ?? [],
      seoHqLoadStatus: data.seoHqLoadStatus ?? null,
      generatedOn: new Date().toISOString(),
    }).returning();
    return session;
  }

  async updateGapSession(id: number, data: { answers?: GapAnswer[]; linkedReportId?: number; linkedReportType?: string; answerUsage?: Record<string, string> }): Promise<GapAnalysisSession | undefined> {
    const updateData: Record<string, any> = {};
    if (data.answers !== undefined) updateData.answersJson = data.answers;
    if (data.linkedReportId !== undefined) updateData.linkedReportId = data.linkedReportId;
    if (data.linkedReportType !== undefined) updateData.linkedReportType = data.linkedReportType;
    if (data.answerUsage !== undefined) updateData.answerUsageJson = data.answerUsage;
    const [updated] = await db.update(gapAnalysisSessions).set(updateData).where(eq(gapAnalysisSessions.id, id)).returning();
    return updated;
  }

  async getGapSession(id: number): Promise<GapAnalysisSession | undefined> {
    const [session] = await db.select().from(gapAnalysisSessions).where(eq(gapAnalysisSessions.id, id));
    return session;
  }

  async getGapSessionsByClient(clientId: number): Promise<GapAnalysisSession[]> {
    return db
      .select()
      .from(gapAnalysisSessions)
      .where(eq(gapAnalysisSessions.clientId, clientId))
      .orderBy(desc(gapAnalysisSessions.createdAt));
  }

  async getReportComments(reportType: string, clientId: number | null, savedReportId: number | null): Promise<ReportComment[]> {
    if (savedReportId !== null) {
      return db
        .select()
        .from(reportComments)
        .where(eq(reportComments.savedReportId, savedReportId))
        .orderBy(reportComments.createdAt);
    }
    const conditions = [
      eq(reportComments.reportType, reportType),
      isNull(reportComments.savedReportId),
    ];
    if (clientId !== null) {
      conditions.push(eq(reportComments.clientId, clientId));
    }
    return db
      .select()
      .from(reportComments)
      .where(and(...conditions))
      .orderBy(reportComments.createdAt);
  }

  async createReportComment(data: InsertReportComment): Promise<ReportComment> {
    const [created] = await db.insert(reportComments).values(data).returning();
    return created;
  }

  async updateReportComment(id: number, data: { body?: string; resolved?: boolean }): Promise<ReportComment | undefined> {
    const [updated] = await db
      .update(reportComments)
      .set(data)
      .where(eq(reportComments.id, id))
      .returning();
    return updated;
  }

  async deleteReportComment(id: number): Promise<boolean> {
    const result = await db.delete(reportComments).where(eq(reportComments.id, id)).returning();
    return result.length > 0;
  }

  async listAdminGuidance(filters?: { reportType?: string; workflowArea?: string; status?: string }): Promise<AdminGuidance[]> {
    let query = db.select().from(adminGuidance).$dynamic();
    const conditions = [];
    if (filters?.reportType) conditions.push(eq(adminGuidance.reportType, filters.reportType));
    if (filters?.workflowArea) conditions.push(eq(adminGuidance.workflowArea, filters.workflowArea));
    if (filters?.status) conditions.push(eq(adminGuidance.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(adminGuidance.updatedAt));
  }

  async getAdminGuidance(id: number): Promise<AdminGuidance | undefined> {
    const [row] = await db.select().from(adminGuidance).where(eq(adminGuidance.id, id));
    return row;
  }

  async createAdminGuidance(data: InsertAdminGuidance): Promise<AdminGuidance> {
    const [created] = await db.insert(adminGuidance).values(data).returning();
    return created;
  }

  async updateAdminGuidance(id: number, data: UpdateAdminGuidance): Promise<AdminGuidance | undefined> {
    const [updated] = await db
      .update(adminGuidance)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminGuidance.id, id))
      .returning();
    return updated;
  }

  async deleteAdminGuidance(id: number): Promise<boolean> {
    const result = await db.delete(adminGuidance).where(eq(adminGuidance.id, id)).returning();
    return result.length > 0;
  }

  // ── Admin Config Overrides ──────────────────────────────────────────────────

  async listConfigOverrides(namespace?: string): Promise<AdminConfigOverride[]> {
    let query = db.select().from(adminConfigOverrides).$dynamic();
    if (namespace) query = query.where(eq(adminConfigOverrides.namespace, namespace));
    return query.orderBy(adminConfigOverrides.namespace, adminConfigOverrides.itemKey);
  }

  async upsertConfigOverride(data: InsertAdminConfigOverride): Promise<AdminConfigOverride> {
    const { namespace, itemKey, field, value } = data;
    const [existing] = await db.select().from(adminConfigOverrides)
      .where(and(
        eq(adminConfigOverrides.namespace, namespace),
        eq(adminConfigOverrides.itemKey, itemKey),
        eq(adminConfigOverrides.field, field),
      )).limit(1);

    if (existing) {
      const [updated] = await db.update(adminConfigOverrides)
        .set({ value, updatedAt: new Date() })
        .where(eq(adminConfigOverrides.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(adminConfigOverrides)
        .values({ namespace, itemKey, field, value })
        .returning();
      return inserted;
    }
  }

  async deleteConfigOverride(id: number): Promise<boolean> {
    const result = await db.delete(adminConfigOverrides)
      .where(eq(adminConfigOverrides.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Report Template Sections ───────────────────────────────────────────────

  async listTemplateSections(reportType?: string): Promise<ReportTemplateSection[]> {
    let query = db.select().from(reportTemplateSections).$dynamic();
    if (reportType) query = query.where(eq(reportTemplateSections.reportType, reportType));
    return query.orderBy(reportTemplateSections.reportType, reportTemplateSections.displayOrder, reportTemplateSections.sectionKey);
  }

  async upsertTemplateSection(data: InsertReportTemplateSection): Promise<ReportTemplateSection> {
    const { reportType, sectionKey, ...fields } = data;
    const [existing] = await db.select().from(reportTemplateSections)
      .where(and(
        eq(reportTemplateSections.reportType, reportType),
        eq(reportTemplateSections.sectionKey, sectionKey),
      )).limit(1);

    if (existing) {
      const [updated] = await db.update(reportTemplateSections)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(reportTemplateSections.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(reportTemplateSections)
        .values({ reportType, sectionKey, ...fields })
        .returning();
      return inserted;
    }
  }

  async deleteTemplateSection(id: number): Promise<boolean> {
    const result = await db.delete(reportTemplateSections)
      .where(eq(reportTemplateSections.id, id))
      .returning();
    return result.length > 0;
  }

  async saveFindingHistoryBatch(rows: InsertFindingHistory[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(findingHistory).values(rows);
  }

  async queryFindingHistory(clientId: number, reportType: string): Promise<FindingHistory[]> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return db
      .select()
      .from(findingHistory)
      .where(
        and(
          eq(findingHistory.clientId, clientId),
          eq(findingHistory.reportType, reportType),
          gte(findingHistory.seenAt, sixMonthsAgo),
        ),
      )
      .orderBy(desc(findingHistory.seenAt));
  }

  // ─── Evaluation Batches ──────────────────────────────────────────────────────

  async listEvalBatches(clientId?: number): Promise<EvalBatch[]> {
    if (clientId !== undefined) {
      return db.select().from(evalBatches).where(eq(evalBatches.clientId, clientId)).orderBy(desc(evalBatches.createdAt));
    }
    return db.select().from(evalBatches).orderBy(desc(evalBatches.createdAt));
  }

  async getEvalBatch(id: number): Promise<EvalBatch | undefined> {
    const [row] = await db.select().from(evalBatches).where(eq(evalBatches.id, id)).limit(1);
    return row;
  }

  async createEvalBatch(data: InsertEvalBatch): Promise<EvalBatch> {
    const [row] = await db.insert(evalBatches).values(data).returning();
    return row;
  }

  async updateEvalBatch(id: number, data: Partial<InsertEvalBatch>): Promise<EvalBatch | undefined> {
    const [row] = await db.update(evalBatches).set({ ...data, updatedAt: new Date() }).where(eq(evalBatches.id, id)).returning();
    return row;
  }

  async deleteEvalBatch(id: number): Promise<boolean> {
    const res = await db.delete(evalBatches).where(eq(evalBatches.id, id));
    return (res.rowCount ?? 0) > 0;
  }

  // ─── Eval Competitor Rows ────────────────────────────────────────────────────

  async getEvalCompetitorRows(evalBatchId: number): Promise<EvalCompetitorRow[]> {
    return db.select().from(evalCompetitorRows).where(eq(evalCompetitorRows.evalBatchId, evalBatchId)).orderBy(evalCompetitorRows.rowOrder);
  }

  async upsertEvalCompetitorRow(data: InsertEvalCompetitorRow & { id?: number }): Promise<EvalCompetitorRow> {
    if (data.id) {
      const { id, ...rest } = data;
      const [row] = await db.update(evalCompetitorRows).set({ ...rest, updatedAt: new Date() }).where(eq(evalCompetitorRows.id, id)).returning();
      return row;
    }
    const [row] = await db.insert(evalCompetitorRows).values(data).returning();
    return row;
  }

  async deleteEvalCompetitorRow(id: number): Promise<boolean> {
    const res = await db.delete(evalCompetitorRows).where(eq(evalCompetitorRows.id, id));
    return (res.rowCount ?? 0) > 0;
  }

  async replaceEvalCompetitorRows(evalBatchId: number, rows: Omit<InsertEvalCompetitorRow, "evalBatchId">[]): Promise<EvalCompetitorRow[]> {
    await db.delete(evalCompetitorRows).where(eq(evalCompetitorRows.evalBatchId, evalBatchId));
    if (!rows.length) return [];
    const toInsert = rows.map((r, i) => ({ ...r, evalBatchId, rowOrder: i }));
    return db.insert(evalCompetitorRows).values(toInsert).returning();
  }

  // ─── Eval Crawl Rows ─────────────────────────────────────────────────────────

  async getEvalCrawlRows(evalBatchId: number): Promise<EvalCrawlRow[]> {
    return db.select().from(evalCrawlRows).where(eq(evalCrawlRows.evalBatchId, evalBatchId)).orderBy(evalCrawlRows.id);
  }

  async bulkInsertEvalCrawlRows(rows: Omit<EvalCrawlRow, "id" | "createdAt">[]): Promise<void> {
    if (!rows.length) return;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(evalCrawlRows).values(rows.slice(i, i + CHUNK) as any);
    }
  }

  async deleteEvalCrawlRows(evalBatchId: number): Promise<void> {
    await db.delete(evalCrawlRows).where(eq(evalCrawlRows.evalBatchId, evalBatchId));
  }

  async updateEvalCrawlRowCategory(id: number, category: string): Promise<void> {
    await db.update(evalCrawlRows).set({ manualCategoryOverride: category, pageCategory: category }).where(eq(evalCrawlRows.id, id));
  }

  async updateEvalCrawlRowPerformance(id: number, performanceFields: any): Promise<void> {
    await db.update(evalCrawlRows).set({ performanceFields }).where(eq(evalCrawlRows.id, id));
  }

  // ─── Eval Summary Rows ───────────────────────────────────────────────────────

  async getEvalSummaryRows(evalBatchId: number, tableType: string): Promise<EvalSummaryRow[]> {
    return db.select().from(evalSummaryRows)
      .where(and(eq(evalSummaryRows.evalBatchId, evalBatchId), eq(evalSummaryRows.tableType, tableType)))
      .orderBy(evalSummaryRows.rowOrder);
  }

  async replaceEvalSummaryRows(evalBatchId: number, tableType: string, rows: { category: string; data: any; notes?: string }[]): Promise<void> {
    await db.delete(evalSummaryRows).where(and(eq(evalSummaryRows.evalBatchId, evalBatchId), eq(evalSummaryRows.tableType, tableType)));
    if (!rows.length) return;
    await db.insert(evalSummaryRows).values(rows.map((r, i) => ({ evalBatchId, tableType, rowOrder: i, category: r.category, data: r.data, notes: r.notes ?? null })));
  }

  // ─── Eval Source Imports ─────────────────────────────────────────────────────

  async getEvalSourceImports(evalBatchId: number): Promise<EvalSourceImport[]> {
    return db.select().from(evalSourceImports).where(eq(evalSourceImports.evalBatchId, evalBatchId)).orderBy(desc(evalSourceImports.createdAt));
  }

  async createEvalSourceImport(data: Omit<EvalSourceImport, "id" | "createdAt">): Promise<EvalSourceImport> {
    const [row] = await db.insert(evalSourceImports).values(data as any).returning();
    return row;
  }

  async updateEvalSourceImport(id: number, data: Partial<Omit<EvalSourceImport, "id" | "createdAt">>): Promise<void> {
    await db.update(evalSourceImports).set(data as any).where(eq(evalSourceImports.id, id));
  }

  // ─── Mid-Strategy Decks ──────────────────────────────────────────────────────

  async listMidStrategyDecks(clientId?: number): Promise<MidStrategyDeck[]> {
    if (clientId !== undefined) {
      return db.select().from(midStrategyDecks).where(eq(midStrategyDecks.clientId, clientId)).orderBy(desc(midStrategyDecks.createdAt));
    }
    return db.select().from(midStrategyDecks).orderBy(desc(midStrategyDecks.createdAt));
  }

  async getMidStrategyDeck(id: number): Promise<MidStrategyDeck | undefined> {
    const [row] = await db.select().from(midStrategyDecks).where(eq(midStrategyDecks.id, id)).limit(1);
    return row;
  }

  async createMidStrategyDeck(data: InsertMidStrategyDeck): Promise<MidStrategyDeck> {
    const [row] = await db.insert(midStrategyDecks).values(data).returning();
    return row;
  }

  async updateMidStrategyDeck(id: number, data: Partial<InsertMidStrategyDeck>): Promise<MidStrategyDeck | undefined> {
    const [row] = await db.update(midStrategyDecks).set({ ...data, updatedAt: new Date() }).where(eq(midStrategyDecks.id, id)).returning();
    return row;
  }

  async deleteMidStrategyDeck(id: number): Promise<boolean> {
    const res = await db.delete(midStrategyDecks).where(eq(midStrategyDecks.id, id));
    return (res.rowCount ?? 0) > 0;
  }

  // ─── Discoverability Workspaces ──────────────────────────────────────────────

  async listDiscoverabilityWorkspaces(clientId?: number): Promise<DiscoverabilityWorkspace[]> {
    if (clientId !== undefined) {
      return db.select().from(discoverabilityWorkspaces).where(eq(discoverabilityWorkspaces.clientId, clientId)).orderBy(desc(discoverabilityWorkspaces.updatedAt));
    }
    return db.select().from(discoverabilityWorkspaces).orderBy(desc(discoverabilityWorkspaces.updatedAt));
  }

  async getDiscoverabilityWorkspace(id: number): Promise<DiscoverabilityWorkspace | undefined> {
    const [row] = await db.select().from(discoverabilityWorkspaces).where(eq(discoverabilityWorkspaces.id, id)).limit(1);
    return row;
  }

  async createDiscoverabilityWorkspace(data: InsertDiscoverabilityWorkspace): Promise<DiscoverabilityWorkspace> {
    const [row] = await db.insert(discoverabilityWorkspaces).values(data).returning();
    return row;
  }

  async updateDiscoverabilityWorkspace(id: number, data: Partial<InsertDiscoverabilityWorkspace>): Promise<DiscoverabilityWorkspace | undefined> {
    const [row] = await db.update(discoverabilityWorkspaces).set({ ...data, updatedAt: new Date() }).where(eq(discoverabilityWorkspaces.id, id)).returning();
    return row;
  }

  async deleteDiscoverabilityWorkspace(id: number): Promise<boolean> {
    const res = await db.delete(discoverabilityWorkspaces).where(eq(discoverabilityWorkspaces.id, id));
    return (res.rowCount ?? 0) > 0;
  }

  async listAmaConversations(clientId?: number | null): Promise<AmaConversation[]> {
    if (clientId != null) {
      return db.select().from(amaConversations)
        .where(eq(amaConversations.clientId, clientId))
        .orderBy(desc(amaConversations.updatedAt));
    }
    return db.select().from(amaConversations).orderBy(desc(amaConversations.updatedAt));
  }

  async getAmaConversation(id: number): Promise<AmaConversation | undefined> {
    const [row] = await db.select().from(amaConversations).where(eq(amaConversations.id, id));
    return row;
  }

  async createAmaConversation(data: { clientId?: number | null; clientName?: string | null; title: string; integrations?: string[] }): Promise<AmaConversation> {
    const [row] = await db.insert(amaConversations).values({
      clientId: data.clientId ?? null,
      clientName: data.clientName ?? null,
      title: data.title,
      integrations: data.integrations ?? [],
    }).returning();
    return row;
  }

  async updateAmaConversation(id: number, data: { title?: string }): Promise<AmaConversation | undefined> {
    const [row] = await db.update(amaConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(amaConversations.id, id))
      .returning();
    return row;
  }

  async deleteAmaConversation(id: number): Promise<boolean> {
    const res = await db.delete(amaConversations).where(eq(amaConversations.id, id));
    return (res.rowCount ?? 0) > 0;
  }

  async getAmaMessages(conversationId: number): Promise<AmaMessage[]> {
    return db.select().from(amaMessages)
      .where(eq(amaMessages.conversationId, conversationId))
      .orderBy(amaMessages.createdAt);
  }

  async addAmaMessage(data: { conversationId: number; role: string; content: string; toolCalls?: any; provider?: string }): Promise<AmaMessage> {
    const [row] = await db.insert(amaMessages).values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ?? null,
      provider: data.provider ?? null,
    }).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
