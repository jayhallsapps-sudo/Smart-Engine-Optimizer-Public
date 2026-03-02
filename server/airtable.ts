import { storage } from "./storage";
import { decrypt } from "./encryption";

export interface WorkLogItem {
  id: string;
  task: string;
  category: string;
  date: string;
  url?: string;
  notes?: string;
}

export interface WorkLogResult {
  clientName: string;
  dateRange: string;
  baseId: string;
  tableName: string;
  totalItems: number;
  byCategory: Record<string, WorkLogItem[]>;
}

const CATEGORY_ORDER = [
  "Content",
  "Technical",
  "CRO/UX",
  "Internal Linking",
  "Local/GBP",
  "Authority/Links",
  "Other",
];

export async function fetchAirtableWorkLog(
  clientId: number,
  startDate: string,
  endDate: string
): Promise<{ success: true; data: WorkLogResult } | { success: false; error: string; setupRequired?: boolean }> {
  const client = await storage.getClient(clientId);
  if (!client) {
    return { success: false, error: "Client not found." };
  }

  const airtableBaseId = (client as any).airtableBaseId as string | null;
  const airtableTableName = (client as any).airtableTableName as string | null;

  if (!airtableBaseId || !airtableTableName) {
    return {
      success: false,
      setupRequired: true,
      error: `Airtable is not configured for ${client.name}. Open the client's settings and add the Airtable Base ID and Table Name, then add your Personal Access Token in Setup → Work Tracking.`,
    };
  }

  const creds = await storage.getApiCredentialsByService("airtable");
  if (!creds.length) {
    return {
      success: false,
      setupRequired: true,
      error: "No Airtable Personal Access Token found. Go to Setup → Work Tracking and add your PAT.",
    };
  }

  const pat = decrypt(creds[0].encryptedValue);

  const filterFormula = buildFilterFormula(startDate, endDate);
  const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(airtableTableName)}?${new URLSearchParams({
    filterByFormula: filterFormula,
    sort: JSON.stringify([{ field: "Date", direction: "desc" }]),
    maxRecords: "200",
  })}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    return { success: false, error: `Network error reaching Airtable: ${err.message}` };
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as any;
    const msg = body?.error?.message || body?.message || resp.statusText;
    if (resp.status === 401 || resp.status === 403) {
      return {
        success: false,
        setupRequired: true,
        error: `Airtable authentication failed: ${msg}. Check your Personal Access Token in Setup → Work Tracking.`,
      };
    }
    if (resp.status === 404) {
      return {
        success: false,
        setupRequired: true,
        error: `Airtable table not found. Check the Base ID (${airtableBaseId}) and Table Name (${airtableTableName}) in the client settings.`,
      };
    }
    return { success: false, error: `Airtable API error (${resp.status}): ${msg}` };
  }

  const data = await resp.json() as any;
  const records: any[] = data.records ?? [];

  const items: WorkLogItem[] = records.map((r: any) => {
    const f = r.fields ?? {};
    const rawCat = String(f["Category"] ?? f["Type"] ?? f["Work Type"] ?? "Other").trim();
    const category = normalizeCategory(rawCat);
    return {
      id: r.id,
      task: String(f["Task"] ?? f["Name"] ?? f["Description"] ?? f["Work"] ?? "Untitled").trim(),
      category,
      date: String(f["Date"] ?? f["Date Completed"] ?? f["Completed"] ?? "").trim(),
      url: f["URL"] ?? f["Page URL"] ?? f["Page"] ?? undefined,
      notes: f["Notes"] ?? f["Details"] ?? undefined,
    };
  });

  const byCategory: Record<string, WorkLogItem[]> = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const orderedByCategory: Record<string, WorkLogItem[]> = {};
  for (const cat of CATEGORY_ORDER) {
    if (byCategory[cat]) orderedByCategory[cat] = byCategory[cat];
  }
  for (const cat of Object.keys(byCategory)) {
    if (!orderedByCategory[cat]) orderedByCategory[cat] = byCategory[cat];
  }

  return {
    success: true,
    data: {
      clientName: client.name,
      dateRange: `${startDate} → ${endDate}`,
      baseId: airtableBaseId,
      tableName: airtableTableName,
      totalItems: items.length,
      byCategory: orderedByCategory,
    },
  };
}

function buildFilterFormula(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  return `AND(IS_AFTER({Date}, "${startDate}"), IS_BEFORE({Date}, "${endDate}"))`;
}

function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("content")) return "Content";
  if (lower.includes("tech")) return "Technical";
  if (lower.includes("cro") || lower.includes("ux") || lower.includes("conversion")) return "CRO/UX";
  if (lower.includes("internal") || lower.includes("link build") || lower.includes("interlinking")) return "Internal Linking";
  if (lower.includes("local") || lower.includes("gbp") || lower.includes("google business")) return "Local/GBP";
  if (lower.includes("author") || lower.includes("backlink") || lower.includes("outreach") || lower.includes("pr")) return "Authority/Links";
  return raw || "Other";
}
