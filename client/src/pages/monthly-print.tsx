import { useEffect, useState } from "react";
import { SlideRenderer } from "@/components/report-preview/pptx-preview";
import type { Slide } from "@/components/report-preview/pptx-preview";

const SLIDE_W = 720;
const SLIDE_H = 405;

export default function MonthlyPrint() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("monthly_print_data");
    if (!raw) { setError(true); return; }
    try { setData(JSON.parse(raw)); } catch { setError(true); }
  }, []);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(t);
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        No report data found. Close this window and use "Download PDF" from the report page.
      </div>
    );
  }
  if (!data) return null;

  const { report, edits } = data;
  const slides: Slide[] = report.slides ?? [];

  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        @media print {
          @page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
          html, body { background: white; }
          .no-print { display: none !important; }
          .slide-wrapper { page-break-after: always; break-after: page; }
          .slide-wrapper:last-child { page-break-after: avoid; break-after: avoid; }
        }
      `}</style>
      <div
        style={{ background: "#1B3A6B", color: "white", padding: "10px 24px", fontSize: "13px", display: "flex", alignItems: "center", gap: "12px" }}
        className="no-print"
      >
        <span style={{ fontWeight: 600 }}>Ready to export</span>
        <span style={{ opacity: 0.8 }}>— The print dialog will open automatically. Choose <strong>"Save as PDF"</strong> as the destination. Set page size to <strong>Custom (720×405)</strong> for best results.</span>
      </div>
      <div style={{ background: "white" }}>
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className="slide-wrapper"
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              position: "relative",
              overflow: "hidden",
              background: "#F8FAFC",
              fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
              boxSizing: "border-box",
            }}
          >
            <SlideRenderer slide={slide} edits={edits} onEdit={() => {}} />
          </div>
        ))}
      </div>
    </>
  );
}
