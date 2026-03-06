import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EditableSection } from "./editable-section";
import { ReportBarChart, ReportLineChart, MetricCard } from "./report-chart";

export interface Slide {
  id: string;
  type: "title" | "metrics" | "table" | "chart-bar" | "chart-line" | "bullets" | "two-col";
  title?: string;
  subtitle?: string;
  clientName?: string;
  date?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  chartData?: Array<{ label: string; [key: string]: string | number }>;
  chartKeys?: string[];
  bullets?: string[];
  leftContent?: { type: "bullets" | "table"; bullets?: string[]; table?: { headers: string[]; rows: (string | number)[][] } };
  rightContent?: { type: "chart-bar" | "chart-line" | "metrics"; chartData?: Array<{ label: string; [key: string]: string | number }>; chartKeys?: string[]; metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }> };
  loading?: boolean;
}

interface PptxPreviewProps {
  slides: Slide[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
}

const SLIDE_W = 720;
const SLIDE_H = 405;

export function PptxPreview({ slides, edits, onEdit }: PptxPreviewProps) {
  const [current, setCurrent] = useState(0);
  const total = slides.length;
  const slide = slides[current];

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
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              className={`relative w-full rounded border-2 overflow-hidden transition-all ${i === current ? "border-blue-400" : "border-gray-600 hover:border-gray-400"}`}
              style={{ paddingTop: "56.25%", background: s.type === "title" ? "#1B3A6B" : "#F8FAFC" }}
              data-testid={`thumb-slide-${i}`}
              title={s.title ?? `Slide ${i + 1}`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[6px] font-bold truncate px-1" style={{ color: s.type === "title" ? "#BFD7FF" : "#1B3A6B" }}>
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

function SlideHeader({ title, slideTitle }: { title?: string; slideTitle?: string }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48, background: "#1B3A6B", display: "flex", alignItems: "center", paddingLeft: 20 }}>
      <span style={{ color: "white", fontWeight: "bold", fontSize: 13 }}>{slideTitle ?? title}</span>
    </div>
  );
}

function SlideFooter() {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 22, background: "#F0F4FA", borderTop: "1px solid #D1D5DB", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14, paddingLeft: 14 }}>
      <span style={{ fontSize: 7, color: "#9CA3AF" }}>Webserv  |  webserv.io</span>
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
      <div style={{ position: "absolute", inset: 0, background: "#1B3A6B", display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 40px" }}>
        <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, height: 28, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ color: "white", fontSize: 26, fontWeight: "bold", lineHeight: 1.2, marginBottom: 10 }}>
          <EditableSection editKey={`${slide.id}_title`} value={slide.title ?? ""} edits={edits} onEdit={onEdit} as="div" />
        </div>
        <div style={{ color: "#BFD7FF", fontSize: 16, marginBottom: 6 }}>
          <EditableSection editKey={`${slide.id}_client`} value={slide.clientName ?? ""} edits={edits} onEdit={onEdit} as="div" />
        </div>
        <div style={{ color: "#93C5FD", fontSize: 10 }}>{slide.date}</div>
        <div style={{ position: "absolute", bottom: 12, left: 40, color: "#BFD7FF", fontSize: 7 }}>Webserv  |  webserv.io</div>
      </div>
    );
  }

  if (slide.type === "metrics") {
    const mets = slide.metrics ?? [];
    const cols = Math.min(4, mets.length || 1);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={slide.title} />
        <div style={{ position: "absolute", top: 56, left: 16, right: 16, bottom: 30, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {slide.subtitle && <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 4 }}>{slide.subtitle}</div>}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {mets.map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
          </div>
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
        <SlideHeader slideTitle={slide.title} />
        <div style={{ position: "absolute", top: 56, left: 16, right: 16, bottom: 30, overflow: "auto" }}>
          {slide.subtitle && <div style={{ fontSize: 9, color: "#6B7280", margin: "6px 0" }}>{slide.subtitle}</div>}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
            <thead>
              <tr>
                {headers.map(h => (
                  <th key={h} style={{ background: "#1B3A6B", color: "white", padding: "4px 6px", textAlign: "left", fontWeight: "bold", borderRight: "1px solid #2D5A9E", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 18).map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : "#E8F0FE" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "3px 6px", borderBottom: "1px solid #E5E7EB", borderRight: "1px solid #F3F4F6", maxWidth: colW, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F2937" }}>
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 18 && <div style={{ fontSize: 7, color: "#9CA3AF", marginTop: 4 }}>+ {rows.length - 18} more rows in full export</div>}
        </div>
        <SlideFooter />
      </div>
    );
  }

  if ((slide.type === "chart-bar" || slide.type === "chart-line") && slide.chartData) {
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <SlideHeader slideTitle={slide.title} />
        <div style={{ position: "absolute", top: 56, left: 16, right: 16, bottom: 30, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
        <SlideHeader slideTitle={slide.title} />
        <div style={{ position: "absolute", top: 56, left: 20, right: 20, bottom: 30, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          {slide.subtitle && <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 4 }}>{slide.subtitle}</div>}
          {(slide.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "#1B3A6B", fontWeight: "bold", fontSize: 12, lineHeight: 1 }}>•</span>
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
        <SlideHeader slideTitle={slide.title} />
        <div style={{ position: "absolute", top: 56, left: 16, right: 16, bottom: 30, display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            {slide.leftContent.type === "bullets" && (slide.leftContent.bullets ?? []).map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 9 }}>
                <span style={{ color: "#1B3A6B", fontWeight: "bold" }}>•</span>
                <span style={{ color: "#1F2937" }}>{b}</span>
              </div>
            ))}
            {slide.leftContent.type === "table" && slide.leftContent.table && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7 }}>
                <thead>
                  <tr>
                    {slide.leftContent.table.headers.map(h => (
                      <th key={h} style={{ background: "#1B3A6B", color: "white", padding: "3px 4px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slide.leftContent.table.rows.slice(0, 12).map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? "#E8F0FE" : "white" }}>
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

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#9CA3AF", fontSize: 11 }}>Slide: {slide.type}</span>
    </div>
  );
}
