import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
} from "docx";

import {
  renderCoverHtml,
  renderSection1Html,
  renderSection2Html,
  renderSection3Html,
  renderSection4Html,
  renderSection5Html,
  renderSection6Html,
  renderSection7Html,
  renderSection8Html,
} from "./qbrPrepHtmlRenderer";
import { screenshotHtml, ScreenshotResult } from "./qbrPrepScreenshotter";

// ── Page geometry ─────────────────────────────────────────────────────────────
// US Letter 8.5" − 1" margin × 2 = 6.5" usable = 9360 DXA
// At 96 CSS DPI: 6.5 inches = 624 CSS px → used as docx transformation.width
// (docx library: emus = transformation.width × 9525; 624 × 9525 = 5,943,600 EMU = 6.5 inches ✓)
const DOC_CONTENT_CSS_PX = 624;

// ── Image embed helper ────────────────────────────────────────────────────────
function imageFromScreenshot(ss: ScreenshotResult): ImageRun {
  // ss.widthPx and ss.heightPx are CSS (logical) pixels from the bounding box.
  // The actual PNG data is 2× (deviceScaleFactor=2) → crisp at 192 DPI in DOCX.
  // transformation.width/height are in logical CSS pixels for docx sizing.
  const docH = Math.max(1, Math.round(ss.heightPx * DOC_CONTENT_CSS_PX / ss.widthPx));
  return new ImageRun({
    type: "png",
    data: ss.data,
    transformation: {
      width:  DOC_CONTENT_CSS_PX,
      height: docH,
    },
  });
}

function imagePara(ss: ScreenshotResult): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing:   { before: 0, after: 0 },
    children:  [imageFromScreenshot(ss)],
  });
}

function spacer(pts = 80): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: pts } });
}

// ── Visibility helpers ────────────────────────────────────────────────────────
const SECTION_TABLE_MAP: Record<string, string[]> = {
  section_conversions: ["table_s2_pages", "table_s2_patterns", "table_s2_sources"],
  section_traffic:     ["table_s3_topics", "table_s3_pages"],
  section_services:    ["table_s4_services"],
  section_priorities:  ["table_s6"],
  section_tracking:    ["table_s8"],
};

function isSectionAutoHidden(secKey: string, ht: Record<string, boolean>): boolean {
  const tbls = SECTION_TABLE_MAP[secKey];
  return !!(tbls?.length && tbls.every(t => ht[t]));
}

function computeSecNums(
  hs: Record<string, boolean>,
  ht: Record<string, boolean>,
  hasOpps: boolean
): Record<string, number> {
  const DEFS = [
    "section_goals",
    "section_conversions",
    "section_traffic",
    "section_services",
    "section_diagnosis",
    "section_priorities",
    "section_tracking",
    "section_opportunities",
  ];
  const result: Record<string, number> = {};
  let n = 1;
  for (const key of DEFS) {
    if (key === "section_opportunities" && !hasOpps) continue;
    if (hs[key] || isSectionAutoHidden(key, ht)) continue;
    result[key] = n++;
  }
  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateQbrPrepV2Docx(
  reportData:     any,
  edits:          Record<string, string> = {},
  hiddenSections: Record<string, boolean> = {},
  hiddenTables:   Record<string, boolean> = {}
): Promise<Buffer> {

  const hasOpps = (reportData.additionalOpportunities?.length ?? 0) > 0;
  const secNums = computeSecNums(hiddenSections, hiddenTables, hasOpps);
  const isVisible = (key: string) => secNums[key] !== undefined;

  const docChildren: any[] = [];

  // ── Cover (header image + title + meta + AM context) ──────────────────────
  {
    const html = renderCoverHtml(reportData);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 1: What Matters Most This Quarter ──────────────────────────────
  if (isVisible("section_goals")) {
    docChildren.push(spacer(24));
    const html = renderSection1Html(reportData, secNums["section_goals"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 2: Where Conversions Actually Happen ──────────────────────────
  if (isVisible("section_conversions")) {
    docChildren.push(spacer(24));
    const html = renderSection2Html(reportData, secNums["section_conversions"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 3: Top Organic Traffic Drivers ────────────────────────────────
  if (isVisible("section_traffic")) {
    docChildren.push(spacer(24));
    const html = renderSection3Html(reportData, secNums["section_traffic"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 4: Site Service Overview ──────────────────────────────────────
  if (isVisible("section_services")) {
    docChildren.push(spacer(24));
    const html = renderSection4Html(reportData, secNums["section_services"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 5: SEO Tier Diagnosis ─────────────────────────────────────────
  if (isVisible("section_diagnosis")) {
    docChildren.push(spacer(24));
    const html = renderSection5Html(reportData, secNums["section_diagnosis"]);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 6: What We Need to Do Next ────────────────────────────────────
  if (isVisible("section_priorities")) {
    docChildren.push(spacer(24));
    const html = renderSection6Html(reportData, secNums["section_priorities"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 7: What We Track ──────────────────────────────────────────────
  if (isVisible("section_tracking")) {
    docChildren.push(spacer(24));
    const html = renderSection7Html(reportData, secNums["section_tracking"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 8: Additional Opportunities ──────────────────────────────────
  if (isVisible("section_opportunities")) {
    docChildren.push(spacer(24));
    const html = renderSection8Html(reportData, secNums["section_opportunities"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  docChildren.push(spacer(40));
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 80, after: 0 },
      border: {
        top: { style: "single" as any, size: 6, color: "C0392B" },
      },
      children: [
        new TextRun({ text: "Webserv", bold: true, color: "1B3A6B", font: "Calibri", size: 16 }),
        new TextRun({ text: "  |  32 Discovery Suite 130, Irvine, CA 92618  |  ", color: "6B7280", font: "Calibri", size: 16 }),
        new TextRun({ text: "webserv.io", color: "C0392B", font: "Calibri", size: 16 }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    1440,
              bottom: 1440,
              left:   1440,
              right:  1440,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
