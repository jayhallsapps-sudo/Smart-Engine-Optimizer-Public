import fs from "fs";
import path from "path";

const ACCENT = "#C0392B";
const NAVY   = "#1B3A6B";
const DARK   = "#1F2937";
const GRAY   = "#374151";
const MID    = "#6B7280";
const LIGHT  = "#F9FAFB";
const WHITE  = "#FFFFFF";
const BORDER = "#E5E7EB";
const ALT_ROW = "#F3F4F6";
const AM_BG  = "#FFFDFB";
const TOPIC_BG = "#FFFDFB";

const HEADER_IMG_B64 = (() => {
  const p = path.resolve(process.cwd(), "attached_assets/HEADER_IMAGE_1773063127856.png");
  if (fs.existsSync(p)) return fs.readFileSync(p).toString("base64");
  return "";
})();

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    color: ${DARK};
    background: white;
    -webkit-font-smoothing: antialiased;
  }
  .page { padding: 0; width: 794px; background: white; }
  .content { padding: 0 56px; }
  .sec-heading {
    display: flex;
    align-items: center;
    margin: 20px 0 10px;
    padding-bottom: 4px;
    border-bottom: 2.5px solid ${ACCENT};
  }
  .sec-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: ${ACCENT};
    color: white;
    font-size: 13px;
    font-weight: 700;
    margin-right: 10px;
    flex-shrink: 0;
  }
  .sec-title {
    font-size: 15px;
    font-weight: 700;
    color: ${ACCENT};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10px;
    margin-bottom: 12px;
  }
  th {
    padding: 6px 8px;
    background: ${ACCENT}15;
    color: ${ACCENT};
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1.5px solid ${ACCENT}30;
    text-align: left;
    word-break: break-word;
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #F3EDED;
    vertical-align: top;
    line-height: 1.4;
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  tr.alt td { background: #FBF8F7; }
  .insight-row td {
    background: #FFFBEB;
    border-left: 3px solid ${ACCENT}40;
    font-size: 9px;
    color: ${MID};
    padding: 4px 10px 6px 14px;
  }
  .insight-label { font-weight: 700; color: ${ACCENT}; margin-right: 4px; }
  .source-badge {
    display: inline-block;
    font-size: 8px;
    padding: 1px 5px;
    border-radius: 3px;
    background: ${ACCENT}18;
    color: ${ACCENT};
    font-weight: 600;
    margin-left: 4px;
  }
  .sub-label {
    font-size: 10px;
    font-weight: 700;
    color: ${GRAY};
    margin: 10px 0 5px;
    padding: 4px 0;
    border-bottom: 1px solid ${BORDER};
  }
  .tbl-wrap {
    border: 1px solid ${ACCENT}28;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
    background: ${TOPIC_BG};
  }
`;

function wrap(inner: string, extraPad = ""): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}${extraPad}</style></head><body><div class="page"><div class="content">${inner}</div></div></body></html>`;
}

function secHeading(num: number, title: string): string {
  return `<div class="sec-heading"><span class="sec-num">${num}</span><span class="sec-title">${escHtml(title)}</span></div>`;
}

function subLabel(text: string): string {
  return `<div class="sub-label">${escHtml(text)}</div>`;
}

function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function cell(v: string | null | undefined): string {
  return `<td>${escHtml(v)}</td>`;
}

function hdrCell(v: string): string {
  return `<th>${escHtml(v)}</th>`;
}

function tbodyRows(rows: string[][], alt = true): string {
  return rows.map((cols, ri) => {
    const cls = alt && ri % 2 === 1 ? " class=\"alt\"" : "";
    return `<tr${cls}>${cols.map(c => cell(c)).join("")}</tr>`;
  }).join("");
}

function table(headers: string[], rows: string[][], colWidths?: string[]): string {
  const colgroup = colWidths ? `<colgroup>${colWidths.map(w => `<col style="width:${w}">`).join("")}</colgroup>` : "";
  return `<div class="tbl-wrap"><table>${colgroup}<thead><tr>${headers.map(hdrCell).join("")}</tr></thead><tbody>${tbodyRows(rows)}</tbody></table></div>`;
}

export function renderCoverHtml(reportData: any): string {
  const meta = reportData.meta ?? {};
  const snap = reportData.sourceSnapshot ?? {};
  const inputs = snap.manualInputs ?? {};
  const amThoughts = inputs.amThoughts ?? inputs.hypothesis ?? "";
  const prevQtr = inputs.prevQtrAssessment ?? "";
  const clientNotes = inputs.clientNotes ?? "";
  const sentiment = inputs.clientSentiment ?? inputs.sentiment ?? "";

  const headerImg = HEADER_IMG_B64
    ? `<img src="data:image/png;base64,${HEADER_IMG_B64}" style="width:100%;display:block;" alt="Header">`
    : `<div style="height:143px;background:${NAVY};"></div>`;

  const metaGrid = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:10px;padding:12px 16px;background:${LIGHT};border-radius:4px;border:1px solid ${BORDER};margin-bottom:16px;">
      <div><strong>Domain:</strong> ${escHtml(meta.domain)}</div>
      <div><strong>Primary Location:</strong> ${escHtml(meta.primaryLocation)}</div>
      <div><strong>Program / Positioning:</strong> ${escHtml(meta.programPositioning)}</div>
      <div><strong>Analysis Window:</strong> ${escHtml(meta.analysisWindow)}</div>
      <div><strong>Planning Quarter:</strong> ${escHtml(meta.planningQuarter)}</div>
      <div><strong>Generated On:</strong> ${escHtml(meta.generatedOn ?? meta.generatedAt?.slice(0,10))}</div>
    </div>`;

  let amBlock = "";
  if (amThoughts || prevQtr || clientNotes || sentiment) {
    const fields = [
      amThoughts && `<div style="margin-bottom:6px"><span style="font-weight:700;color:${GRAY}">AM's Hypothesis: </span><span style="color:#4B5563;white-space:pre-wrap">${escHtml(amThoughts)}</span></div>`,
      prevQtr && `<div style="margin-bottom:6px"><span style="font-weight:700;color:${GRAY}">Previous Quarter Assessment: </span><span style="color:#4B5563;white-space:pre-wrap">${escHtml(prevQtr)}</span></div>`,
      clientNotes && `<div style="margin-bottom:6px"><span style="font-weight:700;color:${GRAY}">Client Insights: </span><span style="color:#4B5563;white-space:pre-wrap">${escHtml(clientNotes)}</span></div>`,
      sentiment && `<div><span style="font-weight:700;color:${GRAY}">Client Sentiment: </span><span style="color:#4B5563">${escHtml(sentiment)}</span></div>`,
    ].filter(Boolean).join("");
    amBlock = `
      <div style="border:1px solid ${ACCENT}28;border-radius:6px;padding:10px 14px;margin-bottom:20px;background:${AM_BG};font-size:10px;">
        <div style="font-weight:700;font-size:9px;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Account Manager Context</div>
        ${fields}
      </div>`;
  }

  const inner = `
    ${headerImg}
    <div style="padding:24px 56px 0">
      <div style="font-size:28px;font-weight:800;color:${ACCENT};margin-bottom:4px;">Quarterly Business Snapshot</div>
      <div style="font-size:14px;font-weight:600;color:${GRAY};margin-bottom:14px;">${escHtml(meta.site)}</div>
      ${metaGrid}
      ${amBlock}
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}* { box-sizing: border-box; }</style></head><body><div class="page">${inner}</div></body></html>`;
}

export function renderSection1Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const rows = (reportData.section1Goals?.rows ?? []).map((r: any, ri: number) => {
    const goalType = edits[`s1_${ri}_0`] ?? r.goalType ?? "";
    const goal = edits[`s1_${ri}_1`] ?? r.goal ?? "";
    const source = edits[`s1_${ri}_2`] ?? r.measurementSource ?? "";
    const shift = edits[`s1_${ri}_3`] ?? r.goalShift ?? "";
    const reason = edits[`s1_${ri}_4`] ?? r.reason ?? "";
    const shiftColor = shift.startsWith("+") ? "#16A34A" : shift.startsWith("-") ? "#DC2626" : GRAY;
    const shiftHtml = `<span style="font-weight:700;color:${shiftColor}">${escHtml(shift)}</span>`;
    return `<tr class="${ri % 2 === 1 ? "alt" : ""}">
      <td style="font-weight:600;color:${ACCENT}">${escHtml(goalType)}</td>
      <td style="font-weight:700">${escHtml(goal)}</td>
      <td>${escHtml(source)}</td>
      <td style="text-align:center">${shiftHtml}</td>
      <td>${escHtml(reason)}</td>
    </tr>`;
  }).join("");

  const inner = `
    ${secHeading(secNum, "What Matters Most This Quarter")}
    <div class="tbl-wrap"><table>
      <colgroup><col style="width:18%"><col style="width:22%"><col style="width:18%"><col style="width:14%"><col style="width:28%"></colgroup>
      <thead><tr>
        <th>Goal Type</th><th>Goal / NSM</th><th>Source</th><th style="text-align:center">Goal Shift vs Last Qtr</th><th>Reason</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrap(inner);
}

export function renderSection2Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const s2 = reportData.section2Conversions ?? {};
  const pages = (s2.topConvertingPages ?? []).map((r: any, ri: number) => [
    edits[`s2a_${ri}_0`] ?? r.type ?? "",
    edits[`s2a_${ri}_1`] ?? r.page ?? "",
    edits[`s2a_${ri}_2`] ?? r.conversionSource ?? "",
    edits[`s2a_${ri}_3`] ?? r.notes ?? "",
  ]);
  const patterns = (s2.topConversionPatterns ?? []).map((r: any, ri: number) => [
    edits[`s2c_${ri}_0`] ?? r.pattern ?? "",
    edits[`s2c_${ri}_1`] ?? r.whyItMatters ?? "",
    edits[`s2c_${ri}_2`] ?? r.evidence ?? "",
  ]);
  const sources = (s2.topConvertingSources ?? []).map((r: any, ri: number) => [
    edits[`s2b_${ri}_0`] ?? r.source ?? "",
    edits[`s2b_${ri}_1`] ?? r.whatsConverting ?? "",
    edits[`s2b_${ri}_2`] ?? r.notes ?? "",
  ]);

  const inner = `
    ${secHeading(secNum, "Where Conversions Actually Happen")}
    ${pages.length ? subLabel("Top Converting Pages") + table(["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"], pages, ["10%","28%","18%","44%"]) : ""}
    ${patterns.length ? subLabel("Top Conversion Patterns") + table(["Pattern", "Why It Matters", "Evidence"], patterns, ["30%","40%","30%"]) : ""}
    ${sources.length ? subLabel("Top Converting Sources") + table(["Source", "What's Converting", "Notes / What We're Learning"], sources, ["20%","35%","45%"]) : ""}`;

  return wrap(inner);
}

export function renderSection3Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const s3 = reportData.section3Traffic ?? {};
  const topicsHtml = (s3.topTrafficTopics ?? []).map((r: any, ri: number) => {
    const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
    const insight = edits[`s3a_${ri}_3`] ?? r.insight ?? "";
    const insightRow = insight ? `<tr><td colspan="3" style="background:#FFFBEB;border-left:3px solid ${ACCENT}40;padding:4px 10px 6px 14px;font-size:9px;color:${MID};"><span style="font-weight:700;color:${ACCENT}">Insight: </span>${escHtml(insight)}</td></tr>` : "";
    return `<tr style="background:${bg}">
      <td>${escHtml(edits[`s3a_${ri}_0`] ?? r.topic)}</td>
      <td>${escHtml(edits[`s3a_${ri}_1`] ?? r.exampleQueries)}</td>
      <td style="text-align:center">${escHtml(edits[`s3a_${ri}_2`] ?? r.connectionToAdmits)}</td>
    </tr>${insightRow}`;
  }).join("");

  const pagesHtml = (s3.topTrafficPages ?? []).map((r: any, ri: number) => {
    const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
    const insight = edits[`s3b_${ri}_4`] ?? r.insight ?? "";
    const insightRow = insight ? `<tr><td colspan="4" style="background:#FFFBEB;border-left:3px solid ${ACCENT}40;padding:4px 10px 6px 14px;font-size:9px;color:${MID};"><span style="font-weight:700;color:${ACCENT}">Insight: </span>${escHtml(insight)}</td></tr>` : "";
    return `<tr style="background:${bg}">
      <td style="font-weight:600">${escHtml(edits[`s3b_${ri}_0`] ?? r.page)}</td>
      <td style="text-align:center">${escHtml(edits[`s3b_${ri}_1`] ?? r.clicks)}</td>
      <td style="text-align:center">${escHtml(edits[`s3b_${ri}_2`] ?? r.ctr)}</td>
      <td style="text-align:center">${escHtml(edits[`s3b_${ri}_3`] ?? r.connectionToAdmits)}</td>
    </tr>${insightRow}`;
  }).join("");

  const inner = `
    ${secHeading(secNum, "Top Organic Traffic Drivers")}
    ${topicsHtml ? subLabel("Top Traffic Topics") + `<div class="tbl-wrap"><table>
      <colgroup><col style="width:30%"><col style="width:52%"><col style="width:18%"></colgroup>
      <thead><tr><th>Topic</th><th>Example Queries</th><th style="text-align:center">🔗 Admits</th></tr></thead>
      <tbody>${topicsHtml}</tbody></table></div>` : ""}
    ${pagesHtml ? subLabel("Top Traffic Pages") + `<div class="tbl-wrap"><table>
      <colgroup><col style="width:40%"><col style="width:15%"><col style="width:15%"><col style="width:30%"></colgroup>
      <thead><tr><th>Page</th><th style="text-align:center">Clicks</th><th style="text-align:center">CTR</th><th style="text-align:center">🔗 Admits</th></tr></thead>
      <tbody>${pagesHtml}</tbody></table></div>` : ""}`;

  return wrap(inner);
}

export function renderSection4Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const rows = (reportData.section4Services?.services ?? []).map((r: any, ri: number) => [
    edits[`s4_${ri}_0`] ?? r.service ?? "",
    edits[`s4_${ri}_1`] ?? r.examplePage ?? "",
  ]);
  const inner = `
    ${secHeading(secNum, "Site Service Overview")}
    ${rows.length ? table(["Service / Program", "Example Page"], rows, ["50%", "50%"]) : ""}`;
  return wrap(inner);
}

export function renderSection5Html(reportData: any, secNum: number): string {
  const s5 = reportData.section5Diagnosis ?? {};
  const tier = s5.tier ?? 1;
  const tierName = s5.tierName ?? "";
  const diagnosis = s5.diagnosis ?? "";

  const inner = `
    ${secHeading(secNum, "SEO Tier Diagnosis")}
    <div style="border:1px solid ${BORDER};border-radius:6px;overflow:hidden;margin-bottom:12px;">
      <div style="background:${DARK};padding:10px 16px;">
        <span style="color:${ACCENT};font-weight:700;font-size:12px;">Tier ${tier}</span>
        ${tierName ? `<span style="color:#9CA3AF;font-size:11px;margin-left:8px;">— ${escHtml(tierName)}</span>` : ""}
      </div>
      <div style="padding:12px 16px;font-size:10px;line-height:1.6;color:${GRAY};white-space:pre-wrap">${escHtml(diagnosis)}</div>
    </div>`;
  return wrap(inner);
}

export function renderSection6Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const priorities = reportData.section6Priorities?.priorities ?? [];

  const cards = priorities.map((r: any, ri: number) => {
    const num = edits[`s6_${ri}_0`] ?? String(r.priority ?? ri + 1);
    const initiative = edits[`s6_${ri}_1`] ?? r.initiative ?? "";
    const tier = edits[`s6_${ri}_2`] ?? r.tier ?? "";
    const action = edits[`s6_${ri}_3`] ?? r.action ?? "";
    const reason = edits[`s6_${ri}_4`] ?? r.reason ?? "";
    const source = r.source ?? "";

    return `
      <div style="border:1px solid ${BORDER};border-radius:6px;overflow:hidden;margin-bottom:10px;">
        <div style="display:flex;background:${DARK};">
          <div style="background:${ACCENT};width:40px;min-width:40px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:white;">${escHtml(num)}</div>
          <div style="padding:8px 12px;flex:1;">
            <div style="color:white;font-weight:700;font-size:12px;">${escHtml(initiative)}</div>
            ${tier ? `<div style="color:#9CA3AF;font-size:10px;margin-top:2px;">${escHtml(tier)}</div>` : ""}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;font-size:10px;">
          <div style="padding:8px 12px;border-right:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
            <div style="color:${ACCENT};font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Action</div>
            <div style="color:${GRAY};white-space:pre-wrap">${escHtml(action)}</div>
          </div>
          <div style="padding:8px 12px;border-bottom:1px solid ${BORDER};">
            <div style="color:${ACCENT};font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Why This Quarter</div>
            <div style="color:${GRAY};white-space:pre-wrap">${escHtml(reason)}</div>
          </div>
        </div>
        ${source ? `<div style="padding:4px 12px 6px;font-size:9px;color:${MID};background:${LIGHT};">Source: ${escHtml(source)}</div>` : ""}
      </div>`;
  }).join("");

  const inner = `
    ${secHeading(secNum, "What We Need to Do Next")}
    ${cards}`;
  return wrap(inner);
}

export function renderSection7Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const s7 = reportData.section7Tracking ?? {};
  const rows = (s7.tracking ?? []).map((r: any, ri: number) => [
    edits[`s7_${ri}_0`] ?? r.focusArea ?? "",
    edits[`s7_${ri}_1`] ?? r.metric ?? "",
    edits[`s7_${ri}_2`] ?? r.source ?? "",
    edits[`s7_${ri}_4`] ?? r.whyItMatters ?? "",
  ]);

  const inner = `
    ${secHeading(secNum, "What We Track")}
    ${rows.length ? table(["Focus Area", "Metric", "Source", "Why It Matters"], rows, ["20%","25%","20%","35%"]) : ""}`;
  return wrap(inner);
}

export function renderSection8Html(reportData: any, secNum: number, edits: Record<string,string> = {}): string {
  const opps = reportData.additionalOpportunities ?? [];

  const cards = opps.map((o: any, i: number) => {
    const titleVal = edits[`opp_${i}_title`] ?? o.title ?? "";
    const whyNow = edits[`opp_${i}_why_now`] ?? o.why_now ?? "";
    const rec = edits[`opp_${i}_recommendation`] ?? o.recommendation ?? "";
    const framing = edits[`opp_${i}_framing`] ?? o.framing ?? "";
    const evidences = (o.evidence ?? []).map((ev: string, j: number) => edits[`opp_${i}_evidence_${j}`] ?? ev);
    const typeLabel = o.type === "upsell" ? "Upsell" : "Cross-sell";
    const typeColor = o.type === "upsell" ? "#D97706" : "#2563EB";
    const typeBg = o.type === "upsell" ? "#FEF3C7" : "#DBEAFE";

    return `
      <div style="border:1px solid ${BORDER};border-radius:6px;overflow:hidden;margin-bottom:12px;">
        <div style="display:flex;align-items:center;background:${DARK};padding:8px 14px;gap:10px;">
          <span style="background:${typeBg};color:${typeColor};font-size:8px;font-weight:700;padding:2px 7px;border-radius:3px;text-transform:uppercase;letter-spacing:0.06em;">${typeLabel}</span>
          <span style="color:white;font-weight:700;font-size:12px;">${escHtml(titleVal)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;font-size:10px;">
          <div style="padding:10px 14px;border-right:1px solid ${BORDER};">
            <div style="color:${ACCENT};font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Why Now</div>
            <div style="color:${GRAY};white-space:pre-wrap;margin-bottom:8px;">${escHtml(whyNow)}</div>
            ${evidences.length ? `<div style="color:${ACCENT};font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Evidence</div>
            <ul style="padding-left:14px;color:${GRAY};">${evidences.map((ev: string) => `<li style="margin-bottom:2px;">${escHtml(ev)}</li>`).join("")}</ul>` : ""}
          </div>
          <div style="padding:10px 14px;">
            <div style="color:${ACCENT};font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Recommendation</div>
            <div style="color:${GRAY};white-space:pre-wrap;margin-bottom:8px;">${escHtml(rec)}</div>
            ${framing ? `<div style="color:${MID};font-style:italic;font-size:9px;margin-top:6px;padding-top:6px;border-top:1px solid ${BORDER};">${escHtml(framing)}</div>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");

  const inner = `
    ${secHeading(secNum, "Additional Opportunities")}
    ${cards}`;
  return wrap(inner);
}

export function renderFooterHtml(): string {
  return `
    <div style="border-top:2px solid ${ACCENT};padding:10px 56px;margin-top:20px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:${MID};">
      <span style="font-weight:700;color:${NAVY};">Webserv</span>
      <span>32 Discovery Suite 130, Irvine, CA 92618</span>
      <span style="color:${ACCENT};">webserv.io</span>
    </div>`;
}
