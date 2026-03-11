import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Header,
  Footer,
  convertInchesToTwip,
  PageBreak,
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
// US Letter: 8.5" wide
// Margins: 0.5" left + right = 7.5" usable content width
// At 96 CSS DPI: 7.5" = 720 CSS px → transformation.width for body content images
// Header image spans full paper width: 8.5" = 816 CSS px
// Section screenshots render at VIEWPORT_WIDTH (794), placed at 720 CSS px transformation
// → scale factor 720/794 = 0.907 (90.7% — acceptable for image-based content)
const DOC_CONTENT_CSS_PX = 720;   // 7.5 inches at 96 DPI

// Header image: 692×143 px source → at 816px wide → height = 169px = 1.760"
const HEADER_IMG_WIDTH_CSS  = 816;  // full paper width at 96 DPI
const HEADER_IMG_HEIGHT_CSS = 169;  // proportional height

// DXA (1/1440 inch) values for page setup
const MARGIN_LEFT_RIGHT = convertInchesToTwip(0.5);    // 720 DXA — 0.5" each side
const MARGIN_TOP        = convertInchesToTwip(1.875);  // 2700 DXA — clears the 1.76" header
const MARGIN_BOTTOM     = convertInchesToTwip(1.0);    // 1440 DXA — 1" bottom
const MARGIN_HEADER     = 0;                           // flush to top of page
const MARGIN_FOOTER     = convertInchesToTwip(0.5);    // 720 DXA — 0.5" from bottom

// Load header image once at module initialisation
const HEADER_IMG_BUFFER: Buffer | null = (() => {
  const p = path.resolve(process.cwd(), "attached_assets/HEADER_IMAGE_1773063127856.png");
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function imageFromScreenshot(ss: ScreenshotResult): ImageRun {
  const docH = Math.max(1, Math.round(ss.heightPx * DOC_CONTENT_CSS_PX / ss.widthPx));
  return new ImageRun({
    type: "png",
    data: ss.data,
    transformation: { width: DOC_CONTENT_CSS_PX, height: docH },
  });
}

function imagePara(ss: ScreenshotResult): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing:   { before: 0, after: 0 },
    keepLines: true,
    children:  [imageFromScreenshot(ss)],
  });
}

function pageBreakPara(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new PageBreak()],
  });
}

function spacer(twips = 80): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: twips } });
}

// ── Native header (swoosh repeats on every page) ───────────────────────────────
function buildDocHeader(): Header {
  if (!HEADER_IMG_BUFFER) {
    // Fallback: red rule if image is missing
    return new Header({
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          border: { bottom: { style: "single" as any, size: 24, color: "C0392B" } },
          children: [new TextRun({ text: "" })],
        }),
      ],
    });
  }

  return new Header({
    children: [
      new Paragraph({
        // Negative indent extends image beyond the 0.5" margins to fill the full 8.5" paper width
        indent: { left: -MARGIN_LEFT_RIGHT, right: -MARGIN_LEFT_RIGHT },
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: HEADER_IMG_BUFFER,
            transformation: { width: HEADER_IMG_WIDTH_CSS, height: HEADER_IMG_HEIGHT_CSS },
          }),
        ],
      }),
    ],
  });
}

// ── Native footer (repeats on every page) ──────────────────────────────────────
function buildDocFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { before: 40, after: 0 },
        border: {
          top: { style: "single" as any, size: 6, color: "C0392B" },
        },
        children: [
          new TextRun({ text: "Webserv", bold: true, color: "1B3A6B", font: "Calibri", size: 16 }),
          new TextRun({ text: "  |  32 Discovery Suite 130, Irvine, CA 92618  |  ", color: "6B7280", font: "Calibri", size: 16 }),
          new TextRun({ text: "webserv.io", color: "C0392B", font: "Calibri", size: 16 }),
        ],
      }),
    ],
  });
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

  // ── Cover (title + meta + AM context — NO header image, header is native DOCX) ──
  {
    const html = renderCoverHtml(reportData);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 1: What Matters Most This Quarter ──────────────────────────────
  if (isVisible("section_goals")) {
    docChildren.push(pageBreakPara());
    const html = renderSection1Html(reportData, secNums["section_goals"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 2: Where Conversions Actually Happen ──────────────────────────
  if (isVisible("section_conversions")) {
    docChildren.push(pageBreakPara());
    const html = renderSection2Html(reportData, secNums["section_conversions"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 3: Top Organic Traffic Drivers ────────────────────────────────
  if (isVisible("section_traffic")) {
    docChildren.push(pageBreakPara());
    const html = renderSection3Html(reportData, secNums["section_traffic"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 4: Site Service Overview ──────────────────────────────────────
  if (isVisible("section_services")) {
    docChildren.push(pageBreakPara());
    const html = renderSection4Html(reportData, secNums["section_services"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 5: SEO Tier Diagnosis ─────────────────────────────────────────
  if (isVisible("section_diagnosis")) {
    docChildren.push(pageBreakPara());
    const html = renderSection5Html(reportData, secNums["section_diagnosis"]);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 6: What We Need to Do Next ────────────────────────────────────
  if (isVisible("section_priorities")) {
    docChildren.push(pageBreakPara());
    const html = renderSection6Html(reportData, secNums["section_priorities"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 7: What We Track ──────────────────────────────────────────────
  if (isVisible("section_tracking")) {
    docChildren.push(pageBreakPara());
    const html = renderSection7Html(reportData, secNums["section_tracking"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Section 8: Additional Opportunities ──────────────────────────────────
  if (isVisible("section_opportunities")) {
    docChildren.push(pageBreakPara());
    const html = renderSection8Html(reportData, secNums["section_opportunities"], edits);
    const ss   = await screenshotHtml(html);
    docChildren.push(imagePara(ss));
  }

  // ── Build document with native header/footer ──────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    MARGIN_TOP,
              bottom: MARGIN_BOTTOM,
              left:   MARGIN_LEFT_RIGHT,
              right:  MARGIN_LEFT_RIGHT,
              header: MARGIN_HEADER,
              footer: MARGIN_FOOTER,
            },
          },
        },
        headers: {
          default: buildDocHeader(),
        },
        footers: {
          default: buildDocFooter(),
        },
        children: docChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
