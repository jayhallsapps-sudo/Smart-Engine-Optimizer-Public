import { storage } from "./storage";
import { decrypt } from "./encryption";

export interface WorkLogItem {
  id: string;
  task: string;
  creditType: string;
  date: string;
  url?: string;
  status?: string;
}

export interface WorkLogResult {
  clientName: string;
  dateRange: string;
  baseId: string;
  tableName: string;
  viewName: string;
  totalItems: number;
  byCreditType: Record<string, WorkLogItem[]>;
}

const CREDIT_TYPE_ORDER = ["Scale", "Optimization", "CRO Update", "Other"];

const CREDIT_TYPE_LABELS: Record<string, string> = {
  Scale: "New Content (Scale)",
  Optimization: "Content Optimization",
  "CRO Update": "CRO/UX Update",
};

export function getCreditTypeLabel(raw: string): string {
  return CREDIT_TYPE_LABELS[raw] ?? raw;
}

export async function fetchAirtableWorkLog(
  clientId: number,
  startDate: string,
  endDate: string,
  viewNameOverride?: string
): Promise<{ success: true; data: WorkLogResult } | { success: false; error: string; setupRequired?: boolean }> {
  const client = await storage.getClient(clientId);
  if (!client) {
    return { success: false, error: "Client not found." };
  }

  const airtableBaseId = (client as any).airtableBaseId as string | null;
  const airtableTableName = (client as any).airtableTableName as string | null;
  const airtableViewName = viewNameOverride ?? ((client as any).airtableViewName as string | null) ?? "Published";

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

  const params = new URLSearchParams({
    filterByFormula: buildFilterFormula(startDate, endDate),
    sort: JSON.stringify([{ field: "Due", direction: "desc" }]),
    maxRecords: "200",
  });
  if (airtableViewName) params.set("view", airtableViewName);

  const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(airtableTableName)}?${params}`;

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
        error: `Airtable table/view not found. Check the Base ID (${airtableBaseId}), Table Name (${airtableTableName}), and View Name (${airtableViewName}) in the client settings.`,
      };
    }
    return { success: false, error: `Airtable API error (${resp.status}): ${msg}` };
  }

  const data = await resp.json() as any;
  const records: any[] = data.records ?? [];

  const items: WorkLogItem[] = records.map((r: any) => {
    const f = r.fields ?? {};
    const rawCreditType = String(f["Credit Type"] ?? "Other").trim();
    const creditType = CREDIT_TYPE_ORDER.includes(rawCreditType) ? rawCreditType : "Other";
    return {
      id: r.id,
      task: String(f["Name"] ?? f["Task"] ?? f["Description"] ?? "Untitled").trim(),
      creditType,
      date: String(f["Due"] ?? f["Date"] ?? "").trim(),
      url: f["Final URL"] ?? f["URL"] ?? f["Page URL"] ?? undefined,
      status: f["Status"] ?? undefined,
    };
  });

  const byCreditType: Record<string, WorkLogItem[]> = {};
  for (const item of items) {
    if (!byCreditType[item.creditType]) byCreditType[item.creditType] = [];
    byCreditType[item.creditType].push(item);
  }

  const ordered: Record<string, WorkLogItem[]> = {};
  for (const ct of CREDIT_TYPE_ORDER) {
    if (byCreditType[ct]) ordered[ct] = byCreditType[ct];
  }
  for (const ct of Object.keys(byCreditType)) {
    if (!ordered[ct]) ordered[ct] = byCreditType[ct];
  }

  return {
    success: true,
    data: {
      clientName: client.name,
      dateRange: `${startDate} → ${endDate}`,
      baseId: airtableBaseId,
      tableName: airtableTableName,
      viewName: airtableViewName,
      totalItems: items.length,
      byCreditType: ordered,
    },
  };
}

function buildFilterFormula(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  return `AND(IS_AFTER({Due}, "${startDate}"), IS_BEFORE({Due}, "${endDate}"))`;
}
