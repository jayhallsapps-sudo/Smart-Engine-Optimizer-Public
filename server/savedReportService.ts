import { db } from "./db";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  savedReports,
  type SavedReport,
  type InsertSavedReport,
} from "@shared/schema";

export interface CreateSavedReportInput {
  clientId: number;
  reportType: string;
  reportName: string;
  reportPeriodLabel?: string;
  analysisWindowStart?: string;
  analysisWindowEnd?: string;
  planningQuarter?: number;
  planningYear?: number;
  generatedOn: string;
  sourceSnapshotJson?: any;
  generatedReportJson?: any;
  editsJson?: Record<string, string>;
  currentCrawlAssetId?: number;
  comparisonCrawlAssetId?: number;
  versionLabel?: string;
}

export interface UpdateSavedReportInput {
  reportName?: string;
  reportPeriodLabel?: string;
  generatedReportJson?: any;
  editsJson?: Record<string, string>;
  htmlSnapshot?: string;
  currentCrawlAssetId?: number;
  comparisonCrawlAssetId?: number;
  versionLabel?: string;
  sourceSnapshotJson?: any;
}

export async function createSavedReport(input: CreateSavedReportInput): Promise<SavedReport> {
  const [created] = await db
    .insert(savedReports)
    .values({
      clientId: input.clientId,
      reportType: input.reportType,
      reportName: input.reportName,
      reportPeriodLabel: input.reportPeriodLabel ?? null,
      analysisWindowStart: input.analysisWindowStart ?? null,
      analysisWindowEnd: input.analysisWindowEnd ?? null,
      planningQuarter: input.planningQuarter ?? null,
      planningYear: input.planningYear ?? null,
      generatedOn: input.generatedOn,
      sourceSnapshotJson: input.sourceSnapshotJson ?? null,
      generatedReportJson: input.generatedReportJson ?? null,
      editsJson: input.editsJson ?? null,
      currentCrawlAssetId: input.currentCrawlAssetId ?? null,
      comparisonCrawlAssetId: input.comparisonCrawlAssetId ?? null,
      versionLabel: input.versionLabel ?? null,
    })
    .returning();
  return created;
}

export async function updateSavedReport(id: number, input: UpdateSavedReportInput): Promise<SavedReport | undefined> {
  const now = new Date();
  const [updated] = await db
    .update(savedReports)
    .set({
      ...input,
      updatedAt: now,
      lastSavedAt: now,
    })
    .where(and(eq(savedReports.id, id), isNull(savedReports.deletedAt)))
    .returning();
  return updated;
}

export async function getSavedReportById(id: number): Promise<SavedReport | undefined> {
  const [row] = await db
    .select()
    .from(savedReports)
    .where(and(eq(savedReports.id, id), isNull(savedReports.deletedAt)));
  return row;
}

export async function listSavedReportsByClientAndType(
  clientId: number,
  reportType: string
): Promise<SavedReport[]> {
  return db
    .select()
    .from(savedReports)
    .where(
      and(
        eq(savedReports.clientId, clientId),
        eq(savedReports.reportType, reportType),
        isNull(savedReports.deletedAt)
      )
    )
    .orderBy(desc(savedReports.createdAt));
}

export async function listSavedReportsByClient(clientId: number): Promise<SavedReport[]> {
  return db
    .select()
    .from(savedReports)
    .where(and(eq(savedReports.clientId, clientId), isNull(savedReports.deletedAt)))
    .orderBy(desc(savedReports.createdAt));
}

export async function listAllSavedReports(): Promise<SavedReport[]> {
  return db
    .select()
    .from(savedReports)
    .where(isNull(savedReports.deletedAt))
    .orderBy(desc(savedReports.createdAt));
}

export async function softDeleteSavedReport(id: number): Promise<boolean> {
  const result = await db
    .update(savedReports)
    .set({ deletedAt: new Date() })
    .where(and(eq(savedReports.id, id), isNull(savedReports.deletedAt)))
    .returning({ id: savedReports.id });
  return result.length > 0;
}
