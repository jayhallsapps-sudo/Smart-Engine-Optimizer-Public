import { useState, useEffect, useContext } from "react";
import { EditableSection, ReadModeContext } from "./editable-section";
import { MetricCard } from "./report-chart";
import { getCustomRows, setCustomRows } from "./report-table";
import deckHeaderImg from "@assets/HEADER_IMAGE_trans_deck_1774198073365.png";

// ─── Slide type definition — lives here to avoid circular imports ─────────────
export interface DecisionOption {
  label: string;
  subtitle?: string;
  pros: string[];
  cons?: string[];
  recommended?: boolean;
}

export interface IAItem {
  label: string;
  children?: string[];
}

export interface ContentCluster {
  hub: string;
  pages: string[];
}

export interface Slide {
  id: string;
  type:
    | "title"
    | "divider"
    | "metrics"
    | "table"
    | "chart-bar"
    | "chart-line"
    | "bullets"
    | "two-col"
    | "scorecard"
    | "decision-card"
    | "ia-comparison"
    | "cluster-map"
    // Monthly V2 — Phase 3d Step 2b additions. Renderers land in Phase 3e;
    // until then the SlideRenderer default branch shows a placeholder card.
    | "exec_summary"
    | "outcomes"
    | "visibility"
    | "keyword_table"
    | "intent_alignment"
    | "stat_grid"
    | "content_pipeline"
    | "initiatives"
    // Phase 3h — AM-authored custom slides. AI synthesizes the layout from a
    // free-form brief; the chosen `layout` field drives MonthlyCustomSlide.
    | "custom";
  title?: string;
  subtitle?: string;
  commentary?: string;
  clientName?: string;
  date?: string;
  sectionLabel?: string;
  metrics?: Array<{
    label: string;
    current: string;
    previous?: string;
    delta?: string;
    isPositive?: boolean;
    source?: string;
    sourceNote?: string;
  }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  chartData?: Array<{ label: string; [key: string]: string | number }>;
  chartKeys?: string[];
  bullets?: string[];
  leftContent?: {
    type: "bullets" | "table";
    bullets?: string[];
    table?: { headers: string[]; rows: (string | number)[][] };
  };
  rightContent?: {
    type: "chart-bar" | "chart-line" | "metrics";
    chartData?: Array<{ label: string; [key: string]: string | number }>;
    chartKeys?: string[];
    metrics?: Array<{
      label: string;
      current: string;
      previous?: string;
      delta?: string;
      isPositive?: boolean;
      source?: string;
    }>;
  };
  loading?: boolean;
  decisionOptions?: DecisionOption[];
  decisionConclusion?: string;
  currentIA?: IAItem[];
  futureIA?: IAItem[];
  clusters?: ContentCluster[];
  hidden?: boolean;
  producedBy?: string;
  sourceNote?: string;
  reportFamily?: string;
  // ─── Monthly V2 — Phase 3d Step 2b fields ──────────────────────────────
  // AI-generated headline / narrative / key moves for the executive summary
  // slide. Phase 3f populates these; Step 2b sets placeholder strings.
  headline?: string;
  narrative?: string;
  keyMoves?: string[];
  // QTD goal pacing for the outcomes slide. Computed in the generator from
  // the NSM Tracker sheet + QTD actuals; rendered as badge row in Phase 3e.
  pacingBadges?: Array<{
    label: string;
    current: string;
    goal: string;
    status: string;
    pacingPercent: string;
  }>;
  // Search-intent misalignment findings (slide 6). Phase 3f rewrites the
  // recommendation copy; Step 2b emits placeholder text from raw GSC data.
  intentFindings?: Array<{
    url: string;
    expected: string;
    observed: string;
    recommendation: string;
  }>;
  // ─── Phase 3h — custom slide fields ────────────────────────────────────
  // Layout picked by the AI from the AM's brief. MonthlyCustomSlide branches
  // on this value. `sections` is the prose-card body (eyebrow + body pairs).
  layout?: "stat_grid" | "prose_card" | "comparison_table" | "story";
  sections?: Array<{ eyebrow: string; body: string }>;
}

// ─── Design tokens (single source of truth for the slide system) ─────────────
export const SLIDE_W = 720;
export const SLIDE_H = 405;
export const RED            = "#C0392B";
export const NAVY           = "#1B3A6B";
export const ROW_ALT        = "#F9FAFB";
export const PAGE_BG        = "#F8FAFC";
export const TEXT_PRIMARY   = "#111827";
export const TEXT_SECONDARY = "#6B7280";
export const BORDER_COLOR   = "#E5E7EB";

// ─── Monthly V2 — Dashboard tokens ───────────────────────────────────────────
// Premium research-report aesthetic. Black header band, warm off-white page,
// white content cards, brand red as accent only. Mockup direction "Option B".
// These are ADDITIVE — they don't replace the legacy tokens above so existing
// biweekly / qbr / mid-strategy reports keep their current look.
export const MV2_BG_PAGE        = "#FAFAF7";   // warm off-white page surface
export const MV2_BG_CARD        = "#FFFFFF";   // pure white for cards
export const MV2_BG_HEADER      = "#1A1A1A";   // near-black header band
export const MV2_BG_FOOTER      = "#1A1A1A";   // matching footer band
export const MV2_BG_SUBTLE      = "#F4F1E8";   // subtle warm panel (callouts)
export const MV2_ACCENT         = "#C0392B";   // brand red — accents only
export const MV2_TEXT_HEADER    = "#FFFFFF";   // text on dark band
export const MV2_TEXT_PRIMARY   = "#1A1A1A";   // body on light surfaces
export const MV2_TEXT_SECONDARY = "#5F5E5A";   // muted/secondary text
export const MV2_TEXT_MUTED     = "#888888";   // tiny labels, page numbers
export const MV2_BORDER         = "#EDEAE0";   // subtle warm border
export const MV2_DIVIDER        = "#D3D1C7";   // emphasized divider
export const MV2_POSITIVE       = "#1F8A4C";   // dark green for positive deltas
export const MV2_NEGATIVE       = "#C0392B";   // same red for negative deltas
// Typography stack — matches biweekly Google Docs work (Archivo headers, Inter body)
export const MV2_FONT_HEADER    = "'Archivo', 'Helvetica Neue', Arial, sans-serif";
export const MV2_FONT_BODY      = "'Inter', 'Segoe UI', Arial, sans-serif";

// Table header tokens — intentionally matching biweekly system exactly
// biweekly: backgroundColor="#F9FAFB", color="#6B7280", fontWeight=500 (font-medium), no uppercase
export const TABLE_HEADER_BG   = "#F9FAFB";
export const TABLE_HEADER_TEXT = "#6B7280";
export const TABLE_HEADER_WEIGHT: number = 500;

export const INNER_HEADER_H = 58;
export const TITLE_HEADER_H = 140;

// ─── Header asset hook — mirrors biweekly/QBR logic ─────────────────────────
// Fetches the user-uploaded asset from /api/template/header (same source as biweekly).
// Falls back to the bundled deck PNG if the server has nothing uploaded.
export function useReportHeader(): string {
  const [url, setUrl] = useState<string>(deckHeaderImg as string);
  useEffect(() => {
    fetch("/api/template/header")
      .then(r => { if (!r.ok) throw new Error("no header"); return r.blob(); })
      .then(blob => setUrl(URL.createObjectURL(blob)))
      .catch(() => { /* keep bundled fallback */ });
  }, []);
  return url;
}

// ─── ReportTopHeader ─────────────────────────────────────────────────────────
// Inner-slide header: real header image with slide title overlaid on white area.
// The Webserv mark is embedded in the right-side of the image — no hardcoded text needed.
export function ReportTopHeader({
  slideTitle,
  headerUrl,
}: {
  slideTitle?: string;
  headerUrl: string;
}) {
  return (
    <div style={{ position: "relative", flexShrink: 0, width: "100%" }}>
      <img
        src={headerUrl}
        alt=""
        style={{
          width: "100%",
          height: INNER_HEADER_H,
          objectFit: "cover",
          objectPosition: "top right",
          display: "block",
          flexShrink: 0,
        }}
      />
      {slideTitle && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            paddingLeft: 20,
            paddingRight: 210,
          }}
        >
          <span
            style={{
              color: TEXT_PRIMARY,
              fontWeight: 700,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {slideTitle}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── ReportTopHeaderLarge ────────────────────────────────────────────────────
// Title / divider slide header: taller crop showing more of the swoosh curve.
export function ReportTopHeaderLarge({
  height = TITLE_HEADER_H,
  headerUrl,
}: {
  height?: number;
  headerUrl: string;
}) {
  return (
    <img
      src={headerUrl}
      alt=""
      style={{
        width: "100%",
        height,
        objectFit: "cover",
        objectPosition: "top right",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
}

// ─── ReportTitleBlock ────────────────────────────────────────────────────────
export function ReportTitleBlock({
  slideId,
  title,
  clientName,
  date,
  edits,
  onEdit,
}: {
  slideId: string;
  title: string;
  clientName?: string;
  date?: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: TEXT_PRIMARY, fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>
        <EditableSection editKey={`${slideId}_title`} value={title} edits={edits} onEdit={onEdit} as="div" />
      </div>
      {clientName !== undefined && (
        <div style={{ color: RED, fontSize: 15, fontWeight: 600 }}>
          <EditableSection editKey={`${slideId}_client`} value={clientName} edits={edits} onEdit={onEdit} as="div" />
        </div>
      )}
      {date && <div style={{ color: TEXT_SECONDARY, fontSize: 10 }}>{date}</div>}
    </div>
  );
}

// ─── ReportSectionHeader ─────────────────────────────────────────────────────
export function ReportSectionHeader({
  slideId,
  title,
  subtitle,
  edits,
  onEdit,
}: {
  slideId: string;
  title: string;
  subtitle?: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 48px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: RED, letterSpacing: "0.18em", textTransform: "uppercase" }}>
        Section
      </div>
      <div style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: 800, lineHeight: 1.25, maxWidth: 520, textAlign: "center" }}>
        <EditableSection editKey={`${slideId}_title`} value={title} edits={edits} onEdit={onEdit} as="div" />
      </div>
      {subtitle && (
        <div style={{ color: TEXT_SECONDARY, fontSize: 11, textAlign: "center" }}>
          <EditableSection editKey={`${slideId}_subtitle`} value={subtitle} edits={edits} onEdit={onEdit} as="div" />
        </div>
      )}
    </div>
  );
}

// ─── ReportTable ─────────────────────────────────────────────────────────────
// Shared table component. Header styling intentionally matches biweekly:
//   bg: #F9FAFB, text: #6B7280, weight: 500, no uppercase, border: #E5E7EB
export function ReportTable({
  headers,
  rows,
  cellPadding = "3px 6px",
  fontSize = 8,
  maxRows,
}: {
  headers: string[];
  rows: (string | number)[][];
  cellPadding?: string;
  fontSize?: number;
  maxRows?: number;
}) {
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;
  const truncated = maxRows ? rows.length - maxRows : 0;
  return (
    <div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize,
          border: `1px solid ${BORDER_COLOR}`,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: TABLE_HEADER_BG }}>
            {headers.map((h, hi) => (
              <th
                key={hi}
                style={{
                  color: TABLE_HEADER_TEXT,
                  padding: cellPadding,
                  textAlign: "left",
                  fontWeight: TABLE_HEADER_WEIGHT,
                  fontSize: Math.max(fontSize - 1, 7),
                  borderBottom: `1px solid ${BORDER_COLOR}`,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : ROW_ALT }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: cellPadding,
                    borderBottom: `1px solid ${BORDER_COLOR}`,
                    borderRight: `1px solid #F3F4F6`,
                    color: TEXT_PRIMARY,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated > 0 && (
        <div style={{ fontSize: 7, color: TEXT_SECONDARY, marginTop: 4 }}>
          + {truncated} more rows in full export
        </div>
      )}
    </div>
  );
}

// ─── SlideTableWithCustomRows ─────────────────────────────────────────────────
// Editable table for slides. Uses ReportTable for display rows, adds custom-row editing.
function SlideCustomRowCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onChange(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ width: "100%", fontSize: 7.5, fontFamily: "inherit", padding: "1px 3px", border: "1px solid #9CA3AF", borderRadius: 2, outline: "none" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{ display: "block", cursor: "text", color: value ? TEXT_PRIMARY : TEXT_SECONDARY, fontStyle: value ? "normal" : "italic", fontSize: 7.5, minHeight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {value || "Edit…"}
    </span>
  );
}

export function SlideTableWithCustomRows({
  slideId,
  tableKey,
  headers,
  rows,
  edits,
  onEdit,
  maxRows = 18,
  darkHeader = false,
}: {
  slideId: string;
  tableKey: string;
  headers: string[];
  rows: (string | number)[][];
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  maxRows?: number;
  darkHeader?: boolean;
}) {
  const readMode = useContext(ReadModeContext);
  const tableId = `${slideId}_${tableKey}`;
  const customRows = getCustomRows(edits, tableId);
  const colCount = headers.length;
  const cellPadding = "3px 6px";
  const fontSize = 8;

  const hdrBg   = darkHeader ? "#1F2937" : TABLE_HEADER_BG;
  const hdrText = darkHeader ? "#FFFFFF"  : TABLE_HEADER_TEXT;
  const hdrWeight: number = darkHeader ? 700 : TABLE_HEADER_WEIGHT;

  function addRow() {
    setCustomRows(tableId, [...customRows, Array(colCount).fill("")], onEdit);
  }
  function updateCell(ri: number, ci: number, val: string) {
    setCustomRows(tableId, customRows.map((r, r_i) => r_i === ri ? r.map((c, c_i) => c_i === ci ? val : c) : r), onEdit);
  }
  function deleteRow(ri: number) {
    setCustomRows(tableId, customRows.filter((_, r_i) => r_i !== ri), onEdit);
  }

  const displayRows = rows.slice(0, maxRows);
  const truncated = Math.max(0, rows.length - maxRows);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize, border: `1px solid ${BORDER_COLOR}`, overflow: "hidden" }}>
        <thead>
          <tr style={{ backgroundColor: hdrBg }}>
            {headers.map((h, hi) => (
              <th key={hi} style={{ color: hdrText, padding: cellPadding, textAlign: "left", fontWeight: hdrWeight, fontSize: Math.max(fontSize - 1, 7), borderBottom: darkHeader ? "none" : `1px solid ${BORDER_COLOR}`, whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : ROW_ALT }}>
              {row.map((cellVal, ci) => (
                <td key={ci} style={{ padding: cellPadding, borderBottom: `1px solid ${BORDER_COLOR}`, borderRight: `1px solid #F3F4F6`, color: TEXT_PRIMARY, overflow: "hidden" }}>
                  <EditableSection
                    editKey={`${slideId}_cell_${ri}_${ci}`}
                    value={String(cellVal)}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    className="block"
                    style={{ fontSize, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as any}
                  />
                </td>
              ))}
            </tr>
          ))}
          {!readMode && customRows.map((row, ri) => {
            const absRi = rows.length + ri;
            return (
              <tr key={`cr-${absRi}`} style={{ background: "#FFFBEB" }}>
                {row.map((cellVal, ci) => {
                  const isLast = ci === colCount - 1;
                  return (
                    <td key={ci} style={{ padding: "2px 4px", borderBottom: `1px solid ${BORDER_COLOR}`, borderRight: `1px solid #F3F4F6`, overflow: "hidden" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <span style={{ flex: 1, overflow: "hidden" }}>
                          <SlideCustomRowCell value={cellVal} onChange={v => updateCell(ri, ci, v)} />
                        </span>
                        {isLast && (
                          <button
                            onClick={() => deleteRow(ri)}
                            data-testid={`button-delete-sliderow-${tableId}-${ri}`}
                            style={{ flexShrink: 0, color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {truncated > 0 && <div style={{ fontSize: 7, color: TEXT_SECONDARY, marginTop: 4 }}>+ {truncated} more rows in full export</div>}
      {!readMode && (
        <button
          onClick={addRow}
          data-testid={`button-add-row-${tableId}`}
          style={{ fontSize: 7, color: TEXT_SECONDARY, marginTop: 3, background: "none", border: "1px dashed #D1D5DB", borderRadius: 3, padding: "1px 6px", cursor: "pointer", display: "block" }}
        >
          + Add row
        </button>
      )}
    </div>
  );
}

// ─── ReportNarrativeCallout ───────────────────────────────────────────────────
export function ReportNarrativeCallout({
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
  return (
    <div style={{ padding: "6px 12px", background: "#FFF5F3", borderLeft: `3px solid ${RED}`, borderRadius: 3 }}>
      <EditableSection
        editKey={editKey}
        value={value}
        edits={edits}
        onEdit={onEdit}
        as="div"
        multiline
        style={{ fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.6 } as any}
      />
    </div>
  );
}

// ─── ReportFooter ─────────────────────────────────────────────────────────────
export function ReportFooter() {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
      <div style={{ height: 2, background: RED, opacity: 0.3 }} />
      <div
        style={{
          height: 22,
          background: "#F4F6F8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 16,
          paddingRight: 16,
          borderTop: `1px solid ${BORDER_COLOR}`,
        }}
      >
        <span style={{ fontSize: 7, color: TEXT_SECONDARY }}>Webserv  |  webserv.io</span>
        <span style={{ fontSize: 7, color: "#C5CBD3", letterSpacing: "0.04em" }}>CONFIDENTIAL</span>
      </div>
    </div>
  );
}

// ─── ReportMetricCard — re-export for the new architecture ───────────────────
export { MetricCard as ReportMetricCard };

// ═══════════════════════════════════════════════════════════════════════════════
// MONTHLY V2 — Dashboard primitives
// ─────────────────────────────────────────────────────────────────────────────
// Building blocks for the new monthly report design ("Option B / Dashboard").
// All components below assume:
//   - Slide canvas is SLIDE_W x SLIDE_H (720 x 405)
//   - Parent is `position: relative; overflow: hidden`
//   - Page background is MV2_BG_PAGE (warm off-white)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── MV2HeaderBand ────────────────────────────────────────────────────────────
// Black header band that anchors every content slide.
// Shows slide title (large) + subtitle (small, lighter) on the left,
// page indicator (e.g. "06 / 10") on the right.
export function MV2HeaderBand({
  title,
  subtitle,
  pageIndicator,
  height = 60,
}: {
  title: string;
  subtitle?: string;
  pageIndicator?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        background: MV2_BG_HEADER,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 28,
        paddingRight: 28,
        fontFamily: MV2_FONT_HEADER,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: MV2_TEXT_HEADER,
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: "-0.2px",
            lineHeight: 1.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: "#9B9A95",
              fontSize: 9,
              letterSpacing: "0.5px",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {pageIndicator && (
        <div
          style={{
            fontFamily: MV2_FONT_BODY,
            fontSize: 9,
            color: "#666666",
            letterSpacing: "1px",
            whiteSpace: "nowrap",
            marginLeft: 12,
          }}
        >
          {pageIndicator}
        </div>
      )}
    </div>
  );
}

// ─── MV2Footer ────────────────────────────────────────────────────────────────
// Near-black footer band. Shows source label on left, date label on right,
// thin red accent line at top.
export function MV2Footer({
  sourceLabel,
  dateLabel,
  height = 28,
}: {
  sourceLabel?: string;
  dateLabel?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height,
        background: MV2_BG_FOOTER,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 28,
        paddingRight: 28,
        borderTop: `2px solid ${MV2_ACCENT}`,
        fontFamily: MV2_FONT_BODY,
      }}
    >
      {sourceLabel && (
        <span style={{ fontSize: 7, color: "#888888", letterSpacing: "0.3px" }}>
          {sourceLabel}
        </span>
      )}
      {dateLabel && (
        <span style={{ fontSize: 7, color: "#888888", letterSpacing: "0.3px" }}>
          {dateLabel}
        </span>
      )}
    </div>
  );
}

// ─── MV2StatCard ─────────────────────────────────────────────────────────────
// Small metric card for use inside a dashboard grid. White card, dark label,
// big number, delta in green/red.
export function MV2StatCard({
  label,
  value,
  delta,
  deltaPositive,
  accent = false,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  accent?: boolean;
}) {
  const deltaColor = deltaPositive === true
    ? MV2_POSITIVE
    : deltaPositive === false
    ? MV2_NEGATIVE
    : MV2_TEXT_SECONDARY;

  return (
    <div
      style={{
        background: MV2_BG_CARD,
        border: `1px solid ${MV2_BORDER}`,
        borderRadius: 5,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        boxShadow: accent ? "0 1px 2px rgba(0,0,0,0.04)" : undefined,
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: MV2_TEXT_MUTED,
          letterSpacing: "0.4px",
          textTransform: "uppercase",
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: MV2_TEXT_PRIMARY,
          lineHeight: 1.1,
          letterSpacing: "-0.4px",
          fontFamily: MV2_FONT_HEADER,
        }}
      >
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 9, color: deltaColor, fontWeight: 500 }}>
          {delta}
        </div>
      )}
    </div>
  );
}

// ─── MV2ContentCard ─────────────────────────────────────────────────────────
// Simple white wrapper with subtle border. Used for charts, callouts, tables.
export function MV2ContentCard({
  children,
  padding = "12px",
  style,
}: {
  children: React.ReactNode;
  padding?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: MV2_BG_CARD,
        border: `1px solid ${MV2_BORDER}`,
        borderRadius: 5,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── MV2InsightCallout ───────────────────────────────────────────────────────
// Light-warm panel for AI commentary / narrative blocks.
export function MV2InsightCallout({
  text,
  style,
}: {
  text: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: MV2_BG_SUBTLE,
        borderLeft: `2px solid ${MV2_ACCENT}`,
        borderRadius: 4,
        padding: "10px 14px",
        ...style,
      }}
    >
      {text}
    </div>
  );
}

// ─── MV2MoversList ────────────────────────────────────────────────────────────
// Compact vertical list of items with a red square bullet. Used for
// keyword movers, top pages, or any ranked list.
export function MV2MoversList({
  items,
  maxItems = 10,
  renderExtra,
}: {
  items: { label: string; value: string; delta?: string; deltaPositive?: boolean }[];
  maxItems?: number;
  renderExtra?: (item: (typeof items)[0]) => React.ReactNode;
}) {
  const visible = items.slice(0, maxItems);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {visible.map((it, i) => {
        const deltaColor = it.deltaPositive === true
          ? MV2_POSITIVE
          : it.deltaPositive === false
          ? MV2_NEGATIVE
          : MV2_TEXT_SECONDARY;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: i < visible.length - 1 ? 5 : 0,
              borderBottom: i < visible.length - 1 ? `0.5px solid ${MV2_BORDER}` : "none",
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                background: MV2_ACCENT,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: MV2_TEXT_PRIMARY,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.label}
            </span>
            <span style={{ fontSize: 9, fontWeight: 600, color: MV2_TEXT_PRIMARY, whiteSpace: "nowrap" }}>
              {it.value}
            </span>
            {it.delta && (
              <span style={{ fontSize: 8, color: deltaColor, whiteSpace: "nowrap" }}>
                {it.delta}
              </span>
            )}
            {renderExtra?.(it)}
          </div>
        );
      })}
    </div>
  );
}

// ─── MV2Column type ───────────────────────────────────────────────────────────
export interface MV2Column {
  header: string;
  format?: "text" | "number" | "delta";
  align?: "left" | "right" | "center";
  width?: number | string;
}

// ─── MV2Table ─────────────────────────────────────────────────────────────────
// Clean dashboard table matching the MV2 aesthetic. Uses the warm border
// palette, white cells, and auto-formats delta columns (red/green).
export function MV2Table({
  columns,
  rows,
  fontSize = 9,
  maxRows,
  rowHeight = 22,
}: {
  columns: MV2Column[];
  rows: (string | number)[][];
  fontSize?: number;
  maxRows?: number;
  rowHeight?: number;
}) {
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;
  const truncated = maxRows ? rows.length - maxRows : 0;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize,
          fontFamily: MV2_FONT_BODY,
        }}
      >
        <thead>
          <tr>
            {columns.map((col, ci) => (
              <th
                key={ci}
                style={{
                  textAlign: col.align ?? "left",
                  padding: "4px 8px",
                  fontWeight: 500,
                  color: MV2_TEXT_MUTED,
                  letterSpacing: "0.3px",
                  borderBottom: `1px solid ${MV2_DIVIDER}`,
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  background: MV2_BG_CARD,
                  fontSize: Math.max(fontSize - 1, 7),
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background: ri % 2 === 0 ? MV2_BG_CARD : MV2_BG_PAGE,
                height: rowHeight,
              }}
            >
              {row.map((cell, ci) => {
                const col = columns[ci];
                const isDelta = col?.format === "delta";
                const raw = String(cell);
                const isPositive = isDelta && (raw.startsWith("+") || (!raw.startsWith("-") && raw !== "0" && raw !== "0%" && raw !== "—"));
                const isNegative = isDelta && raw.startsWith("-");
                return (
                  <td
                    key={ci}
                    style={{
                      padding: "3px 8px",
                      textAlign: col?.align ?? "left",
                      color: isPositive
                        ? MV2_POSITIVE
                        : isNegative
                        ? MV2_NEGATIVE
                        : MV2_TEXT_PRIMARY,
                      borderBottom: `0.5px solid ${MV2_BORDER}`,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontWeight: isDelta ? 500 : 400,
                    }}
                  >
                    {raw}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated > 0 && (
        <div style={{ fontSize: 7, color: MV2_TEXT_MUTED, marginTop: 4, paddingLeft: 8 }}>
          + {truncated} more rows in full export
        </div>
      )}
    </div>
  );
}
