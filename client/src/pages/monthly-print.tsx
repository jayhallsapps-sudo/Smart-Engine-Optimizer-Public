import { useEffect, useState } from "react";
import { SlideRenderer } from "@/components/report-preview/pptx-preview";
import { ReadModeContext } from "@/components/report-preview/editable-section";
import type { Slide } from "@/components/report-preview/pptx-preview";

const SLIDE_W = 720;
const SLIDE_H = 405;

export default function MonthlyPrint() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cacheToken = new URLSearchParams(window.location.search).get("token");
    if (!cacheToken) { setError("No token in URL."); return; }
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then(({ token: authToken }) =>
        fetch(`/api/print-cache/${cacheToken}`, { headers: { "X-Internal-Token": authToken } })
      )
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!data) return;
    document.fonts.ready.then(() => window.print());
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        Could not load report data: {error}. Close this window and try again.
      </div>
    );
  }
  if (!data) return <div style={{ padding: 32, fontFamily: "sans-serif" }}>Loading…</div>;

  const { report, edits } = data;
  const slides: Slide[] = report.slides ?? [];

  return (
    <ReadModeContext.Provider value={true}>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button { display: none !important; }
        @media print {
          @page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
          html, body { background: white; }
          .slide-wrapper { page-break-after: always; break-after: page; }
          .slide-wrapper:last-child { page-break-after: avoid; break-after: avoid; }
        }
      `}</style>
      <div data-report-root style={{ background: "white" }}>
        {slides.map((slide) => (
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
    </ReadModeContext.Provider>
  );
}
