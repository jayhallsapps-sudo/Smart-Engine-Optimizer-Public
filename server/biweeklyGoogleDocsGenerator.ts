/**
 * server/biweeklyGoogleDocsGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Google Docs biweekly report generator.
 *
 * Why this exists: the .docx-then-auto-convert path was mangling formatting
 * in Google Drive (font substitution, color drift, table re-flow). This
 * generator builds the report directly as a native Google Doc via the Docs
 * v1 API — no file-format conversion ever happens, so what we author is
 * exactly what AMs and clients see.
 *
 * Architecture mirrors qssbClient.ts:
 *   - OAuth token comes from the `google-docs` Replit connector
 *   - Uses the official `googleapis` npm package
 *
 * Auth scopes needed (already covered by the google-docs connector):
 *   - https://www.googleapis.com/auth/documents (create + edit doc body)
 *   - https://www.googleapis.com/auth/drive.file (set parent folder, move file)
 *
 * Consumes the same `report` shape as biweeklyBlockDocxGenerator.ts so it
 * can be a drop-in replacement at the upload-to-drive route.
 *
 * Brand: Webserv (red #C0392B, black, white), Archivo headings, Inter body.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { google, docs_v1 } from "googleapis";

// ─── OAuth via the Replit google-docs connector ──────────────────────────────

let docsConnectionSettings: any;

async function getDocsAccessToken(): Promise<string> {
  if (
    docsConnectionSettings &&
    docsConnectionSettings.settings?.expires_at &&
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

  if (!docsConnectionSettings || !accessToken) {
    throw new Error("Google Docs not connected — check the google-docs Replit connector");
  }
  return accessToken;
}

async function getDocsClient(): Promise<docs_v1.Docs> {
  const accessToken = await getDocsAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: "v1", auth: oauth2Client });
}

async function getDriveAccessToken(): Promise<string | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken || !hostname) return null;
  try {
    const data = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-drive",
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
    ).then((res) => res.json());
    const item = data.items?.[0];
    const accessToken =
      item?.settings?.access_token ||
      item?.settings?.oauth?.credentials?.access_token;
    return accessToken || null;
  } catch {
    return null;
  }
}

async function getDriveClient() {
  const accessToken = await getDriveAccessToken();
  if (!accessToken) {
    throw new Error("Google Drive not connected — check the google-drive Replit connector");
  }
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

// ─── Brand tokens (defaults; can be overridden by activeTheme.tokens) ────────

export interface BiweeklyBrandTokens {
  primaryColor: string;       // headings, accent
  bodyColor: string;          // body text
  tableHeaderBg: string;      // table header fill
  tableHeaderText: string;    // table header text
  tableAltRowBg: string;      // alternating row fill
  tableBorderColor: string;   // cell border color
  calloutBg: string;          // callout background
  calloutBorderColor: string; // callout left accent (mimicked w/ cell shading)
  headingFont: string;        // Archivo
  bodyFont: string;           // Inter
}

const DEFAULT_TOKENS: BiweeklyBrandTokens = {
  primaryColor:       "#C0392B",
  bodyColor:          "#1E293B",
  tableHeaderBg:      "#C0392B",
  tableHeaderText:    "#FFFFFF",
  tableAltRowBg:      "#F8FAFC",
  tableBorderColor:   "#E2E8F0",
  calloutBg:          "#FEF2F2",
  calloutBorderColor: "#C0392B",
  headingFont:        "Archivo",
  bodyFont:           "Inter",
};

// ─── Brand assets ─────────────────────────────────────────────────────────────

// Webserv "W" logo. The Google Docs API requires a publicly accessible URL
// for inline images. The /file/d/[ID]/view share URL doesn't serve image
// bytes; we use the /uc?export=view&id=[ID] form which does.
const WEBSERV_LOGO_FILE_ID = "14-ox8HDssUHVSMWSfv29ULPhDnXzglnQ";
const WEBSERV_LOGO_URL =
  `https://drive.google.com/uc?export=view&id=${WEBSERV_LOGO_FILE_ID}`;

// ─── Block shape (mirrors biweeklyBlockDocxGenerator.ts) ─────────────────────

export type BiweeklyBlockType =
  | "title" | "subtitle" | "paragraph" | "richText"
  | "divider" | "spacer"
  | "kpiSummary" | "dataTable" | "workLog"
  | "callout" | "bulletList" | "numberedList" | "closingSummary";

export interface BiweeklyBlockSettings {
  spacing?: "compact" | "normal" | "relaxed";
  alignment?: "left" | "center" | "right";
  visible?: boolean;
  rows?: number;
  cols?: number;
  colHeaders?: string[];
  tableRows?: string[][];
  kpis?: { label: string; value: string; trend: string }[];
  items?: string[];
  height?: number;
  dividerThickness?: number;
}

export interface BiweeklyBlock {
  id: string;
  type: BiweeklyBlockType;
  content: string;
  settings: BiweeklyBlockSettings;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "#RRGGBB" to the Docs API color shape (rgb floats 0..1). */
function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

function rgbColor(hex: string) {
  return { color: { rgbColor: hexToRgb(hex) } };
}

function cellBorder(hex: string) {
  return {
    color: rgbColor(hex),
    width: { magnitude: 1, unit: "PT" },
    dashStyle: "SOLID",
  };
}

function san(s: string): string {
  return (s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractSources(items: any[]): Array<{ text: string; source?: string }> {
  return (items ?? []).map((i: any) =>
    typeof i === "string" ? { text: i } : { text: i.text ?? "", source: i.source }
  );
}

function sourcesToLabel(items: Array<{ text: string; source?: string }>): string {
  const sources = Array.from(new Set(items.map(i => i.source).filter(Boolean) as string[]));
  return sources.length ? `\n(source: ${sources.join(", ")})` : "";
}

function statusArrow(status: string): string {
  const s = status.toLowerCase().trim();
  if (s.startsWith("ahead") || s.startsWith("on track")) return "↑ ";
  if (s.startsWith("behind")) return "↓ ";
  return "";
}

// ─── Builder that streams content into a request list ────────────────────────
//
// Google Docs API requires us to issue insertions in document order and to
// track each insertion's start/end index so we can style it afterwards.
// We use a cursor-based model: cursor = next insertion index. Every insert
// advances the cursor by the inserted text length.

interface PendingRange {
  startIndex: number;
  endIndex: number;
  style: "title" | "heading" | "body" | "bullet" | "callout";
}

class DocsBuilder {
  private requests: docs_v1.Schema$Request[] = [];
  private styleRequests: docs_v1.Schema$Request[] = [];
  private cursor: number;
  private startCursor: number;
  private t: BiweeklyBrandTokens;
  // Track the last heading/subheading text so a following table can skip
  // its caption when it'd just duplicate that heading.
  private lastHeadingText: string = "";

  constructor(tokens: BiweeklyBrandTokens, startCursor: number = 1) {
    this.t = tokens;
    this.cursor = startCursor;
    this.startCursor = startCursor;
  }

  /** Insert a line of text and return its [start, end] range. End is exclusive. */
  private insertLine(text: string): { start: number; end: number } {
    // Always append a newline so each "line" is its own paragraph.
    const payload = text + "\n";
    this.requests.push({
      insertText: {
        location: { index: this.cursor },
        text: payload,
      },
    });
    const start = this.cursor;
    const end = this.cursor + payload.length;
    this.cursor = end;
    return { start, end };
  }

  /** A blank line (paragraph break). */
  spacer(): void {
    this.insertLine("");
  }

  title(text: string): void {
    const { start, end } = this.insertLine(text);
    // Apply Title style (heading + larger size)
    this.styleRequests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { namedStyleType: "TITLE", alignment: "CENTER" },
        fields: "namedStyleType,alignment",
      },
    });
    this.styleRequests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end - 1 }, // exclude trailing \n
        textStyle: {
          bold: true,
          fontSize: { magnitude: 22, unit: "PT" },
          foregroundColor: rgbColor(this.t.primaryColor),
          weightedFontFamily: { fontFamily: this.t.headingFont, weight: 700 },
        },
        fields: "bold,fontSize,foregroundColor,weightedFontFamily",
      },
    });
  }

  heading(text: string, level: 1 | 2 = 1): void {
    this.lastHeadingText = text;
    const { start, end } = this.insertLine(text);
    this.styleRequests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { namedStyleType: level === 1 ? "HEADING_1" : "HEADING_2" },
        fields: "namedStyleType",
      },
    });
    this.styleRequests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end - 1 },
        textStyle: {
          bold: true,
          fontSize: { magnitude: level === 1 ? 16 : 13, unit: "PT" },
          foregroundColor: rgbColor(this.t.primaryColor),
          weightedFontFamily: { fontFamily: this.t.headingFont, weight: 700 },
        },
        fields: "bold,fontSize,foregroundColor,weightedFontFamily",
      },
    });
  }

  /** Plain body paragraph(s) — newlines split into separate paragraphs. */
  paragraph(text: string): void {
    const lines = text.split("\n");
    for (const line of lines) {
      const { start, end } = this.insertLine(line);
      this.styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          fields: "namedStyleType",
        },
      });
      if (line.length > 0) {
        this.styleRequests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: end - 1 },
            textStyle: {
              fontSize: { magnitude: 10, unit: "PT" },
              foregroundColor: rgbColor(this.t.bodyColor),
              weightedFontFamily: { fontFamily: this.t.bodyFont, weight: 400 },
            },
            fields: "fontSize,foregroundColor,weightedFontFamily",
          },
        });
      }
    }
  }

  bulletList(items: string[]): void {
    if (items.length === 0) return;
    const firstStart = this.cursor;
    let lastEnd = this.cursor;
    for (const item of items) {
      const { start, end } = this.insertLine(item);
      lastEnd = end;
      if (item.length > 0) {
        this.styleRequests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: end - 1 },
            textStyle: {
              fontSize: { magnitude: 10, unit: "PT" },
              foregroundColor: rgbColor(this.t.bodyColor),
              weightedFontFamily: { fontFamily: this.t.bodyFont, weight: 400 },
            },
            fields: "fontSize,foregroundColor,weightedFontFamily",
          },
        });
      }
    }
    // Apply bullet list preset across the whole range
    this.styleRequests.push({
      createParagraphBullets: {
        range: { startIndex: firstStart, endIndex: lastEnd },
        bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
      },
    });
  }

  /**
   * Callout: italic body text styled with the callout body color.
   * We can't easily render a colored left-border accent via the Docs API
   * (Docs has no per-paragraph border styling). Instead we wrap the callout
   * text in a single-cell table where we control cell background + border.
   * For simplicity here, we emit an italicized highlighted paragraph; tables
   * are reserved for actual data tables.
   */
  callout(text: string): void {
    const lines = text.split("\n").filter(Boolean);
    if (lines.length === 0) return;
    for (const line of lines) {
      const { start, end } = this.insertLine(line);
      this.styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: {
            namedStyleType: "NORMAL_TEXT",
            indentStart: { magnitude: 18, unit: "PT" },
            indentEnd: { magnitude: 18, unit: "PT" },
            borderLeft: {
              color: rgbColor(this.t.calloutBorderColor),
              width: { magnitude: 3, unit: "PT" },
              padding: { magnitude: 6, unit: "PT" },
              dashStyle: "SOLID",
            },
            shading: { backgroundColor: rgbColor(this.t.calloutBg) },
          },
          fields: "namedStyleType,indentStart,indentEnd,borderLeft,shading",
        },
      });
      this.styleRequests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: {
            italic: true,
            fontSize: { magnitude: 10, unit: "PT" },
            foregroundColor: rgbColor(this.t.bodyColor),
            weightedFontFamily: { fontFamily: this.t.bodyFont, weight: 400 },
          },
          fields: "italic,fontSize,foregroundColor,weightedFontFamily",
        },
      });
    }
  }

  /**
   * Insert a table. We need a different strategy: tables are inserted
   * empty, then each cell is filled in document order. We process tables
   * AFTER all linear text has been inserted, in a separate batchUpdate,
   * because table insertion shifts indices in ways that are hard to
   * pre-compute.
   *
   * This builder just records that a table should be inserted at the
   * current cursor; the actual insertion happens via insertTablePending().
   */
  private pendingTables: { afterIndex: number; headers: string[]; rows: string[][]; title?: string }[] = [];

  table(headers: string[], rows: string[][], title?: string): void {
    if (title) {
      // Skip the caption entirely if the section heading just above the
      // table is the same text (e.g. "Progress & Quick Wins" section
      // already has a "Progress & Quick Wins" table — the caption is noise).
      const normalize = (s: string) =>
        s.replace(/^\s*\d+\.\s*/, "")  // strip leading "3. "
         .trim()
         .toLowerCase();

      const isDuplicate = normalize(title) === normalize(this.lastHeadingText);

      if (!isDuplicate) {
        // Caption is its own small all-caps red label, not a full heading.
        // Render it as an inline-styled paragraph: uppercase, smaller, red,
        // bold, in the heading font.
        const captionText = title.toUpperCase();
        const { start, end } = this.insertLine(captionText);
        this.styleRequests.push({
          updateParagraphStyle: {
            range: { startIndex: start, endIndex: end },
            paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
            fields: "namedStyleType",
          },
        });
        this.styleRequests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: end - 1 },
            textStyle: {
              bold: true,
              fontSize: { magnitude: 10, unit: "PT" },
              foregroundColor: rgbColor(this.t.primaryColor),
              weightedFontFamily: { fontFamily: this.t.headingFont, weight: 700 },
            },
            fields: "bold,fontSize,foregroundColor,weightedFontFamily",
          },
        });
      }
    }
    // Reserve a position — we'll insert the table here after the first
    // batchUpdate (text + styles) completes. The pendingTables list is
    // processed by buildAndExecute() in a second pass.
    this.pendingTables.push({
      afterIndex: this.cursor,
      headers,
      rows,
      title,
    });
    // Add a placeholder blank line so cursor advances and following
    // content lands where expected. The table will be inserted at this
    // newline's index during pass 2.
    this.spacer();
  }

  divider(): void {
    // Render a horizontal divider as an empty paragraph with a bottom border.
    const { start, end } = this.insertLine("");
    this.styleRequests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: {
          borderBottom: {
            color: rgbColor("#E2E8F0"),
            width: { magnitude: 1, unit: "PT" },
            padding: { magnitude: 2, unit: "PT" },
            dashStyle: "SOLID",
          },
        },
        fields: "borderBottom",
      },
    });
  }

  // ── Build phase ──────────────────────────────────────────────────────────

  /**
   * Returns the two batchUpdate request arrays (text/styles, then tables).
   *
   * Prepends `updateDocumentStyle` and `updateParagraphStyle`-style requests
   * for the document's named styles (Title, Heading 1, Heading 2, Normal
   * Text). Without this, Google Docs falls back to Times New Roman because
   * the document's default style isn't aware of Archivo/Inter. By forcing
   * the font at the named-style level, every paragraph inherits the right
   * font even before the per-range `updateTextStyle` calls land.
   */
  build(): {
    textAndStyles: docs_v1.Schema$Request[];
    pendingTables: { afterIndex: number; headers: string[]; rows: string[][]; title?: string }[];
  } {
    const fontBaseline: docs_v1.Schema$Request[] = [
      // Default style for all body text → Inter
      {
        updateTextStyle: {
          range: { startIndex: this.startCursor, endIndex: this.cursor },
          textStyle: {
            weightedFontFamily: { fontFamily: this.t.bodyFont, weight: 400 },
            fontSize: { magnitude: 10, unit: "PT" },
            foregroundColor: rgbColor(this.t.bodyColor),
          },
          fields: "weightedFontFamily,fontSize,foregroundColor",
        },
      },
    ];

    return {
      // Order matters: baseline first, then our per-range overrides win.
      textAndStyles: [...this.requests, ...fontBaseline, ...this.styleRequests],
      pendingTables: this.pendingTables,
    };
  }
}

// ─── Block hydration (reuse logic shape from biweeklyBlockDocxGenerator) ─────

function hydrateBlocks(blocks: BiweeklyBlock[], report: any): BiweeklyBlock[] {
  const sections: any[]     = report?.sections ?? [];
  const pulseSection        = sections.find((s: any) => s.id === "bw_pulse");
  const progressSection     = sections.find((s: any) => s.id === "bw_progress");
  const purposeSection      = sections.find((s: any) => s.id === "bw_purpose");
  const partnerSection      = sections.find((s: any) => s.id === "bw_partnership");

  return blocks.map((block): BiweeklyBlock => {
    switch (block.id) {
      case "blk-title":
        return {
          ...block,
          content: report?.client_name
            ? `SEO Bi-weekly Report: ${san(report.client_name)}`
            : block.content,
        };

      case "blk-meta":
        return {
          ...block,
          content: [
            `Reporting Period: ${san(report?.reportingWindow ?? "[Date Range]")}`,
            `Prepared by: ${san(report?.preparedBy ?? "[Your Name]")}`,
            `Reporting Date: ${san(report?.date ?? "[Date]")}`,
          ].join("\n"),
        };

      case "blk-purpose":
        return purposeSection?.bullets?.length
          ? { ...block, settings: { ...block.settings, items: purposeSection.bullets.map(san) } }
          : block;

      case "blk-insight":
        return { ...block, content: report?.insightContent ?? block.content };

      case "blk-nsm": {
        const metrics: any[] = pulseSection?.metrics ?? [];
        // v2 warning case: a single metric whose label starts with ⚠
        const warningMetric = metrics.find((m: any) => typeof m.label === "string" && m.label.startsWith("⚠"));
        if (warningMetric) {
          return {
            ...block,
            content: san(warningMetric.label),
            settings: {
              ...block.settings,
              colHeaders: ["Warning"],
              tableRows: [[san(warningMetric.current ?? "NSM data could not be loaded.")]],
            },
          };
        }
        // v2 normal case: each metric's `current` is a pipe-delimited string
        //   "Goal | Actual | % | Status"
        // — NOT separate fields. This matches the old DOCX generator and the
        // upstream report JSON shape produced by biweeklyGenerator.ts.
        const parseRow = (m: any): string[] => {
          const parts = String(m.current ?? "").split("|").map((s: string) => s.trim());
          const [goal = "—", actual = "—", pct = "—", status = "—"] = parts;
          const statusWithArrow = statusArrow(status) + san(status);
          return [san(m.label ?? "—"), san(goal), san(actual), san(pct), statusWithArrow];
        };
        if (metrics.length === 0) return block;
        const tableRows = metrics.map(parseRow);
        return {
          ...block,
          content: "NSM Goals",
          settings: {
            ...block.settings,
            colHeaders: ["Metric", "Goal", "Actual", "%", "Status"],
            tableRows,
          },
        };
      }

      case "blk-progress": {
        // Real data lives in `workLog`, not `rows`. Each entry can carry
        // either flat strings (`whatWeDid` / `whatsNext`) or item arrays
        // (`items[]` / `nextItems[]`) that need joining.
        const workLog: any[] = progressSection?.workLog ?? [];
        if (workLog.length === 0) return { ...block, content: "" };
        const tableRows: string[][] = workLog.map((row: any) => {
          const didItems = extractSources(row.items ?? []);
          const nextItems = extractSources(row.nextItemsRich ?? row.nextItems ?? []);
          const didText = (
            san(row.whatWeDid || didItems.map(i => i.text).filter(Boolean).join("\n")) || "—"
          ) + sourcesToLabel(didItems);
          const nextText = (
            san(row.whatsNext || nextItems.map(i => i.text).filter(Boolean).join("\n")) || "—"
          ) + sourcesToLabel(nextItems);
          return [san(row.area ?? "—"), didText, nextText];
        });
        return {
          ...block,
          content: "", // heading already covers "3. Progress & Quick Wins"
          settings: {
            ...block.settings,
            colHeaders: ["Area", "What We Did / Learned", "What's Next"],
            tableRows,
          },
        };
      }

      case "blk-closing":
        return partnerSection?.bullets?.length
          ? { ...block, settings: { ...block.settings, items: partnerSection.bullets.map(san) } }
          : block;

      default:
        return block;
    }
  });
}

// ─── Default block layout (mirrors biweeklyBlockDocxGenerator DEFAULT_BLOCKS) ─

const DEFAULT_BLOCKS: BiweeklyBlock[] = [
  { id: "blk-title",    type: "title",      content: "SEO Bi-weekly Report: [Client Name]", settings: { visible: true } },
  { id: "blk-meta",     type: "paragraph",  content: "", settings: { visible: true } },
  { id: "blk-div0",     type: "divider",    content: "", settings: { visible: true } },
  { id: "blk-s1",       type: "subtitle",   content: "1. Purpose", settings: { visible: true } },
  { id: "blk-purpose",  type: "bulletList", content: "", settings: { visible: true, items: ["To review recent SEO progress, share quick wins, and align on upcoming priorities."] } },
  { id: "blk-s2",       type: "subtitle",   content: "2. Performance Pulse", settings: { visible: true } },
  { id: "blk-nsm",      type: "dataTable",  content: "NSM Goals", settings: { visible: true, colHeaders: ["Metric","Goal","Actual","%","Status"], tableRows: [["Organic Sessions","—","—","—","—"],["MVP Metric","—","—","—","—"]] } },
  { id: "blk-insight",  type: "callout",    content: "", settings: { visible: true } },
  { id: "blk-s3",       type: "subtitle",   content: "3. Progress & Quick Wins", settings: { visible: true } },
  { id: "blk-progress", type: "dataTable",  content: "Progress & Quick Wins", settings: { visible: true, colHeaders: ["Area","What We Did / Learned","What's Next"], tableRows: [["Content","—","—"],["Optimization","—","—"],["Technical SEO","—","—"],["Local SEO","—","—"]] } },
  { id: "blk-s4",       type: "subtitle",   content: "4. Partnership & Alignment", settings: { visible: true } },
  { id: "blk-closing",  type: "bulletList", content: "", settings: { visible: true, items: ["Open discussion: feedback, lead quality, observations.","Confirm next steps and upcoming deliverables."] } },
];

// ─── Main export ─────────────────────────────────────────────────────────────

export interface CreateBiweeklyDocResult {
  documentId: string;
  webViewLink: string;
  title: string;
}

/**
 * Insert a brand banner at the top of an empty Google Doc.
 *
 * Layout: a 1-row, 2-column table at index 1.
 *   Left cell  → Webserv "W" logo image (inline)
 *   Right cell → "Bi-Weekly SEO Report" in white Archivo bold, right-aligned
 * Both cells share a red background (#C0392B). Borders are zero-width so the
 * banner reads as a solid bar.
 *
 * Returns the cursor position where subsequent content should start
 * (immediately after the banner table's closing paragraph).
 */
async function insertBrandBanner(
  docsClient: docs_v1.Docs,
  documentId: string,
  t: BiweeklyBrandTokens,
): Promise<number> {
  // ─── Centered red logo + spacer ─────────────────────────────────────────
  //
  // No red banner bar. Just a centered Webserv red logo at the top,
  // followed by a blank paragraph so subsequent content starts cleanly.

  const spacer = "\n";

  // Insert a blank paragraph first so we can center the logo in its own paragraph
  try {
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          { insertText: { location: { index: 1 }, text: spacer } },
        ],
      },
    });
  } catch (err: any) {
    console.warn("[biweeklyGoogleDocs] Banner spacer insert failed:", err?.message ?? err);
    return 1;
  }

  const paragraphStart = 1;
  const paragraphEnd   = paragraphStart + spacer.length;

  // Center the paragraph
  try {
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            updateParagraphStyle: {
              range: { startIndex: paragraphStart, endIndex: paragraphEnd },
              paragraphStyle: { alignment: "CENTER" },
              fields: "alignment",
            },
          },
        ],
      },
    });
  } catch (err: any) {
    console.warn("[biweeklyGoogleDocs] Banner centering failed:", err?.message ?? err);
  }

  // Insert the red logo image inline, centered
  try {
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertInlineImage: {
              location: { index: paragraphStart },
              uri: WEBSERV_LOGO_URL,
              objectSize: {
                height: { magnitude: 72, unit: "PT" },
                width:  { magnitude: 72, unit: "PT" },
              },
            },
          },
        ],
      },
    });

    // After the image insert, the cursor shifts forward by 1.
    // Return the position after the paragraph (image + trailing newline).
    return paragraphEnd + 1;
  } catch (err: any) {
    console.warn(
      "[biweeklyGoogleDocs] Banner logo image insertion failed (continuing without logo):",
      err?.message ?? err,
    );
    return paragraphEnd;
  }
}

/**
 * Build a native Google Doc from a biweekly report.
 *
 * @param report          The biweekly report JSON (same shape used by the docx generator)
 * @param savedBlocks     Optional saved template structure (overrides DEFAULT_BLOCKS)
 * @param themeTokens     Optional theme tokens (overrides DEFAULT_TOKENS)
 * @param parentFolderId  Optional Drive folder ID to drop the doc into; if omitted, Drive's My Drive root
 *
 * @returns the created document's id, title, and Drive webViewLink
 */
export async function createBiweeklyGoogleDoc(
  report: any,
  savedBlocks?: any[],
  themeTokens?: Partial<BiweeklyBrandTokens>,
  parentFolderId?: string,
): Promise<CreateBiweeklyDocResult> {
  const t: BiweeklyBrandTokens = { ...DEFAULT_TOKENS, ...themeTokens };

  const templateBlocks: BiweeklyBlock[] = (
    Array.isArray(savedBlocks) &&
    savedBlocks.length > 0 &&
    typeof savedBlocks[0]?.settings === "object"
  ) ? savedBlocks as BiweeklyBlock[] : DEFAULT_BLOCKS;

  const blocks = hydrateBlocks(templateBlocks, report);

  const clientName = san(report?.client_name ?? "Client");
  const date = san(report?.date ?? "");
  const title = `${clientName} Biweekly SEO ${date}`.trim();

  // ── Step 1: create the empty doc ──────────────────────────────────────
  const docsClient = await getDocsClient();
  const createRes = await docsClient.documents.create({ requestBody: { title } });
  const documentId = createRes.data.documentId;
  if (!documentId) throw new Error("Google Docs API: documents.create returned no documentId");

  // ── Step 2: insert the brand banner at the top ─────────────────────────
  //
  // The banner is a single styled paragraph at the top of the document:
  //   - Red background (#C0392B)
  //   - "Bi-Weekly SEO Report" in white Archivo bold, right-aligned
  //   - Webserv "W" logo inserted inline on the left (degrades gracefully
  //     if the image URL is unreachable — the banner still renders)
  //
  // Why a paragraph and not a 1×2 table: the Docs API has an "index N must
  // be less than the end index of the referenced segment, N" error when you
  // try to insert text into a brand-new, freshly-empty table cell. A
  // single paragraph has no such constraint.
  //
  // Returns the cursor position after the banner so all subsequent content
  // appears below it.
  const postBannerCursor = await insertBrandBanner(docsClient, documentId, t);

  // ── Step 3: build text + styles in document order ─────────────────────
  const builder = new DocsBuilder(t, postBannerCursor);

  for (const block of blocks) {
    if (block.settings.visible === false) continue;

    switch (block.type) {
      case "title":
        builder.title(block.content || "Untitled");
        break;

      case "subtitle":
        builder.heading(block.content || "Section", 2);
        break;

      case "paragraph":
      case "richText":
        if (block.content) builder.paragraph(block.content);
        break;

      case "divider":
        builder.divider();
        break;

      case "spacer":
        builder.spacer();
        break;

      case "bulletList":
      case "numberedList":
      case "workLog":
        if (block.content) builder.paragraph(block.content);
        builder.bulletList(block.settings.items ?? []);
        break;

      case "callout":
        if ((block.content ?? "").trim() !== "") {
          builder.callout(block.content);
        }
        break;

      case "dataTable":
        builder.table(
          block.settings.colHeaders ?? [],
          block.settings.tableRows ?? [],
          block.content || undefined,
        );
        break;

      case "closingSummary":
        if (block.content) builder.paragraph(block.content);
        break;
    }

    builder.spacer();
  }

  const { textAndStyles, pendingTables } = builder.build();

  // ── Step 4: apply text + styles ──────────────────────────────────────
  if (textAndStyles.length > 0) {
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: { requests: textAndStyles },
    });
  }

  // ── Step 5: insert tables (in reverse order so indices stay valid) ───
  // After the text pass, indices in pendingTables reflect the doc state
  // AT THE END of pass 3. We insert each table at its recorded position
  // and then style the cells. Reverse order = later insertions don't
  // invalidate earlier recorded positions.
  for (const tbl of [...pendingTables].reverse()) {
    if (tbl.headers.length === 0) continue;

    const rowCount = 1 + tbl.rows.length;
    const colCount = tbl.headers.length;

    // Insert the empty table at the recorded position
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertTable: {
              location: { index: tbl.afterIndex },
              rows: rowCount,
              columns: colCount,
            },
          },
        ],
      },
    });

    // Re-fetch the doc to learn the actual indices of the newly inserted
    // table cells. Tables have an awkward index structure (cell start
    // indices live inside doc.body.content[N].table.tableRows[].tableCells[]).
    const docState = await docsClient.documents.get({ documentId });
    const body = docState.data.body?.content ?? [];

    // Find the table whose startIndex matches what we just inserted.
    // After insertTable, the table starts at tbl.afterIndex + 1 (a paragraph
    // is added before it) — but the safest approach is to locate the table
    // by scanning from tbl.afterIndex forward.
    const tableElement = body.find((el) =>
      el.table && el.startIndex !== undefined && el.startIndex !== null &&
      el.startIndex >= tbl.afterIndex &&
      el.table.rows === rowCount && el.table.columns === colCount
    );

    if (!tableElement?.table) continue;

    // Build cell-fill requests
    const cellRequests: docs_v1.Schema$Request[] = [];
    const tableRows = tableElement.table.tableRows ?? [];

    // Header row
    for (let ci = 0; ci < colCount; ci++) {
      const cell = tableRows[0]?.tableCells?.[ci];
      const cellStart = cell?.content?.[0]?.startIndex;
      if (cellStart === undefined) continue;
      const headerText = tbl.headers[ci] ?? "";
      cellRequests.push({
        insertText: { location: { index: cellStart }, text: headerText },
      });
    }

    // Data rows
    for (let ri = 0; ri < tbl.rows.length; ri++) {
      for (let ci = 0; ci < colCount; ci++) {
        const cell = tableRows[ri + 1]?.tableCells?.[ci];
        const cellStart = cell?.content?.[0]?.startIndex;
        if (cellStart === undefined) continue;
        const cellText = tbl.rows[ri]?.[ci] ?? "";
        cellRequests.push({
          insertText: { location: { index: cellStart }, text: cellText },
        });
      }
    }

    // Insertions must be in reverse-index order so each one doesn't shift
    // the positions of the remaining unprocessed insertions.
    cellRequests.sort((a, b) => {
      const ai = a.insertText?.location?.index ?? 0;
      const bi = b.insertText?.location?.index ?? 0;
      return bi - ai;
    });

    if (cellRequests.length > 0) {
      await docsClient.documents.batchUpdate({
        documentId,
        requestBody: { requests: cellRequests },
      });
    }

    // Re-fetch to get post-insert indices for styling
    const styledState = await docsClient.documents.get({ documentId });
    const styledBody = styledState.data.body?.content ?? [];
    const styledTable = styledBody.find((el) =>
      el.table && el.startIndex !== undefined && el.startIndex !== null &&
      el.startIndex >= tbl.afterIndex &&
      el.table.rows === rowCount && el.table.columns === colCount
    );

    if (styledTable?.table) {
      const sRows = styledTable.table.tableRows ?? [];
      const perCellStyleReqs: docs_v1.Schema$Request[] = [];
      for (let ri = 0; ri < sRows.length; ri++) {
        const row = sRows[ri];
        const isHeader = ri === 0;
        const altShade = !isHeader && (ri % 2 === 0);

        for (let ci = 0; ci < colCount; ci++) {
          const cell = row.tableCells?.[ci];
          if (!cell) continue;
          const cellStart = cell.startIndex;
          const cellEnd = cell.endIndex;
          if (cellStart === undefined || cellStart === null || cellEnd === undefined || cellEnd === null) continue;

          perCellStyleReqs.push({
            updateTableCellStyle: {
              tableCellStyle: {
                backgroundColor: rgbColor(isHeader ? t.tableHeaderBg : (altShade ? t.tableAltRowBg : "#FFFFFF")),
                borderTop:    cellBorder(t.tableBorderColor),
                borderBottom: cellBorder(t.tableBorderColor),
                borderLeft:   cellBorder(t.tableBorderColor),
                borderRight:  cellBorder(t.tableBorderColor),
              },
              tableRange: {
                tableCellLocation: {
                  tableStartLocation: { index: styledTable.startIndex },
                  rowIndex: ri,
                  columnIndex: ci,
                },
                rowSpan: 1,
                columnSpan: 1,
              },
              fields: "backgroundColor,borderTop,borderBottom,borderLeft,borderRight",
            },
          });

          perCellStyleReqs.push({
            updateTextStyle: {
              range: { startIndex: cellStart, endIndex: cellEnd - 1 },
              textStyle: {
                bold: isHeader,
                fontSize: { magnitude: 9, unit: "PT" },
                foregroundColor: rgbColor(isHeader ? t.tableHeaderText : t.bodyColor),
                weightedFontFamily: {
                  fontFamily: isHeader ? t.headingFont : t.bodyFont,
                  weight: isHeader ? 700 : 400,
                },
              },
              fields: "bold,fontSize,foregroundColor,weightedFontFamily",
            },
          });
        }
      }

      if (perCellStyleReqs.length > 0) {
        await docsClient.documents.batchUpdate({
          documentId,
          requestBody: { requests: perCellStyleReqs },
        });
      }

      // ─── Narrow the "Area" column on the Progress & Quick Wins table ──
      // Heuristic: if the first column header is "Area", shrink column 0.
      // We use updateTableColumnProperties (Docs API exposes per-column width
      // via tableColumnProperties[columnIndex]).
      const firstHeader = (tbl.headers[0] ?? "").trim().toLowerCase();
      if (firstHeader === "area" && styledTable?.startIndex !== undefined && styledTable.startIndex !== null) {
        try {
          await docsClient.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  updateTableColumnProperties: {
                    tableStartLocation: { index: styledTable.startIndex },
                    columnIndices: [0],
                    tableColumnProperties: {
                      widthType: "FIXED_WIDTH",
                      width: { magnitude: 90, unit: "PT" },
                    },
                    fields: "widthType,width",
                  },
                },
              ],
            },
          });
        } catch (err: any) {
          console.warn("[biweeklyGoogleDocs] Column-width adjustment failed:", err.message ?? err);
        }
      }
    }
  }

  // ── Step 6: move the doc into the target folder (if specified) ────────
  // NOTE: we now fetch the Drive token from the *google-drive* Replit
  // connector, which carries the correct Drive scope. The docs connector
  // only has docs scope.
  let webViewLink = `https://docs.google.com/document/d/${documentId}/edit`;
  let driveTitle = title;
  if (parentFolderId) {
    try {
      const driveClient = await getDriveClient();
      const fileMeta = await driveClient.files.get({ fileId: documentId, fields: "parents,name,webViewLink" });
      const previousParents = (fileMeta.data.parents ?? []).join(",");
      await driveClient.files.update({
        fileId: documentId,
        addParents: parentFolderId,
        removeParents: previousParents,
        fields: "id, parents",
      });
      webViewLink = fileMeta.data.webViewLink ?? webViewLink;
      driveTitle = fileMeta.data.name ?? driveTitle;
    } catch (err: any) {
      console.warn("[biweeklyGoogleDocs] Folder move failed:", err.message ?? err);
    }
  }

  // ── Step 7: make the doc editable by anyone with the link ───────────
  try {
    const driveClient = await getDriveClient();
    await driveClient.permissions.create({
      fileId: documentId,
      requestBody: {
        role: "writer",
        type: "anyone",
      },
    });
    console.log("[biweeklyGoogleDocs] Document shared with anyone (writer).");
  } catch (err: any) {
    // Non-fatal: doc still exists but may not be publicly editable.
    console.warn("[biweeklyGoogleDocs] Permission share failed:", err.message ?? err);
  }

  return {
    documentId,
    webViewLink,
    title: driveTitle,
  };
}
