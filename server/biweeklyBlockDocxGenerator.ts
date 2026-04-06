/**
 * Block-based DOCX generator for bi-weekly reports.
 * Mirrors the hydration logic from biweekly-report-renderer.tsx so the
 * exported DOCX matches the on-screen block preview exactly.
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
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
  Header,
  ImageRun,
} from "docx";
import * as fs from "fs";
import * as path from "path";

// ─── Colour palette (matches DEFAULT_THEME_TOKENS) ───────────────────────────

const PRIMARY    = "C0392B";
const HEADER_BG  = "C0392B";
const HEADER_FG  = "FFFFFF";
const BODY_TEXT  = "1F2937";
const MUTED      = "6B7280";
const TABLE_HDR  = "F9FAFB";
const TABLE_BORD = "E5E7EB";
const ALT_ROW    = "F9FAFB";
const CALLOUT_BG = "FFF5F4";

// ─── Block type definitions (mirrors frontend types) ──────────────────────────

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

// ─── Default blocks (mirrors DEFAULT_BIWEEKLY_BLOCKS in wysiwyg) ─────────────

const DEFAULT_BLOCKS: DocBlock[] = [
  { id: "blk-title",   type: "title",     content: "SEO Bi-weekly Meeting: [Client Name]", settings: { spacing: "compact", alignment: "left",   visible: true } },
  { id: "blk-meta",    type: "paragraph", content: "Reporting Period: [Start Date] – [End Date]\nPrepared by: [Your Name]\nReporting Date: [Date]", settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-div0",    type: "divider",   content: "", settings: { spacing: "normal", alignment: "left", visible: true, dividerThickness: 2 } },
  { id: "blk-s1",      type: "subtitle",  content: "1. Purpose",               settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-purpose", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals."] } },
  { id: "blk-s2",      type: "subtitle",  content: "2. Performance Pulse",      settings: { spacing: "normal",  alignment: "left", visible: true } },
  { id: "blk-nsm",     type: "dataTable", content: "NSM Goals — Q1 2026",      settings: { spacing: "compact", alignment: "left", visible: true, cols: 5, rows: 2, colHeaders: ["Metric","Goal","Actual","%","Status"], tableRows: [["Organic Sessions","—","—","—","—"],["MVP Metric","—","—","—","—"]] } },
  { id: "blk-insight", type: "callout",   content: "Key insight about performance...", settings: { spacing: "normal",  alignment: "left", visible: true } },
  { id: "blk-s3",      type: "subtitle",  content: "3. Progress & Quick Wins",  settings: { spacing: "normal",  alignment: "left", visible: true } },
  { id: "blk-progress",type: "dataTable", content: "Progress & Quick Wins",    settings: { spacing: "compact", alignment: "left", visible: true, cols: 3, rows: 4, colHeaders: ["Area","What We Did / Learned","What's Next"], tableRows: [["Content","—","—"],["Optimization","—","—"],["Technical SEO","—","—"],["Local SEO","—","—"]] } },
  { id: "blk-s4",      type: "subtitle",  content: "4. Partnership & Alignment",settings: { spacing: "normal",  alignment: "left", visible: true } },
  { id: "blk-closing", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["Open discussion: feedback, lead quality, new initiatives, or observations.","Confirm next steps, responsibilities, and upcoming deliverables."] } },
];

// ─── Hydration (mirrors hydrateBlocks from biweekly-report-renderer.tsx) ─────

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
        const nonNsm = metrics.filter((m: any) => !m.label.startsWith("NSM"));
        if (nonNsm.length > 0) {
          const summary = nonNsm.map((m: any) => `${san(m.label)}: ${san(m.current)}${m.delta ? ` (${san(m.delta)})` : ""}`).join(" · ");
          return { ...block, content: summary };
        }
        return block;
      }

      case "blk-progress": {
        const workLog: any[] = progressSection?.workLog ?? [];
        if (workLog.length > 0) {
          const tableRows: string[][] = workLog.map((row: any) => {
            const didText  = san(row.whatWeDid  || (Array.isArray(row.items)     ? row.items.map((i: any) => (typeof i === "string" ? i : i.text)).join("\n") : "")) || "—";
            const nextText = san(row.whatsNext  || (Array.isArray(row.nextItems) ? row.nextItems.map((i: any) => (typeof i === "string" ? i : i.text)).join("\n") : "")) || "—";
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

// ─── DOCX element helpers ─────────────────────────────────────────────────────

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
  return { top: none, bottom: none, left: none, right: none };
}

function thinBorder() {
  return { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORD } as const;
}

function spacingForBlock(block: DocBlock): { before: number; after: number } {
  switch (block.settings.spacing) {
    case "compact":  return { before: 80,  after: 80  };
    case "relaxed":  return { before: 240, after: 240 };
    default:         return { before: 160, after: 160 };
  }
}

function makeTitleBlock(block: DocBlock): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: block.content || "Title", bold: true, size: 36, color: PRIMARY })],
    spacing: spacingForBlock(block),
  });
}

function makeSubtitleBlock(block: DocBlock): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: block.content || "Subtitle", bold: true, size: 24, color: PRIMARY })],
    spacing: spacingForBlock(block),
  });
}

function makeParagraphBlock(block: DocBlock): Paragraph[] {
  const lines = block.content.split("\n");
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line, size: 20, color: BODY_TEXT })],
      spacing: i === 0 ? spacingForBlock(block) : { before: 0, after: 40 },
    })
  );
}

function makeDividerBlock(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TABLE_BORD } },
    spacing: { before: 80, after: 80 },
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
      children: [new TextRun({ text: block.content, bold: true, size: 18, color: PRIMARY })],
      spacing: spacingForBlock(block),
    }));
  }
  items.forEach((item, i) =>
    result.push(new Paragraph({
      children: [new TextRun({ text: item, size: 20, color: BODY_TEXT })],
      bullet: { level: 0 },
      spacing: i === 0 && !block.content ? spacingForBlock(block) : { before: 0, after: 40 },
    }))
  );
  return result;
}

function makeCalloutBlock(block: DocBlock): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: block.content.split("\n").map(line =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 19, color: "4B5563", italics: true })],
                spacing: { before: 40, after: 40 },
              })
            ),
            shading: { type: ShadingType.SOLID, color: "FFF5F4" },
            borders: {
              left:   { style: BorderStyle.SINGLE, size: 16, color: PRIMARY },
              top:    { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" },
              right:  { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" },
            },
            margins: { left: convertInchesToTwip(0.12), right: convertInchesToTwip(0.1), top: convertInchesToTwip(0.05), bottom: convertInchesToTwip(0.05) },
          }),
        ],
      }),
    ],
    borders: { top: noBorders().top, bottom: noBorders().top, left: noBorders().top, right: noBorders().top, insideH: noBorders().top, insideV: noBorders().top },
  });
}

function makeDataTableBlock(block: DocBlock): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const colHeaders = block.settings.colHeaders ?? [];
  const tableRows  = block.settings.tableRows  ?? [];

  if (block.content) {
    result.push(new Paragraph({
      children: [new TextRun({ text: block.content, bold: true, size: 18, color: PRIMARY })],
      spacing: spacingForBlock(block),
    }));
  }

  if (colHeaders.length === 0) return result;

  const colWidths = computeColWidths(colHeaders, tableRows);
  const totalWidth = 9360;

  const headerRow = new TableRow({
    children: colHeaders.map((h, ci) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 16, color: MUTED })],
        })],
        shading: { type: ShadingType.SOLID, color: TABLE_HDR },
        width: { size: Math.round(colWidths[ci] * totalWidth), type: WidthType.DXA },
        borders: { bottom: thinBorder(), top: thinBorder(), left: ci === 0 ? thinBorder() : { style: BorderStyle.NONE, size: 0, color: TABLE_BORD }, right: ci === colHeaders.length - 1 ? thinBorder() : { style: BorderStyle.NONE, size: 0, color: TABLE_BORD } },
        margins: { left: convertInchesToTwip(0.06), right: convertInchesToTwip(0.06), top: convertInchesToTwip(0.03), bottom: convertInchesToTwip(0.03) },
      })
    ),
  });

  const dataRows = tableRows.map((row, ri) =>
    new TableRow({
      children: (row as string[]).map((cell, ci) => {
        const cellLines = (cell || "").split("\n");
        return new TableCell({
          children: cellLines.map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 18, color: BODY_TEXT })],
            spacing: { before: 20, after: 20 },
          })),
          shading: ri % 2 === 1 ? { type: ShadingType.SOLID, color: ALT_ROW } : undefined,
          width: { size: Math.round(colWidths[ci] * totalWidth), type: WidthType.DXA },
          borders: {
            bottom: { style: BorderStyle.SINGLE, size: 2, color: TABLE_BORD },
            top: { style: BorderStyle.NONE, size: 0, color: TABLE_BORD },
            left: ci === 0 ? thinBorder() : { style: BorderStyle.NONE, size: 0, color: TABLE_BORD },
            right: ci === row.length - 1 ? thinBorder() : { style: BorderStyle.NONE, size: 0, color: TABLE_BORD },
          },
          margins: { left: convertInchesToTwip(0.06), right: convertInchesToTwip(0.06), top: convertInchesToTwip(0.03), bottom: convertInchesToTwip(0.03) },
        });
      }),
    })
  );

  result.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: { top: thinBorder(), bottom: thinBorder(), left: thinBorder(), right: thinBorder(), insideH: { style: BorderStyle.NONE, size: 0, color: TABLE_BORD }, insideV: { style: BorderStyle.NONE, size: 0, color: TABLE_BORD } },
  }));
  return result;
}

function computeColWidths(headers: string[], rows: string[][]): number[] {
  if (headers.length === 0) return [];
  if (headers.length === 2) return [0.28, 0.72];
  if (headers.length === 3) {
    if (headers[0].toLowerCase() === "area") return [0.14, 0.43, 0.43];
    return [0.3, 0.35, 0.35];
  }
  if (headers.length === 5) return [0.35, 0.15, 0.16, 0.12, 0.22];
  const w = 1 / headers.length;
  return headers.map(() => w);
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateBiweeklyBlockDocx(report: any, savedBlocks?: DocBlock[]): Promise<Buffer> {
  const templateBlocks = (
    Array.isArray(savedBlocks) &&
    savedBlocks.length > 0 &&
    typeof savedBlocks[0]?.settings === "object"
  ) ? savedBlocks : DEFAULT_BLOCKS;

  const blocks = hydrateBlocks(templateBlocks, report);

  const headerImagePath = path.join(process.cwd(), "server", "assets", "biweekly_header.png");
  const hasHeaderImage = fs.existsSync(headerImagePath);

  // Build header
  const PAGE_W_PX = 816;
  const HEADER_H_PX = Math.round((143 / 692) * PAGE_W_PX);

  const docHeader = hasHeaderImage
    ? new Header({
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [
              new ImageRun({
                type: "png",
                data: fs.readFileSync(headerImagePath),
                transformation: { width: PAGE_W_PX, height: HEADER_H_PX },
              }),
            ],
          }),
        ],
      })
    : new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: report?.preparedBy || "SmartEO", bold: true, size: 20, color: HEADER_FG }),
            ],
            shading: { type: ShadingType.SOLID, color: HEADER_BG },
            spacing: { before: 80, after: 80 },
          }),
        ],
      });

  // Build body elements
  const children: (Paragraph | Table)[] = [];

  // Spacer after header
  children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 200, after: 0 } }));

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
          children: [new TextRun({ text: block.content || "Summary", size: 20, color: BODY_TEXT })],
          spacing: spacingForBlock(block),
        }));
        break;
    }

    // Add inter-block gap paragraph
    children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 0, after: 0 } }));
  }

  const doc = new Document({
    sections: [
      {
        headers: { default: docHeader },
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
