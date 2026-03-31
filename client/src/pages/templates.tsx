import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  LayoutTemplate,
  FileText,
  Presentation,
  Map,
  ChevronRight,
  Plus,
  GripVertical,
  Trash2,
  Copy,
  ChevronDown,
  Save,
  RotateCcw,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  SLIDE_TYPES,
  DEFAULT_TEMPLATE_SLIDES,
  type SlideTypeDef,
  type SlideEntry,
} from "@shared/schema";

// ─── Template definitions ─────────────────────────────────────────────────────

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  accentColor: string;
  format: "PPTX" | "DOCX";
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "quarterly-content-roadmap",
    name: "Quarterly Content Roadmap",
    description: "Quarter-based planning deck with per-month strategy and Airtable deliverables. Includes title, divider, strategy, and production slides.",
    badge: "PPTX",
    badgeColor: "bg-[#C0392B]/10 text-[#C0392B]",
    icon: <Map className="w-5 h-5 text-[#C0392B]" />,
    accentColor: "#C0392B",
    format: "PPTX",
  },
  {
    id: "biweekly-docx",
    name: "Bi-Weekly SEO Report",
    description: "Client-facing DOCX report covering performance pulse, work log, and partnership alignment.",
    badge: "DOCX",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <FileText className="w-5 h-5 text-blue-600" />,
    accentColor: "#1B3A6B",
    format: "DOCX",
  },
  {
    id: "monthly-pptx",
    name: "Monthly SEO Report",
    description: "Monthly PPTX deck with performance metrics, keyword rankings, content highlights, and SEO health overview.",
    badge: "PPTX",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    icon: <Presentation className="w-5 h-5 text-violet-600" />,
    accentColor: "#7C3AED",
    format: "PPTX",
  },
  {
    id: "qbr-pptx",
    name: "Quarterly Business Review",
    description: "Comprehensive QBR PPTX deck covering quarter performance, strategy wins, data analysis, and Q+1 planning.",
    badge: "PPTX",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <LayoutTemplate className="w-5 h-5 text-emerald-600" />,
    accentColor: "#059669",
    format: "PPTX",
  },
];

// ─── Slide type category colors ───────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  structure: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  data: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  content: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  layout: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

// ─── Slide type mini preview ──────────────────────────────────────────────────

export function SlideTypeCard({ type, compact = false, onAdd }: { type: SlideTypeDef; compact?: boolean; onAdd?: () => void }) {
  return (
    <div
      className={`relative group flex flex-col rounded-lg border bg-card transition-all hover:border-primary/40 hover:shadow-sm ${compact ? "p-2.5" : "p-3"}`}
      data-testid={`card-slide-type-${type.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none shrink-0">{type.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-foreground leading-snug">{type.label}</span>
            <span className={`text-[9px] px-1 py-0.5 rounded font-medium capitalize ${CATEGORY_COLORS[type.category]}`}>{type.category}</span>
          </div>
          {!compact && <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{type.description}</p>}
          {!compact && type.usedIn.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {type.usedIn.map(id => {
                const tpl = TEMPLATES.find(t => t.id === id);
                return tpl ? (
                  <span key={id} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{tpl.name.split(" ").slice(0, 2).join(" ")}</span>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
      {onAdd && (
        <button
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
          onClick={onAdd}
          title={`Add ${type.label}`}
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Slide entry row (in structure editor) ────────────────────────────────────

function SlideRow({
  slide,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onRename,
}: {
  slide: SlideEntry;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRename: (label: string) => void;
}) {
  const type = SLIDE_TYPES.find(t => t.id === slide.typeId);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(slide.label);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:border-border/80 group"
      data-testid={`row-slide-${slide.id}`}
    >
      <span className="text-muted-foreground/40 cursor-grab shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-right">{index + 1}</span>
      <span className="text-sm shrink-0">{type?.icon ?? "📄"}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={() => { onRename(label); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") { onRename(label); setEditing(false); } if (e.key === "Escape") { setLabel(slide.label); setEditing(false); } }}
            className="h-5 text-[11px] px-1"
            autoFocus
          />
        ) : (
          <button
            className="text-[11px] font-medium text-foreground hover:text-primary text-left w-full truncate"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {slide.label}
          </button>
        )}
        <span className="text-[9px] text-muted-foreground">{type?.label}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          data-testid={`button-move-up-${slide.id}`}
        >
          <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
        </button>
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
          data-testid={`button-move-down-${slide.id}`}
        >
          <ChevronRight className="w-3 h-3 rotate-90" />
        </button>
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          onClick={onDuplicate}
          title="Duplicate"
          data-testid={`button-dupe-${slide.id}`}
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600"
          onClick={onRemove}
          title="Remove"
          data-testid={`button-remove-slide-${slide.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Template structure editor ────────────────────────────────────────────────

interface StructureData {
  templateId: string;
  slides: SlideEntry[];
  id: number | null;
  updatedAt: string | null;
}

export function TemplateEditor({ tpl, onClose }: { tpl: TemplateDef; onClose: () => void }) {
  const { toast } = useToast();
  const { data: structure, isLoading } = useQuery<StructureData>({
    queryKey: [`/api/template-structures/${tpl.id}`],
  });

  const [slides, setSlides] = useState<SlideEntry[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [addTypeFilter, setAddTypeFilter] = useState<string>("all");

  // Initialize from fetched data
  const initialSlides = slides ?? (structure?.slides ?? DEFAULT_TEMPLATE_SLIDES[tpl.id] ?? []);

  const saveMutation = useMutation({
    mutationFn: async (s: SlideEntry[]) => {
      await apiRequest("PUT", `/api/template-structures/${tpl.id}`, { slides: s });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/template-structures/${tpl.id}`] });
      setIsDirty(false);
      toast({ title: "Template saved" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const updateSlides = (updated: SlideEntry[]) => {
    setSlides(updated);
    setIsDirty(true);
  };

  const addSlide = (typeId: string) => {
    const type = SLIDE_TYPES.find(t => t.id === typeId);
    const newSlide: SlideEntry = {
      id: `s${Date.now()}`,
      typeId,
      label: type?.label ?? typeId,
    };
    updateSlides([...initialSlides, newSlide]);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const s = [...initialSlides];
    [s[i - 1], s[i]] = [s[i], s[i - 1]];
    updateSlides(s);
  };

  const moveDown = (i: number) => {
    if (i === initialSlides.length - 1) return;
    const s = [...initialSlides];
    [s[i], s[i + 1]] = [s[i + 1], s[i]];
    updateSlides(s);
  };

  const duplicate = (i: number) => {
    const s = [...initialSlides];
    const copy = { ...s[i], id: `s${Date.now()}`, label: `${s[i].label} (copy)` };
    s.splice(i + 1, 0, copy);
    updateSlides(s);
  };

  const remove = (i: number) => {
    updateSlides(initialSlides.filter((_, idx) => idx !== i));
  };

  const rename = (i: number, label: string) => {
    const s = [...initialSlides];
    s[i] = { ...s[i], label };
    updateSlides(s);
  };

  const resetToDefault = () => {
    const defaults = DEFAULT_TEMPLATE_SLIDES[tpl.id] ?? [];
    setSlides(defaults);
    setIsDirty(true);
  };

  const availableTypes = SLIDE_TYPES.filter(t =>
    addTypeFilter === "all" || t.usedIn.includes(tpl.id)
  );

  const categories = ["all", "structure", "data", "content", "layout"] as const;

  return (
    <div className="flex flex-col h-full" data-testid={`editor-template-${tpl.id}`}>
      {/* Editor header */}
      <div className="border-b px-5 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" data-testid="button-close-editor">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted shrink-0">
            {tpl.icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold">{tpl.name}</h2>
            <p className="text-[10px] text-muted-foreground">{tpl.format} · {initialSlides.length} slides/sections</p>
          </div>
        </div>
        {isDirty && <span className="text-[10px] text-amber-600 font-medium">Unsaved changes</span>}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={resetToDefault}
          data-testid="button-reset-template"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => saveMutation.mutate(initialSlides)}
          disabled={!isDirty || saveMutation.isPending}
          data-testid="button-save-template"
        >
          <Save className="w-3 h-3" />
          Save Structure
        </Button>
      </div>

      {/* Editor body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: slide list */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/20 shrink-0">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Slide / Section Order</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="h-7 text-xs gap-1.5" data-testid="button-add-slide">
                  <Plus className="w-3 h-3" />
                  Add Slide
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto" align="end">
                {SLIDE_TYPES.map(type => (
                  <DropdownMenuItem
                    key={type.id}
                    onClick={() => addSlide(type.id)}
                    className="gap-2"
                    data-testid={`menuitem-add-${type.id}`}
                  >
                    <span>{type.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{type.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{type.description}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">Loading…</div>
            ) : initialSlides.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <span className="text-2xl">📋</span>
                <p className="text-sm font-medium text-muted-foreground">No slides yet</p>
                <p className="text-xs text-muted-foreground">Click "Add Slide" to add your first slide or section.</p>
              </div>
            ) : (
              initialSlides.map((slide, i) => (
                <SlideRow
                  key={slide.id}
                  slide={slide}
                  index={i}
                  total={initialSlides.length}
                  onMoveUp={() => moveUp(i)}
                  onMoveDown={() => moveDown(i)}
                  onDuplicate={() => duplicate(i)}
                  onRemove={() => remove(i)}
                  onRename={label => rename(i, label)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: slide type library */}
        <div className="w-72 shrink-0 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/20 shrink-0">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Slide Type Library</span>
            <div className="flex gap-1 mt-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`text-[9px] px-2 py-0.5 rounded-full capitalize transition-colors ${addTypeFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  onClick={() => setAddTypeFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {availableTypes.map(type => (
              <SlideTypeCard
                key={type.id}
                type={type}
                compact
                onAdd={() => addSlide(type.id)}
              />
            ))}
          </div>
          <div className="border-t px-3 py-2 bg-muted/10 shrink-0">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Click <strong>+</strong> on any type to add it, or use the <strong>Add Slide</strong> dropdown above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Templates Page ──────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDef | null>(null);

  if (selectedTemplate) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <TemplateEditor tpl={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-templates">
      {/* Header */}
      <div className="border-b px-8 py-6 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-[11px] text-muted-foreground">
          <span>SmartEO</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Templates</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#1B3A6B] shrink-0">
            <LayoutTemplate className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Report Templates</h1>
            <p className="text-sm text-muted-foreground">
              Manage slide/section structures for each report type. Choose a template to edit its layout.
            </p>
          </div>
        </div>
      </div>

      {/* Template grid */}
      <div className="flex-1 px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
          {TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              className="group flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
              data-testid={`card-template-${tpl.id}`}
            >
              <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: tpl.accentColor }} />

              <div className="flex flex-col flex-1 p-5 gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0">
                      {tpl.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground leading-snug">{tpl.name}</h3>
                      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${tpl.badgeColor}`}>
                        {tpl.badge}
                      </span>
                    </div>
                  </div>
                  <DefaultSlideCount templateId={tpl.id} />
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed flex-1">{tpl.description}</p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={() => setSelectedTemplate(tpl)}
                  data-testid={`button-edit-template-${tpl.id}`}
                >
                  <LayoutTemplate className="w-3 h-3" />
                  Edit Structure
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Info panel */}
        <div className="mt-8 max-w-4xl rounded-xl border border-border bg-muted/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-1">How Templates work</p>
              <p>Templates define the <strong>structure</strong> of each report — which slides or sections appear and in what order. Styling (colors, fonts, backgrounds) is controlled by the active <strong>Theme</strong>. Content is always generated fresh from live data. Structural changes do not retroactively affect already-saved reports.</p>
            </div>
          </div>
        </div>

        {/* Slide type reference */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-sm font-semibold text-foreground mb-1">Slide / Section Type Library</h2>
          <p className="text-xs text-muted-foreground mb-4">All available slide and section types that can be used in report templates.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {SLIDE_TYPES.map(type => (
              <SlideTypeCard key={type.id} type={type} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide count badge (reads from API or defaults) ───────────────────────────

export function DefaultSlideCount({ templateId }: { templateId: string }) {
  const { data } = useQuery<{ slides: SlideEntry[] }>({
    queryKey: [`/api/template-structures/${templateId}`],
  });
  const count = data?.slides?.length ?? DEFAULT_TEMPLATE_SLIDES[templateId]?.length ?? 0;
  return (
    <span className="text-[10px] text-muted-foreground shrink-0">
      {count} slide{count !== 1 ? "s" : ""}
    </span>
  );
}
