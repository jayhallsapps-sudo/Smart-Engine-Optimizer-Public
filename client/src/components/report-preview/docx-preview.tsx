import { EditableSection } from "./editable-section";
import { MetricCard } from "./report-chart";

export interface DocxSection {
  id: string;
  type: "header" | "pulse" | "progress" | "partnership" | "qbr-exec" | "qbr-category" | "bullets" | "technical";
  title?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean }>;
  bullets?: string[];
  workLog?: Array<{ area: string; whatWeDid: string; whatsNext: string }>;
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

export function DocxPreview({
  clientName,
  reportTitle,
  date,
  sections,
  edits,
  onEdit,
  attendees,
  preparedBy,
  footerText = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
  bwTheme = false,
}: DocxPreviewProps) {
  const accentColor = bwTheme ? "#C0392B" : "#1B3A6B";

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
              <EditableSection
                editKey="preparedBy"
                value={preparedBy}
                edits={edits}
                onEdit={onEdit}
                as="span"
              />
            </div>
          )}
          {attendees !== undefined && (
            <div className="text-sm mt-1 text-gray-600">
              <span className="font-semibold">Attendees: </span>
              <EditableSection
                editKey="attendees"
                value={attendees}
                edits={edits}
                onEdit={onEdit}
                as="span"
              />
            </div>
          )}
          <div className="text-sm text-gray-500 mt-0.5">
            <span className="font-semibold">Date: </span>
            <EditableSection
              editKey="report_date"
              value={date}
              edits={edits}
              onEdit={onEdit}
              as="span"
            />
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

      {section.type === "pulse" && section.metrics && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {section.metrics.map((m, mi) => (
              <MetricCard key={mi} {...m} />
            ))}
          </div>
        </div>
      )}

      {section.bullets && section.bullets.map((b, bi) => (
        <div key={bi} className="flex gap-2 text-sm mb-1">
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
        <table className="w-full text-xs border-collapse mt-1">
          <thead>
            <tr>
              {["Area", "What We Did / Learned", "What's Next"].map(h => (
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
            {section.workLog.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "#F0F4FA" : "white" }}>
                <td className="px-2 py-1.5 border border-[#D1D5DB] text-[10px] align-top">{row.area || "—"}</td>
                <td className="px-2 py-1.5 border border-[#D1D5DB] text-[10px] align-top">
                  <EditableSection
                    editKey={`${section.id}_worklog_${ri}_did`}
                    value={row.whatWeDid}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    multiline
                  />
                </td>
                <td className="px-2 py-1.5 border border-[#D1D5DB] text-[10px] align-top">
                  <EditableSection
                    editKey={`${section.id}_worklog_${ri}_next`}
                    value={row.whatsNext}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    multiline
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
