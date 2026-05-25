/**
 * server/googleSlidesClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Google Slides exporter for the Monthly Report V2 deck.
 *
 * Why this exists: the prior path generated a .pptx with `pptxgenjs` and
 * uploaded the binary to Drive. Google Drive's auto-convert mangled fonts
 * and table layouts, and the resulting Slides doc was second-class — fonts
 * substituted, colors shifted, every table needing manual re-formatting.
 *
 * This module creates the deck directly as a native Google Slides
 * presentation via the Slides API. The output is editable in the browser
 * the moment the API call returns. No file-format conversion is involved.
 *
 * Auth: reuses the existing OAuth flow in server/googleAuth.ts (same path
 * GSC, GA4, Sheets, and GBP use). The "google_slides" service entry in
 * GOOGLE_SCOPES grants the `presentations` + `drive.file` scopes so the
 * deck can be created and surfaced in the AM's Drive. Tokens are refreshed
 * transparently by getGoogleAccessToken.
 *
 * NOTE: an earlier draft (since corrected) wired this to a Replit
 * `google-slides` connector — Replit doesn't offer one. The codebase's
 * own OAuth flow is the right pattern and is already used by four other
 * Google integrations.
 *
 * Brand: Webserv (red #C0392B, near-black #1A1A1A, warm off-white #FAFAF7),
 * Archivo headings, Inter body — matches the on-screen preview palette.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { google, slides_v1 } from "googleapis";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";
import { getGoogleAccessToken } from "./googleToken";

// ─── OAuth via server/googleAuth.ts ──────────────────────────────────────────
// Connects to the same per-AM consent flow as GSC / GA4 / Sheets / GBP.
// Setup happens once per AM in the Setup page; refresh tokens persist in
// the api_credentials table (encrypted).

async function getSlidesClient(): Promise<slides_v1.Slides> {
  const accessToken = await getGoogleAccessToken("google_slides");
  if (!accessToken) {
    throw new Error(
      "Google Slides not connected — connect a Google account with Slides access in the Setup page (service: google_slides).",
    );
  }
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.slides({ version: "v1", auth: oauth2Client });
}

// ─── Brand tokens — mirror the MV2 palette from report-primitives.tsx ────────

const COLORS = {
  page:       "#FAFAF7",  // warm off-white page surface
  card:       "#FFFFFF",  // white card
  header:     "#1A1A1A",  // near-black header / footer band
  accent:     "#C0392B",  // brand red
  textOnDark: "#FFFFFF",
  textPrimary: "#1A1A1A",
  textSecondary: "#5F5E5A",
  textMuted:  "#888888",
  border:     "#EDEAE0",
  divider:    "#D3D1C7",
  positive:   "#1F8A4C",
  negative:   "#C0392B",
  subtle:     "#F4F1E8",  // callout bg
};

// Slides API canvas — using PT for everything. Default 16:9 size is 10"×5.625"
// which equals 720×405 pt — coincidentally exactly the SLIDE_W/SLIDE_H from
// the React preview, so positions translate 1:1.
const SLIDE_W = 720;
const SLIDE_H = 405;
const HEADER_H = 60;
const FOOTER_H = 28;
const BODY_TOP = HEADER_H + 16;       // 76
const BODY_BOTTOM_PAD = FOOTER_H + 4; // 32 above footer
const BODY_HEIGHT = SLIDE_H - BODY_TOP - BODY_BOTTOM_PAD;
const SIDE_INSET = 28;

const FONT_HEADER = "Archivo";
const FONT_BODY   = "Inter";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const clean = hex.replace(/^#/, "");
  return {
    red:   parseInt(clean.slice(0, 2), 16) / 255,
    green: parseInt(clean.slice(2, 4), 16) / 255,
    blue:  parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function rgbColor(hex: string) {
  return { opaqueColor: { rgbColor: hexToRgb(hex) } };
}

function pt(magnitude: number) {
  return { magnitude, unit: "PT" as const };
}

// Unique object ID generator. Slides API requires consistent IDs across
// requests in a single batchUpdate so we can refer to created shapes by ID.
let _objCounter = 0;
function nextId(prefix: string): string {
  _objCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_objCounter}`;
}

function editsResolve(edits: Record<string, string> | undefined, key: string, fallback: string): string {
  if (edits && typeof edits[key] === "string" && edits[key].length > 0) return edits[key];
  return fallback;
}

// ─── Shape primitives ────────────────────────────────────────────────────────

interface ShapeArgs {
  pageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  textColor?: string;
  bgColor?: string | null;
  align?: "LEFT" | "CENTER" | "RIGHT";
  letterSpacing?: number;
  uppercase?: boolean;
}

/** Build the requests to create a single text box. Returns objectId so the
 *  caller can reference it for follow-up styling if needed. */
function textBoxRequests(args: ShapeArgs): { objectId: string; requests: slides_v1.Schema$Request[] } {
  const objectId = nextId("shape");
  const reqs: slides_v1.Schema$Request[] = [];

  reqs.push({
    createShape: {
      objectId,
      shapeType: "TEXT_BOX",
      elementProperties: {
        pageObjectId: args.pageId,
        size: { width: pt(args.w), height: pt(args.h) },
        transform: { scaleX: 1, scaleY: 1, translateX: args.x, translateY: args.y, unit: "PT" },
      },
    },
  });

  if (args.bgColor) {
    reqs.push({
      updateShapeProperties: {
        objectId,
        fields: "shapeBackgroundFill.solidFill.color",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(args.bgColor) } } },
        },
      },
    });
  }

  const displayText = args.uppercase ? args.text.toUpperCase() : args.text;

  reqs.push({
    insertText: { objectId, insertionIndex: 0, text: displayText },
  });

  reqs.push({
    updateTextStyle: {
      objectId,
      textRange: { type: "ALL" },
      fields: "fontFamily,fontSize,bold,foregroundColor,weightedFontFamily",
      style: {
        fontFamily: args.fontFamily ?? FONT_BODY,
        weightedFontFamily: { fontFamily: args.fontFamily ?? FONT_BODY, weight: args.bold ? 700 : 400 },
        fontSize: pt(args.fontSize ?? 10),
        bold: !!args.bold,
        foregroundColor: rgbColor(args.textColor ?? COLORS.textPrimary),
      },
    },
  });

  reqs.push({
    updateParagraphStyle: {
      objectId,
      textRange: { type: "ALL" },
      fields: "alignment",
      style: { alignment: args.align ?? "LEFT" },
    },
  });

  return { objectId, requests: reqs };
}

/** Solid-filled rectangle — used for header band, footer band, accent strips. */
function rectRequests(opts: { pageId: string; x: number; y: number; w: number; h: number; fill: string }): { objectId: string; requests: slides_v1.Schema$Request[] } {
  const objectId = nextId("rect");
  return {
    objectId,
    requests: [
      {
        createShape: {
          objectId,
          shapeType: "RECTANGLE",
          elementProperties: {
            pageObjectId: opts.pageId,
            size: { width: pt(opts.w), height: pt(opts.h) },
            transform: { scaleX: 1, scaleY: 1, translateX: opts.x, translateY: opts.y, unit: "PT" },
          },
        },
      },
      {
        updateShapeProperties: {
          objectId,
          fields: "shapeBackgroundFill.solidFill.color,outline.outlineFill.solidFill.color,outline.weight",
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(opts.fill) } } },
            outline: { outlineFill: { solidFill: { color: { rgbColor: hexToRgb(opts.fill) } } }, weight: pt(0) },
          },
        },
      },
    ],
  };
}

/** Bulleted list inside a text box. Each line becomes a bullet. */
function bulletListRequests(opts: { pageId: string; x: number; y: number; w: number; h: number; lines: string[]; fontSize?: number; color?: string }): { objectId: string; requests: slides_v1.Schema$Request[] } {
  const objectId = nextId("bullets");
  const reqs: slides_v1.Schema$Request[] = [];
  const joined = opts.lines.join("\n");

  reqs.push({
    createShape: {
      objectId,
      shapeType: "TEXT_BOX",
      elementProperties: {
        pageObjectId: opts.pageId,
        size: { width: pt(opts.w), height: pt(opts.h) },
        transform: { scaleX: 1, scaleY: 1, translateX: opts.x, translateY: opts.y, unit: "PT" },
      },
    },
  });
  if (joined.length > 0) {
    reqs.push({ insertText: { objectId, insertionIndex: 0, text: joined } });
    reqs.push({
      updateTextStyle: {
        objectId,
        textRange: { type: "ALL" },
        fields: "fontFamily,fontSize,foregroundColor,weightedFontFamily",
        style: {
          fontFamily: FONT_BODY,
          weightedFontFamily: { fontFamily: FONT_BODY, weight: 400 },
          fontSize: pt(opts.fontSize ?? 10),
          foregroundColor: rgbColor(opts.color ?? COLORS.textPrimary),
        },
      },
    });
    reqs.push({
      createParagraphBullets: {
        objectId,
        textRange: { type: "ALL" },
        bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
      },
    });
  }
  return { objectId, requests: reqs };
}

/** Native Slides table populated row by row. */
function tableRequests(opts: { pageId: string; x: number; y: number; w: number; h: number; headers: string[]; rows: (string | number)[][] }): slides_v1.Schema$Request[] {
  const tableId = nextId("table");
  const cols = opts.headers.length;
  const rows = opts.rows.length + 1; // +1 for header row
  const reqs: slides_v1.Schema$Request[] = [];

  reqs.push({
    createTable: {
      objectId: tableId,
      elementProperties: {
        pageObjectId: opts.pageId,
        size: { width: pt(opts.w), height: pt(opts.h) },
        transform: { scaleX: 1, scaleY: 1, translateX: opts.x, translateY: opts.y, unit: "PT" },
      },
      rows,
      columns: cols,
    },
  });

  // Header row text
  for (let c = 0; c < cols; c++) {
    reqs.push({
      insertText: {
        objectId: tableId,
        cellLocation: { rowIndex: 0, columnIndex: c },
        text: opts.headers[c] ?? "",
      },
    });
    reqs.push({
      updateTextStyle: {
        objectId: tableId,
        cellLocation: { rowIndex: 0, columnIndex: c },
        textRange: { type: "ALL" },
        fields: "fontFamily,fontSize,bold,foregroundColor,weightedFontFamily",
        style: {
          fontFamily: FONT_BODY,
          weightedFontFamily: { fontFamily: FONT_BODY, weight: 600 },
          fontSize: pt(8),
          bold: true,
          foregroundColor: rgbColor(COLORS.textMuted),
        },
      },
    });
  }

  // Body rows
  for (let r = 0; r < opts.rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      const raw = String(opts.rows[r][c] ?? "");
      // Color delta-ish cells. Heuristic: starts with + → positive, - → negative.
      const isDelta = /^[-+]?\d+(\.\d+)?%/.test(raw) || /^[-+]\d/.test(raw);
      const color = isDelta && raw.startsWith("+")
        ? COLORS.positive
        : isDelta && raw.startsWith("-")
        ? COLORS.negative
        : COLORS.textPrimary;
      reqs.push({
        insertText: {
          objectId: tableId,
          cellLocation: { rowIndex: r + 1, columnIndex: c },
          text: raw,
        },
      });
      reqs.push({
        updateTextStyle: {
          objectId: tableId,
          cellLocation: { rowIndex: r + 1, columnIndex: c },
          textRange: { type: "ALL" },
          fields: "fontFamily,fontSize,foregroundColor,weightedFontFamily",
          style: {
            fontFamily: FONT_BODY,
            weightedFontFamily: { fontFamily: FONT_BODY, weight: isDelta ? 500 : 400 },
            fontSize: pt(9),
            foregroundColor: rgbColor(color),
          },
        },
      });
    }
  }

  return reqs;
}

// ─── Slide chrome — header band + footer band + page background ──────────────

function chromeRequests(opts: { pageId: string; title: string; subtitle?: string; pageIndicator?: string; sourceLabel?: string; dateLabel?: string }): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];

  // Page background — warm off-white
  reqs.push({
    updatePageProperties: {
      objectId: opts.pageId,
      fields: "pageBackgroundFill.solidFill.color",
      pageProperties: {
        pageBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(COLORS.page) } } },
      },
    },
  });

  // Black header band
  const headerRect = rectRequests({ pageId: opts.pageId, x: 0, y: 0, w: SLIDE_W, h: HEADER_H, fill: COLORS.header });
  reqs.push(...headerRect.requests);

  // Title text on header
  const titleBox = textBoxRequests({
    pageId: opts.pageId,
    x: SIDE_INSET, y: 14, w: SLIDE_W - SIDE_INSET * 2 - 60, h: 24,
    text: opts.title,
    fontFamily: FONT_HEADER,
    fontSize: 16,
    textColor: COLORS.textOnDark,
    bold: false,
  });
  reqs.push(...titleBox.requests);

  // Subtitle text on header (small, muted)
  if (opts.subtitle) {
    const subBox = textBoxRequests({
      pageId: opts.pageId,
      x: SIDE_INSET, y: 38, w: SLIDE_W - SIDE_INSET * 2 - 60, h: 14,
      text: opts.subtitle,
      fontSize: 8,
      textColor: "#9B9A95",
      letterSpacing: 0.5,
    });
    reqs.push(...subBox.requests);
  }

  // Page indicator (top right)
  if (opts.pageIndicator) {
    const piBox = textBoxRequests({
      pageId: opts.pageId,
      x: SLIDE_W - SIDE_INSET - 50, y: 22, w: 50, h: 14,
      text: opts.pageIndicator,
      fontSize: 8,
      textColor: "#9B9A95",
      align: "RIGHT",
    });
    reqs.push(...piBox.requests);
  }

  // Red accent line above footer
  const accentLine = rectRequests({
    pageId: opts.pageId,
    x: 0, y: SLIDE_H - FOOTER_H - 2, w: SLIDE_W, h: 2,
    fill: COLORS.accent,
  });
  reqs.push(...accentLine.requests);

  // Black footer band
  const footerRect = rectRequests({ pageId: opts.pageId, x: 0, y: SLIDE_H - FOOTER_H, w: SLIDE_W, h: FOOTER_H, fill: COLORS.header });
  reqs.push(...footerRect.requests);

  // Footer labels
  if (opts.sourceLabel) {
    const slBox = textBoxRequests({
      pageId: opts.pageId,
      x: SIDE_INSET, y: SLIDE_H - FOOTER_H + 8, w: SLIDE_W / 2 - SIDE_INSET, h: 12,
      text: opts.sourceLabel,
      fontSize: 7,
      textColor: COLORS.textMuted,
    });
    reqs.push(...slBox.requests);
  }
  if (opts.dateLabel) {
    const dlBox = textBoxRequests({
      pageId: opts.pageId,
      x: SLIDE_W / 2, y: SLIDE_H - FOOTER_H + 8, w: SLIDE_W / 2 - SIDE_INSET, h: 12,
      text: opts.dateLabel,
      fontSize: 7,
      textColor: COLORS.textMuted,
      align: "RIGHT",
    });
    reqs.push(...dlBox.requests);
  }

  return reqs;
}

// ─── Per-slide-type request builders ─────────────────────────────────────────

function buildCoverSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Monthly Report");
  const clientName = editsResolve(edits, `${slide.id}_client`, slide.clientName ?? "");
  const date = slide.date ?? "";
  const producedBy = editsResolve(edits, `${slide.id}_producedBy`, slide.producedBy ?? "");

  // Full dark page background
  reqs.push({
    updatePageProperties: {
      objectId: pageId,
      fields: "pageBackgroundFill.solidFill.color",
      pageProperties: {
        pageBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(COLORS.header) } } },
      },
    },
  });
  // Red top stripe
  const stripe = rectRequests({ pageId, x: 0, y: 0, w: SLIDE_W, h: 4, fill: COLORS.accent });
  reqs.push(...stripe.requests);

  // Eyebrow top-left
  const eyebrow = textBoxRequests({
    pageId, x: 44, y: 28, w: 400, h: 14,
    text: "SEO Monthly Report",
    fontSize: 9, textColor: "#B4B2A9", letterSpacing: 1.5, uppercase: true,
  });
  reqs.push(...eyebrow.requests);

  // Date top-right
  if (date) {
    const dateBox = textBoxRequests({
      pageId, x: SLIDE_W - 250 - 44, y: 28, w: 250, h: 14,
      text: date, fontSize: 9, textColor: "#B4B2A9", letterSpacing: 1.5, uppercase: true, align: "RIGHT",
    });
    reqs.push(...dateBox.requests);
  }

  // Red eyebrow above title
  const redEyebrow = textBoxRequests({
    pageId, x: 44, y: 130, w: SLIDE_W - 88, h: 18,
    text: title, fontSize: 10, textColor: COLORS.accent, letterSpacing: 1.8, uppercase: true, bold: true,
  });
  reqs.push(...redEyebrow.requests);

  // Huge client name
  const clientBox = textBoxRequests({
    pageId, x: 44, y: 160, w: SLIDE_W - 88, h: 120,
    text: clientName, fontFamily: FONT_HEADER, fontSize: 42, textColor: COLORS.textOnDark,
  });
  reqs.push(...clientBox.requests);

  // Produced by bottom-left
  if (producedBy) {
    const pbBox = textBoxRequests({
      pageId, x: 44, y: SLIDE_H - 40, w: 400, h: 14,
      text: `PRODUCED BY  ${producedBy}`,
      fontSize: 8, textColor: "#B4B2A9", letterSpacing: 1.2, uppercase: true,
    });
    reqs.push(...pbBox.requests);
  }

  // "Cover" indicator bottom-right
  const coverIndicator = textBoxRequests({
    pageId, x: SLIDE_W - 200 - 44, y: SLIDE_H - 40, w: 200, h: 14,
    text: "Cover", fontSize: 8, textColor: "#B4B2A9", letterSpacing: 1.2, uppercase: true, align: "RIGHT",
  });
  reqs.push(...coverIndicator.requests);

  return reqs;
}

function buildExecSummarySlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Headline & executive summary");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const headline = editsResolve(edits, `${slide.id}_headline`, slide.headline ?? "—");
  const narrative = editsResolve(edits, `${slide.id}_narrative`, slide.narrative ?? "—");
  const keyMoves = (slide.keyMoves ?? []).map((m, i) => editsResolve(edits, `${slide.id}_keymove_${i}`, m));

  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "Synthesis of all sources", dateLabel: subtitle }));

  // Headline card
  const headlineCardH = 56;
  const headlineEyebrow = textBoxRequests({
    pageId, x: SIDE_INSET + 12, y: BODY_TOP + 6, w: 100, h: 12,
    text: "Headline", fontSize: 7, textColor: COLORS.textMuted, letterSpacing: 1.2, uppercase: true,
  });
  reqs.push(...headlineEyebrow.requests);
  const headlineCard = textBoxRequests({
    pageId, x: SIDE_INSET + 12, y: BODY_TOP + 22, w: SLIDE_W - SIDE_INSET * 2 - 24, h: headlineCardH - 22,
    text: headline, fontFamily: FONT_HEADER, fontSize: 16, textColor: COLORS.textPrimary,
  });
  reqs.push(...headlineCard.requests);

  // Narrative callout (warm subtle bg)
  const narrativeY = BODY_TOP + headlineCardH + 10;
  const keyMovesH = 70;
  const narrativeH = BODY_HEIGHT - headlineCardH - keyMovesH - 20;
  const narrBg = rectRequests({ pageId, x: SIDE_INSET, y: narrativeY, w: SLIDE_W - SIDE_INSET * 2, h: narrativeH, fill: COLORS.subtle });
  reqs.push(...narrBg.requests);
  // Left red accent strip
  const narrAccent = rectRequests({ pageId, x: SIDE_INSET, y: narrativeY, w: 3, h: narrativeH, fill: COLORS.accent });
  reqs.push(...narrAccent.requests);
  const narrBox = textBoxRequests({
    pageId, x: SIDE_INSET + 14, y: narrativeY + 10, w: SLIDE_W - SIDE_INSET * 2 - 28, h: narrativeH - 20,
    text: narrative, fontSize: 11, textColor: "#2C2C2A",
  });
  reqs.push(...narrBox.requests);

  // Key moves row
  const keyMovesY = SLIDE_H - BODY_BOTTOM_PAD - keyMovesH;
  const cardCount = Math.max(keyMoves.length, 1);
  const cardWidth = (SLIDE_W - SIDE_INSET * 2 - (cardCount - 1) * 8) / cardCount;
  for (let i = 0; i < keyMoves.length; i++) {
    const x = SIDE_INSET + i * (cardWidth + 8);
    const cardBg = rectRequests({ pageId, x, y: keyMovesY, w: cardWidth, h: keyMovesH, fill: COLORS.card });
    reqs.push(...cardBg.requests);
    const eyebrow = textBoxRequests({
      pageId, x: x + 10, y: keyMovesY + 8, w: cardWidth - 20, h: 12,
      text: `Key move ${i + 1}`, fontSize: 7, textColor: COLORS.accent, bold: true, letterSpacing: 1, uppercase: true,
    });
    reqs.push(...eyebrow.requests);
    const body = textBoxRequests({
      pageId, x: x + 10, y: keyMovesY + 24, w: cardWidth - 20, h: keyMovesH - 32,
      text: keyMoves[i], fontSize: 9, textColor: COLORS.textPrimary,
    });
    reqs.push(...body.requests);
  }

  return reqs;
}

/** Generic stat-card row used by outcomes, visibility, stat_grid. Returns the
 *  y-coordinate just below the row so the caller can stack more content. */
function statCardRow(opts: { pageId: string; metrics: NonNullable<Slide["metrics"]>; topY: number }): { requests: slides_v1.Schema$Request[]; bottomY: number } {
  const reqs: slides_v1.Schema$Request[] = [];
  const metrics = (opts.metrics ?? []).slice(0, 4);
  if (metrics.length === 0) return { requests: reqs, bottomY: opts.topY };
  const cardH = 64;
  const gap = 8;
  const cardW = (SLIDE_W - SIDE_INSET * 2 - (metrics.length - 1) * gap) / metrics.length;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const x = SIDE_INSET + i * (cardW + gap);
    const bg = rectRequests({ pageId: opts.pageId, x, y: opts.topY, w: cardW, h: cardH, fill: COLORS.card });
    reqs.push(...bg.requests);
    const lbl = textBoxRequests({
      pageId: opts.pageId, x: x + 10, y: opts.topY + 8, w: cardW - 20, h: 10,
      text: m.label, fontSize: 7, textColor: COLORS.textMuted, uppercase: true, letterSpacing: 0.4, bold: true,
    });
    reqs.push(...lbl.requests);
    const val = textBoxRequests({
      pageId: opts.pageId, x: x + 10, y: opts.topY + 22, w: cardW - 20, h: 22,
      text: String(m.current ?? "—"), fontFamily: FONT_HEADER, fontSize: 16, textColor: COLORS.textPrimary, bold: true,
    });
    reqs.push(...val.requests);
    if (m.delta) {
      const deltaColor = m.isPositive === true ? COLORS.positive : m.isPositive === false ? COLORS.negative : COLORS.textSecondary;
      const d = textBoxRequests({
        pageId: opts.pageId, x: x + 10, y: opts.topY + 46, w: cardW - 20, h: 12,
        text: m.delta, fontSize: 9, textColor: deltaColor, bold: true,
      });
      reqs.push(...d.requests);
    }
  }
  return { requests: reqs, bottomY: opts.topY + cardH };
}

/** Warm-bg insight callout. Returns requests + bottom Y. */
function insightCallout(opts: { pageId: string; topY: number; height: number; text: string }): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const bg = rectRequests({ pageId: opts.pageId, x: SIDE_INSET, y: opts.topY, w: SLIDE_W - SIDE_INSET * 2, h: opts.height, fill: COLORS.subtle });
  reqs.push(...bg.requests);
  const accent = rectRequests({ pageId: opts.pageId, x: SIDE_INSET, y: opts.topY, w: 3, h: opts.height, fill: COLORS.accent });
  reqs.push(...accent.requests);
  const body = textBoxRequests({
    pageId: opts.pageId, x: SIDE_INSET + 14, y: opts.topY + 8, w: SLIDE_W - SIDE_INSET * 2 - 28, h: opts.height - 16,
    text: opts.text, fontSize: 10, textColor: "#2C2C2A",
  });
  reqs.push(...body.requests);
  return reqs;
}

function buildOutcomesSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Business outcomes");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "GA4 · Call tracker · NSM Tracker", dateLabel: subtitle }));

  const cards = statCardRow({ pageId, metrics: slide.metrics ?? [], topY: BODY_TOP });
  reqs.push(...cards.requests);

  let nextY = cards.bottomY + 12;

  // Pacing badges in a row
  if ((slide.pacingBadges ?? []).length > 0) {
    const badges = slide.pacingBadges!;
    const pacingH = 70;
    const bg = rectRequests({ pageId, x: SIDE_INSET, y: nextY, w: SLIDE_W - SIDE_INSET * 2, h: pacingH, fill: COLORS.card });
    reqs.push(...bg.requests);
    const eyebrow = textBoxRequests({
      pageId, x: SIDE_INSET + 12, y: nextY + 8, w: 200, h: 10,
      text: "QTD goal pacing", fontSize: 7, textColor: COLORS.textMuted, uppercase: true, bold: true, letterSpacing: 1.2,
    });
    reqs.push(...eyebrow.requests);
    const colW = (SLIDE_W - SIDE_INSET * 2 - 24) / badges.length;
    for (let i = 0; i < badges.length; i++) {
      const b = badges[i];
      const x = SIDE_INSET + 12 + i * colW;
      const statusColor = b.status === "Ahead" ? COLORS.positive : b.status === "At Risk" ? COLORS.negative : COLORS.textSecondary;
      const sep = rectRequests({ pageId, x, y: nextY + 24, w: 2, h: pacingH - 32, fill: statusColor });
      reqs.push(...sep.requests);
      const lbl = textBoxRequests({
        pageId, x: x + 8, y: nextY + 22, w: colW - 16, h: 10,
        text: b.label, fontSize: 7, textColor: COLORS.textMuted,
      });
      reqs.push(...lbl.requests);
      const val = textBoxRequests({
        pageId, x: x + 8, y: nextY + 34, w: colW - 16, h: 16,
        text: `${b.current}  /  ${b.goal}`, fontFamily: FONT_HEADER, fontSize: 12, textColor: COLORS.textPrimary, bold: true,
      });
      reqs.push(...val.requests);
      const status = textBoxRequests({
        pageId, x: x + 8, y: nextY + 52, w: colW - 16, h: 10,
        text: `${b.status.toUpperCase()} · ${b.pacingPercent}`,
        fontSize: 7, textColor: statusColor, bold: true, letterSpacing: 0.4,
      });
      reqs.push(...status.requests);
    }
    nextY += pacingH + 10;
  }

  // Commentary callout fills the rest
  if (commentary) {
    const calloutH = Math.max(40, SLIDE_H - BODY_BOTTOM_PAD - nextY);
    reqs.push(...insightCallout({ pageId, topY: nextY, height: calloutH, text: commentary }));
  }

  return reqs;
}

function buildStatGridSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined, sourceLabel: string): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel, dateLabel: subtitle }));

  const cards = statCardRow({ pageId, metrics: slide.metrics ?? [], topY: BODY_TOP });
  reqs.push(...cards.requests);
  let nextY = cards.bottomY + 12;

  const headers = slide.table?.headers ?? [];
  const rows = slide.table?.rows ?? [];
  if (rows.length > 0) {
    const tableH = Math.min(SLIDE_H - BODY_BOTTOM_PAD - nextY - 50, 22 * (rows.length + 1) + 12);
    reqs.push(...tableRequests({ pageId, x: SIDE_INSET, y: nextY, w: SLIDE_W - SIDE_INSET * 2, h: tableH, headers, rows }));
    nextY += tableH + 10;
  }

  if (commentary) {
    const calloutH = Math.max(40, SLIDE_H - BODY_BOTTOM_PAD - nextY);
    reqs.push(...insightCallout({ pageId, topY: nextY, height: calloutH, text: commentary }));
  }

  return reqs;
}

function buildKeywordTableSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Keyword & intent movement");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "GSC · Topic clustering", dateLabel: subtitle }));

  const headers = slide.table?.headers ?? [];
  const rows = slide.table?.rows ?? [];
  const tableH = BODY_HEIGHT - (commentary ? 60 : 0) - 10;
  if (rows.length > 0) {
    reqs.push(...tableRequests({ pageId, x: SIDE_INSET, y: BODY_TOP, w: SLIDE_W - SIDE_INSET * 2, h: tableH, headers, rows }));
  }

  if (commentary) {
    const calloutY = BODY_TOP + tableH + 8;
    const calloutH = SLIDE_H - BODY_BOTTOM_PAD - calloutY;
    reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
  }

  return reqs;
}

function buildIntentAlignmentSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Search intent alignment");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  const findings = slide.intentFindings ?? [];
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "GSC query-to-page map", dateLabel: subtitle }));

  if (findings.length === 0) {
    // Just show the commentary big
    reqs.push(...insightCallout({ pageId, topY: BODY_TOP, height: BODY_HEIGHT, text: commentary || "No major intent misalignments detected." }));
    return reqs;
  }

  // Vertical stack of finding cards
  const cardCount = Math.min(findings.length, 5);
  const totalCardH = BODY_HEIGHT - (commentary ? 44 : 0) - 8;
  const cardH = (totalCardH - (cardCount - 1) * 6) / cardCount;
  for (let i = 0; i < cardCount; i++) {
    const f = findings[i];
    const y = BODY_TOP + i * (cardH + 6);
    const bg = rectRequests({ pageId, x: SIDE_INSET, y, w: SLIDE_W - SIDE_INSET * 2, h: cardH, fill: COLORS.card });
    reqs.push(...bg.requests);
    const url = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: y + 6, w: SLIDE_W - SIDE_INSET * 2 - 20, h: 10,
      text: editsResolve(edits, `${slide.id}_finding_${i}_url`, f.url), fontSize: 8, textColor: COLORS.accent, bold: true,
    });
    reqs.push(...url.requests);
    // Expected / Observed split
    const colW = (SLIDE_W - SIDE_INSET * 2 - 30) / 2;
    const expEy = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: y + 20, w: colW, h: 8,
      text: "Expected", fontSize: 6, textColor: COLORS.textMuted, uppercase: true, letterSpacing: 0.4,
    });
    reqs.push(...expEy.requests);
    const expBody = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: y + 28, w: colW, h: 18,
      text: editsResolve(edits, `${slide.id}_finding_${i}_expected`, f.expected),
      fontSize: 8, textColor: COLORS.textPrimary,
    });
    reqs.push(...expBody.requests);
    const obsEy = textBoxRequests({
      pageId, x: SIDE_INSET + 10 + colW + 10, y: y + 20, w: colW, h: 8,
      text: "Observed", fontSize: 6, textColor: COLORS.textMuted, uppercase: true, letterSpacing: 0.4,
    });
    reqs.push(...obsEy.requests);
    const obsBody = textBoxRequests({
      pageId, x: SIDE_INSET + 10 + colW + 10, y: y + 28, w: colW, h: 18,
      text: editsResolve(edits, `${slide.id}_finding_${i}_observed`, f.observed),
      fontSize: 8, textColor: COLORS.textPrimary,
    });
    reqs.push(...obsBody.requests);
    // Recommendation row
    const recEy = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: y + cardH - 22, w: SLIDE_W - SIDE_INSET * 2 - 20, h: 8,
      text: "Recommendation", fontSize: 6, textColor: COLORS.textMuted, uppercase: true, letterSpacing: 0.4,
    });
    reqs.push(...recEy.requests);
    const recBody = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: y + cardH - 14, w: SLIDE_W - SIDE_INSET * 2 - 20, h: 12,
      text: editsResolve(edits, `${slide.id}_finding_${i}_rec`, f.recommendation),
      fontSize: 8, textColor: COLORS.textPrimary,
    });
    reqs.push(...recBody.requests);
  }

  if (commentary) {
    const calloutY = BODY_TOP + totalCardH + 4;
    const calloutH = SLIDE_H - BODY_BOTTOM_PAD - calloutY;
    reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
  }

  return reqs;
}

function buildContentPipelineSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Content pipeline");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "Airtable Production view", dateLabel: subtitle }));

  const headers = slide.table?.headers ?? [];
  const rows = slide.table?.rows ?? [];
  if (rows.length > 0) {
    reqs.push(...tableRequests({ pageId, x: SIDE_INSET, y: BODY_TOP, w: SLIDE_W - SIDE_INSET * 2, h: BODY_HEIGHT, headers, rows }));
  } else {
    const empty = textBoxRequests({
      pageId, x: SIDE_INSET, y: BODY_TOP + BODY_HEIGHT / 2 - 10, w: SLIDE_W - SIDE_INSET * 2, h: 20,
      text: "No content scheduled for next month.", fontSize: 11, textColor: COLORS.textMuted, align: "CENTER",
    });
    reqs.push(...empty.requests);
  }

  return reqs;
}

function buildInitiativesSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Strategic initiatives & next month priorities");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "Asana · AM input", dateLabel: subtitle }));

  const headers = slide.table?.headers ?? [];
  const rows = slide.table?.rows ?? [];
  const bullets = (slide.bullets ?? []).map((b, i) => editsResolve(edits, `${slide.id}_priority_${i}`, b));
  const panelH = BODY_HEIGHT - (commentary ? 50 : 0) - 10;
  const colW = (SLIDE_W - SIDE_INSET * 2 - 12) / 2;

  // Left card — this month
  const leftBg = rectRequests({ pageId, x: SIDE_INSET, y: BODY_TOP, w: colW, h: panelH, fill: COLORS.card });
  reqs.push(...leftBg.requests);
  const leftEy = textBoxRequests({
    pageId, x: SIDE_INSET + 10, y: BODY_TOP + 8, w: colW - 20, h: 10,
    text: "This month", fontSize: 7, textColor: COLORS.textMuted, uppercase: true, letterSpacing: 1.2, bold: true,
  });
  reqs.push(...leftEy.requests);
  if (rows.length > 0) {
    reqs.push(...tableRequests({
      pageId, x: SIDE_INSET + 10, y: BODY_TOP + 22, w: colW - 20, h: panelH - 30,
      headers, rows,
    }));
  } else {
    const leftEmpty = textBoxRequests({
      pageId, x: SIDE_INSET + 10, y: BODY_TOP + 28, w: colW - 20, h: 20,
      text: "No Asana data — connect Asana in client settings.",
      fontSize: 9, textColor: COLORS.textMuted,
    });
    reqs.push(...leftEmpty.requests);
  }

  // Right card — priorities bullets
  const rightX = SIDE_INSET + colW + 12;
  const rightBg = rectRequests({ pageId, x: rightX, y: BODY_TOP, w: colW, h: panelH, fill: COLORS.card });
  reqs.push(...rightBg.requests);
  const rightEy = textBoxRequests({
    pageId, x: rightX + 10, y: BODY_TOP + 8, w: colW - 20, h: 10,
    text: "Next month priorities", fontSize: 7, textColor: COLORS.accent, uppercase: true, letterSpacing: 1.2, bold: true,
  });
  reqs.push(...rightEy.requests);
  if (bullets.length > 0) {
    const bl = bulletListRequests({
      pageId, x: rightX + 10, y: BODY_TOP + 22, w: colW - 20, h: panelH - 30,
      lines: bullets, fontSize: 9, color: COLORS.textPrimary,
    });
    reqs.push(...bl.requests);
  } else {
    const rEmpty = textBoxRequests({
      pageId, x: rightX + 10, y: BODY_TOP + 28, w: colW - 20, h: 20,
      text: "Add priorities in the AM input form.",
      fontSize: 9, textColor: COLORS.textMuted,
    });
    reqs.push(...rEmpty.requests);
  }

  if (commentary) {
    const calloutY = BODY_TOP + panelH + 6;
    const calloutH = SLIDE_H - BODY_BOTTOM_PAD - calloutY;
    reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
  }

  return reqs;
}

// Visibility looks like stat_grid + cluster table — same shape, different
// source label. Use the stat_grid builder.

// ─── Phase 3h — custom slides ────────────────────────────────────────────────
// Branches on slide.layout. Each layout reuses an existing primitive (stat
// row, prose card, table, story-style headline+narrative+facts) so the visual
// vocabulary matches the rest of the deck.
function buildCustomSlide(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  const reqs: slides_v1.Schema$Request[] = [];
  const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "Custom slide");
  const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
  const commentary = editsResolve(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  const layout = slide.layout ?? "prose_card";
  reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "Custom (AM-authored)", dateLabel: subtitle }));

  if (layout === "stat_grid") {
    const cards = statCardRow({ pageId, metrics: slide.metrics ?? [], topY: BODY_TOP });
    reqs.push(...cards.requests);
    if (commentary) {
      const calloutY = cards.bottomY + 12;
      const calloutH = Math.max(40, SLIDE_H - BODY_BOTTOM_PAD - calloutY);
      reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
    }
    return reqs;
  }

  if (layout === "comparison_table") {
    const headers = slide.table?.headers ?? [];
    const rows = slide.table?.rows ?? [];
    const tableH = BODY_HEIGHT - (commentary ? 60 : 0) - 10;
    if (rows.length > 0) {
      reqs.push(...tableRequests({ pageId, x: SIDE_INSET, y: BODY_TOP, w: SLIDE_W - SIDE_INSET * 2, h: tableH, headers, rows }));
    } else {
      const empty = textBoxRequests({
        pageId, x: SIDE_INSET, y: BODY_TOP + tableH / 2 - 10, w: SLIDE_W - SIDE_INSET * 2, h: 20,
        text: "No comparison rows.", fontSize: 11, textColor: COLORS.textMuted, align: "CENTER",
      });
      reqs.push(...empty.requests);
    }
    if (commentary) {
      const calloutY = BODY_TOP + tableH + 8;
      const calloutH = SLIDE_H - BODY_BOTTOM_PAD - calloutY;
      reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
    }
    return reqs;
  }

  if (layout === "story") {
    const headline = editsResolve(edits, `${slide.id}_headline`, slide.headline ?? "");
    const narrative = editsResolve(edits, `${slide.id}_narrative`, slide.narrative ?? "—");
    const facts = (slide.metrics ?? []).slice(0, 4);

    // Headline card
    let nextY = BODY_TOP;
    const headlineH = 50;
    if (headline) {
      const bg = rectRequests({ pageId, x: SIDE_INSET, y: nextY, w: SLIDE_W - SIDE_INSET * 2, h: headlineH, fill: COLORS.card });
      reqs.push(...bg.requests);
      const ey = textBoxRequests({
        pageId, x: SIDE_INSET + 10, y: nextY + 6, w: 100, h: 10,
        text: "Headline", fontSize: 7, textColor: COLORS.textMuted, letterSpacing: 1.2, uppercase: true,
      });
      reqs.push(...ey.requests);
      const hl = textBoxRequests({
        pageId, x: SIDE_INSET + 10, y: nextY + 20, w: SLIDE_W - SIDE_INSET * 2 - 20, h: headlineH - 26,
        text: headline, fontFamily: FONT_HEADER, fontSize: 16, textColor: COLORS.textPrimary,
      });
      reqs.push(...hl.requests);
      nextY += headlineH + 10;
    }

    // Narrative callout fills middle
    const factsH = facts.length > 0 ? 64 : 0;
    const factsGap = facts.length > 0 ? 10 : 0;
    const narrativeH = SLIDE_H - BODY_BOTTOM_PAD - nextY - factsH - factsGap;
    reqs.push(...insightCallout({ pageId, topY: nextY, height: narrativeH, text: narrative }));
    nextY += narrativeH + factsGap;

    if (facts.length > 0) {
      const cards = statCardRow({ pageId, metrics: facts, topY: nextY });
      reqs.push(...cards.requests);
    }
    return reqs;
  }

  // Default — prose_card: stacked eyebrow + body cards, optional commentary.
  const sections = slide.sections ?? [];
  const calloutH = commentary ? 50 : 0;
  const calloutGap = commentary ? 10 : 0;
  const sectionsAreaH = BODY_HEIGHT - calloutH - calloutGap;
  if (sections.length > 0) {
    const sectionH = (sectionsAreaH - (sections.length - 1) * 6) / sections.length;
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const y = BODY_TOP + i * (sectionH + 6);
      const bg = rectRequests({ pageId, x: SIDE_INSET, y, w: SLIDE_W - SIDE_INSET * 2, h: sectionH, fill: COLORS.card });
      reqs.push(...bg.requests);
      const ey = textBoxRequests({
        pageId, x: SIDE_INSET + 12, y: y + 8, w: SLIDE_W - SIDE_INSET * 2 - 24, h: 10,
        text: editsResolve(edits, `${slide.id}_section_${i}_eyebrow`, s.eyebrow),
        fontSize: 7, textColor: COLORS.accent, letterSpacing: 1, uppercase: true, bold: true,
      });
      reqs.push(...ey.requests);
      const body = textBoxRequests({
        pageId, x: SIDE_INSET + 12, y: y + 22, w: SLIDE_W - SIDE_INSET * 2 - 24, h: sectionH - 28,
        text: editsResolve(edits, `${slide.id}_section_${i}_body`, s.body),
        fontSize: 10, textColor: COLORS.textPrimary,
      });
      reqs.push(...body.requests);
    }
  } else {
    const empty = textBoxRequests({
      pageId, x: SIDE_INSET, y: BODY_TOP + sectionsAreaH / 2 - 10, w: SLIDE_W - SIDE_INSET * 2, h: 20,
      text: "No content. Re-synthesize the slide from the builder.", fontSize: 11, textColor: COLORS.textMuted, align: "CENTER",
    });
    reqs.push(...empty.requests);
  }
  if (commentary) {
    const calloutY = BODY_TOP + sectionsAreaH + calloutGap;
    reqs.push(...insightCallout({ pageId, topY: calloutY, height: calloutH, text: commentary }));
  }
  return reqs;
}

// ─── Slide-type dispatch ─────────────────────────────────────────────────────

function buildSlideRequests(pageId: string, slide: Slide, edits: Record<string, string> | undefined): slides_v1.Schema$Request[] {
  switch (slide.type) {
    case "title":            return buildCoverSlide(pageId, slide, edits);
    case "exec_summary":     return buildExecSummarySlide(pageId, slide, edits);
    case "outcomes":         return buildOutcomesSlide(pageId, slide, edits);
    case "visibility":       return buildStatGridSlide(pageId, slide, edits, "GSC · Ahrefs");
    case "keyword_table":    return buildKeywordTableSlide(pageId, slide, edits);
    case "intent_alignment": return buildIntentAlignmentSlide(pageId, slide, edits);
    case "stat_grid":        return buildStatGridSlide(pageId, slide, edits, slide.sourceNote ?? "");
    case "content_pipeline": return buildContentPipelineSlide(pageId, slide, edits);
    case "initiatives":      return buildInitiativesSlide(pageId, slide, edits);
    case "custom":           return buildCustomSlide(pageId, slide, edits);
    // Legacy V1 types — render minimally so older saved decks still export.
    case "metrics":          return buildStatGridSlide(pageId, slide, edits, slide.sourceNote ?? "");
    case "table":            return buildKeywordTableSlide(pageId, slide, edits);
    case "bullets":          {
      const reqs: slides_v1.Schema$Request[] = [];
      const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "");
      const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
      reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "", dateLabel: subtitle }));
      const bullets = (slide.bullets ?? []).map((b, i) => editsResolve(edits, `${slide.id}_bullet_${i}`, b));
      const bl = bulletListRequests({ pageId, x: SIDE_INSET, y: BODY_TOP, w: SLIDE_W - SIDE_INSET * 2, h: BODY_HEIGHT, lines: bullets, fontSize: 11 });
      reqs.push(...bl.requests);
      return reqs;
    }
    default: {
      const reqs: slides_v1.Schema$Request[] = [];
      const title = editsResolve(edits, `${slide.id}_title`, slide.title ?? "");
      const subtitle = editsResolve(edits, `${slide.id}_subtitle`, slide.subtitle ?? "");
      reqs.push(...chromeRequests({ pageId, title, subtitle, sourceLabel: "", dateLabel: subtitle }));
      return reqs;
    }
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface CreateSlidesResult {
  presentationId: string;
  title: string;
  webViewLink: string;
}

export async function createMonthlyGoogleSlides(opts: {
  slides: Slide[];
  edits: Record<string, string> | undefined;
  clientName: string;
  monthLabel: string;
}): Promise<CreateSlidesResult> {
  const slidesApi = await getSlidesClient();

  const title = `${opts.clientName} Monthly SEO ${opts.monthLabel || "Report"}`;

  // Step 1: create an empty presentation. The API gives us a single starter
  // slide we'll repurpose for the cover; subsequent slides we createSlide for.
  const createRes = await slidesApi.presentations.create({
    requestBody: { title },
  });
  const presentationId = createRes.data.presentationId!;
  const starterSlideId = createRes.data.slides?.[0]?.objectId!;

  // Step 2: build all page IDs up front, then issue createSlide requests for
  // all slides beyond the first. Doing all creates in one batch then doing
  // all populates in subsequent batches keeps the request shape clean.
  const pageIds: string[] = [starterSlideId];
  const createSlideRequests: slides_v1.Schema$Request[] = [];
  for (let i = 1; i < opts.slides.length; i++) {
    const newId = nextId("page");
    pageIds.push(newId);
    createSlideRequests.push({
      createSlide: {
        objectId: newId,
        insertionIndex: i,
        slideLayoutReference: { predefinedLayout: "BLANK" },
      },
    });
  }
  if (createSlideRequests.length > 0) {
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: createSlideRequests },
    });
  }

  // Step 3: for each slide, build its requests and submit one batchUpdate.
  // Per-slide batches stay well under the Slides API request-count ceiling
  // and let us isolate errors to a single slide if anything goes wrong.
  for (let i = 0; i < opts.slides.length; i++) {
    const requests = buildSlideRequests(pageIds[i], opts.slides[i], opts.edits);
    if (requests.length === 0) continue;
    try {
      await slidesApi.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });
    } catch (err: any) {
      console.error(`[slides] batchUpdate failed on slide ${i} (${opts.slides[i].id}):`, err?.message ?? err);
      // Continue with subsequent slides — a partial deck is more useful than
      // a complete failure.
    }
  }

  const webViewLink = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  return { presentationId, title, webViewLink };
}
