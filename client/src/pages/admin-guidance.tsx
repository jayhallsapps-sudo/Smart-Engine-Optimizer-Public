import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  X,
  Check,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GUIDANCE_STATUSES, type AdminGuidance } from "@shared/schema";
import { listReportTypes } from "@shared/reportRegistry";

// ─── Constants ─────────────────────────────────────────────────────────────────

const WORKFLOW_AREAS = [
  { value: "content", label: "Content" },
  { value: "technical", label: "Technical" },
  { value: "local", label: "Local / GBP" },
  { value: "discovery", label: "Discoverability" },
];

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
  draft: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  archived: "bg-muted text-muted-foreground border-border",
};

// ─── Form schema ───────────────────────────────────────────────────────────────

const guidanceFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().default(""),
  reportType: z.string().optional(),
  workflowArea: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
});

type GuidanceFormValues = z.infer<typeof guidanceFormSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AdminGuidancePage() {
  const { toast } = useToast();
  const allReportDefs = listReportTypes();

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterReportType, setFilterReportType] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: items = [], isLoading } = useQuery<AdminGuidance[]>({
    queryKey: ["/api/admin/guidance"],
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: GuidanceFormValues) =>
      apiRequest("POST", "/api/admin/guidance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guidance"] });
      setIsCreating(false);
      form.reset();
      toast({ title: "Guidance entry created" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: GuidanceFormValues }) =>
      apiRequest("PATCH", `/api/admin/guidance/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guidance"] });
      setSelectedId(null);
      form.reset();
      toast({ title: "Guidance entry updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/guidance/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guidance"] });
      setDeleteConfirmId(null);
      if (selectedId === deleteConfirmId) setSelectedId(null);
      toast({ title: "Guidance entry deleted" });
    },
  });

  // ── Form ──────────────────────────────────────────────────────────────────

  const form = useForm<GuidanceFormValues>({
    resolver: zodResolver(guidanceFormSchema),
    defaultValues: { title: "", body: "", reportType: "", workflowArea: "", status: "active" },
  });

  function openEdit(item: AdminGuidance) {
    setIsCreating(false);
    setSelectedId(item.id);
    form.reset({
      title: item.title,
      body: item.body ?? "",
      reportType: item.reportType ?? "",
      workflowArea: item.workflowArea ?? "",
      status: (item.status as any) ?? "active",
    });
  }

  function openCreate() {
    setSelectedId(null);
    setIsCreating(true);
    form.reset({ title: "", body: "", reportType: "", workflowArea: "", status: "active" });
  }

  function closeForm() {
    setIsCreating(false);
    setSelectedId(null);
    form.reset();
  }

  function onSubmit(values: GuidanceFormValues) {
    const clean = {
      ...values,
      reportType: values.reportType || undefined,
      workflowArea: values.workflowArea || undefined,
    };
    if (isCreating) {
      createMut.mutate(clean as GuidanceFormValues);
    } else if (selectedId !== null) {
      updateMut.mutate({ id: selectedId, data: clean as GuidanceFormValues });
    }
  }

  // ── Filter items ──────────────────────────────────────────────────────────

  const filtered = items.filter(item => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (filterReportType !== "all" && item.reportType !== filterReportType) return false;
    return true;
  });

  const isFormOpen = isCreating || selectedId !== null;
  const isSaving = createMut.isPending || updateMut.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background px-8 py-5 shrink-0">
        <Link href="/admin">
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3" data-testid="link-admin-back">
            <ChevronLeft className="w-3.5 h-3.5" /> Governance
          </button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Guidance Library</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Internal guidance notes for AMs — tagged by report type and workflow area.
            </p>
          </div>
          <Button
            size="sm"
            onClick={openCreate}
            data-testid="button-create-guidance"
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Body — two-panel layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: List ────────────────────────────────────────────────────── */}
        <div className={`flex flex-col border-r border-border bg-background overflow-hidden transition-all ${isFormOpen ? "w-1/2" : "w-full"}`}>

          {/* Filter bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 shrink-0">
            <span className="text-xs text-muted-foreground shrink-0">Filter:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-xs rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none"
              data-testid="select-filter-status"
            >
              <option value="all">All statuses</option>
              {GUIDANCE_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={filterReportType}
              onChange={e => setFilterReportType(e.target.value)}
              className="text-xs rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none"
              data-testid="select-filter-report-type"
            >
              <option value="all">All report types</option>
              {allReportDefs.map(r => (
                <option key={r.id} value={r.id}>{r.displayName}</option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {/* Guidance list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
                <BookOpen className="w-6 h-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {items.length === 0
                    ? "No guidance entries yet. Create the first one."
                    : "No entries match the current filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(item => {
                  const reportDef = allReportDefs.find(r => r.id === item.reportType);
                  const isSelected = selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border px-4 py-3 transition-all ${
                        isSelected
                          ? "border-foreground/30 bg-muted/40"
                          : "border-border bg-card hover:border-foreground/20 hover:bg-muted/20"
                      }`}
                      data-testid={`card-guidance-${item.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Chip
                              label={STATUS_LABELS[item.status] ?? item.status}
                              color={STATUS_COLORS[item.status] ?? ""}
                            />
                            {reportDef && (
                              <Chip
                                label={reportDef.displayName}
                                color="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800"
                              />
                            )}
                            {item.workflowArea && (
                              <Chip
                                label={WORKFLOW_AREAS.find(a => a.value === item.workflowArea)?.label ?? item.workflowArea}
                                color="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800"
                              />
                            )}
                          </div>
                          {item.body && (
                            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                              {item.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            Updated {formatDate(item.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit"
                            data-testid={`button-edit-guidance-${item.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirmId === item.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteMut.mutate(item.id)}
                                className="p-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                title="Confirm delete"
                                data-testid={`button-confirm-delete-guidance-${item.id}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(item.id)}
                              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                              title="Delete"
                              data-testid={`button-delete-guidance-${item.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Create/Edit Form ──────────────────────────────────────── */}
        {isFormOpen && (
          <div className="w-1/2 flex flex-col bg-background overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0">
              <h2 className="text-sm font-semibold text-foreground">
                {isCreating ? "New Guidance Entry" : "Edit Entry"}
              </h2>
              <button
                onClick={closeForm}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                data-testid="button-close-guidance-form"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
            >
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="guidance-title">Title</Label>
                <Input
                  id="guidance-title"
                  placeholder="e.g. Monthly — Interpreting traffic anomalies"
                  {...form.register("title")}
                  data-testid="input-guidance-title"
                  className="text-sm"
                />
                {form.formState.errors.title && (
                  <p className="text-[11px] text-red-500">{form.formState.errors.title.message}</p>
                )}
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="guidance-body">Guidance</Label>
                <Textarea
                  id="guidance-body"
                  placeholder="Write the guidance, instructions, or context notes here…"
                  rows={8}
                  {...form.register("body")}
                  data-testid="input-guidance-body"
                  className="text-sm resize-none"
                />
              </div>

              {/* Tags row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Report type */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Report Type</Label>
                  <Select
                    value={form.watch("reportType") || "__none"}
                    onValueChange={v => form.setValue("reportType", v === "__none" ? "" : v)}
                  >
                    <SelectTrigger className="text-xs" data-testid="select-guidance-report-type">
                      <SelectValue placeholder="All report types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">All report types</SelectItem>
                      {allReportDefs.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Workflow area */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Workflow Area</Label>
                  <Select
                    value={form.watch("workflowArea") || "__none"}
                    onValueChange={v => form.setValue("workflowArea", v === "__none" ? "" : v)}
                  >
                    <SelectTrigger className="text-xs" data-testid="select-guidance-workflow-area">
                      <SelectValue placeholder="All areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">All areas</SelectItem>
                      {WORKFLOW_AREAS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={v => form.setValue("status", v as any)}
                >
                  <SelectTrigger className="text-xs" data-testid="select-guidance-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUIDANCE_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  data-testid="button-save-guidance"
                  className="flex-1"
                >
                  {isSaving ? "Saving…" : isCreating ? "Create Entry" : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeForm}
                  data-testid="button-cancel-guidance"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
