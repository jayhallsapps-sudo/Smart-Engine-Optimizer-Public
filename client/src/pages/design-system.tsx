import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ThemePage from "./theme";
import {
  TEMPLATES,
  TemplateEditor,
  DefaultSlideCount,
  type TemplateDef,
} from "./templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Palette,
  LayoutTemplate,
  Layers,
  Import,
  Puzzle,
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  Archive,
  Info,
  Check,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SLIDE_TYPES, DEFAULT_TEMPLATE_SLIDES, type SlideEntry } from "@shared/schema";
import type { ImportedSlide, ReusableBlock } from "@shared/schema";

// ─── Slide type color map for thumbnails ─────────────────────────────────────

const SLIDE_THUMB_COLORS: Record<string, string> = {
  title: "#C0392B",
  "section-divider": "#C0392B",
  "kpi-summary": "#1B3A6B",
  "bar-chart": "#2E86AB",
  "line-chart": "#2E86AB",
  "pie-chart": "#2E86AB",
  "data-table": "#0D7377",
  bullets: "#7C3AED",
  "two-column": "#7C3AED",
  callout: "#E67E22",
  "image-slide": "#64748B",
  "closing-summary": "#C0392B",
  default: "#94A3B8",
};

function getSlideColor(typeId: string): string {
  return SLIDE_THUMB_COLORS[typeId] ?? SLIDE_THUMB_COLORS.default;
}

// ─── Mini slide thumbnail (colored block) ─────────────────────────────────────

function SlideMiniThumb({ typeId, label }: { typeId: string; label: string }) {
  const color = getSlideColor(typeId);
  return (
    <div
      className="w-5 shrink-0 rounded-sm"
      style={{ backgroundColor: color, height: "28px", opacity: 0.9 }}
      title={label}
    />
  );
}

// ─── Template visual strip (mini slides in order) ─────────────────────────────

function TemplateSlideStrip({ templateId }: { templateId: string }) {
  const { data } = useQuery<{ slides: SlideEntry[] }>({
    queryKey: [`/api/template-structures/${templateId}`],
  });
  const slides = data?.slides ?? DEFAULT_TEMPLATE_SLIDES[templateId] ?? [];

  return (
    <div className="flex gap-0.5 h-7 rounded overflow-hidden bg-muted/40 px-1.5 py-1 items-stretch">
      {slides.length === 0 ? (
        <div className="flex items-center text-[10px] text-muted-foreground px-2">No slides configured</div>
      ) : (
        slides.slice(0, 20).map((slide, i) => (
          <SlideMiniThumb key={slide.id ?? i} typeId={slide.typeId} label={slide.label} />
        ))
      )}
      {slides.length > 20 && (
        <div className="flex items-center text-[9px] text-muted-foreground pl-1">+{slides.length - 20}</div>
      )}
    </div>
  );
}

// ─── Slide type visual thumbnail ──────────────────────────────────────────────

function SlideVisualThumb({ typeId }: { typeId: string }) {
  const color = getSlideColor(typeId);

  const renderInterior = () => {
    switch (typeId) {
      case "title":
        return (
          <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
            <div className="w-10 h-1.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.9)" }} />
            <div className="w-7 h-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.6)" }} />
          </div>
        );
      case "section-divider":
        return (
          <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
            <div className="w-8 h-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.8)" }} />
            <div className="w-6 h-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.5)" }} />
          </div>
        );
      case "kpi-summary":
        return (
          <div className="flex flex-col gap-0.5 px-1.5 pt-1.5 w-full">
            <div className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 rounded bg-white/20 h-3" />
              ))}
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 rounded bg-white/10 h-1.5" />
              ))}
            </div>
          </div>
        );
      case "bar-chart":
        return (
          <div className="flex items-end gap-0.5 px-1.5 pb-1.5 w-full h-full justify-center">
            {[50, 80, 60, 90, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: "rgba(255,255,255,0.7)" }} />
            ))}
          </div>
        );
      case "line-chart":
        return (
          <div className="flex items-center justify-center w-full h-full px-1">
            <svg width="100%" height="70%" viewBox="0 0 40 20" preserveAspectRatio="none">
              <polyline points="0,15 10,8 20,12 30,4 40,9" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            </svg>
          </div>
        );
      case "data-table":
        return (
          <div className="flex flex-col gap-0.5 px-1.5 pt-1.5 w-full">
            <div className="h-1.5 rounded bg-white/30" />
            {[1, 2, 3].map(i => (
              <div key={i} className="h-1 rounded bg-white/15" />
            ))}
          </div>
        );
      case "bullets":
        return (
          <div className="flex flex-col gap-0.5 px-1.5 pt-1.5 w-full">
            <div className="w-7 h-1 rounded bg-white/30" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-white/60" />
                <div className="flex-1 h-0.5 rounded bg-white/20" style={{ maxWidth: `${70 - i * 10}%` }} />
              </div>
            ))}
          </div>
        );
      case "two-column":
        return (
          <div className="flex gap-0.5 px-1.5 pt-1 w-full h-full pb-1">
            <div className="flex-1 rounded bg-white/20" />
            <div className="flex-1 rounded bg-white/20" />
          </div>
        );
      case "callout":
        return (
          <div className="flex items-center justify-center px-1.5 py-1 w-full h-full">
            <div className="w-full h-full rounded border border-white/40 flex items-center justify-center">
              <div className="w-8 h-0.5 rounded bg-white/50" />
            </div>
          </div>
        );
      case "closing-summary":
        return (
          <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
            <div className="w-8 h-1 rounded bg-white/70" />
            <div className="w-5 h-0.5 rounded bg-white/40" />
            <div className="w-3 h-0.5 rounded bg-white/30" />
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <div className="w-8 h-0.5 rounded bg-white/40" />
          </div>
        );
    }
  };

  return (
    <div
      className="w-full rounded-md overflow-hidden flex items-stretch"
      style={{ backgroundColor: color, aspectRatio: "16/9" }}
    >
      {renderInterior()}
    </div>
  );
}

// ─── Report Template Card (enhanced with slide strip) ─────────────────────────

function TemplateCard({ tpl, onEdit }: { tpl: TemplateDef; onEdit: () => void }) {
  return (
    <div
      className="group flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-md transition-all hover:border-primary/30"
      data-testid={`card-template-${tpl.id}`}
    >
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: tpl.accentColor }} />

      {/* Slide thumbnail strip */}
      <div className="px-4 pt-4 pb-2">
        <TemplateSlideStrip templateId={tpl.id} />
      </div>

      <div className="flex flex-col flex-1 px-4 pb-4 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
              {tpl.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-snug">{tpl.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${tpl.badgeColor}`}>
                  {tpl.badge}
                </span>
                <DefaultSlideCount templateId={tpl.id} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{tpl.description}</p>

        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={onEdit}
          data-testid={`button-edit-template-${tpl.id}`}
        >
          <LayoutTemplate className="w-3 h-3" />
          Edit Structure
        </Button>
      </div>
    </div>
  );
}

// ─── Report Templates panel ───────────────────────────────────────────────────

function ReportTemplatesPanel() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDef | null>(null);

  if (selectedTemplate) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TemplateEditor tpl={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 shrink-0 border-b">
        <h2 className="text-sm font-semibold text-foreground">Report Templates</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage slide and section structures for each report type. The slide strip shows the current order.
        </p>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
          {TEMPLATES.map(tpl => (
            <TemplateCard key={tpl.id} tpl={tpl} onEdit={() => setSelectedTemplate(tpl)} />
          ))}
        </div>

        <div className="mt-8 max-w-4xl rounded-xl border border-border bg-muted/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-1">How Templates work</p>
              <p>Templates define the <strong>structure</strong> of each report — which slides or sections appear and in what order. Styling (colors, fonts, backgrounds) is controlled by the active <strong>Theme</strong>. Content is always generated fresh from live data.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 max-w-4xl">
          <h3 className="text-sm font-semibold text-foreground mb-1">Slide / Section Type Library</h3>
          <p className="text-xs text-muted-foreground mb-4">Visual preview of all available slide types, with layout thumbnails.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {SLIDE_TYPES.map(type => (
              <div key={type.id} className="flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-sm transition-all">
                <div className="p-3 pb-2">
                  <SlideVisualThumb typeId={type.id} />
                </div>
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs">{type.icon}</span>
                    <span className="text-[11px] font-semibold text-foreground">{type.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{type.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Imported Slide status label + color ──────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  imported: { label: "Imported", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_review: { label: "In Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  converted_to_template: { label: "→ Template", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  converted_to_block: { label: "→ Block", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground" },
};

// ─── Imported Slides panel ────────────────────────────────────────────────────

function ImportedSlidesPanel() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    sourceDeck: "",
    sourceSlideNumber: "",
    reportTypeGuess: "",
    status: "imported" as const,
    notes: "",
  });

  const { data: slides = [], isLoading } = useQuery<ImportedSlide[]>({
    queryKey: ["/api/imported-slides"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/imported-slides", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imported-slides"] });
      setCreateOpen(false);
      setForm({ title: "", sourceDeck: "", sourceSlideNumber: "", reportTypeGuess: "", status: "imported", notes: "" });
      toast({ title: "Slide added to staging" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/imported-slides/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imported-slides"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/imported-slides/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imported-slides"] });
      setDeleteId(null);
      toast({ title: "Slide removed" });
    },
  });

  const filteredSlides = slides.filter(s => statusFilter === "all" || s.status === statusFilter);

  const statusCounts: Record<string, number> = {};
  for (const s of slides) statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Panel header */}
      <div className="px-6 py-5 shrink-0 border-b flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Imported Slides</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Staging area for slides imported from decks. Review, annotate, and convert to templates or reusable blocks.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-[#C0392B] hover:bg-[#922B21] text-white shrink-0" onClick={() => setCreateOpen(true)} data-testid="button-add-imported-slide">
          <Plus className="w-3 h-3" />
          Add Slide
        </Button>
      </div>

      {/* Status filter strip */}
      <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0 flex-wrap bg-muted/20">
        <button
          className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${statusFilter === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          onClick={() => setStatusFilter("all")}
          data-testid="filter-all"
        >
          All ({slides.length})
        </button>
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = statusCounts[key] ?? 0;
          return (
            <button
              key={key}
              className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${statusFilter === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              onClick={() => setStatusFilter(key)}
              data-testid={`filter-${key}`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Slide list */}
      <div className="flex-1 px-6 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-xs">Loading...</div>
        ) : filteredSlides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Import className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No imported slides yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {statusFilter === "all"
                ? "Add slides from existing decks to review and convert them into reusable templates or blocks."
                : `No slides with status "${STATUS_META[statusFilter]?.label ?? statusFilter}".`}
            </p>
            {statusFilter === "all" && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 mt-1" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3 h-3" />
                Add Your First Slide
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {filteredSlides.map(slide => {
              const meta = STATUS_META[slide.status] ?? STATUS_META.imported;
              return (
                <div
                  key={slide.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:border-border/80 transition-colors"
                  data-testid={`card-imported-slide-${slide.id}`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate">{slide.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {slide.sourceDeck && <span>from "{slide.sourceDeck}"</span>}
                      {slide.sourceSlideNumber && <span>· slide #{slide.sourceSlideNumber}</span>}
                      {slide.reportTypeGuess && <span>· {slide.reportTypeGuess}</span>}
                      <span>· {new Date(slide.importedAt).toLocaleDateString()}</span>
                    </div>
                    {slide.notes && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 italic">"{slide.notes}"</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select
                      value={slide.status}
                      onValueChange={(v) => updateStatusMutation.mutate({ id: slide.id, status: v })}
                    >
                      <SelectTrigger className="h-6 text-[10px] w-36" data-testid={`select-status-${slide.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_META).map(([key, m]) => (
                          <SelectItem key={key} value={key} className="text-xs">{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 transition-colors"
                      onClick={() => setDeleteId(slide.id)}
                      title="Delete"
                      data-testid={`button-delete-slide-${slide.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Imported Slide</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Slide Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Q1 Performance KPIs"
                className="h-8 text-xs"
                data-testid="input-slide-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Source Deck</Label>
                <Input
                  value={form.sourceDeck}
                  onChange={e => setForm(f => ({ ...f, sourceDeck: e.target.value }))}
                  placeholder="e.g., Client QBR Apr 2025"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Slide #</Label>
                <Input
                  type="number"
                  value={form.sourceSlideNumber}
                  onChange={e => setForm(f => ({ ...f, sourceSlideNumber: e.target.value }))}
                  placeholder="e.g., 7"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Report Type Guess</Label>
              <Input
                value={form.reportTypeGuess}
                onChange={e => setForm(f => ({ ...f, reportTypeGuess: e.target.value }))}
                placeholder="e.g., QBR, Monthly, Bi-Weekly"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this slide..."
                className="text-xs h-16 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-[#C0392B] hover:bg-[#922B21] text-white"
              onClick={() => {
                if (!form.title.trim()) return;
                createMutation.mutate({
                  title: form.title.trim(),
                  sourceDeck: form.sourceDeck || undefined,
                  sourceSlideNumber: form.sourceSlideNumber ? Number(form.sourceSlideNumber) : undefined,
                  reportTypeGuess: form.reportTypeGuess || undefined,
                  status: form.status,
                  notes: form.notes || undefined,
                });
              }}
              disabled={!form.title.trim() || createMutation.isPending}
              data-testid="button-create-slide-confirm"
            >
              Add Slide
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove slide?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the slide from the staging library.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Category label map for reusable blocks ───────────────────────────────────

const BLOCK_CATEGORY_META: Record<string, { label: string; color: string }> = {
  intro: { label: "Intro", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  performance: { label: "Performance", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  content: { label: "Content", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  strategy: { label: "Strategy", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  closing: { label: "Closing", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  layout: { label: "Layout", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  data: { label: "Data", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
};

// ─── Reusable Blocks panel ────────────────────────────────────────────────────

function ReusableBlocksPanel() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editBlock, setEditBlock] = useState<ReusableBlock | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [form, setForm] = useState({ name: "", description: "", category: "layout" as const });

  const { data: blocks = [], isLoading } = useQuery<ReusableBlock[]>({
    queryKey: ["/api/reusable-blocks"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/reusable-blocks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reusable-blocks"] });
      setCreateOpen(false);
      setForm({ name: "", description: "", category: "layout" });
      toast({ title: "Block created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/reusable-blocks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reusable-blocks"] });
      setEditBlock(null);
      toast({ title: "Block updated" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("PATCH", `/api/reusable-blocks/${id}`, { isArchived: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reusable-blocks"] });
      toast({ title: "Block archived" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/reusable-blocks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reusable-blocks"] });
      setDeleteId(null);
      toast({ title: "Block deleted" });
    },
  });

  const filteredBlocks = blocks.filter(b =>
    categoryFilter === "all" || b.category === categoryFilter
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Panel header */}
      <div className="px-6 py-5 shrink-0 border-b flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Reusable Blocks</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            A library of named slide components that can be dropped into any report template.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-[#C0392B] hover:bg-[#922B21] text-white shrink-0" onClick={() => setCreateOpen(true)} data-testid="button-add-block">
          <Plus className="w-3 h-3" />
          New Block
        </Button>
      </div>

      {/* Category filter */}
      <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0 flex-wrap bg-muted/20">
        <button
          className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${categoryFilter === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          onClick={() => setCategoryFilter("all")}
        >
          All ({blocks.length})
        </button>
        {Object.entries(BLOCK_CATEGORY_META).map(([key, meta]) => {
          const count = blocks.filter(b => b.category === key).length;
          return (
            <button
              key={key}
              className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${categoryFilter === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              onClick={() => setCategoryFilter(key)}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Block grid */}
      <div className="flex-1 px-6 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-xs">Loading...</div>
        ) : filteredBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Puzzle className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No blocks yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {categoryFilter === "all"
                ? "Create reusable slide components that can be inserted into any report template."
                : `No blocks in the "${BLOCK_CATEGORY_META[categoryFilter]?.label}" category.`}
            </p>
            {categoryFilter === "all" && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 mt-1" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3 h-3" />
                Create First Block
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl">
            {filteredBlocks.map(block => {
              const catMeta = BLOCK_CATEGORY_META[block.category] ?? BLOCK_CATEGORY_META.layout;
              return (
                <div
                  key={block.id}
                  className="flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-sm transition-all group"
                  data-testid={`card-block-${block.id}`}
                >
                  {/* Visual placeholder */}
                  <div className="h-16 bg-muted/40 flex items-center justify-center border-b">
                    <Puzzle className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{block.name}</p>
                        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded mt-0.5 font-medium ${catMeta.color}`}>
                          {catMeta.label}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100" data-testid={`button-block-menu-${block.id}`}>
                            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setEditBlock(block)}>
                            <Pencil className="w-3 h-3 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => archiveMutation.mutate(block.id)}>
                            <Archive className="w-3 h-3 mr-2" /> Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(block.id)}>
                            <Trash2 className="w-3 h-3 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {block.description && (
                      <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{block.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">New Reusable Block</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Block Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Performance Summary"
                className="h-8 text-xs"
                data-testid="input-block-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-block-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BLOCK_CATEGORY_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-xs">{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What this block contains..."
                className="text-xs h-16 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-[#C0392B] hover:bg-[#922B21] text-white"
              onClick={() => {
                if (!form.name.trim()) return;
                createMutation.mutate({ name: form.name.trim(), category: form.category, description: form.description || undefined });
              }}
              disabled={!form.name.trim() || createMutation.isPending}
              data-testid="button-create-block-confirm"
            >
              Create Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editBlock && (
        <Dialog open={!!editBlock} onOpenChange={() => setEditBlock(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Edit Block</DialogTitle>
            </DialogHeader>
            <EditBlockForm
              block={editBlock}
              onSave={(data) => updateMutation.mutate({ id: editBlock.id, data })}
              onCancel={() => setEditBlock(null)}
              isPending={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete block?</AlertDialogTitle>
            <AlertDialogDescription>This block will be permanently removed from the library.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditBlockForm({
  block,
  onSave,
  onCancel,
  isPending,
}: {
  block: ReusableBlock;
  onSave: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: block.name,
    description: block.description ?? "",
    category: block.category,
  });
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Block Name</Label>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Category</Label>
        <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(BLOCK_CATEGORY_META).map(([key, meta]) => (
              <SelectItem key={key} value={key} className="text-xs">{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-xs h-16 resize-none" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-[#C0392B] hover:bg-[#922B21] text-white"
          onClick={() => onSave({ name: form.name.trim(), category: form.category, description: form.description || undefined })}
          disabled={!form.name.trim() || isPending}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─── Templates Section (three sub-tabs) ──────────────────────────────────────

type TemplateSubTab = "report-templates" | "reusable-blocks" | "imported-slides";

function TemplatesSection() {
  const [subTab, setSubTab] = useState<TemplateSubTab>("report-templates");

  const SUB_TABS: { id: TemplateSubTab; label: string; icon: typeof Layers }[] = [
    { id: "report-templates", label: "Report Templates", icon: LayoutTemplate },
    { id: "reusable-blocks", label: "Reusable Blocks", icon: Puzzle },
    { id: "imported-slides", label: "Imported Slides", icon: Import },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="border-b bg-background px-5 flex items-center gap-0.5 shrink-0">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 text-xs px-3 py-2.5 border-b-2 transition-colors ${
                subTab === tab.id
                  ? "border-[#C0392B] text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              onClick={() => setSubTab(tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === "report-templates" && <ReportTemplatesPanel />}
        {subTab === "reusable-blocks" && <ReusableBlocksPanel />}
        {subTab === "imported-slides" && <ImportedSlidesPanel />}
      </div>
    </div>
  );
}

// ─── Design System Page ───────────────────────────────────────────────────────

type MainTab = "theme" | "templates";

export default function DesignSystemPage() {
  const [mainTab, setMainTab] = useState<MainTab>("theme");

  const MAIN_TABS: { id: MainTab; label: string; icon: typeof Palette; description: string }[] = [
    { id: "theme", label: "Theme", icon: Palette, description: "Colors, fonts, backgrounds & live preview" },
    { id: "templates", label: "Templates", icon: LayoutTemplate, description: "Report structures, blocks & imported slides" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background" data-testid="page-design-system">
      {/* Top header bar */}
      <div className="border-b bg-background shrink-0">
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: "#C0392B" }}>
            <Layers className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground leading-none">Design System</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Webserv SmartEO · Unified report design controls</p>
          </div>
        </div>
        {/* Main tab bar */}
        <div className="flex items-end px-5 gap-0.5">
          {MAIN_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                  mainTab === tab.id
                    ? "border-[#C0392B] text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
                onClick={() => setMainTab(tab.id)}
                data-testid={`tab-main-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mainTab === "theme" && <ThemePage />}
        {mainTab === "templates" && <TemplatesSection />}
      </div>
    </div>
  );
}
