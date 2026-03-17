import { ReplitConnectors } from "@replit/connectors-sdk";
import { storage } from "./storage";

export interface StrategyBankEntry {
  service: string;
  description: string;
  category: string;
  sourcePageId?: string;
  sourcePageLabel?: string;
}

export interface StrategyBankData {
  entries: StrategyBankEntry[];
  fetchedAt: string;
  source?: "database" | "page_blocks" | "mixed" | "none";
  error?: string;
}

export interface NotionPageConfig {
  id: string;
  label: string;
  addedAt: string;
}

export interface ChildPageInfo {
  id: string;
  title: string;
  accessible: boolean;
  entries: number;
}

export interface PageTestResult {
  success: boolean;
  entries: number;
  childPages: number;
  childPageList: ChildPageInfo[];
  source: string;
  error?: string;
}

const EMPTY: StrategyBankData = { entries: [], fetchedAt: "" };

let cachedBank: StrategyBankData | null = null;
let bankCacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function notionProxy(path: string, options?: RequestInit): Promise<any> {
  const connectors = new ReplitConnectors();
  const resp = await connectors.proxy("notion", path, {
    method: options?.method ?? "GET",
    headers: options?.headers as Record<string, string>,
    body: options?.body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Notion API ${resp.status}: ${text}`);
  }
  return resp.json();
}

function extractRichText(richText: any[]): string {
  if (!Array.isArray(richText)) return "";
  return richText.map((r: any) => r.plain_text ?? "").join("");
}

function extractPageBlocks(blocks: any[], tableRowsMap: Record<string, any[]> = {}): StrategyBankEntry[] {
  const entries: StrategyBankEntry[] = [];
  let currentHeading = "";

  for (const block of blocks) {
    const type = block.type;

    if (type === "heading_1" || type === "heading_2" || type === "heading_3") {
      currentHeading = extractRichText(block[type]?.rich_text ?? []);
    }

    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const text = extractRichText(block[type]?.rich_text ?? []);
      if (text.length > 5) {
        const colonIdx = text.indexOf(":");
        if (colonIdx > 0 && colonIdx < 80) {
          entries.push({
            service: text.substring(0, colonIdx).trim(),
            description: text.substring(colonIdx + 1).trim(),
            category: currentHeading || "General",
          });
        } else {
          entries.push({ service: text, description: "", category: currentHeading || "General" });
        }
      }
    }

    if (type === "paragraph") {
      const text = extractRichText(block.paragraph?.rich_text ?? []);
      if (text.length > 15) {
        const colonIdx = text.indexOf(":");
        if (colonIdx > 0 && colonIdx < 80) {
          entries.push({
            service: text.substring(0, colonIdx).trim(),
            description: text.substring(colonIdx + 1).trim(),
            category: currentHeading || "General",
          });
        } else if (currentHeading && text.length > 30) {
          entries.push({ service: text.substring(0, 80).trim(), description: text.length > 80 ? text.substring(80).trim() : "", category: currentHeading });
        }
      }
    }

    if (type === "callout") {
      const text = extractRichText(block.callout?.rich_text ?? []);
      if (text.length > 15 && currentHeading) {
        entries.push({ service: text.substring(0, 80).trim(), description: text.length > 80 ? text.substring(80).trim() : "", category: currentHeading || "General" });
      }
    }

    if (type === "table") {
      const rows: any[] = tableRowsMap[block.id] ?? block.children ?? [];
      const dataRows = block.table?.has_column_header ? rows.slice(1) : rows;
      for (const row of dataRows) {
        if (row.type === "table_row") {
          const cells = (row.table_row?.cells ?? []).map((c: any) => extractRichText(c));
          if (cells.length >= 2 && cells[0]?.trim()) {
            entries.push({
              service: cells[0].trim(),
              description: cells.slice(1).filter(Boolean).join(" — "),
              category: currentHeading || "General",
            });
          }
        }
      }
    }
  }

  return entries;
}

async function fetchTableRowsForBlocks(blocks: any[]): Promise<Record<string, any[]>> {
  const tableBlocks = blocks.filter((b: any) => b.type === "table");
  const result: Record<string, any[]> = {};
  await Promise.allSettled(
    tableBlocks.map(async (block: any) => {
      try {
        const resp = await notionProxy(`/v1/blocks/${block.id}/children?page_size=100`);
        result[block.id] = resp.results ?? [];
      } catch { }
    })
  );
  return result;
}

const CONTAINER_BLOCK_TYPES = new Set(["column_list", "column", "toggle", "synced_block", "template", "bulleted_list_item", "numbered_list_item", "quote"]);

async function flattenBlocks(blocks: any[], depth = 0): Promise<any[]> {
  if (depth > 3) return blocks;
  const result: any[] = [];
  await Promise.allSettled(blocks.map(async (block: any) => {
    result.push(block);
    const shouldExpand = block.has_children && CONTAINER_BLOCK_TYPES.has(block.type);
    if (shouldExpand) {
      try {
        const childResp = await notionProxy(`/v1/blocks/${block.id}/children?page_size=100`);
        const childBlocks = childResp.results ?? [];
        const expanded = await flattenBlocks(childBlocks, depth + 1);
        result.push(...expanded);
      } catch { }
    }
  }));
  return result;
}

function extractDatabaseEntries(results: any[]): StrategyBankEntry[] {
  const entries: StrategyBankEntry[] = [];
  for (const page of results) {
    const props = page.properties ?? {};
    let service = "";
    let description = "";
    let category = "";

    for (const [key, val] of Object.entries(props) as [string, any][]) {
      const keyLower = key.toLowerCase();
      if (val.type === "title") {
        service = extractRichText(val.title ?? []);
      } else if (val.type === "rich_text" && (keyLower.includes("desc") || keyLower.includes("detail"))) {
        description = extractRichText(val.rich_text ?? []);
      } else if (val.type === "select" && (keyLower.includes("cat") || keyLower.includes("type"))) {
        category = val.select?.name ?? "";
      } else if (val.type === "rich_text" && !description) {
        const text = extractRichText(val.rich_text ?? []);
        if (text.length > description.length) description = text;
      }
    }

    if (service) {
      entries.push({ service, description, category: category || "General" });
    }
  }
  return entries;
}

export function extractNotionPageId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/([a-f0-9]{32})(?:[?#].*)?$/i);
  if (match) return match[1].toLowerCase();
  const dashMatch = trimmed.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:[?#].*)?$/i);
  if (dashMatch) return dashMatch[1].replace(/-/g, "").toLowerCase();
  return trimmed.replace(/-/g, "").toLowerCase();
}

export async function fetchSinglePageEntries(pageId: string): Promise<PageTestResult> {
  let entries: StrategyBankEntry[] = [];
  let source = "none";
  const childPageList: ChildPageInfo[] = [];

  try {
    const dbResult = await notionProxy(`/v1/databases/${pageId}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100 }),
    });
    entries = extractDatabaseEntries(dbResult.results ?? []);
    source = "database";
  } catch (dbErr: any) {
    const isNotFound = dbErr.message?.includes("404") || dbErr.message?.includes("validation_error") || dbErr.message?.includes("object_not_found");
    if (isNotFound) {
      try {
        const blocksResult = await notionProxy(`/v1/blocks/${pageId}/children?page_size=100`);
        const rawBlocks = blocksResult.results ?? [];
        source = "page_blocks";

        const blocks = await flattenBlocks(rawBlocks);
        const tableRowsMap = await fetchTableRowsForBlocks(blocks);
        entries = extractPageBlocks(blocks, tableRowsMap);

        const childBlocks = blocks.filter((b: any) => b.type === "child_page");

        await Promise.allSettled(childBlocks.map(async (childBlock: any) => {
          const title = childBlock.child_page?.title ?? "Untitled";
          try {
            const childResult = await notionProxy(`/v1/blocks/${childBlock.id}/children?page_size=100`);
            const childBlockItems = await flattenBlocks(childResult.results ?? []);
            const childTableRows = await fetchTableRowsForBlocks(childBlockItems);
            const childEntries = extractPageBlocks(childBlockItems, childTableRows);
            entries.push(...childEntries);
            childPageList.push({ id: childBlock.id, title, accessible: true, entries: childEntries.length });
          } catch (childErr: any) {
            childPageList.push({ id: childBlock.id, title, accessible: false, entries: 0 });
          }
        }));

        childPageList.sort((a, b) => a.title.localeCompare(b.title));
      } catch (blockErr: any) {
        return { success: false, entries: 0, childPages: 0, childPageList: [], source: "none", error: blockErr.message ?? "Page not accessible. Ensure the integration has access." };
      }
    } else {
      return { success: false, entries: 0, childPages: 0, childPageList: [], source: "none", error: dbErr.message };
    }
  }

  return { success: true, entries: entries.length, childPages: childPageList.length, childPageList, source };
}

export async function getNotionPages(): Promise<NotionPageConfig[]> {
  const raw = await storage.getSetting("strategy_bank_pages");
  if (raw) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  const legacyId = await storage.getSetting("strategy_bank_page_id");
  if (legacyId) {
    return [{ id: legacyId, label: "Strategy Bank", addedAt: new Date().toISOString() }];
  }
  return [];
}

export async function saveNotionPages(pages: NotionPageConfig[]): Promise<void> {
  await storage.setSetting("strategy_bank_pages", JSON.stringify(pages));
}

export async function fetchStrategyBank(forceRefresh = false): Promise<StrategyBankData> {
  if (!forceRefresh && cachedBank && Date.now() < bankCacheExpiry) {
    return cachedBank;
  }

  try {
    const pages = await getNotionPages();
    if (!pages.length) {
      console.warn("[StrategyBank] No Notion pages configured — skipping");
      return EMPTY;
    }

    console.log(`[StrategyBank] Fetching ${pages.length} Notion page(s)...`);

    const allEntries: StrategyBankEntry[] = [];
    const sources = new Set<string>();

    await Promise.allSettled(
      pages.map(async (page) => {
        try {
          const result = await fetchSinglePageEntries(page.id);
          if (result.success) {
            const tagged = result.entries > 0
              ? await fetchRawEntries(page.id, page.label)
              : [];
            allEntries.push(...tagged);
            sources.add(result.source);
            console.log(`[StrategyBank] Page "${page.label}" (${page.id}): ${result.entries} entries, ${result.childPages} child pages`);
          } else {
            console.warn(`[StrategyBank] Page "${page.label}" failed: ${result.error}`);
          }
        } catch (err: any) {
          console.warn(`[StrategyBank] Page "${page.label}" error:`, err.message);
        }
      })
    );

    const sourceArr = Array.from(sources);
    const source = sourceArr.length === 0 ? "none"
      : sourceArr.length === 1 ? (sourceArr[0] as any)
      : "mixed";

    const result: StrategyBankData = {
      entries: allEntries,
      fetchedAt: new Date().toISOString(),
      source,
    };

    cachedBank = result;
    bankCacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (err: any) {
    console.error("[StrategyBank] Failed:", err.message ?? err);
    return { ...EMPTY, error: err.message ?? "Unknown error" };
  }
}

async function fetchRawEntries(pageId: string, label: string): Promise<StrategyBankEntry[]> {
  let entries: StrategyBankEntry[] = [];

  try {
    const dbResult = await notionProxy(`/v1/databases/${pageId}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100 }),
    });
    entries = extractDatabaseEntries(dbResult.results ?? []);
  } catch {
    try {
      const blocksResult = await notionProxy(`/v1/blocks/${pageId}/children?page_size=100`);
      const rawBlocks = blocksResult.results ?? [];
      const blocks = await flattenBlocks(rawBlocks);
      const tableRowsMap = await fetchTableRowsForBlocks(blocks);
      entries = extractPageBlocks(blocks, tableRowsMap);

      for (const childBlock of blocks.filter((b: any) => b.type === "child_page")) {
        try {
          const childResp = await notionProxy(`/v1/blocks/${childBlock.id}/children?page_size=100`);
          const childFlat = await flattenBlocks(childResp.results ?? []);
          const childTableRows = await fetchTableRowsForBlocks(childFlat);
          entries.push(...extractPageBlocks(childFlat, childTableRows));
        } catch { }
      }
    } catch { }
  }

  return entries.map(e => ({ ...e, sourcePageId: pageId, sourcePageLabel: label }));
}

export function clearStrategyBankCache(): void {
  cachedBank = null;
  bankCacheExpiry = 0;
}
