import { getGoogleAccessToken } from "./googleToken";
import { storage } from "./storage";

async function fetchSheetValues(spreadsheetId: string, token: string, range: string): Promise<string[][]> {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json() as any;
  return (data.values ?? []) as string[][];
}

async function getSpreadsheetSheets(spreadsheetId: string, token: string): Promise<string[]> {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json() as any;
  return (data.sheets ?? []).map((s: any) => String(s.properties?.title ?? ""));
}

function fuzzyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function findGoalValue(row: string[], headers: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const col = headers.findIndex(h => pattern.test(h));
    if (col >= 0 && row[col]) {
      const val = String(row[col]).trim();
      if (val && val !== "0") return val;
    }
  }
  return "—";
}

export async function fetchNsmGoals(clientName: string): Promise<{
  sessionsGoal: string;
  callsGoal: string;
}> {
  const fallback = { sessionsGoal: "—", callsGoal: "—" };

  try {
    const token = await getGoogleAccessToken("google_sheets");
    if (!token) return fallback;

    const sheetUrl = await storage.getSetting("google_sheet_url");
    if (!sheetUrl) return fallback;

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return fallback;
    const spreadsheetId = match[1];

    const allSheets = await getSpreadsheetSheets(spreadsheetId, token);

    const preferredSheet = allSheets.find(s =>
      /nsm/i.test(s) || /tracker/i.test(s) || /goal/i.test(s)
    ) ?? allSheets[0];

    if (!preferredSheet) return fallback;

    const range = `'${preferredSheet}'!A1:Z300`;
    const rows = await fetchSheetValues(spreadsheetId, token, range);

    if (rows.length < 2) return fallback;

    const headers = rows[0].map(h => String(h ?? "").toLowerCase().trim());

    const clientCol = headers.findIndex(h =>
      /client|account|name|company/i.test(h)
    );
    if (clientCol < 0) return fallback;

    const clientRow = rows.slice(1).find(row => {
      const cell = String(row[clientCol] ?? "").trim();
      return cell && fuzzyMatch(cell, clientName);
    });

    if (!clientRow) return fallback;

    const sessionsGoal = findGoalValue(clientRow, headers, [
      /session.*goal|goal.*session|organic.*session.*goal|session.*target/i,
      /session.*nsm|nsm.*session/i,
    ]);

    const callsGoal = findGoalValue(clientRow, headers, [
      /call.*goal|goal.*call|organic.*call.*goal|call.*target/i,
      /call.*nsm|nsm.*call/i,
    ]);

    return { sessionsGoal, callsGoal };
  } catch {
    return fallback;
  }
}
