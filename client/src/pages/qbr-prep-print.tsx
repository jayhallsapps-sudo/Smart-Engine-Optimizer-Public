import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";
import { ReportTable, SourceBadge } from "../components/report-preview/report-table";

const ACCENT = "#C0392B";
const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div style={{ color: ACCENT, fontWeight: 700, fontSize: "14px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4, marginBottom: 12, marginTop: num > 1 ? 28 : 0 }}>
      {num}. {title}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const nodeRows: ReactNode[][] = rows.map(row =>
    row.map((cell: string) =>
      cell?.includes("Manual entry needed") ? (
        <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>{cell}</span>
      ) : cell
    )
  );
  return <ReportTable headers={headers} rows={nodeRows} />;
}

function cell(val: string): ReactNode {
  return val?.includes("Manual entry needed")
    ? <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>{val}</span>
    : val;
}

function badgeCell(val: string, dataSource?: string): ReactNode {
  if (!dataSource) return cell(val);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {cell(val)}
      <SourceBadge source={dataSource} />
    </span>
  );
}

function parseS7Sources(source: string): string[] {
  return source.split(" + ").map(s => {
    if (s === "Google Search Console") return "GSC";
    if (s === "Call Tracking") return "CallRail";
    return s;
  });
}

function applyEdits(value: string, key: string, edits: Record<string, string>): string {
  return edits[key] ?? value;
}

export default function QbrPrepPrint() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch(`/api/print-cache/${token}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32 }}>Loading…</div>;

  const { reportData, edits = {} } = data;
  const meta = reportData.meta ?? {};
  const s1 = reportData.section1Goals ?? { rows: [] };
  const s2 = reportData.section2Conversions ?? { topConvertingPages: [], topConvertingSources: [] };
  const s3 = reportData.section3Traffic ?? { topTrafficTopics: [], topTrafficPages: [] };
  const s4 = reportData.section4Services ?? { services: [] };
  const s5 = reportData.section5Diagnosis ?? { tier: 0, tierName: "", diagnosis: "" };
  const s6 = reportData.section6Priorities ?? { priorities: [] };
  const s7 = reportData.section7Tracking ?? { tracking: [] };
  const genMeta = reportData.generationMeta;

  const e = (key: string, val: string) => applyEdits(val, key, edits);

  return (
    <div data-report-root style={{ background: "white", margin: 0, padding: 0 }}>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div style={{ position: "relative", width: "8.5in", margin: "0 auto", padding: 0, background: "#fff", fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif", fontSize: "11pt", color: "#111827" }}>
        <div style={{ position: "relative", width: "100%", lineHeight: 0 }}>
          <img src={headerImgUrl ?? swoopHeaderFallback} alt="" style={{ width: "100%", display: "block" }} />
        </div>

        <div style={{ padding: "24px 56px 0" }}>
          <div style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}>QBR Prep: SEO Planning Snapshot</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>{e("meta_site", meta.site ?? "")}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: "11px", marginBottom: "20px", padding: "12px 16px", backgroundColor: "#F9FAFB", borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div><strong>Domain:</strong> {e("meta_domain", meta.domain ?? "")}</div>
            <div><strong>Primary Location:</strong> {e("meta_location", meta.primaryLocation ?? "")}</div>
            <div><strong>Program / Positioning:</strong> {e("meta_program", meta.programPositioning ?? "")}</div>
            <div><strong>Analysis Window:</strong> {meta.analysisWindow}</div>
            <div><strong>Planning Quarter:</strong> {meta.planningQuarter}</div>
            <div><strong>Generated On:</strong> {meta.generatedOn}</div>
          </div>

          <SectionHeading num={1} title="What Matters Most This Quarter" />
          <DataTable
            headers={["Goal Type", "Goal", "Measurement Source", "Goal Shift vs Last Quarter", "Reason"]}
            rows={s1.rows.map((r: any, ri: number) => [e(`s1_${ri}_0`, r.goalType), e(`s1_${ri}_1`, r.goal), e(`s1_${ri}_2`, r.measurementSource), e(`s1_${ri}_3`, r.goalShift), e(`s1_${ri}_4`, r.reason)])}
          />

          <SectionHeading num={2} title="Where Conversions Actually Happen" />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Pages</div>
          <ReportTable
            headers={["Type", "Page / Pattern", "Conversion Source", "Notes / What We're Learning"]}
            rows={s2.topConvertingPages.map((r: any, ri: number) => [
              cell(e(`s2a_${ri}_0`, r.type)),
              cell(e(`s2a_${ri}_1`, r.page)),
              badgeCell(e(`s2a_${ri}_2`, r.conversionSource), r.dataSource),
              cell(e(`s2a_${ri}_3`, r.notes)),
            ])}
          />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Converting Sources</div>
          <ReportTable
            headers={["Source", "What's Converting", "Notes / What We're Learning"]}
            rows={s2.topConvertingSources.map((r: any, ri: number) => [
              badgeCell(e(`s2b_${ri}_0`, r.source), r.dataSource),
              cell(e(`s2b_${ri}_1`, r.whatsConverting)),
              cell(e(`s2b_${ri}_2`, r.notes)),
            ])}
          />

          <SectionHeading num={3} title="Top Organic Traffic Drivers" />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Topics</div>
          <ReportTable
            headers={["Topic", "Example Queries", "Connection to Admits", "Insight"]}
            rows={s3.topTrafficTopics.map((r: any, ri: number) => [
              cell(e(`s3a_${ri}_0`, r.topic)),
              cell(e(`s3a_${ri}_1`, r.exampleQueries)),
              cell(e(`s3a_${ri}_2`, r.connectionToAdmits)),
              badgeCell(e(`s3a_${ri}_3`, r.insight), r.dataSource),
            ])}
          />
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: 6 }}>Top Traffic Pages</div>
          <ReportTable
            headers={["Page", "Clicks", "CTR", "Connection to Admits", "Insight"]}
            rows={s3.topTrafficPages.map((r: any, ri: number) => [
              cell(e(`s3b_${ri}_0`, r.page)),
              cell(e(`s3b_${ri}_1`, r.clicks)),
              cell(e(`s3b_${ri}_2`, r.ctr)),
              cell(e(`s3b_${ri}_3`, r.connectionToAdmits)),
              badgeCell(e(`s3b_${ri}_4`, r.insight), r.dataSource),
            ])}
          />

          <SectionHeading num={4} title="Site Service Overview" />
          <DataTable
            headers={["Service", "Example Page"]}
            rows={s4.services.map((r: any, ri: number) => [e(`s4_${ri}_0`, r.service), e(`s4_${ri}_1`, r.examplePage)])}
          />

          <SectionHeading num={5} title="SEO Tier Diagnosis" />
          <div style={{ padding: "12px 16px", backgroundColor: "#FDF2F0", borderRadius: 4, border: `1px solid ${ACCENT}33`, marginBottom: 12, fontSize: "11px" }}>
            <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "12px" }}>
              Tier {s5.tier} — {s5.tierName}
            </div>
            <div style={{ color: "#374151", lineHeight: 1.6 }}>{e("s5_diagnosis", s5.diagnosis)}</div>
          </div>

          <SectionHeading num={6} title="What We Need to Do Next" />
          <ReportTable
            headers={["#", "Initiative", "Tier", "Action", "Reason"]}
            rows={s6.priorities.map((r: any, ri: number) => [
              cell(e(`s6_${ri}_0`, String(r.priority))),
              badgeCell(e(`s6_${ri}_1`, r.initiative), r.source),
              cell(e(`s6_${ri}_2`, r.tier)),
              cell(e(`s6_${ri}_3`, r.action)),
              cell(e(`s6_${ri}_4`, r.reason)),
            ])}
          />

          <SectionHeading num={7} title="What We Track" />
          <ReportTable
            headers={["Focus Area", "Metric", "Source", "Why It Matters"]}
            rows={s7.tracking.map((r: any, ri: number) => [
              cell(e(`s7_${ri}_0`, r.focusArea)),
              cell(e(`s7_${ri}_1`, r.metric)),
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                {parseS7Sources(e(`s7_${ri}_2`, r.source)).map((src: string, si: number) => (
                  <SourceBadge key={si} source={src} />
                ))}
              </span>,
              cell(e(`s7_${ri}_3`, r.whyItMatters)),
            ])}
          />

          {genMeta && (
            <div style={{ fontSize: "9px", color: "#9CA3AF", marginTop: 16 }}>
              <strong>Sources used:</strong> {genMeta.dataSources?.join(", ") || "None"}
              {genMeta.missingData?.length > 0 && (
                <span> · <strong>Missing:</strong> {genMeta.missingData.join(", ")}</span>
              )}
            </div>
          )}

          <div style={{ borderTop: "1px solid #9CA3AF", marginTop: "24px", paddingTop: "8px", paddingBottom: "32px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
            {FOOTER_TEXT}
          </div>
        </div>
      </div>
    </div>
  );
}
