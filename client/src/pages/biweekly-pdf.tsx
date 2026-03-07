import { useEffect, useState } from "react";
import { DocxPreview } from "@/components/report-preview/docx-preview";

export default function BiweeklyPdf() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch(`/api/print-cache/${token}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32 }}>Loading…</div>;

  const { report, edits } = data;

  return (
    <div data-report-root style={{ background: "white", margin: 0, padding: 0 }}>
      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { margin: 0; padding: 0; background: white; }

        /* Strip the outer gray wrapper the preview uses */
        [data-report-root] > div:first-child {
          background: white !important;
          padding: 0 !important;
          min-height: unset !important;
        }

        /* Keep the exact same page container the preview uses — no changes */
        [data-testid="docx-preview-page"] {
          box-shadow: none !important;
          border: none !important;
          outline: none !important;
          margin: 0 auto !important;
        }

        /* Hide edit controls */
        button { display: none !important; }
      `}</style>
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
  );
}
