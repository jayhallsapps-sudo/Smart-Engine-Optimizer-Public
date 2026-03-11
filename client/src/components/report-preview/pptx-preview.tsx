import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EditableSection } from "./editable-section";
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
const NAVY = "#1B3A6B";
const RED = "#C0392B";
const LIGHT_BLUE = "#E8F0FE";

export function PptxPreview({ slides, edits, onEdit }: PptxPreviewProps) {
  const visibleSlides = slides.filter(s => !s.hidden);
  const [current, setCurrent] = useState(0);
  const total = visibleSlides.length;
  const slide = visibleSlides[current];

  function prev() { setCurrent(c => Math.max(0, c - 1)); }
  function next() { setCurrent(c => Math.min(total - 1, c + 1)); }

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
        <div className="text-xs text-gray-500">16:9</div>
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
                background: "#F8FAFC",
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
              style={{ paddingTop: "56.25%", background: (s.type === "title" || s.type === "divider") ? NAVY : "#F8FAFC" }}
              data-testid={`thumb-slide-${i}`}
              title={s.title ?? `Slide ${i + 1}`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[6px] font-bold truncate px-1" style={{ color: s.type === "title" ? "#BFD7FF" : NAVY }}>
                  {s.title ?? `Slide ${i + 1}`}
                </span>
              </div>
              <div className="absolute bottom-0.5 right-0.5 text-[6px] text-gray-400">{i + 1}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideHeader({ slideTitle }: { slideTitle?: string }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <div style={{ height: 44, background: NAVY, display: "flex", alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
        <span style={{ color: "white", fontWeight: "bold", fontSize: 13, flex: 1 }}>{slideTitle}</span>
        <span style={{ fontSize: 7, color: "#93C5FD" }}>Webserv</span>
      </div>
      <div style={{ height: 3, background: RED }} />
    </div>
  );
}

function SlideFooter() {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
      <div style={{ height: 2, background: RED }} />
      <div style={{ height: 20, background: "#F0F4FA", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14, paddingLeft: 14 }}>
        <span style={{ fontSize: 7, color: "#9CA3AF" }}>Webserv  |  webserv.io</span>
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
        style={{ width: "100%", fontSize: 7.5, fontFamily: "inherit", padding: "1px 3px", border: "1px solid #C0392B60", borderRadius: 2, outline: "none" }}
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
        color: value ? "#1F2937" : "#9CA3AF",
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
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, border: "1px solid #C0392B28", borderRadius: 4, overflow: "hidden" }}>
        <thead>
          <tr style={{ backgroundColor: "#C0392B0D" }}>
            {headers.map((h, hi) => (
              <th key={hi} style={{ color: "#C0392B", padding: "3px 6px", textAlign: "left", fontWeight: 700, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #C0392B20", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : LIGHT_BLUE }}>
              {row.map((cellVal, ci) => (
                <td key={ci} style={{ padding: "2px 4px", borderBottom: "1px solid #E5E7EB", borderRight: "1px solid #F3F4F6", maxWidth: colW, overflow: "hidden", color: "#1F2937" }}>
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
          {customRows.map((row, ri) => {
            const absRi = sourceRowCount + ri;
            return (
              <tr key={`cr-${ri}`} style={{ background: "#FFFBEB" }}>
                {row.map((cellVal, ci) => {
                  const isLast = ci === colCount - 1;
                  return (
                    <td key={ci} style={{ padding: "2px 4px", borderBottom: "1px solid #E5E7EB", borderRight: "1px solid #F3F4F6", maxWidth: colW, overflow: "hidden" }}>
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
      {rows.length > maxRows && <div style={{ fontSize: 7, color: "#9CA3AF", marginTop: 4 }}>+ {rows.length - maxRows} more rows in full export</div>}
      <button
        onClick={addRow}
        data-testid={`button-add-row-${tableId}`}
        style={{ fontSize: 7, color: "#6B7280", marginTop: 3, background: "none", border: "1px dashed #D1D5DB", borderRadius: 3, padding: "1px 6px", cursor: "pointer", display: "block" }}
      >
        + Add row
      </button>
    </div>
  );
}

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

  if (slide.type === "title") {
    return (
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${NAVY} 60%, #0f2547)`, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 40px" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: RED }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, background: RED }} />
        <div style={{ color: "white", fontSize: 26, fontWeight: "bold", lineHeight: 1.2, marginBottom: 10 }}>
          <EditableSection editKey={`${slide.id}_title`} value={slide.title ?? ""} edits={edits} onEdit={onEdit} as="div" />
        </div>
        <div style={{ color: "#BFD7FF", fontSize: 16, marginBottom: 6 }}>
          <EditableSection editKey={`${slide.id}_client`} value={slide.clientName ?? ""} edits={edits} onEdit={onEdit} as="div" />
        </div>
        <div style={{ color: "#93C5FD", fontSize: 10 }}>{slide.date}</div>
        <div style={{ position: "absolute", bottom: 18, left: 40, color: "#BFD7FF", fontSize: 7 }}>Webserv  |  webserv.io</div>
      </div>
    );
  }

  if (slide.type === "divider") {
    return (
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${NAVY} 55%, #162d57)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 48px" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: RED }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: RED }} />
        <div style={{ position: "absolute", left: 0, top: "30%", bottom: "30%", width: 4, background: RED, borderRadius: 2 }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#93C5FD", fontSize: 9, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>
            Section
          </div>
          <div style={{ color: "white", fontSize: 22, fontWeight: "bold", lineHeight: 1.25, maxWidth: 520 }}>
            <EditableSection editKey={`${slide.id}_title`} value={slide.title ?? ""} edits={edits} onEdit={onEdit} as="div" />
          </div>
          {slide.subtitle && (
            <div style={{ color: "#BFD7FF", fontSize: 11, marginTop: 10 }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="div" />
            </div>
          )}
        </div>
        <div style={{ position: "absolute", bottom: 14, right: 20, color: "#BFD7FF", fontSize: 7 }}>Webserv  |  webserv.io</div>
      </div>
    );
  }

  if (slide.type === "metrics") {
    const mets = slide.metrics ?? [];
    const cols = Math.min(4, mets.length || 1);
    const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {mets.map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
          </div>
          {(commentary || slide.commentary) && (
            <div style={{ marginTop: 6, padding: "5px 10px", background: "#F0F4FA", borderLeft: `3px solid ${RED}`, borderRadius: 2 }}>
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={slide.commentary ?? ""}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                style={{ fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.5 } as any}
              />
            </div>
          )}
        </div>
        <SlideFooter />
      </div>
    );
  }

  if (slide.type === "table" && slide.table) {
    const { headers, rows } = slide.table;
    const colW = Math.floor(SLIDE_W / headers.length);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, overflow: "auto" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: "#6B7280", margin: "5px 0 4px" }}>
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

  if ((slide.type === "chart-bar" || slide.type === "chart-line") && slide.chartData) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {slide.subtitle && <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 6 }}>{slide.subtitle}</div>}
          {slide.type === "chart-bar"
            ? <ReportBarChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={280} />
            : <ReportLineChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={280} />
          }
        </div>
        <SlideFooter />
      </div>
    );
  }

  if (slide.type === "bullets") {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 20, right: 20, bottom: 28, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 4 }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          {(slide.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: RED, fontWeight: "bold", fontSize: 12, lineHeight: 1, marginTop: 1 }}>•</span>
              <EditableSection
                editKey={`${slide.id}_bullet_${bi}`}
                value={b}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                className="flex-1 text-[11px] leading-snug"
                style={{ fontSize: 10, color: "#1F2937" } as any}
              />
            </div>
          ))}
        </div>
        <SlideFooter />
      </div>
    );
  }

  if (slide.type === "two-col" && slide.leftContent && slide.rightContent) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            {slide.leftContent.type === "bullets" && (slide.leftContent.bullets ?? []).map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 9 }}>
                <span style={{ color: RED, fontWeight: "bold" }}>•</span>
                <span style={{ color: "#1F2937" }}>{b}</span>
              </div>
            ))}
            {slide.leftContent.type === "table" && slide.leftContent.table && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7, border: "1px solid #C0392B28", borderRadius: 4, overflow: "hidden" }}>
                <thead>
                  <tr style={{ backgroundColor: "#C0392B0D" }}>
                    {slide.leftContent.table.headers.map((h, hi) => (
                      <th key={hi} style={{ color: "#C0392B", padding: "2px 4px", fontWeight: 700, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #C0392B20" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slide.leftContent.table.rows.slice(0, 12).map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? LIGHT_BLUE : "white" }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: "2px 4px", borderBottom: "1px solid #E5E7EB", color: "#1F2937" }}>{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {slide.rightContent.type === "chart-bar" && slide.rightContent.chartData && (
              <ReportBarChart data={slide.rightContent.chartData} keys={slide.rightContent.chartKeys ?? ["value"]} height={280} />
            )}
            {slide.rightContent.type === "chart-line" && slide.rightContent.chartData && (
              <ReportLineChart data={slide.rightContent.chartData} keys={slide.rightContent.chartKeys ?? ["value"]} height={280} />
            )}
            {slide.rightContent.type === "metrics" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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

  if (slide.type === "scorecard") {
    const mets = slide.metrics ?? [];
    const { headers, rows } = slide.table ?? { headers: [], rows: [] };
    const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
    const colW = headers.length > 0 ? Math.floor((SLIDE_W * 0.65) / headers.length) : 60;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", gap: 10 }}>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
            {slide.subtitle && (
              <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2 }}>
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
            {mets.slice(0, 4).map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
            {commentary && (
              <div style={{ marginTop: 4, padding: "5px 8px", background: "#FFF3F0", borderLeft: `3px solid ${RED}`, borderRadius: 2 }}>
                <EditableSection editKey={`${slide.id}_commentary`} value={commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8, color: "#374151", fontStyle: "italic", lineHeight: 1.5 } as any} />
              </div>
            )}
          </div>
        </div>
        <SlideFooter />
      </div>
    );
  }

  if (slide.type === "decision-card" && slide.decisionOptions) {
    const options = slide.decisionOptions;
    const conclusion = edits[`${slide.id}_conclusion`] ?? slide.decisionConclusion;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 2, textAlign: "center" }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 9 } as any} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
            {options.map((opt, oi) => (
              <div key={oi} style={{
                flex: 1, border: opt.recommended ? `2px solid ${RED}` : "1px solid #D1D5DB",
                borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4,
                background: opt.recommended ? "#FFF5F5" : "white",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>
                  <EditableSection editKey={`${slide.id}_opt_${oi}_label`} value={opt.label} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 10, fontWeight: 700 } as any} />
                </div>
                {opt.subtitle && <div style={{ fontSize: 8, color: opt.recommended ? RED : "#6B7280", fontWeight: 600 }}>{opt.subtitle}</div>}
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
            <div style={{ marginTop: 4, padding: "5px 10px", background: "#F0F4FA", borderLeft: `3px solid ${RED}`, borderRadius: 2 }}>
              <EditableSection editKey={`${slide.id}_conclusion`} value={slide.decisionConclusion ?? ""} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.5 } as any} />
            </div>
          )}
        </div>
        <SlideFooter />
      </div>
    );
  }

  if (slide.type === "ia-comparison") {
    const currentItems = slide.currentIA ?? [];
    const futureItems = slide.futureIA ?? [];
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", flexDirection: "column", gap: 6 }}>
          {slide.commentary && (
            <div style={{ fontSize: 8, color: "#6B7280", marginBottom: 2 }}>
              <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
            </div>
          )}
          <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Current</div>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, padding: 6, background: "#FAFAFA", height: "calc(100% - 20px)", overflow: "auto" }}>
                {currentItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: NAVY, padding: "2px 4px", background: "#E8F0FE", borderRadius: 2, display: "inline-block" }}>
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
              <div style={{ border: `1px solid ${RED}30`, borderRadius: 4, padding: 6, background: "#FFF5F5", height: "calc(100% - 20px)", overflow: "auto" }}>
                {futureItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: NAVY, padding: "2px 4px", background: `${RED}15`, borderRadius: 2, display: "inline-block" }}>
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

  if (slide.type === "cluster-map" && slide.clusters) {
    const cols = Math.min(4, slide.clusters.length);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} />
        <div style={{ position: "absolute", top: 55, left: 16, right: 16, bottom: 28, display: "flex", flexDirection: "column" }}>
          {slide.commentary && (
            <div style={{ fontSize: 8, color: "#6B7280", marginBottom: 6 }}>
              <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1, minHeight: 0, overflow: "auto" }}>
            {slide.clusters.map((cluster, ci) => (
              <div key={ci} style={{ border: "1px solid #E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: NAVY, color: "white", fontSize: 8, fontWeight: 700, padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <EditableSection editKey={`${slide.id}_cluster_${ci}_hub`} value={cluster.hub} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700, color: "white" } as any} />
                </div>
                <div style={{ padding: 4 }}>
                  {cluster.pages.map((page, pi) => (
                    <div key={pi} style={{ fontSize: 7, color: "#374151", padding: "1px 4px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 3, alignItems: "center" }}>
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
      <span style={{ color: "#9CA3AF", fontSize: 11 }}>Slide: {slide.type}</span>
    </div>
  );
}
