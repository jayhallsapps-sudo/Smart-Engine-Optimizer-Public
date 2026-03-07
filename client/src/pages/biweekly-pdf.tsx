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
      .then((d) => {
        setData(d);
        document.title = "pdf-ready";
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32 }}>Loading…</div>;

  const { report, edits } = data;

  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: white !important;
        }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Remove shadow and outer chrome */
        [data-testid="docx-preview-page"] {
          box-shadow: none !important;
        }

        /* Remove the outer muted gray background and padding */
        .bg-muted\/30 {
          background: white !important;
          padding: 0 !important;
          min-height: unset !important;
        }

        /* ── Page break control ── */

        /* Prevent thead from repeating on every page */
        thead {
          display: table-row-group !important;
        }

        /* Never break inside a table row */
        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        /* Never break inside a source badge */
        span[style*="border-radius"] {
          break-inside: avoid !important;
        }

        /* Keep section headings with the content that follows */
        h2, h3, [data-testid*="heading"] {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
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
    </>
  );
}
