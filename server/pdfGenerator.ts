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

    let bodyY = 56;
    if (hasHeader) {
      const imgData = fs.readFileSync(headerImagePath);
      const imgH = Math.round((143 / 692) * PAGE_W);
      doc.image(imgData, 0, 0, { width: PAGE_W });
      bodyY = imgH + 14;
    }

    let y = bodyY;

    function pageBreakIfNeeded(needed = 60) {
      if (y + needed > 750) {
        doc.addPage();
        y = 56;
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
      .text("Purpose:  ", MARGIN_L, y, { continued: true });
    doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
      .text(purposeText, { width: BODY_W });
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
        // ── Rich bullets ──────────────────────────────────────
        if (item.richBullets && item.richBullets.length > 0) {
          for (const rb of item.richBullets) {
            pageBreakIfNeeded(28);

            const bulletX = MARGIN_L;
            const textX = MARGIN_L + 14;
            const textW = BODY_W - 14;

            doc.font("Helvetica").fontSize(10).fillColor(BLACK)
              .text("●", bulletX, y, { continued: false });

            const startY = y;
            let firstRun = true;
            for (const run of rb.textRuns) {
              doc.font(run.bold ? "Helvetica-Bold" : "Helvetica")
                .fontSize(10)
                .fillColor(run.bold ? WEBSERV_RED : DARK_GRAY);
              if (firstRun) {
                doc.text(run.text, textX, startY, { continued: true, width: textW });
                firstRun = false;
              } else {
                doc.text(run.text, { continued: true, width: textW });
              }
            }
            doc.text("", { continued: false });
            y = doc.y + 2;

            if (rb.subBullets && rb.subBullets.length > 0) {
              for (const sub of rb.subBullets) {
                pageBreakIfNeeded(16);
                doc.font("Helvetica").fontSize(9).fillColor(LIGHT_GRAY)
                  .text(`○  ${sub}`, MARGIN_L + 22, y, { width: BODY_W - 22 });
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

            doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK_GRAY)
              .text(tbl.title, MARGIN_L, y, { width: BODY_W });
            y = doc.y + 4;

            const colCount = tbl.headers.length;
            const colW = BODY_W / colCount;

            // Header
            doc.rect(MARGIN_L, y, BODY_W, 16).fill(BLACK);
            tbl.headers.forEach((h, hi) => {
              doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
                .text(h, MARGIN_L + hi * colW + 4, y + 4, { width: colW - 8, lineBreak: false });
            });
            y += 16;

            // Rows
            for (let ri = 0; ri < tbl.rows.length; ri++) {
              const row = tbl.rows[ri];
              pageBreakIfNeeded(14);
              if (ri % 2 === 1) doc.rect(MARGIN_L, y, BODY_W, 14).fill(STRIPE_BG);
              row.forEach((cell, ci) => {
                doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY)
                  .text(cell, MARGIN_L + ci * colW + 4, y + 3, { width: colW - 8, lineBreak: false });
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

          // Header
          doc.rect(MARGIN_L, y, BODY_W, 16).fill(BLACK);
          let cx = MARGIN_L;
          hdrs.forEach((h, hi) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
              .text(h, cx + 4, y + 4, { width: COL[hi] - 8, lineBreak: false });
            cx += COL[hi];
          });
          y += 16;

          for (let ri = 0; ri < item.tableRows.length; ri++) {
            const row = item.tableRows[ri];
            const h0 = doc.heightOfString(row.area, { width: COL[0] - 8 });
            const h1 = doc.heightOfString(row.whatWeDid, { width: COL[1] - 8 });
            const h2 = doc.heightOfString(row.whatsNext, { width: COL[2] - 8 });
            const rowH = Math.max(h0, h1, h2, 14) + 8;
            pageBreakIfNeeded(rowH);

            if (ri % 2 === 1) doc.rect(MARGIN_L, y, BODY_W, rowH).fill(STRIPE_BG);
            doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY);
            doc.text(row.area, MARGIN_L + 4, y + 4, { width: COL[0] - 8 });
            doc.text(row.whatWeDid, MARGIN_L + COL[0] + 4, y + 4, { width: COL[1] - 8 });
            doc.text(row.whatsNext, MARGIN_L + COL[0] + COL[1] + 4, y + 4, { width: COL[2] - 8 });
            y += rowH;
          }
          y += 10;
        }

        // ── Manual text (bullets) ─────────────────────────────
        if (item.manualText) {
          const lines = item.manualText.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            pageBreakIfNeeded(20);
            doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
              .text("●", MARGIN_L, y, { continued: false });
            doc.text(line, MARGIN_L + 14, y, { width: BODY_W - 14 });
            y = doc.y + 4;
          }
          y += 4;
        }
      }

      y += 10;
    }

    // ── Footer ────────────────────────────────────────────────
    pageBreakIfNeeded(30);
    doc.moveTo(MARGIN_L, y).lineTo(MARGIN_L + BODY_W, y)
      .lineWidth(0.5).strokeColor(LIGHT_GRAY).stroke();
    y += 6;
    doc.font("Helvetica").fontSize(8).fillColor(LIGHT_GRAY)
      .text(bwCfg.footerText, MARGIN_L, y, { width: BODY_W, align: "center" });

    doc.end();
  });
}
