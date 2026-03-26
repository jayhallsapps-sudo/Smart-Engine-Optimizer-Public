import { useEffect, useState } from "react";

import { SourceBadge } from "../components/report-preview/report-table";

const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";
const ACCENT = "#C0392B";

function applyBulletEdits(bullets: string[], sectionId: string, edits: Record<string, string>): string[] {
  return bullets.map((b, i) => edits[`${sectionId}_bullet_${i}`] ?? b);
}

function applyWorkLogEdits(workLog: any[], sectionId: string, edits: Record<string, string>): any[] {
  return workLog.map((row: any, ri: number) => {
    const editedDid = edits[`${sectionId}_worklog_${ri}_did`];
    const editedNext = edits[`${sectionId}_worklog_${ri}_next`];
    const items = editedDid !== undefined
      ? editedDid.split("\n").filter(Boolean).map(t => ({ text: t }))
      : (row.items ?? []);
    const nextItemsRich = editedNext !== undefined
      ? editedNext.split("\n").filter(Boolean).map(t => ({ text: t }))
      : (row.nextItemsRich ?? (row.nextItems ?? []).map((t: string) => ({ text: t })));
    return { ...row, items, nextItemsRich };
  });
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

function BulletList({ bullets }: { bullets: string[] }) {
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
                    <span style={{ color: "#16a34a", flexShrink: 0, marginTop: "1px", fontWeight: 700 }}>✓</span>
                    <span>{item.text}{item.source ? <> <SourceBadge source={item.source} /></> : null}</span>
                  </div>
                ))}
              </td>
              <td style={{ padding: "5px 10px", fontSize: "10px", verticalAlign: "top", borderBottom: "1px solid #F3F4F6", borderLeft: "1px solid #E5E7EB" }}>
                {(row.nextItemsRich ?? []).map((item: any, ii: number) => (
                  <div key={ii} style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginBottom: "2px" }}>
                    <span style={{ color: "#6B7280", flexShrink: 0, marginTop: "1px" }}>☐</span>
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

  const purposeBullets = purposeSection
    ? applyBulletEdits(purposeSection.bullets ?? [], "bw_purpose", edits)
    : [];
  const partnerBullets = partnerSection
    ? applyBulletEdits(partnerSection.bullets ?? [], "bw_partnership", edits)
    : [];
  const workLog = progressSection?.workLog?.length
    ? applyWorkLogEdits(progressSection.workLog, "bw_progress", edits)
    : [];

  return (
    <div data-report-root style={{ background: "white", margin: 0, padding: 0 }}>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button { display: none !important; }
      `}</style>

      <div style={{
        position: "relative",
        width: "8.5in",
        margin: "0 auto",
        padding: 0,
        background: "#fff",
      }}>
        {/* Header art */}
        <div style={{ position: "relative", width: "100%", lineHeight: 0 }}>
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

        {/* Content */}
        <div style={{ padding: "0.45in 0.6in 0.5in 0.6in" }}>
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
              <BulletList bullets={purposeBullets} />
            </div>
          )}

          {/* 2. Performance Pulse */}
          {pulseSection && (
            <div style={{ marginBottom: "16px" }}>
              <SectionHeading num={2} title="Performance Pulse" />
              {pulseSection.metrics && <PulseParagraph metrics={pulseSection.metrics} />}
            </div>
          )}

          {/* 3. Progress & Quick Wins */}
          {workLog.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <SectionHeading num={3} title="Progress &amp; Quick Wins" />
              <WorkLogTable workLog={workLog} />
            </div>
          )}

          {/* 4. Partnership & Alignment */}
          {partnerSection && (
            <div style={{ marginBottom: "16px" }}>
              <SectionHeading num={4} title={partnerSection.title ?? "Partnership &amp; Alignment"} />
              <BulletList bullets={partnerBullets} />
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: "1px solid #B8BDC7", marginTop: "24px", paddingTop: "8px", paddingBottom: "16px" }}>
            <div style={{ fontSize: "10px", lineHeight: 1.2, color: "#7C828D", textAlign: "center" }}>
              {FOOTER_TEXT}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
