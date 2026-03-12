import React, { useEffect, useState } from "react";
import type { ReactNode } from "react";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";
import { ReportTable, SourceBadge, getCustomRows } from "../components/report-preview/report-table";

const ACCENT = "#C0392B";
const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

const PRINT_SECTION_DEFS = [
  { key: "section_goals" }, { key: "section_conversions" }, { key: "section_traffic" },
  { key: "section_services" }, { key: "section_diagnosis" }, { key: "section_priorities" },
  { key: "section_keywords" }, { key: "section_tracking" }, { key: "section_opportunities" },
];
const PRINT_SECTION_TABLES: Record<string, string[]> = {
  section_conversions: ["table_s2_pages", "table_s2_patterns", "table_s2_sources"],
  section_traffic: ["table_s3_topics", "table_s3_pages"],
  section_services: ["table_s4_services"],
  section_priorities: ["table_s6"],
  section_tracking: ["table_s8"],
};
function printSecAutoHidden(k: string, ht: Record<string, boolean>) {
  const tbls = PRINT_SECTION_TABLES[k];
  return !!(tbls && tbls.length > 0 && tbls.every(t => ht[t]));
}
function computePrintSecNums(hs: Record<string, boolean>, ht: Record<string, boolean>, hasOpps: boolean, hasKeywords: boolean) {
  const out: Record<string, number> = {};
  let n = 1;
  for (const { key } of PRINT_SECTION_DEFS) {
    if (key === "section_opportunities" && !hasOpps) continue;
    if (key === "section_keywords" && !hasKeywords) continue;
    if (hs[key] || printSecAutoHidden(key, ht)) continue;
    out[key] = n++;
  }
  return out;
}

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div style={{ color: ACCENT, fontWeight: 700, fontSize: "14px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: 5, marginBottom: 14, marginTop: num > 1 ? 36 : 0 }}>
      {num}. {title}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const nodeRows: ReactNode[][] = rows.map(row =>
    row.map((cell: string) =>
      cell?.includes("Manual entry needed") ? (
        <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>{cell}</span>
      ) : cell
    )
  );
  return <ReportTable headers={headers} rows={nodeRows} />;
}

function cell(val: string): ReactNode {
  return val?.includes("Manual entry needed")
    ? <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>{val}</span>
    : val;
}

function badgeCell(val: string, dataSource?: string): ReactNode {
  if (!dataSource) return cell(val);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {cell(val)}
      <SourceBadge source={dataSource} />
    </span>
  );
}

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

function printIsPathLike(v: string): boolean {
  const t = (v ?? "").trim();
  return /^\/[a-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*/i.test(t) || /^https?:\/\//i.test(t);
}

function PrintPathTag({ value }: { value: string }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: "9px", fontWeight: 500, backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, color: "#374151", wordBreak: "break-all" }}>
      {value}
    </span>
  );
}

const PRINT_TIER_COLORS: Record<string, { bg: string; color: string }> = {
  "1": { bg: "#FEE2E2", color: "#991B1B" },
  "2": { bg: "#FEF3C7", color: "#92400E" },
  "3": { bg: "#DBEAFE", color: "#1E40AF" },
};
function PrintTierBadge({ tier }: { tier: string }) {
  const t = (tier ?? "").replace(/[^0-9]/g, "");
  const colors = PRINT_TIER_COLORS[t] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: colors.bg, color: colors.color, whiteSpace: "nowrap" }}>
      {tier || "—"}
    </span>
  );
}

function SubLabel({ text, sources }: { text: string; sources?: string[] }) {
  return (
    <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 8, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
      {text}
      {sources?.map((src, i) => <SourceBadge key={i} source={src} />)}
    </div>
  );
}

function PrintSeoScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#065F46" : score >= 6 ? "#92400E" : score >= 4 ? "#B45309" : "#991B1B";
  const bg = score >= 8 ? "#D1FAE5" : score >= 6 ? "#FEF3C7" : score >= 4 ? "#FEF3C7" : "#FEE2E2";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 7px", borderRadius: 10, backgroundColor: bg, color, fontWeight: 700, fontSize: "10px" }}>
      {score}/10
    </span>
  );
}

function PrintActionTypeBadge({ value }: { value: string }) {
  const COLOR_MAP: Record<string, [string, string]> = {
    "Technical SEO": ["#374151", "#F3F4F6"],
    "Tracking / Analytics": ["#1E40AF", "#DBEAFE"],
    "CRO": ["#9A3412", "#FFEDD5"],
    "Content": ["#5B21B6", "#EDE9FE"],
    "IA / Architecture": ["#1E3A5F", "#DBEAFE"],
    "Local SEO": ["#065F46", "#D1FAE5"],
    "Internal Linking": ["#0F766E", "#CCFBF1"],
    "Link Building": ["#991B1B", "#FEE2E2"],
  };
  const [color, bg] = COLOR_MAP[value] ?? ["#374151", "#F3F4F6"];
  if (!value) return null;
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 10, backgroundColor: bg, color, fontWeight: 600, fontSize: "9px", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

interface PrintTierScorecardEntryProps {
  tierNumber: number;
  tierName: string;
  status: string;
  findings: string;
  inferences: string;
  whyItMatters: string;
  source: string;
}

function PrintTierScorecardCard({ entry }: { entry: PrintTierScorecardEntryProps }) {
  const STATUS_MAP: Record<string, [string, string]> = {
    "Pass": ["#065F46", "#D1FAE5"],
    "Partial": ["#92400E", "#FEF3C7"],
    "Blocked": ["#991B1B", "#FEE2E2"],
    "Unknown": ["#374151", "#F3F4F6"],
  };
  const [sColor, sBg] = STATUS_MAP[entry.status] ?? ["#374151", "#F3F4F6"];
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, marginBottom: 8, overflow: "hidden", breakInside: "avoid" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <span style={{ fontWeight: 700, fontSize: "10px", color: ACCENT }}>Tier {entry.tierNumber} — {entry.tierName}</span>
        <span style={{ marginLeft: "auto", padding: "1px 7px", borderRadius: 10, backgroundColor: sBg, color: sColor, fontWeight: 700, fontSize: "9px" }}>{entry.status}</span>
      </div>
      <div style={{ padding: "8px 12px", fontSize: "9.5px", lineHeight: 1.55 }}>
        <div style={{ marginBottom: 4 }}><span style={{ fontWeight: 600, color: "#374151" }}>Findings: </span><span style={{ color: "#4B5563" }}>{entry.findings}</span></div>
        <div style={{ marginBottom: 4 }}><span style={{ fontWeight: 600, color: "#374151" }}>Inference: </span><span style={{ color: "#4B5563" }}>{entry.inferences}</span></div>
        <div style={{ marginBottom: 4 }}><span style={{ fontWeight: 600, color: "#374151" }}>Why It Matters: </span><span style={{ color: "#6B7280" }}>{entry.whyItMatters}</span></div>
        <div style={{ color: "#9CA3AF", fontSize: "9px" }}>Source: {entry.source}</div>
      </div>
    </div>
  );
}

function parseS7Sources(source: string): string[] {
  return source.split(" + ").map(s => {
    if (s === "Google Search Console") return "GSC";
    if (s === "Call Tracking") return "CallRail";
    return s;
  });
}

function applyEdits(value: string, key: string, edits: Record<string, string>): string {
  return edits[key] ?? value;
}

function customRowsAsNodes(
  edits: Record<string, string>,
  tableId: string,
): ReactNode[][] {
  const rows = getCustomRows(edits, tableId);
  return rows.map(row => row.map(c => c as ReactNode));
}

export default function QbrPrepPrint() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch("/api/auth/bootstrap")
      .then(r => r.json())
      .then(({ token: authToken }: { token: string }) =>
        fetch(`/api/print-cache/${token}`, { headers: { "X-Internal-Token": authToken } })
      )
      .then(r => { if (!r.ok) throw new Error(`Cache fetch failed: ${r.status}`); return r.json(); })
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32 }}>Loading…</div>;

  const { reportData, edits = {}, hiddenSections = {}, hiddenTables = {} } = data;
  const meta = reportData.meta ?? {};
  const s1 = reportData.section1Goals ?? { rows: [] };
  const s2 = reportData.section2Conversions ?? { topConvertingPages: [], topConvertingSources: [] };
  const s3 = reportData.section3Traffic ?? { topTrafficTopics: [], topTrafficPages: [] };
  const s4 = reportData.section4Services ?? { services: [] };
  const s5 = reportData.section5Diagnosis ?? { tier: 0, tierName: "", diagnosis: "" };
  const s6 = reportData.section6Priorities ?? { priorities: [] };
  const s7 = reportData.section7Tracking ?? { tracking: [] };
  const genMeta = reportData.generationMeta;
  const amPrint = reportData.sourceSnapshot?.manualInputs ?? {};

  const _autoOpps: any[] = reportData.additionalOpportunities ?? [];
  const _hasOpps = _autoOpps.length > 0;
  const sectionSuggestedKeywords = reportData.sectionSuggestedKeywords;
  const _hasKeywords = (sectionSuggestedKeywords?.rows?.length ?? 0) > 0;
  const secNums = computePrintSecNums(hiddenSections, hiddenTables, _hasOpps, _hasKeywords);
  const secVis = (k: string) => secNums[k] !== undefined;
  const tblVis = (k: string) => !hiddenTables[k];

  const e = (key: string, val: string) => applyEdits(val, key, edits);

  const s7Tracking = s7.tracking ?? [];
  for (let ri = 0; ri < s7Tracking.length; ri++) {
    const hasStatus = s7Tracking[ri]?.status;
    if (!hasStatus && edits[`s7_${ri}_3`] && !edits[`s7_${ri}_4`]) {
      edits[`s7_${ri}_4`] = edits[`s7_${ri}_3`];
      delete edits[`s7_${ri}_3`];
    }
  }

  const s1Rows: ReactNode[][] = [
    ...s1.rows.map((r: any, ri: number) => {
      const gs = e(`s1_${ri}_3`, r.goalShift);
      const src = edits[`s1_${ri}_2`] ?? r.measurementSource;
      return [
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {cell(e(`s1_${ri}_0`, r.goalType))}
          {src && src !== "—" && (
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
              {src.split(/[,+]/).map((s: string, si: number) => (
                <SourceBadge key={si} source={s.trim()} />
              ))}
            </span>
          )}
        </span>,
        cell(e(`s1_${ri}_1`, r.goal)),
        gs === "0%" ? "Par" : gs,
        cell(e(`s1_${ri}_4`, r.reason)),
      ];
    }),
    ...customRowsAsNodes(edits, "s1"),
  ];

  // Source-label switching — compute before row builders
  const s2aSharedSource = computeSharedSource((s2.topConvertingPages ?? []).map((r: any) => r.dataSource));
  const s6SharedSource  = computeSharedSource((s6.priorities ?? []).map((r: any) => r.source));
  const s7TrackingSharedSource = computeSharedSource((s7.tracking ?? []).map((r: any) => r.source));
  const kwSharedSource  = computeSharedSourceList((sectionSuggestedKeywords?.rows ?? []).map((r: any) => r.sources ?? []));

  const s2aRows: ReactNode[][] = [
    ...s2.topConvertingPages.map((r: any, ri: number) => {
      const pageVal = e(`s2a_${ri}_1`, r.page);
      return [
        badgeCell(e(`s2a_${ri}_0`, r.type), s2aSharedSource ? undefined : r.dataSource),
        printIsPathLike(pageVal) ? <PrintPathTag value={pageVal} /> : cell(pageVal),
        cell(e(`s2a_${ri}_2`, r.notes)),
      ];
    }),
    ...customRowsAsNodes(edits, "s2a"),
  ];

  const s2cRows: ReactNode[][] = [
    ...(s2.topConversionPatterns ?? []).map((r: any, ri: number) => [
      cell(e(`s2c_${ri}_0`, r.pattern)),
      cell(e(`s2c_${ri}_1`, r.whyItMatters)),
      cell(e(`s2c_${ri}_2`, r.evidence)),
    ]),
    ...customRowsAsNodes(edits, "s2c"),
  ];

  const s2bRows: ReactNode[][] = [
    ...s2.topConvertingSources.map((r: any, ri: number) => [
      badgeCell(e(`s2b_${ri}_0`, r.source), r.dataSource),
      cell(e(`s2b_${ri}_1`, r.whatsConverting)),
      cell(e(`s2b_${ri}_2`, r.notes)),
    ]),
    ...customRowsAsNodes(edits, "s2b"),
  ];

  const hasTopicDeltas = s3.topTrafficTopics.some((r: any) => r.queryCount != null);
  const topicColCount = hasTopicDeltas ? 7 : 3;

  const hasPageDeltas = s3.topTrafficPages.some((r: any) => r.clicksDelta || r.impressions || r.queries);
  const pageColCount = hasPageDeltas ? 9 : 4;

  const s4Rows: ReactNode[][] = [
    ...s4.services.map((r: any, ri: number) => {
      const epVal = e(`s4_${ri}_1`, r.examplePage);
      return [
        cell(e(`s4_${ri}_0`, r.service)),
        printIsPathLike(epVal) ? <PrintPathTag value={epVal} /> : cell(epVal),
        r.seoScore != null ? <PrintSeoScoreBadge score={r.seoScore} /> : cell("—"),
        <span style={{ fontSize: "9px", color: "#6B7280", lineHeight: 1.4 }}>{r.notes ?? ""}</span>,
      ];
    }),
    ...customRowsAsNodes(edits, "s4"),
  ];

  const s6Rows: ReactNode[][] = [
    ...s6.priorities.map((r: any, ri: number) => [
      cell(e(`s6_${ri}_0`, String(r.priority))),
      badgeCell(e(`s6_${ri}_1`, r.initiative), s6SharedSource ? undefined : r.source),
      <PrintTierBadge tier={e(`s6_${ri}_2`, r.tier)} />,
      <PrintActionTypeBadge value={edits[`s6_${ri}_5`] ?? (r.actionType ?? "")} />,
      cell(e(`s6_${ri}_3`, r.action)),
      cell(e(`s6_${ri}_4`, r.reason)),
    ]),
    ...customRowsAsNodes(edits, "s6"),
  ];

  const s7Rows: ReactNode[][] = [
    ...s7.tracking.map((r: any, ri: number) => [
      cell(e(`s7_${ri}_0`, r.focusArea)),
      cell(e(`s7_${ri}_1`, r.metric)),
      s7TrackingSharedSource
        ? <span style={{ color: "#9CA3AF", fontSize: "9px" }}>—</span>
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            {parseS7Sources(e(`s7_${ri}_2`, r.source)).map((src: string, si: number) => (
              <SourceBadge key={si} source={src} />
            ))}
          </span>,
      cell(e(`s7_${ri}_4`, r.whyItMatters)),
    ]),
    ...customRowsAsNodes(edits, "s7"),
  ];

  return (
    <div data-report-root style={{ background: "white", margin: 0, padding: 0 }}>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div style={{ position: "relative", width: "8.5in", margin: "0 auto", padding: 0, background: "#fff", fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif", fontSize: "11pt", color: "#111827" }}>
        <div style={{ position: "relative", width: "100%", lineHeight: 0 }}>
          <img src={headerImgUrl ?? swoopHeaderFallback} alt="" style={{ width: "100%", display: "block" }} />
        </div>

        <div style={{ padding: "24px 56px 0" }}>
          <div style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}>QBS</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>{e("meta_site", meta.site ?? "")}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: "11px", marginBottom: "24px", padding: "14px 18px", backgroundColor: "#F9FAFB", borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div><strong>Domain:</strong> {e("meta_domain", meta.domain ?? "")}</div>
            <div><strong>Primary Location:</strong> {e("meta_location", meta.primaryLocation ?? "")}</div>
            <div><strong>Program / Positioning:</strong> {e("meta_program", meta.programPositioning ?? "")}</div>
            <div><strong>Analysis Window:</strong> {meta.analysisWindow}</div>
            <div><strong>Planning Quarter:</strong> {meta.planningQuarter}</div>
            <div><strong>Generated On:</strong> {meta.generatedOn}</div>
          </div>

          {(amPrint.amThoughts || amPrint.hypothesis || amPrint.prevQtrAssessment || amPrint.clientNotes || amPrint.clientSentiment || amPrint.sentiment) && (
            <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, padding: "12px 16px", marginBottom: 24, backgroundColor: "#FFFDFB", fontSize: "10px" }}>
              <div style={{ fontWeight: 700, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Account Manager Context
              </div>
              {(amPrint.amThoughts || amPrint.hypothesis) && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "#374151" }}>AM's Hypothesis: </span>
                  <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amPrint.amThoughts ?? amPrint.hypothesis}</span>
                </div>
              )}
              {amPrint.prevQtrAssessment && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "#374151" }}>Previous Quarter Assessment: </span>
                  <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amPrint.prevQtrAssessment}</span>
                </div>
              )}
              {amPrint.clientNotes && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "#374151" }}>Client Insights: </span>
                  <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amPrint.clientNotes}</span>
                </div>
              )}
              {(amPrint.clientSentiment || amPrint.sentiment) && (
                <div>
                  <span style={{ fontWeight: 700, color: "#374151" }}>Client Sentiment: </span>
                  <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amPrint.clientSentiment ?? amPrint.sentiment}</span>
                </div>
              )}
            </div>
          )}

          {secVis("section_goals") && (
            <>
              <SectionHeading num={secNums["section_goals"]} title="What Matters Most This Quarter" />
              <ReportTable headers={["Goal Type", "Goal", "Goal Shift vs Last Quarter", "Reason"]} rows={s1Rows} colWidths={["88px", undefined, "110px", undefined]} />
            </>
          )}

          {secVis("section_conversions") && !printSecAutoHidden("section_conversions", hiddenTables) && (
            <>
              <SectionHeading num={secNums["section_conversions"]} title="Where Conversions Actually Happen" />
              {tblVis("table_s2_pages") && (
                <>
                  <SubLabel text="Top Converting Pages" sources={s2aSharedSource ? [s2aSharedSource] : undefined} />
                  <ReportTable headers={["Type", "Page", "Notes / What We're Learning"]} rows={s2aRows} />
                </>
              )}
              {tblVis("table_s2_patterns") && (
                <>
                  <SubLabel text="Top Conversion Patterns" />
                  <ReportTable headers={["Pattern", "Why It Matters", "Evidence"]} rows={s2cRows} />
                </>
              )}
              {tblVis("table_s2_sources") && (
                <>
                  <SubLabel text="Top Converting Sources" />
                  <ReportTable headers={["Source", "What's Converting", "Notes / What We're Learning"]} rows={s2bRows} />
                </>
              )}
              {s2.trackingDisclaimer && (
                <div style={{ fontSize: "9px", fontStyle: "italic", color: "#6b7280", marginTop: 4, marginBottom: 8 }}>{s2.trackingDisclaimer}</div>
              )}
            </>
          )}

          {secVis("section_traffic") && !printSecAutoHidden("section_traffic", hiddenTables) && (<>
          <SectionHeading num={secNums["section_traffic"]!} title="Top Organic Traffic Drivers" />
          {tblVis("table_s3_topics") && <><SubLabel text="Top Traffic Topics" sources={["GSC"]} />
          <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
              <colgroup>
                {hasTopicDeltas ? (
                  <>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "27%" }} />
                    <col style={{ width: "14%" }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "52%" }} />
                    <col style={{ width: "18%" }} />
                  </>
                )}
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                  {["Topic", ...(hasTopicDeltas ? ["# Queries", "QoQ Queries", "TOTAL IMP.", "QOQ IMP."] : []), "Example Queries", "🔗 Admits"].map((h: string) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: h === "🔗 Admits" ? "center" : "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s3.topTrafficTopics.map((r: any, ri: number) => {
                  const insightVal = edits[`s3a_${ri}_3`] ?? r.insight;
                  const hasInsight = !!insightVal;
                  const cellBorder = hasInsight ? "none" : "1px solid #F3EDED";
                  const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
                  return (
                    <React.Fragment key={`topic-${ri}`}>
                      <tr style={{ backgroundColor: bg }}>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{cell(e(`s3a_${ri}_0`, r.topic))}</td>
                        {hasTopicDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.queryCount ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.queryCountDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queryCountDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.impressions != null ? r.impressions.toLocaleString("en-US") : "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>
                          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
                            {(e(`s3a_${ri}_1`, r.exampleQueries) || "").split(",").map((q: string, qi: number) => q.trim() ? (
                              <span key={qi} style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}30`, borderRadius: 10, padding: "1px 6px", fontSize: "8px", color: "#374151", whiteSpace: "nowrap" }}>{q.trim()}</span>
                            ) : null)}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, textAlign: "center", wordBreak: "break-word", overflow: "hidden" }}>{cell(e(`s3a_${ri}_2`, r.connectionToAdmits))}</td>
                      </tr>
                      {hasInsight && (
                        <tr style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={topicColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                            {cell(insightVal)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {getCustomRows(edits, "s3a").map((row: string[], ri: number) => (
                  <tr key={`s3a-custom-${ri}`} style={{ backgroundColor: "white" }}>
                    {row.map((c: string, ci: number) => <td key={ci} style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div></>}

          {tblVis("table_s3_pages") && <><SubLabel text="Top Traffic Pages" sources={["GSC"]} />
          <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
              <colgroup>
                {hasPageDeltas ? (
                  <>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "12%" }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: "55%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "18%" }} />
                  </>
                )}
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                  {["Page", "Clicks", ...(hasPageDeltas ? ["QoQ Clicks", "TOTAL IMP.", "QOQ IMP.", "# Queries", "QoQ Queries"] : []), "CTR", "🔗 Admits"].map((h: string) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: h === "🔗 Admits" ? "center" : "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s3.topTrafficPages.map((r: any, ri: number) => {
                  const insightVal = edits[`s3b_${ri}_4`] ?? r.insight;
                  const hasInsight = !!insightVal;
                  const cellBorder = hasInsight ? "none" : "1px solid #F3EDED";
                  const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
                  return (
                    <React.Fragment key={`page-${ri}`}>
                      <tr style={{ backgroundColor: bg }}>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{(() => { const v = e(`s3b_${ri}_0`, r.page); return printIsPathLike(v) ? <PrintPathTag value={v} /> : cell(v); })()}</td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{cell(e(`s3b_${ri}_1`, r.clicks))}</td>
                        {hasPageDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.clicksDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.clicksDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.impressions ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.queries ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.queriesDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queriesDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{cell(e(`s3b_${ri}_2`, r.ctr))}</td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, textAlign: "center", wordBreak: "break-word", overflow: "hidden" }}>{cell(e(`s3b_${ri}_3`, r.connectionToAdmits))}</td>
                      </tr>
                      {hasInsight && (
                        <tr style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={pageColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                            {cell(insightVal)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {getCustomRows(edits, "s3b").map((row: string[], ri: number) => (
                  <tr key={`s3b-custom-${ri}`} style={{ backgroundColor: "white" }}>
                    {row.map((c: string, ci: number) => <td key={ci} style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div></>}
          </>)}

          {secVis("section_services") && !printSecAutoHidden("section_services", hiddenTables) && (
            <>
              <SectionHeading num={secNums["section_services"]!} title="Levels of Care Overview" />
              {tblVis("table_s4_services") && (
                <>
                  <SubLabel text="Levels of Care" sources={["Screaming Frog"]} />
                  <ReportTable headers={["Level of Care", "Page", "SEO Score", "Notes"]} rows={s4Rows} />
                </>
              )}
            </>
          )}

          {secVis("section_diagnosis") && (
            <>
              <SectionHeading num={secNums["section_diagnosis"]!} title="SEO Tier Diagnosis" />
              <div style={{ padding: "14px 18px", backgroundColor: "#FDF2F0", borderRadius: 4, border: `1px solid ${ACCENT}33`, marginBottom: 14, fontSize: "11px" }}>
                <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "12px" }}>Tier {s5.tier} — {s5.tierName}</div>
                <div style={{ color: "#374151", lineHeight: 1.6 }}>{e("s5_diagnosis", s5.diagnosis)}</div>
              </div>
              {(s5 as any).tierScorecard && ((s5 as any).tierScorecard as any[]).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {((s5 as any).tierScorecard as any[]).map((entry: any) => (
                    <PrintTierScorecardCard key={entry.tierNumber} entry={entry} />
                  ))}
                </div>
              )}
            </>
          )}

          {secVis("section_priorities") && !printSecAutoHidden("section_priorities", hiddenTables) && (
            <>
              <SectionHeading num={secNums["section_priorities"]!} title="What We Need to Do Next" />
              {(s6 as any).shortSummary && ((s6 as any).shortSummary as string[]).length > 0 && (
                <div style={{ padding: "10px 14px", backgroundColor: "#FFF5F5", borderRadius: 4, border: `1.5px solid ${ACCENT}40`, marginBottom: 12, fontSize: "9.5px" }}>
                  <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 5, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Critical Observations</div>
                  <ul style={{ margin: 0, padding: "0 0 0 14px", lineHeight: 1.6, color: "#374151" }}>
                    {((s6 as any).shortSummary as string[]).map((b: string, i: number) => {
                      const colonIdx = b.indexOf(":");
                      if (colonIdx > 0 && colonIdx < 60) {
                        return <li key={i}><strong>{b.slice(0, colonIdx)}:</strong> {b.slice(colonIdx + 1).trimStart()}</li>;
                      }
                      return <li key={i}>{b}</li>;
                    })}
                  </ul>
                </div>
              )}
              {tblVis("table_s6") && (
                <>
                  {s6SharedSource && <SubLabel text="Priority Actions" sources={[s6SharedSource]} />}
                  <ReportTable headers={["#", "Initiative", "Tier", "Type", "Action", "Why It Matters"]} rows={s6Rows} />
                </>
              )}
              {(() => {
            const raw = edits["s6_crossSells_confirmed"];
            if (!raw) return null;
            let items: { recommendation: string; type: string; relevance: string }[] = [];
            try { items = JSON.parse(raw); } catch { return null; }
            if (!items.length) return null;
            return (
              <div style={{ marginBottom: 16, border: "1px solid #3B82F640", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ backgroundColor: "#EFF6FF", padding: "6px 10px", fontSize: "10px", fontWeight: 700, color: "#1D4ED8", borderBottom: "1px solid #3B82F640", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Confirmed Opportunities (Cross-sell / Upsell)
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#EFF6FF80" }}>
                      {["Opportunity", "Type", "Relevance"].map((h: string) => (
                        <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: "#1D4ED8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #3B82F640" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: { recommendation: string; type: string; relevance: string }, i: number) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 1 ? "#F8FAFF" : "white" }}>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>{item.recommendation}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>
                          <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: "9px", fontWeight: 600, backgroundColor: item.type === "upsell" ? "#FEF3C7" : "#DBEAFE", color: item.type === "upsell" ? "#92400E" : "#1E40AF" }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4, color: "#4B5563" }}>{item.relevance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
              })()}
            </>
          )}

          {secVis("section_keywords") && _hasKeywords && (
            <>
              <SectionHeading num={secNums["section_keywords"]!} title="Suggested Keywords for Next Quarter" />
              {sectionSuggestedKeywords?.rows?.length > 0 && (
                <div style={{ padding: "9px 12px", backgroundColor: "#FFF5F5", borderRadius: 4, border: `1.5px solid ${ACCENT}40`, marginBottom: 12, fontSize: "9px", color: "#374151", lineHeight: 1.65 }}>
                  <span style={{ fontWeight: 700, color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontSize: "8.5px", marginRight: 5 }}>About This List:</span>
                  Showing {sectionSuggestedKeywords.rows.length} keyword opportunities (2× monthly credit capacity of {sectionSuggestedKeywords.monthlyCredits}). Grounded in GSC query data, site crawl inventory, and page performance. Filtered to strategic Level of Care, program, condition, and location-intent terms.
                </div>
              )}
              <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "32%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                      {(kwSharedSource ? ["Keyword", "Suggested Type", "Target", "Why It's Suggested"] : ["Keyword", "Suggested Type", "Target", "Why It's Suggested", "Source"]).map((h: string) => (
                        <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                      ))}
                      {kwSharedSource && (
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20` }}>
                          <SourceBadge source={kwSharedSource} />
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(sectionSuggestedKeywords?.rows ?? []).map((row: any, ri: number) => {
                      const recTypeLabels: Record<string, string> = {
                        "optimize-existing": "Optimize existing page",
                        "refresh-existing":  "Refresh existing page",
                        "create-new":        "Create new content",
                        "cro-update":        "CRO / supporting update",
                        "internal-linking":  "Internal linking support",
                      };
                      const recTypeColors: Record<string, { bg: string; color: string }> = {
                        "optimize-existing": { bg: "#D1FAE5", color: "#065F46" },
                        "refresh-existing":  { bg: "#FEF3C7", color: "#92400E" },
                        "create-new":        { bg: "#DBEAFE", color: "#1E40AF" },
                        "cro-update":        { bg: "#F3E8FF", color: "#6B21A8" },
                        "internal-linking":  { bg: "#F0FDF4", color: "#14532D" },
                      };
                      const label  = recTypeLabels[row.recommendationType] ?? row.recommendationType;
                      const colors = recTypeColors[row.recommendationType] ?? { bg: "#F3F4F6", color: "#374151" };
                      const rawPage = edits[`kw_${ri}_targetPage`] ?? row.targetPage ?? "";
                      const isNew = rawPage === "New content needed" || rawPage === "Suggest new content for this keyword";
                      return (
                        <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? "#FBF8F7" : "white" }}>
                          <td style={{ padding: "7px 9px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", fontWeight: 600, wordBreak: "break-word" }}>
                            {edits[`kw_${ri}_keyword`] ?? row.keyword ?? ""}
                          </td>
                          <td style={{ padding: "7px 9px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", wordBreak: "break-word" }}>
                            <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: colors.bg, color: colors.color }}>{label}</span>
                          </td>
                          <td style={{ padding: "7px 9px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", wordBreak: "break-word" }}>
                            {isNew
                              ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: "#FEF3C7", color: "#92400E" }}>New content needed</span>
                              : <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: "9px", fontWeight: 500, backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, color: "#374151", wordBreak: "break-all" }}>{rawPage}</span>
                            }
                          </td>
                          <td style={{ padding: "7px 9px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.5, color: "#4B5563", fontSize: "9px", wordBreak: "break-word" }}>{edits[`kw_${ri}_why`] ?? row.whyRecommended}</td>
                          {!kwSharedSource && (
                            <td style={{ padding: "7px 9px", borderBottom: "1px solid #F3EDED", verticalAlign: "top" }}>
                              <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
                                {(row.sources ?? []).map((src: string, si: number) => (
                                  <SourceBadge key={si} source={src} />
                                ))}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {secVis("section_tracking") && !printSecAutoHidden("section_tracking", hiddenTables) && (
            <>
              <SectionHeading num={secNums["section_tracking"]!} title="What We Track" />
              {tblVis("table_s8") && (
                <>
                  {s7TrackingSharedSource && <SubLabel text="Tracked Metrics" sources={[s7TrackingSharedSource]} />}
                  <ReportTable headers={["Focus Area", "Metric", "Source", "Why It Matters"]} rows={s7Rows} />
                </>
              )}
            </>
          )}

          {secVis("section_opportunities") && (() => {
            if (_autoOpps.length === 0) return null;
            return (
              <>
                <SectionHeading num={secNums["section_opportunities"]!} title="Additional Opportunities" />

                {/* Auto-generated opportunity cards */}
                {_autoOpps.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 0, fontSize: "11px" }}>
                    {_autoOpps.map((opp: any, i: number) => (
                      <div key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden", pageBreakInside: "avoid" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                          <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", backgroundColor: opp.type === "upsell" ? "#FEF3C7" : "#DBEAFE", color: opp.type === "upsell" ? "#92400E" : "#1E40AF" }}>
                            {opp.type === "upsell" ? "Upsell" : "Cross-sell"}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: "12px", color: "#111827" }}>{e(`opp_${i}_title`, opp.title)}</span>
                        </div>
                        <div style={{ padding: "11px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
                          <div style={{ color: "#374151", fontStyle: "italic" }}>{e(`opp_${i}_why_now`, opp.why_now)}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Evidence</div>
                            <ul style={{ margin: 0, paddingLeft: 16, color: "#374151" }}>
                              {(opp.evidence ?? []).map((ev: string, j: number) => (
                                <li key={j} style={{ marginBottom: 2 }}>{e(`opp_${i}_evidence_${j}`, ev)}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Recommendation</div>
                            <div style={{ color: "#1B3A6B" }}>{e(`opp_${i}_recommendation`, opp.recommendation)}</div>
                          </div>
                          <div style={{ fontSize: "10px", color: "#9CA3AF", borderTop: "1px solid #F3F4F6", paddingTop: 5, fontStyle: "italic" }}>{e(`opp_${i}_framing`, opp.framing)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </>
            );
          })()}

          {genMeta && (
            <div style={{ fontSize: "9px", color: "#9CA3AF", marginTop: 16 }}>
              <strong>Sources used:</strong> {genMeta.dataSources?.join(", ") || "None"}
              {genMeta.missingData?.length > 0 && (
                <span> · <strong>Missing:</strong> {genMeta.missingData.join(", ")}</span>
              )}
            </div>
          )}

          <div style={{ borderTop: "1px solid #9CA3AF", marginTop: "24px", paddingTop: "8px", paddingBottom: "32px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
            {FOOTER_TEXT}
          </div>
        </div>
      </div>
    </div>
  );
}
