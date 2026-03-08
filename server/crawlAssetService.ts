import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { sfReports, type SfReport } from "@shared/schema";

export function buildAssetName(clientName: string, date: string): string {
  return `SF - ${clientName} - ${date}`;
}

export interface CrawlAsset {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
  headers: string[] | null;
  assetName: string;
  notes: string | null;
  sessionId: string | null;
  sessionName: string | null;
  fileType: string | null;
  createdAt: Date;
}

export interface CrawlSessionFile {
  id: number;
  fileType: string | null;
  filename: string;
  rowCount: number;
}

export interface CrawlSession {
  sessionId: string | null;
  sessionName: string;
  createdAt: Date;
  files: CrawlSessionFile[];
  primaryFileId: number;
}

function toAsset(row: SfReport): CrawlAsset {
  return {
    id: row.id,
    clientId: row.clientId,
    reportDate: row.reportDate,
    filename: row.filename,
    rowCount: row.rowCount,
    headers: row.headers ?? null,
    assetName: row.assetName ?? buildAssetName("Unknown", row.reportDate),
    notes: row.notes ?? null,
    sessionId: row.sessionId ?? null,
    sessionName: row.sessionName ?? null,
    fileType: row.fileType ?? null,
    createdAt: row.createdAt,
  };
}

function pickPrimaryFile(files: CrawlSessionFile[]): number {
  const internal = files.find(f => f.fileType === "internal");
  if (internal) return internal.id;
  return files.reduce((best, f) => (f.rowCount > best.rowCount ? f : best), files[0]).id;
}

export async function createCrawlAsset(
  clientId: number,
  clientName: string,
  filename: string,
  reportDate: string,
  headers: string[],
  data: Record<string, string>[],
  notes?: string,
  sessionId?: string | null,
  sessionName?: string | null,
  fileType?: string | null,
): Promise<CrawlAsset> {
  const assetName = buildAssetName(clientName, reportDate);
  const [created] = await db
    .insert(sfReports)
    .values({
      clientId,
      reportDate,
      filename,
      rowCount: data.length,
      headers,
      data: data as any,
      assetName,
      notes: notes ?? null,
      sessionId: sessionId ?? null,
      sessionName: sessionName ?? null,
      fileType: fileType ?? null,
    })
    .returning();
  return toAsset(created);
}

export async function listCrawlAssets(clientId: number): Promise<CrawlAsset[]> {
  const rows = await db
    .select()
    .from(sfReports)
    .where(eq(sfReports.clientId, clientId))
    .orderBy(desc(sfReports.createdAt));
  return rows.map(toAsset);
}

export async function listCrawlSessions(clientId: number): Promise<CrawlSession[]> {
  const rows = await db
    .select()
    .from(sfReports)
    .where(eq(sfReports.clientId, clientId))
    .orderBy(desc(sfReports.createdAt));

  const sessionMap = new Map<string, CrawlSession>();
  const legacySessions: CrawlSession[] = [];

  for (const row of rows) {
    const file: CrawlSessionFile = {
      id: row.id,
      fileType: row.fileType ?? null,
      filename: row.filename,
      rowCount: row.rowCount,
    };

    if (row.sessionId) {
      if (sessionMap.has(row.sessionId)) {
        sessionMap.get(row.sessionId)!.files.push(file);
      } else {
        sessionMap.set(row.sessionId, {
          sessionId: row.sessionId,
          sessionName: row.sessionName ?? buildAssetName("Unknown", row.reportDate),
          createdAt: row.createdAt,
          files: [file],
          primaryFileId: row.id,
        });
      }
    } else {
      legacySessions.push({
        sessionId: null,
        sessionName: row.assetName ?? buildAssetName("Unknown", row.reportDate),
        createdAt: row.createdAt,
        files: [file],
        primaryFileId: row.id,
      });
    }
  }

  const grouped = Array.from(sessionMap.values()).map(s => ({
    ...s,
    primaryFileId: pickPrimaryFile(s.files),
  }));

  return [...grouped, ...legacySessions].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getCrawlAsset(id: number): Promise<CrawlAsset | undefined> {
  const [row] = await db
    .select()
    .from(sfReports)
    .where(eq(sfReports.id, id));
  return row ? toAsset(row) : undefined;
}

export async function getCrawlAssetWithData(id: number): Promise<(CrawlAsset & { data: any }) | undefined> {
  const [row] = await db
    .select()
    .from(sfReports)
    .where(eq(sfReports.id, id));
  if (!row) return undefined;
  return { ...toAsset(row), data: row.data };
}

export async function deleteCrawlAsset(id: number): Promise<boolean> {
  const result = await db
    .delete(sfReports)
    .where(eq(sfReports.id, id))
    .returning({ id: sfReports.id });
  return result.length > 0;
}
