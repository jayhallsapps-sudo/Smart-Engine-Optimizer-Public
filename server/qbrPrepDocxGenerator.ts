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
  ImageRun,
  Header,
  Footer,
  convertInchesToTwip,
} from "docx";
import * as fs from "fs";
import * as path from "path";

// ── Design tokens ─────────────────────────────────────────────────────────────
const WEBSERV_RED  = "C0392B";
const DARK_HEADER  = "1F2937";
const LIGHT_BG     = "F3F4F6";
const ALT_ROW      = "F9FAFB";
const AM_BG        = "FEF9F8";
const AM_BORDER    = "F5C6B8";
const GRAY         = "6B7280";
const MID_GRAY     = "9CA3AF";
const WHITE        = "FFFFFF";
const BLACK        = "111827";
const BORDER_COLOR = "D1D5DB";
const LABEL_BG     = "F3F4F6";

// Cell margin constants (DXA units)
const HDR_MARGIN  = { top: 100, bottom: 100, left: 140, right: 140 };
const CELL_MARGIN = { top: 90,  bottom: 90,  left: 140, right: 140 };
const LABEL_MARGIN = { top: 90, bottom: 90,  left: 120, right: 120 };

// ── Prompt artifact safety guard ──────────────────────────────────────────────
const DOCX_PROMPT_ARTIFACT_SIGNALS = [
  "PRIMARY PRODUCT GOAL", "CURRENT PROBLEMS THAT MUST BE FIXED", "NON-NEGOTIABLE PRODUCT RULES",
  "WHAT MID-STRATEGY SHOULD ACTUALLY ANALYZE", "REQUIRED OUTPUT", "FINAL WARNING",
  "SLIDE GENERATION PHILOSOPHY", "NON-NEGOTIABLE FIX REQUIREMENTS", "STRICT QA ACCEPTANCE CRITERIA",
];
function docxContainsPromptArtifact(text: string | undefined): boolean {
  if (!text) return false;
  const upper = text.toUpperCase();
  return DOCX_PROMPT_ARTIFACT_SIGNALS.some(s => upper.includes(s));
}

// ── Primitive helpers ─────────────────────────────────────────────────────────

function thinBorder() {
  return {
    top:    { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
    left:   { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
    right:  { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
  };
}

function noBorder() {
  return {
    top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
}

/** Bold label cell used in structured block tables (25% col). */
function labelCell(text: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: LABEL_BG },
    borders: thinBorder(),
    margins: LABEL_MARGIN,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 17, color: GRAY, font: "Calibri" })],
      }),
    ],
  });
}

/** Standard header cell for makeTable */
function hdrCell(text: string, widthPct?: number) {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.SOLID, color: DARK_HEADER },
    borders: thinBorder(),
    margins: HDR_MARGIN,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 17, font: "Calibri" })],
      }),
    ],
  });
}

/** Standard body cell for makeTable */
function bodyCell(text: string, shade = false, widthPct?: number) {
  const isManual = (text ?? "").includes("Manual entry needed");
  const display  = text || "—";
  const lines = display.split(/\n/);
  const runs: TextRun[] = [];
  lines.forEach((line, i) => {
    runs.push(new TextRun({
      text: line,
      size: 18,
      font: "Calibri",
      italics: isManual,
      color: isManual ? MID_GRAY : "374151",
      break: i === 0 ? undefined : 1,
    }));
  });
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shade ? { type: ShadingType.SOLID, color: ALT_ROW } : undefined,
    borders: thinBorder(),
    margins: CELL_MARGIN,
    children: [new Paragraph({ children: runs })],
  });
}

/** Generic table: headers + rows, with optional column widths (percentages). */
function makeTable(headers: string[], rows: string[][], colWidths?: number[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => hdrCell(h, colWidths?.[i])),
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) => bodyCell(cell, ri % 2 === 1, colWidths?.[ci])),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ── Section / subheading helpers ──────────────────────────────────────────────

function sectionHeading(num: number, title: string, addPageBreak = false) {
  return new Paragraph({
    pageBreakBefore: addPageBreak,
    children: [
      new TextRun({ text: `${num}.  ${title}`, bold: true, size: 28, color: WEBSERV_RED, font: "Calibri" }),
    ],
    spacing: { before: addPageBreak ? 0 : 560, after: 180 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: WEBSERV_RED },
    },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 21, color: "374151", font: "Calibri" })],
    spacing: { before: 320, after: 120 },
  });
}

function spacer(pts = 120) {
  return new Paragraph({ children: [new TextRun("")], spacing: { before: 0, after: pts } });
}

// ── Meta fields table ─────────────────────────────────────────────────────────
function metaTable(fields: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: fields.map(([label, val]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: LABEL_BG },
            borders: thinBorder(),
            margins: LABEL_MARGIN,
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 17, color: GRAY, font: "Calibri" })] })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({ children: [new TextRun({ text: val ?? "—", size: 17, color: "374151", font: "Calibri" })] })],
          }),
        ],
      })
    ),
  });
}

// ── AM Context block ──────────────────────────────────────────────────────────
function amContextBlock(manualInputs: any): Table | null {
  const amThoughts      = manualInputs?.amThoughts ?? manualInputs?.hypothesis;
  const prevQtrAssess   = manualInputs?.prevQtrAssessment;
  const clientNotes     = manualInputs?.clientNotes;
  const clientSentiment = manualInputs?.clientSentiment ?? manualInputs?.sentiment;

  if (!amThoughts && !prevQtrAssess && !clientNotes && !clientSentiment) return null;

  const fieldDefs: [string, string | undefined][] = [
    ["AM's Hypothesis",              amThoughts],
    ["Previous Quarter Assessment",  prevQtrAssess],
    ["Client Insights",              clientNotes],
    ["Client Sentiment",             clientSentiment],
  ];

  const rows: TableRow[] = [];

  // Title header row
  rows.push(new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { type: ShadingType.SOLID, color: AM_BG },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
          left:   { style: BorderStyle.THICK,  size: 24, color: WEBSERV_RED },
          right:  { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
        },
        margins: { top: 100, bottom: 60, left: 180, right: 180 },
        children: [new Paragraph({
          children: [new TextRun({ text: "ACCOUNT MANAGER CONTEXT", bold: true, size: 15, color: WEBSERV_RED, font: "Calibri", allCaps: true })],
        })],
      }),
    ],
  }));

  for (const [label, value] of fieldDefs) {
    if (!value?.trim()) continue;

    let valueContent: Paragraph;
    if (docxContainsPromptArtifact(value)) {
      valueContent = new Paragraph({
        children: [new TextRun({ text: "[AM input contains invalid system text — regenerate with correct account notes]", size: 18, color: "B91C1C", italics: true, font: "Calibri" })],
      });
    } else {
      const lines = value.trim().split(/\n/);
      const runs: TextRun[] = [];
      lines.forEach((line, i) => {
        runs.push(new TextRun({ text: line, size: 18, color: "4B5563", font: "Calibri", break: i === 0 ? undefined : 1 }));
      });
      valueContent = new Paragraph({ children: runs, spacing: { before: 0, after: 0 } });
    }

    const borderDef = {
      top:    { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
      left:   { style: BorderStyle.THICK,  size: 24, color: WEBSERV_RED },
      right:  { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
    };

    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: AM_BG },
          borders: borderDef,
          margins: { top: 80, bottom: 80, left: 180, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 17, color: "374151", font: "Calibri" })] })],
        }),
        new TableCell({
          width: { size: 72, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: AM_BG },
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
            left:   { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
            right:  { style: BorderStyle.SINGLE, size: 2, color: AM_BORDER },
          },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [valueContent],
        }),
      ],
    }));
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ── Goal block (Section 1) — structured 2-column per-goal card ───────────────
function goalBlock(row: any, ri: number, edits?: Record<string, string>): Table {
  const goalType = resolveCell(`s1_${ri}_0`, row.goalType, edits);
  const goal     = resolveCell(`s1_${ri}_1`, row.goal, edits);
  const source   = resolveCell(`s1_${ri}_2`, row.measurementSource, edits);
  const shiftRaw = resolveCell(`s1_${ri}_3`, row.goalShift, edits);
  const shift    = shiftRaw === "0%" ? "Par" : (shiftRaw || "Par");
  const reason   = resolveCell(`s1_${ri}_4`, row.reason, edits);
  const shiftColor = shift.startsWith("+") ? "16A34A" : shift.startsWith("-") ? "DC2626" : GRAY;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Goal type header
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: DARK_HEADER },
            borders: thinBorder(),
            margins: HDR_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: goalType, bold: true, size: 20, color: WHITE, font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Goal
      new TableRow({
        children: [
          labelCell("Goal"),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: goal, bold: true, size: 19, color: BLACK, font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Source
      new TableRow({
        children: [
          labelCell("Source"),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: source, size: 18, color: "374151", font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Shift
      new TableRow({
        children: [
          labelCell("Shift vs Last Quarter"),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: shift, bold: true, size: 19, color: shiftColor, font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Reason (full width)
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: ALT_ROW },
            borders: thinBorder(),
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({ text: "Reason:  ", bold: true, size: 17, color: GRAY, font: "Calibri" }),
                new TextRun({ text: reason, size: 17, color: "4B5563", font: "Calibri" }),
              ],
            })],
          }),
        ],
      }),
    ],
  });
}

// ── Priority block (Section 6) — structured per-priority card ────────────────
function priorityBlock(r: any, ri: number, edits?: Record<string, string>): Table {
  const num        = resolveCell(`s6_${ri}_0`, String(r.priority), edits);
  const initiative = resolveCell(`s6_${ri}_1`, r.initiative, edits);
  const tier       = resolveCell(`s6_${ri}_2`, r.tier, edits);
  const action     = resolveCell(`s6_${ri}_3`, r.action, edits);
  const reason     = resolveCell(`s6_${ri}_4`, r.reason, edits);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header: num + initiative + tier
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: WEBSERV_RED },
            borders: thinBorder(),
            margins: HDR_MARGIN,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: num, bold: true, size: 26, color: WHITE, font: "Calibri" })],
            })],
          }),
          new TableCell({
            width: { size: 73, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: DARK_HEADER },
            borders: thinBorder(),
            margins: HDR_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: initiative, bold: true, size: 20, color: WHITE, font: "Calibri" })],
            })],
          }),
          new TableCell({
            width: { size: 19, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: DARK_HEADER },
            borders: thinBorder(),
            margins: HDR_MARGIN,
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: tier, size: 16, color: MID_GRAY, font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Action
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: LABEL_BG },
            borders: thinBorder(),
            margins: LABEL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: "Action", bold: true, size: 16, color: GRAY, font: "Calibri" })],
            })],
          }),
          new TableCell({
            width: { size: 92, type: WidthType.PERCENTAGE },
            columnSpan: 2,
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: action, size: 18, color: "374151", font: "Calibri" })],
            })],
          }),
        ],
      }),
      // Reason
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: LABEL_BG },
            borders: thinBorder(),
            margins: LABEL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: "Reason", bold: true, size: 16, color: GRAY, font: "Calibri" })],
            })],
          }),
          new TableCell({
            width: { size: 92, type: WidthType.PERCENTAGE },
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: ALT_ROW },
            borders: thinBorder(),
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: reason, size: 17, color: GRAY, italics: true, font: "Calibri" })],
            })],
          }),
        ],
      }),
    ],
  });
}

// ── Opportunity block (Additional Opportunities) — structured card ────────────
function opportunityBlock(o: any, i: number, edits?: Record<string, string>): Table {
  const titleVal  = resolveCell(`opp_${i}_title`, o.title ?? o.service ?? "", edits);
  const whyNow    = resolveCell(`opp_${i}_why_now`, o.why_now ?? "", edits);
  const rec       = resolveCell(`opp_${i}_recommendation`, o.recommendation ?? "", edits);
  const framing   = resolveCell(`opp_${i}_framing`, o.framing ?? "", edits);
  const evidences = (o.evidence ?? []).map((ev: string, j: number) =>
    resolveCell(`opp_${i}_evidence_${j}`, ev, edits)
  ) as string[];
  const typeLabel = o.type === "upsell" ? "Upsell" : "Cross-sell";
  const typeColor = o.type === "upsell" ? "FCD34D" : "93C5FD";

  const rows: TableRow[] = [
    // Title header
    new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: DARK_HEADER },
          borders: thinBorder(),
          margins: HDR_MARGIN,
          children: [new Paragraph({
            children: [new TextRun({ text: `[${typeLabel}]`, bold: true, size: 17, color: typeColor, font: "Calibri" })],
          })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: DARK_HEADER },
          borders: thinBorder(),
          margins: HDR_MARGIN,
          children: [new Paragraph({
            children: [new TextRun({ text: titleVal, bold: true, size: 20, color: WHITE, font: "Calibri" })],
          })],
        }),
      ],
    }),
  ];

  if (whyNow) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: thinBorder(),
          margins: LABEL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: "Why Now", bold: true, size: 16, color: GRAY, font: "Calibri" })] })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          borders: thinBorder(),
          margins: CELL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: whyNow, size: 18, color: "374151", italics: true, font: "Calibri" })] })],
        }),
      ],
    }));
  }

  if (evidences.length > 0) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: thinBorder(),
          margins: LABEL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: "Evidence", bold: true, size: 16, color: GRAY, font: "Calibri" })] })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          borders: thinBorder(),
          margins: CELL_MARGIN,
          children: evidences.map(ev =>
            new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [new TextRun({ text: `\u2022  ${ev}`, size: 17, color: "374151", font: "Calibri" })],
            })
          ),
        }),
      ],
    }));
  }

  if (rec) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: thinBorder(),
          margins: LABEL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: "Recommendation", bold: true, size: 16, color: GRAY, font: "Calibri" })] })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: ALT_ROW },
          borders: thinBorder(),
          margins: CELL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: rec, size: 18, color: "1B3A6B", font: "Calibri" })] })],
        }),
      ],
    }));
  }

  if (framing) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          borders: thinBorder(),
          margins: CELL_MARGIN,
          children: [new Paragraph({ children: [new TextRun({ text: framing, size: 16, color: MID_GRAY, italics: true, font: "Calibri" })] })],
        }),
      ],
    }));
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ── Tier Diagnosis callout block ──────────────────────────────────────────────
function tierDiagnosisBlock(tier: number, tierName: string, diagnosis: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: ALT_ROW },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
              left:   { style: BorderStyle.THICK,  size: 24, color: WEBSERV_RED },
              right:  { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
            },
            margins: { top: 160, bottom: 160, left: 220, right: 220 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 80 },
                children: [new TextRun({ text: `Tier ${tier} — ${tierName}`, bold: true, size: 23, color: WEBSERV_RED, font: "Calibri" })],
              }),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: diagnosis, size: 20, color: "374151", font: "Calibri" })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function resolveCell(key: string, value: string, edits?: Record<string, string>): string {
  return edits?.[key] ?? value ?? "";
}

// ── Section visibility helpers ────────────────────────────────────────────────
const DOCX_SECTION_DEFS = [
  { key: "section_goals" },
  { key: "section_conversions" },
  { key: "section_traffic" },
  { key: "section_services" },
  { key: "section_diagnosis" },
  { key: "section_priorities" },
  { key: "section_tracking" },
  { key: "section_opportunities" },
];
const DOCX_SECTION_TABLES: Record<string, string[]> = {
  section_conversions: ["table_s2_pages", "table_s2_patterns", "table_s2_sources"],
  section_traffic: ["table_s3_topics", "table_s3_pages"],
  section_services: ["table_s4_services"],
  section_priorities: ["table_s6"],
  section_tracking: ["table_s8"],
};
function docxSecAutoHidden(secKey: string, ht: Record<string, boolean>): boolean {
  const tbls = DOCX_SECTION_TABLES[secKey];
  return !!(tbls && tbls.length > 0 && tbls.every(t => ht[t]));
}
function computeDocxSecNums(hs: Record<string, boolean>, ht: Record<string, boolean>, hasOpps: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  let n = 1;
  for (const { key } of DOCX_SECTION_DEFS) {
    if (key === "section_opportunities" && !hasOpps) continue;
    if (hs[key] || docxSecAutoHidden(key, ht)) continue;
    out[key] = n++;
  }
  return out;
}

// ── Main export function ──────────────────────────────────────────────────────
export async function generateQbrPrepV2Docx(
  reportData: any,
  edits?: Record<string, string>,
  hiddenSections: Record<string, boolean> = {},
  hiddenTables: Record<string, boolean> = {}
): Promise<Buffer> {
  const meta = reportData.meta;
  const docChildren: any[] = [];

  let headerImage: Buffer | undefined;
  try {
    const headerPath = path.join(process.cwd(), "attached_assets", "biweekly_header.png");
    if (fs.existsSync(headerPath)) headerImage = fs.readFileSync(headerPath);
  } catch {}

  // ── Cover block ─────────────────────────────────────────────────────────────
  docChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({ text: "Quarterly Business Snapshot", bold: true, size: 48, color: WEBSERV_RED, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [
        new TextRun({ text: resolveCell("meta_site", meta.site, edits), bold: true, size: 32, color: BLACK, font: "Calibri" }),
      ],
    }),
  );

  docChildren.push(
    metaTable([
      ["Domain",                resolveCell("meta_domain",   meta.domain, edits)],
      ["Primary Location",      resolveCell("meta_location", meta.primaryLocation, edits)],
      ["Program / Positioning", resolveCell("meta_program",  meta.programPositioning, edits)],
      ["Analysis Window",       meta.analysisWindow],
      ["Planning Quarter",      meta.planningQuarter],
      ["Generated On",          meta.generatedOn],
    ])
  );

  // ── AM Context ───────────────────────────────────────────────────────────────
  const manualInputs = reportData.sourceSnapshot?.manualInputs;
  if (manualInputs) {
    const amBlock = amContextBlock(manualInputs);
    if (amBlock) {
      docChildren.push(spacer(160));
      docChildren.push(amBlock);
    }
  }

  // ── Section visibility ───────────────────────────────────────────────────────
  const _hasOpps = (reportData.additionalOpportunities?.length ?? 0) > 0;
  const secNums  = computeDocxSecNums(hiddenSections, hiddenTables, _hasOpps);
  const secVisible = (key: string) => secNums[key] !== undefined;
  const tblVisible = (key: string) => !hiddenTables[key];

  // ── Section 1: What Matters Most This Quarter ────────────────────────────────
  const s1 = reportData.section1Goals;
  if (secVisible("section_goals")) {
    docChildren.push(sectionHeading(secNums["section_goals"], "What Matters Most This Quarter", true));
    for (let ri = 0; ri < s1.rows.length; ri++) {
      docChildren.push(goalBlock(s1.rows[ri], ri, edits));
      if (ri < s1.rows.length - 1) docChildren.push(spacer(100));
    }
  }

  // ── Section 2: Where Conversions Actually Happen ─────────────────────────────
  const s2 = reportData.section2Conversions;
  if (secVisible("section_conversions")) {
    docChildren.push(sectionHeading(secNums["section_conversions"], "Where Conversions Actually Happen"));

    if (tblVisible("table_s2_pages") && s2.topConvertingPages?.length) {
      docChildren.push(subHeading("Top Converting Pages"));
      const s2aRows = s2.topConvertingPages.map((r: any, ri: number) => [
        resolveCell(`s2a_${ri}_0`, r.dataSource ? `${r.type} [${r.dataSource}]` : r.type, edits),
        resolveCell(`s2a_${ri}_1`, r.page, edits),
        resolveCell(`s2a_${ri}_2`, r.conversionSource ?? r.source ?? "", edits),
        resolveCell(`s2a_${ri}_3`, r.notes, edits),
      ]);
      docChildren.push(makeTable(["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"], s2aRows, [12, 26, 18, 44]));
    }

    if (tblVisible("table_s2_patterns") && s2.topConversionPatterns?.length) {
      docChildren.push(subHeading("Top Conversion Patterns"));
      const s2cRows = s2.topConversionPatterns.map((r: any, ri: number) => [
        resolveCell(`s2c_${ri}_0`, r.pattern, edits),
        resolveCell(`s2c_${ri}_1`, r.whyItMatters, edits),
        resolveCell(`s2c_${ri}_2`, r.evidence, edits),
      ]);
      docChildren.push(makeTable(["Pattern", "Why It Matters", "Evidence"], s2cRows, [20, 42, 38]));
    }

    if (tblVisible("table_s2_sources") && s2.topConvertingSources?.length) {
      docChildren.push(subHeading("Top Converting Sources"));
      const s2bRows = s2.topConvertingSources.map((r: any, ri: number) => [
        resolveCell(`s2b_${ri}_0`, r.source, edits),
        resolveCell(`s2b_${ri}_1`, r.whatsConverting, edits),
        resolveCell(`s2b_${ri}_2`, r.notes, edits),
      ]);
      docChildren.push(makeTable(["Source", "What's Converting", "Notes"], s2bRows, [15, 30, 55]));
    }

    if (s2.trackingDisclaimer) {
      docChildren.push(new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: s2.trackingDisclaimer, italics: true, size: 16, color: GRAY, font: "Calibri" })],
      }));
    }
  }

  // ── Section 3: Top Organic Traffic Drivers ───────────────────────────────────
  const s3 = reportData.section3Traffic;
  if (secVisible("section_traffic")) {
    docChildren.push(sectionHeading(secNums["section_traffic"], "Top Organic Traffic Drivers", true));
    const hasTopicDeltas = s3.topTrafficTopics.some((r: any) => r.queryCount != null);

    if (tblVisible("table_s3_topics") && s3.topTrafficTopics?.length) {
      docChildren.push(subHeading("Top Traffic Topics"));
      const s3aRows = s3.topTrafficTopics.map((r: any, ri: number) => {
        const cells = [resolveCell(`s3a_${ri}_0`, r.topic, edits)];
        if (hasTopicDeltas) cells.push(String(r.queryCount ?? "—"), r.queryCountDelta ?? "—", r.impressions != null ? r.impressions.toLocaleString("en-US") : "—", r.impressionsDelta ?? "—");
        cells.push(
          resolveCell(`s3a_${ri}_1`, r.exampleQueries, edits),
          resolveCell(`s3a_${ri}_2`, r.connectionToAdmits, edits),
          resolveCell(`s3a_${ri}_3`, r.insight ?? "", edits),
        );
        return cells;
      });
      const s3aHeaders = hasTopicDeltas
        ? ["Topic", "# Queries", "\u0394 Queries", "Impressions", "\u0394 Impressions", "Example Queries", "Admits", "Insight"]
        : ["Topic", "Example Queries", "Admits", "Insight"];
      const s3aWidths = hasTopicDeltas ? [14, 7, 7, 8, 8, 20, 12, 24] : [22, 28, 16, 34];
      docChildren.push(makeTable(s3aHeaders, s3aRows, s3aWidths));
    }

    const hasPageDeltas = s3.topTrafficPages.some((r: any) => r.clicksDelta || r.impressions || r.queries);
    if (tblVisible("table_s3_pages") && s3.topTrafficPages?.length) {
      docChildren.push(subHeading("Top Traffic Pages"));
      const s3bRows = s3.topTrafficPages.map((r: any, ri: number) => {
        const cells = [resolveCell(`s3b_${ri}_0`, r.page, edits), resolveCell(`s3b_${ri}_1`, r.clicks, edits)];
        if (hasPageDeltas) cells.push(r.clicksDelta ?? "—", r.impressions ?? "—", r.impressionsDelta ?? "—", r.queries ?? "—", r.queriesDelta ?? "—");
        cells.push(resolveCell(`s3b_${ri}_2`, r.ctr, edits), resolveCell(`s3b_${ri}_3`, r.connectionToAdmits, edits), resolveCell(`s3b_${ri}_4`, r.insight ?? "", edits));
        return cells;
      });
      const s3bHeaders = hasPageDeltas
        ? ["Page", "Clicks", "\u0394 Clicks", "Impressions", "\u0394 Impressions", "# Queries", "\u0394 Queries", "CTR", "Admits", "Insight"]
        : ["Page", "Clicks", "CTR", "Admits", "Insight"];
      const s3bWidths = hasPageDeltas ? [16, 6, 7, 8, 7, 6, 7, 6, 10, 27] : [28, 10, 10, 17, 35];
      docChildren.push(makeTable(s3bHeaders, s3bRows, s3bWidths));
    }
  }

  // ── Section 4: Site Service Overview ─────────────────────────────────────────
  const s4 = reportData.section4Services;
  if (secVisible("section_services")) {
    docChildren.push(sectionHeading(secNums["section_services"], "Site Service Overview"));
    if (tblVisible("table_s4_services") && s4.services?.length) {
      const s4Rows = s4.services.map((r: any, ri: number) => [
        resolveCell(`s4_${ri}_0`, r.service, edits),
        resolveCell(`s4_${ri}_1`, r.examplePage, edits),
      ]);
      docChildren.push(makeTable(["Service", "Example Page"], s4Rows, [38, 62]));
    }
  }

  // ── Section 5: SEO Tier Diagnosis ────────────────────────────────────────────
  const s5 = reportData.section5Diagnosis;
  if (secVisible("section_diagnosis")) {
    docChildren.push(sectionHeading(secNums["section_diagnosis"], "SEO Tier Diagnosis", true));
    docChildren.push(tierDiagnosisBlock(s5.tier, s5.tierName, resolveCell("s5_diagnosis", s5.diagnosis, edits)));
  }

  // ── Section 6: What We Need to Do Next ───────────────────────────────────────
  const s6 = reportData.section6Priorities;
  if (secVisible("section_priorities")) {
    docChildren.push(sectionHeading(secNums["section_priorities"], "What We Need to Do Next", true));
    if (tblVisible("table_s6") && s6.priorities?.length) {
      for (let ri = 0; ri < s6.priorities.length; ri++) {
        docChildren.push(priorityBlock(s6.priorities[ri], ri, edits));
        if (ri < s6.priorities.length - 1) docChildren.push(spacer(100));
      }
    }
  }

  // ── Section 7: What We Track ─────────────────────────────────────────────────
  // Credit usage is intentionally preview-only and excluded from all exports.
  const s7 = reportData.section7Tracking;
  if (secVisible("section_tracking") && s7?.tracking?.length) {
    docChildren.push(sectionHeading(secNums["section_tracking"], "What We Track"));
    if (edits) {
      for (let ri = 0; ri < s7.tracking.length; ri++) {
        if (!s7.tracking[ri]?.status && edits[`s7_${ri}_3`] && !edits[`s7_${ri}_4`]) {
          edits[`s7_${ri}_4`] = edits[`s7_${ri}_3`];
          delete edits[`s7_${ri}_3`];
        }
      }
    }
    if (tblVisible("table_s8")) {
      const s7Rows = s7.tracking.map((r: any, ri: number) => [
        resolveCell(`s7_${ri}_0`, r.focusArea, edits),
        resolveCell(`s7_${ri}_1`, r.metric, edits),
        resolveCell(`s7_${ri}_2`, r.source, edits),
        resolveCell(`s7_${ri}_3`, r.status ?? "Needs Verification", edits),
        resolveCell(`s7_${ri}_4`, r.whyItMatters, edits),
      ]);
      docChildren.push(makeTable(["Focus Area", "Metric", "Source", "Status", "Why It Matters"], s7Rows, [18, 18, 12, 12, 40]));
    }
  }

  // ── Client Insights (QSSB) ────────────────────────────────────────────────────
  const qssb = reportData.sectionQssb;
  if (qssb?.clientInsights?.length > 0) {
    docChildren.push(sectionHeading(secNums["section_opportunities"] ?? 8, "Client Insights"));
    for (let i = 0; i < qssb.clientInsights.length; i++) {
      const q = qssb.clientInsights[i];
      docChildren.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          indent: { left: convertInchesToTwip(0.25) },
          border: { left: { color: WEBSERV_RED, size: 8, style: "single" as any, space: 6 } },
          children: [
            new TextRun({ text: resolveCell(`qssb_insight_${i}`, q.question, edits), size: 20, color: "374151", font: "Calibri" }),
          ],
        })
      );
    }
  }

  // ── Additional Opportunities ──────────────────────────────────────────────────
  if (secVisible("section_opportunities") && qssb?.additionalOpportunities?.length > 0) {
    docChildren.push(sectionHeading(secNums["section_opportunities"]!, "Additional Opportunities"));
    for (let i = 0; i < qssb.additionalOpportunities.length; i++) {
      docChildren.push(opportunityBlock(qssb.additionalOpportunities[i], i, edits));
      if (i < qssb.additionalOpportunities.length - 1) docChildren.push(spacer(120));
    }
  }

  // ── Sources footer line ───────────────────────────────────────────────────────
  if (reportData.generationMeta) {
    docChildren.push(spacer(200));
    docChildren.push(
      new Paragraph({
        spacing: { before: 0, after: 40 },
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR } },
        children: [
          new TextRun({ text: "Sources: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
          new TextRun({ text: (reportData.generationMeta.dataSources ?? []).join(", ") || "None", size: 16, color: GRAY, font: "Calibri" }),
          ...(reportData.generationMeta.missingData?.length > 0
            ? [
                new TextRun({ text: "  \u00b7  Missing: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
                new TextRun({ text: reportData.generationMeta.missingData.join(", "), size: 16, color: GRAY, font: "Calibri" }),
              ]
            : []),
        ],
      })
    );
  }

  // ── Header image ──────────────────────────────────────────────────────────────
  const headerChildren: any[] = [];
  if (headerImage) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({ data: headerImage, transformation: { width: 612, height: 100 }, type: "png" }),
        ],
      })
    );
  }

  // ── Assemble document ─────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        headers: headerChildren.length > 0
          ? { default: new Header({ children: headerChildren }) }
          : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
                    size: 16, color: GRAY, font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(headerImage ? 1.8 : 1),
              bottom: convertInchesToTwip(0.75),
              left:   convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
