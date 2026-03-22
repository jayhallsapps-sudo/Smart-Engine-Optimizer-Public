/**
 * qcrPptxGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated PPTX generator for the Quarterly Content Roadmap deck.
 *
 * Visual language: matches the Webserv bi-weekly report family
 *   • Light gray slide background (#F8FAFC)
 *   • Real swoosh header image (qcr_header.png) via addImage — NOT flat shapes
 *   • Dark (#1F2937) table header rows with white text
 *   • Alternating white / #F9FAFB table data rows
 *   • Footer: thin divider line + "Webserv | webserv.io" / "CONFIDENTIAL"
 *   • Month divider slides: navy (#1B3A6B) bg, large white month text, red stripe
 *   • Title slide: light gray bg, tall swoosh header, title/client/date block
 *
 * TEMPLATE OPTS (from template_config.json → qcr_layout):
 *   ✓ accentColor   — table header row accent, footer line, bullet color
 *   ✓ darkColor     — divider slide background, NAVY elements
 *   ✓ fontFamily    — all text elements
 *
 * DOES NOT FLOW (pptxgenjs architectural limits):
 *   ✗ Per-element x/y canvas positions
 *   ✗ Per-element font size overrides
 * ─────────────────────────────────────────────────────────────────────────────
 */

import PptxGenJS from "pptxgenjs";
import path from "path";
import fs from "fs";

export interface QcrPptxSection {
  title: string;
  bullets?: string[];
  table?: {
    headers: string[];
    rows: (string | number)[][];
  };
  isDivider?: boolean;
  dividerMonth?: string;
  dividerSubtitle?: string;
}

export interface QcrTemplateOpts {
  accentColor?: string;
  darkColor?: string;
  fontFamily?: string;
}

const DEFAULT_OPTS: Required<QcrTemplateOpts> = {
  accentColor: "C0392B",
  darkColor:   "1B3A6B",
  fontFamily:  "Calibri",
};

// Design tokens matching the preview system
const PAGE_BG      = "F8FAFC";
const TEXT_DARK    = "111827";
const TEXT_MED     = "374151";
const TEXT_LIGHT   = "6B7280";
const BORDER       = "E5E7EB";
const ROW_ALT      = "F9FAFB";
const TABLE_HDR_BG = "1F2937";   // black header row — matches user requirement

const HEADER_IMG_PATH = path.join(process.cwd(), "server", "assets", "qcr_header.png");

// Slide geometry (LAYOUT_WIDE = 10" × 7.5")
const SW = 10;       // slide width inches
const SH = 7.5;      // slide height inches
const ML = 0.38;     // left margin
const MR = 0.38;     // right margin
const INNER_W = SW - ML - MR;  // 9.24"

// Header image heights
const HDR_H_CONTENT = 0.72;   // content slides — shorter crop
const HDR_H_TITLE   = 1.45;   // title slide — taller crop

// Footer constants
const FOOTER_Y    = SH - 0.29;
const FOOTER_H    = 0.22;
const FOOTER_LINE_Y = FOOTER_Y - 0.04;

function resolveOpts(opts: QcrTemplateOpts): Required<QcrTemplateOpts> {
  return {
    accentColor: (opts.accentColor ?? DEFAULT_OPTS.accentColor).replace("#", ""),
    darkColor:   (opts.darkColor   ?? DEFAULT_OPTS.darkColor).replace("#", ""),
    fontFamily:  opts.fontFamily   ?? DEFAULT_OPTS.fontFamily,
  };
}

function headerImageExists(): boolean {
  return fs.existsSync(HEADER_IMG_PATH);
}

function addSwooshHeader(slide: PptxGenJS.Slide, h: number): void {
  if (headerImageExists()) {
    slide.addImage({ path: HEADER_IMG_PATH, x: 0, y: 0, w: SW, h });
  } else {
    // Fallback: flat accent bar if image missing
    slide.addShape("rect" as any, { x: 0, y: 0, w: SW, h, fill: { color: "C0392B" }, line: { color: "C0392B" } });
  }
}

function addSlideTitle(
  slide: PptxGenJS.Slide,
  title: string,
  hdrH: number,
  o: Required<QcrTemplateOpts>,
): void {
  // Slide title overlaid on the white area of the swoosh (left side)
  slide.addText(title, {
    x: ML, y: hdrH * 0.1, w: INNER_W * 0.78, h: hdrH * 0.8,
    fontSize: 12, bold: true,
    color: TEXT_DARK,
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });
}

function addFooter(slide: PptxGenJS.Slide, o: Required<QcrTemplateOpts>): void {
  // Thin separator line above footer
  slide.addShape("rect" as any, {
    x: ML, y: FOOTER_LINE_Y, w: INNER_W, h: 0.01,
    fill: { color: BORDER },
    line: { color: BORDER },
  });
  // Left: Webserv branding
  slide.addText("Webserv  |  webserv.io", {
    x: ML, y: FOOTER_Y, w: 3.5, h: FOOTER_H,
    fontSize: 7, color: TEXT_LIGHT,
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });
  // Right: CONFIDENTIAL
  slide.addText("CONFIDENTIAL", {
    x: SW - MR - 2.0, y: FOOTER_Y, w: 2.0, h: FOOTER_H,
    fontSize: 7, color: "C5CBD3",
    fontFace: o.fontFamily,
    align: "right",
    valign: "middle",
  });
}

// ─── TITLE SLIDE ─────────────────────────────────────────────────────────────
function addQcrTitleSlide(
  pptx: PptxGenJS,
  clientName: string,
  reportTitle: string,
  date: string,
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: PAGE_BG };

  // Swoosh header — full width, tall for title slide
  addSwooshHeader(slide, HDR_H_TITLE);

  // Report title
  slide.addText(reportTitle, {
    x: ML, y: HDR_H_TITLE + 0.35, w: INNER_W, h: 0.75,
    fontSize: 28, bold: true,
    color: TEXT_DARK,
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });

  // Client name in accent color
  slide.addText(clientName, {
    x: ML, y: HDR_H_TITLE + 1.2, w: INNER_W, h: 0.5,
    fontSize: 17, bold: true,
    color: o.accentColor,
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });

  // Date
  slide.addText(date, {
    x: ML, y: HDR_H_TITLE + 1.78, w: INNER_W, h: 0.35,
    fontSize: 10.5,
    color: TEXT_LIGHT,
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });

  // Thin accent rule below client name
  slide.addShape("rect" as any, {
    x: ML, y: HDR_H_TITLE + 1.14, w: 1.2, h: 0.035,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  addFooter(slide, o);
}

// ─── MONTH DIVIDER SLIDE ──────────────────────────────────────────────────────
function addQcrDividerSlide(
  pptx: PptxGenJS,
  monthTitle: string,
  subtitle: string,
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: o.darkColor };

  // Left accent stripe — vertical red bar
  slide.addShape("rect" as any, {
    x: 0, y: SH * 0.36, w: 0.18, h: SH * 0.28,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  // Large month name (e.g. "April 2026")
  slide.addText(monthTitle, {
    x: 0.38, y: SH * 0.27, w: INNER_W * 0.88, h: SH * 0.32,
    fontSize: 48, bold: true,
    color: "FFFFFF",
    fontFace: o.fontFamily,
    align: "left",
    valign: "middle",
  });

  // Subtitle below month
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.38, y: SH * 0.60, w: INNER_W * 0.88, h: SH * 0.14,
      fontSize: 14,
      color: "FFFFFF",
      fontFace: o.fontFamily,
      align: "left",
      valign: "top",
      charSpacing: 0,
      transparency: 45,
    });
  }

  // Webserv in corner
  slide.addText("Webserv", {
    x: SW - 1.4, y: SH - 0.38, w: 1.0, h: 0.28,
    fontSize: 9, color: "FFFFFF",
    fontFace: o.fontFamily,
    align: "right",
    valign: "middle",
    transparency: 55,
  });
}

// ─── STRATEGY / BULLETS SLIDE ─────────────────────────────────────────────────
function addQcrStrategySlide(
  pptx: PptxGenJS,
  title: string,
  subtitle: string,
  bullets: string[],
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: PAGE_BG };

  // Swoosh header — standard height
  addSwooshHeader(slide, HDR_H_CONTENT);

  // Slide title overlaid on header
  addSlideTitle(slide, title, HDR_H_CONTENT, o);

  let bodyY = HDR_H_CONTENT + 0.12;

  // Subtitle (small, gray)
  if (subtitle) {
    slide.addText(subtitle, {
      x: ML, y: bodyY, w: INNER_W, h: 0.26,
      fontSize: 8.5,
      color: TEXT_LIGHT,
      fontFace: o.fontFamily,
      italic: true,
      align: "left",
      valign: "middle",
    });
    bodyY += 0.32;
  }

  // Accent rule under title/subtitle
  slide.addShape("rect" as any, {
    x: ML, y: bodyY, w: INNER_W, h: 0.018,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
    transparency: 70,
  });
  bodyY += 0.1;

  // Bullets content area
  const BODY_H = FOOTER_LINE_Y - bodyY - 0.06;

  const bulletLines = bullets
    .filter(Boolean)
    .map(b => ({
      text: b,
      options: {
        fontSize: 10.5,
        color: TEXT_MED,
        fontFace: o.fontFamily,
        bullet: { type: "bullet" as const, characterCode: "2022", color: o.accentColor, indent: 14 },
        paraSpaceAfter: 4,
      },
    }));

  if (bulletLines.length > 0) {
    slide.addText(bulletLines, {
      x: ML, y: bodyY, w: INNER_W, h: BODY_H,
      align: "left",
      valign: "top",
    });
  }

  addFooter(slide, o);
}

// ─── PRODUCTION TABLE SLIDE ───────────────────────────────────────────────────
function addQcrTableSlide(
  pptx: PptxGenJS,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: PAGE_BG };

  // Swoosh header
  addSwooshHeader(slide, HDR_H_CONTENT);

  // Slide title overlaid on header
  addSlideTitle(slide, title, HDR_H_CONTENT, o);

  let bodyY = HDR_H_CONTENT + 0.12;

  // Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: ML, y: bodyY, w: INNER_W, h: 0.26,
      fontSize: 8.5,
      color: TEXT_LIGHT,
      fontFace: o.fontFamily,
      italic: true,
      align: "left",
      valign: "middle",
    });
    bodyY += 0.30;
  }

  // Proportional column widths (must sum to INNER_W ≈ 9.24")
  const COL_WIDTHS = getColumnWidths(headers, INNER_W);
  const maxRows = 20;
  const displayRows = rows.slice(0, maxRows);

  // Build table data: header row + data rows
  const tableData: any[] = [
    // Header row — dark background, white bold text
    headers.map(h => ({
      text: h,
      options: {
        bold: true,
        fontSize: 8.5,
        color: "FFFFFF",
        fill: { color: TABLE_HDR_BG },
        fontFace: o.fontFamily,
        align: "left" as const,
        valign: "middle" as const,
        margin: [3, 5, 3, 5] as [number, number, number, number],
      },
    })),
    // Data rows — alternating white / light gray
    ...displayRows.map((row, ri) =>
      row.map(cell => ({
        text: String(cell),
        options: {
          fontSize: 8,
          color: TEXT_DARK,
          fill: { color: ri % 2 === 0 ? "FFFFFF" : ROW_ALT },
          fontFace: o.fontFamily,
          align: "left" as const,
          valign: "middle" as const,
          margin: [2, 5, 2, 5] as [number, number, number, number],
        },
      }))
    ),
  ];

  const tableH = FOOTER_LINE_Y - bodyY - 0.06;

  slide.addTable(tableData, {
    x: ML,
    y: bodyY,
    w: INNER_W,
    colW: COL_WIDTHS,
    rowH: 0.27,
    border: { type: "solid", color: BORDER, pt: 0.5 },
  });

  // "+N more rows" note if truncated
  if (rows.length > maxRows) {
    slide.addText(`+ ${rows.length - maxRows} more rows in full export`, {
      x: ML, y: FOOTER_LINE_Y - 0.18, w: INNER_W, h: 0.16,
      fontSize: 7, color: TEXT_LIGHT,
      fontFace: o.fontFamily,
      align: "left",
    });
  }

  addFooter(slide, o);
}

function getColumnWidths(headers: string[], totalW: number): number[] {
  // Named column proportions for QCR production tables
  const nameMap: Record<string, number> = {
    "task name":        0.38,
    "content type":     0.18,
    "type":             0.18,
    "topic":            0.26,
    "topic / keyword":  0.26,
    "keyword":          0.26,
    "status":           0.18,
  };
  const fracs = headers.map(h => nameMap[h.toLowerCase()] ?? (1 / headers.length));
  const fracSum = fracs.reduce((a, b) => a + b, 0);
  return fracs.map(f => parseFloat(((f / fracSum) * totalW).toFixed(3)));
}

// ─── PUBLIC EXPORT ────────────────────────────────────────────────────────────
export async function generateQcrPptx(
  clientName: string,
  reportTitle: string,
  date: string,
  sections: QcrPptxSection[],
  templateOpts: QcrTemplateOpts = {},
): Promise<Buffer> {
  const o = resolveOpts(templateOpts);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Webserv SmartEO";
  pptx.subject = reportTitle;
  pptx.title = `${clientName} — ${reportTitle}`;

  // Title slide
  addQcrTitleSlide(pptx, clientName, reportTitle, date, o);

  // Content slides
  sections.forEach(section => {
    if (section.isDivider) {
      addQcrDividerSlide(pptx, section.dividerMonth ?? section.title, section.dividerSubtitle ?? "", o);
    } else if (section.table) {
      addQcrTableSlide(pptx, section.title, "", section.table.headers, section.table.rows, o);
    } else if (section.bullets && section.bullets.length > 0) {
      addQcrStrategySlide(pptx, section.title, "", section.bullets, o);
    }
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" }) as unknown as Buffer;
  return buffer;
}
