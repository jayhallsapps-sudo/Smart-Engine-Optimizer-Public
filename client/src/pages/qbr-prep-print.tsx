import React, { useEffect, useState } from "react";
import type { ReactNode } from "react";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";
import { ReportTable, SourceBadge, getCustomRows } from "../components/report-preview/report-table";

const ACCENT = "#C0392B";
const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div style={{ color: ACCENT, fontWeight: 700, fontSize: "14px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4, marginBottom: 12, marginTop: num > 1 ? 28 : 0 }}>
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

  const { reportData, edits = {} } = data;
  const meta = reportData.meta ?? {};
  const s1 = reportData.section1Goals ?? { rows: [] };
  const s2 = reportData.section2Conversions ?? { topConvertingPages: [], topConvertingSources: [] };
  const s3 = reportData.section3Traffic ?? { topTrafficTopics: [], topTrafficPages: [] };
  const s4 = reportData.section4Services ?? { services: [] };
  const s5 = reportData.section5Diagnosis ?? { tier: 0, tierName: "", diagnosis: "" };
  const s6 = reportData.section6Priorities ?? { priorities: [] };
  const s7 = reportData.section7Tracking ?? { tracking: [] };
  const genMeta = reportData.generationMeta;

  const e = (key: string, val: string) => applyEdits(val, key, edits);

  const s7Tracking = s7.tracking ?? [];
  for (let ri = 0; ri < s7Tracking.length; ri++) {
    const hasStatus = s7Tracking[ri]?.status;
    if (!hasStatus && edits[`s7_${ri}_3`] && !edits[`s7_${ri}_4`]) {
      edits[`s7_${ri}_4`] = edits[`s7_${ri}_3`];
      delete edits[`s7_${ri}_3`];
    }
  }

  const s1Rows = [
    ...s1.rows.map((r: any, ri: number) => [e(`s1_${ri}_0`, r.goalType), e(`s1_${ri}_1`, r.goal), e(`s1_${ri}_2`, r.measurementSource), e(`s1_${ri}_3`, r.goalShift), e(`s1_${ri}_4`, r.reason)]),
    ...getCustomRows(edits, "s1"),
  ];

  const s2aRows: ReactNode[][] = [
    ...s2.topConvertingPages.map((r: any, ri: number) => [
      badgeCell(e(`s2a_${ri}_0`, r.type), r.dataSource),
      cell(e(`s2a_${ri}_1`, r.page)),
      cell(e(`s2a_${ri}_3`, r.conversionSource ?? r.dataSource ?? "—")),
      cell(e(`s2a_${ri}_2`, r.notes)),
    ]),
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

  const s4Rows = [
    ...s4.services.map((r: any, ri: number) => [e(`s4_${ri}_0`, r.service), e(`s4_${ri}_1`, r.examplePage)]),
    ...getCustomRows(edits, "s4"),
  ];

  const s6Rows: ReactNode[][] = [
    ...s6.priorities.map((r: any, ri: number) => [
      cell(e(`s6_${ri}_0`, String(r.priority))),
      badgeCell(e(`s6_${ri}_1`, r.initiative), r.source),
      cell(e(`s6_${ri}_2`, r.tier)),
      cell(e(`s6_${ri}_3`, r.action)),
      cell(e(`s6_${ri}_4`, r.reason)),
    ]),
    ...customRowsAsNodes(edits, "s6"),
  ];

  const s7Rows: ReactNode[][] = [
    ...s7.tracking.map((r: any, ri: number) => [
      cell(e(`s7_${ri}_0`, r.focusArea)),
      cell(e(`s7_${ri}_1`, r.metric)),
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
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
          <div style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}>QBR Prep: SEO Planning Snapshot</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>{e("meta_site", meta.site ?? "")}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: "11px", marginBottom: "20px", padding: "12px 16px", backgroundColor: "#F9FAFB", borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div><strong>Domain:</strong> {e("meta_domain", meta.domain ?? "")}</div>
            <div><strong>Primary Location:</strong> {e("meta_location", meta.primaryLocation ?? "")}</div>
            <div><strong>Program / Positioning:</strong> {e("meta_program", meta.programPositioning ?? "")}</div>
            <div><strong>Analysis Window:</strong> {meta.analysisWindow}</div>
            <div><strong>Planning Quarter:</strong> {meta.planningQuarter}</div>
            <div><strong>Generated On:</strong> {meta.generatedOn}</div>
          </div>

          <SectionHeading num={1} title="What Matters Most This Quarter" />
          <DataTable
            headers={["Goal Type", "Goal", "Measurement Source", "Goal Shift vs Last Quarter", "Reason"]}
            rows={s1Rows}
          />

          <SectionHeading num={2} title="Where Conversions Actually Happen" />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Pages</div>
          <ReportTable
            headers={["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"]}
            rows={s2aRows}
          />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Conversion Patterns</div>
          <ReportTable
            headers={["Pattern", "Why It Matters", "Evidence"]}
            rows={s2cRows}
          />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Sources</div>
          <ReportTable
            headers={["Source", "What's Converting", "Notes / What We're Learning"]}
            rows={s2bRows}
          />
          {s2.trackingDisclaimer && (
            <div style={{ fontSize: "9px", fontStyle: "italic", color: "#6b7280", marginTop: 4, marginBottom: 8 }}>
              {s2.trackingDisclaimer}
            </div>
          )}

          <SectionHeading num={3} title="Top Organic Traffic Drivers" />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Topics</div>
          <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead>
                <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                  {["Topic", ...(hasTopicDeltas ? ["# Queries", "Δ Queries", "Impressions", "Δ Impressions"] : []), "Example Queries", "Connection to Admits"].map((h: string) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, whiteSpace: "nowrap" }}>{h}</th>
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
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3a_${ri}_0`, r.topic))}</td>
                        {hasTopicDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{r.queryCount ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.queryCountDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queryCountDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{r.impressions != null ? r.impressions.toLocaleString("en-US") : "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3a_${ri}_1`, r.exampleQueries))}</td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3a_${ri}_2`, r.connectionToAdmits))}</td>
                      </tr>
                      {hasInsight && (
                        <tr style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={topicColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4 }}>
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
          </div>

          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Pages</div>
          <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead>
                <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                  {["Page", "Clicks", ...(hasPageDeltas ? ["Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "Δ Queries"] : []), "CTR", "Connection to Admits"].map((h: string) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, whiteSpace: "nowrap" }}>{h}</th>
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
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3b_${ri}_0`, r.page))}</td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3b_${ri}_1`, r.clicks))}</td>
                        {hasPageDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.clicksDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.clicksDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{r.impressions ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{r.queries ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.queriesDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queriesDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3b_${ri}_2`, r.ctr))}</td>
                        <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>{cell(e(`s3b_${ri}_3`, r.connectionToAdmits))}</td>
                      </tr>
                      {hasInsight && (
                        <tr style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={pageColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4 }}>
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
          </div>

          <SectionHeading num={4} title="Site Service Overview" />
          <DataTable
            headers={["Service", "Example Page"]}
            rows={s4Rows}
          />

          <SectionHeading num={5} title="SEO Tier Diagnosis" />
          <div style={{ padding: "12px 16px", backgroundColor: "#FDF2F0", borderRadius: 4, border: `1px solid ${ACCENT}33`, marginBottom: 12, fontSize: "11px" }}>
            <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "12px" }}>
              Tier {s5.tier} — {s5.tierName}
            </div>
            <div style={{ color: "#374151", lineHeight: 1.6 }}>{e("s5_diagnosis", s5.diagnosis)}</div>
          </div>

          <SectionHeading num={6} title="What We Need to Do Next" />
          <ReportTable
            headers={["#", "Initiative", "Tier", "Action", "Reason"]}
            rows={s6Rows}
          />
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

          <SectionHeading num={7} title="What We Track" />
          <ReportTable
            headers={["Focus Area", "Metric", "Source", "Why It Matters"]}
            rows={s7Rows}
          />

          {(() => {
            const autoOpps: any[] = reportData.additionalOpportunities ?? [];
            const s8Rows = getCustomRows(edits, "s8_opportunities");
            if (autoOpps.length === 0 && s8Rows.length === 0) return null;
            return (
              <>
                <SectionHeading num={8} title="Additional Opportunities" />

                {/* Auto-generated opportunity cards */}
                {autoOpps.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: s8Rows.length > 0 ? 14 : 0, fontSize: "11px" }}>
                    {autoOpps.map((opp: any, i: number) => (
                      <div key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                          <span
                            style={{
                              display: "inline-block", padding: "1px 8px", borderRadius: 10,
                              fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                              backgroundColor: opp.type === "upsell" ? "#FEF3C7" : "#DBEAFE",
                              color: opp.type === "upsell" ? "#92400E" : "#1E40AF",
                            }}
                          >
                            {opp.type === "upsell" ? "Upsell" : "Cross-sell"}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: "12px", color: "#111827" }}>{opp.title}</span>
                        </div>
                        <div style={{ padding: "9px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                          <div style={{ color: "#374151", fontStyle: "italic" }}>{opp.why_now}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Evidence</div>
                            <ul style={{ margin: 0, paddingLeft: 16, color: "#374151" }}>
                              {(opp.evidence ?? []).map((ev: string, j: number) => (
                                <li key={j} style={{ marginBottom: 2 }}>{ev}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Recommendation</div>
                            <div style={{ color: "#1B3A6B" }}>{opp.recommendation}</div>
                          </div>
                          <div style={{ fontSize: "10px", color: "#9CA3AF", borderTop: "1px solid #F3F4F6", paddingTop: 5, fontStyle: "italic" }}>{opp.framing}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual additions */}
                {s8Rows.length > 0 && (
                  <ReportTable
                    headers={["Description", "Purpose", "Est. Cost"]}
                    rows={s8Rows.map((row: string[]) => row.map((c: string) => cell(c)))}
                  />
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
