/**
 * QBS DOCX Generator — Native Editable Output
 *
 * ALL body content is produced from native DOCX primitives:
 *   Paragraph, TextRun, Table, TableRow, TableCell
 *
 * Only the repeating page header (swoosh PNG) and page footer are image/static.
 * No screenshots. No rasterised sections. Every word, table cell, and card is
 * fully editable in both Microsoft Word and Google Docs.
 */

import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  ShadingType,
  BorderStyle,
  VerticalAlign,
  Header,
  Footer,
  ImageRun,
  PageBreak,
  convertInchesToTwip,
  TableLayoutType,
} from "docx";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const ACCENT = "C0392B";
const NAVY   = "1B3A6B";
const DARK   = "1F2937";
const GRAY   = "374151";
const MID    = "6B7280";
const LIGHT  = "F9FAFB";
const BORDER = "E5E7EB";

// ── Page geometry ─────────────────────────────────────────────────────────────
// US Letter: 8.5" wide  |  0.5" margins left + right  |  7.5" usable
const CONTENT_DXA = convertInchesToTwip(7.5);  // 10800 DXA

// Header swoosh: 692×143 source → displayed at full paper width (8.5" = 816 CSS px at 96 DPI)
const HDR_W_CSS = 816;
const HDR_H_CSS = 169;

const MARGIN_LR     = convertInchesToTwip(0.5);    // 720
const MARGIN_TOP    = convertInchesToTwip(1.875);   // 2700 — clears 1.76" swoosh
const MARGIN_BOTTOM = convertInchesToTwip(1.0);     // 1440
const MARGIN_HEADER = 0;
const MARGIN_FOOTER = convertInchesToTwip(0.5);     // 720

// ── Load header image once ────────────────────────────────────────────────────
const HEADER_PNG: Buffer | null = (() => {
  const p = path.resolve(process.cwd(), "attached_assets/HEADER_IMAGE_1773063127856.png");
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
})();

// ── Low-level primitives ──────────────────────────────────────────────────────
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function noCellBorders() {
  return { top: NB, bottom: NB, left: NB, right: NB };
}
function noTableBorders() {
  return { top: NB, bottom: NB, left: NB, right: NB, insideH: NB, insideV: NB };
}
function border1(color = BORDER, size = 4) {
  return { style: BorderStyle.SINGLE, size, color };
}
function shade(hex: string) {
  return { type: ShadingType.CLEAR, color: hex, fill: hex };
}
function run(text: string, opts: Record<string, any> = {}): TextRun {
  return new TextRun({ text, font: "Calibri", ...opts });
}
function boldRun(text: string, opts: Record<string, any> = {}): TextRun {
  return run(text, { bold: true, ...opts });
}

// Split text on newlines → multiple Paragraph children for a cell
function textParas(text: string, size = 18, opts: Record<string, any> = {}): Paragraph[] {
  return (text ?? "").split("\n").map((line, i, arr) =>
    new Paragraph({
      spacing: { before: 0, after: i < arr.length - 1 ? 40 : 0 },
      children: [run(line, { size, ...opts })],
    })
  );
}

function safeText(v: any): string {
  return v == null ? "" : String(v);
}

// ── Section heading (number badge + title + red underline) ───────────────────
function sectionHeading(num: number, title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 140 },
    border: { bottom: border1(ACCENT, 6) },
    children: [
      run(` ${num} `, {
        bold: true,
        size: 22,
        color: "FFFFFF",
        shading: { type: "clear", color: ACCENT, fill: ACCENT },
      }),
      run("  ", { size: 22 }),
      boldRun(title.toUpperCase(), { size: 22, color: ACCENT, characterSpacing: 40 }),
    ],
  });
}

// ── Sub-section divider ───────────────────────────────────────────────────────
function subLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    border: { bottom: border1(BORDER, 4) },
    children: [boldRun(text, { size: 18, color: GRAY })],
  });
}

// ── Small uppercase field label (used inside cards) ───────────────────────────
function fieldLabel(text: string, color = ACCENT): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [boldRun(text.toUpperCase(), { size: 15, color, characterSpacing: 50 })],
  });
}

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { before: 0, after } });
}

function pageBreakPara(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new PageBreak()] });
}

// ── Source-label switching helper ─────────────────────────────────────────────
function computeSharedSource(sources: (string | undefined)[]): string | null {
  const filtered = sources.filter(
    (s): s is string => !!s && s !== "Manual entry needed" && s !== "—" && s !== "Site Structure"
  );
  if (filtered.length === 0) return null;
  const unique = Array.from(new Set(filtered));
  return unique.length === 1 ? unique[0] : null;
}

function computeSharedSourceList(sourceSets: string[][]): string | null {
  if (sourceSets.length === 0) return null;
  const joined = sourceSets.map(s => Array.from(s).sort().join("+"));
  const unique = Array.from(new Set(joined));
  if (unique.length !== 1) return null;
  return sourceSets[0].join(" + ") || null;
}

// ── Generic data table ────────────────────────────────────────────────────────
interface ColSpec { label: string; dxa: number; align?: AlignmentType }

function dataTable(cols: ColSpec[], rows: string[][]): Table {
  const hdrCells = cols.map(c =>
    new TableCell({
      width: { size: c.dxa, type: WidthType.DXA },
      shading: shade("FDECEA"),
      margins: { top: 80, bottom: 80, left: 110, right: 80 },
      borders: { top: NB, bottom: border1(ACCENT, 8), left: NB, right: NB },
      children: [new Paragraph({
        alignment: c.align ?? AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [boldRun(c.label.toUpperCase(), { size: 15, color: ACCENT, characterSpacing: 45 })],
      })],
    })
  );

  const bodyRows = rows.map((vals, ri) =>
    new TableRow({
      children: vals.map((v, ci) =>
        new TableCell({
          width: { size: cols[ci].dxa, type: WidthType.DXA },
          shading: ri % 2 === 1 ? shade("FBF8F7") : shade("FFFFFF"),
          margins: { top: 80, bottom: 80, left: 110, right: 80 },
          borders: { top: NB, bottom: border1("F3EDED", 4), left: NB, right: NB },
          children: textParas(safeText(v), 18),
        })
      ),
    })
  );

  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: {
      top: border1("DCC8C8", 4),
      bottom: border1("DCC8C8", 4),
      left: border1("DCC8C8", 4),
      right: border1("DCC8C8", 4),
      insideH: NB,
      insideV: NB,
    },
    rows: [new TableRow({ tableHeader: true, children: hdrCells }), ...bodyRows],
  });
}

// ── DOCX native header (swoosh repeats every page) ────────────────────────────
function buildHeader(): Header {
  if (!HEADER_PNG) {
    return new Header({
      children: [new Paragraph({
        spacing: { before: 0, after: 0 },
        border: { bottom: border1(ACCENT, 24) },
        children: [run("")],
      })],
    });
  }
  return new Header({
    children: [new Paragraph({
      indent: { left: -MARGIN_LR, right: -MARGIN_LR },
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        type: "png",
        data: HEADER_PNG,
        transformation: { width: HDR_W_CSS, height: HDR_H_CSS },
      })],
    })],
  });
}

// ── DOCX native footer (repeats every page) ───────────────────────────────────
function buildFooter(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 0 },
      border: { top: border1(ACCENT, 6) },
      children: [
        boldRun("Webserv", { size: 16, color: NAVY }),
        run("  |  32 Discovery Suite 130, Irvine, CA 92618  |  ", { size: 16, color: MID }),
        run("webserv.io", { size: 16, color: ACCENT }),
      ],
    })],
  });
}

// ── Cover page ────────────────────────────────────────────────────────────────
function buildCover(reportData: any): (Paragraph | Table)[] {
  const meta   = reportData.meta ?? {};
  const snap   = reportData.sourceSnapshot ?? {};
  const inputs = snap.manualInputs ?? {};
  const amThoughts  = safeText(inputs.amThoughts  ?? inputs.hypothesis ?? "");
  const prevQtr     = safeText(inputs.prevQtrAssessment ?? "");
  const clientNotes = safeText(inputs.clientNotes ?? "");
  const sentiment   = safeText(inputs.clientSentiment ?? inputs.sentiment ?? "");

  const items: (Paragraph | Table)[] = [];

  // Title
  items.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [boldRun("Quarterly Business Snapshot", { size: 56, color: ACCENT })],
  }));

  // Site name
  items.push(new Paragraph({
    spacing: { before: 0, after: 280 },
    children: [boldRun(safeText(meta.site), { size: 26, color: GRAY })],
  }));

  // Meta grid: 3 rows × (label+value+label+value)
  const metaRows: [string, string, string, string][] = [
    ["Domain", safeText(meta.domain), "Primary Location", safeText(meta.primaryLocation)],
    ["Program / Positioning", safeText(meta.programPositioning), "Analysis Window", safeText(meta.analysisWindow)],
    ["Planning Quarter", safeText(meta.planningQuarter), "Generated On", safeText(meta.generatedOn ?? meta.generatedAt?.slice(0, 10))],
  ];

  const LBL_DXA  = 2000;
  const VAL_DXA  = 3400;
  const META_COL: ColSpec[] = [
    { label: "", dxa: LBL_DXA },
    { label: "", dxa: VAL_DXA },
    { label: "", dxa: LBL_DXA },
    { label: "", dxa: VAL_DXA },
  ]; // total: 2000+3400+2000+3400 = 10800 ✓

  const metaTableRows = metaRows.map(([l1, v1, l2, v2]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: LBL_DXA, type: WidthType.DXA },
          shading: shade(LIGHT),
          margins: { top: 80, bottom: 80, left: 110, right: 80 },
          borders: noCellBorders(),
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [boldRun(l1, { size: 18, color: GRAY })],
          })],
        }),
        new TableCell({
          width: { size: VAL_DXA, type: WidthType.DXA },
          shading: shade(LIGHT),
          margins: { top: 80, bottom: 80, left: 110, right: 80 },
          borders: { top: NB, bottom: NB, left: NB, right: border1("D1D5DB", 4) },
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [run(v1, { size: 18 })],
          })],
        }),
        new TableCell({
          width: { size: LBL_DXA, type: WidthType.DXA },
          shading: shade(LIGHT),
          margins: { top: 80, bottom: 80, left: 180, right: 80 },
          borders: noCellBorders(),
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [boldRun(l2, { size: 18, color: GRAY })],
          })],
        }),
        new TableCell({
          width: { size: VAL_DXA, type: WidthType.DXA },
          shading: shade(LIGHT),
          margins: { top: 80, bottom: 80, left: 110, right: 80 },
          borders: noCellBorders(),
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [run(v2, { size: 18 })],
          })],
        }),
      ],
    })
  );

  items.push(new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: { top: border1(BORDER, 4), bottom: border1(BORDER, 4), left: border1(BORDER, 4), right: border1(BORDER, 4), insideH: border1(BORDER, 4), insideV: NB },
    rows: metaTableRows,
  }));

  // AM context block
  const hasAm = amThoughts || prevQtr || clientNotes || sentiment;
  if (hasAm) {
    items.push(spacer(180));
    items.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      border: { bottom: border1(BORDER, 4) },
      children: [boldRun("Account Manager Context", { size: 18, color: ACCENT, characterSpacing: 30 })],
    }));

    const amFields: [string, string][] = [
      ["AM's Hypothesis", amThoughts],
      ["Previous Quarter Assessment", prevQtr],
      ["Client Insights", clientNotes],
      ["Client Sentiment", sentiment],
    ].filter(([, v]) => v) as [string, string][];

    const amRows = amFields.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 2400, type: WidthType.DXA },
            shading: shade("FFFDFB"),
            margins: { top: 80, bottom: 80, left: 110, right: 80 },
            borders: { top: NB, bottom: border1(BORDER, 4), left: NB, right: border1("DCC8C8", 4) },
            children: [new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [boldRun(label, { size: 17, color: GRAY })],
            })],
          }),
          new TableCell({
            width: { size: 8400, type: WidthType.DXA },
            shading: shade("FFFDFB"),
            margins: { top: 80, bottom: 80, left: 140, right: 80 },
            borders: { top: NB, bottom: border1(BORDER, 4), left: NB, right: NB },
            children: textParas(value, 17, { color: "4B5563" }),
          }),
        ],
      })
    );

    items.push(new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: border1("DCC8C8", 4), bottom: border1("DCC8C8", 4), left: border1("DCC8C8", 4), right: border1("DCC8C8", 4), insideH: NB, insideV: NB },
      rows: amRows,
    }));
  }

  return items;
}

// ── Section 1: Goals ──────────────────────────────────────────────────────────
function buildSection1(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const rows = (reportData.section1Goals?.rows ?? []).map((r: any, ri: number) => {
    const goalType = safeText(edits[`s1_${ri}_0`] ?? r.goalType ?? "");
    const source   = safeText(edits[`s1_${ri}_2`] ?? r.measurementSource ?? "");
    const sourceSuffix = source && source !== "—" ? ` [${source}]` : "";
    const shift    = safeText(edits[`s1_${ri}_3`] ?? r.goalShift ?? "");
    return [
      goalType + sourceSuffix,
      safeText(edits[`s1_${ri}_1`] ?? r.goal ?? ""),
      shift === "0%" ? "Par" : shift,
      safeText(edits[`s1_${ri}_4`] ?? r.reason ?? ""),
    ];
  });

  const cols: ColSpec[] = [
    { label: "Goal Type",             dxa: 2200 },
    { label: "Goal / NSM",            dxa: 4100 },
    { label: "Goal Shift vs Last Qtr",dxa: 1300, align: AlignmentType.CENTER },
    { label: "Reason",                dxa: 3200 },
  ]; // 2200+4100+1300+3200 = 10800 ✓

  return [
    sectionHeading(secNum, "What Matters Most This Quarter"),
    dataTable(cols, rows),
  ];
}

// ── Section 2: Conversions ────────────────────────────────────────────────────
function buildSection2(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const s2 = reportData.section2Conversions ?? {};
  const items: (Paragraph | Table)[] = [sectionHeading(secNum, "Where Conversions Actually Happen")];

  const pages = (s2.topConvertingPages ?? []).map((r: any, ri: number) => [
    safeText(edits[`s2a_${ri}_0`] ?? r.type ?? ""),
    safeText(edits[`s2a_${ri}_1`] ?? r.page ?? ""),
    safeText(edits[`s2a_${ri}_2`] ?? r.notes ?? ""),
  ]);
  if (pages.length) {
    items.push(subLabel("Top Converting Pages"));
    items.push(dataTable([
      { label: "Type",                         dxa: 1050 },
      { label: "Page",                          dxa: 4050 },
      { label: "Notes / What We're Learning",  dxa: 5700 },
    ], pages)); // 1050+4050+5700=10800 ✓
  }

  const patterns = (s2.topConversionPatterns ?? []).map((r: any, ri: number) => [
    safeText(edits[`s2c_${ri}_0`] ?? r.pattern ?? ""),
    safeText(edits[`s2c_${ri}_1`] ?? r.whyItMatters ?? ""),
    safeText(edits[`s2c_${ri}_2`] ?? r.evidence ?? ""),
  ]);
  if (patterns.length) {
    items.push(subLabel("Top Conversion Patterns"));
    items.push(dataTable([
      { label: "Pattern",        dxa: 3240 },
      { label: "Why It Matters", dxa: 4320 },
      { label: "Evidence",       dxa: 3240 },
    ], patterns)); // 3240+4320+3240=10800 ✓
  }

  const sources = (s2.topConvertingSources ?? []).map((r: any, ri: number) => [
    safeText(edits[`s2b_${ri}_0`] ?? r.source ?? ""),
    safeText(edits[`s2b_${ri}_1`] ?? r.whatsConverting ?? ""),
    safeText(edits[`s2b_${ri}_2`] ?? r.notes ?? ""),
  ]);
  if (sources.length) {
    items.push(subLabel("Top Converting Sources"));
    items.push(dataTable([
      { label: "Source",            dxa: 2160 },
      { label: "What's Converting", dxa: 3780 },
      { label: "Notes",             dxa: 4860 },
    ], sources)); // 2160+3780+4860=10800 ✓
  }

  return items;
}

// ── Section 3: Traffic ────────────────────────────────────────────────────────
function buildSection3(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const s3 = reportData.section3Traffic ?? {};
  const items: (Paragraph | Table)[] = [sectionHeading(secNum, "Top Organic Traffic Drivers")];

  const topics = (s3.topTrafficTopics ?? []).map((r: any, ri: number) => {
    const insight = safeText(edits[`s3a_${ri}_3`] ?? r.insight ?? "");
    const base = [
      safeText(edits[`s3a_${ri}_0`] ?? r.topic),
      safeText(edits[`s3a_${ri}_1`] ?? r.exampleQueries),
      safeText(edits[`s3a_${ri}_2`] ?? r.connectionToAdmits),
    ];
    if (insight) base[1] = base[1] + (base[1] ? "\n" : "") + "Insight: " + insight;
    return base;
  });
  if (topics.length) {
    items.push(subLabel("Top Traffic Topics"));
    items.push(dataTable([
      { label: "Topic",          dxa: 3240 },
      { label: "Example Queries",dxa: 5620 },
      { label: "-> Admits",      dxa: 1940, align: AlignmentType.CENTER },
    ], topics)); // 3240+5620+1940=10800 ✓
  }

  const pages = (s3.topTrafficPages ?? []).map((r: any, ri: number) => {
    const insight = safeText(edits[`s3b_${ri}_4`] ?? r.insight ?? "");
    return [
      safeText(edits[`s3b_${ri}_0`] ?? r.page),
      safeText(edits[`s3b_${ri}_1`] ?? r.clicks),
      safeText(edits[`s3b_${ri}_2`] ?? r.ctr),
      safeText(edits[`s3b_${ri}_3`] ?? r.connectionToAdmits),
      insight,
    ];
  });
  if (pages.length) {
    items.push(subLabel("Top Traffic Pages"));
    items.push(dataTable([
      { label: "Page",      dxa: 4320 },
      { label: "Clicks",    dxa: 1620, align: AlignmentType.CENTER },
      { label: "CTR",       dxa: 1620, align: AlignmentType.CENTER },
      { label: "-> Admits", dxa: 1620, align: AlignmentType.CENTER },
      { label: "Insight",   dxa: 1620 },
    ], pages)); // 4320+1620+1620+1620+1620=10800 ✓
  }

  return items;
}

// ── Section 4: Services ───────────────────────────────────────────────────────
function buildSection4(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const rows = (reportData.section4Services?.services ?? []).map((r: any, ri: number) => [
    safeText(edits[`s4_${ri}_0`] ?? r.service ?? ""),
    safeText(edits[`s4_${ri}_1`] ?? r.examplePage ?? ""),
    safeText(r.seoScore != null ? `${r.seoScore}/10` : "—"),
    safeText(r.notes ?? ""),
  ]);
  return [
    sectionHeading(secNum, "Levels of Care Overview"),
    dataTable([
      { label: "Level of Care", dxa: 2160 },
      { label: "Page",          dxa: 2160 },
      { label: "SEO Score",     dxa: 900 },
      { label: "Notes",         dxa: 5580 },
    ], rows),
  ];
}

// ── Section 5: Tier Diagnosis — native card layout ────────────────────────────
function buildSection5(reportData: any, secNum: number): (Paragraph | Table)[] {
  const s5       = reportData.section5Diagnosis ?? {};
  const tier     = Number(s5.tier ?? 1);
  const tierName = safeText(s5.tierName ?? "");
  const diagnosis = safeText(s5.diagnosis ?? "");

  // Tier badge colours
  const TIER_COLORS: Record<number, string> = {
    1: "7C3AED", 2: "1D4ED8", 3: "0369A1", 4: "D97706", 5: "DC2626",
  };
  const tierBg = TIER_COLORS[tier] ?? TIER_COLORS[3];

  // Banner row: tier number | tier name
  const bannerRow = new TableRow({
    height: { value: 700, rule: "atLeast" as any },
    children: [
      // Left cell — tier colour with big number
      new TableCell({
        width: { size: 1440, type: WidthType.DXA },
        shading: shade(tierBg),
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 200, right: 100 },
        borders: { top: NB, bottom: NB, left: NB, right: border1("FFFFFF", 6) },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 40 },
            children: [run("SEO TIER", { size: 13, color: "CCCCCC", characterSpacing: 50 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [boldRun(String(tier), { size: 72, color: "FFFFFF" })],
          }),
        ],
      }),
      // Right cell — navy with tier name
      new TableCell({
        width: { size: 9360, type: WidthType.DXA },
        shading: shade(NAVY),
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 120, bottom: 120, left: 220, right: 120 },
        borders: noCellBorders(),
        children: [
          new Paragraph({
            spacing: { before: 0, after: 80 },
            children: [boldRun(tierName, { size: 36, color: "FFFFFF" })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [run("Current SEO Maturity Assessment", { size: 17, color: "9CA3AF" })],
          }),
        ],
      }),
    ],
  });

  // Diagnosis body row (full width)
  const diagRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: CONTENT_DXA, type: WidthType.DXA },
        shading: shade("FFFFFF"),
        margins: { top: 160, bottom: 160, left: 220, right: 160 },
        borders: { top: border1(BORDER, 4), bottom: NB, left: NB, right: NB },
        children: [
          fieldLabel("Diagnosis"),
          ...textParas(diagnosis, 19, { color: GRAY }),
        ],
      }),
    ],
  });

  const scorecardItems: Table[] = [];
  const scorecard: any[] = reportData.section5Diagnosis?.tierScorecard ?? [];
  if (scorecard.length > 0) {
    const STATUS_BG: Record<string, string> = { Pass: "D1FAE5", Partial: "FEF3C7", Blocked: "FEE2E2", Unknown: "F3F4F6" };
    const STATUS_COLOR: Record<string, string> = { Pass: "065F46", Partial: "92400E", Blocked: "991B1B", Unknown: "374151" };
    for (const entry of scorecard) {
      const statusBg = STATUS_BG[entry.status] ?? "F3F4F6";
      const statusColor = STATUS_COLOR[entry.status] ?? "374151";
      scorecardItems.push(new Table({
        width: { size: CONTENT_DXA, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        borders: { top: border1(BORDER, 4), bottom: border1(BORDER, 4), left: border1(BORDER, 4), right: border1(BORDER, 4), insideH: border1(BORDER, 4), insideV: NB },
        rows: [
          new TableRow({
            height: { value: 400, rule: "atLeast" as any },
            children: [
              new TableCell({
                width: { size: 8200, type: WidthType.DXA },
                shading: shade("F9FAFB"),
                margins: { top: 80, bottom: 80, left: 180, right: 100 },
                borders: { top: NB, bottom: NB, left: NB, right: border1(BORDER, 4) },
                children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [boldRun(`Tier ${entry.tierNumber} — ${entry.tierName}`, { size: 20, color: "C0392B" })] })],
              }),
              new TableCell({
                width: { size: 2600, type: WidthType.DXA },
                shading: shade(statusBg),
                margins: { top: 80, bottom: 80, left: 120, right: 100 },
                borders: noCellBorders(),
                children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [boldRun(entry.status, { size: 18, color: statusColor })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 2,
                width: { size: CONTENT_DXA, type: WidthType.DXA },
                shading: shade("FFFFFF"),
                margins: { top: 100, bottom: 100, left: 180, right: 120 },
                borders: noCellBorders(),
                children: [
                  new Paragraph({ spacing: { before: 0, after: 40 }, children: [boldRun("Findings: ", { size: 18 }), run(safeText(entry.findings), { size: 18, color: GRAY })] }),
                  new Paragraph({ spacing: { before: 0, after: 40 }, children: [boldRun("Inference: ", { size: 18 }), run(safeText(entry.inferences), { size: 18, color: GRAY })] }),
                  new Paragraph({ spacing: { before: 0, after: 40 }, children: [boldRun("Why It Matters: ", { size: 18 }), run(safeText(entry.whyItMatters), { size: 18, color: GRAY })] }),
                  new Paragraph({ spacing: { before: 0, after: 0 }, children: [run(`Source: ${safeText(entry.source)}`, { size: 16, color: "9CA3AF" })] }),
                ],
              }),
            ],
          }),
        ],
      }));
    }
  }

  return [
    sectionHeading(secNum, "SEO Tier Diagnosis"),
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: border1(NAVY, 4), bottom: border1(NAVY, 4), left: border1(NAVY, 4), right: border1(NAVY, 4), insideH: NB, insideV: NB },
      rows: [bannerRow, diagRow],
    }),
    ...scorecardItems,
  ];
}

// ── Section 6: Priorities — native priority cards ────────────────────────────
function buildSection6(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const priorities = reportData.section6Priorities?.priorities ?? [];
  const shortSummary: string[] = reportData.section6Priorities?.shortSummary ?? [];
  const s6SharedSource = computeSharedSource(priorities.map((r: any) => r.source));
  const items: (Paragraph | Table)[] = [sectionHeading(secNum, "What We Need to Do Next")];

  // When all priorities share the same source, show it once at section level
  if (s6SharedSource) {
    items.push(new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [run(`Source: ${s6SharedSource}`, { size: 16, color: MID, italics: true })],
    }));
  }

  // Summary box
  if (shortSummary.length > 0) {
    items.push(new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: border1(BORDER, 4), bottom: border1(BORDER, 4), left: border1(BORDER, 4), right: border1(BORDER, 4), insideH: NB, insideV: NB },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: CONTENT_DXA, type: WidthType.DXA },
              shading: shade("F9FAFB"),
              margins: { top: 100, bottom: 100, left: 180, right: 120 },
              borders: noCellBorders(),
              children: [
                new Paragraph({ spacing: { before: 0, after: 60 }, children: [boldRun("PRIORITY SUMMARY", { size: 16, color: "C0392B", characterSpacing: 60 })] }),
                ...shortSummary.map(b => new Paragraph({ spacing: { before: 0, after: 40 }, bullet: { level: 0 }, children: [run(safeText(b), { size: 17, color: GRAY })] })),
              ],
            }),
          ],
        }),
      ],
    }));
  }

  priorities.forEach((r: any, ri: number) => {
    const num        = safeText(edits[`s6_${ri}_0`] ?? r.priority ?? ri + 1);
    const initiative = safeText(edits[`s6_${ri}_1`] ?? r.initiative ?? "");
    const tier       = safeText(edits[`s6_${ri}_2`] ?? r.tier ?? "");
    const actionType = safeText(edits[`s6_${ri}_5`] ?? r.actionType ?? "");
    const action     = safeText(edits[`s6_${ri}_3`] ?? r.action ?? "");
    const reason     = safeText(edits[`s6_${ri}_4`] ?? r.reason ?? "");
    const source     = safeText(r.source ?? "");
    const hdrBg      = ri % 2 === 0 ? NAVY : DARK;

    // ── Header row: priority number + initiative ────
    const hdrRow = new TableRow({
      height: { value: 500, rule: "atLeast" as any },
      children: [
        // Priority number (narrow, red)
        new TableCell({
          width: { size: 800, type: WidthType.DXA },
          shading: shade(ACCENT),
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 60, right: 60 },
          borders: { top: NB, bottom: NB, left: NB, right: border1("FFFFFF", 6) },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [boldRun(num, { size: 36, color: "FFFFFF" })],
          })],
        }),
        // Initiative + tier + actionType (wide, dark/navy)
        new TableCell({
          width: { size: 10000, type: WidthType.DXA },
          shading: shade(hdrBg),
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 180, right: 100 },
          borders: noCellBorders(),
          children: [
            new Paragraph({
              spacing: { before: 0, after: (tier || actionType) ? 50 : 0 },
              children: [boldRun(initiative, { size: 22, color: "FFFFFF" })],
            }),
            ...((tier || actionType) ? [new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [
                ...(tier ? [run(tier, { size: 16, color: "9CA3AF" })] : []),
                ...(tier && actionType ? [run("  ·  ", { size: 16, color: "6B7280" })] : []),
                ...(actionType ? [run(actionType, { size: 16, color: "BBBBBB" })] : []),
              ],
            })] : []),
          ],
        }),
      ],
    });

    // ── Body row: action | reason ────
    const bodyRows: TableRow[] = [
      new TableRow({
        children: [
          // Action
          new TableCell({
            width: { size: 5400, type: WidthType.DXA },
            shading: shade("FFFFFF"),
            margins: { top: 120, bottom: 120, left: 180, right: 120 },
            borders: { top: NB, bottom: NB, left: NB, right: border1(BORDER, 4) },
            children: [
              fieldLabel("Action"),
              ...textParas(action, 18, { color: GRAY }),
            ],
          }),
          // Reason
          new TableCell({
            width: { size: 5400, type: WidthType.DXA },
            shading: shade("FFFFFF"),
            margins: { top: 120, bottom: 120, left: 180, right: 120 },
            borders: noCellBorders(),
            children: [
              fieldLabel("Why This Quarter", NAVY),
              ...textParas(reason, 18, { color: GRAY }),
            ],
          }),
        ],
      }),
    ];

    // Optional source row — suppress when all priorities share same source (shown in header note instead)
    if (source && !s6SharedSource) {
      bodyRows.push(new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            width: { size: CONTENT_DXA, type: WidthType.DXA },
            shading: shade(LIGHT),
            margins: { top: 60, bottom: 60, left: 180, right: 100 },
            borders: { top: border1(BORDER, 4), bottom: NB, left: NB, right: NB },
            children: [new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [run(`Source: ${source}`, { size: 15, color: MID })],
            })],
          }),
        ],
      }));
    }

    items.push(new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: border1(NAVY, 4), bottom: border1(BORDER, 4), left: border1(BORDER, 4), right: border1(BORDER, 4), insideH: NB, insideV: NB },
      rows: [hdrRow, ...bodyRows],
    }));
    items.push(spacer(130));
  });

  return items;
}

// ── Section 7: Tracking ───────────────────────────────────────────────────────
function buildSection7(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const s7 = reportData.section7Tracking ?? {};
  const rows = (s7.tracking ?? []).map((r: any, ri: number) => [
    safeText(edits[`s7_${ri}_0`] ?? r.focusArea ?? ""),
    safeText(edits[`s7_${ri}_1`] ?? r.metric ?? ""),
    safeText(edits[`s7_${ri}_2`] ?? r.source ?? ""),
    safeText(edits[`s7_${ri}_4`] ?? r.whyItMatters ?? ""),
  ]);
  return [
    sectionHeading(secNum, "What We Track"),
    dataTable([
      { label: "Focus Area",    dxa: 2160 },
      { label: "Metric",        dxa: 2700 },
      { label: "Source",        dxa: 2160 },
      { label: "Why It Matters",dxa: 3780 },
    ], rows), // 2160+2700+2160+3780=10800 ✓
  ];
}

// ── Section 8: Opportunities — native cards ───────────────────────────────────
function buildSection8(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const opps = reportData.additionalOpportunities ?? [];
  const items: (Paragraph | Table)[] = [sectionHeading(secNum, "Additional Opportunities")];

  opps.forEach((o: any, i: number) => {
    const titleVal  = safeText(edits[`opp_${i}_title`] ?? o.title ?? "");
    const whyNow    = safeText(edits[`opp_${i}_why_now`] ?? o.why_now ?? "");
    const rec       = safeText(edits[`opp_${i}_recommendation`] ?? o.recommendation ?? "");
    const framing   = safeText(edits[`opp_${i}_framing`] ?? o.framing ?? "");
    const evidences = (o.evidence ?? []).map((ev: string, j: number) => safeText(edits[`opp_${i}_evidence_${j}`] ?? ev));
    const isUpsell  = o.type === "upsell";
    const typeLabel = isUpsell ? "UPSELL" : "CROSS-SELL";
    const typeBg    = isUpsell ? "FEF3C7" : "DBEAFE";
    const typeColor = isUpsell ? "D97706" : "2563EB";

    // Header row: [type badge + title] (full width)
    const hdrRow = new TableRow({
      height: { value: 440, rule: "atLeast" as any },
      children: [
        new TableCell({
          columnSpan: 2,
          width: { size: CONTENT_DXA, type: WidthType.DXA },
          shading: shade(DARK),
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 160, right: 120 },
          borders: noCellBorders(),
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [
              run(` ${typeLabel} `, {
                bold: true,
                size: 14,
                color: typeColor,
                shading: { type: "clear", color: typeBg, fill: typeBg },
                characterSpacing: 30,
              }),
              run("  ", { size: 20 }),
              boldRun(titleVal, { size: 22, color: "FFFFFF" }),
            ],
          })],
        }),
      ],
    });

    // Evidence text
    const evidenceParas: Paragraph[] = evidences.length
      ? [
          fieldLabel("Evidence"),
          ...evidences.map((ev: string) => new Paragraph({
            spacing: { before: 0, after: 40 },
            indent: { left: 180 },
            children: [run(`\u2022  ${ev}`, { size: 17, color: GRAY })],
          })),
        ]
      : [];

    // Body row: why now / evidence | recommendation / framing
    const bodyRow = new TableRow({
      children: [
        // Left: Why Now + Evidence
        new TableCell({
          width: { size: 5400, type: WidthType.DXA },
          shading: shade("FFFFFF"),
          margins: { top: 120, bottom: 120, left: 160, right: 120 },
          borders: { top: NB, bottom: NB, left: NB, right: border1(BORDER, 4) },
          children: [
            fieldLabel("Why Now"),
            ...textParas(whyNow, 18, { color: GRAY }),
            ...(evidences.length ? [spacer(100), ...evidenceParas] : []),
          ],
        }),
        // Right: Recommendation + Framing
        new TableCell({
          width: { size: 5400, type: WidthType.DXA },
          shading: shade("FFFFFF"),
          margins: { top: 120, bottom: 120, left: 160, right: 120 },
          borders: noCellBorders(),
          children: [
            fieldLabel("Recommendation", NAVY),
            ...textParas(rec, 18, { color: GRAY }),
            ...(framing ? [
              spacer(80),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                border: { top: border1(BORDER, 4) },
                children: [run(framing, { size: 15, color: MID, italics: true })],
              }),
            ] : []),
          ],
        }),
      ],
    });

    items.push(new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: border1(DARK, 4), bottom: border1(BORDER, 4), left: border1(BORDER, 4), right: border1(BORDER, 4), insideH: NB, insideV: NB },
      rows: [hdrRow, bodyRow],
    }));
    items.push(spacer(130));
  });

  return items;
}

// ── Section Keywords: Suggested Keywords for Next Quarter ─────────────────────
const KW_REC_LABELS: Record<string, string> = {
  "optimize-existing": "Optimize existing page",
  "refresh-existing":  "Refresh existing page",
  "create-new":        "Create new content",
  "cro-update":        "CRO / supporting update",
  "internal-linking":  "Internal linking support",
};

function buildSectionKeywords(reportData: any, secNum: number, edits: Record<string, string>): (Paragraph | Table)[] {
  const sk = reportData.sectionSuggestedKeywords;
  const allRows: any[] = sk?.rows ?? [];
  const kwSharedSource = computeSharedSourceList(allRows.map((r: any) => r.sources ?? []));

  const rows = allRows.map((r: any, ri: number) => {
    const keyword  = safeText(edits[`kw_${ri}_keyword`]    ?? r.keyword ?? "");
    const recType  = KW_REC_LABELS[r.recommendationType] ?? r.recommendationType ?? "";
    const rawPage  = edits[`kw_${ri}_targetPage`] ?? r.targetPage ?? "";
    const isNew    = rawPage === "New content needed" || rawPage === "Suggest new content for this keyword";
    const pageTxt  = isNew ? "New content needed" : rawPage;
    const why      = safeText(edits[`kw_${ri}_why`] ?? r.whyRecommended ?? "");
    if (kwSharedSource) {
      return [keyword, recType, pageTxt, why];
    }
    const srcs = (r.sources ?? []).join(", ");
    return [keyword, recType, pageTxt, why, srcs];
  });

  if (!rows.length) return [];

  const items: (Paragraph | Table)[] = [sectionHeading(secNum, "Suggested Keywords for Next Quarter")];
  if (sk?.quarterlyCreditCap) {
    const srcNote = kwSharedSource ? ` Source: ${kwSharedSource}.` : "";
    items.push(new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [run(
        `Showing up to ${sk.quarterlyCreditCap} keyword opportunities (2× monthly credit capacity of ${sk.monthlyCredits ?? ""}). ` +
        "Grounded in GSC query data, site crawl inventory, and page performance. " +
        `Filtered to strategic service, program, condition, and location-intent terms.${srcNote}`,
        { size: 16, color: MID, italics: true }
      )],
    }));
  }
  if (kwSharedSource) {
    items.push(dataTable([
      { label: "Keyword",            dxa: 2480 },
      { label: "Suggested Type",     dxa: 1960 },
      { label: "Target",             dxa: 2480 },
      { label: "Why It's Suggested", dxa: 3880 },
    ], rows)); // 2480+1960+2480+3880=10800 ✓
  } else {
    items.push(dataTable([
      { label: "Keyword",            dxa: 2160 },
      { label: "Suggested Type",     dxa: 1700 },
      { label: "Target",             dxa: 2160 },
      { label: "Why It's Suggested", dxa: 3480 },
      { label: "Source",             dxa: 1300 },
    ], rows)); // 2160+1700+2160+3480+1300=10800 ✓
  }
  return items;
}

// ── Visibility helpers ────────────────────────────────────────────────────────
const SECTION_TABLE_MAP: Record<string, string[]> = {
  section_conversions: ["table_s2_pages", "table_s2_patterns", "table_s2_sources"],
  section_traffic:     ["table_s3_topics", "table_s3_pages"],
  section_services:    ["table_s4_services"],
  section_priorities:  ["table_s6"],
  section_tracking:    ["table_s8"],
};

function isSectionAutoHidden(k: string, ht: Record<string, boolean>): boolean {
  const tbls = SECTION_TABLE_MAP[k];
  return !!(tbls?.length && tbls.every(t => ht[t]));
}

function computeSecNums(
  hs: Record<string, boolean>,
  ht: Record<string, boolean>,
  hasOpps: boolean,
  hasKeywords: boolean,
): Record<string, number> {
  const KEYS = [
    "section_goals", "section_conversions", "section_traffic",
    "section_services", "section_diagnosis", "section_priorities",
    "section_keywords", "section_tracking", "section_opportunities",
  ];
  const out: Record<string, number> = {};
  let n = 1;
  for (const k of KEYS) {
    if (k === "section_opportunities" && !hasOpps) continue;
    if (k === "section_keywords" && !hasKeywords) continue;
    if (hs[k] || isSectionAutoHidden(k, ht)) continue;
    out[k] = n++;
  }
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateQbrPrepV2Docx(
  reportData:     any,
  edits:          Record<string, string> = {},
  hiddenSections: Record<string, boolean> = {},
  hiddenTables:   Record<string, boolean> = {},
): Promise<Buffer> {

  const hasOpps     = (reportData.additionalOpportunities?.length ?? 0) > 0;
  const hasKeywords = (reportData.sectionSuggestedKeywords?.rows?.length ?? 0) > 0;
  const secNums     = computeSecNums(hiddenSections, hiddenTables, hasOpps, hasKeywords);
  const vis = (k: string) => secNums[k] !== undefined;

  const children: (Paragraph | Table)[] = [];

  // Cover
  children.push(...buildCover(reportData));

  if (vis("section_goals")) {
    children.push(pageBreakPara());
    children.push(...buildSection1(reportData, secNums["section_goals"], edits));
  }
  if (vis("section_conversions")) {
    children.push(pageBreakPara());
    children.push(...buildSection2(reportData, secNums["section_conversions"], edits));
  }
  if (vis("section_traffic")) {
    children.push(pageBreakPara());
    children.push(...buildSection3(reportData, secNums["section_traffic"], edits));
  }
  if (vis("section_services")) {
    children.push(pageBreakPara());
    children.push(...buildSection4(reportData, secNums["section_services"], edits));
  }
  if (vis("section_diagnosis")) {
    children.push(pageBreakPara());
    children.push(...buildSection5(reportData, secNums["section_diagnosis"]));
  }
  if (vis("section_priorities")) {
    children.push(pageBreakPara());
    children.push(...buildSection6(reportData, secNums["section_priorities"], edits));
  }
  if (vis("section_keywords")) {
    children.push(pageBreakPara());
    children.push(...buildSectionKeywords(reportData, secNums["section_keywords"], edits));
  }
  if (vis("section_tracking")) {
    children.push(pageBreakPara());
    children.push(...buildSection7(reportData, secNums["section_tracking"], edits));
  }
  if (vis("section_opportunities")) {
    children.push(pageBreakPara());
    children.push(...buildSection8(reportData, secNums["section_opportunities"], edits));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top:    MARGIN_TOP,
            bottom: MARGIN_BOTTOM,
            left:   MARGIN_LR,
            right:  MARGIN_LR,
            header: MARGIN_HEADER,
            footer: MARGIN_FOOTER,
          },
        },
      },
      headers:  { default: buildHeader() },
      footers:  { default: buildFooter() },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
