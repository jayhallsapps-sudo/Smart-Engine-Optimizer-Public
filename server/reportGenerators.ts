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
  HeadingLevel,
  ShadingType,
  ImageRun,
  Header,
  TextWrappingType,
  convertInchesToTwip,
  PageBreak,
} from "docx";
import * as fs from "fs";
import * as path from "path";
import type { QbrPrepJson, Opportunity } from "./qbrPrepGenerator";
import PptxGenJSImport from "pptxgenjs";
// tsx/ESM interop: pptxgenjs exports the constructor as module.exports in CJS.
// moduleResolution:"bundler" may give us the namespace object instead of the fn.
const PptxGenJS: any = typeof PptxGenJSImport === "function" ? PptxGenJSImport : (PptxGenJSImport as any).default ?? PptxGenJSImport;

export interface SectionData {
  sectionId: string;
  title: string;
  items: CommittedItem[];
}

export interface RichBullet {
  textRuns: { text: string; bold: boolean }[];
  subBullets?: string[];
}

export interface CommittedItem {
  manualText?: string;
  tableRows?: WorkLogRow[];
  summary?: { label: string; current: string; previous: string; deltaPercent: string; isPositive: boolean }[];
  tables?: { title: string; headers: string[]; rows: (string | number)[][] }[];
  commandDescription?: string;
  dateRangeLabel?: string;
  richBullets?: RichBullet[];
}

export interface WorkLogRow {
  area: string;
  whatWeDid: string;
  whatsNext: string;
}

const WEBSERV_BLUE = "1B3A6B";
const WEBSERV_RED = "C0392B";
const WEBSERV_LIGHT = "F0F4FA";
const WEBSERV_LIGHT_RED = "FDECEA";
const WEBSERV_GRAY = "6B7280";
const DATE_PILL_BG = "E8EAED";
const WHITE = "FFFFFF";
const BLACK = "000000";

// Text-area width in DXA (twips): 8.5" page − 2 × 1.25" margins = 6" × 1440 twips/inch
const TEXT_AREA_DXA = 8640;

function makeBorder() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
  };
}

function headerCell(text: string, widthDxa?: number) {
  return new TableCell({
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.SOLID, color: WEBSERV_BLUE },
    borders: makeBorder(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
      }),
    ],
  });
}

function bodyCell(text: string, shade = false, widthDxa?: number) {
  return new TableCell({
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    shading: shade ? { type: ShadingType.SOLID, color: WEBSERV_LIGHT } : undefined,
    borders: makeBorder(),
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "—", size: 18 })],
      }),
    ],
  });
}

function sectionHeading(num: number, title: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${num}. ${title}`,
        bold: true,
        size: 26,
        color: WEBSERV_BLUE,
      }),
    ],
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: WEBSERV_BLUE },
    },
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20 })],
    spacing: { after: 60 },
  });
}

function metricBullet(label: string, current: string, previous: string, deltaPercent: string, isPositive: boolean) {
  const arrow = isPositive ? "▲" : "▼";
  const color = isPositive ? "16A34A" : "DC2626";
  return new Paragraph({
    bullet: { level: 0 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20 }),
      new TextRun({ text: `${current}`, size: 20 }),
      new TextRun({ text: ` (vs ${previous}  `, size: 20, color: WEBSERV_GRAY }),
      new TextRun({ text: `${arrow} ${deltaPercent}`, size: 20, color }),
      new TextRun({ text: ")", size: 20, color: WEBSERV_GRAY }),
    ],
    spacing: { after: 60 },
  });
}

function emptyPlaceholder() {
  return new Paragraph({
    children: [new TextRun({ text: "", size: 20 })],
    spacing: { after: 120 },
  });
}

function makeNoBorder() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: WHITE },
    bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
    left: { style: BorderStyle.NONE, size: 0, color: WHITE },
    right: { style: BorderStyle.NONE, size: 0, color: WHITE },
  };
}

function bwHeaderCell(text: string, widthDxa?: number) {
  return new TableCell({
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.SOLID, color: BLACK },
    borders: makeBorder(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
      }),
    ],
  });
}

function bwSectionHeading(num: number, title: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${num}. ${title}`,
        bold: true,
        size: 26,
        color: WEBSERV_RED,
      }),
    ],
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: WEBSERV_RED },
    },
  });
}

// Work-log column widths: Area 1" | What We Did 3" | What's Next 2"  (total = 6")
const WL_COL = [1440, 4320, 2880] as const;

function buildBwWorkLogTable(rows: WorkLogRow[]): Table {
  return new Table({
    width: { size: TEXT_AREA_DXA, type: WidthType.DXA },
    columnWidths: [...WL_COL],
    rows: [
      new TableRow({
        children: [
          bwHeaderCell("Area", WL_COL[0]),
          bwHeaderCell("What We Did / Learned", WL_COL[1]),
          bwHeaderCell("What's Next", WL_COL[2]),
        ],
        tableHeader: true,
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: [
            bodyCell(row.area, ri % 2 === 1, WL_COL[0]),
            bodyCell(row.whatWeDid, ri % 2 === 1, WL_COL[1]),
            bodyCell(row.whatsNext, ri % 2 === 1, WL_COL[2]),
          ],
        })
      ),
    ],
  });
}

function richBulletParagraphs(bullet: RichBullet): Paragraph[] {
  const result: Paragraph[] = [];
  result.push(
    new Paragraph({
      bullet: { level: 0 },
      children: bullet.textRuns.map(run =>
        new TextRun({
          text: run.text,
          bold: run.bold,
          size: 20,
          color: run.bold ? WEBSERV_RED : "111827",
        })
      ),
      spacing: { after: 40 },
    })
  );
  for (const sub of bullet.subBullets ?? []) {
    result.push(
      new Paragraph({
        bullet: { level: 1 },
        children: [new TextRun({ text: sub, size: 18, color: "374151" })],
        spacing: { after: 40 },
        indent: { left: convertInchesToTwip(0.25) },
      })
    );
  }
  return result;
}

function renderItemContent(item: CommittedItem, isBwProgress = false): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (isBwProgress && item.tableRows && item.tableRows.length > 0) {
    return [];
  }

  if (item.richBullets && item.richBullets.length > 0) {
    for (const rb of item.richBullets) {
      paragraphs.push(...richBulletParagraphs(rb));
    }
    return paragraphs;
  }

  if (item.manualText) {
    const lines = item.manualText.split("\n").filter(l => l.trim());
    for (const line of lines) {
      paragraphs.push(bulletParagraph(line));
    }
    return paragraphs;
  }

  if (item.summary && item.summary.length > 0) {
    for (const s of item.summary) {
      paragraphs.push(metricBullet(s.label, s.current, s.previous, s.deltaPercent, s.isPositive));
    }
  }

  if (item.tables && item.tables.length > 0) {
    return paragraphs;
  }

  if (item.commandDescription && paragraphs.length === 0) {
    paragraphs.push(bulletParagraph(item.commandDescription));
  }

  return paragraphs;
}

function buildWorkLogTable(rows: WorkLogRow[]): Table {
  return new Table({
    width: { size: TEXT_AREA_DXA, type: WidthType.DXA },
    columnWidths: [...WL_COL],
    rows: [
      new TableRow({
        children: [
          headerCell("Area", WL_COL[0]),
          headerCell("What We Did / Learned", WL_COL[1]),
          headerCell("What's Next", WL_COL[2]),
        ],
        tableHeader: true,
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: [
            bodyCell(row.area, ri % 2 === 1, WL_COL[0]),
            bodyCell(row.whatWeDid, ri % 2 === 1, WL_COL[1]),
            bodyCell(row.whatsNext, ri % 2 === 1, WL_COL[2]),
          ],
        })
      ),
    ],
  });
}

function buildDataTable(headers: string[], rows: (string | number)[][]): Table {
  const n = headers.length;
  const colW = Math.floor(TEXT_AREA_DXA / n);
  // Last column absorbs any rounding remainder
  const widths = headers.map((_, i) =>
    i < n - 1 ? colW : TEXT_AREA_DXA - colW * (n - 1)
  );
  return new Table({
    width: { size: TEXT_AREA_DXA, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => headerCell(h, widths[i])),
        tableHeader: true,
      }),
      ...rows.slice(0, 25).map((row, ri) =>
        new TableRow({
          children: row.map((cell, i) => bodyCell(String(cell), ri % 2 === 1, widths[i])),
        })
      ),
    ],
  });
}

export async function generateBiweeklyDocx(
  clientName: string,
  attendees: string,
  date: string,
  sections: SectionData[]
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Webserv header swoosh — full page width (8.5" = 816 px @ 96 dpi), bleeds to all edges
  // transformation uses PIXELS (docx library multiplies by 9525 internally to produce EMU)
  const HEADER_W_PX = 816;                                     // 8.5" × 96 dpi
  const HEADER_H_PX = Math.round((143 / 692) * HEADER_W_PX);  // ≈ 169 px

  const headerImagePath = path.join(process.cwd(), "server", "assets", "biweekly_header.png");
  const headerImageData = fs.readFileSync(headerImagePath);

  const docHeader = new Header({
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: headerImageData,
            transformation: { width: HEADER_W_PX, height: HEADER_H_PX },
            floating: {
              // Anchor to the PAGE corner at (0, 0) — bypasses all margin constraints
              horizontalPosition: {
                relative: "page",
                offset: 0,
              },
              verticalPosition: {
                relative: "page",
                offset: 0,
              },
              wrap: {
                type: TextWrappingType.TOP_AND_BOTTOM,
              },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              allowOverlap: false,
              lockAnchor: true,
            },
          }),
        ],
      }),
    ],
  });

  // Body starts with title + meta — header image is above via section header
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `SEO Bi-weekly Meeting: ${clientName}`,
          bold: true,
          size: 36,
          color: BLACK,
        }),
      ],
      spacing: { before: 80, after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Attendees: ", bold: true, size: 20 }),
        new TextRun({ text: attendees || "", size: 20 }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      shading: { type: ShadingType.SOLID, color: DATE_PILL_BG },
      children: [
        new TextRun({ text: "Date: ", bold: true, size: 20 }),
        new TextRun({ text: date, size: 20 }),
      ],
      spacing: { after: 280 },
    })
  );

  const SECTION_ORDER = ["bw_purpose", "bw_pulse", "bw_progress", "bw_partnership"];
  const SECTION_NUMS: Record<string, number> = {
    bw_purpose: 0,
    bw_pulse: 1,
    bw_progress: 2,
    bw_partnership: 3,
  };

  const PURPOSE_TEXT =
    "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.";

  for (const sectionId of SECTION_ORDER) {
    const section = sections.find(s => s.sectionId === sectionId);
    if (!section) continue;

    const num = SECTION_NUMS[sectionId];

    if (sectionId === "bw_purpose") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Purpose:", bold: true, size: 24, color: WEBSERV_RED }),
          ],
          spacing: { before: 160, after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: PURPOSE_TEXT, size: 20 })],
          spacing: { after: 240 },
        })
      );
      continue;
    }

    children.push(bwSectionHeading(num, section.title));

    if (section.items.length === 0) {
      children.push(emptyPlaceholder());
      continue;
    }

    if (sectionId === "bw_progress") {
      const workLogRows: WorkLogRow[] = [];
      const manualRows: WorkLogRow[] = [];
      const otherItems: CommittedItem[] = [];

      for (const item of section.items) {
        if (item.tableRows && item.tableRows.length > 0) {
          workLogRows.push(...item.tableRows);
        } else if (item.manualText) {
          manualRows.push({ area: "", whatWeDid: item.manualText, whatsNext: "" });
        } else if (item.tables && item.tables.length > 0) {
          for (const tbl of item.tables) {
            for (const row of tbl.rows) {
              workLogRows.push({
                area: tbl.title || String(row[0] || ""),
                whatWeDid: String(row[0] || ""),
                whatsNext: "",
              });
            }
          }
        } else {
          otherItems.push(item);
        }
      }

      const allRows = [...workLogRows, ...manualRows];
      if (allRows.length > 0) {
        children.push(
          new Paragraph({ children: [], spacing: { before: 80 } }),
          buildBwWorkLogTable(allRows),
          new Paragraph({ children: [], spacing: { after: 160 } })
        );
      }

      for (const item of otherItems) {
        const paras = renderItemContent(item);
        children.push(...paras);
      }
      continue;
    }

    for (const item of section.items) {
      const paras = renderItemContent(item);
      children.push(...paras);

      if (item.tables) {
        for (const tbl of item.tables) {
          if (tbl.title) {
            children.push(new Paragraph({
              children: [new TextRun({ text: tbl.title, bold: true, size: 18, color: WEBSERV_GRAY })],
              spacing: { before: 100, after: 60 },
            }));
          }
          children.push(
            new Paragraph({ children: [], spacing: { before: 60 } }),
            buildDataTable(tbl.headers, tbl.rows),
            new Paragraph({ children: [], spacing: { after: 100 } })
          );
        }
      }
    }

    children.push(new Paragraph({ children: [], spacing: { after: 200 } }));
  }

  children.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "888888" } },
      children: [
        new TextRun({ text: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io", size: 16, color: WEBSERV_GRAY }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 280, after: 0 },
    })
  );

  const doc = new Document({
    sections: [{
      headers: {
        default: docHeader,
      },
      properties: {
        page: {
          margin: {
            // header bleeds from top edge; body starts after image height (≈1.76") + gap
            top: convertInchesToTwip(2.0),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25),
            right: convertInchesToTwip(1.25),
            header: 0, // image anchors to the very top of the page
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

const SLIDE_BG = "F8FAFC";
const SLIDE_ACCENT = "1B3A6B";
const SLIDE_TEXT = "1F2937";
const SLIDE_SUBTEXT = "6B7280";
const SLIDE_HIGHLIGHT = "E8F0FE";

function addTitleSlide(pptx: any, clientName: string, reportLabel: string, date: string) {
  const slide = pptx.addSlide();
  slide.background = { color: SLIDE_ACCENT };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4.5, w: "100%", h: 0.5,
    fill: { color: "FFFFFF", transparency: 85 },
    line: { color: SLIDE_ACCENT },
  });

  slide.addText(reportLabel, {
    x: 0.6, y: 1.2, w: 8.8, h: 0.8,
    fontSize: 36, bold: true, color: "FFFFFF",
    align: "left",
  });

  slide.addText(clientName, {
    x: 0.6, y: 2.1, w: 8.8, h: 0.6,
    fontSize: 24, color: "BFD7FF",
    align: "left",
  });

  slide.addText(date, {
    x: 0.6, y: 2.9, w: 8.8, h: 0.4,
    fontSize: 14, color: "BFD7FF",
    align: "left",
  });

  slide.addText("Webserv  |  webserv.io", {
    x: 0.6, y: 6.8, w: 8.8, h: 0.3,
    fontSize: 10, color: "BFD7FF",
    align: "left",
  });
}

function addSectionSlide(
  pptx: any,
  sectionNum: number,
  sectionTitle: string,
  items: CommittedItem[]
) {
  const slide = pptx.addSlide();
  slide.background = { color: SLIDE_BG };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.85,
    fill: { color: SLIDE_ACCENT },
    line: { color: SLIDE_ACCENT },
  });

  slide.addText(`${sectionNum}. ${sectionTitle}`, {
    x: 0.4, y: 0.1, w: 9.2, h: 0.65,
    fontSize: 20, bold: true, color: "FFFFFF",
    align: "left",
  });

  if (items.length === 0) {
    slide.addText("", {
      x: 0.5, y: 1.1, w: 9, h: 5,
      fontSize: 13, color: SLIDE_SUBTEXT,
    });
    return;
  }

  let yPos = 1.0;

  for (const item of items) {
    if (item.summary && item.summary.length > 0) {
      const cols = Math.min(4, item.summary.length);
      const cellW = 9.2 / cols;
      for (let i = 0; i < item.summary.length; i++) {
        const s = item.summary[i];
        const col = i % cols;
        const xPos = 0.4 + col * cellW;
        if (i > 0 && i % cols === 0) yPos += 1.3;

        slide.addShape(pptx.ShapeType.rect, {
          x: xPos, y: yPos, w: cellW - 0.1, h: 1.1,
          fill: { color: SLIDE_HIGHLIGHT },
          line: { color: "D1D5DB" },
          rectRadius: 0.05,
        });
        slide.addText(s.label, {
          x: xPos + 0.1, y: yPos + 0.05, w: cellW - 0.2, h: 0.3,
          fontSize: 9, color: SLIDE_SUBTEXT,
        });
        slide.addText(s.current, {
          x: xPos + 0.1, y: yPos + 0.32, w: cellW - 0.2, h: 0.42,
          fontSize: 20, bold: true, color: SLIDE_TEXT,
        });
        const arrow = s.isPositive ? "▲" : "▼";
        const dColor = s.isPositive ? "16A34A" : "DC2626";
        slide.addText(`vs ${s.previous}  ${arrow} ${s.deltaPercent}`, {
          x: xPos + 0.1, y: yPos + 0.72, w: cellW - 0.2, h: 0.28,
          fontSize: 9, color: dColor,
        });
      }
      yPos += 1.4;
    }

    if (item.tables && item.tables.length > 0) {
      for (const tbl of item.tables) {
        if (yPos > 5.5) {
          const overflow = pptx.addSlide();
          overflow.background = { color: SLIDE_BG };
          overflow.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: "100%", h: 0.85,
            fill: { color: SLIDE_ACCENT },
            line: { color: SLIDE_ACCENT },
          });
          overflow.addText(`${sectionNum}. ${sectionTitle} (cont.)`, {
            x: 0.4, y: 0.1, w: 9.2, h: 0.65,
            fontSize: 20, bold: true, color: "FFFFFF",
          });
          yPos = 1.0;
        }

        const colW = 9.2 / tbl.headers.length;
        const rows: any[] = [
          tbl.headers.map(h => ({
            text: h,
            options: { bold: true, fontSize: 9, color: "FFFFFF", fill: { color: SLIDE_ACCENT }, align: "center" as const },
          })),
          ...tbl.rows.slice(0, 15).map((row, ri) =>
            row.map(cell => ({
              text: String(cell),
              options: {
                fontSize: 8,
                color: SLIDE_TEXT,
                fill: { color: ri % 2 === 0 ? "FFFFFF" : SLIDE_HIGHLIGHT },
                align: "center" as const,
              },
            }))
          ),
        ];

        slide.addTable(rows, {
          x: 0.4, y: yPos, w: 9.2,
          colW: Array(tbl.headers.length).fill(colW),
          border: { type: "solid", color: "D1D5DB", pt: 0.5 },
          rowH: 0.28,
        });
        yPos += (Math.min(tbl.rows.length, 15) + 1) * 0.28 + 0.2;
      }
    }

    if (item.manualText && !item.tables?.length && !item.summary?.length) {
      const lines = item.manualText.split("\n").filter(l => l.trim());
      const bullets = lines.map(l => ({ text: `•  ${l}`, options: { fontSize: 12, color: SLIDE_TEXT } }));
      slide.addText(bullets, {
        x: 0.5, y: yPos, w: 9, h: Math.min(lines.length * 0.35 + 0.2, 5.5),
        align: "left",
        valign: "top",
      });
      yPos += lines.length * 0.35 + 0.3;
    }
  }

  slide.addText("Webserv  |  webserv.io", {
    x: 0.4, y: 7.1, w: 9.2, h: 0.25,
    fontSize: 8, color: SLIDE_SUBTEXT,
    align: "right",
  });
}

export async function generatePptx(
  clientName: string,
  reportLabel: string,
  date: string,
  sections: SectionData[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Webserv SmartEO";
  pptx.subject = reportLabel;
  pptx.title = `${clientName} — ${reportLabel}`;

  addTitleSlide(pptx, clientName, reportLabel, date);

  sections.forEach((section, idx) => {
    addSectionSlide(pptx, idx + 1, section.title, section.items);
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
  return buffer;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "C0392B",
  P1: "D68910",
  P2: "1B3A6B",
};

const PRIORITY_LABELS: Record<string, string> = {
  P0: "P0 — Critical",
  P1: "P1 — High",
  P2: "P2 — Standard",
};

const CATEGORY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

function oppHeaderRow(opp: Opportunity, idx: number): TableRow {
  const prioColor = PRIORITY_COLORS[opp.priority] ?? WEBSERV_BLUE;
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: prioColor },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        children: [
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: `${idx}. ${opp.opportunity_title}`,
                bold: true, size: 22, color: "FFFFFF",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function oppMetaRow(opp: Opportunity): TableRow {
  const chips = [
    `Priority: ${PRIORITY_LABELS[opp.priority] ?? opp.priority}`,
    `Impact: ${opp.impact}`,
    `Effort: ${opp.effort === "S" ? "S (Small)" : opp.effort === "M" ? "M (Medium)" : "L (Large)"}`,
    `KPI: ${opp.kpi_affected}`,
  ];
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        children: [
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: chips.map((c, i) => new TextRun({
              text: (i > 0 ? "    |    " : "") + c,
              bold: i === 0, size: 17, color: "374151",
            })),
          }),
        ],
      }),
    ],
  });
}

function oppBodyRows(opp: Opportunity): TableRow[] {
  const fields: Array<[string, string]> = [];
  if (opp.urls.length > 0) fields.push(["URL(s)", opp.urls.join("\n")]);
  fields.push(["Evidence", opp.evidence]);
  fields.push(["Problem", opp.problem]);
  fields.push(["Opportunity", opp.opportunity]);
  fields.push(["Why It Matters", opp.why_it_matters]);
  fields.push(["Recommended Next Step", opp.recommended_next_step]);

  return fields.map(([label, value]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          },
          children: [
            new Paragraph({
              spacing: { before: 80, after: 80 },
              indent: { left: convertInchesToTwip(0.1) },
              children: [
                new TextRun({ text: `${label}: `, bold: true, size: 18, color: "374151" }),
                new TextRun({ text: value, size: 18, color: "111827" }),
              ],
            }),
          ],
        }),
      ],
    })
  );
}

export async function generateQbrPrepDocx(json: QbrPrepJson): Promise<Buffer> {
  const docChildren: any[] = [];

  docChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 160 },
      shading: { type: ShadingType.CLEAR, fill: WEBSERV_BLUE },
      children: [
        new TextRun({ text: "QBR PREP", bold: true, size: 48, color: "FFFFFF" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({ text: json.client_name, bold: true, size: 32, color: WEBSERV_BLUE }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `Analysis Window: `, bold: true, size: 20, color: "374151" }),
        new TextRun({ text: `${json.past_window_label}  (${json.past_start} → ${json.past_end})`, size: 20, color: "374151" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `Planning Horizon: `, bold: true, size: 20, color: "374151" }),
        new TextRun({ text: json.future_window_label, size: 20, color: "374151" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({ text: `Generated: `, bold: true, size: 18, color: WEBSERV_GRAY }),
        new TextRun({ text: new Date(json.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }), size: 18, color: WEBSERV_GRAY }),
      ],
    }),

    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({ text: "Executive Summary", bold: true, size: 36, color: WEBSERV_BLUE }),
      ],
    }),

    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({ text: `Top Wins — ${json.past_window_label}`, bold: true, size: 24, color: "1B6B3A" }),
      ],
    }),
  );

  for (const win of json.executive_summary.wins) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 20 },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: win.title, bold: true, size: 19, color: "111827" }),
        ],
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        bullet: { level: 1 },
        children: [
          new TextRun({ text: `${win.source}: `, bold: true, size: 17, color: WEBSERV_GRAY }),
          new TextRun({ text: win.evidence, size: 17, color: "374151" }),
        ],
      }),
    );
  }

  docChildren.push(
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({ text: `Top 5 Opportunities for ${json.future_window_label}`, bold: true, size: 24, color: WEBSERV_BLUE }),
      ],
    }),
  );

  const topOppTableRows = [
    new TableRow({
      tableHeader: true,
      children: ["Priority", "Opportunity", "Category", "Impact", "KPI"].map(h =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: WEBSERV_BLUE },
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          },
          children: [new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })],
          })],
        })
      ),
    }),
    ...json.executive_summary.top_opportunities.map((opp, i) =>
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: i % 2 === 0 ? WEBSERV_LIGHT : "FFFFFF" },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [new Paragraph({ children: [new TextRun({ text: opp.priority, bold: true, size: 18, color: PRIORITY_COLORS[opp.priority] ?? WEBSERV_BLUE })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: i % 2 === 0 ? WEBSERV_LIGHT : "FFFFFF" },
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [new Paragraph({ children: [new TextRun({ text: opp.title, size: 17, color: "111827" })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: i % 2 === 0 ? WEBSERV_LIGHT : "FFFFFF" },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [new Paragraph({ children: [new TextRun({ text: opp.category, size: 17, color: "374151" })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: i % 2 === 0 ? WEBSERV_LIGHT : "FFFFFF" },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [new Paragraph({ children: [new TextRun({ text: opp.impact, size: 17, color: "374151" })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: i % 2 === 0 ? WEBSERV_LIGHT : "FFFFFF" },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [new Paragraph({ children: [new TextRun({ text: opp.kpi, size: 17, color: "374151" })] })],
          }),
        ],
      })
    ),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: topOppTableRows,
    }),
    new Paragraph({
      spacing: { before: 320, after: 160 },
      children: [
        new TextRun({ text: "Opportunity Backlog", bold: true, size: 36, color: WEBSERV_BLUE }),
      ],
    }),
  );

  for (let ci = 0; ci < json.opportunity_backlog.length; ci++) {
    const cat = json.opportunity_backlog[ci];
    const letter = CATEGORY_LETTERS[ci] ?? String(ci + 1);

    docChildren.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        shading: { type: ShadingType.CLEAR, fill: "EFF6FF" },
        children: [
          new TextRun({ text: `${letter}. ${cat.category_name}`, bold: true, size: 28, color: WEBSERV_BLUE }),
          new TextRun({ text: `  (${cat.opportunities.length} ${cat.opportunities.length === 1 ? "item" : "items"})`, size: 20, color: WEBSERV_GRAY }),
        ],
      }),
    );

    if (cat.opportunities.length === 0) {
      docChildren.push(new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: "No opportunities identified for this category.", size: 18, color: WEBSERV_GRAY, italics: true })],
      }));
      continue;
    }

    for (let oi = 0; oi < cat.opportunities.length; oi++) {
      const opp = cat.opportunities[oi];
      docChildren.push(
        new Paragraph({ spacing: { before: 100, after: 0 }, children: [] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            oppHeaderRow(opp, oi + 1),
            oppMetaRow(opp),
            ...oppBodyRows(opp),
          ],
        }),
        new Paragraph({ spacing: { before: 60, after: 0 }, children: [] }),
      );
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.75),
            right: convertInchesToTwip(0.9),
            bottom: convertInchesToTwip(0.75),
            left: convertInchesToTwip(0.9),
          },
        },
      },
      children: docChildren,
    }],
  });

  return await Packer.toBuffer(doc);
}
