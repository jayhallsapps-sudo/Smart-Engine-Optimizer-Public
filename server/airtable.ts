import { storage } from "./storage";
import { decrypt } from "./encryption";

export interface WorkLogItem {
  id: string;
  task: string;
  creditType: string;
  date: string;
  url?: string;
  urlSlug?: string;
  contentDocUrl?: string;
  status?: string;
  statusLabel?: string;
  targetKeyword?: string;
  pageType?: string;
}

const CREDIT_COST_MAP: Record<string, number> = {
  Scale: 1,
  Optimization: 0.5,
  "CRO Update": 0.5,
  Other: 0,
};

export function getCreditCost(creditType: string): string {
  const cost = CREDIT_COST_MAP[creditType];
  return cost !== undefined ? String(cost) : "—";
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

const IGNORED_STATUSES = new Set(["3. Load", "3.5 Published as Draft", "4. Live"]);

export const STATUS_LABELS: Record<string, string> = {
  "2.5 Ready for Edit": "New Content",
  "2.75 With Client for Re...": "With Client for Review",
  "5. Update Featured Im...": "Update Featured Image",
  "6. Content Refresh": "Content Refresh",
  "7. Cannibal Review": "Canonical Review",
  "8. Remove & Redirect": "Remove & Redirect",
};

export function getStatusLabel(raw: string): string {
  if (!raw) return raw;
  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    if (raw.startsWith(key.replace("...", "").trim()) || raw === key) return label;
  }
  return raw;
}

export function isIgnoredStatus(raw: string): boolean {
  if (!raw) return false;
  for (const ignored of IGNORED_STATUSES) {
    if (raw === ignored || raw.startsWith(ignored.replace("...", "").trim())) return true;
  }
  return false;
}

const viewIdCache = new Map<string, string>();

export async function resolveViewId(
  baseId: string,
  tableName: string,
  viewName: string,
  pat: string
): Promise<string | null> {
  const cacheKey = `${baseId}::${tableName}::${viewName.trim().toLowerCase()}`;
  if (viewIdCache.has(cacheKey)) return viewIdCache.get(cacheKey)!;

  try {
    const resp = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const table = data.tables?.find((t: any) => t.name?.trim().toLowerCase() === tableName.trim().toLowerCase());
    if (!table) return null;
    const view = table.views?.find((v: any) => v.name?.trim().toLowerCase() === viewName.trim().toLowerCase());
    if (!view) return null;
    viewIdCache.set(cacheKey, view.id);
    return view.id as string;
  } catch {
    return null;
  }
}

export async function fetchAirtableWorkLog(
  clientId: number,
  startDate: string,
  endDate: string,
  viewIntent?: "published" | "production" | "biweekly" | "biweekly_did" | "biweekly_next"
): Promise<{ success: true; data: WorkLogResult } | { success: false; error: string; setupRequired?: boolean }> {
  const client = await storage.getClient(clientId);
  if (!client) {
    return { success: false, error: "Client not found." };
  }

  const airtableBaseId = (client as any).airtableBaseId as string | null;
  const airtableTableName = (client as any).airtableTableName as string | null;

  const configuredViewName: string | null =
    viewIntent === "biweekly_did"
      // "What we did" pane: query the Published view (content that was produced and posted)
      ? ((client as any).airtablePublishedView as string | null)
      : viewIntent === "biweekly_next"
      // "What's next" pane: query the Production view (content still to be produced)
      ? ((client as any).airtableProductionView as string | null)
      : viewIntent === "biweekly"
      // Legacy single-pane biweekly: default to Production (preserves old behavior)
      ? ((client as any).airtableProductionView as string | null)
      : viewIntent === "production"
      ? ((client as any).airtableProductionView as string | null)
      : viewIntent === "published"
      ? ((client as any).airtablePublishedView as string | null)
      : ((client as any).airtablePublishedView as string | null);

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

  let resolvedViewParam: string | null = configuredViewName;
  // Track whether the configured view name resolved to an actual Airtable view ID.
  // This drives the Everything-fallback decision below: we ONLY fall back when the
  // primary view name doesn't resolve (i.e. doesn't exist in Airtable), not when
  // the primary view legitimately returned 0 records. Silently masking an empty
  // view with Everything data hides real problems from AMs.
  let primaryViewResolved = !configuredViewName; // no configured name = nothing to "resolve"
  if (configuredViewName) {
    const viewId = await resolveViewId(airtableBaseId, airtableTableName, configuredViewName, pat);
    if (viewId) {
      resolvedViewParam = viewId;
      primaryViewResolved = true;
    } else {
      console.warn(`[Airtable] Could not resolve view "${configuredViewName}" to an ID — using name as-is`);
      primaryViewResolved = false;
    }
  }

  const params = new URLSearchParams({ maxRecords: "200" });
  if (resolvedViewParam) params.set("view", resolvedViewParam);

  if (startDate && endDate) {
    let formula: string;
    if (viewIntent === "biweekly" || viewIntent === "biweekly_did") {
      // What-we-did pane: filter on Last Published / Updated (when content actually went live)
      formula = `AND(NOT(IS_BEFORE({Last Published / Updated}, '${startDate}')), IS_BEFORE({Last Published / Updated}, DATEADD('${endDate}', 1, 'days')))`;
    } else if (viewIntent === "production" || viewIntent === "biweekly_next") {
      // What's-next pane: filter on Due (when content is scheduled to ship)
      formula = `AND(IS_BEFORE({Due}, DATEADD('${endDate}', 1, 'days')), NOT(IS_BEFORE({Due}, '${startDate}')))`;
    } else {
      // Published view: inclusive start date (NOT IS_BEFORE = >= startDate), inclusive end date via DATEADD
      formula = `AND(NOT(IS_BEFORE({Published Date}, '${startDate}')), IS_BEFORE({Published Date}, DATEADD('${endDate}', 1, 'days')))`;
    }
    params.set("filterByFormula", formula);
  }

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
        error: `Airtable table/view not found. Check the Base ID (${airtableBaseId}), Table Name (${airtableTableName}), and View Name (${configuredViewName ?? "not set"}) in the client settings.`,
      };
    }
    return { success: false, error: `Airtable API error (${resp.status}): ${msg}` };
  }

  const data = await resp.json() as any;
  const records: any[] = data.records ?? [];

  const items: WorkLogItem[] = records
    .map((r: any) => {
      const f = r.fields ?? {};
      const rawCreditType = String(f["Credit type"] ?? f["Credit Type"] ?? "Other").trim();
      const taskName = String(f["Name"] ?? f["Task"] ?? f["Description"] ?? "").trim();
      let creditType = CREDIT_TYPE_ORDER.includes(rawCreditType) ? rawCreditType : "Other";
      // Title-based override: "Optimization" or "CRO" anywhere in the task name → Optimization section
      const taskLower = taskName.toLowerCase();
      if (taskLower.includes("optimization") || taskLower.includes("cro")) {
        creditType = "Optimization";
      }
      const rawStatus = f["Status"] ? String(f["Status"]).trim() : undefined;
      const rawContentDocUrl =
        f["Written Content Doc URL"] ??
        f["Content Doc URL"] ??
        f["Written Content Doc"] ??
        undefined;
      const contentDocUrl = rawContentDocUrl ? String(rawContentDocUrl).trim() : undefined;
      const rawKeyword = f["Target Keyword"] ?? f["Keyword"] ?? f["Primary Keyword"] ?? undefined;
      const rawPageType = f["Page Type"] ?? f["Type"] ?? f["Content Type"] ?? undefined;
      const rawUrlSlug = f["URL Slug"] ? String(f["URL Slug"]).trim() : undefined;
      const rawDate = String(f["Last Published / Updated"] ?? f["Due"] ?? f["Date"] ?? "").trim();
      return {
        id: r.id,
        task: taskName || "Untitled",
        creditType,
        date: rawDate,
        url: f["Final URL"] ?? f["URL"] ?? f["Page URL"] ?? undefined,
        urlSlug: rawUrlSlug || undefined,
        contentDocUrl: contentDocUrl || undefined,
        status: rawStatus,
        statusLabel: rawStatus ? getStatusLabel(rawStatus) : undefined,
        targetKeyword: rawKeyword ? String(rawKeyword).trim() : undefined,
        pageType: rawPageType ? String(rawPageType).trim() : undefined,
      };
    })
    .filter(item => {
      if (viewIntent === "biweekly" || viewIntent === "biweekly_did" || viewIntent === "biweekly_next") return true;
      if (!item.status) return true;
      if (viewIntent === "production") {
        return item.status !== "4. Live";
      }
      return !["3. Load", "3.5 Published as Draft"].some(ig =>
        item.status === ig || item.status!.startsWith(ig.replace("...", "").trim())
      );
    });

  // Everything-view fallback for biweekly variants.
  // Trigger: the primary view name did NOT resolve to an Airtable view ID
  //   (i.e. the configured view doesn't exist in Airtable). We do NOT fall
  //   back just because the primary view returned 0 records — an empty
  //   Published or Production view in the relevant window is a legitimate
  //   "no work this period" signal that AMs need to see honestly.
  const isBiweekly = viewIntent === "biweekly" || viewIntent === "biweekly_did" || viewIntent === "biweekly_next";
  if (isBiweekly && !primaryViewResolved) {
    const everythingViewName = (client as any).airtableEverythingView as string | null;
    if (everythingViewName && everythingViewName !== configuredViewName) {
      let everythingViewParam: string | null = everythingViewName;
      const everythingViewId = await resolveViewId(airtableBaseId, airtableTableName, everythingViewName, pat);
      if (everythingViewId) {
        everythingViewParam = everythingViewId;
      }
      const fallbackParams = new URLSearchParams({ maxRecords: "200" });
      fallbackParams.set("view", everythingViewParam);
      if (startDate && endDate) {
        // Use the same date field as the primary intent so the fallback window matches.
        const dateField = (viewIntent === "biweekly_next") ? "Due" : "Last Published / Updated";
        const fallbackFormula = `AND(NOT(IS_BEFORE({${dateField}}, '${startDate}')), IS_BEFORE({${dateField}}, DATEADD('${endDate}', 1, 'days')))`;
        fallbackParams.set("filterByFormula", fallbackFormula);
      }
      const fallbackUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(airtableTableName)}?${fallbackParams}`;
      try {
        const fallbackResp = await fetch(fallbackUrl, {
          headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
        });
        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json() as any;
          const fallbackRecords: any[] = fallbackData.records ?? [];
          for (const r of fallbackRecords) {
            const f = r.fields ?? {};
            const rawCreditType = String(f["Credit type"] ?? f["Credit Type"] ?? "Other").trim();
            const taskName = String(f["Name"] ?? f["Task"] ?? f["Description"] ?? "").trim();
            let creditType = CREDIT_TYPE_ORDER.includes(rawCreditType) ? rawCreditType : "Other";
            const taskLower = taskName.toLowerCase();
            if (taskLower.includes("optimization") || taskLower.includes("cro")) {
              creditType = "Optimization";
            }
            const rawUrlSlug = f["URL Slug"] ? String(f["URL Slug"]).trim() : undefined;
            const rawDate = String(f["Last Published / Updated"] ?? f["Due"] ?? f["Date"] ?? "").trim();
            items.push({
              id: r.id,
              task: taskName || "Untitled",
              creditType,
              date: rawDate,
              url: f["Final URL"] ?? f["URL"] ?? f["Page URL"] ?? undefined,
              urlSlug: rawUrlSlug || undefined,
            });
          }
          console.log(`[Airtable] ${viewIntent} fallback: primary view "${configuredViewName}" did not resolve — pulled ${fallbackRecords.length} records from Everything view as backup`);
        }
      } catch (err: any) {
        console.warn(`[Airtable] ${viewIntent} fallback failed:`, err?.message);
      }
    }
  }

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
      viewName: configuredViewName ?? "",
      totalItems: items.length,
      byCreditType: ordered,
    },
  };
}

function buildFilterFormula(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  return `AND(IS_AFTER({Due}, "${startDate}"), IS_BEFORE({Due}, "${endDate}"))`;
}

/**
 * Fetches recent records from the client's production Airtable view without a date filter.
 * Used by the execution ref picker to let AMs link findings to real Airtable work items.
 * Returns id + title pairs only — lightweight for quick search.
 */
export async function fetchAirtableTaskItems(
  clientId: number,
): Promise<{ id: string; title: string }[]> {
  const client = await storage.getClient(clientId);
  if (!client) return [];

  const baseId = (client as any).airtableBaseId as string | null;
  const tableName = (client as any).airtableTableName as string | null;
  const viewName = (client as any).airtableProductionView as string | null;

  if (!baseId || !tableName) return [];

  const creds = await storage.getApiCredentialsByService("airtable");
  if (!creds.length) return [];

  const pat = decrypt(creds[0].encryptedValue);

  let viewParam: string | null = viewName;
  if (viewName) {
    const viewId = await resolveViewId(baseId, tableName, viewName, pat);
    if (viewId) viewParam = viewId;
  }

  const params = new URLSearchParams({ maxRecords: "100" });
  if (viewParam) params.set("view", viewParam);

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${params}`;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.records ?? [])
      .map((r: any) => ({
        id: r.id as string,
        title: String(
          r.fields?.["Name"] ?? r.fields?.["Task"] ?? r.fields?.["Description"] ?? ""
        ).trim(),
      }))
      .filter((item: { id: string; title: string }) => item.title.length > 0);
  } catch {
    return [];
  }
}
