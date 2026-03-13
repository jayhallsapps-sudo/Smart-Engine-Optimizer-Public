import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, CheckCircle2, XCircle } from "lucide-react";
import { listReportTypes } from "@shared/reportRegistry";
import { QBS_QBR_FIELD_MAP } from "@/lib/qbsQbrMapping";

// ─── Static representation of workflow field maps ─────────────────────────────
// These mirror workflowFieldMapping.ts but are shown as read-only config data.

const WORKFLOW_FIELD_MAPS = [
  {
    reportId: "biweekly",
    reportLabel: "Bi-Weekly",
    fields: [
      { fieldId: "amThoughts", fieldLabel: "AM's Hypothesis", sourceHint: "AM notes from all committed areas" },
      { fieldId: "priorityChecks", fieldLabel: "Priority Checks", sourceHint: "Accepted findings from all committed areas" },
    ],
  },
  {
    reportId: "monthly",
    reportLabel: "Monthly",
    fields: [
      { fieldId: "amThoughts", fieldLabel: "AM's Hypothesis", sourceHint: "AM notes from all committed areas" },
      { fieldId: "priorityChecks", fieldLabel: "Priority Checks", sourceHint: "Accepted findings from all committed areas" },
      { fieldId: "amContextAnomalies", fieldLabel: "Context Anomalies", sourceHint: "Findings from technical infrastructure & advanced technical areas" },
      { fieldId: "amFocusNextMonth", fieldLabel: "Focus Next Month", sourceHint: "AM notes from content areas (refresh, new content, CRO)" },
    ],
  },
  {
    reportId: "qbr_prep",
    reportLabel: "QBS",
    fields: [
      { fieldId: "amThoughts", fieldLabel: "AM's Hypothesis", sourceHint: "AM notes from all committed areas" },
      { fieldId: "priorityChecks", fieldLabel: "Priority Checks", sourceHint: "Accepted findings from all committed areas" },
      { fieldId: "prevQtrAssessment", fieldLabel: "Prev Quarter Assessment", sourceHint: "Findings from content + local areas" },
    ],
  },
];

const TABS = [
  { id: "registry", label: "Report Registry" },
  { id: "workflow-mapping", label: "Workflow → Report" },
  { id: "qbs-qbr", label: "QBS → QBR" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FAMILY_COLORS: Record<string, string> = {
  slideshow: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
  document: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800",
};

const AUDIENCE_COLORS: Record<string, string> = {
  client: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
  internal: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}

export default function AdminConfigPage() {
  const [tab, setTab] = useState<TabId>("registry");
  const allReports = listReportTypes();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-8 py-5">
        <div className="max-w-5xl">
          <Link href="/admin">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3" data-testid="link-admin-back">
              <ChevronLeft className="w-3.5 h-3.5" /> Governance
            </button>
          </Link>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Report Config</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read-only view of the code-driven structures that define how SmartEO processes and presents reports.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-8">
        <div className="flex gap-0 max-w-5xl">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-admin-config-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 max-w-5xl">

        {/* ── Report Registry ─────────────────────────────────────────────────── */}
        {tab === "registry" && (
          <div>
            <p className="text-xs text-muted-foreground mb-4">
              All {allReports.length} report types in canonical lifecycle order. These definitions are code-driven and control which preview component, exporter, and route is used for each report.
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">#</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Name</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">ID</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Family</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Audience</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Exports</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Phase</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Done</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Route</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70">Derives from</th>
                  </tr>
                </thead>
                <tbody>
                  {allReports.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                      data-testid={`row-report-config-${r.id}`}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">{r.order}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{r.displayName}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{r.id}</td>
                      <td className="px-4 py-2.5">
                        <Chip label={r.family} color={FAMILY_COLORS[r.family] ?? ""} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Chip label={r.audience} color={AUDIENCE_COLORS[r.audience] ?? ""} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-[10px]">
                        {r.exportFormats.join(", ")}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.phase}</td>
                      <td className="px-4 py-2.5">
                        {r.implemented ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                        {r.route ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                        {r.derivedFrom ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg bg-muted/30 border border-border px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Source:</span>{" "}
                <code className="font-mono text-[10px]">shared/reportRegistry.ts</code> — editing this file changes all downstream report behavior. WYSIWYG editing of this config is deferred to a later phase.
              </p>
            </div>
          </div>
        )}

        {/* ── Workflow → Report Mapping ────────────────────────────────────────── */}
        {tab === "workflow-mapping" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
              These mappings control which workflow findings and AM inputs are pre-populated into each report type when the AM completes the workflow handoff step.
            </p>
            {WORKFLOW_FIELD_MAPS.map(map => (
              <div key={map.reportId} className="rounded-lg border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{map.reportLabel}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">({map.reportId})</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-background">
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60">Field ID</th>
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60">Label</th>
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60">Workflow Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.fields.map((f, i) => (
                      <tr key={f.fieldId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{f.fieldId}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{f.fieldLabel}</td>
                        <td className="px-4 py-2 text-muted-foreground">{f.sourceHint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Source:</span>{" "}
                <code className="font-mono text-[10px]">client/src/lib/workflowFieldMapping.ts</code> — per-report field arrays define which workflow context fields map to which report inputs.
              </p>
            </div>
          </div>
        )}

        {/* ── QBS → QBR Mapping ───────────────────────────────────────────────── */}
        {tab === "qbs-qbr" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              These mappings define how saved QBS (planning doc) fields are pre-populated into a QBR when the AM imports QBS context. The QBS selection is quarter-aware — it prefers an exact planningQuarter + planningYear match before falling back.
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-foreground">QBS → QBR Field Map</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60">QBR Field ID</th>
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60">QBR Label</th>
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60">QBS Source Description</th>
                  </tr>
                </thead>
                <tbody>
                  {QBS_QBR_FIELD_MAP.map((f, i) => (
                    <tr key={f.fieldId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{f.fieldId}</td>
                      <td className="px-4 py-2 font-medium text-foreground">{f.fieldLabel}</td>
                      <td className="px-4 py-2 text-muted-foreground">{f.sourceHint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-foreground">QBS Selection Priority</span>
              </div>
              <div className="divide-y divide-border">
                {[
                  { tier: "1 — Exact", rule: "planningQuarter = QBR quarter AND planningYear = QBR year", note: "Best match — no warning shown." },
                  { tier: "2 — Year", rule: "planningYear = QBR year, any planningQuarter", note: "Amber note: Nearest match found, exact quarter unavailable." },
                  { tier: "3 — Legacy", rule: "planningQuarter IS NULL (no metadata on record)", note: "Amber note: No period metadata on this QBS record." },
                  { tier: "4 — Fallback", rule: "Any remaining record (most recently created)", note: "Amber note: No quarter match — using most recent QBS." },
                ].map(row => (
                  <div key={row.tier} className="flex gap-0 text-xs">
                    <div className="w-28 px-4 py-2.5 font-medium text-foreground shrink-0">{row.tier}</div>
                    <div className="flex-1 px-4 py-2.5 font-mono text-[10px] text-muted-foreground border-l border-border">{row.rule}</div>
                    <div className="flex-1 px-4 py-2.5 text-muted-foreground border-l border-border">{row.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Source:</span>{" "}
                <code className="font-mono text-[10px]">client/src/lib/qbsQbrMapping.ts</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
