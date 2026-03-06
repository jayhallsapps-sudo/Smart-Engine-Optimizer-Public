import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { EditableSection } from "./editable-section";
import { MetricCard } from "./report-chart";

interface BulletItem { text: string; url?: string; source?: string }

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
  const colors = SOURCE_COLORS[source] ?? { bg: "#F3F4F6", text: "#6B7280" };
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: "8px",
        padding: "1px 4px",
        borderRadius: "3px",
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        flexShrink: 0,
        letterSpacing: "0.01em",
      }}
    >
      {source}
    </span>
  );
}

function WorkLogBulletCell({
  editKey,
  rawValue,
  items,
  edits,
  onEdit,
}: {
  editKey: string;
  rawValue: string;
  items?: BulletItem[];
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const current = edits[editKey] ?? rawValue;
  const wasEdited = editKey in edits;

  const displayItems: BulletItem[] =
    !wasEdited && items && items.length > 0
      ? items
      : current.split("\n").filter(Boolean).map(t => ({ text: t.trim() }));

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  function startEdit() {
    setDraft(current);
    setEditing(true);
  }

  function commit() {
    onEdit(editKey, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="relative inline-block w-full">
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full border-2 border-border rounded px-2 py-1 text-[10px] font-inherit bg-background resize-y min-h-[60px] outline-none focus:border-primary"
        />
        <span className="flex gap-1 mt-1">
          <button onClick={commit} className="flex items-center gap-1 text-[10px] px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">
            <Check className="w-2.5 h-2.5" /> Save
          </button>
          <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-[10px] px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500">
            <X className="w-2.5 h-2.5" /> Cancel
          </button>
        </span>
      </span>
    );
  }

  return (
    <div
      className="group relative cursor-pointer hover:outline hover:outline-1 hover:outline-border rounded transition-all min-h-[20px]"
      onClick={startEdit}
      title="Click to edit"
    >
      <ul className="space-y-0.5 list-none p-0 m-0">
        {displayItems.length === 0 ? (
          <li className="text-muted-foreground italic">—</li>
        ) : (
          displayItems.map((item, ii) => (
            <li key={ii} className="flex items-start gap-1.5 flex-wrap">
              <span className="text-gray-400 mt-px shrink-0">•</span>
              <span className="flex items-start gap-1 flex-1 flex-wrap">
                {item.url && !wasEdited ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline break-all"
                    onClick={e => e.stopPropagation()}
                  >
                    {item.text}
                  </a>
                ) : (
                  <span className="break-words">{item.text}</span>
                )}
                {item.source && !wasEdited && <SourceBadge source={item.source} />}
              </span>
            </li>
          ))
        )}
      </ul>
      <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 pointer-events-none" />
    </div>
  );
}

export interface DocxSection {
  id: string;
  type: "header" | "pulse" | "progress" | "partnership" | "qbr-exec" | "qbr-category" | "bullets" | "technical";
  title?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }>;
  bullets?: string[];
  workLog?: Array<{
    area: string;
    whatWeDid: string;
    whatsNext: string;
    items?: Array<{ text: string; url?: string; source?: string }>;
    nextItems?: string[];
    nextItemsRich?: Array<{ text: string; url?: string; source?: string }>;
  }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  technicalTable?: { headers: string[]; rows: string[][] };
  wins?: Array<{ title: string; evidence: string; source: string }>;
  topOpps?: Array<{ priority: string; title: string; category: string; impact: string; kpi: string }>;
  opportunities?: Array<{
    opportunity_title: string;
    priority: string;
    impact: string;
    effort: string;
    kpi_affected: string;
    urls: string[];
    evidence: string;
    problem: string;
    opportunity: string;
    why_it_matters: string;
    recommended_next_step: string;
  }>;
  loading?: boolean;
}

interface DocxPreviewProps {
  clientName: string;
  reportTitle: string;
  date: string;
  reportingWindow?: string;
  sections: DocxSection[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  attendees?: string;
  preparedBy?: string;
  footerText?: string;
  bwTheme?: boolean;
}

const PRIO_COLORS: Record<string, string> = {
  P0: "#C0392B",
  P1: "#D68910",
  P2: "#1B3A6B",
};

const PRIO_LABELS: Record<string, string> = {
  P0: "P0 — Critical",
  P1: "P1 — High",
  P2: "P2 — Standard",
};

const EFFORT_LABELS: Record<string, string> = {
  S: "S (Small)",
  M: "M (Medium)",
  L: "L (Large)",
};

const BW_SECTION_NUMS: Record<string, number> = {
  bw_pulse: 1,
  bw_progress: 2,
  bw_technical: 3,
  bw_partnership: 3,
};

export function DocxPreview({
  clientName,
  reportTitle,
  date,
  reportingWindow,
  sections,
  edits,
  onEdit,
  attendees,
  preparedBy,
  footerText = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
  bwTheme = false,
}: DocxPreviewProps) {
  const accentColor = bwTheme ? "#C0392B" : "#1B3A6B";
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bwTheme) return;
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, [bwTheme]);

  if (bwTheme) {
    const purposeSection = sections.find(s => s.id === "bw_purpose");
    const otherSections = sections.filter(s => s.id !== "bw_purpose");

    return (
      <div className="bg-muted/30 min-h-full flex items-start justify-center p-6 overflow-y-auto">
        <div
          className="bg-white shadow-lg overflow-hidden"
          style={{
            width: "794px",
            minHeight: "1123px",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
            fontSize: "11pt",
            color: "#111827",
          }}
          data-testid="docx-preview-page"
        >
          {headerImgUrl ? (
            <img src={headerImgUrl} alt="Header" style={{ width: "100%", display: "block", flexShrink: 0 }} />
          ) : (
            <div style={{ width: "100%", height: "120px", flexShrink: 0, background: `linear-gradient(135deg, #C0392B 60%, #a02820)`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "32px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "white", letterSpacing: "3px", lineHeight: 1 }}>W</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", letterSpacing: "4px" }}>WEBSERV</div>
              </div>
            </div>
          )}

          <div style={{ padding: "24px 56px 0", flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}>
                <EditableSection editKey="report_title" value={reportTitle} edits={edits} onEdit={onEdit} as="span" />
                {": "}
                <EditableSection editKey="client_name" value={clientName} edits={edits} onEdit={onEdit} as="span" />
              </div>
              {reportingWindow && (
                <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px" }}>
                  Reporting Period: {reportingWindow}
                </div>
              )}
              {preparedBy !== undefined && (
                <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                  <strong>Prepared by: </strong>
                  <EditableSection editKey="preparedBy" value={preparedBy} edits={edits} onEdit={onEdit} as="span" />
                </div>
              )}
              {attendees !== undefined && (
                <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                  <strong>Attendees: </strong>
                  <EditableSection editKey="attendees" value={attendees} edits={edits} onEdit={onEdit} as="span" />
                </div>
              )}
              <div style={{ fontSize: "12px", display: "inline-block", backgroundColor: "#E8EAED", padding: "2px 8px", borderRadius: "3px", marginBottom: "20px" }}>
                <strong>Reporting Date: </strong>
                <EditableSection editKey="report_date" value={date} edits={edits} onEdit={onEdit} as="span" />
              </div>

              {purposeSection && (
                <div style={{ marginBottom: "20px" }}>
                  <div
                    className="text-base font-bold"
                    style={{ color: accentColor, borderBottom: `2px solid ${accentColor}`, paddingBottom: 4, marginBottom: 8 }}
                  >
                    1. Purpose
                  </div>
                  <div style={{ fontSize: "12px", color: "#374151" }}>
                    <EditableSection
                      editKey="bw_purpose_bullet_0"
                      value={purposeSection.bullets?.[0] ?? ""}
                      edits={edits}
                      onEdit={onEdit}
                      as="div"
                      multiline
                    />
                  </div>
                </div>
              )}

              {otherSections.map(section => (
                <DocxSectionBlock
                  key={section.id}
                  section={section}
                  sectionIndex={BW_SECTION_NUMS[section.id] ?? 0}
                  edits={edits}
                  onEdit={onEdit}
                  bwTheme={bwTheme}
                />
              ))}
            </div>

            <div style={{ borderTop: "1px solid #9CA3AF", marginTop: "24px", paddingTop: "8px", paddingBottom: "32px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
              {footerText}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-200 dark:bg-gray-700 min-h-full p-4 overflow-y-auto">
      <div
        className="bg-white shadow-lg mx-auto"
        style={{
          width: "794px",
          minHeight: "1123px",
          fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
          fontSize: "11pt",
          color: "#111827",
          padding: "72px 90px",
        }}
        data-testid="docx-preview-page"
      >
        <div style={{ borderBottom: `3px solid ${accentColor}`, paddingBottom: 12, marginBottom: 20 }}>
          <EditableSection
            editKey="report_title"
            value={reportTitle}
            edits={edits}
            onEdit={onEdit}
            as="div"
            className="text-3xl font-bold"
            style={{ color: accentColor } as any}
          />
          <EditableSection
            editKey="client_name"
            value={clientName}
            edits={edits}
            onEdit={onEdit}
            as="div"
            className="text-xl font-semibold mt-1"
            style={{ color: "#374151" } as any}
          />
          {preparedBy !== undefined && (
            <div className="text-sm mt-1 text-gray-600">
              <span className="font-semibold">Prepared by: </span>
              <EditableSection editKey="preparedBy" value={preparedBy} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          {attendees !== undefined && (
            <div className="text-sm mt-1 text-gray-600">
              <span className="font-semibold">Attendees: </span>
              <EditableSection editKey="attendees" value={attendees} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          <div className="text-sm text-gray-500 mt-0.5">
            <span className="font-semibold">Date: </span>
            <EditableSection editKey="report_date" value={date} edits={edits} onEdit={onEdit} as="span" />
          </div>
        </div>

        {sections.map((section, si) => (
          <DocxSectionBlock
            key={section.id}
            section={section}
            sectionIndex={si}
            edits={edits}
            onEdit={onEdit}
            bwTheme={bwTheme}
          />
        ))}

        <div
          className="text-xs text-center text-gray-400 mt-8"
          style={{ borderTop: `2px solid ${accentColor}`, paddingTop: 8 }}
        >
          {footerText}
        </div>
      </div>
    </div>
  );
}

function DocxSectionBlock({
  section,
  sectionIndex,
  edits,
  onEdit,
  bwTheme,
}: {
  section: DocxSection;
  sectionIndex: number;
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  bwTheme: boolean;
}) {
  if (section.loading) {
    return (
      <div className="mb-6 animate-pulse" data-testid={`section-loading-${section.id}`}>
        <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-full mb-1" />
        <div className="h-3 bg-gray-100 rounded w-5/6 mb-1" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
    );
  }

  const accentColor = bwTheme ? "#C0392B" : "#1B3A6B";
  const tableHeaderBg = bwTheme ? "#111827" : "#1B3A6B";
  const num = sectionIndex + 1;

  return (
    <div className="mb-6" data-testid={`section-${section.id}`}>
      {section.title && (
        <div
          className="text-base font-bold mb-2"
          style={{
            color: accentColor,
            borderBottom: `2px solid ${accentColor}`,
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          {num}. {section.title}
        </div>
      )}

      {section.type === "pulse" && section.metrics && bwTheme && (() => {
        const metrics = section.metrics!;
        const get = (label: string) => metrics.find(m => m.label === label)?.current ?? "—";
        const nsmQuarter      = get("NSM Quarter");
        const nsmSessGoal     = get("NSM Sessions Goal");
        const nsmSessActual   = get("NSM Sessions Actual");
        const nsmSessPct      = get("NSM Sessions %");
        const nsmSessTrack    = get("NSM Sessions On Track");
        const mvpMetric       = metrics.find(m => /NSM MVP .* Goal/.test(m.label));
        const mvpLabel        = mvpMetric?.label.replace(" Goal", "") ?? "NSM MVP";
        const nsmMvpGoal      = mvpMetric?.current ?? "—";
        const nsmMvpActual    = get(mvpLabel + " Actual");
        const nsmMvpPct       = get(mvpLabel + " %");
        const nsmMvpTrack     = get(mvpLabel + " On Track");
        const mainMetrics     = metrics.filter(m => !m.label.startsWith("NSM"));
        const hasNsm          = nsmQuarter !== "—";
        return (
          <div className="space-y-2 text-[12px]">
            {mainMetrics.map((m, mi) => {
              const insightKey = `bw_pulse_insight_${mi}`;
              return (
                <div key={mi}>
                  <div className="flex items-start gap-1.5">
                    <span style={{ color: accentColor }} className="font-bold mt-0.5 shrink-0">●</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold" style={{ color: accentColor }}>{m.label}: </span>
                      <span>{m.current}</span>
                      {m.source && <SourceBadge source={m.source} />}
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 pl-5 mt-0.5 text-[11px] text-gray-500">
                    <span className="shrink-0 mt-0.5">○</span>
                    <EditableSection
                      editKey={insightKey}
                      value={edits[insightKey] ?? ""}
                      edits={edits}
                      onEdit={onEdit}
                      as="span"
                      className="italic flex-1"
                    />
                  </div>
                </div>
              );
            })}
            {hasNsm && (
              <div className="mt-3 border rounded-md overflow-hidden text-[11px]" style={{ borderColor: accentColor + "40" }}>
                <div className="px-3 py-1.5 font-semibold" style={{ backgroundColor: accentColor + "18", color: accentColor }}>
                  NSM Goals — {nsmQuarter}
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-gray-500 border-b" style={{ backgroundColor: "#F9FAFB" }}>
                      <th className="text-left px-3 py-1 font-medium">Metric</th>
                      <th className="text-right px-2 py-1 font-medium">Goal</th>
                      <th className="text-right px-2 py-1 font-medium">Actual</th>
                      <th className="text-right px-2 py-1 font-medium">%</th>
                      <th className="text-right px-3 py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-1.5 font-medium">Organic Sessions</td>
                      <td className="text-right px-2 py-1.5">{nsmSessGoal}</td>
                      <td className="text-right px-2 py-1.5">{nsmSessActual}</td>
                      <td className="text-right px-2 py-1.5">{nsmSessPct}</td>
                      <td className="text-right px-3 py-1.5">{nsmSessTrack}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-medium">{mvpLabel.replace("NSM MVP ", "").replace("(", "").replace(")", "")}</td>
                      <td className="text-right px-2 py-1.5">{nsmMvpGoal}</td>
                      <td className="text-right px-2 py-1.5">{nsmMvpActual}</td>
                      <td className="text-right px-2 py-1.5">{nsmMvpPct}</td>
                      <td className="text-right px-3 py-1.5">{nsmMvpTrack}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-gray-100 text-[11px]">
                  <EditableSection
                    editKey="bw_nsm_notes"
                    value={edits["bw_nsm_notes"] ?? "Add notes on NSM progress..."}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    className="italic text-gray-400"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {section.type === "pulse" && section.metrics && !bwTheme && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {section.metrics.map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
          </div>
        </div>
      )}

      {section.bullets && section.bullets.map((b, bi) => (
        <div key={bi} className="flex gap-2 text-[12px] mb-1">
          <span className="font-bold mt-0.5" style={{ color: accentColor }}>•</span>
          <EditableSection
            editKey={`${section.id}_bullet_${bi}`}
            value={b}
            edits={edits}
            onEdit={onEdit}
            as="span"
            className="flex-1"
          />
        </div>
      ))}

      {section.type === "progress" && section.workLog && section.workLog.length > 0 && (
        <div className="border rounded-md overflow-hidden text-[11px]" style={{ borderColor: accentColor + "40" }}>
          <div className="px-3 py-1.5 font-semibold text-[11px]" style={{ backgroundColor: "#FDF2F0", color: accentColor }}>
            Progress &amp; Quick Wins
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ backgroundColor: "#F9FAFB" }}>
                {["Area", "What We Did / Learned", "What's Next"].map(h => (
                  <th
                    key={h}
                    className="text-left px-3 py-1.5 text-[10px] font-medium border-b"
                    style={{ color: "#6B7280", borderColor: "#E5E7EB" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.workLog.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? "#F9FAFB" : "white" }}>
                  <td className="px-3 py-1.5 border-b border-gray-100 text-[10px] align-top font-medium w-28">{row.area || "—"}</td>
                  <td className="px-3 py-1.5 border-b border-gray-100 border-l text-[10px] align-top" style={{ borderLeftColor: "#E5E7EB" }}>
                    <WorkLogBulletCell
                      editKey={`${section.id}_worklog_${ri}_did`}
                      rawValue={row.whatWeDid}
                      items={row.items}
                      edits={edits}
                      onEdit={onEdit}
                    />
                  </td>
                  <td className="px-3 py-1.5 border-b border-gray-100 border-l text-[10px] align-top" style={{ borderLeftColor: "#E5E7EB" }}>
                    <WorkLogBulletCell
                      editKey={`${section.id}_worklog_${ri}_next`}
                      rawValue={row.whatsNext}
                      items={row.nextItemsRich ?? row.nextItems?.map(t => ({ text: t }))}
                      edits={edits}
                      onEdit={onEdit}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.type === "technical" && section.technicalTable && (
        <table className="w-full text-xs border-collapse mt-1">
          <thead>
            <tr>
              {section.technicalTable.headers.map(h => (
                <th
                  key={h}
                  className="text-left px-2 py-1.5 text-white text-[10px]"
                  style={{ background: tableHeaderBg }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.technicalTable.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "#F0F4FA" : "white" }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 border border-[#D1D5DB] text-[10px] align-top">
                    <EditableSection
                      editKey={`${section.id}_tech_${ri}_${ci}`}
                      value={cell}
                      edits={edits}
                      onEdit={onEdit}
                      as="span"
                      multiline
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.table && (
        <table className="w-full text-xs border-collapse mt-1">
          <thead>
            <tr>
              {section.table.headers.map(h => (
                <th key={h} className="text-left px-2 py-1.5 text-white text-[10px]" style={{ background: tableHeaderBg }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.table.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "#F0F4FA" : "white" }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 border border-[#D1D5DB] text-[10px]">{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.type === "qbr-exec" && (
        <QbrExecSection section={section} edits={edits} onEdit={onEdit} />
      )}

      {section.type === "qbr-category" && section.opportunities && (
        <QbrCategorySection section={section} edits={edits} onEdit={onEdit} />
      )}
    </div>
  );
}

function QbrExecSection({ section, edits, onEdit }: { section: DocxSection; edits: Record<string, string>; onEdit: (k: string, v: string) => void }) {
  return (
    <div>
      {section.wins && section.wins.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-bold mb-2" style={{ color: "#1B6B3A" }}>
            Top Wins
          </div>
          {section.wins.map((win, wi) => (
            <div key={wi} className="mb-2 pl-3 border-l-4 border-green-500">
              <EditableSection
                editKey={`exec_win_${wi}_title`}
                value={win.title}
                edits={edits}
                onEdit={onEdit}
                as="div"
                className="text-sm font-semibold"
              />
              <div className="text-xs text-gray-500">
                <span className="font-medium">{win.source}:</span>{" "}
                <EditableSection
                  editKey={`exec_win_${wi}_evidence`}
                  value={win.evidence}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {section.topOpps && section.topOpps.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2" style={{ color: "#1B3A6B" }}>
            Top Opportunities
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {["Priority", "Opportunity", "Category", "Impact", "KPI"].map(h => (
                  <th key={h} className="text-left px-2 py-1.5 text-white text-[10px]" style={{ background: "#1B3A6B" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.topOpps.map((opp, oi) => (
                <tr key={oi} style={{ background: oi % 2 === 0 ? "#F0F4FA" : "white" }}>
                  <td className="px-2 py-1.5 border border-[#E5E7EB] text-[10px] font-bold" style={{ color: PRIO_COLORS[opp.priority] ?? "#1B3A6B" }}>
                    {opp.priority}
                  </td>
                  <td className="px-2 py-1.5 border border-[#E5E7EB] text-[10px]">{opp.title}</td>
                  <td className="px-2 py-1.5 border border-[#E5E7EB] text-[10px]">{opp.category}</td>
                  <td className="px-2 py-1.5 border border-[#E5E7EB] text-[10px]">{opp.impact}</td>
                  <td className="px-2 py-1.5 border border-[#E5E7EB] text-[10px]">{opp.kpi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QbrCategorySection({ section, edits, onEdit }: { section: DocxSection; edits: Record<string, string>; onEdit: (k: string, v: string) => void }) {
  return (
    <div>
      {(section.opportunities ?? []).map((opp, oi) => {
        const prioColor = PRIO_COLORS[opp.priority] ?? "#1B3A6B";
        const catId = section.id;
        const fields: Array<[string, string, string]> = [
          ["evidence", "Evidence", opp.evidence],
          ["problem", "Problem", opp.problem],
          ["opportunity", "Opportunity", opp.opportunity],
          ["why", "Why It Matters", opp.why_it_matters],
          ["next", "Recommended Next Step", opp.recommended_next_step],
        ];
        return (
          <div key={oi} className="mb-4 border border-gray-200 rounded overflow-hidden">
            <div className="px-3 py-2 text-sm font-bold text-white" style={{ background: prioColor }}>
              {oi + 1}. {opp.opportunity_title}
            </div>
            <div className="px-3 py-1.5 text-[10px] bg-gray-50 border-b border-gray-200 flex gap-4 flex-wrap">
              <span className="font-semibold">{PRIO_LABELS[opp.priority] ?? opp.priority}</span>
              <span>Impact: <span className="font-medium">{opp.impact}</span></span>
              <span>Effort: <span className="font-medium">{EFFORT_LABELS[opp.effort] ?? opp.effort}</span></span>
              <span>KPI: <span className="font-medium">{opp.kpi_affected}</span></span>
            </div>
            {opp.urls.length > 0 && (
              <div className="px-3 py-1 text-[10px] bg-white border-b border-gray-100">
                <span className="font-semibold text-gray-600">URL(s): </span>
                {opp.urls.join(", ")}
              </div>
            )}
            {fields.map(([fkey, label, val]) => (
              <div key={fkey} className="px-3 py-1.5 text-[10px] bg-white border-b border-gray-100 last:border-b-0">
                <span className="font-semibold text-gray-700">{label}: </span>
                <EditableSection
                  editKey={`${catId}_opp_${oi}_${fkey}`}
                  value={val}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                  multiline={fkey !== "evidence"}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
