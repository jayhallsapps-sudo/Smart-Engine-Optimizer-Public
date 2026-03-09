import { google } from "googleapis";
import { storage } from "./storage";

export interface QssbData {
  clientInsights: string[];
  additionalOpportunities: { service: string; description: string }[];
  fetchedAt: string;
}

const EMPTY: QssbData = { clientInsights: [], additionalOpportunities: [], fetchedAt: "" };

let cachedQssb: QssbData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

let docsConnectionSettings: any;

async function getDocsAccessToken(): Promise<string> {
  if (
    docsConnectionSettings &&
    docsConnectionSettings.settings.expires_at &&
    new Date(docsConnectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return docsConnectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  docsConnectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-docs",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    docsConnectionSettings?.settings?.access_token ||
    docsConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!docsConnectionSettings || !accessToken) throw new Error("Google Docs not connected");
  return accessToken;
}

async function getDocsClient() {
  const accessToken = await getDocsAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: "v1", auth: oauth2Client });
}

function extractText(content: any[]): string[] {
  const lines: string[] = [];
  for (const el of content) {
    if (el.paragraph) {
      let line = "";
      for (const elem of el.paragraph.elements ?? []) {
        if (elem.textRun?.content) line += elem.textRun.content;
      }
      const trimmed = line.replace(/\n$/, "").trim();
      if (trimmed) lines.push(trimmed);
    }
    if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        const cells: string[] = [];
        for (const cell of row.tableCells ?? []) {
          let cellText = "";
          for (const p of cell.content ?? []) {
            if (p.paragraph) {
              for (const elem of p.paragraph.elements ?? []) {
                if (elem.textRun?.content) cellText += elem.textRun.content;
              }
            }
          }
          cells.push(cellText.replace(/\n/g, " ").trim());
        }
        const joined = cells.filter(Boolean).join(" | ");
        if (joined) lines.push(joined);
      }
    }
  }
  return lines;
}

function parseQssbSections(lines: string[]): QssbData {
  const insights: string[] = [];
  const opportunities: { service: string; description: string }[] = [];

  let section: "none" | "questions" | "opportunities" = "none";

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      lower.includes("questions for the client") ||
      lower.includes("client questions") ||
      lower.includes("questions to ask")
    ) {
      section = "questions";
      continue;
    }
    if (
      lower.includes("additional opportunities") ||
      lower.includes("upsell") ||
      lower.includes("cross-sell") ||
      lower.includes("cross sell")
    ) {
      section = "opportunities";
      continue;
    }

    if (section === "questions") {
      const cleaned = line.replace(/^[\d\.\-\*\•\–]+\s*/, "").trim();
      if (cleaned.length > 5) insights.push(cleaned);
    } else if (section === "opportunities") {
      if (line.includes("|")) {
        const parts = line.split("|").map((s) => s.trim());
        if (parts.length >= 2 && parts[0]) {
          opportunities.push({ service: parts[0], description: parts.slice(1).join(" — ") });
        }
      } else {
        const cleaned = line.replace(/^[\d\.\-\*\•\–]+\s*/, "").trim();
        if (cleaned.length > 5) {
          const colonIdx = cleaned.indexOf(":");
          if (colonIdx > 0 && colonIdx < 60) {
            opportunities.push({
              service: cleaned.substring(0, colonIdx).trim(),
              description: cleaned.substring(colonIdx + 1).trim(),
            });
          } else {
            opportunities.push({ service: cleaned, description: "" });
          }
        }
      }
    }
  }

  return {
    clientInsights: insights,
    additionalOpportunities: opportunities,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchQssbData(forceRefresh = false): Promise<QssbData> {
  if (!forceRefresh && cachedQssb && Date.now() < cacheExpiry) {
    return cachedQssb;
  }

  try {
    const docId = await storage.getSetting("qssb_document_id");
    if (!docId) {
      console.warn("[QSSB] No QSSB document ID configured — skipping");
      return EMPTY;
    }

    console.log(`[QSSB] Fetching document ${docId}...`);
    const docs = await getDocsClient();
    const response = await docs.documents.get({ documentId: docId });
    const body = response.data.body;
    if (!body?.content) {
      console.warn("[QSSB] Document body is empty");
      return EMPTY;
    }

    const lines = extractText(body.content);
    console.log(`[QSSB] Extracted ${lines.length} lines from document`);
    const result = parseQssbSections(lines);
    console.log(
      `[QSSB] Parsed ${result.clientInsights.length} insights, ${result.additionalOpportunities.length} opportunities`
    );

    cachedQssb = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (err: any) {
    console.error("[QSSB] Failed to fetch/parse QSSB document:", err.message ?? err);
    return EMPTY;
  }
}

export function clearQssbCache(): void {
  cachedQssb = null;
  cacheExpiry = 0;
}
