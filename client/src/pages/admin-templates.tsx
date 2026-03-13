import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  Lock,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
  Info,
  LayoutTemplate,
  Eye,
  EyeOff,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TEMPLATE_REPORT_TYPES, getSectionDefaults } from "@shared/templateDefaults";
import type { SectionDef } from "@shared/templateDefaults";
import type { ReportTemplateSection } from "@shared/schema";
import { loadProfile } from "@/lib/userProfile";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qKey(reportType: string) {
  return ["/api/admin/template-sections", reportType];
}

// ─── Inline editable text cell ────────────────────────────────────────────────

function InlineTextCell({
  value,
  placeholder,
  onSave,
  maxLength = 120,
  "data-testid": testId,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  maxLength?: number;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Sync draft when value changes from outside (e.g., DB reload), but only when not actively editing
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onBlur={commit}
          maxLength={maxLength}
          className="flex-1 text-xs border border-[#1B3A6B]/30 rounded px-2 py-0.5 bg-[#1B3A6B]/5 text-[#1B3A6B] dark:text-blue-300 dark:bg-[#1B3A6B]/10 focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40 font-medium"
          data-testid={testId}
        />
        <button onClick={commit} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
        <button onClick={() => setEditing(false)} className="p-0.5 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-center gap-1.5 group text-left"
      title="Click to edit"
      data-testid={testId}
    >
      <span className="text-xs font-medium text-[#1B3A6B] dark:text-blue-300">{value || <span className="italic text-muted-foreground">{placeholder}</span>}</span>
      <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── Inline helper copy editor ────────────────────────────────────────────────

function HelperCopyCell({
  value,
  onSave,
  "data-testid": testId,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  // Sync draft when value changes from outside (e.g., DB reload), but only when not actively editing
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  function commit() {
    const trimmed = draft.trim();
    onSave(trimmed || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
          rows={2}
          placeholder="Optional note shown to AMs on this section…"
          className="w-full text-[10px] border border-amber-300 dark:border-amber-700 rounded px-2 py-1 bg-amber-50 dark:bg-amber-950/30 focus:outline-none resize-none"
          data-testid={testId}
        />
        <div className="flex gap-1">
          <button onClick={commit} className="text-[10px] px-2 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-700">Save</button>
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 bg-muted rounded hover:bg-muted/80">Cancel</button>
        </div>
      </div>
    );
  }

  return value ? (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-start gap-1 group text-left max-w-[200px]"
      title="Click to edit helper copy"
    >
      <span className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug line-clamp-2">{value}</span>
      <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
    </button>
  ) : (
    <button
      onClick={() => { setDraft(""); setEditing(true); }}
      className="text-[10px] text-muted-foreground hover:text-foreground italic transition-colors"
    >
      + add note
    </button>
  );
}

// ─── Section row ──────────────────────────────────────────────────────────────

interface SectionRowProps {
  def: SectionDef;
  row: ReportTemplateSection | undefined;
  orderedKeys: string[];
  reportType: string;
  onUpsert: (data: Partial<ReportTemplateSection>) => void;
  onDelete: (id: number) => void;
  onReorder: (sectionKey: string, dir: "up" | "down") => void;
}

function SectionRow({ def, row, orderedKeys, reportType, onUpsert, onDelete, onReorder }: SectionRowProps) {
  const idx = orderedKeys.indexOf(def.sectionKey);
  const isFirst = idx === 0;
  const isLast = idx === orderedKeys.length - 1;
  const hasOverride = !!row;
  const enabled = row?.enabled ?? def.defaultEnabled;
  const label = row?.sectionLabel ?? def.defaultLabel;

  function save(patch: Partial<Omit<ReportTemplateSection, "id" | "reportType" | "sectionKey" | "updatedAt">>) {
    onUpsert({
      ...(row ?? {}),
      reportType,
      sectionKey: def.sectionKey,
      sectionLabel: row?.sectionLabel ?? null,
      enabled: row?.enabled ?? null,
      displayOrder: row?.displayOrder ?? null,
      helperCopy: row?.helperCopy ?? null,
      ...patch,
    });
  }

  return (
    <tr
      className={`border-b border-border last:border-0 transition-colors ${!enabled ? "opacity-50" : ""}`}
      data-testid={`row-section-${def.sectionKey}`}
    >
      {/* Lock icon + sectionKey */}
      <td className="px-3 py-2.5 w-[200px]">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          <code className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">
            {def.sectionKey}
          </code>
        </div>
      </td>

      {/* Section label (editable) */}
      <td className="px-3 py-2.5">
        <InlineTextCell
          value={label}
          placeholder={def.defaultLabel}
          onSave={v => save({ sectionLabel: v || null })}
          maxLength={120}
          data-testid={`input-section-label-${def.sectionKey}`}
        />
        {hasOverride && label !== def.defaultLabel && (
          <span className="text-[9px] text-muted-foreground ml-1">(default: {def.defaultLabel})</span>
        )}
      </td>

      {/* Enabled toggle */}
      <td className="px-3 py-2.5 w-[80px]">
        {def.alwaysEnabled ? (
          <div className="flex items-center gap-1" title="This section is always required">
            <Lock className="w-3 h-3 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground">Always on</span>
          </div>
        ) : (
          <button
            onClick={() => save({ enabled: !enabled })}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
              enabled
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-muted text-muted-foreground border-border"
            }`}
            data-testid={`toggle-section-enabled-${def.sectionKey}`}
          >
            {enabled ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
            {enabled ? "Shown" : "Hidden"}
          </button>
        )}
      </td>

      {/* Order controls */}
      <td className="px-2 py-2.5 w-[64px]">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onReorder(def.sectionKey, "up")}
            disabled={isFirst}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors"
            title="Move up"
            data-testid={`button-move-up-${def.sectionKey}`}
          >
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onReorder(def.sectionKey, "down")}
            disabled={isLast}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors"
            title="Move down"
            data-testid={`button-move-down-${def.sectionKey}`}
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </td>

      {/* Helper copy */}
      <td className="px-3 py-2.5">
        <HelperCopyCell
          value={row?.helperCopy ?? null}
          onSave={v => save({ helperCopy: v })}
          data-testid={`input-section-helper-${def.sectionKey}`}
        />
      </td>

      {/* Reset */}
      <td className="px-3 py-2.5 w-[72px]">
        {hasOverride ? (
          <button
            onClick={() => row?.id && onDelete(row.id)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[#C0392B] transition-colors"
            title="Reset this section to code defaults"
            data-testid={`button-reset-section-${def.sectionKey}`}
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">Default</span>
        )}
      </td>
    </tr>
  );
}

// ─── Section table for one report type ────────────────────────────────────────

function SectionTable({ reportType }: { reportType: string }) {
  const { toast } = useToast();
  const codeDefaults = getSectionDefaults(reportType);

  const { data: rows = [], isLoading } = useQuery<ReportTemplateSection[]>({
    queryKey: qKey(reportType),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/template-sections?reportType=${encodeURIComponent(reportType)}`);
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 30_000,
  });

  // Build ordered list by merging DB rows with code defaults
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() =>
    codeDefaults.map(d => d.sectionKey),
  );

  // Re-sync order when DB rows load (use DB displayOrder if present)
  const resolveOrder = useCallback(() => {
    return codeDefaults
      .map(d => {
        const row = rows.find(r => r.sectionKey === d.sectionKey);
        return { key: d.sectionKey, order: row?.displayOrder ?? d.defaultOrder };
      })
      .sort((a, b) => a.order - b.order)
      .map(x => x.key);
  }, [rows, codeDefaults]);

  // Sync local order when rows change
  const [syncedRows, setSyncedRows] = useState(rows);
  if (rows !== syncedRows) {
    setSyncedRows(rows);
    setOrderedKeys(resolveOrder());
  }

  const upsertMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await apiRequest("PUT", "/api/admin/template-sections", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey(reportType) }),
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/template-sections/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey(reportType) }),
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  function handleUpsert(data: Partial<ReportTemplateSection>) {
    upsertMutation.mutate(data as object);
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(id);
  }

  function handleReorder(sectionKey: string, dir: "up" | "down") {
    const current = [...orderedKeys];
    const idx = current.indexOf(sectionKey);
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === current.length - 1) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    [current[idx], current[swapIdx]] = [current[swapIdx], current[idx]];
    setOrderedKeys(current);

    // Persist both swapped sections' new orders
    const updates = current.map((key, order) => {
      const row = rows.find(r => r.sectionKey === key);
      const def = codeDefaults.find(d => d.sectionKey === key)!;
      // Only save if order differs from default or row already exists
      if (order === def.defaultOrder && !row) return null;
      return { reportType, sectionKey: key, displayOrder: order };
    }).filter(Boolean);

    updates.forEach(u => { if (u) upsertMutation.mutate(u); });
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground px-4 py-6">Loading…</p>;
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Section Key
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Display Label
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Visibility
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Order
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              AM Helper Note
            </th>
            <th className="px-3 py-2 w-[72px]"></th>
          </tr>
        </thead>
        <tbody>
          {orderedKeys.map(key => {
            const def = codeDefaults.find(d => d.sectionKey === key);
            if (!def) return null;
            const row = rows.find(r => r.sectionKey === key);
            return (
              <SectionRow
                key={key}
                def={def}
                row={row}
                orderedKeys={orderedKeys}
                reportType={reportType}
                onUpsert={handleUpsert}
                onDelete={handleDelete}
                onReorder={handleReorder}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTemplatesPage() {
  const profile = loadProfile();
  const [activeTab, setActiveTab] = useState<string>(TEMPLATE_REPORT_TYPES[0].value);

  const activeTabDef = TEMPLATE_REPORT_TYPES.find(t => t.value === activeTab);
  const activeSections = getSectionDefaults(activeTab);

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      {/* Page header */}
      <div className="border-b border-border bg-background px-8 py-5 sticky top-0 z-10">
        <div className="max-w-5xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-to-governance">
                <ChevronLeft className="w-3.5 h-3.5" />
                Governance
              </button>
            </Link>
            <span className="text-muted-foreground/30">/</span>
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-[#1B3A6B] dark:text-blue-300" />
              <h1 className="text-sm font-semibold text-foreground">Template Controls</h1>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground hidden sm:block">{profile.role}</p>
        </div>
      </div>

      <div className="px-8 py-6 max-w-5xl">

        {/* Intro */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Control safe surface-level report structure settings. Section keys are always
            locked (code-defined) to preserve compatibility with saved reports and generators.
            Changes take effect immediately — fallback to code defaults when no override exists.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground">Section Key — locked, code-only</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#1B3A6B]/10 border border-[#1B3A6B]/20" />
            <span className="text-[10px] text-muted-foreground">Display Label — editable (click to edit)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />
            <span className="text-[10px] text-muted-foreground">AM Helper Note — optional context shown to AMs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Reset — removes override, restores code default</span>
          </div>
        </div>

        {/* Report type tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {TEMPLATE_REPORT_TYPES.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.value
                  ? "border-[#1B3A6B] text-[#1B3A6B] dark:border-blue-300 dark:text-blue-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-template-${tab.value}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section count info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{activeTabDef?.label} Report</h2>
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {activeSections.length} section{activeSections.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Info className="w-3 h-3" />
            Changes save immediately
          </div>
        </div>

        {/* Section table */}
        <SectionTable key={activeTab} reportType={activeTab} />

        {/* Safety note */}
        <div className="mt-6 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground/60">Structural safety. </span>
            Section keys, report routing, saved report JSON fields, and server-side generators
            are not affected by these controls. Disabling a section hides it from the AM workflow
            preview but does not delete data from saved reports. Generator logic and DOCX/PPTX
            output use code defaults until full generator integration is built in a later phase.
          </p>
        </div>
      </div>
    </div>
  );
}
