import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { EditableSection } from "./editable-section";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";

const ACCENT = "#C0392B";
const TABLE_HEADER_BG = "#111827";

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
  conversionSource: string;
  notes: string;
}

interface ConvertingSourceRow {
  source: string;
  whatsConverting: string;
  notes: string;
}

interface TrafficTopicRow {
  topic: string;
  exampleQueries: string;
  connectionToAdmits: string;
  insight: string;
}

interface TrafficPageRow {
  page: string;
  clicks: string;
  ctr: string;
  connectionToAdmits: string;
  insight: string;
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
}

interface TrackingRow {
  focusArea: string;
  metric: string;
  source: string;
  whyItMatters: string;
}

export interface QbrPrepPreviewProps {
  meta: QbrPrepMeta;
  section1Goals: { rows: GoalRow[] };
  section2Conversions: { topConvertingPages: ConvertingPageRow[]; topConvertingSources: ConvertingSourceRow[] };
  section3Traffic: { topTrafficTopics: TrafficTopicRow[]; topTrafficPages: TrafficPageRow[] };
  section4Services: { services: ServiceRow[] };
  section5Diagnosis: { tier: number; tierName: string; diagnosis: string };
  section6Priorities: { priorities: PriorityRow[] };
  section7Tracking: { tracking: TrackingRow[] };
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  generationMeta?: { dataSources: string[]; missingData: string[] };
}

function ManualEntry({ text }: { text?: string }) {
  const isManual = text && (text.includes("Manual entry needed") || text === "Manual entry needed");
  if (!isManual) return null;
  return <span style={{ fontStyle: "italic", color: "#9CA3AF", fontSize: "10px" }}>{text}</span>;
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

function DataTable({
  headers,
  rows,
  editKeyPrefix,
  edits,
  onEdit,
}: {
  headers: string[];
  rows: string[][];
  editKeyPrefix: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
        <thead>
          <tr>
            {headers.map((h, hi) => (
              <th
                key={hi}
                style={{
                  backgroundColor: TABLE_HEADER_BG,
                  color: "white",
                  padding: "6px 8px",
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? "#F9FAFB" : "white" }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #F3F4F6",
                    verticalAlign: "top",
                    lineHeight: 1.4,
                  }}
                >
                  <EditableCell
                    editKey={`${editKeyPrefix}_${ri}_${ci}`}
                    value={cell}
                    edits={edits}
                    onEdit={onEdit}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  edits,
  onEdit,
  generationMeta,
}: QbrPrepPreviewProps) {
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, []);

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

            <SectionHeading num={1} title="What Matters Most This Quarter" />
            <DataTable
              headers={["Goal Type", "Goal", "Measurement Source", "Goal Shift vs Last Quarter", "Reason"]}
              rows={section1Goals.rows.map(r => [r.goalType, r.goal, r.measurementSource, r.goalShift, r.reason])}
              editKeyPrefix="s1"
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={2} title="Where Conversions Actually Happen" />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Pages</div>
            <DataTable
              headers={["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"]}
              rows={section2Conversions.topConvertingPages.map(r => [r.type, r.page, r.conversionSource, r.notes])}
              editKeyPrefix="s2a"
              edits={edits}
              onEdit={onEdit}
            />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Sources</div>
            <DataTable
              headers={["Source", "What's Converting", "Notes / What We're Learning"]}
              rows={section2Conversions.topConvertingSources.map(r => [r.source, r.whatsConverting, r.notes])}
              editKeyPrefix="s2b"
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={3} title="Top Organic Traffic Drivers" />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Topics</div>
            <DataTable
              headers={["Topic", "Example Queries", "Connection to Admits", "Insight"]}
              rows={section3Traffic.topTrafficTopics.map(r => [r.topic, r.exampleQueries, r.connectionToAdmits, r.insight])}
              editKeyPrefix="s3a"
              edits={edits}
              onEdit={onEdit}
            />
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Pages</div>
            <DataTable
              headers={["Page", "Clicks", "CTR", "Connection to Admits", "Insight"]}
              rows={section3Traffic.topTrafficPages.map(r => [r.page, r.clicks, r.ctr, r.connectionToAdmits, r.insight])}
              editKeyPrefix="s3b"
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={4} title="Site Service Overview" />
            <DataTable
              headers={["Service", "Example Page"]}
              rows={section4Services.services.map(r => [r.service, r.examplePage])}
              editKeyPrefix="s4"
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
            <DataTable
              headers={["#", "Initiative", "Tier", "Action", "Reason"]}
              rows={section6Priorities.priorities.map(r => [String(r.priority), r.initiative, r.tier, r.action, r.reason])}
              editKeyPrefix="s6"
              edits={edits}
              onEdit={onEdit}
            />

            <SectionHeading num={7} title="What We Track" />
            <DataTable
              headers={["Focus Area", "Metric", "Source", "Why It Matters"]}
              rows={section7Tracking.tracking.map(r => [r.focusArea, r.metric, r.source, r.whyItMatters])}
              editKeyPrefix="s7"
              edits={edits}
              onEdit={onEdit}
            />

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
