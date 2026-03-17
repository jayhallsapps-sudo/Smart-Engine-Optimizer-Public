import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { SectionData } from "./reportGenerators";

const WEBSERV_RED = "#C0392B";
const BLACK = "#000000";
const DARK_GRAY = "#374151";
const LIGHT_GRAY = "#6B7280";
const STRIPE_BG = "#F0F4FA";
const DEFAULT_FOOTER = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

const PAGE_W = 612;
const MARGIN_L = 72;
const BODY_W = PAGE_W - MARGIN_L - MARGIN_L;

// WinAnsi-safe bullet characters (Helvetica built-in font encoding)
const BULLET = "\u2022"; // • U+2022  (WinAnsi 0x95) — safe
const SUB_BULLET = "-";  // plain hyphen — always safe

function readBwConfig(): { purposeText: string; footerText: string } {
  const configPath = path.join(process.cwd(), "server", "assets", "template_config.json");
  try {
    if (fs.existsSync(configPath)) {
      const full = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const bw = full.biweekly ?? full;
      return {
        purposeText: bw.purposeText ?? "",
        footerText: bw.footerText ?? DEFAULT_FOOTER,
      };
    }
  } catch {}
  return { purposeText: "", footerText: DEFAULT_FOOTER };
}

export async function generateBiweeklyPdf(
  clientName: string,
  attendees: string,
  date: string,
  sections: SectionData[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bwCfg = readBwConfig();
    const headerImagePath = path.join(process.cwd(), "server", "assets", "biweekly_header.png");
    const hasHeader = fs.existsSync(headerImagePath);
    const headerImgData = hasHeader ? fs.readFileSync(headerImagePath) : null;
    const headerImgH = headerImgData ? Math.round((143 / 692) * PAGE_W) : 0;

    const PAGE_H = 792;
    const FOOTER_TOP = PAGE_H - 36;

    function drawFooter() {
      doc.moveTo(MARGIN_L, FOOTER_TOP).lineTo(MARGIN_L + BODY_W, FOOTER_TOP)
        .lineWidth(0.5).strokeColor(LIGHT_GRAY).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(LIGHT_GRAY)
        .text(bwCfg.footerText, MARGIN_L, FOOTER_TOP + 6, { width: BODY_W, align: "center", lineBreak: false });
    }

    let bodyY = 56;
    if (headerImgData) {
      doc.image(headerImgData, 0, 0, { width: PAGE_W });
      bodyY = headerImgH + 14;
    }

    let y = bodyY;

    function pageBreakIfNeeded(needed = 60) {
      if (y + needed > FOOTER_TOP - 10) {
        drawFooter();
        doc.addPage();
        if (headerImgData) {
          doc.image(headerImgData, 0, 0, { width: PAGE_W });
          y = headerImgH + 14;
        } else {
          y = 56;
        }
      }
    }

    // ── Title block ──────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(15).fillColor(BLACK)
      .text(`SEO Bi-weekly Meeting: ${clientName}`, MARGIN_L, y, { width: BODY_W });
    y = doc.y + 5;

    doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
      .text(`Attendees: ${attendees}`, MARGIN_L, y, { width: BODY_W });
    y = doc.y + 5;

    const pillW = 180;
    const pillH = 15;
    doc.roundedRect(MARGIN_L, y, pillW, pillH, 3).fill("#E8EAED");
    doc.font("Helvetica").fontSize(9).fillColor(DARK_GRAY)
      .text(`Date: ${date}`, MARGIN_L + 8, y + 3, { width: pillW - 16, lineBreak: false });
    y += pillH + 14;

    // ── Purpose ──────────────────────────────────────────────
    const purposeText =
      bwCfg.purposeText ||
      "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.";

    doc.font("Helvetica-Bold").fontSize(11).fillColor(WEBSERV_RED)
      .text("Purpose:  ", MARGIN_L, y, { width: BODY_W, continued: true });
    doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
      .text(purposeText, { continued: false });
    y = doc.y + 14;

    // ── Sections ─────────────────────────────────────────────
    let sectionNum = 0;

    for (const section of sections) {
      if (section.sectionId === "bw_purpose") continue;

      sectionNum++;
      pageBreakIfNeeded(50);

      // Red underlined heading
      doc.font("Helvetica-Bold").fontSize(13).fillColor(WEBSERV_RED)
        .text(`${sectionNum}.  ${section.title}`, MARGIN_L, y, { width: BODY_W });
      const headingBottom = doc.y;
      doc.moveTo(MARGIN_L, headingBottom + 2).lineTo(MARGIN_L + BODY_W, headingBottom + 2)
        .lineWidth(1.5).strokeColor(WEBSERV_RED).stroke();
      y = headingBottom + 10;

      for (const item of section.items) {
        // ── Metric summary bullets ────────────────────────────
        if ((item as any).summary && (item as any).summary.length > 0) {
          for (const s of (item as any).summary) {
            pageBreakIfNeeded(20);

            const hasDelta = s.previous && s.previous !== "\u2014";
            // Use WinAnsi-safe "+"/"-" for delta direction instead of ▲/▼
            const dir = s.isPositive ? "+" : "-";
            const dColor = s.isPositive ? "#16A34A" : "#DC2626";

            // Anchor with width so PDFKit knows the wrapping boundary
            doc.font("Helvetica-Bold").fontSize(10).fillColor(BLACK)
              .text(`${BULLET}  `, MARGIN_L, y, { width: BODY_W, continued: true });
            doc.font("Helvetica-Bold").fontSize(10).fillColor(BLACK)
              .text(`${s.label}: `, { continued: true });
            doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
              .text(s.current, { continued: hasDelta });

            if (hasDelta) {
              doc.font("Helvetica").fontSize(10).fillColor(LIGHT_GRAY)
                .text(`  (vs ${s.previous}  `, { continued: true });
              doc.font("Helvetica-Bold").fontSize(10).fillColor(dColor)
                .text(`${dir}${s.deltaPercent}`, { continued: true });
              doc.font("Helvetica").fontSize(10).fillColor(LIGHT_GRAY)
                .text(")", { continued: false });
            } else {
              doc.text("", { continued: false });
            }
            y = doc.y + 3;
          }
          y += 4;
        }

        // ── Rich bullets ──────────────────────────────────────
        if (item.richBullets && item.richBullets.length > 0) {
          for (const rb of item.richBullets) {
            pageBreakIfNeeded(28);

            const bulletX = MARGIN_L;
            const textX = MARGIN_L + 14;
            const textW = BODY_W - 14;
            const startY = y;

            // Bullet dot rendered at same y as first text run
            doc.font("Helvetica").fontSize(10).fillColor(WEBSERV_RED)
              .text(BULLET, bulletX, startY, { lineBreak: false });

            // Render text runs: anchor first run with explicit x,y and width
            let firstRun = true;
            for (const run of rb.textRuns) {
              const font = run.bold ? "Helvetica-Bold" : "Helvetica";
              const color = run.bold ? WEBSERV_RED : DARK_GRAY;
              if (firstRun) {
                doc.font(font).fontSize(10).fillColor(color)
                  .text(run.text, textX, startY, { width: textW, continued: true });
                firstRun = false;
              } else {
                doc.font(font).fontSize(10).fillColor(color)
                  .text(run.text, { continued: true });
              }
            }
            doc.text("", { continued: false });
            y = doc.y + 2;

            if (rb.subBullets && rb.subBullets.length > 0) {
              for (const sub of rb.subBullets) {
                pageBreakIfNeeded(16);
                doc.font("Helvetica").fontSize(9).fillColor(LIGHT_GRAY)
                  .text(`${SUB_BULLET}  ${sub}`, MARGIN_L + 22, y, { width: BODY_W - 22 });
                y = doc.y + 2;
              }
            }
            y += 4;
          }
        }

        // ── Data tables ───────────────────────────────────────
        if (item.tables && item.tables.length > 0) {
          for (const tbl of item.tables) {
            pageBreakIfNeeded(44);

            if (tbl.title) {
              doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK_GRAY)
                .text(tbl.title, MARGIN_L, y, { width: BODY_W });
              y = doc.y + 4;
            }

            const colCount = tbl.headers.length;
            const colW = Math.floor(BODY_W / colCount);

            doc.rect(MARGIN_L, y, BODY_W, 16).fill(BLACK);
            tbl.headers.forEach((h, hi) => {
              doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
                .text(String(h), MARGIN_L + hi * colW + 4, y + 4, { width: colW - 8, lineBreak: false });
            });
            y += 16;

            for (let ri = 0; ri < tbl.rows.length; ri++) {
              const row = tbl.rows[ri];
              pageBreakIfNeeded(14);
              if (ri % 2 === 1) doc.rect(MARGIN_L, y, BODY_W, 14).fill(STRIPE_BG);
              row.forEach((cell, ci) => {
                doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY)
                  .text(String(cell), MARGIN_L + ci * colW + 4, y + 3, { width: colW - 8, lineBreak: false });
              });
              y += 14;
            }
            y += 10;
          }
        }

        // ── Work-log table (tableRows) ────────────────────────
        if (item.tableRows && item.tableRows.length > 0) {
          pageBreakIfNeeded(44);

          const COL_AREA = 80;
          const COL_DID = 238;
          const COL_NEXT = BODY_W - COL_AREA - COL_DID;
          const COL = [COL_AREA, COL_DID, COL_NEXT];
          const hdrs = ["Area", "What We Did / Learned", "What's Next"];

          doc.rect(MARGIN_L, y, BODY_W, 16).fill(BLACK);
          let cx = MARGIN_L;
          hdrs.forEach((h, hi) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
              .text(h, cx + 4, y + 4, { width: COL[hi] - 8, lineBreak: false });
            cx += COL[hi];
          });
          y += 16;

          const fnt = { font: "Helvetica", size: 8 };
          for (let ri = 0; ri < item.tableRows.length; ri++) {
            const row = item.tableRows[ri];

            // Measure next-items text
            const nextText = Array.isArray((row as any).nextItemsRich)
              ? (row as any).nextItemsRich.map((n: any) => (typeof n === "string" ? n : n.text ?? "")).join("\n")
              : row.whatsNext;

            const h0 = doc.heightOfString(row.area, { width: COL[0] - 8, font: fnt.font, size: fnt.size });
            const h1 = doc.heightOfString(row.whatWeDid, { width: COL[1] - 8, font: fnt.font, size: fnt.size });
            const h2 = doc.heightOfString(nextText, { width: COL[2] - 8, font: fnt.font, size: fnt.size });
            const rowH = Math.max(h0, h1, h2, 14) + 8;
            pageBreakIfNeeded(rowH + 4);

            if (ri % 2 === 1) doc.rect(MARGIN_L, y, BODY_W, rowH).fill(STRIPE_BG);

            doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY);
            doc.text(row.area, MARGIN_L + 4, y + 4, { width: COL[0] - 8 });
            doc.text(row.whatWeDid, MARGIN_L + COL[0] + 4, y + 4, { width: COL[1] - 8 });
            doc.text(nextText, MARGIN_L + COL[0] + COL[1] + 4, y + 4, { width: COL[2] - 8 });
            y += rowH;
          }
          y += 10;
        }

        // ── Manual text (bullets) ─────────────────────────────
        if (item.manualText) {
          const lines = item.manualText.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            pageBreakIfNeeded(20);
            // Render bullet and text on same line using a single call with indent
            doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
              .text(`${BULLET}  ${line}`, MARGIN_L, y, { width: BODY_W });
            y = doc.y + 4;
          }
          y += 4;
        }
      }

      y += 10;
    }

    drawFooter();
    doc.end();
  });
}

const WEBSERV_BLUE = "#1B3A6B";
const BLUE_LIGHT = "#E8F0FE";

export async function generateMonthlyPdf(
  clientName: string,
  monthLabel: string,
  sections: SectionData[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_H = 792;
    const FOOTER_TOP = PAGE_H - 36;

    function drawMonthlyFooter() {
      doc.moveTo(MARGIN_L, FOOTER_TOP).lineTo(MARGIN_L + BODY_W, FOOTER_TOP)
        .lineWidth(0.5).strokeColor(LIGHT_GRAY).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(LIGHT_GRAY)
        .text("Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io", MARGIN_L, FOOTER_TOP + 6, { width: BODY_W, align: "center", lineBreak: false });
    }

    let y = 56;

    function pageBreakIfNeeded(needed = 60) {
      if (y + needed > FOOTER_TOP - 10) {
        drawMonthlyFooter();
        doc.addPage();
        y = 56;
      }
    }

    // Title block
    doc.rect(0, 0, PAGE_W, 52).fill(WEBSERV_BLUE);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#FFFFFF")
      .text(`SEO Monthly Report: ${clientName}`, MARGIN_L, 14, { width: BODY_W });
    doc.font("Helvetica").fontSize(10).fillColor("#BFD7FF")
      .text(monthLabel, MARGIN_L, 34, { width: BODY_W });
    y = 68;

    let sectionNum = 0;
    for (const section of sections) {
      sectionNum++;
      pageBreakIfNeeded(50);

      // Blue underlined heading
      doc.font("Helvetica-Bold").fontSize(13).fillColor(WEBSERV_BLUE)
        .text(`${sectionNum}.  ${section.title}`, MARGIN_L, y, { width: BODY_W });
      const headingBottom = doc.y;
      doc.moveTo(MARGIN_L, headingBottom + 2).lineTo(MARGIN_L + BODY_W, headingBottom + 2)
        .lineWidth(1.5).strokeColor(WEBSERV_BLUE).stroke();
      y = headingBottom + 10;

      for (const item of section.items) {
        // ── Metric cards ─────────────────────────────────────
        if ((item as any).summary && (item as any).summary.length > 0) {
          const mets: any[] = (item as any).summary;
          const cardsPerRow = Math.min(4, mets.length);
          const cardW = Math.floor(BODY_W / cardsPerRow);
          const cardH = 50;
          let cx = MARGIN_L;
          let rowStartY = y;
          pageBreakIfNeeded(cardH + 10);

          for (let mi = 0; mi < mets.length; mi++) {
            const m = mets[mi];
            if (mi > 0 && mi % cardsPerRow === 0) {
              cx = MARGIN_L;
              rowStartY += cardH + 6;
              pageBreakIfNeeded(cardH + 10);
            }

            doc.rect(cx, rowStartY, cardW - 4, cardH).fill(BLUE_LIGHT);
            doc.font("Helvetica").fontSize(7).fillColor(LIGHT_GRAY)
              .text(m.label.toUpperCase(), cx + 6, rowStartY + 5, { width: cardW - 14, lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(14).fillColor(DARK_GRAY)
              .text(m.current, cx + 6, rowStartY + 16, { width: cardW - 14, lineBreak: false });

            if (m.previous && m.previous !== "\u2014") {
              const dir = m.isPositive ? "+" : "-";
              const col = m.isPositive ? "#16A34A" : "#DC2626";
              // Anchor with width to prevent text overflow
              doc.font("Helvetica").fontSize(7).fillColor(LIGHT_GRAY)
                .text(`vs ${m.previous}  `, cx + 6, rowStartY + 36, { width: cardW - 14, continued: true });
              doc.font("Helvetica-Bold").fontSize(7).fillColor(col)
                .text(`${dir}${m.deltaPercent}`, { continued: false });
            }
            cx += cardW;
          }
          y = rowStartY + cardH + 10;
        }

        // ── Data tables ───────────────────────────────────────
        if (item.tables && item.tables.length > 0) {
          for (const tbl of item.tables) {
            pageBreakIfNeeded(44);
            if (tbl.title) {
              doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK_GRAY)
                .text(tbl.title, MARGIN_L, y, { width: BODY_W });
              y = doc.y + 4;
            }
            const colCount = tbl.headers.length;
            const colW = Math.floor(BODY_W / colCount);
            doc.rect(MARGIN_L, y, BODY_W, 16).fill(WEBSERV_BLUE);
            tbl.headers.forEach((h, hi) => {
              doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
                .text(String(h), MARGIN_L + hi * colW + 4, y + 4, { width: colW - 8, lineBreak: false });
            });
            y += 16;
            for (let ri = 0; ri < Math.min(tbl.rows.length, 20); ri++) {
              const row = tbl.rows[ri];
              pageBreakIfNeeded(14);
              if (ri % 2 === 1) doc.rect(MARGIN_L, y, BODY_W, 14).fill(BLUE_LIGHT);
              row.forEach((cell, ci) => {
                doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY)
                  .text(String(cell), MARGIN_L + ci * colW + 4, y + 3, { width: colW - 8, lineBreak: false });
              });
              y += 14;
            }
            y += 10;
          }
        }

        // ── Bullet text ───────────────────────────────────────
        if (item.manualText) {
          const lines = item.manualText.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            pageBreakIfNeeded(20);
            doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
              .text(`${BULLET}  ${line}`, MARGIN_L, y, { width: BODY_W });
            y = doc.y + 4;
          }
          y += 4;
        }
      }
      y += 12;
    }

    drawMonthlyFooter();
    doc.end();
  });
}

// ─── Discoverability Tool PDF ─────────────────────────────────────────────────

const DISC_NAVY = "#1B3A6B";
const DISC_NAVY_LIGHT = "#EBF0F8";
const DISC_GREEN = "#16A34A";
const DISC_AMBER = "#D97706";
const DISC_RED = "#DC2626";
const DISC_MUTED = "#6B7280";
const DISC_FOOTER = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

export interface DiscoverabilityPdfData {
  workspaceName: string;
  preparedBy?: string;
  clientName?: string;
  domain?: string;
  businessType?: string;
  industryCategory?: string;
  marketType?: string;
  locationTargets?: string[];
  primaryServices?: string[];
  primaryConversionGoals?: string[];
  northStarMetric?: string;
  isYmyl?: boolean;
  complianceSensitivity?: string;
  notes?: string;
  clusters: Array<{
    id: string; name: string; clusterType?: string;
    clusterRole?: string; linkedBusinessGoal?: string; notes?: string;
  }>;
  keywords: Array<{
    id: string; keyword: string; clusterId?: string; source?: string;
    estimatedVolume?: string; estimatedDifficulty?: number;
    businessGoal?: string; dominantIntent?: string;
    finalOpportunityScore?: number; businessGoalAlignmentScore?: number;
    intentFitScore?: number; conversionProximityScore?: number;
    recommendedPageType?: string; recommendedTargetUrl?: string;
    pageTypeReason?: string; serpNotes?: string; notes?: string;
    status: string; isLocked?: boolean;
    confidence?: string;
    cannibalizationWarning?: string; cannibalizationSeverity?: string;
  }>;
  internalLinkSuggestions: Array<{
    clusterId?: string; clusterName?: string;
    supportingPages?: string[]; anchorTextSuggestions?: string[];
    linkingNotes?: string; linkType?: string; rationale?: string;
  }>;
  changeLog: Array<{ timestamp: string; action: string; detail: string }>;
  exportMode?: "all" | "approved" | "filtered";
}

const PAGE_TYPE_LABELS_PDF: Record<string, string> = {
  existing_page_refresh: "Refresh Existing", new_blog: "New Blog",
  new_service_page: "New Service Page", new_location_page: "New Location Page",
  new_faq_page: "New FAQ", comparison_page: "Comparison Page",
  booking_page: "Booking Page", category_hub_page: "Category Hub",
  no_action: "No Action",
};

export async function generateDiscoverabilityPdf(data: DiscoverabilityPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PW = 612;
    const ML = 54;
    const BW = PW - ML - ML;
    const PAGE_H = 792;
    const FOOTER_Y = PAGE_H - 32;
    let y = 0;

    function drawFooter() {
      doc.moveTo(ML, FOOTER_Y).lineTo(ML + BW, FOOTER_Y)
        .lineWidth(0.4).strokeColor(DISC_MUTED).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(DISC_MUTED)
        .text(DISC_FOOTER, ML, FOOTER_Y + 6, { width: BW, align: "center", lineBreak: false });
    }

    function newPage() {
      drawFooter();
      doc.addPage();
      y = 48;
    }

    function checkSpace(needed: number) {
      if (y + needed > FOOTER_Y - 12) newPage();
    }

    function sectionHeader(title: string, num?: number) {
      checkSpace(38);
      const label = num !== undefined ? `${num}.  ${title}` : title;
      doc.font("Helvetica-Bold").fontSize(12).fillColor(DISC_NAVY)
        .text(label, ML, y, { width: BW });
      y = doc.y + 2;
      doc.moveTo(ML, y).lineTo(ML + BW, y).lineWidth(1.2).strokeColor(DISC_NAVY).stroke();
      y += 8;
    }

    function bodyText(text: string, color = "#374151") {
      checkSpace(16);
      doc.font("Helvetica").fontSize(9).fillColor(color).text(text, ML, y, { width: BW });
      y = doc.y + 4;
    }

    function kv(key: string, value: string) {
      checkSpace(14);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#374151")
        .text(`${key}:  `, ML, y, { width: 130, continued: true });
      doc.font("Helvetica").fontSize(8.5).fillColor("#374151")
        .text(value || "—", { width: BW - 130, continued: false });
      y = doc.y + 3;
    }

    function tableRow(cells: string[], colWidths: number[], isHeader: boolean, isEven: boolean) {
      const rowH = 14;
      checkSpace(rowH + 2);
      if (isHeader) {
        doc.rect(ML, y, BW, rowH).fill(DISC_NAVY);
      } else if (isEven) {
        doc.rect(ML, y, BW, rowH).fill(DISC_NAVY_LIGHT);
      }
      let cx = ML;
      cells.forEach((cell, i) => {
        const cw = colWidths[i];
        const color = isHeader ? "#FFFFFF" : "#374151";
        const font = isHeader ? "Helvetica-Bold" : "Helvetica";
        doc.font(font).fontSize(7.5).fillColor(color)
          .text(String(cell ?? "").slice(0, 60), cx + 3, y + 3, { width: cw - 6, lineBreak: false });
        cx += cw;
      });
      y += rowH;
    }

    function scoreColor(s: number) {
      return s >= 7 ? DISC_GREEN : s >= 4 ? DISC_AMBER : DISC_RED;
    }

    // ── Cover Page ────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 200).fill(DISC_NAVY);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#BFD7FF")
      .text("KEYWORD RESEARCH REPORT", ML, 52, { width: BW, characterSpacing: 1.5 });
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#FFFFFF")
      .text(data.clientName || data.workspaceName, ML, 68, { width: BW });
    doc.font("Helvetica").fontSize(11).fillColor("#BFD7FF")
      .text(data.domain || "", ML, 96, { width: BW });
    doc.font("Helvetica").fontSize(9).fillColor("#BFD7FF")
      .text(`Workspace: ${data.workspaceName}`, ML, 114, { width: BW });
    doc.font("Helvetica").fontSize(9).fillColor("#BFD7FF")
      .text(`Prepared by: ${data.preparedBy || "Webserv"}   ·   ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, ML, 128, { width: BW });

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151")
      .text("Discoverability Tool — Business-Goal-Aligned Keyword Research", ML, 220, { width: BW });
    y = 240;
    const approvedKws = data.keywords.filter(k => k.status === "approved");
    const statsRows = [
      ["Total Clusters", String(data.clusters.length)],
      ["Total Keywords", String(data.keywords.length)],
      ["Approved", String(approvedKws.length)],
      ["Pending", String(data.keywords.filter(k => k.status === "pending").length)],
      ["Watchlist", String(data.keywords.filter(k => k.status === "watchlist").length)],
    ];
    statsRows.forEach(([k, v]) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DISC_NAVY)
        .text(`${k}: `, ML, y, { continued: true });
      doc.font("Helvetica").fontSize(9).fillColor("#374151").text(v);
      y = doc.y + 3;
    });
    y += 12;
    if (data.isYmyl) {
      doc.roundedRect(ML, y, BW, 22, 3).fill("#FEF3C7");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#92400E")
        .text("YMYL / Regulated Industry — Trust & compliance review applied to scoring", ML + 8, y + 7, { width: BW - 16 });
      y += 30;
    }

    // ── Business Profile ──────────────────────────────────────────────────────
    newPage();
    y = 48;
    sectionHeader("Business Profile", 1);
    kv("Client", data.clientName || "");
    kv("Domain", data.domain || "");
    kv("Business Type", data.businessType || "");
    kv("Industry", data.industryCategory || "");
    kv("Market Type", data.marketType || "");
    kv("Locations", (data.locationTargets || []).join(", ") || "Not specified");
    kv("Primary Services", (data.primaryServices || []).join(", ") || "");
    kv("Conversion Goals", (data.primaryConversionGoals || []).join(", ") || "");
    kv("North Star Metric", data.northStarMetric || "");
    kv("YMYL / Regulated", data.isYmyl ? "Yes" : "No");
    kv("Compliance Level", data.complianceSensitivity || "low");
    if (data.notes) { y += 4; bodyText(`Strategic Notes: ${data.notes}`, DISC_MUTED); }

    // ── Cluster Overview ──────────────────────────────────────────────────────
    y += 12;
    sectionHeader("Cluster Overview", 2);
    if (data.clusters.length === 0) {
      bodyText("No clusters defined.", DISC_MUTED);
    } else {
      const cols = [120, 100, 80, BW - 300];
      tableRow(["Cluster Name", "Role", "Type", "Business Goal"], cols, true, false);
      data.clusters.forEach((c, i) => {
        tableRow([c.name, (c.clusterRole || "").replace(/_/g, " "), (c.clusterType || "").replace(/_/g, " "), c.linkedBusinessGoal || ""], cols, false, i % 2 === 1);
      });
      y += 8;
    }

    // ── Top Keyword Opportunities ─────────────────────────────────────────────
    y += 8;
    sectionHeader("Top Keyword Opportunities", 3);
    const topKws = [...data.keywords]
      .filter(k => k.status !== "rejected")
      .sort((a, b) => (b.finalOpportunityScore || 0) - (a.finalOpportunityScore || 0))
      .slice(0, 30);
    if (topKws.length === 0) {
      bodyText("No keywords available.", DISC_MUTED);
    } else {
      const clusterMap = Object.fromEntries(data.clusters.map(c => [c.id, c.name]));
      const kCols = [160, 80, 60, 50, 50, BW - 400];
      tableRow(["Keyword", "Cluster", "Intent", "Score", "Status", "Page Type"], kCols, true, false);
      topKws.forEach((kw, i) => {
        const clName = clusterMap[kw.clusterId || ""] || "";
        const intent = (kw.dominantIntent || "").replace(/_/g, " ");
        const score = (kw.finalOpportunityScore || 0).toFixed(1);
        const pageType = PAGE_TYPE_LABELS_PDF[kw.recommendedPageType || ""] || kw.recommendedPageType || "";
        checkSpace(14);
        const rowH = 14;
        if (i % 2 === 1) doc.rect(ML, y, BW, rowH).fill(DISC_NAVY_LIGHT);
        let cx = ML;
        const cells = [kw.keyword, clName, intent, score, kw.status, pageType];
        cells.forEach((cell, ci) => {
          const cw = kCols[ci];
          let color = "#374151";
          if (ci === 3) color = scoreColor(parseFloat(score));
          if (ci === 4) {
            if (kw.status === "approved") color = DISC_GREEN;
            else if (kw.status === "rejected") color = DISC_RED;
            else if (kw.status === "watchlist") color = DISC_AMBER;
          }
          const font = ci === 3 ? "Helvetica-Bold" : "Helvetica";
          doc.font(font).fontSize(7.5).fillColor(color)
            .text(String(cell ?? "").slice(0, 55), cx + 3, y + 3, { width: cw - 6, lineBreak: false });
          cx += cw;
        });
        y += rowH;
        // Show cannibalization warning if present
        if (kw.cannibalizationWarning) {
          checkSpace(12);
          doc.font("Helvetica").fontSize(7).fillColor(DISC_AMBER)
            .text(`  ⚠ ${kw.cannibalizationWarning}`, ML + 4, y + 1, { width: BW - 8, lineBreak: false });
          y += 11;
        }
      });
      y += 8;
    }

    // ── Page-Type Recommendations ─────────────────────────────────────────────
    newPage();
    sectionHeader("Page-Type Recommendations", 4);
    const byType = topKws.reduce((acc, kw) => {
      const t = kw.recommendedPageType || "no_action";
      if (!acc[t]) acc[t] = [];
      acc[t].push(kw);
      return acc;
    }, {} as Record<string, typeof topKws>);
    const importantTypes = Object.entries(byType).filter(([t]) => t !== "no_action");
    if (importantTypes.length === 0) {
      bodyText("No page-type recommendations available.", DISC_MUTED);
    } else {
      importantTypes.forEach(([pageType, kws]) => {
        checkSpace(32);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DISC_NAVY)
          .text(PAGE_TYPE_LABELS_PDF[pageType] || pageType, ML, y);
        y = doc.y + 2;
        const avg = (kws.reduce((a, k) => a + (k.finalOpportunityScore || 0), 0) / kws.length).toFixed(1);
        doc.font("Helvetica").fontSize(8).fillColor(DISC_MUTED)
          .text(`${kws.length} keyword${kws.length !== 1 ? "s" : ""} · avg score ${avg}`, ML, y);
        y = doc.y + 3;
        kws.slice(0, 5).forEach(kw => {
          checkSpace(12);
          doc.font("Helvetica").fontSize(8).fillColor("#374151")
            .text(`• ${kw.keyword}`, ML + 8, y, { continued: true, width: 240 });
          if (kw.recommendedTargetUrl) {
            doc.font("Helvetica").fontSize(7).fillColor(DISC_MUTED)
              .text(`  →  ${kw.recommendedTargetUrl}`, { continued: false });
          } else {
            doc.text("");
          }
          y = doc.y + 2;
          if (kw.pageTypeReason) {
            doc.font("Helvetica").fontSize(7).fillColor(DISC_MUTED)
              .text(kw.pageTypeReason, ML + 16, y, { width: BW - 16 });
            y = doc.y + 2;
          }
        });
        if (kws.length > 5) {
          doc.font("Helvetica").fontSize(7).fillColor(DISC_MUTED)
            .text(`  +${kws.length - 5} more`, ML + 8, y);
          y = doc.y + 2;
        }
        y += 8;
      });
    }

    // ── Internal Linking & Topical Authority ──────────────────────────────────
    if (data.internalLinkSuggestions.length > 0) {
      checkSpace(40);
      sectionHeader("Internal Linking & Topical Authority", 5);
      data.internalLinkSuggestions.forEach(s => {
        checkSpace(28);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DISC_NAVY)
          .text(s.clusterName || "", ML, y);
        y = doc.y + 2;
        if (s.rationale) {
          doc.font("Helvetica").fontSize(8).fillColor(DISC_MUTED)
            .text(s.rationale, ML, y, { width: BW });
          y = doc.y + 3;
        }
        if (s.anchorTextSuggestions?.length) {
          doc.font("Helvetica").fontSize(7.5).fillColor("#374151")
            .text(`Anchor text: ${s.anchorTextSuggestions.join("  ·  ")}`, ML + 8, y, { width: BW - 8 });
          y = doc.y + 3;
        }
        if (s.linkingNotes) {
          doc.font("Helvetica").fontSize(7.5).fillColor(DISC_MUTED)
            .text(s.linkingNotes, ML + 8, y, { width: BW - 8 });
          y = doc.y + 3;
        }
        y += 6;
      });
    }

    // ── Rejected / Watchlist ──────────────────────────────────────────────────
    const rejectedKws = data.keywords.filter(k => k.status === "rejected" || k.status === "watchlist");
    if (rejectedKws.length > 0) {
      checkSpace(40);
      sectionHeader("Rejected / Watchlist Keywords", 6);
      const rCols = [180, 70, 50, BW - 300];
      tableRow(["Keyword", "Cluster", "Status", "Notes / Reason"], rCols, true, false);
      const clusterMap2 = Object.fromEntries(data.clusters.map(c => [c.id, c.name]));
      rejectedKws.slice(0, 20).forEach((kw, i) => {
        tableRow([kw.keyword, clusterMap2[kw.clusterId || ""] || "", kw.status, kw.notes || ""], rCols, false, i % 2 === 1);
      });
      y += 8;
    }

    // ── Methodology ───────────────────────────────────────────────────────────
    checkSpace(80);
    sectionHeader("Methodology & Scoring", rejectedKws.length > 0 ? 7 : 6);
    bodyText("This keyword research workspace was generated using Webserv's Discoverability Tool. Opportunity scores reflect business-goal alignment, not raw search volume. Each keyword is evaluated on 10 weighted dimensions:");
    const dims = [
      ["Business Goal Alignment (20%)", "How directly this keyword supports the client's stated business goals and conversion outcomes."],
      ["Intent Fit (20%)", "Whether the SERP intent matches what the client's pages can satisfy."],
      ["Ranking Opportunity (15%)", "Realistic rankability given domain authority and competitive landscape."],
      ["Conversion Proximity (15%)", "How close this keyword is to a transaction, lead, or booking action."],
      ["Current Traction (10%)", "Estimated existing visibility or ranking position for this term."],
      ["Topical Authority Value (10%)", "How much this keyword strengthens an important topical cluster."],
      ["Content Effort (5%)", "Inverted — lower content production burden scores higher."],
      ["Existing Coverage (5%)", "Whether the client already has a page that could be refreshed."],
      ["Local Relevance (weighted contextually)", "Geo-relevance for local or multi-location businesses."],
      ["Trust/Compliance Complexity (YMYL only)", "Applied only when client is in a regulated or YMYL industry."],
    ];
    dims.forEach(([name, desc]) => {
      checkSpace(20);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DISC_NAVY).text(`• ${name}`, ML + 8, y, { width: BW - 8 });
      y = doc.y + 1;
      doc.font("Helvetica").fontSize(7.5).fillColor(DISC_MUTED).text(desc, ML + 18, y, { width: BW - 18 });
      y = doc.y + 4;
    });
    y += 6;
    bodyText("Sources: AI-inferred baseline (Claude), supplemented by any GSC, Ahrefs, SEMrush, or manual data present in the workspace. Confidence labels (high/medium/low) indicate how much actual data supported each recommendation vs. inference.");

    // ── Notes ─────────────────────────────────────────────────────────────────
    const workspaceNotes = (data as any).workspaceNotes;
    if (workspaceNotes) {
      checkSpace(40);
      sectionHeader("Notes & Overrides");
      bodyText(workspaceNotes, "#374151");
    }

    drawFooter();
    doc.end();
  });
}
