import { storage } from "./storage";
import { ReplitConnectors } from "@replit/connectors-sdk";
import * as XLSX from "xlsx";

export interface NsmData {
  quarter: string;
  sessionsGoal: string;
  sessionsActual: string;
  sessionsPercent: string;
  sessionsOnTrack: string;
  mvpType: string;
  mvpGoal: string;
  mvpActual: string;
  mvpPercent: string;
  mvpOnTrack: string;
}

const FALLBACK: NsmData = {
  quarter: "—",
  sessionsGoal: "—",
  sessionsActual: "—",
  sessionsPercent: "—",
  sessionsOnTrack: "—",
  mvpType: "—",
  mvpGoal: "—",
  mvpActual: "—",
  mvpPercent: "—",
  mvpOnTrack: "—",
};

function getCurrentQuarter(): { q: number; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return { q, year };
}

function buildTabName(q: number, year: number): string {
  return `NSM Tracker Q${q} ${year}`;
}

function findBestNsmTab(sheetNames: string[], targetQ: number, targetYear: number): string | null {
  const nsmPattern = /^NSM Tracker Q(\d) (\d{4})\s*$/i;

  const target = buildTabName(targetQ, targetYear);
  if (sheetNames.includes(target)) return target;

  const candidates = sheetNames
    .map(name => {
      const m = name.trim().match(nsmPattern);
      if (!m) return null;
      return { name, q: parseInt(m[1]), year: parseInt(m[2]) };
    })
    .filter(Boolean) as { name: string; q: number; year: number }[];

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.q - a.q;
  });

  return candidates[0].name;
}

function fuzzyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex(h => pattern.test(h.toLowerCase().trim()));
}

function cellStr(row: any[], col: number): string {
  if (col < 0 || col >= row.length) return "—";
  const v = row[col];
  if (v === null || v === undefined || v === "" || String(v).startsWith("#")) return "—";
  if (typeof v === "number") {
    if (v > 40000 && v < 60000) return "—";
    const pct = String(row[col]);
    return pct;
  }
  return String(v).trim() || "—";
}

function formatPercent(val: any): string {
  if (val === null || val === undefined || val === "" || String(val).startsWith("#")) return "—";
  if (typeof val === "number") {
    if (val > 40000 && val < 60000) return "—";
    return (val * 100).toFixed(1) + "%";
  }
  const s = String(val).trim();
  if (s === "-%" || s === "—" || s === "") return "—";
  return s;
}

const XLSX_MAX_BYTES = 10 * 1024 * 1024;

async function downloadWorkbook(spreadsheetId: string): Promise<XLSX.WorkBook | null> {
  try {
    const connectors = new ReplitConnectors();
    const resp = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${spreadsheetId}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`
    );
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > XLSX_MAX_BYTES) {
      console.error(`[sheetsClient] NSM sheet too large (${buffer.byteLength} bytes > ${XLSX_MAX_BYTES} limit), skipping parse`);
      return null;
    }
    const wb = XLSX.read(buffer, { type: "buffer" });
    if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) {
      console.error("[sheetsClient] XLSX parse returned empty/invalid workbook");
      return null;
    }
    return wb;
  } catch (err) {
    console.error("[sheetsClient] Failed to download/parse NSM workbook:", err);
    return null;
  }
}

export async function fetchNsmGoals(clientName: string): Promise<NsmData> {
  try {
    const sheetUrl = await storage.getSetting("google_sheet_url");
    if (!sheetUrl) return FALLBACK;

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return FALLBACK;
    const spreadsheetId = match[1];

    const wb = await downloadWorkbook(spreadsheetId);
    if (!wb) return FALLBACK;

    const { q, year } = getCurrentQuarter();
    const tabName = findBestNsmTab(wb.SheetNames, q, year);
    if (!tabName) return FALLBACK;

    const quarterLabel = tabName.replace(/^NSM Tracker /i, "").trim();

    const ws = wb.Sheets[tabName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (rows.length < 2) return FALLBACK;

    const rawHeaders: string[] = (rows[0] as any[]).map(h => String(h ?? "").trim());
    const headers = rawHeaders.map(h => h.toLowerCase());

    const clientCol = 0;
    const clientRow = rows.slice(1).find(row => {
      const cell = String(row[clientCol] ?? "").trim();
      return cell && fuzzyMatch(cell, clientName);
    });

    if (!clientRow) return FALLBACK;

    const colSessGoal    = findCol(headers, /organic sessions nsm/i);
    const colSessActual  = findCol(headers, /organic sessions actual/i);
    const colSessPct     = findCol(headers, /% to organic sessions/i);
    const colSessTrack   = findCol(headers, /organic sessions on track/i);
    const colMvpType     = findCol(headers, /mvp nsm type/i);
    const colMvpGoal     = findCol(headers, /^q\d \d{4} mvp nsm$|mvp nsm$/i);
    const colMvpActual   = findCol(headers, /mvp nsm actual/i);
    const colMvpPct      = findCol(headers, /% to mvp/i);
    const colMvpTrack    = findCol(headers, /mvp nsm on track/i);

    const mvpGoalCol = colMvpGoal >= 0 ? colMvpGoal : findCol(rawHeaders, /mvp nsm(?! actual)/i);

    return {
      quarter:         quarterLabel,
      sessionsGoal:    cellStr(clientRow, colSessGoal),
      sessionsActual:  cellStr(clientRow, colSessActual),
      sessionsPercent: formatPercent(colSessPct >= 0 ? clientRow[colSessPct] : "—"),
      sessionsOnTrack: cellStr(clientRow, colSessTrack),
      mvpType:         cellStr(clientRow, colMvpType),
      mvpGoal:         cellStr(clientRow, mvpGoalCol),
      mvpActual:       cellStr(clientRow, colMvpActual),
      mvpPercent:      formatPercent(colMvpPct >= 0 ? clientRow[colMvpPct] : "—"),
      mvpOnTrack:      cellStr(clientRow, colMvpTrack),
    };
  } catch {
    return FALLBACK;
  }
}
