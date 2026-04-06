/**
 * Block-based DOCX generator for bi-weekly reports.
 * Uses only Google Docs-compatible DOCX features:
 *   - Standard heading styles (HeadingLevel) for titles/subtitles
 *   - Simple uniform table borders (no mixed none/single combos)
 *   - ShadingType.SOLID for cell backgrounds
 *   - Standard bullet lists
 *   - No document headers or complex border combos
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
  LevelFormat,
  UnderlineType,
} from "docx";

// ─── Colour palette ───────────────────────────────────────────────────────────

const PRIMARY      = "C0392B"; // brand red — used for headings & accents
const MUTED_TEXT   = "6B7280"; // table header text
const BODY_TEXT    = "1F2937"; // body text
const LIGHT_GRAY   = "E5E7EB"; // table borders
const TABLE_HDR_BG = "F3F4F6"; // table header row background
const ALT_ROW_BG   = "F9FAFB"; // alternating table row background
const CALLOUT_BG   = "FEF2F2"; // callout background (light red tint)
const HEADER_BG    = "C0392B"; // document header bar background
const HEADER_FG    = "FFFFFF"; // document header bar text

// ─── Block type definitions ───────────────────────────────────────────────────

type BlockType =
  | "title" | "subtitle" | "paragraph" | "richText"
  | "divider" | "spacer"
  | "kpiSummary" | "dataTable" | "workLog"
  | "callout" | "bulletList" | "numberedList" | "closingSummary";

interface BlockSettings {
  spacing: "compact" | "normal" | "relaxed";
  alignment: "left" | "center" | "right";
  visible: boolean;
  rows?: number;
  cols?: number;
  colHeaders?: string[];
  tableRows?: string[][];
  kpis?: { label: string; value: string; trend: string }[];
  items?: string[];
  height?: number;
  dividerThickness?: number;
}

interface DocBlock {
  id: string;
  type: BlockType;
  content: string;
  settings: BlockSettings;
}

// ─── Default blocks ───────────────────────────────────────────────────────────

const DEFAULT_BLOCKS: DocBlock[] = [
  { id: "blk-title",   type: "title",     content: "SEO Bi-weekly Meeting: [Client Name]", settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-meta",    type: "paragraph", content: "Reporting Period: [Start Date] – [End Date]\nPrepared by: [Your Name]\nReporting Date: [Date]", settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-div0",    type: "divider",   content: "", settings: { spacing: "normal", alignment: "left", visible: true, dividerThickness: 2 } },
  { id: "blk-s1",      type: "subtitle",  content: "1. Purpose",               settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-purpose", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals."] } },
  { id: "blk-s2",      type: "subtitle",  content: "2. Performance Pulse",      settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-nsm",     type: "dataTable", content: "NSM Goals — Q1 2026",      settings: { spacing: "compact", alignment: "left", visible: true, cols: 5, rows: 2, colHeaders: ["Metric","Goal","Actual","%","Status"], tableRows: [["Organic Sessions","—","—","—","—"],["MVP Metric","—","—","—","—"]] } },
  { id: "blk-insight", type: "callout",   content: "Key insight about performance...", settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-s3",      type: "subtitle",  content: "3. Progress & Quick Wins",  settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-progress",type: "dataTable", content: "Progress & Quick Wins",    settings: { spacing: "compact", alignment: "left", visible: true, cols: 3, rows: 4, colHeaders: ["Area","What We Did / Learned","What's Next"], tableRows: [["Content","—","—"],["Optimization","—","—"],["Technical SEO","—","—"],["Local SEO","—","—"]] } },
  { id: "blk-s4",      type: "subtitle",  content: "4. Partnership & Alignment",settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-closing", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["Open discussion: feedback, lead quality, new initiatives, or observations.","Confirm next steps, responsibilities, and upcoming deliverables."] } },
];

// ─── Hydration ────────────────────────────────────────────────────────────────

function san(s: string): string {
  return (s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function hydrateBlocks(blocks: DocBlock[], report: any): DocBlock[] {
  const sections: any[] = report?.sections ?? [];
  const pulseSection    = sections.find((s: any) => s.id === "bw_pulse");
  const progressSection = sections.find((s: any) => s.id === "bw_progress");
  const purposeSection  = sections.find((s: any) => s.id === "bw_purpose");
  const partnerSection  = sections.find((s: any) => s.id === "bw_partnership");

  return blocks.map((block): DocBlock => {
    switch (block.id) {
      case "blk-title":
        return { ...block, content: report?.client_name ? `SEO Bi-weekly Meeting: ${san(report.client_name)}` : block.content };

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
        if (purposeSection?.bullets?.length) {
          return { ...block, settings: { ...block.settings, items: purposeSection.bullets.map(san) } };
        }
        return block;

      case "blk-nsm": {
        const metrics: any[] = pulseSection?.metrics ?? [];
        const get = (label: string) => san(metrics.find((m: any) => m.label === label)?.current ?? "—");
        const nsmQuarter = get("NSM Quarter");
        const sessGoal   = get("NSM Sessions Goal");
        const sessActual = get("NSM Sessions Actual");
        const sessPct    = get("NSM Sessions %");
        const sessTrack  = get("NSM Sessions On Track");
        const mvpMetric  = metrics.find((m: any) => /NSM MVP .* Goal/.test(m.label));
        const mvpFull    = mvpMetric?.label ?? "";
        const mvpRowLabel = mvpFull.replace(/\s*Goal$/, "").replace(/^NSM MVP\s*/, "").trim() || "MVP Metric";
        const mvpGoal    = san(mvpMetric?.current ?? "—");
        const mvpActual  = get(`${mvpFull.replace(" Goal", "")} Actual`);
        const mvpPct     = get(`${mvpFull.replace(" Goal", "")} %`);
        const mvpTrack   = get(`${mvpFull.replace(" Goal", "")} On Track`);

        if (sessGoal !== "—" || mvpGoal !== "—") {
          const tableRows: string[][] = [];
          if (sessGoal !== "—") tableRows.push(["Organic Sessions", sessGoal, sessActual, sessPct, sessTrack]);
          if (mvpGoal  !== "—") tableRows.push([mvpRowLabel, mvpGoal, mvpActual, mvpPct, mvpTrack]);
          return {
            ...block,
            content: `NSM Goals — ${nsmQuarter}`,
            settings: { ...block.settings, colHeaders: ["Metric","Goal","Actual","%","Status"], tableRows, cols: 5, rows: tableRows.length },
          };
        }
        return block;
      }

      case "blk-insight": {
        const metrics: any[] = pulseSection?.metrics ?? [];
        // First try non-NSM metrics; fall back to a summary of all NSM metrics
        const nonNsm = metrics.filter((m: any) => !m.label.startsWith("NSM"));
        const source = nonNsm.length > 0 ? nonNsm : metrics.filter((m: any) => m.label !== "NSM Quarter");
        if (source.length > 0) {
          const summary = source
            .map((m: any) => `${san(m.label)}: ${san(m.current)}${m.delta ? ` (${san(m.delta)})` : ""}`)
            .join(" · ");
          return { ...block, content: summary };
        }
        return block;
      }

      case "blk-progress": {
        const workLog: any[] = progressSection?.workLog ?? [];
        if (workLog.length > 0) {
          const tableRows: string[][] = workLog.map((row: any) => {
            const didText  = san(row.whatWeDid  || (Array.isArray(row.items)     ? row.items.map((i: any) => (typeof i === "string" ? i : i.text)).join(" ") : "")) || "—";
            const nextText = san(row.whatsNext  || (Array.isArray(row.nextItems) ? row.nextItems.map((i: any) => (typeof i === "string" ? i : i.text)).join(" ") : "")) || "—";
            return [san(row.area ?? "—"), didText, nextText];
          });
          return {
            ...block,
            content: "Progress & Quick Wins",
            settings: { ...block.settings, colHeaders: ["Area","What We Did / Learned","What's Next"], tableRows, cols: 3, rows: tableRows.length },
          };
        }
        return block;
      }

      case "blk-closing":
        if (partnerSection?.bullets?.length) {
          return { ...block, settings: { ...block.settings, items: partnerSection.bullets.map(san) } };
        }
        return block;

      default:
        return block;
    }
  });
}

// ─── Spacing helpers ──────────────────────────────────────────────────────────

function spBefore(block: DocBlock): number {
  switch (block.settings.spacing) {
    case "compact":  return 120;
    case "relaxed":  return 320;
    default:         return 200;
  }
}
function spAfter(block: DocBlock): number {
  switch (block.settings.spacing) {
    case "compact":  return 80;
    case "relaxed":  return 200;
    default:         return 120;
  }
}

// ─── Unified thin border (Google Docs renders SINGLE borders reliably) ────────

const THIN: any = { style: BorderStyle.SINGLE, size: 4, color: LIGHT_GRAY };
const NONE_B: any = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

// ─── Block renderers ──────────────────────────────────────────────────────────

/** Colored header bar (first element on the page) */
function makeHeaderBar(clientName: string, preparedBy: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: clientName || "SmartEO", bold: true, size: 28, color: HEADER_FG }),
                  new TextRun({ text: `  |  ${preparedBy}`, size: 20, color: "FFCCCC" }),
                ],
                spacing: { before: 80, after: 80 },
              }),
            ],
            shading: { type: ShadingType.SOLID, color: HEADER_BG },
            margins: {
              left:   convertInchesToTwip(0.15),
              right:  convertInchesToTwip(0.15),
              top:    convertInchesToTwip(0.08),
              bottom: convertInchesToTwip(0.08),
            },
            borders: { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B },
          }),
        ],
      }),
    ],
    borders: { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideH: NONE_B, insideV: NONE_B },
  });
}

function makeTitleBlock(block: DocBlock): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: block.content || "Title", bold: true, color: PRIMARY })],
    spacing: { before: spBefore(block), after: spAfter(block) },
  });
}

function makeSubtitleBlock(block: DocBlock): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: block.content || "Section", bold: true, color: PRIMARY })],
    spacing: { before: spBefore(block), after: spAfter(block) },
  });
}

function makeParagraphBlock(block: DocBlock): Paragraph[] {
  const lines = block.content.split("\n");
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line, size: 20, color: BODY_TEXT })],
      spacing: i === 0 ? { before: spBefore(block), after: 40 } : { before: 0, after: 40 },
    })
  );
}

function makeDividerBlock(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LIGHT_GRAY } },
    spacing: { before: 100, after: 100 },
  });
}

function makeSpacerBlock(block: DocBlock): Paragraph {
  const h = block.settings.height ?? 24;
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    spacing: { before: h * 15, after: 0 },
  });
}

function makeBulletList(block: DocBlock): Paragraph[] {
  const items = block.settings.items ?? [];
  const result: Paragraph[] = [];
  if (block.content) {
    result.push(new Paragraph({
      children: [new TextRun({ text: block.content, bold: true, size: 20, color: PRIMARY })],
      spacing: { before: spBefore(block), after: 80 },
    }));
  }
  items.forEach((item, i) =>
    result.push(new Paragraph({
      children: [new TextRun({ text: item, size: 20, color: BODY_TEXT })],
      bullet: { level: 0 },
      spacing: i === 0 && !block.content ? { before: spBefore(block), after: 40 } : { before: 0, after: 40 },
    }))
  );
  return result;
}

/** Callout block: single-cell table with light-red background and red left border */
function makeCalloutBlock(block: DocBlock): Table {
  const lines = block.content.split("\n");
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: lines.map(line =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 19, color: "7F1D1D", italics: true })],
                spacing: { before: 40, after: 40 },
              })
            ),
            shading: { type: ShadingType.SOLID, color: CALLOUT_BG },
            borders: {
              left:   { style: BorderStyle.THICK, size: 24, color: PRIMARY },
              top:    THIN,
              bottom: THIN,
              right:  THIN,
            },
            margins: {
              left:   convertInchesToTwip(0.12),
              right:  convertInchesToTwip(0.1),
              top:    convertInchesToTwip(0.06),
              bottom: convertInchesToTwip(0.06),
            },
          }),
        ],
      }),
    ],
    borders: { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideH: NONE_B, insideV: NONE_B },
  });
}

function computeColWidths(colCount: number, headers: string[]): number[] {
  if (colCount === 2) return [0.28, 0.72];
  if (colCount === 3) {
    if (headers[0]?.toLowerCase() === "area") return [0.14, 0.43, 0.43];
    return [0.28, 0.36, 0.36];
  }
  if (colCount === 5) return [0.35, 0.14, 0.16, 0.12, 0.23];
  return Array(colCount).fill(1 / colCount);
}

function makeDataTableBlock(block: DocBlock): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const colHeaders = block.settings.colHeaders ?? [];
  const tableRows  = block.settings.tableRows  ?? [];

  if (block.content) {
    result.push(new Paragraph({
      children: [new TextRun({ text: block.content, bold: true, size: 20, color: PRIMARY })],
      spacing: { before: spBefore(block), after: 80 },
    }));
  }

  if (colHeaders.length === 0) return result;

  const TOTAL_DXA = 9240; // ~6.42 inches in DXA units (fits well in typical margins)
  const colFracs  = computeColWidths(colHeaders.length, colHeaders);

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: colHeaders.map((h, ci) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 16, color: MUTED_TEXT })],
            spacing: { before: 40, after: 40 },
          }),
        ],
        shading: { type: ShadingType.SOLID, color: TABLE_HDR_BG },
        width: { size: Math.round(colFracs[ci] * TOTAL_DXA), type: WidthType.DXA },
        borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
        margins: {
          left:   convertInchesToTwip(0.06),
          right:  convertInchesToTwip(0.06),
          top:    convertInchesToTwip(0.03),
          bottom: convertInchesToTwip(0.03),
        },
      })
    ),
  });

  const dataRows = tableRows.map((row, ri) =>
    new TableRow({
      children: (row as string[]).map((cell, ci) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: cell || "—", size: 18, color: BODY_TEXT })],
              spacing: { before: 30, after: 30 },
            }),
          ],
          shading: ri % 2 === 1 ? { type: ShadingType.SOLID, color: ALT_ROW_BG } : undefined,
          width: { size: Math.round(colFracs[ci] * TOTAL_DXA), type: WidthType.DXA },
          borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
          margins: {
            left:   convertInchesToTwip(0.06),
            right:  convertInchesToTwip(0.06),
            top:    convertInchesToTwip(0.03),
            bottom: convertInchesToTwip(0.03),
          },
        })
      ),
    })
  );

  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
      borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideH: THIN, insideV: THIN },
    })
  );

  return result;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateBiweeklyBlockDocx(report: any, savedBlocks?: any[]): Promise<Buffer> {
  const templateBlocks: DocBlock[] = (
    Array.isArray(savedBlocks) &&
    savedBlocks.length > 0 &&
    typeof savedBlocks[0]?.settings === "object"
  ) ? savedBlocks as DocBlock[] : DEFAULT_BLOCKS;

  const blocks = hydrateBlocks(templateBlocks, report);

  const clientName = san(report?.client_name ?? "");
  const preparedBy = san(report?.preparedBy ?? "");

  const children: (Paragraph | Table)[] = [];

  // Colored header bar at top (reliable in GDocs)
  children.push(makeHeaderBar(clientName, preparedBy));
  // Spacer after header bar
  children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 120, after: 0 } }));

  for (const block of blocks) {
    if (!block.settings.visible) continue;

    switch (block.type) {
      case "title":
        children.push(makeTitleBlock(block));
        break;
      case "subtitle":
        children.push(makeSubtitleBlock(block));
        break;
      case "paragraph":
      case "richText":
        children.push(...makeParagraphBlock(block));
        break;
      case "divider":
        children.push(makeDividerBlock());
        break;
      case "spacer":
        children.push(makeSpacerBlock(block));
        break;
      case "bulletList":
      case "numberedList":
      case "workLog":
        children.push(...makeBulletList(block));
        break;
      case "callout":
        children.push(makeCalloutBlock(block));
        break;
      case "dataTable":
        children.push(...makeDataTableBlock(block));
        break;
      case "closingSummary":
        children.push(new Paragraph({
          children: [new TextRun({ text: block.content || "", size: 20, color: BODY_TEXT })],
          spacing: { before: spBefore(block), after: spAfter(block) },
        }));
        break;
    }

    // Small gap between blocks
    children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 0, after: 60 } }));
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { bold: true, size: 36, color: PRIMARY },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
        {
          id: "Heading2",
          name: "heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { bold: true, size: 24, color: PRIMARY },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "default-bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) } },
                run: { size: 20 },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left:   convertInchesToTwip(0.7),
              right:  convertInchesToTwip(0.7),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
