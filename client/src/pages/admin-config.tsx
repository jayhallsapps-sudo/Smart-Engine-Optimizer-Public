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
  Lock,
  FileText,
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

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-5 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Pencil className="w-2.5 h-2.5 text-[#1B3A6B]" />
        <span className="text-foreground/70 font-medium">Editable</span>
        <span className="text-muted-foreground/60">— persists to DB, falls back to code default</span>
      </span>
      <span className="flex items-center gap-1">
        <FileText className="w-2.5 h-2.5 text-amber-500" />
        <span className="text-foreground/70 font-medium">Note-only</span>
        <span className="text-muted-foreground/60">— free annotation, not consumed by logic</span>
      </span>
      <span className="flex items-center gap-1">
        <Lock className="w-2.5 h-2.5 text-muted-foreground/50" />
        <span className="text-foreground/70 font-medium">Code-only</span>
        <span className="text-muted-foreground/60">— structural, never editable in-app</span>
      </span>
    </div>
  );
}

// ─── Column header badge ──────────────────────────────────────────────────────

function ColHeader({ label, type }: { label: string; type: "editable" | "note" | "code" }) {
  const icon =
    type === "editable" ? <Pencil className="w-2 h-2 text-[#1B3A6B]" /> :
    type === "note"     ? <FileText className="w-2 h-2 text-amber-500" /> :
                          <Lock className="w-2 h-2 text-muted-foreground/40" />;
  return (
    <span className="flex items-center gap-1">
      {icon}
      <span>{label}</span>
    </span>
  );
}

// ─── Inline editable cell (for actual config values like description, sourceHint) ───

interface InlineCellProps {
  /** Current displayed value — override if set, code default otherwise */
  displayValue: string;
  /** The code-defined original value (used to show "↩ restore default") */
  codeDefault: string;
  /** Whether an override is currently active */
  hasOverride: boolean;
  /** Unique edit key for this cell (controls which cell is open) */
  editKey: string;
  activeEditKey: string | null;
  editValue: string;
  isSaving: boolean;
  multiline?: boolean;
  placeholder?: string;
  onStartEdit: (key: string, current: string) => void;
  onChangeValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
  testId?: string;
}

function InlineCell({
  displayValue,
  codeDefault,
  hasOverride,
  editKey,
  activeEditKey,
  editValue,
  isSaving,
  multiline = false,
  placeholder,
  onStartEdit,
  onChangeValue,
  onSave,
  onCancel,
  onClear,
  testId,
}: InlineCellProps) {
  const isEditing = activeEditKey === editKey;

  if (isEditing) {
    return (
      <div className="space-y-1.5 min-w-[180px]" data-testid={testId ? `cell-editor-${testId}` : undefined}>
        {multiline ? (
          <textarea
            className="w-full text-[10px] rounded border border-[#1B3A6B]/30 px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40 bg-background leading-relaxed"
            rows={3}
            value={editValue}
            onChange={e => onChangeValue(e.target.value)}
            placeholder={placeholder ?? "Enter value… (blank to restore code default)"}
            autoFocus
            data-testid={testId ? `input-cell-${testId}` : undefined}
          />
        ) : (
          <input
            type="text"
            className="w-full text-[10px] rounded border border-[#1B3A6B]/30 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40 bg-background"
            value={editValue}
            onChange={e => onChangeValue(e.target.value)}
            placeholder={placeholder ?? "Enter value… (blank to restore code default)"}
            autoFocus
            data-testid={testId ? `input-cell-${testId}` : undefined}
          />
        )}
        <div className="text-[9px] text-muted-foreground/60 truncate">
          Default: <span className="italic">{codeDefault.slice(0, 60)}{codeDefault.length > 60 ? "…" : ""}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-0.5 text-[9px] px-2 py-1 rounded bg-[#1B3A6B] text-white hover:bg-[#1B3A6B]/85 transition-colors disabled:opacity-50"
            data-testid={testId ? `btn-save-cell-${testId}` : undefined}
          >
            <Check className="w-2.5 h-2.5" /> Save
          </button>
          {hasOverride && (
            <button
              onClick={onClear}
              className="text-[9px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors dark:bg-red-950/30 dark:text-red-400"
              data-testid={testId ? `btn-clear-cell-${testId}` : undefined}
            >
              ↩ Restore default
            </button>
          )}
          <button
            onClick={onCancel}
            className="text-[9px] px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
            data-testid={testId ? `btn-cancel-cell-${testId}` : undefined}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1.5">
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] leading-relaxed line-clamp-2 ${hasOverride ? "text-[#1B3A6B] font-medium" : "text-foreground/75"}`}>
          {displayValue || <span className="text-muted-foreground/40 italic">—</span>}
        </p>
        {hasOverride && (
          <span className="inline-block text-[9px] text-[#1B3A6B]/60 font-medium">
            ↩ custom override
          </span>
        )}
      </div>
      <button
        onClick={() => onStartEdit(editKey, hasOverride ? displayValue : "")}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#1B3A6B] mt-0.5"
        title={hasOverride ? "Edit override" : "Add override"}
        data-testid={testId ? `btn-edit-cell-${testId}` : undefined}
      >
        <Pencil className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── Note editor (for free-form annotations) ──────────────────────────────────

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
      <div className="space-y-1.5 min-w-[140px]" data-testid={`note-editor-${editKey}`}>
        <textarea
          className="w-full text-[10px] rounded border border-amber-300 px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/40 bg-background"
          rows={3}
          value={editValue}
          onChange={e => onChangeValue(e.target.value)}
          placeholder="Add annotation… (blank to clear)"
          autoFocus
          data-testid={`textarea-note-${editKey}`}
        />
        <div className="flex gap-1">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-0.5 text-[9px] px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
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
        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed flex-1 italic">
          {note}
        </p>
        <button
          onClick={() => onStartEdit(editKey, note)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-amber-600"
          title="Edit annotation"
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
      className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 hover:text-amber-600 transition-colors"
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

  // Shared inline edit state (one edit open at a time across all cells/notes)
  const [activeEditKey, setActiveEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fetch ALL config overrides in one query (the page manages all namespaces)
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getOverride(namespace: string, itemKey: string, field: string): AdminConfigOverride | null {
    return overrides.find(o => o.namespace === namespace && o.itemKey === itemKey && o.field === field) ?? null;
  }

  function getValueDisplay(namespace: string, itemKey: string, field: string, fallback: string): string {
    return getOverride(namespace, itemKey, field)?.value ?? fallback;
  }

  function getNote(namespace: string, itemKey: string): string | null {
    return getOverride(namespace, itemKey, "note")?.value ?? null;
  }

  function startEdit(key: string, current: string) {
    setActiveEditKey(key);
    setEditValue(current);
  }

  function cancelEdit() {
    setActiveEditKey(null);
    setEditValue("");
  }

  function saveValue(namespace: string, itemKey: string, field: string) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      const existing = getOverride(namespace, itemKey, field);
      if (existing) deleteMutation.mutate(existing.id);
    } else {
      upsertMutation.mutate({ namespace, itemKey, field, value: trimmed });
    }
    setActiveEditKey(null);
    setEditValue("");
  }

  function clearValue(namespace: string, itemKey: string, field: string) {
    const existing = getOverride(namespace, itemKey, field);
    if (existing) deleteMutation.mutate(existing.id);
    setActiveEditKey(null);
    setEditValue("");
  }

  // Factory for InlineCell props (reduces repetition)
  function inlineCellProps(
    editKey: string,
    namespace: string,
    itemKey: string,
    field: string,
    codeDefault: string,
    opts?: { multiline?: boolean; placeholder?: string },
  ) {
    const entry = getOverride(namespace, itemKey, field);
    const hasOverride = Boolean(entry);
    const displayValue = entry?.value ?? codeDefault;
    return {
      displayValue,
      codeDefault,
      hasOverride,
      editKey,
      activeEditKey,
      editValue,
      isSaving,
      multiline: opts?.multiline ?? false,
      placeholder: opts?.placeholder,
      onStartEdit: startEdit,
      onChangeValue: setEditValue,
      onSave: () => saveValue(namespace, itemKey, field),
      onCancel: cancelEdit,
      onClear: () => clearValue(namespace, itemKey, field),
      testId: editKey,
    };
  }

  // Factory for NoteEditor props
  function noteEditorProps(noteEditKey: string, namespace: string, itemKey: string) {
    return {
      note: getNote(namespace, itemKey),
      editKey: noteEditKey,
      activeEditKey,
      editValue,
      isSaving,
      onStartEdit: startEdit,
      onChangeValue: setEditValue,
      onSave: () => saveValue(namespace, itemKey, "note"),
      onCancel: cancelEdit,
    };
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-8 py-5">
        <div className="max-w-6xl">
          <Link href="/admin">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3" data-testid="link-admin-back">
              <ChevronLeft className="w-3.5 h-3.5" /> Governance
            </button>
          </Link>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Report Config</h1>
          <p className="mt-0.5 text-xs text-muted-foreground max-w-2xl">
            Code-driven structures defining how SmartEO processes reports. Admins can override selected presentation values — editable overrides persist to the database and fall back to the code default when cleared.
          </p>
          <div className="mt-3">
            <Legend />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-8">
        <div className="flex gap-0 max-w-6xl">
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
      <div className="px-8 py-6 max-w-6xl">

        {/* ── Report Registry ─────────────────────────────────────────────────── */}
        {tab === "registry" && (
          <div>
            <p className="text-xs text-muted-foreground mb-4 max-w-2xl">
              All {allReports.length} report types in canonical lifecycle order. <strong>Description</strong> is editable — overrides appear on the workflow Report Type selection step for AMs. Structural fields (ID, route, family, exports) are code-only.
            </p>

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="Name" type="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="ID" type="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="Family" type="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="Phase" type="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="Done" type="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 w-56">
                      <ColHeader label="Description" type="editable" />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground/60 w-44">
                      <ColHeader label="Admin Note" type="note" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allReports.map((r, i) => {
                    const noteKey = `rt-note-${r.id}`;
                    const descKey = `rt-desc-${r.id}`;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}
                        data-testid={`row-report-config-${r.id}`}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground">{r.order}</td>
                        <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{r.displayName}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{r.id}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Chip label={r.family} color={FAMILY_COLORS[r.family] ?? ""} />
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.phase}</td>
                        <td className="px-3 py-2.5">
                          {r.implemented ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-muted-foreground/30" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 w-56">
                          <InlineCell
                            {...inlineCellProps(descKey, "reportType", r.id, "description", r.description, { multiline: true })}
                          />
                        </td>
                        <td className="px-3 py-2.5 w-44">
                          <NoteEditor {...noteEditorProps(noteKey, "reportType", r.id)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg bg-muted/30 border border-border px-4 py-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/60">Runtime:</span> Description overrides appear on the workflow Report Type step (Step 1). Admin notes appear below the description on the same card. Code source: <code className="font-mono text-[10px]">shared/reportRegistry.ts</code>.
              </p>
            </div>
          </div>
        )}

        {/* ── Workflow → Report Mapping ────────────────────────────────────────── */}
        {tab === "workflow-mapping" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground max-w-2xl">
              These mappings control which workflow findings and AM inputs are pre-populated into each report type. <strong>Workflow Source</strong> is editable — overrides explain to AMs exactly where data is being pulled from. Field IDs and mapping keys are code-only.
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
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                        <ColHeader label="Field ID" type="code" />
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                        <ColHeader label="Label" type="code" />
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60 w-64">
                        <ColHeader label="Workflow Source" type="editable" />
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-foreground/60 w-44">
                        <ColHeader label="Admin Note" type="note" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.fields.map((f, i) => {
                      const itemKey = `${map.reportId}:${f.fieldId}`;
                      const hintKey = `fm-hint-${map.reportId}-${f.fieldId}`;
                      const noteKey = `fm-note-${map.reportId}-${f.fieldId}`;
                      return (
                        <tr
                          key={f.fieldId}
                          className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                          data-testid={`row-field-map-${map.reportId}-${f.fieldId}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{f.fieldId}</td>
                          <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{f.fieldLabel}</td>
                          <td className="px-4 py-2.5 w-64">
                            <InlineCell
                              {...inlineCellProps(hintKey, "fieldMap", itemKey, "sourceHint", f.sourceHint)}
                            />
                          </td>
                          <td className="px-4 py-2.5 w-44">
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
                <code className="font-mono text-[10px]">client/src/lib/workflowFieldMapping.ts</code> — field IDs and mapping logic are code-only. Workflow Source overrides are annotation-only for now; field routing logic remains in code.
              </p>
            </div>
          </div>
        )}

        {/* ── QBS → QBR Mapping ───────────────────────────────────────────────── */}
        {tab === "qbs-qbr" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground max-w-2xl">
              These mappings define how saved QBS fields are pre-populated into a QBR. <strong>QBS Source</strong> is editable — overrides appear in the QBS import banner on the QBR page, guiding AMs on what each field draws from. Field IDs and build logic are code-only.
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-foreground">QBS → QBR Field Map</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="QBR Field ID" type="code" />
                    </th>
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60 whitespace-nowrap">
                      <ColHeader label="QBR Label" type="code" />
                    </th>
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60 w-64">
                      <ColHeader label="QBS Source" type="editable" />
                    </th>
                    <th className="text-left px-4 py-2 font-semibold text-foreground/60 w-44">
                      <ColHeader label="Admin Note" type="note" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {QBS_QBR_FIELD_MAP.map((f, i) => {
                    const hintKey = `qbs-hint-${f.fieldId}`;
                    const noteKey = `qbs-note-${f.fieldId}`;
                    return (
                      <tr
                        key={f.fieldId}
                        className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                        data-testid={`row-qbs-map-${f.fieldId}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{f.fieldId}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{f.fieldLabel}</td>
                        <td className="px-4 py-2.5 w-64">
                          <InlineCell
                            {...inlineCellProps(hintKey, "qbsMap", f.fieldId, "sourceHint", f.sourceHint)}
                          />
                        </td>
                        <td className="px-4 py-2.5 w-44">
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
                <span className="ml-2 text-[10px] text-muted-foreground flex items-center gap-1 inline-flex">
                  <Lock className="w-2.5 h-2.5" /> Code-only — tier logic is structural
                </span>
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
                <span className="font-semibold text-foreground/60">Runtime:</span> QBS Source overrides appear in the QBS import banner on the QBR page, below each field's source description. Code source: <code className="font-mono text-[10px]">client/src/lib/qbsQbrMapping.ts</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
