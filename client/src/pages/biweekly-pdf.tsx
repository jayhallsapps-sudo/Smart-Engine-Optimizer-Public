import { useEffect, useState } from "react";

const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";
const ACCENT = "#C0392B";
const TABLE_HEADER_BG = "#111827";

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  "Airtable":       { bg: "#FFF3D6", text: "#B45309" },
  "Asana":          { bg: "#FDEAEA", text: "#C0392B" },
  "Screaming Frog": { bg: "#E6F4EA", text: "#1E7E34" },
  "GA4":            { bg: "#E8F0FE", text: "#1967D2" },
  "GSC":            { bg: "#E6F4EA", text: "#137333" },
  "CallRail":       { bg: "#F3E8FF", text: "#6D28D9" },
  "NSM":            { bg: "#EEF2FF", text: "#4338CA" },
};

function SourceBadge({ source }: { source: string }) {
  const c = SOURCE_COLORS[source] ?? { bg: "#F3F4F6", text: "#6B7280" };
  return (
    <span style={{ backgroundColor: c.bg, color: c.text, fontSize: "8px", padding: "1px 4px", borderRadius: "3px", fontWeight: 500, lineHeight: 1.4, whiteSpace: "nowrap", display: "inline-block" }}>
      {source}
    </span>
  );
}

function StatusIcon({ value }: { value: string }) {
  const isBad = value.includes("❌") || value.toLowerCase().includes("behind") || value.toLowerCase().includes("no");
  const isGood = value.includes("✅") || value.toLowerCase().includes("on track") || value.toLowerCase().includes("yes");
  const label = value.replace(/❌|✅/g, "").trim();

  if (isBad) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
        <svg viewBox="0 0 24 24" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
          <path d="M18 6L6 18M6 6l12 12" stroke="#E23D28" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <span style={{ color: "#E23D28", fontWeight: 600 }}>{label || "Behind"}</span>
      </span>
    );
  }
  if (isGood) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
        <svg viewBox="0 0 24 24" width="13" height="13" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
          <path d="M5 13l4 4L19 7" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ color: "#16A34A", fontWeight: 600 }}>{label || "On Track"}</span>
      </span>
    );
  }
  return <span>{value}</span>;
}

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div style={{ color: ACCENT, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4, marginBottom: 8, fontSize: "13px", fontWeight: 700 }}>
      {num}. {title}
    </div>
  );
}

function BulletList({ bullets, sectionId }: { bullets: string[]; sectionId: string }) {
  return (
    <div>
      {bullets.map((b, i) => (
        <div key={i} style={{ display: "flex", gap: "6px", fontSize: "12px", marginBottom: "3px" }}>
          <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>•</span>
          <span>{b}</span>
        </div>
      ))}
    </div>
  );
}

function PulseParagraph({ metrics }: { metrics: any[] }) {
  const mainMetrics = metrics.filter(m => !m.label.startsWith("NSM"));
  const nsmQuarter   = metrics.find(m => m.label === "NSM Quarter")?.current ?? "—";
  const nsmSessGoal  = metrics.find(m => m.label === "NSM Sessions Goal")?.current ?? "—";
  const nsmSessAct   = metrics.find(m => m.label === "NSM Sessions Actual")?.current ?? "—";
  const nsmSessPct   = metrics.find(m => m.label === "NSM Sessions %")?.current ?? "—";
  const nsmSessTrack = metrics.find(m => m.label === "NSM Sessions On Track")?.current ?? "—";
  const mvpMetric    = metrics.find(m => /NSM MVP .* Goal/.test(m.label));
  const mvpLabel     = mvpMetric?.label.replace(" Goal","") ?? "NSM MVP";
  const nsmMvpGoal   = mvpMetric?.current ?? "—";
  const nsmMvpAct    = metrics.find(m => m.label === mvpLabel + " Actual")?.current ?? "—";
  const nsmMvpPct    = metrics.find(m => m.label === mvpLabel + " %")?.current ?? "—";
  const nsmMvpTrack  = metrics.find(m => m.label === mvpLabel + " On Track")?.current ?? "—";
  const hasNsm = nsmQuarter !== "—";

  return (
    <div>
      {mainMetrics.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "12px", marginBottom: "4px" }}>
          <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>●</span>
          <div>
            <span style={{ color: ACCENT, fontWeight: 700 }}>{m.label}: </span>
            <span>{m.current}</span>
            {m.source && <> <SourceBadge source={m.source} /></>}
          </div>
        </div>
      ))}
      {hasNsm && (
        <div style={{ marginTop: "8px", border: `1px solid ${ACCENT}40`, borderRadius: "6px", overflow: "hidden", fontSize: "11px" }}>
          <div style={{ padding: "6px 12px", fontWeight: 600, backgroundColor: `${ACCENT}18`, color: ACCENT }}>
            NSM Goals — {nsmQuarter}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#F9FAFB" }}>
                {["Metric","Goal","Actual","%","Status"].map(h => (
                  <th key={h} style={{ textAlign: h === "Metric" ? "left" : "right", padding: "4px 8px", fontSize: "10px", color: "#6B7280", fontWeight: 500, borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "5px 8px", fontWeight: 500 }}>Organic Sessions</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmSessGoal}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmSessAct}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmSessPct}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}><StatusIcon value={nsmSessTrack} /></td>
              </tr>
              <tr>
                <td style={{ padding: "5px 8px", fontWeight: 500 }}>{mvpLabel.replace("NSM MVP ","").replace(/[()]/g,"")}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmMvpGoal}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmMvpAct}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{nsmMvpPct}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}><StatusIcon value={nsmMvpTrack} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkLogTable({ workLog }: { workLog: any[] }) {
  return (
    <div style={{ border: `1px solid ${ACCENT}40`, borderRadius: "6px", overflow: "hidden", fontSize: "11px" }}>
      <div style={{ padding: "6px 12px", fontWeight: 600, fontSize: "11px", backgroundColor: "#FDF2F0", color: ACCENT }}>
        Progress &amp; Quick Wins
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#F9FAFB" }}>
            {["Area","What We Did / Learned","What's Next"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "5px 10px", fontSize: "10px", color: "#6B7280", fontWeight: 500, borderBottom: "1px solid #E5E7EB" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workLog.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? "#F9FAFB" : "white" }}>
              <td style={{ padding: "5px 10px", fontSize: "10px", verticalAlign: "top", fontWeight: 500, width: "80px", borderBottom: "1px solid #F3F4F6" }}>{row.area || "—"}</td>
              <td style={{ padding: "5px 10px", fontSize: "10px", verticalAlign: "top", borderBottom: "1px solid #F3F4F6", borderLeft: "1px solid #E5E7EB" }}>
                {(row.items ?? []).map((item: any, ii: number) => (
                  <div key={ii} style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginBottom: "2px" }}>
                    <span style={{ color: ACCENT, flexShrink: 0, marginTop: "1px" }}>•</span>
                    <span>{item.text}{item.source ? <> <SourceBadge source={item.source} /></> : null}</span>
                  </div>
                ))}
              </td>
              <td style={{ padding: "5px 10px", fontSize: "10px", verticalAlign: "top", borderBottom: "1px solid #F3F4F6", borderLeft: "1px solid #E5E7EB" }}>
                {(row.nextItemsRich ?? (row.nextItems ?? []).map((t: string) => ({ text: t }))).map((item: any, ii: number) => (
                  <div key={ii} style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginBottom: "2px" }}>
                    <span style={{ color: ACCENT, flexShrink: 0, marginTop: "1px" }}>•</span>
                    <span>{item.text}{item.source ? <> <SourceBadge source={item.source} /></> : null}</span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PdfPage({ children, headerImgUrl, isLast }: { children: React.ReactNode; headerImgUrl: string | null; isLast: boolean }) {
  return (
    <div className="pdf-page" style={{
      position: "relative",
      width: "8.5in",
      height: "11in",
      margin: "0 auto",
      padding: 0,
      overflow: "hidden",
      background: "#fff",
      pageBreakAfter: isLast ? "auto" : "always",
    }}>
      {/* Header art — flush to top/left/right, outside inner padding */}
      <div className="page-bg-header" style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none", zIndex: 0 }}>
        {headerImgUrl ? (
          <img src={headerImgUrl} alt="" style={{ width: "100%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "120px", background: `linear-gradient(135deg, #C0392B 60%, #a02820)`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "32px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "white", letterSpacing: "3px", lineHeight: 1 }}>W</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", letterSpacing: "4px" }}>WEBSERV</div>
            </div>
          </div>
        )}
      </div>

      {/* Content — padded, sits above header */}
      <div className="pdf-page-inner" style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", padding: "0.7in 0.6in 0.7in 0.6in", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {children}
      </div>

      {/* Footer — absolutely positioned at bottom of page */}
      <footer style={{ position: "absolute", left: "0.6in", right: "0.6in", bottom: "0.32in", zIndex: 2 }}>
        <div style={{ borderTop: "1px solid #B8BDC7", marginBottom: "6px" }} />
        <div style={{ fontSize: "10px", lineHeight: 1.2, color: "#7C828D", textAlign: "center" }}>
          {FOOTER_TEXT}
        </div>
      </footer>
    </div>
  );
}

export default function BiweeklyPdf() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
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

  const { report, edits } = data;
  const clientName    = edits["client_name"]  ?? report.client_name  ?? "";
  const reportTitle   = edits["report_title"] ?? report.report_title ?? "SEO Bi-weekly Meeting";
  const date          = edits["report_date"]  ?? report.date         ?? "";
  const reportingWindow = report.reportingWindow ?? "";
  const preparedBy    = edits["preparedBy"]   ?? report.preparedBy   ?? "";

  const sections: any[] = report.sections ?? [];
  const purposeSection    = sections.find(s => s.id === "bw_purpose");
  const pulseSection      = sections.find(s => s.id === "bw_pulse");
  const progressSection   = sections.find(s => s.id === "bw_progress");
  const partnerSection    = sections.find(s => s.id === "bw_partnership");

  // Header height — estimate 120px at 96dpi → ~1.25in. Content top padding is 0.7in.
  // First 1.25in is covered by header art, then content starts at 0.7in from top (within the art area).
  const headerHeight = headerImgUrl ? "120px" : "120px";

  return (
    <>
      <style>{`
        @page { size: Letter; margin: 0; }
        html, body { margin: 0; padding: 0; background: #111; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button { display: none !important; }
      `}</style>

      {/* PAGE 1 — Header art, metadata, Purpose, Performance Pulse */}
      <PdfPage headerImgUrl={headerImgUrl} isLast={false}>
        {/* Spacer to push content below header art */}
        <div style={{ height: headerHeight, flexShrink: 0 }} />

        {/* Title block */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
            {reportTitle}: <span>{clientName}</span>
          </div>
          {reportingWindow && <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>Reporting Period: {reportingWindow}</div>}
          {preparedBy && <div style={{ fontSize: "11px", marginTop: "2px" }}><strong>Prepared by: </strong>{preparedBy}</div>}
          <div style={{ display: "inline-block", fontSize: "11px", backgroundColor: "#E8EAED", padding: "2px 8px", borderRadius: "3px", marginTop: "4px" }}>
            <strong>Reporting Date: </strong>{date}
          </div>
        </div>

        {/* 1. Purpose */}
        {purposeSection && (
          <div style={{ marginBottom: "16px" }}>
            <SectionHeading num={1} title="Purpose" />
            <BulletList bullets={purposeSection.bullets ?? []} sectionId="bw_purpose" />
          </div>
        )}

        {/* 2. Performance Pulse */}
        {pulseSection && (
          <div style={{ marginBottom: "16px" }}>
            <SectionHeading num={2} title="Performance Pulse" />
            {pulseSection.metrics && <PulseParagraph metrics={pulseSection.metrics} />}
          </div>
        )}
      </PdfPage>

      {/* PAGE 2 — Progress & Quick Wins, Partnership & Alignment */}
      <PdfPage headerImgUrl={headerImgUrl} isLast={true}>
        {/* Smaller spacer on page 2 — header art still bleeds but we start content sooner */}
        <div style={{ height: headerHeight, flexShrink: 0 }} />

        {/* 3. Progress & Quick Wins */}
        {progressSection && progressSection.workLog && progressSection.workLog.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <SectionHeading num={3} title="Progress &amp; Quick Wins" />
            <WorkLogTable workLog={progressSection.workLog} />
          </div>
        )}

        {/* 4. Partnership & Alignment */}
        {partnerSection && (
          <div style={{ marginBottom: "16px" }}>
            <SectionHeading num={4} title={partnerSection.title ?? "Partnership &amp; Alignment"} />
            <BulletList bullets={partnerSection.bullets ?? []} sectionId="bw_partnership" />
          </div>
        )}
      </PdfPage>
    </>
  );
}
