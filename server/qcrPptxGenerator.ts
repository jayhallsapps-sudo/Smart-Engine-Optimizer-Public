/**
 * qcrPptxGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated PPTX generator for the Quarterly Content Roadmap deck.
 *
 * Unlike the generic generatePptx() in reportGenerators.ts, this function
 * accepts template styling options read from template_config.json and applies
 * them to the generated PPTX output.
 *
 * WHAT FLOWS THROUGH FROM TEMPLATE CONFIG:
 *   ✓ accentColor   — header bars, table header row background, accent stripe
 *   ✓ darkColor     — title slide background, section divider slides
 *   ✓ fontFamily    — all text elements on all slides
 *
 * WHAT DOES NOT FLOW THROUGH (architectural limits of pptxgenjs):
 *   ✗ Per-element x/y positions from the canvas editor (canvas uses % coords
 *     on a 16:9 preview; PPTX uses absolute inches and has no CSS-equivalent
 *     of arbitrary free-form layout without rebuilding the entire slide tree
 *     per template — that would require a full template-to-slide compiler which
 *     is outside the current scope)
 *   ✗ Per-element font sizes (canvas preview font sizes are preview-scaled)
 *   ✗ Individual element visibility toggles from the canvas
 *
 * NON-REGRESSION: this file has zero side-effects on reportGenerators.ts
 * or any other generator. It imports only pptxgenjs and standard types.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import PptxGenJS from "pptxgenjs";

export interface QcrPptxSection {
  title: string;
  bullets?: string[];
  table?: {
    headers: string[];
    rows: (string | number)[][];
  };
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

function resolveOpts(opts: QcrTemplateOpts): Required<QcrTemplateOpts> {
  return {
    accentColor: (opts.accentColor ?? DEFAULT_OPTS.accentColor).replace("#", ""),
    darkColor:   (opts.darkColor   ?? DEFAULT_OPTS.darkColor).replace("#", ""),
    fontFamily:  opts.fontFamily   ?? DEFAULT_OPTS.fontFamily,
  };
}

function addQcrTitleSlide(
  pptx: PptxGenJS,
  clientName: string,
  reportTitle: string,
  date: string,
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: o.darkColor };

  slide.addShape((pptx as any).ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.08,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  slide.addShape((pptx as any).ShapeType.rect, {
    x: 0, y: 7.27, w: "100%", h: 0.08,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  slide.addText(reportTitle, {
    x: 0.6, y: 1.3, w: 8.8, h: 0.8,
    fontSize: 34, bold: true, color: "FFFFFF",
    fontFace: o.fontFamily,
    align: "left",
  });

  slide.addText(clientName, {
    x: 0.6, y: 2.25, w: 8.8, h: 0.55,
    fontSize: 22, color: "BFD7FF",
    fontFace: o.fontFamily,
    align: "left",
  });

  slide.addText(date, {
    x: 0.6, y: 2.95, w: 8.8, h: 0.38,
    fontSize: 13, color: "93C5FD",
    fontFace: o.fontFamily,
    align: "left",
  });

  slide.addText("Webserv  |  webserv.io", {
    x: 0.6, y: 6.85, w: 8.8, h: 0.28,
    fontSize: 10, color: "BFD7FF",
    fontFace: o.fontFamily,
    align: "left",
  });
}

function addQcrStrategySlide(
  pptx: PptxGenJS,
  idx: number,
  title: string,
  bullets: string[],
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };

  slide.addShape((pptx as any).ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.85,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  slide.addText(`${idx}. ${title}`, {
    x: 0.4, y: 0.1, w: 9.2, h: 0.65,
    fontSize: 20, bold: true, color: "FFFFFF",
    fontFace: o.fontFamily,
    align: "left",
  });

  const bulletLines = bullets
    .filter(Boolean)
    .map(b => ({ text: `•  ${b}`, options: { fontSize: 13, color: "1F2937", fontFace: o.fontFamily } }));

  if (bulletLines.length > 0) {
    slide.addText(bulletLines, {
      x: 0.5, y: 1.0, w: 9.0, h: 5.8,
      align: "left",
      valign: "top",
      paraSpaceAfter: 6,
    });
  }

  slide.addText("Webserv  |  webserv.io", {
    x: 0.4, y: 7.1, w: 9.2, h: 0.25,
    fontSize: 8, color: "6B7280",
    fontFace: o.fontFamily,
    align: "right",
  });
}

function addQcrTableSlide(
  pptx: PptxGenJS,
  idx: number,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  o: Required<QcrTemplateOpts>,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };

  slide.addShape((pptx as any).ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.85,
    fill: { color: o.accentColor },
    line: { color: o.accentColor },
  });

  slide.addText(`${idx}. ${title}`, {
    x: 0.4, y: 0.1, w: 9.2, h: 0.65,
    fontSize: 20, bold: true, color: "FFFFFF",
    fontFace: o.fontFamily,
    align: "left",
  });

  const colW = 9.2 / headers.length;

  const tableRows: any[] = [
    headers.map(h => ({
      text: h,
      options: {
        bold: true, fontSize: 9, color: "FFFFFF",
        fill: { color: o.accentColor },
        fontFace: o.fontFamily,
        align: "center" as const,
      },
    })),
    ...rows.slice(0, 22).map((row, ri) =>
      row.map(cell => ({
        text: String(cell),
        options: {
          fontSize: 8,
          color: "1F2937",
          fill: { color: ri % 2 === 0 ? "FFFFFF" : "E8F0FE" },
          fontFace: o.fontFamily,
          align: "left" as const,
        },
      }))
    ),
  ];

  slide.addTable(tableRows, {
    x: 0.4, y: 0.95, w: 9.2,
    colW: Array(headers.length).fill(colW),
    border: { type: "solid", color: "D1D5DB", pt: 0.5 },
    rowH: 0.28,
  });

  slide.addText("Webserv  |  webserv.io", {
    x: 0.4, y: 7.1, w: 9.2, h: 0.25,
    fontSize: 8, color: "6B7280",
    fontFace: o.fontFamily,
    align: "right",
  });
}

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

  addQcrTitleSlide(pptx, clientName, reportTitle, date, o);

  sections.forEach((section, i) => {
    const idx = i + 1;
    if (section.table) {
      addQcrTableSlide(pptx, idx, section.title, section.table.headers, section.table.rows, o);
    } else if (section.bullets && section.bullets.length > 0) {
      addQcrStrategySlide(pptx, idx, section.title, section.bullets, o);
    }
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" }) as unknown as Buffer;
  return buffer;
}
