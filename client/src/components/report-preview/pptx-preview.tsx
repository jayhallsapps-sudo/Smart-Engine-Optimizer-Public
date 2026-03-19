import { useState, useEffect, useLayoutEffect, useContext } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { EditableSection, ReadModeContext } from "./editable-section";
import { ReportBarChart, ReportLineChart, MetricCard } from "./report-chart";
import { getCustomRows, setCustomRows } from "./report-table";

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
  type: "title" | "divider" | "metrics" | "table" | "chart-bar" | "chart-line" | "bullets" | "two-col" | "scorecard" | "decision-card" | "ia-comparison" | "cluster-map";
  title?: string;
  subtitle?: string;
  commentary?: string;
  clientName?: string;
  date?: string;
  sectionLabel?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  chartData?: Array<{ label: string; [key: string]: string | number }>;
  chartKeys?: string[];
  bullets?: string[];
  leftContent?: { type: "bullets" | "table"; bullets?: string[]; table?: { headers: string[]; rows: (string | number)[][] } };
  rightContent?: { type: "chart-bar" | "chart-line" | "metrics"; chartData?: Array<{ label: string; [key: string]: string | number }>; chartKeys?: string[]; metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }> };
  loading?: boolean;
  decisionOptions?: DecisionOption[];
  decisionConclusion?: string;
  currentIA?: IAItem[];
  futureIA?: IAItem[];
  clusters?: ContentCluster[];
  hidden?: boolean;
}

interface PptxPreviewProps {
  slides: Slide[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
}

const SLIDE_W = 720;
const SLIDE_H = 405;

// ─── Shared design tokens ───────────────────────────────────────────────────
const RED = "#C0392B";
const NAVY = "#1B3A6B";
const ROW_ALT = "#F9FAFB";
const PAGE_BG = "#F8FAFC";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER_COLOR = "#E5E7EB";
const HEADER_BG = RED;
const HEADER_TEXT = "white";
const TABLE_HEADER_BG = "#C0392B0D";
const TABLE_HEADER_TEXT = "#C0392B";

export function PptxPreview({ slides, edits, onEdit }: PptxPreviewProps) {
  const visibleSlides = slides.filter(s => !s.hidden);
  const [current, setCurrent] = useState(0);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const total = visibleSlides.length;
  const slide = visibleSlides[current];

  function prev() { setCurrent(c => Math.max(0, c - 1)); }
  function next() { setCurrent(c => Math.min(total - 1, c + 1)); }

  useEffect(() => {
    if (!isPresentMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setIsPresentMode(false); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); setCurrent(c => Math.min(total - 1, c + 1)); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setCurrent(c => Math.max(0, c - 1)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPresentMode, total]);

  return (
    <div className="flex flex-col h-full bg-gray-800" data-testid="pptx-preview">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={current === 0}
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
            data-testid="button-slide-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-300">
            Slide {current + 1} of {total}
          </span>
          <button
            onClick={next}
            disabled={current === total - 1}
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-30"
            data-testid="button-slide-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-gray-400 truncate max-w-xs">{slide?.title ?? ""}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">16:9</span>
          <button
            onClick={() => setIsPresentMode(true)}
            className="p-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Present (fullscreen)"
            data-testid="button-present-mode"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          {slide && (
            <div
              style={{
                width: SLIDE_W,
                minHeight: SLIDE_H,
                position: "relative",
                flexShrink: 0,
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                background: PAGE_BG,
                fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
                overflow: "hidden",
              }}
              data-testid={`slide-${slide.id}`}
            >
              <SlideRenderer slide={slide} edits={edits} onEdit={onEdit} />
            </div>
          )}
        </div>

        <div className="w-28 bg-gray-900 overflow-y-auto p-2 flex flex-col gap-2 shrink-0" data-testid="slide-thumbnails">
          {visibleSlides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              className={`relative w-full rounded border-2 overflow-hidden transition-all ${i === current ? "border-red-400" : "border-gray-600 hover:border-gray-400"}`}
              style={{ paddingTop: "56.25%", background: (s.type === "title" || s.type === "divider") ? RED : PAGE_BG }}
              data-testid={`thumb-slide-${i}`}
              title={s.title ?? `Slide ${i + 1}`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[6px] font-bold truncate px-1" style={{ color: s.type === "title" ? "rgba(255,255,255,0.9)" : NAVY }}>
                  {s.title ?? `Slide ${i + 1}`}
                </span>
              </div>
              <div className="absolute bottom-0.5 right-0.5 text-[6px] text-gray-400">{i + 1}</div>
            </button>
          ))}
        </div>
      </div>

      {isPresentMode && createPortal(
        <PresentationOverlay
          slide={slide}
          current={current}
          total={total}
          onPrev={prev}
          onNext={next}
          onExit={() => setIsPresentMode(false)}
          edits={edits}
          onEdit={onEdit}
        />,
        document.body
      )}
    </div>
  );
}

function PresentationOverlay({
  slide,
  current,
  total,
  onPrev,
  onNext,
  onExit,
  edits,
  onEdit,
}: {
  slide: Slide | undefined;
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    function compute() {
      const availW = window.innerWidth - 64;
      const availH = window.innerHeight - 120;
      setScale(Math.min(availW / SLIDE_W, availH / SLIDE_H, 2));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gray-950"
      data-testid="presentation-overlay"
    >
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 shrink-0">
        <div className="text-white text-sm font-medium truncate max-w-lg">
          {slide?.title ?? ""}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-gray-400 text-xs">
            {current + 1} / {total}
          </span>
          <button
            onClick={onExit}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Exit presentation (Esc)"
            data-testid="button-exit-present-mode"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {slide && (
          <ReadModeContext.Provider value={true}>
            <div
              style={{
                width: SLIDE_W,
                height: SLIDE_H,
                transform: `scale(${scale})`,
                transformOrigin: "center center",
                flexShrink: 0,
                boxShadow: "0 12px 48px rgba(0,0,0,0.7)",
                background: PAGE_BG,
                fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
                overflow: "hidden",
                position: "relative",
              }}
              data-testid={`present-slide-${slide.id}`}
            >
              <SlideRenderer slide={slide} edits={edits} onEdit={onEdit} />
            </div>
          </ReadModeContext.Provider>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-4 px-6 py-4 bg-gray-900 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={onPrev}
          disabled={current === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
          data-testid="button-present-prev"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-gray-300 text-sm tabular-nums w-20 text-center">
          {current + 1} of {total}
        </span>
        <button
          onClick={onNext}
          disabled={current === total - 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
          data-testid="button-present-next"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-gray-500 text-xs ml-4 hidden sm:block">
          ← → or Page Up/Down · Esc to exit
        </span>
      </div>
    </div>
  );
}

// ─── Shared slide primitives ─────────────────────────────────────────────────

function SlideHeader({ slideTitle }: { slideTitle?: string }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <div style={{
        height: 46,
        background: HEADER_BG,
        display: "flex",
        alignItems: "center",
        paddingLeft: 20,
        paddingRight: 20,
        borderBottom: "none",
      }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: "rgba(0,0,0,0.18)",
          borderRadius: "0 0 0 0",
        }} />
        <span style={{ color: HEADER_TEXT, fontWeight: 700, fontSize: 13, flex: 1, paddingLeft: 4 }}>{slideTitle}</span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.75)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Webserv</span>
      </div>
    </div>
  );
}

function SlideFooter() {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
      <div style={{ height: 2, background: RED, opacity: 0.35 }} />
      <div style={{
        height: 22,
        background: "#F4F6F8",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingRight: 16,
        paddingLeft: 16,
        borderTop: `1px solid ${BORDER_COLOR}`,
      }}>
        <span style={{ fontSize: 7, color: TEXT_SECONDARY }}>Webserv  |  webserv.io</span>
        <span style={{ fontSize: 7, color: "#C5CBD3", letterSpacing: "0.04em" }}>CONFIDENTIAL</span>
      </div>
    </div>
  );
}

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
        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); if (e.key === "Enter") onChange(draft); }}
        style={{ width: "100%", fontSize: 7.5, fontFamily: "inherit", padding: "1px 3px", border: `1px solid ${RED}60`, borderRadius: 2, outline: "none" }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{
        display: "block",
        cursor: "text",
        color: value ? TEXT_PRIMARY : TEXT_SECONDARY,
        fontStyle: value ? "normal" : "italic",
        fontSize: 7.5,
        minHeight: 12,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {value || "Edit…"}
    </span>
  );
}

function SlideTableWithCustomRows({
  slideId,
  tableKey,
  headers,
  rows,
  edits,
  onEdit,
  colW,
  maxRows = 18,
}: {
  slideId: string;
  tableKey: string;
  headers: string[];
  rows: (string | number)[][];
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  colW: number;
  maxRows?: number;
}) {
  const readMode = useContext(ReadModeContext);
  const tableId = `${slideId}_${tableKey}`;
  const customRows = getCustomRows(edits, tableId);
  const colCount = headers.length;

  function addRow() {
    const next = [...customRows, Array(colCount).fill("")];
    setCustomRows(tableId, next, onEdit);
  }

  function updateCell(ri: number, ci: number, val: string) {
    const next = customRows.map((r, r_i) =>
      r_i === ri ? r.map((c, c_i) => (c_i === ci ? val : c)) : r,
    );
    setCustomRows(tableId, next, onEdit);
  }

  function deleteRow(ri: number) {
    const next = customRows.filter((_, r_i) => r_i !== ri);
    setCustomRows(tableId, next, onEdit);
  }

  const sourceRowCount = rows.length;

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, border: `1px solid ${RED}22`, overflow: "hidden" }}>
        <thead>
          <tr style={{ backgroundColor: TABLE_HEADER_BG }}>
            {headers.map((h, hi) => (
              <th key={hi} style={{ color: TABLE_HEADER_TEXT, padding: "4px 7px", textAlign: "left", fontWeight: 700, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${RED}22`, whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : ROW_ALT }}>
              {row.map((cellVal, ci) => (
                <td key={ci} style={{ padding: "3px 6px", borderBottom: `1px solid ${BORDER_COLOR}`, borderRight: `1px solid #F3F4F6`, maxWidth: colW, overflow: "hidden", color: TEXT_PRIMARY }}>
                  <EditableSection
                    editKey={`${slideId}_cell_${ri}_${ci}`}
                    value={String(cellVal)}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    className="block"
                    style={{ fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as any}
                  />
                </td>
              ))}
            </tr>
          ))}
          {!readMode && customRows.map((row, ri) => {
            const absRi = sourceRowCount + ri;
            return (
              <tr key={`cr-${absRi}`} style={{ background: "#FFFBEB" }}>
                {row.map((cellVal, ci) => {
                  const isLast = ci === colCount - 1;
                  return (
                    <td key={ci} style={{ padding: "2px 4px", borderBottom: `1px solid ${BORDER_COLOR}`, borderRight: "1px solid #F3F4F6", maxWidth: colW, overflow: "hidden" }}>
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
      {rows.length > maxRows && <div style={{ fontSize: 7, color: TEXT_SECONDARY, marginTop: 4 }}>+ {rows.length - maxRows} more rows in full export</div>}
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

// ─── Slide renderer ──────────────────────────────────────────────────────────

export function SlideRenderer({ slide, edits, onEdit }: { slide: Slide; edits: Record<string, string>; onEdit: (k: string, v: string) => void }) {
  if (slide.loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 animate-pulse p-8">
        <div className="h-6 bg-gray-200 rounded w-64" />
        <div className="h-3 bg-gray-100 rounded w-48" />
        <div className="h-3 bg-gray-100 rounded w-56" />
      </div>
    );
  }

  // ─── Title slide ─────────────────────────────────────────────────
  if (slide.type === "title") {
    return (
      <div style={{ position: "absolute", inset: 0, background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}>
        {/* Red swoosh header */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <svg viewBox="0 0 720 160" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 160 }}>
            <path d="M0,0 L720,0 L720,120 Q540,160 360,140 Q180,120 0,155 Z" fill={RED} />
          </svg>
          {/* Webserv branding on the swoosh */}
          <div style={{ position: "absolute", top: 18, left: 28, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "white", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.9 }}>Webserv</div>
          </div>
        </div>
        {/* Main content */}
        <div style={{ position: "absolute", top: 155, left: 40, right: 40, bottom: 32, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: TEXT_PRIMARY, fontSize: 24, fontWeight: 800, lineHeight: 1.2, marginBottom: 10 }}>
            <EditableSection editKey={`${slide.id}_title`} value={slide.title ?? ""} edits={edits} onEdit={onEdit} as="div" />
          </div>
          <div style={{ color: RED, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            <EditableSection editKey={`${slide.id}_client`} value={slide.clientName ?? ""} edits={edits} onEdit={onEdit} as="div" />
          </div>
          <div style={{ color: TEXT_SECONDARY, fontSize: 10 }}>{slide.date}</div>
        </div>
        {/* Footer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <div style={{ height: 2, background: RED, opacity: 0.3 }} />
          <div style={{ height: 22, background: "#F4F6F8", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, borderTop: `1px solid ${BORDER_COLOR}` }}>
            <span style={{ fontSize: 7, color: TEXT_SECONDARY }}>Webserv  |  webserv.io</span>
            <span style={{ fontSize: 7, color: "#C5CBD3", letterSpacing: "0.04em" }}>CONFIDENTIAL</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Divider slide ───────────────────────────────────────────────
  if (slide.type === "divider") {
    return (
      <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
        {/* Red swoosh */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <svg viewBox="0 0 720 80" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 80 }}>
            <path d="M0,0 L720,0 L720,55 Q540,80 360,65 Q180,50 0,75 Z" fill={RED} />
          </svg>
          <div style={{ position: "absolute", top: 12, left: 24 }}>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>Webserv</span>
          </div>
        </div>
        {/* Center content */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 48px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: RED, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12 }}>
            Section
          </div>
          <div style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: 800, lineHeight: 1.25, maxWidth: 520, textAlign: "center" }}>
            <EditableSection editKey={`${slide.id}_title`} value={slide.title ?? ""} edits={edits} onEdit={onEdit} as="div" />
          </div>
          {slide.subtitle && (
            <div style={{ color: TEXT_SECONDARY, fontSize: 11, marginTop: 10, textAlign: "center" }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="div" />
            </div>
          )}
        </div>
        {/* Bottom accent */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <div style={{ height: 3, background: RED, opacity: 0.25 }} />
          <div style={{ height: 22, background: "#F4F6F8", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, borderTop: `1px solid ${BORDER_COLOR}` }}>
            <span style={{ fontSize: 7, color: TEXT_SECONDARY }}>Webserv  |  webserv.io</span>
            <span style={{ fontSize: 7, color: "#C5CBD3", letterSpacing: "0.04em" }}>CONFIDENTIAL</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Metrics slide ───────────────────────────────────────────────
  if (slide.type === "metrics") {
    const mets = slide.metrics ?? [];
    const cols = Math.min(4, mets.length || 1);
    const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 20, right: 20, bottom: 30, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 2 }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
            {mets.map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
          </div>
          {(commentary || slide.commentary) && (
            <div style={{ marginTop: 6, padding: "7px 12px", background: "#FFF5F3", borderLeft: `3px solid ${RED}`, borderRadius: 3 }}>
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={slide.commentary ?? ""}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                style={{ fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.6 } as any}
              />
            </div>
          )}
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Table slide ─────────────────────────────────────────────────
  if (slide.type === "table" && slide.table) {
    const { headers, rows } = slide.table;
    const colW = Math.floor(SLIDE_W / headers.length);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, overflow: "auto" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: TEXT_SECONDARY, margin: "6px 0 5px" }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          <SlideTableWithCustomRows
            slideId={slide.id}
            tableKey="table"
            headers={headers}
            rows={rows}
            edits={edits}
            onEdit={onEdit}
            colW={colW}
          />
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Chart slides ────────────────────────────────────────────────
  if ((slide.type === "chart-bar" || slide.type === "chart-line") && slide.chartData) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 20, right: 20, bottom: 30, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {slide.subtitle && <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 8 }}>{slide.subtitle}</div>}
          {slide.type === "chart-bar"
            ? <ReportBarChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={270} />
            : <ReportLineChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={270} />
          }
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Bullets slide ───────────────────────────────────────────────
  if (slide.type === "bullets") {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 24, right: 24, bottom: 30, display: "flex", flexDirection: "column", justifyContent: "center", gap: 7 }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 4 }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          {(slide.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ color: RED, fontWeight: 800, fontSize: 13, lineHeight: 1, marginTop: 0 }}>•</span>
              <EditableSection
                editKey={`${slide.id}_bullet_${bi}`}
                value={b}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                className="flex-1 leading-snug"
                style={{ fontSize: 10.5, color: TEXT_PRIMARY } as any}
              />
            </div>
          ))}
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Two-col slide ───────────────────────────────────────────────
  if (slide.type === "two-col" && slide.leftContent && slide.rightContent) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            {slide.leftContent.type === "bullets" && (slide.leftContent.bullets ?? []).map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 5, fontSize: 9 }}>
                <span style={{ color: RED, fontWeight: "bold" }}>•</span>
                <span style={{ color: TEXT_PRIMARY }}>{b}</span>
              </div>
            ))}
            {slide.leftContent.type === "table" && slide.leftContent.table && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7, border: `1px solid ${RED}22`, overflow: "hidden" }}>
                <thead>
                  <tr style={{ backgroundColor: TABLE_HEADER_BG }}>
                    {slide.leftContent.table.headers.map((h, hi) => (
                      <th key={hi} style={{ color: TABLE_HEADER_TEXT, padding: "3px 5px", fontWeight: 700, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${RED}22` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slide.leftContent.table.rows.slice(0, 12).map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? ROW_ALT : "white" }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: "2px 4px", borderBottom: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY }}>{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {slide.rightContent.type === "chart-bar" && slide.rightContent.chartData && (
              <ReportBarChart data={slide.rightContent.chartData} keys={slide.rightContent.chartKeys ?? ["value"]} height={270} />
            )}
            {slide.rightContent.type === "chart-line" && slide.rightContent.chartData && (
              <ReportLineChart data={slide.rightContent.chartData} keys={slide.rightContent.chartKeys ?? ["value"]} height={270} />
            )}
            {slide.rightContent.type === "metrics" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(slide.rightContent.metrics ?? []).map((m, mi) => (
                  <MetricCard key={mi} {...m} />
                ))}
              </div>
            )}
          </div>
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Scorecard slide ─────────────────────────────────────────────
  if (slide.type === "scorecard") {
    const mets = slide.metrics ?? [];
    const { headers, rows } = slide.table ?? { headers: [], rows: [] };
    const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
    const colW = headers.length > 0 ? Math.floor((SLIDE_W * 0.65) / headers.length) : 60;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, display: "flex", gap: 12 }}>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
            {slide.subtitle && (
              <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 2 }}>
                <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
              </div>
            )}
            {headers.length > 0 && (
              <SlideTableWithCustomRows
                slideId={slide.id}
                tableKey="scorecard"
                headers={headers}
                rows={rows}
                edits={edits}
                onEdit={onEdit}
                colW={colW}
                maxRows={14}
              />
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
            {mets.slice(0, 4).map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
            {commentary && (
              <div style={{ marginTop: 4, padding: "6px 10px", background: "#FFF5F3", borderLeft: `3px solid ${RED}`, borderRadius: 3 }}>
                <EditableSection editKey={`${slide.id}_commentary`} value={commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8, color: "#374151", fontStyle: "italic", lineHeight: 1.5 } as any} />
              </div>
            )}
          </div>
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Decision-card slide ─────────────────────────────────────────
  if (slide.type === "decision-card" && slide.decisionOptions) {
    const options = slide.decisionOptions;
    const conclusion = edits[`${slide.id}_conclusion`] ?? slide.decisionConclusion;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 2, textAlign: "center" }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 9 } as any} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
            {options.map((opt, oi) => (
              <div key={oi} style={{
                flex: 1, border: opt.recommended ? `2px solid ${RED}` : `1px solid ${BORDER_COLOR}`,
                borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4,
                background: opt.recommended ? "#FFF8F7" : "white",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_PRIMARY }}>
                  <EditableSection editKey={`${slide.id}_opt_${oi}_label`} value={opt.label} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 10, fontWeight: 700 } as any} />
                </div>
                {opt.subtitle && <div style={{ fontSize: 8, color: opt.recommended ? RED : TEXT_SECONDARY, fontWeight: 600 }}>{opt.subtitle}</div>}
                {opt.recommended && <div style={{ fontSize: 7, color: RED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Recommended</div>}
                <div style={{ marginTop: 2 }}>
                  {opt.pros.map((p, pi) => (
                    <div key={pi} style={{ display: "flex", gap: 4, fontSize: 8, color: "#374151", marginBottom: 2 }}>
                      <span style={{ color: "#10B981", fontWeight: 700 }}>✓</span>
                      <EditableSection editKey={`${slide.id}_opt_${oi}_pro_${pi}`} value={p} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8 } as any} />
                    </div>
                  ))}
                  {(opt.cons ?? []).map((c, ci) => (
                    <div key={ci} style={{ display: "flex", gap: 4, fontSize: 8, color: "#374151", marginBottom: 2 }}>
                      <span style={{ color: "#EF4444", fontWeight: 700 }}>✗</span>
                      <EditableSection editKey={`${slide.id}_opt_${oi}_con_${ci}`} value={c} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8 } as any} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {conclusion && (
            <div style={{ marginTop: 4, padding: "6px 12px", background: "#FFF5F3", borderLeft: `3px solid ${RED}`, borderRadius: 3 }}>
              <EditableSection editKey={`${slide.id}_conclusion`} value={slide.decisionConclusion ?? ""} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.5 } as any} />
            </div>
          )}
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── IA comparison slide ─────────────────────────────────────────
  if (slide.type === "ia-comparison") {
    const currentItems = slide.currentIA ?? [];
    const futureItems = slide.futureIA ?? [];
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, display: "flex", flexDirection: "column", gap: 6 }}>
          {slide.commentary && (
            <div style={{ fontSize: 8, color: TEXT_SECONDARY, marginBottom: 2 }}>
              <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
            </div>
          )}
          <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Current</div>
              <div style={{ border: `1px solid ${BORDER_COLOR}`, borderRadius: 4, padding: 6, background: "#FAFAFA", height: "calc(100% - 20px)", overflow: "auto" }}>
                {currentItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: TEXT_PRIMARY, padding: "2px 5px", background: "#F3F4F6", borderRadius: 3, display: "inline-block" }}>
                      <EditableSection editKey={`${slide.id}_cur_${ii}`} value={item.label} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700 } as any} />
                    </div>
                    {item.children?.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 7, color: "#4B5563", paddingLeft: 10, marginTop: 1 }}>— {c}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 18, color: RED, fontWeight: 700 }}>→</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Future</div>
              <div style={{ border: `1px solid ${RED}30`, borderRadius: 4, padding: 6, background: "#FFF8F7", height: "calc(100% - 20px)", overflow: "auto" }}>
                {futureItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: TEXT_PRIMARY, padding: "2px 5px", background: `${RED}14`, borderRadius: 3, display: "inline-block" }}>
                      <EditableSection editKey={`${slide.id}_fut_${ii}`} value={item.label} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700 } as any} />
                    </div>
                    {item.children?.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 7, color: "#4B5563", paddingLeft: 10, marginTop: 1 }}>— {c}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <SlideFooter />
      </div>
    );
  }

  // ─── Cluster map slide ───────────────────────────────────────────
  if (slide.type === "cluster-map" && slide.clusters) {
    const cols = Math.min(4, slide.clusters.length);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 58, left: 16, right: 16, bottom: 30, display: "flex", flexDirection: "column" }}>
          {slide.commentary && (
            <div style={{ fontSize: 8, color: TEXT_SECONDARY, marginBottom: 6 }}>
              <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1, minHeight: 0, overflow: "auto" }}>
            {slide.clusters.map((cluster, ci) => (
              <div key={ci} style={{ border: `1px solid ${BORDER_COLOR}`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: RED, color: "white", fontSize: 8, fontWeight: 700, padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <EditableSection editKey={`${slide.id}_cluster_${ci}_hub`} value={cluster.hub} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700, color: "white" } as any} />
                </div>
                <div style={{ padding: 4 }}>
                  {cluster.pages.map((page, pi) => (
                    <div key={pi} style={{ fontSize: 7, color: "#374151", padding: "1px 4px", borderBottom: `1px solid #F3F4F6`, display: "flex", gap: 3, alignItems: "center" }}>
                      <span style={{ color: RED, fontSize: 6 }}>●</span>
                      <EditableSection editKey={`${slide.id}_cluster_${ci}_page_${pi}`} value={page} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 7 } as any} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <SlideFooter />
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: TEXT_SECONDARY, fontSize: 11 }}>Slide: {slide.type}</span>
    </div>
  );
}
