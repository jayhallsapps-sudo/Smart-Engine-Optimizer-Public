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

// ── Design tokens (aligned with PDF/preview) ─────────────────────────────────
const WEBSERV_RED  = "C0392B";
const ACCENT       = "C0392B"; // alias used in existing left-border references
const DARK_HEADER  = "1F2937"; // table header background
const LIGHT_BG     = "F9FAFB"; // alternating row shading
const AM_BG        = "FEF9F8"; // AM context panel warm tint
const AM_BORDER    = "F5C6B8"; // AM context panel border
const GRAY         = "6B7280";
const WHITE        = "FFFFFF";
const BLACK        = "111827";
const BORDER_COLOR = "E5E7EB";

// DXA cell margins for breathing room inside cells (1 inch = 1440 dxa)
const HDR_MARGIN  = { top: 80, bottom: 80, left: 120, right: 120 };
const CELL_MARGIN = { top: 80, bottom: 80, left: 120, right: 120 };

// ── Primitive helpers ─────────────────────────────────────────────────────────

function cellBorder() {
  return {
    top:    { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    left:   { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    right:  { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
  };
}

function hdrCell(text: string, widthPct?: number) {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.SOLID, color: DARK_HEADER },
    borders: cellBorder(),
    margins: HDR_MARGIN,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 17, font: "Calibri" })],
      }),
    ],
  });
}

function bodyCell(text: string, shade = false, widthPct?: number) {
  const isManual = text.includes("Manual entry needed");
  const display  = text || "—";

  // Split on newlines so pre-wrap content renders as separate runs with breaks
  const lines = display.split(/\n/);
  const runs: TextRun[] = [];
  lines.forEach((line, i) => {
    runs.push(new TextRun({
      text: line,
      size: 18,
      font: "Calibri",
      italics: isManual,
      color: isManual ? "9CA3AF" : "374151",
      break: i === 0 ? undefined : 1,
    }));
  });

  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shade ? { type: ShadingType.SOLID, color: LIGHT_BG } : undefined,
    borders: cellBorder(),
    margins: CELL_MARGIN,
    children: [
      new Paragraph({
        children: runs,
      }),
    ],
  });
}

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

interface CreditMonth { month: string; rows: { credits: string; activity: string }[]; unparsed: string[]; }
function parseCreditUsage(raw: string): CreditMonth[] {
  const MONTH_HEADING = /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i;
  const CREDIT_LINE = /^(\d+(?:\s*[cC]redits?)?)\s*[-:]\s*(.+)$/;
  const lines = raw.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const months: CreditMonth[] = [];
  let current: CreditMonth | null = null;
  for (const line of lines) {
    if (MONTH_HEADING.test(line)) { current = { month: line, rows: [], unparsed: [] }; months.push(current); }
    else if (current) {
      const m = CREDIT_LINE.exec(line);
      if (m) {
        const n = parseInt(m[1], 10);
        const creditLabel = isNaN(n) ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : `${n} ${n === 1 ? "Credit" : "Credits"}`;
        current.rows.push({ credits: creditLabel, activity: m[2].trim() });
      } else { current.unparsed.push(line); }
    }
  }
  return months;
}

function sectionHeading(num: number, title: string, addPageBreak = false) {
  return new Paragraph({
    pageBreakBefore: addPageBreak,
    children: [
      new TextRun({
        text: `${num}. ${title}`,
        bold: true,
        size: 26,
        color: WEBSERV_RED,
        font: "Calibri",
      }),
    ],
    spacing: { before: addPageBreak ? 0 : 480, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: WEBSERV_RED },
    },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: "374151", font: "Calibri" })],
    spacing: { before: 240, after: 100 },
  });
}

function spacer(pts = 80) {
  return new Paragraph({ children: [new TextRun("")], spacing: { before: 0, after: pts } });
}

// ── AM Context block as a styled bordered panel ───────────────────────────────
// Priority Checks are intentionally excluded — background guidance only.
function amContextBlock(manualInputs: any): Table | null {
  const amThoughts      = manualInputs?.amThoughts ?? manualInputs?.hypothesis;
  const prevQtrAssess   = manualInputs?.prevQtrAssessment;
  const clientNotes     = manualInputs?.clientNotes;
  const clientSentiment = manualInputs?.clientSentiment ?? manualInputs?.sentiment;

  if (!amThoughts && !prevQtrAssess && !clientNotes && !clientSentiment) return null;

  const cellChildren: Paragraph[] = [];

  cellChildren.push(new Paragraph({
    spacing: { before: 0, after: 100 },
    children: [new TextRun({
      text: "ACCOUNT MANAGER CONTEXT",
      bold: true, size: 15, color: WEBSERV_RED, font: "Calibri", allCaps: true,
    })],
  }));

  const fieldDefs: [string, string | undefined][] = [
    ["AM's Hypothesis",              amThoughts],
    ["Previous Quarter Assessment",  prevQtrAssess],
    ["Client Insights",              clientNotes],
    ["Client Sentiment",             clientSentiment],
  ];

  for (const [label, value] of fieldDefs) {
    if (!value?.trim()) continue;
    const lines = value.trim().split(/\n/);
    const runs: TextRun[] = [
      new TextRun({ text: `${label}: `, bold: true, size: 18, color: "374151", font: "Calibri" }),
    ];
    lines.forEach((line, i) => {
      runs.push(new TextRun({
        text: line,
        size: 18, color: "4B5563", font: "Calibri",
        break: i === 0 ? undefined : 1,
      }));
    });
    cellChildren.push(new Paragraph({ spacing: { before: 40, after: 40 }, children: runs }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: AM_BG },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
              left:   { style: BorderStyle.THICK,  size: 18, color: WEBSERV_RED },
              right:  { style: BorderStyle.SINGLE, size: 4, color: AM_BORDER },
            },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: cellChildren,
          }),
        ],
      }),
    ],
  });
}

// ── Tier Diagnosis callout block ──────────────────────────────────────────────
function tierDiagnosisBlock(tier: number, tierName: string, diagnosis: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: LIGHT_BG },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
              left:   { style: BorderStyle.THICK,  size: 18, color: WEBSERV_RED },
              right:  { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
            },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 60 },
                children: [new TextRun({
                  text: `Tier ${tier} — ${tierName}`,
                  bold: true, size: 22, color: WEBSERV_RED, font: "Calibri",
                })],
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
  return edits?.[key] ?? value;
}

// ── Main export function ──────────────────────────────────────────────────────
const DOCX_SECTION_DEFS = [
  { key: "section_goals" },
  { key: "section_conversions" },
  { key: "section_traffic" },
  { key: "section_services" },
  { key: "section_diagnosis" },
  { key: "section_priorities" },
  { key: "section_credits" },
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
function computeDocxSecNums(hs: Record<string, boolean>, ht: Record<string, boolean>, hasCreds: boolean, hasOpps: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  let n = 1;
  for (const { key } of DOCX_SECTION_DEFS) {
    if (key === "section_credits" && !hasCreds) continue;
    if (key === "section_opportunities" && !hasOpps) continue;
    if (hs[key] || docxSecAutoHidden(key, ht)) continue;
    out[key] = n++;
  }
  return out;
}

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
    if (fs.existsSync(headerPath)) {
      headerImage = fs.readFileSync(headerPath);
    }
  } catch {}

  // ── Cover block ──────────────────────────────────────────────────────────
  docChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: "QBR Prep: SEO Planning Snapshot", bold: true, size: 36, color: BLACK, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: resolveCell("meta_site", meta.site, edits),
          bold: true, size: 28, color: "374151", font: "Calibri",
        }),
      ],
    }),
  );

  const metaFields: [string, string][] = [
    ["Domain",                resolveCell("meta_domain",   meta.domain, edits)],
    ["Primary Location",      resolveCell("meta_location", meta.primaryLocation, edits)],
    ["Program / Positioning", resolveCell("meta_program",  meta.programPositioning, edits)],
    ["Analysis Window",       meta.analysisWindow],
    ["Planning Quarter",      meta.planningQuarter],
    ["Generated On",          meta.generatedOn],
  ];

  for (const [label, val] of metaFields) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 0, after: 24 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 18, color: GRAY, font: "Calibri" }),
          new TextRun({ text: val, size: 18, color: "374151", font: "Calibri" }),
        ],
      })
    );
  }

  // ── AM Context block (restored — Priority Checks excluded) ────────────────
  const manualInputs = reportData.sourceSnapshot?.manualInputs;
  if (manualInputs) {
    const amBlock = amContextBlock(manualInputs);
    if (amBlock) {
      docChildren.push(spacer(120));
      docChildren.push(amBlock);
      docChildren.push(spacer(80));
    }
  }

  // ── Compute visibility ────────────────────────────────────────────────────
  const _hasCreds = !!(manualInputs?.creditUsage?.trim());
  const _hasOpps = !!(reportData.additionalOpportunities?.length);
  const secNums = computeDocxSecNums(hiddenSections, hiddenTables, _hasCreds, _hasOpps);
  const secVisible = (key: string) => secNums[key] !== undefined;
  const tblVisible = (key: string) => !hiddenTables[key];

  // ── Section 1: Goals ──────────────────────────────────────────────────────
  const s1 = reportData.section1Goals;
  if (secVisible("section_goals")) {
    docChildren.push(sectionHeading(secNums["section_goals"], "What Matters Most This Quarter", true));
    const s1Rows = s1.rows.map((r: any, ri: number) => [
      resolveCell(`s1_${ri}_0`, r.goalType, edits),
      resolveCell(`s1_${ri}_1`, r.goal, edits),
      resolveCell(`s1_${ri}_2`, r.measurementSource, edits),
      resolveCell(`s1_${ri}_3`, r.goalShift, edits),
      resolveCell(`s1_${ri}_4`, r.reason, edits),
    ]);
    docChildren.push(makeTable(["Goal Type", "Goal", "Source", "Goal Shift", "Reason"], s1Rows, [18, 20, 10, 10, 42]));
  }

  // ── Section 2: Conversions ────────────────────────────────────────────────
  const s2 = reportData.section2Conversions;
  if (secVisible("section_conversions")) {
    docChildren.push(sectionHeading(secNums["section_conversions"], "Where Conversions Actually Happen"));
    if (tblVisible("table_s2_pages")) {
      docChildren.push(subHeading("Top Converting Pages"));
      const s2aRows = s2.topConvertingPages.map((r: any, ri: number) => [
        resolveCell(`s2a_${ri}_0`, r.dataSource ? `${r.type} [${r.dataSource}]` : r.type, edits),
        resolveCell(`s2a_${ri}_1`, r.page, edits),
        resolveCell(`s2a_${ri}_2`, r.notes, edits),
      ]);
      docChildren.push(makeTable(["Type", "Page / Pattern", "Notes / What We're Learning"], s2aRows, [12, 33, 55]));
    }
    if (tblVisible("table_s2_patterns") && s2.topConversionPatterns?.length) {
      docChildren.push(subHeading("Top Conversion Patterns"));
      const s2cRows = s2.topConversionPatterns.map((r: any, ri: number) => [
        resolveCell(`s2c_${ri}_0`, r.pattern, edits),
        resolveCell(`s2c_${ri}_1`, r.whyItMatters, edits),
        resolveCell(`s2c_${ri}_2`, r.evidence, edits),
      ]);
      docChildren.push(makeTable(["Pattern", "Why It Matters", "Evidence"], s2cRows, [20, 45, 35]));
    }
    if (tblVisible("table_s2_sources")) {
      docChildren.push(subHeading("Top Converting Sources"));
      const s2bRows = s2.topConvertingSources.map((r: any, ri: number) => [
        resolveCell(`s2b_${ri}_0`, r.source, edits),
        resolveCell(`s2b_${ri}_1`, r.whatsConverting, edits),
        resolveCell(`s2b_${ri}_2`, r.notes, edits),
      ]);
      docChildren.push(makeTable(["Source", "What's Converting", "Notes"], s2bRows, [15, 30, 55]));
    }
    if (s2.trackingDisclaimer) {
      docChildren.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [new TextRun({ text: s2.trackingDisclaimer, italics: true, size: 16, color: GRAY, font: "Calibri" })] }));
    }
  }

  // ── Section 3: Traffic ────────────────────────────────────────────────────
  const s3 = reportData.section3Traffic;
  if (secVisible("section_traffic")) {
    docChildren.push(sectionHeading(secNums["section_traffic"], "Top Organic Traffic Drivers", true));
    const hasTopicDeltas = s3.topTrafficTopics.some((r: any) => r.queryCount != null);
    if (tblVisible("table_s3_topics")) {
      docChildren.push(subHeading("Top Traffic Topics"));
      const s3aRows = s3.topTrafficTopics.map((r: any, ri: number) => {
        const cells = [resolveCell(`s3a_${ri}_0`, r.topic, edits)];
        if (hasTopicDeltas) cells.push(String(r.queryCount ?? "—"), r.queryCountDelta ?? "—", r.impressions != null ? r.impressions.toLocaleString("en-US") : "—", r.impressionsDelta ?? "—");
        cells.push(resolveCell(`s3a_${ri}_1`, r.exampleQueries, edits), resolveCell(`s3a_${ri}_2`, r.connectionToAdmits, edits), resolveCell(`s3a_${ri}_3`, r.insight, edits));
        return cells;
      });
      const s3aHeaders = hasTopicDeltas ? ["Topic", "# Queries", "Δ Queries", "Impressions", "Δ Impressions", "Example Queries", "🔗 Admits", "Insight"] : ["Topic", "Example Queries", "🔗 Admits", "Insight"];
      const s3aWidths = hasTopicDeltas ? [14, 7, 7, 8, 8, 20, 14, 22] : [22, 28, 18, 32];
      docChildren.push(makeTable(s3aHeaders, s3aRows, s3aWidths));
    }
    const hasPageDeltas = s3.topTrafficPages.some((r: any) => r.clicksDelta || r.impressions || r.queries);
    if (tblVisible("table_s3_pages")) {
      docChildren.push(subHeading("Top Traffic Pages"));
      const s3bRows = s3.topTrafficPages.map((r: any, ri: number) => {
        const cells = [resolveCell(`s3b_${ri}_0`, r.page, edits), resolveCell(`s3b_${ri}_1`, r.clicks, edits)];
        if (hasPageDeltas) cells.push(r.clicksDelta ?? "—", r.impressions ?? "—", r.impressionsDelta ?? "—", r.queries ?? "—", r.queriesDelta ?? "—");
        cells.push(resolveCell(`s3b_${ri}_2`, r.ctr, edits), resolveCell(`s3b_${ri}_3`, r.connectionToAdmits, edits), resolveCell(`s3b_${ri}_4`, r.insight, edits));
        return cells;
      });
      const s3bHeaders = hasPageDeltas ? ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "Δ Queries", "CTR", "🔗 Admits", "Insight"] : ["Page", "Clicks", "CTR", "🔗 Admits", "Insight"];
      const s3bWidths = hasPageDeltas ? [16, 7, 7, 8, 8, 7, 7, 7, 11, 22] : [28, 10, 10, 17, 35];
      docChildren.push(makeTable(s3bHeaders, s3bRows, s3bWidths));
    }
  }

  // ── Section 4: Services ───────────────────────────────────────────────────
  const s4 = reportData.section4Services;
  if (secVisible("section_services")) {
    docChildren.push(sectionHeading(secNums["section_services"], "Site Service Overview"));
    if (tblVisible("table_s4_services")) {
      const s4Rows = s4.services.map((r: any, ri: number) => [resolveCell(`s4_${ri}_0`, r.service, edits), resolveCell(`s4_${ri}_1`, r.examplePage, edits)]);
      docChildren.push(makeTable(["Service", "Example Page"], s4Rows, [38, 62]));
    }
  }

  // ── Section 5: Tier Diagnosis ─────────────────────────────────────────────
  const s5 = reportData.section5Diagnosis;
  if (secVisible("section_diagnosis")) {
    docChildren.push(sectionHeading(secNums["section_diagnosis"], "SEO Tier Diagnosis", true));
    docChildren.push(tierDiagnosisBlock(s5.tier, s5.tierName, resolveCell("s5_diagnosis", s5.diagnosis, edits)));
  }

  // ── Section 6: Priorities ─────────────────────────────────────────────────
  const s6 = reportData.section6Priorities;
  if (secVisible("section_priorities")) {
    docChildren.push(sectionHeading(secNums["section_priorities"], "What We Need to Do Next", true));
    if (tblVisible("table_s6")) {
      const s6Rows = s6.priorities.map((r: any, ri: number) => [
        resolveCell(`s6_${ri}_0`, String(r.priority), edits),
        resolveCell(`s6_${ri}_1`, r.initiative, edits),
        resolveCell(`s6_${ri}_2`, r.tier, edits),
        resolveCell(`s6_${ri}_3`, r.action, edits),
        resolveCell(`s6_${ri}_4`, r.reason, edits),
      ]);
      docChildren.push(makeTable(["#", "Initiative", "Tier", "Action", "Reason"], s6Rows, [5, 18, 8, 29, 40]));
    }
  }

  // ── Section 7: How Credits Are Used Each Month ────────────────────────────
  const rawCreditUsage: string = (reportData.sourceSnapshot?.manualInputs as any)?.creditUsage ?? "";
  if (secVisible("section_credits")) {
    docChildren.push(sectionHeading(secNums["section_credits"], "How Credits Are Used Each Month"));
    const creditMonths = parseCreditUsage(rawCreditUsage);
    if (creditMonths.length > 0) {
      for (const cm of creditMonths) {
        docChildren.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: cm.month, bold: true, size: 20, color: "374151", font: "Calibri" })] }));
        if (cm.rows.length > 0) docChildren.push(makeTable(["Credits", "Activity"], cm.rows.map(r => [r.credits, r.activity]), [22, 78]));
        for (const u of cm.unparsed) docChildren.push(new Paragraph({ spacing: { before: 20, after: 20 }, children: [new TextRun({ text: u, size: 18, color: GRAY, font: "Calibri" })] }));
      }
    } else {
      docChildren.push(new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: rawCreditUsage, size: 18, color: "374151", font: "Calibri" })] }));
    }
  }

  // ── Section 8: Tracking ───────────────────────────────────────────────────
  const s7 = reportData.section7Tracking;
  if (secVisible("section_tracking")) {
    docChildren.push(sectionHeading(secNums["section_tracking"], "What We Track"));
    if (edits) {
      const trackingLen = s7.tracking?.length ?? 0;
      for (let ri = 0; ri < trackingLen; ri++) {
        const hasStatus = s7.tracking[ri]?.status;
        if (!hasStatus && edits[`s7_${ri}_3`] && !edits[`s7_${ri}_4`]) {
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

  // ── Section 9: Client Insights (QSSB) ────────────────────────────────────
  const qssb = reportData.sectionQssb;
  if (qssb?.clientInsights?.length > 0) {
    docChildren.push(sectionHeading(secNums["section_opportunities"] ?? 9, "Client Insights"));
    for (let i = 0; i < qssb.clientInsights.length; i++) {
      const q = qssb.clientInsights[i];
      docChildren.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.25) },
          border: { left: { color: ACCENT, size: 6, style: "single" as any, space: 4 } },
          children: [
            new TextRun({ text: resolveCell(`qssb_insight_${i}`, q.question, edits), size: 20, color: "374151", font: "Calibri" }),
          ],
        })
      );
    }
  }

  // ── Additional Opportunities ──────────────────────────────────────────────
  if (secVisible("section_opportunities") && qssb?.additionalOpportunities?.length > 0) {
    docChildren.push(sectionHeading(secNums["section_opportunities"]!, "Additional Opportunities"));
    for (let i = 0; i < qssb.additionalOpportunities.length; i++) {
      const o = qssb.additionalOpportunities[i] as any;
      const titleVal = resolveCell(`qssb_opp_${i}_0`, o.title ?? o.service ?? "", edits);
      const descVal  = resolveCell(`qssb_opp_${i}_1`, o.description ?? "", edits);
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 0 },
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, size: 20, color: WEBSERV_RED, font: "Calibri" }),
            new TextRun({ text: titleVal, bold: true, size: 20, color: DARK_HEADER, font: "Calibri" }),
          ],
        }),
        new Paragraph({
          spacing: { before: 24, after: 80 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: descVal, size: 18, color: "374151", font: "Calibri" }),
          ],
        }),
      );
    }
  }

  // ── Sources footer line ───────────────────────────────────────────────────
  if (reportData.generationMeta) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 240, after: 40 },
        children: [
          new TextRun({ text: "Sources: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
          new TextRun({ text: (reportData.generationMeta.dataSources ?? []).join(", ") || "None", size: 16, color: GRAY, font: "Calibri" }),
          ...(reportData.generationMeta.missingData?.length > 0
            ? [
                new TextRun({ text: " · Missing: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
                new TextRun({ text: reportData.generationMeta.missingData.join(", "), size: 16, color: GRAY, font: "Calibri" }),
              ]
            : []),
        ],
      })
    );
  }

  // ── Header image (if present) ─────────────────────────────────────────────
  const headerChildren: any[] = [];
  if (headerImage) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: headerImage,
            transformation: { width: 612, height: 100 },
            type: "png",
          }),
        ],
      })
    );
  }

  // ── Assemble document ─────────────────────────────────────────────────────
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
