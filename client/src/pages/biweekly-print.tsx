import { useEffect, useState } from "react";
import { DocxPreview } from "@/components/report-preview/docx-preview";

export default function BiweeklyPrint() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token in URL."); return; }
    fetch(`/api/print-cache/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 1400);
    return () => clearTimeout(t);
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        Could not load report data: {error}. Close this window and try "Download PDF" again.
      </div>
    );
  }
  if (!data) return <div style={{ padding: 32, fontFamily: "sans-serif" }}>Loading…</div>;

  const { report, edits } = data;

  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        @media print {
          @page { size: Letter; margin: 0; }
          html, body { background: white; }
          .no-print { display: none !important; }
          [data-testid="docx-preview-page"] {
            overflow: visible !important;
            box-shadow: none !important;
            width: 100% !important;
            min-height: unset !important;
          }
        }
        .bw-print-root > div:first-child {
          background: white !important;
          padding: 0 !important;
          min-height: unset !important;
          display: block !important;
          overflow: visible !important;
        }
      `}</style>
      <div
        style={{ background: "#1B3A6B", color: "white", padding: "10px 24px", fontSize: "13px", display: "flex", alignItems: "center", gap: "12px" }}
        className="no-print"
      >
        <span style={{ fontWeight: 600 }}>Ready to export</span>
        <span style={{ opacity: 0.8 }}>— The print dialog will open automatically. Choose <strong>"Save as PDF"</strong> as the destination.</span>
      </div>
      <div className="bw-print-root">
        <DocxPreview
          clientName={edits["client_name"] ?? report.client_name}
          reportTitle={edits["report_title"] ?? report.report_title}
          date={edits["report_date"] ?? report.date}
          reportingWindow={report.reportingWindow}
          preparedBy={edits["preparedBy"] ?? report.preparedBy}
          sections={report.sections ?? []}
          edits={edits}
          onEdit={() => {}}
          bwTheme
        />
      </div>
    </>
  );
}
