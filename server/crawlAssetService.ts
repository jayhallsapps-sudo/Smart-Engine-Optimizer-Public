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
  createdAt: Date;
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
    createdAt: row.createdAt,
  };
}

export async function createCrawlAsset(
  clientId: number,
  clientName: string,
  filename: string,
  reportDate: string,
  headers: string[],
  data: Record<string, string>[],
  notes?: string
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
