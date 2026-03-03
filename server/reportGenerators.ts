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
  convertInchesToTwip,
  PageBreak,
} from "docx";
import PptxGenJSImport from "pptxgenjs";
// tsx/ESM interop: pptxgenjs exports the constructor as module.exports in CJS.
// moduleResolution:"bundler" may give us the namespace object instead of the fn.
const PptxGenJS: any = typeof PptxGenJSImport === "function" ? PptxGenJSImport : (PptxGenJSImport as any).default ?? PptxGenJSImport;

export interface SectionData {
  sectionId: string;
  title: string;
  items: CommittedItem[];
}

export interface CommittedItem {
  manualText?: string;
  tableRows?: WorkLogRow[];
  summary?: { label: string; current: string; previous: string; deltaPercent: string; isPositive: boolean }[];
  tables?: { title: string; headers: string[]; rows: (string | number)[][] }[];
  commandDescription?: string;
  dateRangeLabel?: string;
}

export interface WorkLogRow {
  area: string;
  whatWeDid: string;
  whatsNext: string;
}

const WEBSERV_BLUE = "1B3A6B";
const WEBSERV_LIGHT = "F0F4FA";
const WEBSERV_GRAY = "6B7280";
const WHITE = "FFFFFF";

function makeBorder() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
  };
}

function headerCell(text: string) {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: WEBSERV_BLUE },
    borders: makeBorder(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
      }),
    ],
  });
}

function bodyCell(text: string, shade = false) {
  return new TableCell({
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

function renderItemContent(item: CommittedItem, isBwProgress = false): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (isBwProgress && item.tableRows && item.tableRows.length > 0) {
    return [];
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
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Area"),
          headerCell("What We Did / Learned"),
          headerCell("What's Next"),
        ],
        tableHeader: true,
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: [
            bodyCell(row.area, ri % 2 === 1),
            bodyCell(row.whatWeDid, ri % 2 === 1),
            bodyCell(row.whatsNext, ri % 2 === 1),
          ],
        })
      ),
    ],
  });
}

function buildDataTable(headers: string[], rows: (string | number)[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(h => headerCell(h)),
        tableHeader: true,
      }),
      ...rows.slice(0, 25).map((row, ri) =>
        new TableRow({
          children: row.map(cell => bodyCell(String(cell), ri % 2 === 1)),
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

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `SEO Bi-weekly Meeting: ${clientName}`,
          bold: true,
          size: 36,
          color: WEBSERV_BLUE,
        }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Attendees: ", bold: true, size: 20 }),
        new TextRun({ text: attendees || "", size: 20 }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true, size: 20 }),
        new TextRun({ text: date, size: 20 }),
      ],
      spacing: { after: 280 },
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: WEBSERV_BLUE },
      },
      children: [],
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
            new TextRun({ text: "Purpose:", bold: true, size: 24, color: WEBSERV_BLUE }),
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

    children.push(sectionHeading(num, section.title));

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
          buildWorkLogTable(allRows),
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
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: WEBSERV_BLUE } },
      children: [
        new TextRun({ text: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io", size: 16, color: WEBSERV_GRAY }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 280, after: 0 },
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25),
            right: convertInchesToTwip(1.25),
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
