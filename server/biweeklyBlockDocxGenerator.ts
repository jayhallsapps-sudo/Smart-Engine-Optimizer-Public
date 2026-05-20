/**
 * Block-based DOCX generator for bi-weekly reports.
 *
 * Design constraints for Google Docs compatibility:
 *  - All table cells use uniform SINGLE borders (never mix NONE/SINGLE per side)
 *  - Cell shading uses ShadingType.CLEAR with fill hex (most reliable in GDocs import)
 *  - Multi-line cell content uses separate Paragraph children (not \n in a TextRun)
 *  - Heading levels use HeadingLevel enum with custom style colours
 *  - No document header/footer images (GDocs import strips them)
 *  - Brand colours come from the active theme at export time
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
  VerticalAlign,
  convertInchesToTwip,
  LevelFormat,
} from "docx";

// ─── Theme token shape (only what this generator needs) ───────────────────────

interface BrandTokens {
  primaryColor: string;        // e.g. "#C0392B"
  tableHeaderBg: string;       // e.g. "#C0392B"
  tableHeaderText: string;     // e.g. "#FFFFFF"
  tableAltRowBg: string;       // e.g. "#F8FAFC"
  tableBorderColor: string;    // e.g. "#E2E8F0"
  tableBodyText: string;       // e.g. "#1E293B"
  calloutBg: string;           // e.g. "#FEF2F2"
  calloutBorderColor: string;  // e.g. "#C0392B"
  calloutText: string;         // e.g. "#1E293B"
  headerColor: string;         // e.g. "#C0392B"
  headerTextColor: string;     // e.g. "#FFFFFF"
}

const DEFAULT_TOKENS: BrandTokens = {
  primaryColor:    "#C0392B",
  tableHeaderBg:   "#C0392B",
  tableHeaderText: "#FFFFFF",
  tableAltRowBg:   "#F8FAFC",
  tableBorderColor:"#E2E8F0",
  tableBodyText:   "#1E293B",
  calloutBg:       "#FEF2F2",
  calloutBorderColor:"#C0392B",
  calloutText:     "#1E293B",
  headerColor:     "#C0392B",
  headerTextColor: "#FFFFFF",
};

/** Strip leading # from a hex colour so docx lib can use it directly */
function hex(color: string): string {
  return color.replace(/^#/, "");
}

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

// ─── Default blocks (matches wysiwyg DEFAULT_BIWEEKLY_BLOCKS) ─────────────────

const DEFAULT_BLOCKS: DocBlock[] = [
  { id: "blk-title",   type: "title",     content: "SEO Bi-weekly Meeting: [Client Name]", settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-meta",    type: "paragraph", content: "Reporting Period: [Start Date] – [End Date]\nPrepared by: [Your Name]\nReporting Date: [Date]", settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-div0",    type: "divider",   content: "", settings: { spacing: "normal", alignment: "left", visible: true, dividerThickness: 2 } },
  { id: "blk-s1",      type: "subtitle",  content: "1. Purpose",               settings: { spacing: "compact", alignment: "left", visible: true } },
  { id: "blk-purpose", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals."] } },
  { id: "blk-s2",      type: "subtitle",  content: "2. Performance Pulse",      settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-nsm",     type: "dataTable", content: "NSM Goals — Q1 2026",      settings: { spacing: "compact", alignment: "left", visible: true, cols: 5, rows: 2, colHeaders: ["Metric","Goal","Actual","%","Status"], tableRows: [["Organic Sessions","—","—","—","—"],["MVP Metric","—","—","—","—"]] } },
  { id: "blk-insight", type: "callout",   content: "Add your key performance insight here. What story does the data tell this period?", settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-s3",      type: "subtitle",  content: "3. Progress & Quick Wins",  settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-progress",type: "dataTable", content: "Progress & Quick Wins",    settings: { spacing: "compact", alignment: "left", visible: true, cols: 3, rows: 4, colHeaders: ["Area","What We Did / Learned","What's Next"], tableRows: [["Content","—","—"],["Optimization","—","—"],["Technical SEO","—","—"],["Local SEO","—","—"]] } },
  { id: "blk-s4",      type: "subtitle",  content: "4. Partnership & Alignment",settings: { spacing: "normal", alignment: "left", visible: true } },
  { id: "blk-closing", type: "bulletList",content: "", settings: { spacing: "compact", alignment: "left", visible: true, items: ["Open discussion: feedback, lead quality, new initiatives, or observations.","Confirm next steps, responsibilities, and upcoming deliverables."] } },
];

// ─── HTML entity decode ───────────────────────────────────────────────────────

function san(s: string): string {
  return (s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ─── Hydration (mirrors biweekly-report-renderer.tsx logic) ───────────────────

function hydrateBlocks(blocks: DocBlock[], report: any): DocBlock[] {
  const sections: any[]      = report?.sections ?? [];
  const pulseSection         = sections.find((s: any) => s.id === "bw_pulse");
  const progressSection      = sections.find((s: any) => s.id === "bw_progress");
  const purposeSection       = sections.find((s: any) => s.id === "bw_purpose");
  const partnerSection       = sections.find((s: any) => s.id === "bw_partnership");

  return blocks.map((block): DocBlock => {
    switch (block.id) {

      // ── Report title ─────────────────────────────────────────────────────
      case "blk-title":
        return { ...block, content: report?.client_name
          ? `SEO Bi-weekly Meeting: ${san(report.client_name)}`
          : block.content };

      // ── Date / prepared-by metadata ───────────────────────────────────────
      case "blk-meta":
        return {
          ...block,
          content: [
            `Reporting Period: ${san(report?.reportingWindow ?? "[Date Range]")}`,
            `Prepared by: ${san(report?.preparedBy ?? "[Your Name]")}`,
            `Reporting Date: ${san(report?.date ?? "[Date]")}`,
          ].join("\n"),
        };

      // ── Purpose bullets ───────────────────────────────────────────────────
      case "blk-purpose":
        return purposeSection?.bullets?.length
          ? { ...block, settings: { ...block.settings, items: purposeSection.bullets.map(san) } }
          : block;

      // ── NSM table (Bi-Weekly v2) ──────────────────────────────────────────
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
              cols: 1,
              rows: 1,
            },
          };
        }
        // v2 normal case: each metric is a row; current = "Goal | Actual | % | Status"
        const parseRow = (m: any): string[] => {
          const parts = String(m.current ?? "").split("|").map((s: string) => s.trim());
          const [goal = "—", actual = "—", pct = "—", status = "—"] = parts;
          return [san(m.label), san(goal), san(actual), san(pct), san(status)];
        };
        if (metrics.length > 0) {
          const tableRows = metrics.map(parseRow);
          return {
            ...block,
            content: "NSM Goals",
            settings: {
              ...block.settings,
              colHeaders: ["Metric","Goal","Actual","%","Status"],
              tableRows,
              cols: 5,
              rows: tableRows.length,
            },
          };
        }
        return block;
      }

      // ── Progress & quick wins table ───────────────────────────────────────
      case "blk-progress": {
        const workLog: any[] = progressSection?.workLog ?? [];
        if (workLog.length > 0) {
          const tableRows: string[][] = workLog.map((row: any) => {
            // Prefer flat string fields; fall back to item arrays joined with newline
            const didText = san(
              row.whatWeDid ||
              (Array.isArray(row.items)
                ? row.items.map((i: any) => (typeof i === "string" ? i : i.text ?? "")).filter(Boolean).join("\n")
                : "")
            ) || "—";

            const nextText = san(
              row.whatsNext ||
              (Array.isArray(row.nextItems)
                ? row.nextItems.map((i: any) => (typeof i === "string" ? i : i.text ?? "")).filter(Boolean).join("\n")
                : "")
            ) || "—";

            return [san(row.area ?? "—"), didText, nextText];
          });
          return {
            ...block,
            content: "Progress & Quick Wins",
            settings: {
              ...block.settings,
              colHeaders: ["Area", "What We Did / Learned", "What's Next"],
              tableRows,
              cols: 3,
              rows: tableRows.length,
            },
          };
        }
        return block;
      }

      // ── Closing / partnership bullets ─────────────────────────────────────
      case "blk-closing":
        return partnerSection?.bullets?.length
          ? { ...block, settings: { ...block.settings, items: partnerSection.bullets.map(san) } }
          : block;

      default:
        return block;
    }
  });
}

// ─── Spacing helpers ──────────────────────────────────────────────────────────

function sp(block: DocBlock): { before: number; after: number } {
  switch (block.settings.spacing) {
    case "compact":  return { before: 100, after:  80 };
    case "relaxed":  return { before: 300, after: 200 };
    default:         return { before: 180, after: 120 };
  }
}

// ─── Border helper — uniform SINGLE border (GDocs compatible) ────────────────

function bdr(color: string, size = 4) {
  return { style: BorderStyle.SINGLE, size, color: hex(color) } as const;
}
const NONE_B = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

// ─── Cell shading — ShadingType.CLEAR is most reliable across GDocs ──────────

function shade(hexColor: string) {
  return { type: ShadingType.CLEAR, color: hex(hexColor), fill: hex(hexColor) };
}

// ─── Block element builders ───────────────────────────────────────────────────

function makeHeaderBar(clientName: string, preparedBy: string, t: BrandTokens): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: clientName || "SmartEO", bold: true, size: 28, color: hex(t.headerTextColor) }),
                  preparedBy
                    ? new TextRun({ text: `  ·  ${preparedBy}`, size: 20, color: hex(t.headerTextColor), italics: true })
                    : new TextRun({ text: "" }),
                ],
                spacing: { before: 80, after: 80 },
              }),
            ],
            shading: shade(t.headerColor),
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

function makeTitleBlock(block: DocBlock, t: BrandTokens): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: block.content || "Title", bold: true, color: hex(t.primaryColor) })],
    spacing: sp(block),
  });
}

function makeSubtitleBlock(block: DocBlock, t: BrandTokens): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: block.content || "Section", bold: true, color: hex(t.primaryColor) })],
    spacing: sp(block),
  });
}

/** Split content on newlines → one Paragraph per line */
function makeParagraphBlock(block: DocBlock): Paragraph[] {
  const lines = block.content.split("\n");
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line, size: 20 })],
      spacing: i === 0 ? { before: sp(block).before, after: 40 } : { before: 0, after: 40 },
    })
  );
}

function makeDividerBlock(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" } },
    spacing: { before: 80, after: 80 },
  });
}

function makeSpacerBlock(block: DocBlock): Paragraph {
  const h = block.settings.height ?? 24;
  return new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: h * 15, after: 0 } });
}

function makeBulletList(block: DocBlock): Paragraph[] {
  const items = block.settings.items ?? [];
  const result: Paragraph[] = [];
  if (block.content) {
    result.push(new Paragraph({
      children: [new TextRun({ text: block.content, bold: true, size: 20 })],
      spacing: { before: sp(block).before, after: 80 },
    }));
  }
  items.forEach((item, i) =>
    result.push(new Paragraph({
      children: [new TextRun({ text: item, size: 20 })],
      bullet: { level: 0 },
      spacing: i === 0 && !block.content ? { before: sp(block).before, after: 40 } : { before: 0, after: 40 },
    }))
  );
  return result;
}

/** Single-cell table with coloured left accent — reliable in Google Docs */
function makeCalloutBlock(block: DocBlock, t: BrandTokens): Table {
  const lines = block.content.split("\n").filter(Boolean);
  if (lines.length === 0) lines.push(block.content);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: lines.map((line, i) =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 19, color: hex(t.calloutText), italics: true })],
                spacing: i === 0 ? { before: 40, after: 20 } : { before: 0, after: 20 },
              })
            ),
            shading: shade(t.calloutBg),
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              left:   { style: BorderStyle.THICK, size: 24, color: hex(t.calloutBorderColor) },
              top:    bdr(t.tableBorderColor),
              bottom: bdr(t.tableBorderColor),
              right:  bdr(t.tableBorderColor),
            },
            margins: {
              left:   convertInchesToTwip(0.12),
              right:  convertInchesToTwip(0.1),
              top:    convertInchesToTwip(0.07),
              bottom: convertInchesToTwip(0.07),
            },
          }),
        ],
      }),
    ],
    borders: { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideH: NONE_B, insideV: NONE_B },
  });
}

function computeColFracs(colCount: number, headers: string[]): number[] {
  if (colCount === 2) return [0.28, 0.72];
  if (colCount === 3) return headers[0]?.toLowerCase() === "area" ? [0.14, 0.43, 0.43] : [0.28, 0.36, 0.36];
  if (colCount === 5) return [0.35, 0.14, 0.16, 0.12, 0.23];
  return Array(colCount).fill(1 / colCount);
}

/** Splits cell content on \n into separate Paragraphs (correct multi-line DOCX rendering) */
function cellParagraphs(cellText: string, size = 18, colorHex = "1E293B"): Paragraph[] {
  const lines = (cellText || "—").split("\n");
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line || " ", size, color: colorHex })],
      spacing: i === 0 ? { before: 40, after: 0 } : { before: 20, after: 0 },
    })
  );
}

function makeDataTableBlock(block: DocBlock, t: BrandTokens): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const colHeaders = block.settings.colHeaders ?? [];
  const tableRows  = block.settings.tableRows  ?? [];

  if (block.content) {
    result.push(new Paragraph({
      children: [new TextRun({ text: block.content, bold: true, size: 20, color: hex(t.primaryColor) })],
      spacing: { before: sp(block).before, after: 80 },
    }));
  }

  if (colHeaders.length === 0) return result;

  const TOTAL_DXA = 9240; // fits within 0.7" margins on US Letter
  const fracs     = computeColFracs(colHeaders.length, colHeaders);
  const thinBdr   = bdr(t.tableBorderColor);

  const headerRow = new TableRow({
    tableHeader: true,
    children: colHeaders.map((h, ci) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 17, color: hex(t.tableHeaderText) })],
          spacing: { before: 50, after: 50 },
        })],
        shading: shade(t.tableHeaderBg),
        width: { size: Math.round(fracs[ci] * TOTAL_DXA), type: WidthType.DXA },
        borders: { top: thinBdr, bottom: thinBdr, left: thinBdr, right: thinBdr },
        margins: {
          left:   convertInchesToTwip(0.07),
          right:  convertInchesToTwip(0.07),
          top:    convertInchesToTwip(0.04),
          bottom: convertInchesToTwip(0.04),
        },
      })
    ),
  });

  const dataRows = tableRows.map((row, ri) =>
    new TableRow({
      children: (row as string[]).map((cell, ci) =>
        new TableCell({
          // Split \n into separate Paragraphs so GDocs renders them correctly
          children: cellParagraphs(cell, 18, hex(t.tableBodyText)),
          shading: ri % 2 === 1 ? shade(t.tableAltRowBg) : undefined,
          width: { size: Math.round(fracs[ci] * TOTAL_DXA), type: WidthType.DXA },
          borders: { top: thinBdr, bottom: thinBdr, left: thinBdr, right: thinBdr },
          margins: {
            left:   convertInchesToTwip(0.07),
            right:  convertInchesToTwip(0.07),
            top:    convertInchesToTwip(0.04),
            bottom: convertInchesToTwip(0.04),
          },
        })
      ),
    })
  );

  result.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: { top: thinBdr, bottom: thinBdr, left: thinBdr, right: thinBdr, insideH: thinBdr, insideV: thinBdr },
  }));

  return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateBiweeklyBlockDocx(
  report: any,
  savedBlocks?: any[],
  themeTokens?: Partial<BrandTokens>
): Promise<Buffer> {
  // Merge caller-supplied tokens on top of defaults
  const t: BrandTokens = { ...DEFAULT_TOKENS, ...themeTokens };

  const templateBlocks: DocBlock[] = (
    Array.isArray(savedBlocks) &&
    savedBlocks.length > 0 &&
    typeof savedBlocks[0]?.settings === "object"
  ) ? savedBlocks as DocBlock[] : DEFAULT_BLOCKS;

  const blocks = hydrateBlocks(templateBlocks, report);

  const clientName = san(report?.client_name ?? "");
  const preparedBy = san(report?.preparedBy ?? "");

  const children: (Paragraph | Table)[] = [];

  // Coloured header bar — replaces image header (reliable in GDocs)
  children.push(makeHeaderBar(clientName, preparedBy, t));
  children.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 140, after: 0 } }));

  for (const block of blocks) {
    if (!block.settings.visible) continue;

    switch (block.type) {
      case "title":       children.push(makeTitleBlock(block, t));           break;
      case "subtitle":    children.push(makeSubtitleBlock(block, t));        break;
      case "paragraph":
      case "richText":    children.push(...makeParagraphBlock(block));        break;
      case "divider":     children.push(makeDividerBlock());                 break;
      case "spacer":      children.push(makeSpacerBlock(block));             break;
      case "bulletList":
      case "numberedList":
      case "workLog":     children.push(...makeBulletList(block));           break;
      case "callout":     children.push(makeCalloutBlock(block, t));         break;
      case "dataTable":   children.push(...makeDataTableBlock(block, t));    break;
      case "closingSummary":
        children.push(new Paragraph({
          children: [new TextRun({ text: block.content || "", size: 20 })],
          spacing: sp(block),
        }));
        break;
    }

    // Inter-block gap
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
          run:       { bold: true, size: 36, color: hex(t.primaryColor) },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
        {
          id: "Heading2",
          name: "heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run:       { bold: true, size: 24, color: hex(t.primaryColor) },
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
                paragraph: {
                  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
                },
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
