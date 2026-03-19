import { useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { ReadModeContext } from "./editable-section";
import {
  useReportHeader, PAGE_BG, TEXT_PRIMARY, TEXT_SECONDARY, RED, NAVY, SLIDE_W, SLIDE_H,
} from "./report-primitives";
import {
  MonthlyTitleSlide,
  MonthlyDividerSlide,
  MonthlyKpiSlide,
  MonthlyConversionSlide,
  MonthlyTrendSlide,
  MonthlyAuditProgressSlide,
  MonthlyInitiativesSlide,
  MonthlyNextStepsSlide,
  MonthlyClusterSlide,
  MonthlyScorecardSlide,
  MonthlyDecisionSlide,
  MonthlyIaComparisonSlide,
  MonthlyTwoColSlide,
} from "./monthly-slides";

// Slide type lives in report-primitives to avoid circular imports; re-export for server consumers
import type { Slide, DecisionOption, IAItem, ContentCluster } from "./report-primitives";
export type { Slide, DecisionOption, IAItem, ContentCluster };

// ─── PptxPreview orchestrator ─────────────────────────────────────────────────
interface PptxPreviewProps {
  slides: Slide[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
}

export function PptxPreview({ slides, edits, onEdit }: PptxPreviewProps) {
  const visibleSlides = slides.filter(s => !s.hidden);
  const [current, setCurrent] = useState(0);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const headerUrl = useReportHeader();
  const total = visibleSlides.length;
  const slide = visibleSlides[current];

  function prev() { setCurrent(c => Math.max(0, c - 1)); }
  function next() { setCurrent(c => Math.min(total - 1, c + 1)); }

  useEffect(() => {
    if (!isPresentMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setIsPresentMode(false); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPresentMode, total]);

  return (
    <div className="flex flex-col h-full bg-gray-800" data-testid="pptx-preview">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
        <div className="flex items-center gap-2">
          <button onClick={prev} disabled={current === 0} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30" data-testid="button-slide-prev">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-300">Slide {current + 1} of {total}</span>
          <button onClick={next} disabled={current === total - 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30" data-testid="button-slide-next">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-gray-400 truncate max-w-xs">{slide?.title ?? ""}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">16:9</span>
          <button onClick={() => setIsPresentMode(true)} className="p-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white" title="Present (fullscreen)" data-testid="button-present-mode">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main canvas + thumbnail strip */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          {slide && (
            <div
              style={{ width: SLIDE_W, minHeight: SLIDE_H, position: "relative", flexShrink: 0, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif", overflow: "hidden" }}
              data-testid={`slide-${slide.id}`}
            >
              <SlideRenderer slide={slide} edits={edits} onEdit={onEdit} headerUrl={headerUrl} />
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
                <span className="text-[6px] font-bold truncate px-1" style={{ color: s.type === "title" || s.type === "divider" ? "rgba(255,255,255,0.9)" : NAVY }}>
                  {s.title ?? `Slide ${i + 1}`}
                </span>
              </div>
              <div className="absolute bottom-0.5 right-0.5 text-[6px] text-gray-400">{i + 1}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Presentation overlay */}
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
          headerUrl={headerUrl}
        />,
        document.body
      )}
    </div>
  );
}

// ─── PresentationOverlay ──────────────────────────────────────────────────────
function PresentationOverlay({
  slide, current, total, onPrev, onNext, onExit, edits, onEdit, headerUrl,
}: {
  slide: Slide | undefined;
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  headerUrl: string;
}) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    function compute() {
      setScale(Math.min((window.innerWidth - 64) / SLIDE_W, (window.innerHeight - 120) / SLIDE_H, 2));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950" data-testid="presentation-overlay">
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 shrink-0">
        <div className="text-white text-sm font-medium truncate max-w-lg">{slide?.title ?? ""}</div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-gray-400 text-xs">{current + 1} / {total}</span>
          <button onClick={onExit} className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white" title="Exit (Esc)" data-testid="button-exit-present-mode">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {slide && (
          <ReadModeContext.Provider value={true}>
            <div
              style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "center center", flexShrink: 0, boxShadow: "0 12px 48px rgba(0,0,0,0.7)", background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif", overflow: "hidden", position: "relative" }}
              data-testid={`present-slide-${slide.id}`}
            >
              <SlideRenderer slide={slide} edits={edits} onEdit={onEdit} headerUrl={headerUrl} />
            </div>
          </ReadModeContext.Provider>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-gray-900 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onPrev} disabled={current === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm" data-testid="button-present-prev">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-gray-300 text-sm tabular-nums w-20 text-center">{current + 1} of {total}</span>
        <button onClick={onNext} disabled={current === total - 1} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm" data-testid="button-present-next">
          Next <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-gray-500 text-xs ml-4 hidden sm:block">← → or Page Up/Down · Esc to exit</span>
      </div>
    </div>
  );
}

// ─── SlideRenderer — clean dispatcher ────────────────────────────────────────
// Maps slide.type to the correct named monthly slide component.
// All slide-type-specific logic lives in monthly-slides.tsx.
export function SlideRenderer({
  slide,
  edits,
  onEdit,
  headerUrl,
}: {
  slide: Slide;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  headerUrl: string;
}) {
  if (slide.loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 animate-pulse p-8">
        <div className="h-6 bg-gray-200 rounded w-64" />
        <div className="h-3 bg-gray-100 rounded w-48" />
        <div className="h-3 bg-gray-100 rounded w-56" />
      </div>
    );
  }

  const props = { slide, edits, onEdit, headerUrl };

  switch (slide.type) {
    case "title":         return <MonthlyTitleSlide {...props} />;
    case "divider":       return <MonthlyDividerSlide {...props} />;
    case "metrics":       return <MonthlyKpiSlide {...props} />;
    case "chart-bar":     return <MonthlyConversionSlide {...props} />;
    case "chart-line":    return <MonthlyTrendSlide {...props} />;
    case "table":         return <MonthlyAuditProgressSlide {...props} />;
    case "bullets":       return <MonthlyInitiativesSlide {...props} />;
    case "two-col":       return <MonthlyTwoColSlide {...props} />;
    case "scorecard":     return <MonthlyScorecardSlide {...props} />;
    case "decision-card": return <MonthlyDecisionSlide {...props} />;
    case "ia-comparison": return <MonthlyIaComparisonSlide {...props} />;
    case "cluster-map":   return <MonthlyClusterSlide {...props} />;
    default:
      return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: TEXT_SECONDARY, fontSize: 11 }}>Slide: {slide.type}</span>
        </div>
      );
  }
}
