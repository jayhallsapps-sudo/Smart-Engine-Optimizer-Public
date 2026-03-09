import { ReplitConnectors } from "@replit/connectors-sdk";
import { storage } from "./storage";

export interface StrategyBankEntry {
  service: string;
  description: string;
  category: string;
}

export interface StrategyBankData {
  entries: StrategyBankEntry[];
  fetchedAt: string;
}

const EMPTY: StrategyBankData = { entries: [], fetchedAt: "" };

let cachedBank: StrategyBankData | null = null;
let bankCacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function notionProxy(path: string, options?: RequestInit): Promise<any> {
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

function extractPageBlocks(blocks: any[]): StrategyBankEntry[] {
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
          entries.push({
            service: text,
            description: "",
            category: currentHeading || "General",
          });
        }
      }
    }

    if (type === "paragraph") {
      const text = extractRichText(block.paragraph?.rich_text ?? []);
      if (text.length > 10 && currentHeading) {
        const colonIdx = text.indexOf(":");
        if (colonIdx > 0 && colonIdx < 80) {
          entries.push({
            service: text.substring(0, colonIdx).trim(),
            description: text.substring(colonIdx + 1).trim(),
            category: currentHeading || "General",
          });
        }
      }
    }

    if (type === "table") {
      const rows = block.table?.has_column_header ? block.children?.slice(1) : block.children;
      for (const row of rows ?? []) {
        if (row.type === "table_row") {
          const cells = (row.table_row?.cells ?? []).map((c: any) => extractRichText(c));
          if (cells.length >= 2 && cells[0]) {
            entries.push({
              service: cells[0],
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

export async function fetchStrategyBank(forceRefresh = false): Promise<StrategyBankData> {
  if (!forceRefresh && cachedBank && Date.now() < bankCacheExpiry) {
    return cachedBank;
  }

  try {
    const pageId = await storage.getSetting("strategy_bank_page_id");
    if (!pageId) {
      console.warn("[StrategyBank] No Notion Strategy Bank page ID configured — skipping");
      return EMPTY;
    }

    console.log(`[StrategyBank] Fetching Notion page ${pageId}...`);

    let entries: StrategyBankEntry[] = [];

    try {
      const dbResult = await notionProxy(`/v1/databases/${pageId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_size: 100 }),
      });
      entries = extractDatabaseEntries(dbResult.results ?? []);
      console.log(`[StrategyBank] Parsed ${entries.length} entries from Notion database`);
    } catch (dbErr: any) {
      if (dbErr.message?.includes("404") || dbErr.message?.includes("validation_error")) {
        console.log("[StrategyBank] Not a database — trying as page with blocks...");
        const blocksResult = await notionProxy(`/v1/blocks/${pageId}/children?page_size=100`);
        entries = extractPageBlocks(blocksResult.results ?? []);
        console.log(`[StrategyBank] Parsed ${entries.length} entries from Notion page blocks`);
      } else {
        throw dbErr;
      }
    }

    const result: StrategyBankData = {
      entries,
      fetchedAt: new Date().toISOString(),
    };

    cachedBank = result;
    bankCacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (err: any) {
    console.error("[StrategyBank] Failed to fetch/parse Notion data:", err.message ?? err);
    return EMPTY;
  }
}

export function clearStrategyBankCache(): void {
  cachedBank = null;
  bankCacheExpiry = 0;
}
