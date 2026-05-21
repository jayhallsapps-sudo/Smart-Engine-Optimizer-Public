import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BiweeklyReportRenderer } from "@/components/biweekly-report-renderer";

export default function BiweeklyPdfPage() {
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch(`/api/print-cache/${token}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => {
        setReport(d.report ?? d);
        setEdits(d.edits);
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!report) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <QueryClientProvider client={queryClient}>
      <BiweeklyReportRenderer report={report} printMode edits={edits} />
    </QueryClientProvider>
  );
}
