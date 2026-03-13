import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Pencil,
  Plus,
  Check,
  X,
  Info,
} from "lucide-react";
import { listReportTypes } from "@shared/reportRegistry";
import { QBS_QBR_FIELD_MAP } from "@/lib/qbsQbrMapping";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AdminConfigOverride } from "@shared/schema";

// ─── Static representation of workflow field maps ─────────────────────────────

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

// ─── Inline note editor ────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: string | null;
  editKey: string;
  activeEditKey: string | null;
  editValue: string;
  isSaving: boolean;
  onStartEdit: (key: string, current: string) => void;
  onChangeValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function NoteEditor({
  note,
  editKey,
  activeEditKey,
  editValue,
  isSaving,
  onStartEdit,
  onChangeValue,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const isEditing = activeEditKey === editKey;

  if (isEditing) {
    return (
      <div className="space-y-1.5 min-w-[160px]" data-testid={`note-editor-${editKey}`}>
        <textarea
          className="w-full text-[10px] rounded border border-[#1B3A6B]/30 px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40 bg-background"
          rows={3}
          value={editValue}
          onChange={e => onChangeValue(e.target.value)}
          placeholder="Add a note for this item… (leave blank to clear)"
          autoFocus
          data-testid={`textarea-note-${editKey}`}
        />
        <div className="flex gap-1">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-0.5 text-[9px] px-2 py-1 rounded bg-[#1B3A6B] text-white hover:bg-[#1B3A6B]/85 transition-colors disabled:opacity-50"
            data-testid={`button-save-note-${editKey}`}
          >
            <Check className="w-2.5 h-2.5" /> Save
          </button>
          <button
            onClick={onCancel}
            className="text-[9px] px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
            data-testid={`button-cancel-note-${editKey}`}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (note) {
    return (
      <div className="group flex items-start gap-1.5 min-w-[120px]">
        <p className="text-[10px] text-foreground/75 leading-relaxed flex-1 italic">
          {note}
        </p>
        <button
          onClick={() => onStartEdit(editKey, note)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#1B3A6B]"
          title="Edit note"
          data-testid={`button-edit-note-${editKey}`}
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => onStartEdit(editKey, "")}
      className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-[#1B3A6B] transition-colors"
      data-testid={`button-add-note-${editKey}`}
    >
      <Plus className="w-2.5 h-2.5" />
      <span>Add note</span>
    </button>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  const [tab, setTab] = useState<TabId>("registry");
  const allReports = listReportTypes();

  // Inline edit state
  const [activeEditKey, setActiveEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // For registry tab: track which report-type note row is expanded
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  // Fetch all config overrides
  const { data: overrides = [] } = useQuery<AdminConfigOverride[]>({
    queryKey: ["/api/admin/config-overrides"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/config-overrides");
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: { namespace: string; itemKey: string; field: string; value: string }) => {
      const res = await apiRequest("PUT", "/api/admin/config-overrides", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/config-overrides"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/config-overrides/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/config-overrides"] }),
  });

  const isSaving = upsertMutation.isPending || deleteMutation.isPending;

  // Helpers
  function getNote(namespace: string, itemKey: string): string | null {
    return overrides.find(o => o.namespace === namespace && o.itemKey === itemKey && o.field === "note")?.value ?? null;
  }

  function getEntry(namespace: string, itemKey: string): AdminConfigOverride | null {
    return overrides.find(o => o.namespace === namespace && o.itemKey === itemKey && o.field === "note") ?? null;
  }

  function startEdit(key: string, current: string) {
    setActiveEditKey(key);
    setEditValue(current);
  }

  function cancelEdit() {
    setActiveEditKey(null);
    setEditValue("");
  }

  function saveNote(namespace: string, itemKey: string) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      const entry = getEntry(namespace, itemKey);
      if (entry) deleteMutation.mutate(entry.id);
    } else {
      upsertMutation.mutate({ namespace, itemKey, field: "note", value: trimmed });
    }
    setActiveEditKey(null);
    setEditValue("");
  }

  // Shared NoteEditor props factory for reducing prop repetition
  function noteEditorProps(editKey: string, namespace: string, itemKey: string) {
    return {
      note: getNote(namespace, itemKey),
      editKey,
      activeEditKey,
      editValue,
      isSaving,
      onStartEdit: startEdit,
      onChangeValue: setEditValue,
      onSave: () => saveNote(namespace, itemKey),
      onCancel: cancelEdit,
    };
  }

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
            Code-driven structures that define how SmartEO processes reports.{" "}
            <span className="inline-flex items-center gap-0.5 text-[#1B3A6B]">
              <Pencil className="w-2.5 h-2.5" />
              <span>Admin notes are editable</span>
            </span>
            {" "}and surfaced to AMs at runtime. Structural fields (IDs, routes, field names) remain code-only.
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
            <div className="flex items-start gap-3 mb-4">
              <p className="text-xs text-muted-foreground flex-1">
                All {allReports.length} report types in canonical lifecycle order. These definitions are code-driven.
                Hover any row and click <Pencil className="inline w-2.5 h-2.5 mx-0.5" /> to add a note — notes appear in the workflow Report Type step.
              </p>
            </div>

            <div className="rounded-lg border border-border overflow-x-auto">
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
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground/70 whitespace-nowrap">
                      Admin Note <span className="text-[#1B3A6B]/60 font-normal">(editable)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allReports.map((r, i) => {
                    const noteKey = `rt-${r.id}`;
                    const isExpanded = expandedNote === r.id;
                    const existingNote = getNote("reportType", r.id);
                    return (
                      <>
                        <tr
                          key={r.id}
                          className={`border-b border-border ${isExpanded ? "" : "last:border-0"} ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
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
                          <td className="px-4 py-2.5 min-w-[160px]">
                            {activeEditKey === noteKey ? (
                              <NoteEditor {...noteEditorProps(noteKey, "reportType", r.id)} />
                            ) : existingNote ? (
                              <div className="group flex items-start gap-1.5">
                                <p className="text-[10px] text-foreground/75 leading-relaxed italic flex-1 line-clamp-2">
                                  {existingNote}
                                </p>
                                <button
                                  onClick={() => startEdit(noteKey, existingNote)}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#1B3A6B]"
                                  title="Edit note"
                                  data-testid={`button-edit-note-${noteKey}`}
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(noteKey, "")}
                                className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-[#1B3A6B] transition-colors"
                                data-testid={`button-add-note-${noteKey}`}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Add note</span>
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${r.id}-note`} className="border-b border-border bg-[#1B3A6B]/5">
                            <td colSpan={10} className="px-4 py-3">
                              <NoteEditor {...noteEditorProps(noteKey, "reportType", r.id)} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg bg-muted/30 border border-border px-4 py-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Code source:</span>{" "}
                <code className="font-mono text-[10px]">shared/reportRegistry.ts</code> — structural fields (ID, route, family, exports) are code-only. Admin notes persist in the database and fall back to no note if unset.
              </p>
            </div>
          </div>
        )}

        {/* ── Workflow → Report Mapping ────────────────────────────────────────── */}
        {tab === "workflow-mapping" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
              These mappings control which workflow findings and AM inputs are pre-populated into each report type.
              Hover a field row and click <Pencil className="inline w-2.5 h-2.5 mx-0.5" /> to add an admin note on any field — notes are surfaced to AMs as helper guidance in the workflow.
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
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                        Admin Note <span className="text-[#1B3A6B]/60 font-normal">(editable)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.fields.map((f, i) => {
                      const noteKey = `fm-${map.reportId}-${f.fieldId}`;
                      const itemKey = `${map.reportId}:${f.fieldId}`;
                      return (
                        <tr key={f.fieldId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                          data-testid={`row-field-map-${map.reportId}-${f.fieldId}`}
                        >
                          <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{f.fieldId}</td>
                          <td className="px-4 py-2 font-medium text-foreground">{f.fieldLabel}</td>
                          <td className="px-4 py-2 text-muted-foreground">{f.sourceHint}</td>
                          <td className="px-4 py-2 min-w-[160px]">
                            <NoteEditor {...noteEditorProps(noteKey, "fieldMap", itemKey)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Code source:</span>{" "}
                <code className="font-mono text-[10px]">client/src/lib/workflowFieldMapping.ts</code> — field IDs and mapping logic are code-only. Admin notes persist in the database as editable metadata.
              </p>
            </div>
          </div>
        )}

        {/* ── QBS → QBR Mapping ───────────────────────────────────────────────── */}
        {tab === "qbs-qbr" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              These mappings define how saved QBS fields are pre-populated into a QBR.
              Hover a field row and click <Pencil className="inline w-2.5 h-2.5 mx-0.5" /> to add a note — notes appear in the QBS import banner on the QBR page.
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
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                      Admin Note <span className="text-[#1B3A6B]/60 font-normal">(editable)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {QBS_QBR_FIELD_MAP.map((f, i) => {
                    const noteKey = `qbs-${f.fieldId}`;
                    return (
                      <tr key={f.fieldId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                        data-testid={`row-qbs-map-${f.fieldId}`}
                      >
                        <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{f.fieldId}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{f.fieldLabel}</td>
                        <td className="px-4 py-2 text-muted-foreground">{f.sourceHint}</td>
                        <td className="px-4 py-2 min-w-[160px]">
                          <NoteEditor {...noteEditorProps(noteKey, "qbsMap", f.fieldId)} />
                        </td>
                      </tr>
                    );
                  })}
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

            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Code source:</span>{" "}
                <code className="font-mono text-[10px]">client/src/lib/qbsQbrMapping.ts</code> — field IDs, tier logic, and warning messages are code-only. Admin notes persist in the database.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
