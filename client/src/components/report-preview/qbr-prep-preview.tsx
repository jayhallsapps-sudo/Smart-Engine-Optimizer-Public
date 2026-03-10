import React, { useState, useEffect, useRef } from "react";
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

interface AdditionalOpportunity {
  type: "upsell" | "cross_sell";
  title: string;
  why_now: string;
  evidence: string[];
  recommendation: string;
  framing: string;
}

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
  additionalOpportunities?: AdditionalOpportunity[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  generationMeta?: { dataSources: string[]; missingData: string[] };
  amInputs?: { clientSentiment?: string; amThoughts?: string; priorityChecks?: string; clientNotes?: string };
}

function QueryChipsCell({
  editKey,
  value,
  edits,
  onEdit,
}: {
  editKey: string;
  value: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = edits[editKey] ?? value;
  const chips = current
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);

  function startEdit() {
    setDraft(current);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    onEdit(editKey, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "100%" }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 6px", fontSize: "10px", outline: "none" }}
          data-testid={`input-edit-${editKey}`}
        />
      </span>
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 3 }}
      data-testid={`chips-${editKey}`}
    >
      {chips.length > 0 ? chips.map((chip, ci) => (
        <span
          key={ci}
          style={{
            display: "inline-block",
            background: `${ACCENT}12`,
            border: `1px solid ${ACCENT}28`,
            borderRadius: 10,
            padding: "1px 7px",
            fontSize: "9px",
            color: "#374151",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
          data-testid={`chip-query-${editKey}-${ci}`}
        >
          {chip}
        </span>
      )) : (
        <span style={{ color: "#9CA3AF", fontSize: "10px", fontStyle: "italic" }}>—</span>
      )}
    </span>
  );
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
  additionalOpportunities,
  edits,
  onEdit,
  generationMeta,
  amInputs,
}: QbrPrepPreviewProps) {
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);
  const [showSection8, setShowSection8] = useState(true);

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
    <EditableCell key="cs" editKey={`s2a_${ri}_3`} value={(r as any).conversionSource ?? r.dataSource ?? "—"} edits={edits} onEdit={onEdit} />,
    <EditableCell key="n" editKey={`s2a_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const s2cSourceRows: React.ReactNode[][] = (section2Conversions.topConversionPatterns ?? []).map((r, ri) => [
    <EditableCell key="p" editKey={`s2c_${ri}_0`} value={r.pattern} edits={edits} onEdit={onEdit} />,
    <EditableCell key="w" editKey={`s2c_${ri}_1`} value={r.whyItMatters} edits={edits} onEdit={onEdit} />,
    <EditableCell key="e" editKey={`s2c_${ri}_2`} value={r.evidence} edits={edits} onEdit={onEdit} />,
  ]);

  const s2bSourceRows: React.ReactNode[][] = section2Conversions.topConvertingSources.map((r, ri) => [
    <BadgeCell key="s" editKey={`s2b_${ri}_0`} value={r.source} dataSource={r.dataSource} edits={edits} onEdit={onEdit} />,
    <EditableCell key="wc" editKey={`s2b_${ri}_1`} value={r.whatsConverting} edits={edits} onEdit={onEdit} />,
    <EditableCell key="n" editKey={`s2b_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const hasTopicDeltas = section3Traffic.topTrafficTopics.some(r => r.queryCount != null);
  const topicColCount = hasTopicDeltas ? 7 : 3;

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
              headers={["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"]}
              sourceRows={s2aSourceRows}
              edits={edits}
              onEdit={onEdit}
            />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Conversion Patterns</div>
            <AddableReportTable
              tableId="s2c"
              headers={["Pattern", "Why It Matters", "Evidence"]}
              sourceRows={s2cSourceRows}
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
            <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", marginBottom: 12, backgroundColor: "#FFFDFB" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                    {["Topic", ...(hasTopicDeltas ? ["# Queries", "Δ Queries", "Impressions", "Δ Impressions"] : []), "Example Queries", "Connection to Admits"].map(h => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section3Traffic.topTrafficTopics.map((r, ri) => {
                    const insightVal = edits[`s3a_${ri}_3`] ?? r.insight;
                    const hasInsight = !!insightVal;
                    const cellBorder = hasInsight ? "none" : "1px solid #F3EDED";
                    const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
                    return (
                      <React.Fragment key={`topic-${ri}`}>
                        <tr style={{ backgroundColor: bg }}>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>
                            <EditableCell editKey={`s3a_${ri}_0`} value={r.topic} edits={edits} onEdit={onEdit} />
                          </td>
                          {hasTopicDeltas && <>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }} data-testid={`text-query-count-${ri}`}>{r.queryCount ?? "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.queryCountDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }} data-testid={`text-query-delta-${ri}`}>{r.queryCountDelta ?? "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }} data-testid={`text-impressions-${ri}`}>{r.impressions != null ? r.impressions.toLocaleString("en-US") : "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }} data-testid={`text-impressions-delta-${ri}`}>{r.impressionsDelta ?? "—"}</td>
                          </>}
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>
                            <QueryChipsCell editKey={`s3a_${ri}_1`} value={r.exampleQueries} edits={edits} onEdit={onEdit} />
                          </td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4 }}>
                            <EditableCell editKey={`s3a_${ri}_2`} value={r.connectionToAdmits} edits={edits} onEdit={onEdit} />
                          </td>
                        </tr>
                        {hasInsight && (
                          <tr style={{ backgroundColor: "#FFFBEB" }}>
                            <td colSpan={topicColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                              <EditableCell editKey={`s3a_${ri}_3`} value={r.insight} edits={edits} onEdit={onEdit} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
            {(() => {
              const raw = edits["s6_crossSells_confirmed"];
              if (!raw) return null;
              let items: { recommendation: string; type: string; relevance: string }[] = [];
              try { items = JSON.parse(raw); } catch { return null; }
              if (!items.length) return null;
              return (
                <div
                  style={{
                    marginBottom: 16,
                    border: `1px solid #3B82F640`,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                  data-testid="s6-crosssell-block"
                >
                  <div
                    style={{
                      backgroundColor: "#EFF6FF",
                      padding: "6px 10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#1D4ED8",
                      borderBottom: "1px solid #3B82F640",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Confirmed Opportunities (Cross-sell / Upsell)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#EFF6FF80" }}>
                        {["Opportunity", "Type", "Relevance"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "5px 8px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: "9px",
                              color: "#1D4ED8",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              borderBottom: "1px solid #3B82F640",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 1 ? "#F8FAFF" : "white" }}>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>{item.recommendation}</td>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "1px 6px",
                                borderRadius: 10,
                                fontSize: "9px",
                                fontWeight: 600,
                                backgroundColor: item.type === "upsell" ? "#FEF3C7" : "#DBEAFE",
                                color: item.type === "upsell" ? "#92400E" : "#1E40AF",
                              }}
                            >
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
            <AddableReportTable
              tableId="s7"
              headers={["Focus Area", "Metric", "Source", "Why It Matters"]}
              sourceRows={s7SourceRows}
              edits={edits}
              onEdit={onEdit}
            />

            {/* Client Insights — commented out pending redesign
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
            */}

            {/* QSSB Additional Opportunities — commented out pending redesign
            {sectionQssb && sectionQssb.additionalOpportunities.length > 0 && (
              <>
                <SectionHeading num={sectionQssb.clientInsights.length > 0 ? 9 : 8} title="Additional Opportunities" />
                ...
              </>
            )}
            */}

            {/* Section 8: Additional Opportunities
                  — auto-generated cards appear when the post-processing pass finds
                    justified upsell/cross-sell opportunities.
                  — manual AddableReportTable always stays below for AM additions. */}
            {(additionalOpportunities?.length ?? 0) > 0 ? (
              <>
                <div
                  style={{ color: ACCENT, fontWeight: 700, fontSize: "14px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4, marginBottom: 12, marginTop: 28 }}
                  data-testid="section-heading-8"
                >
                  8. Additional Opportunities
                </div>

                {/* Auto-generated opportunity cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {additionalOpportunities!.map((opp, i) => (
                    <div
                      key={i}
                      style={{ border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden", fontSize: "11px" }}
                      data-testid={`card-additional-opportunity-${i}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                        <span
                          style={{
                            display: "inline-block", padding: "1px 8px", borderRadius: 10,
                            fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em",
                            backgroundColor: opp.type === "upsell" ? "#FEF3C7" : "#DBEAFE",
                            color: opp.type === "upsell" ? "#92400E" : "#1E40AF",
                          }}
                          data-testid={`badge-opp-type-${i}`}
                        >
                          {opp.type === "upsell" ? "Upsell" : "Cross-sell"}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: "12px", color: "#111827" }} data-testid={`text-opp-title-${i}`}>{opp.title}</span>
                      </div>
                      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ color: "#374151", fontStyle: "italic" }} data-testid={`text-opp-whynow-${i}`}>{opp.why_now}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Evidence</div>
                          <ul style={{ margin: 0, paddingLeft: 16, color: "#374151" }}>
                            {opp.evidence.map((ev, j) => (
                              <li key={j} style={{ marginBottom: 2 }} data-testid={`text-opp-evidence-${i}-${j}`}>{ev}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Recommendation</div>
                          <div style={{ color: "#1B3A6B" }} data-testid={`text-opp-recommendation-${i}`}>{opp.recommendation}</div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF", borderTop: "1px solid #F3F4F6", paddingTop: 6, fontStyle: "italic" }}>{opp.framing}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Manual additions below auto-generated cards */}
                <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                  Additional manual entries
                </div>
                <AddableReportTable
                  tableId="s8_opportunities"
                  headers={["Description", "Purpose", "Est. Cost"]}
                  sourceRows={[]}
                  edits={edits}
                  onEdit={onEdit}
                />
              </>
            ) : showSection8 ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    color: ACCENT,
                    fontWeight: 700,
                    fontSize: "14px",
                    borderBottom: `2px solid ${ACCENT}`,
                    paddingBottom: 4,
                    marginBottom: 12,
                    marginTop: 28,
                  }}
                  data-testid="section-heading-8"
                >
                  <span>8. Additional Opportunities</span>
                  <button
                    onClick={() => setShowSection8(false)}
                    title="Remove section"
                    data-testid="button-remove-section8"
                    style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                  >
                    ×
                  </button>
                </div>
                <AddableReportTable
                  tableId="s8_opportunities"
                  headers={["Description", "Purpose", "Est. Cost"]}
                  sourceRows={[]}
                  edits={edits}
                  onEdit={onEdit}
                />
              </>
            ) : null}

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
