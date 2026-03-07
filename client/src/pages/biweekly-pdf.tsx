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
    <div className="print-shell" data-report-root>
      <style>{`
        /* ── @page ── */
        @page {
          size: Letter;
          margin: 0;
        }

        /* ── Base reset ── */
        html, body {
          margin: 0;
          padding: 0;
          background: white;
        }
        .print-shell {
          background: white;
        }

        /* ── Color preservation ── */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* ── Override DocxPreview outer wrapper ──
           The component wraps in bg-muted/30 with flex centering.
           For PDF capture we strip all that chrome. */
        [data-report-root] > div:first-child {
          background: white !important;
          padding: 0 !important;
          min-height: unset !important;
          display: block !important;
          overflow: visible !important;
        }

        /* ── Override the inner page container ── */
        [data-testid="docx-preview-page"] {
          width: 8.5in !important;
          min-height: 11in !important;
          box-shadow: none !important;
          border: none !important;
          outline: none !important;
          overflow: visible !important;
          position: relative;
          margin: 0 auto;
        }

        /* ── No transforms ── */
        [data-testid="docx-preview-page"],
        [data-report-root] {
          transform: none !important;
          zoom: 1 !important;
        }

        /* ── Page break rules ── */
        .no-break,
        table,
        tr,
        td,
        th,
        .card,
        [data-testid^="section-"] {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        thead {
          display: table-header-group;
        }

        tfoot {
          display: table-footer-group;
        }

        /* ── Hide editing controls ── */
        .no-print,
        [data-testid*="edit-btn"],
        button {
          display: none !important;
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
    </div>
  );
}
