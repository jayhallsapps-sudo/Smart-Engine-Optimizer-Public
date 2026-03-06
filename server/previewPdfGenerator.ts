import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const ACCENT = "#C0392B";
const TEXT_COLOR = "#111827";
const DARK_GRAY = "#374151";
const GRAY = "#6B7280";
const STRIPE = "#F9FAFB";
const DATE_PILL_BG = "#E8EAED";
const BORDER_LIGHT = "#E5E7EB";
const ROW_SEP = "#F3F4F6";
const TINT_BG = "#FDF2F0";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const BODY_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 34;
const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  Airtable:         { bg: "#FFF3D6", text: "#B45309" },
  Asana:            { bg: "#FDEAEA", text: "#C0392B" },
  "Screaming Frog": { bg: "#E6F4EA", text: "#1E7E34" },
  GA4:              { bg: "#E8F0FE", text: "#1967D2" },
  GSC:              { bg: "#E6F4EA", text: "#137333" },
  CallRail:         { bg: "#F3E8FF", text: "#6D28D9" },
  NSM:              { bg: "#EEF2FF", text: "#4338CA" },
};

function san(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\u274C/g, "X").replace(/\u2705/g, "OK")
    .replace(/\u25CF/g, "\u2022").replace(/\u25B2/g, "+").replace(/\u25BC/g, "-");
}

function drawBadge(doc: any, source: string, x: number, y: number): number {
  const sc = SOURCE_COLORS[source] ?? { bg: "#F3F4F6", text: "#6B7280" };
  doc.font("Helvetica").fontSize(6.5);
  const tw = doc.widthOfString(source);
  const bw = tw + 8;
  const bh = 10;
  doc.save();
  doc.roundedRect(x, y, bw, bh, 2).fill(sc.bg);
  doc.fillColor(sc.text).text(source, x + 4, y + 1.5, { lineBreak: false });
  doc.restore();
  return bw;
}

interface BulletItem { text: string; url?: string; source?: string }

function renderBulletItems(
  doc: any, items: BulletItem[], x: number, startY: number, width: number
): number {
  let cy = startY;
  for (const item of items) {
    const txt = san(item.text);
    if (!txt) continue;
    doc.font("Helvetica").fontSize(8.5).fillColor(DARK_GRAY)
      .text("\u2022  " + txt, x, cy, { width });
    cy = doc.y + 1;
    if (item.source) {
      drawBadge(doc, item.source, x + 8, cy);
      cy += 12;
    }
  }
  return cy;
}

function measureBulletItems(
  doc: any, items: BulletItem[], width: number
): number {
  let h = 0;
  doc.font("Helvetica").fontSize(8.5);
  for (const item of items) {
    const txt = san(item.text);
    if (!txt) continue;
    h += doc.heightOfString("\u2022  " + txt, { width }) + 1;
    if (item.source) h += 12;
  }
  return Math.max(h, 14);
}

function drawTableBorder(doc: any, x: number, y: number, w: number, h: number) {
  doc.save();
  doc.roundedRect(x, y, w, h, 4)
    .lineWidth(1).strokeOpacity(0.35).strokeColor(ACCENT).stroke();
  doc.strokeOpacity(1);
  doc.restore();
}

export async function generateBiweeklyPreviewPdf(
  report: any,
  edits: Record<string, string> = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headerPath = path.join(process.cwd(), "server", "assets", "biweekly_header.png");
    const headerImg = fs.existsSync(headerPath) ? fs.readFileSync(headerPath) : null;
    const headerH = headerImg ? Math.round((143 / 692) * PAGE_W) : 80;

    let y = 0;
    let pageCount = 0;

    function startPage() {
      if (pageCount > 0) doc.addPage();
      pageCount++;
      if (headerImg) {
        doc.image(headerImg, 0, 0, { width: PAGE_W });
        y = headerH + 12;
      } else {
        doc.rect(0, 0, PAGE_W, 80).fill(ACCENT);
        doc.font("Helvetica-Bold").fontSize(22).fillColor("#FFFFFF")
          .text("W", PAGE_W - 56, 22, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor("white")
          .text("WEBSERV", PAGE_W - 74, 46, { lineBreak: false });
        y = 90;
      }
    }

    function drawFooter() {
      doc.moveTo(MARGIN, FOOTER_Y).lineTo(MARGIN + BODY_W, FOOTER_Y)
        .lineWidth(0.5).strokeColor(GRAY).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(GRAY)
        .text(FOOTER_TEXT, MARGIN, FOOTER_Y + 5, { width: BODY_W, align: "center", lineBreak: false });
    }

    function checkPage(needed: number) {
      if (y + needed > FOOTER_Y - 12) {
        drawFooter();
        startPage();
      }
    }

    function get(key: string, fallback: string): string {
      return san(edits[key] ?? fallback ?? "");
    }

    startPage();

    const clientName = get("client_name", report.client_name);
    const reportTitle = get("report_title", report.report_title);
    const date = get("report_date", report.date);
    const preparedBy = get("preparedBy", report.preparedBy);
    const reportingWindow = san(report.reportingWindow || "");

    doc.font("Helvetica-Bold").fontSize(16).fillColor(TEXT_COLOR)
      .text(`${reportTitle}: ${clientName}`, MARGIN, y, { width: BODY_W });
    y = doc.y + 4;

    if (reportingWindow) {
      doc.font("Helvetica").fontSize(10).fillColor(GRAY)
        .text(`Reporting Period: ${reportingWindow}`, MARGIN, y, { width: BODY_W });
      y = doc.y + 4;
    }

    if (preparedBy) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_COLOR)
        .text("Prepared by: ", MARGIN, y, { width: BODY_W, continued: true });
      doc.font("Helvetica").fillColor(TEXT_COLOR).text(preparedBy);
      y = doc.y + 4;
    }

    const pillW = 180;
    const pillH = 16;
    doc.roundedRect(MARGIN, y, pillW, pillH, 3).fill(DATE_PILL_BG);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK_GRAY)
      .text("Reporting Date: ", MARGIN + 8, y + 3.5, { continued: true, lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(DARK_GRAY)
      .text(date, { lineBreak: false });
    y += pillH + 20;

    const sections = report.sections || [];
    let secNum = 0;

    function drawHeading(title: string) {
      checkPage(36);
      secNum++;
      doc.font("Helvetica-Bold").fontSize(13).fillColor(ACCENT)
        .text(`${secNum}. ${san(title)}`, MARGIN, y, { width: BODY_W });
      const bottom = doc.y + 2;
      doc.moveTo(MARGIN, bottom).lineTo(MARGIN + BODY_W, bottom)
        .lineWidth(1.5).strokeColor(ACCENT).stroke();
      y = bottom + 10;
    }

    const SUB_H = 22;
    const TH_H = 18;
    const DATA_ROW_H = 22;
    const NOTE_H = 22;

    for (const section of sections) {
      if (section.id === "bw_purpose") {
        drawHeading(section.title || "Purpose");
        const text = get("bw_purpose_bullet_0", section.bullets?.[0] || "");
        doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
          .text(text, MARGIN, y, { width: BODY_W });
        y = doc.y + 18;
        continue;
      }

      if (section.id === "bw_pulse") {
        drawHeading(section.title || "Performance Pulse");
        const metrics = section.metrics || [];
        const gm = (label: string) => metrics.find((m: any) => m.label === label)?.current ?? "\u2014";

        const quarter = gm("NSM Quarter");
        const sessGoal = gm("NSM Sessions Goal");
        const sessActual = gm("NSM Sessions Actual");
        const sessPct = gm("NSM Sessions %");
        const sessTrack = san(gm("NSM Sessions On Track"));

        const mvpM = metrics.find((m: any) => /NSM MVP .* Goal/.test(m.label));
        const mvpLabel = mvpM?.label.replace(" Goal", "") ?? "NSM MVP";
        const mvpGoal = mvpM?.current ?? "\u2014";
        const mvpActual = gm(mvpLabel + " Actual");
        const mvpPct = gm(mvpLabel + " %");
        const mvpTrack = san(gm(mvpLabel + " On Track"));
        const mvpShort = san(mvpLabel.replace("NSM ", ""));

        const hasNsm = quarter !== "\u2014";
        if (hasNsm) {
          const totalH = SUB_H + TH_H + DATA_ROW_H * 2 + NOTE_H;
          checkPage(totalH + 10);

          const bx = MARGIN;
          const bw = BODY_W;
          const boxTopY = y;

          doc.rect(bx + 0.5, y + 0.5, bw - 1, SUB_H).fill(TINT_BG);
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor(ACCENT)
            .text(`NSM Goals \u2014 ${quarter}`, bx + 12, y + 5, { lineBreak: false });
          y += SUB_H;

          doc.rect(bx, y, bw, TH_H).fill(STRIPE);
          doc.moveTo(bx, y + TH_H).lineTo(bx + bw, y + TH_H).lineWidth(0.5).strokeColor(BORDER_LIGHT).stroke();

          const cols = [bw * 0.40, bw * 0.15, bw * 0.15, bw * 0.12, bw * 0.18];
          const hdrs = ["Metric", "Goal", "Actual", "%", "Status"];
          let cx = bx;
          hdrs.forEach((h, i) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY)
              .text(h, cx + 8, y + 5, { width: cols[i] - 14, align: i === 0 ? "left" : "right", lineBreak: false });
            cx += cols[i];
          });
          y += TH_H;

          function nsmRow(label: string, goal: string, actual: string, pct: string, status: string, last: boolean) {
            doc.rect(bx, y, bw, DATA_ROW_H).fill("white");
            if (!last) {
              doc.moveTo(bx, y + DATA_ROW_H).lineTo(bx + bw, y + DATA_ROW_H).lineWidth(0.5).strokeColor(ROW_SEP).stroke();
            }
            let cx = bx;
            doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXT_COLOR)
              .text(label, cx + 10, y + 6, { width: cols[0] - 16, lineBreak: false });
            cx += cols[0];
            [goal, actual, pct, status].forEach((v, i) => {
              doc.font("Helvetica").fontSize(9).fillColor(DARK_GRAY)
                .text(v, cx + 4, y + 6, { width: cols[i + 1] - 12, align: "right", lineBreak: false });
              cx += cols[i + 1];
            });
            y += DATA_ROW_H;
          }

          nsmRow("Organic Sessions", sessGoal, sessActual, sessPct, sessTrack, false);
          nsmRow(mvpShort, mvpGoal, mvpActual, mvpPct, mvpTrack, true);

          doc.rect(bx, y, bw, NOTE_H).fill("white");
          doc.moveTo(bx, y).lineTo(bx + bw, y).lineWidth(0.5).strokeColor(ROW_SEP).stroke();
          const notes = get("bw_nsm_notes", "Add notes on NSM progress...");
          doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#9CA3AF")
            .text(notes, bx + 12, y + 6, { width: bw - 24, lineBreak: false });
          y += NOTE_H;

          drawTableBorder(doc, bx, boxTopY, bw, y - boxTopY);
          y += 18;
        }
        continue;
      }

      if (section.id === "bw_progress") {
        drawHeading(section.title || "Progress & Quick Wins");

        const workLog: any[] = section.workLog || [];
        if (workLog.length === 0) { y += 8; continue; }

        const COL_AREA = Math.round(BODY_W * 0.15);
        const COL_DID  = Math.round(BODY_W * 0.42);
        const COL_NEXT = BODY_W - COL_AREA - COL_DID;
        const COLS = [COL_AREA, COL_DID, COL_NEXT];
        const HDRS = ["Area", "What We Did / Learned", "What\u2019s Next"];

        checkPage(60);

        const tableTopY = y;

        doc.rect(MARGIN + 0.5, y + 0.5, BODY_W - 1, SUB_H).fill(TINT_BG);
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(ACCENT)
          .text("Progress & Quick Wins", MARGIN + 12, y + 5, { lineBreak: false });
        y += SUB_H;

        doc.rect(MARGIN, y, BODY_W, TH_H).fill(STRIPE);
        doc.moveTo(MARGIN, y + TH_H).lineTo(MARGIN + BODY_W, y + TH_H).lineWidth(0.5).strokeColor(BORDER_LIGHT).stroke();

        let hx = MARGIN;
        HDRS.forEach((h, i) => {
          if (i > 0) {
            doc.moveTo(hx, y).lineTo(hx, y + TH_H).lineWidth(0.5).strokeColor(BORDER_LIGHT).stroke();
          }
          doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY)
            .text(h, hx + 8, y + 5, { width: COLS[i] - 14, lineBreak: false });
          hx += COLS[i];
        });
        y += TH_H;

        for (let ri = 0; ri < workLog.length; ri++) {
          const row = workLog[ri];
          const editedDid = edits[`bw_progress_worklog_${ri}_did`];
          const editedNext = edits[`bw_progress_worklog_${ri}_next`];

          const didItems: BulletItem[] = editedDid !== undefined
            ? editedDid.split("\n").filter(Boolean).map(t => ({ text: t.trim() }))
            : (row.items || row.whatWeDid?.split("\n").filter(Boolean).map((t: string) => ({ text: t.trim() })) || []);

          const nextItems: BulletItem[] = editedNext !== undefined
            ? editedNext.split("\n").filter(Boolean).map(t => ({ text: t.trim() }))
            : (row.nextItemsRich || row.nextItems?.map((t: any) => (typeof t === "string" ? { text: t } : t)) || row.whatsNext?.split("\n").filter(Boolean).map((t: string) => ({ text: t.trim() })) || []);

          const cellW_did = COLS[1] - 16;
          const cellW_next = COLS[2] - 16;

          const hArea = (() => { doc.font("Helvetica-Bold").fontSize(8.5); return doc.heightOfString(row.area || "\u2014", { width: COLS[0] - 14 }); })();
          const hDid = measureBulletItems(doc, didItems, cellW_did);
          const hNext = measureBulletItems(doc, nextItems, cellW_next);

          const rowH = Math.max(hArea, hDid, hNext) + 10;

          checkPage(rowH + 4);

          if (ri % 2 === 1) {
            doc.rect(MARGIN, y, BODY_W, rowH).fill(STRIPE);
          }

          doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + BODY_W, y + rowH).lineWidth(0.5).strokeColor(ROW_SEP).stroke();

          let cx = MARGIN;
          for (let ci = 1; ci < 3; ci++) {
            cx += COLS[ci - 1];
            doc.moveTo(cx, y).lineTo(cx, y + rowH).lineWidth(0.5).strokeColor(BORDER_LIGHT).stroke();
          }

          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT_COLOR)
            .text(row.area || "\u2014", MARGIN + 8, y + 5, { width: COLS[0] - 14 });

          renderBulletItems(doc, didItems, MARGIN + COLS[0] + 8, y + 5, cellW_did);
          renderBulletItems(doc, nextItems, MARGIN + COLS[0] + COLS[1] + 8, y + 5, cellW_next);

          y += rowH;
        }

        drawTableBorder(doc, MARGIN, tableTopY, BODY_W, y - tableTopY);

        y += 18;
        continue;
      }

      drawHeading(section.title || "");

      if (section.bullets) {
        for (let bi = 0; bi < section.bullets.length; bi++) {
          checkPage(24);
          const text = get(`${section.id}_bullet_${bi}`, section.bullets[bi]);
          doc.font("Helvetica").fontSize(10).fillColor(ACCENT)
            .text("\u2022  ", MARGIN, y, { width: BODY_W, continued: true });
          doc.font("Helvetica").fontSize(10).fillColor(DARK_GRAY)
            .text(text);
          y = doc.y + 5;
        }
        y += 10;
      }

      if (section.type === "technical" && section.technicalTable) {
        const tbl = section.technicalTable;
        checkPage(40);
        const colCount = tbl.headers.length;
        const colW = Math.floor(BODY_W / colCount);

        doc.rect(MARGIN, y, BODY_W, 18).fill(TEXT_COLOR);
        tbl.headers.forEach((h: string, hi: number) => {
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
            .text(san(h), MARGIN + hi * colW + 6, y + 4.5, { width: colW - 12, lineBreak: false });
        });
        y += 18;

        for (let ri = 0; ri < tbl.rows.length; ri++) {
          checkPage(16);
          if (ri % 2 === 1) doc.rect(MARGIN, y, BODY_W, 16).fill("#F0F4FA");
          tbl.rows[ri].forEach((cell: string, ci: number) => {
            const val = get(`${section.id}_tech_${ri}_${ci}`, cell);
            doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY)
              .text(val, MARGIN + ci * colW + 6, y + 3.5, { width: colW - 12, lineBreak: false });
          });
          y += 16;
        }
        y += 12;
      }

      if (section.table) {
        const tbl = section.table;
        checkPage(40);
        const colCount = tbl.headers.length;
        const colW = Math.floor(BODY_W / colCount);

        doc.rect(MARGIN, y, BODY_W, 18).fill(TEXT_COLOR);
        tbl.headers.forEach((h: string, hi: number) => {
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
            .text(san(h), MARGIN + hi * colW + 6, y + 4.5, { width: colW - 12, lineBreak: false });
        });
        y += 18;

        for (let ri = 0; ri < tbl.rows.length; ri++) {
          checkPage(16);
          if (ri % 2 === 1) doc.rect(MARGIN, y, BODY_W, 16).fill("#F0F4FA");
          tbl.rows[ri].forEach((cell: any, ci: number) => {
            doc.font("Helvetica").fontSize(8).fillColor(DARK_GRAY)
              .text(String(cell), MARGIN + ci * colW + 6, y + 3.5, { width: colW - 12, lineBreak: false });
          });
          y += 16;
        }
        y += 12;
      }
    }

    drawFooter();
    doc.end();
  });
}
