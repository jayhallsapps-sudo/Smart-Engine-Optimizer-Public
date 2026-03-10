import React, { useState, useEffect } from "react";
import { EditableSection } from "./editable-section";
import { AddableReportTable, SourceBadge } from "./report-table";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";

const ACCENT = "#C0392B";

interface QbrPrepMeta {
  site: string;
  domain: string;
  primaryLocation: string;
  programPositioning: string;
  analysisWindow: string;
  planningQuarter: string;
  generatedOn: string;
}

interface GoalRow {
  goalType: string;
  goal: string;
  measurementSource: string;
  goalShift: string;
  reason: string;
}

interface ConvertingPageRow {
  type: string;
  page: string;
  notes: string;
  dataSource?: string;
}

interface ConvertingSourceRow {
  source: string;
  whatsConverting: string;
  notes: string;
  dataSource?: string;
}

interface TrafficTopicRow {
  topic: string;
  exampleQueries: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
  queryCount?: number;
  queryCountDelta?: string;
  impressions?: number;
  impressionsDelta?: string;
}

interface TrafficPageRow {
  page: string;
  clicks: string;
  clicksDelta?: string;
  impressions?: string;
  impressionsDelta?: string;
  queries?: string;
  queriesDelta?: string;
  ctr: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
}

interface ServiceRow {
  service: string;
  examplePage: string;
}

interface PriorityRow {
  priority: number;
  initiative: string;
  tier: string;
  action: string;
  reason: string;
  source?: string;
}

interface TrackingRow {
  focusArea: string;
  metric: string;
  source: string;
  whyItMatters: string;
}

interface QssbInsight { question: string; }
interface QssbOpportunity { title: string; description: string; }
interface SectionQssb { clientInsights: QssbInsight[]; additionalOpportunities: QssbOpportunity[]; }

export interface QbrPrepPreviewProps {
  meta: QbrPrepMeta;
  section1Goals: { rows: GoalRow[] };
  section2Conversions: { topConvertingPages: ConvertingPageRow[]; topConvertingSources: ConvertingSourceRow[]; trackingDisclaimer?: string };
  section3Traffic: { topTrafficTopics: TrafficTopicRow[]; topTrafficPages: TrafficPageRow[] };
  section4Services: { services: ServiceRow[] };
  section5Diagnosis: { tier: number; tierName: string; diagnosis: string };
  section6Priorities: { priorities: PriorityRow[] };
  section7Tracking: { tracking: TrackingRow[] };
  sectionQssb?: SectionQssb;
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  generationMeta?: { dataSources: string[]; missingData: string[] };
  amInputs?: { clientSentiment?: string; amThoughts?: string; priorityChecks?: string; clientNotes?: string };
}

function EditableCell({
  editKey,
  value,
  edits,
  onEdit,
  style,
}: {
  editKey: string;
  value: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  style?: React.CSSProperties;
}) {
  const display = edits[editKey] ?? value;
  const isManual = display.includes("Manual entry needed");

  return (
    <EditableSection
      editKey={editKey}
      value={value}
      edits={edits}
      onEdit={onEdit}
      as="span"
      className={isManual ? "italic text-gray-400" : ""}
      style={style}
    />
  );
}

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div
      style={{
        color: ACCENT,
        fontWeight: 700,
        fontSize: "14px",
        borderBottom: `2px solid ${ACCENT}`,
        paddingBottom: 4,
        marginBottom: 12,
        marginTop: num > 1 ? 28 : 0,
      }}
      data-testid={`section-heading-${num}`}
    >
      {num}. {title}
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

function BadgeCell({
  editKey,
  value,
  dataSource,
  edits,
  onEdit,
}: {
  editKey: string;
  value: string;
  dataSource?: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <EditableCell editKey={editKey} value={value} edits={edits} onEdit={onEdit} />
      {dataSource && <SourceBadge source={dataSource} />}
    </span>
  );
}

export function QbrPrepPreview({
  meta,
  section1Goals,
  section2Conversions,
  section3Traffic,
  section4Services,
  section5Diagnosis,
  section6Priorities,
  section7Tracking,
  sectionQssb,
  edits,
  onEdit,
  generationMeta,
  amInputs,
}: QbrPrepPreviewProps) {
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, []);

  const s1SourceRows: React.ReactNode[][] = section1Goals.rows.map((r, ri) => [
    <EditableCell key="g" editKey={`s1_${ri}_0`} value={r.goalType} edits={edits} onEdit={onEdit} />,
    <EditableCell key="go" editKey={`s1_${ri}_1`} value={r.goal} edits={edits} onEdit={onEdit} />,
    <EditableCell key="m" editKey={`s1_${ri}_2`} value={r.measurementSource} edits={edits} onEdit={onEdit} />,
    <EditableCell key="gs" editKey={`s1_${ri}_3`} value={r.goalShift} edits={edits} onEdit={onEdit} />,
    <EditableCell key="r" editKey={`s1_${ri}_4`} value={r.reason} edits={edits} onEdit={onEdit} />,
  ]);

  const s2aSourceRows: React.ReactNode[][] = section2Conversions.topConvertingPages.map((r, ri) => [
    <BadgeCell key="t" editKey={`s2a_${ri}_0`} value={r.type} dataSource={r.dataSource} edits={edits} onEdit={onEdit} />,
    <EditableCell key="p" editKey={`s2a_${ri}_1`} value={r.page} edits={edits} onEdit={onEdit} />,
    <EditableCell key="n" editKey={`s2a_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const s2bSourceRows: React.ReactNode[][] = section2Conversions.topConvertingSources.map((r, ri) => [
    <BadgeCell key="s" editKey={`s2b_${ri}_0`} value={r.source} dataSource={r.dataSource} edits={edits} onEdit={onEdit} />,
    <EditableCell key="wc" editKey={`s2b_${ri}_1`} value={r.whatsConverting} edits={edits} onEdit={onEdit} />,
    <EditableCell key="n" editKey={`s2b_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const hasTopicDeltas = section3Traffic.topTrafficTopics.some(r => r.queryCount != null);

  const s3aSourceRows: React.ReactNode[][] = section3Traffic.topTrafficTopics.map((r, ri) => {
    const baseCells = [
      <EditableCell key="t" editKey={`s3a_${ri}_0`} value={r.topic} edits={edits} onEdit={onEdit} />,
    ];
    if (hasTopicDeltas) {
      baseCells.push(
        <span key="qc" data-testid={`text-query-count-${ri}`}>{r.queryCount ?? "—"}</span>,
        <span key="qcd" data-testid={`text-query-delta-${ri}`}>{r.queryCountDelta ?? "—"}</span>,
        <span key="imp" data-testid={`text-impressions-${ri}`}>{r.impressions != null ? r.impressions.toLocaleString("en-US") : "—"}</span>,
        <span key="impd" data-testid={`text-impressions-delta-${ri}`}>{r.impressionsDelta ?? "—"}</span>,
      );
    }
    baseCells.push(
      <EditableCell key="eq" editKey={`s3a_${ri}_1`} value={r.exampleQueries} edits={edits} onEdit={onEdit} />,
      <EditableCell key="c" editKey={`s3a_${ri}_2`} value={r.connectionToAdmits} edits={edits} onEdit={onEdit} />,
      <BadgeCell key="i" editKey={`s3a_${ri}_3`} value={r.insight} dataSource={r.dataSource} edits={edits} onEdit={onEdit} />,
    );
    return baseCells;
  });

  const hasPageDeltas = section3Traffic.topTrafficPages.some(r => r.clicksDelta || r.impressions || r.queries);
  const pageColCount = hasPageDeltas ? 9 : 4;

  const s4SourceRows: React.ReactNode[][] = section4Services.services.map((r, ri) => [
    <EditableCell key="s" editKey={`s4_${ri}_0`} value={r.service} edits={edits} onEdit={onEdit} />,
    <EditableCell key="e" editKey={`s4_${ri}_1`} value={r.examplePage} edits={edits} onEdit={onEdit} />,
  ]);

  const s6SourceRows: React.ReactNode[][] = section6Priorities.priorities.map((r, ri) => [
    <EditableCell key="n" editKey={`s6_${ri}_0`} value={String(r.priority)} edits={edits} onEdit={onEdit} />,
    <BadgeCell key="i" editKey={`s6_${ri}_1`} value={r.initiative} dataSource={r.source} edits={edits} onEdit={onEdit} />,
    <EditableCell key="t" editKey={`s6_${ri}_2`} value={r.tier} edits={edits} onEdit={onEdit} />,
    <EditableCell key="a" editKey={`s6_${ri}_3`} value={r.action} edits={edits} onEdit={onEdit} />,
    <EditableCell key="r" editKey={`s6_${ri}_4`} value={r.reason} edits={edits} onEdit={onEdit} />,
  ]);

  const s7SourceRows: React.ReactNode[][] = section7Tracking.tracking.map((r, ri) => [
    <EditableCell key="f" editKey={`s7_${ri}_0`} value={r.focusArea} edits={edits} onEdit={onEdit} />,
    <EditableCell key="m" editKey={`s7_${ri}_1`} value={r.metric} edits={edits} onEdit={onEdit} />,
    <span key="s" style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
      {parseS7Sources(edits[`s7_${ri}_2`] ?? r.source).map((src, si) => (
        <SourceBadge key={si} source={src} />
      ))}
    </span>,
    // Status column removed — was showing "Comment Out Status" / verification states not ready for clients
    <EditableCell key="w" editKey={`s7_${ri}_4`} value={r.whyItMatters} edits={edits} onEdit={onEdit} />,
  ]);

  return (
    <div className="bg-muted/30 min-h-full flex items-start justify-center p-6 overflow-y-auto" data-testid="qbr-prep-preview-wrapper">
      <div
        className="bg-white shadow-lg overflow-hidden"
        style={{
          width: "794px",
          minHeight: "1123px",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
          fontSize: "11pt",
          color: "#111827",
        }}
        data-testid="qbr-prep-preview-page"
      >
        <img
          src={headerImgUrl ?? swoopHeaderFallback}
          alt="Header"
          style={{ width: "100%", display: "block", flexShrink: 0 }}
        />

        <div style={{ padding: "24px 56px 0", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}>
              QBR Prep: SEO Planning Snapshot
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>
              <EditableCell editKey="meta_site" value={meta.site} edits={edits} onEdit={onEdit} />
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 24px",
              fontSize: "11px",
              marginBottom: "20px",
              padding: "12px 16px",
              backgroundColor: "#F9FAFB",
              borderRadius: 4,
              border: "1px solid #E5E7EB",
            }}>
              <div><strong>Domain:</strong> <EditableCell editKey="meta_domain" value={meta.domain} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Primary Location:</strong> <EditableCell editKey="meta_location" value={meta.primaryLocation} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Program / Positioning:</strong> <EditableCell editKey="meta_program" value={meta.programPositioning} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Analysis Window:</strong> {meta.analysisWindow}</div>
              <div><strong>Planning Quarter:</strong> {meta.planningQuarter}</div>
              <div><strong>Generated On:</strong> {meta.generatedOn}</div>
            </div>

            {/* AM Inputs are used internally to guide report generation only.
                They are not rendered as a visible section in the client-facing report. */}

            <SectionHeading num={1} title="What Matters Most This Quarter" />
            <AddableReportTable
              tableId="s1"
              headers={["Goal Type", "Goal", "Measurement Source", "Goal Shift vs Last Quarter", "Reason"]}
              sourceRows={s1SourceRows}
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={2} title="Where Conversions Actually Happen" />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Pages</div>
            <AddableReportTable
              tableId="s2a"
              headers={["Type", "Page / Pattern", "Notes / What We're Learning"]}
              sourceRows={s2aSourceRows}
              edits={edits}
              onEdit={onEdit}
            />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Sources</div>
            <AddableReportTable
              tableId="s2b"
              headers={["Source", "What's Converting", "Notes / What We're Learning"]}
              sourceRows={s2bSourceRows}
              edits={edits}
              onEdit={onEdit}
            />
            {section2Conversions.trackingDisclaimer && (
              <div style={{ fontSize: "9px", fontStyle: "italic", color: "#6b7280", marginTop: 4, marginBottom: 8 }} data-testid="tracking-disclaimer">
                {section2Conversions.trackingDisclaimer}
              </div>
            )}

            <SectionHeading num={3} title="Top Organic Traffic Drivers" />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Topics</div>
            <AddableReportTable
              tableId="s3a"
              headers={hasTopicDeltas
                ? ["Topic", "# Queries", "Δ Queries", "Impressions", "Δ Impressions", "Example Queries", "Connection to Admits", "Insight"]
                : ["Topic", "Example Queries", "Connection to Admits", "Insight"]}
              sourceRows={s3aSourceRows}
              edits={edits}
              onEdit={onEdit}
            />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Pages</div>
            <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", marginBottom: 12, backgroundColor: "#FFFDFB" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                    {["Page", "Clicks", ...(hasPageDeltas ? ["Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "Δ Queries"] : []), "CTR", "Connection to Admits"].map(h => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section3Traffic.topTrafficPages.map((r, ri) => (
                    <React.Fragment key={`page-${ri}`}>
                      <tr style={{ backgroundColor: ri % 2 === 1 ? "#FBF8F7" : "white" }}>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}><EditableCell editKey={`s3b_${ri}_0`} value={r.page} edits={edits} onEdit={onEdit} /></td>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}><EditableCell editKey={`s3b_${ri}_1`} value={r.clicks} edits={edits} onEdit={onEdit} /></td>
                        {hasPageDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, color: r.clicksDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.clicksDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}>{r.impressions ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}>{r.queries ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, color: r.queriesDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queriesDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}><EditableCell editKey={`s3b_${ri}_2`} value={r.ctr} edits={edits} onEdit={onEdit} /></td>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4 }}><EditableCell editKey={`s3b_${ri}_3`} value={r.connectionToAdmits} edits={edits} onEdit={onEdit} /></td>
                      </tr>
                      {(edits[`s3b_${ri}_4`] ?? r.insight) && (
                        <tr key={`${ri}-i`} style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={pageColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                            <EditableCell editKey={`s3b_${ri}_4`} value={r.insight} edits={edits} onEdit={onEdit} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHeading num={4} title="Site Service Overview" />
            <AddableReportTable
              tableId="s4"
              headers={["Service", "Example Page"]}
              sourceRows={s4SourceRows}
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={5} title="SEO Tier Diagnosis" />
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#FDF2F0",
                borderRadius: 4,
                border: `1px solid ${ACCENT}33`,
                marginBottom: 12,
                fontSize: "11px",
              }}
            >
              <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "12px" }}>
                Tier {section5Diagnosis.tier} — {section5Diagnosis.tierName}
              </div>
              <EditableSection
                editKey="s5_diagnosis"
                value={section5Diagnosis.diagnosis}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                className="text-gray-700 leading-relaxed"
              />
            </div>

            <SectionHeading num={6} title="What We Need to Do Next" />
            <AddableReportTable
              tableId="s6"
              headers={["#", "Initiative", "Tier", "Action", "Reason"]}
              sourceRows={s6SourceRows}
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={7} title="What We Track" />
            <AddableReportTable
              tableId="s7"
              headers={["Focus Area", "Metric", "Source", "Why It Matters"]}
              sourceRows={s7SourceRows}
              edits={edits}
              onEdit={onEdit}
            />

            {sectionQssb && sectionQssb.clientInsights.length > 0 && (
              <>
                <SectionHeading num={8} title="Client Insights" />
                <div style={{ fontSize: "11px", color: "#374151", marginBottom: 12 }} data-testid="qssb-insights-section">
                  {sectionQssb.clientInsights.map((insight, i) => (
                    <div key={i} style={{ marginBottom: 6, paddingLeft: 12, borderLeft: `3px solid ${ACCENT}44` }}>
                      <EditableCell editKey={`qssb_insight_${i}`} value={insight.question} edits={edits} onEdit={onEdit} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Additional Opportunities — commented out pending redesign
            {sectionQssb && sectionQssb.additionalOpportunities.length > 0 && (
              <>
                <SectionHeading num={sectionQssb.clientInsights.length > 0 ? 9 : 8} title="Additional Opportunities" />
                <div style={{ marginBottom: 16 }} data-testid="qssb-opportunities-table">
                  {sectionQssb.additionalOpportunities.map((opp, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 700, color: ACCENT, minWidth: 18, flexShrink: 0, fontSize: "11px" }}>{i + 1}.</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "11px", color: "#111827", marginBottom: 2 }}>
                          <EditableCell editKey={`qssb_opp_${i}_0`} value={opp.title} edits={edits} onEdit={onEdit} />
                        </div>
                        <div style={{ fontSize: "10px", color: "#4B5563" }}>
                          <EditableCell editKey={`qssb_opp_${i}_1`} value={opp.description} edits={edits} onEdit={onEdit} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            */}

            {generationMeta && (
              <div style={{ fontSize: "9px", color: "#9CA3AF", marginTop: 16 }}>
                <strong>Sources used:</strong> {generationMeta.dataSources.join(", ") || "None"}
                {generationMeta.missingData.length > 0 && (
                  <span> · <strong>Missing:</strong> {generationMeta.missingData.join(", ")}</span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid #9CA3AF",
              marginTop: "24px",
              paddingTop: "8px",
              paddingBottom: "32px",
              textAlign: "center",
              fontSize: "10px",
              color: "#6B7280",
            }}
          >
            Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io
          </div>
        </div>
      </div>
    </div>
  );
}
