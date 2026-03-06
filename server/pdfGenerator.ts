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
