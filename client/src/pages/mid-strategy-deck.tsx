import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Edit3,
  Check,
  Save,
  Presentation,
  BarChart3,
  Target,
  Map,
  Compass,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Info,
  Users,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client, MidStrategyDeck, EvalBatch } from "@shared/schema";

async function authedGet(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
  return r.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideContent {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  kicker?: string;
  narrativeBlocks: Array<{
    key: string;
    label: string;
    value: string;
    type: string;
  }>;
  chartConfig?: any;
  tableData?: { headers: string[]; rows: (string | number)[][] };
  navData?: { current: any[]; future: any[] };
  iaBlueprintData?: { hubs: any[] };
  citationTrace?: { sourceSheet: string; generatedAt: string };
}

interface DeckPayload {
  clientName: string;
  reportDate: string;
  preparedBy: string;
  slides: SlideContent[];
  competitorRows: any[];
  clicksDist: any[];
  trafficDist: any[];
  summaryStats: {
    clientRank: number;
    totalCompetitors: number;
    percentile: number;
    clientPercentileLabel: string;
  };
  evalBatchId: number;
  evalBatchName: string;
}

// ─── Slide type config ────────────────────────────────────────────────────────

const SLIDE_ICONS: Record<string, any> = {
  title: Presentation,
  agenda: Target,
  checkpoint: Compass,
  comp_analysis: BarChart3,
  clicks_dist: BarChart3,
  traffic_dist: BarChart3,
  priorities: Target,
  nav_ia: Map,
  ia_blueprint: Map,
  ia_credibility: CheckCircle2,
  whats_next: ArrowRight,
};

const SLIDE_COLOR: Record<string, string> = {
  title: "text-blue-600",
  agenda: "text-violet-600",
  checkpoint: "text-teal-600",
  comp_analysis: "text-red-600",
  clicks_dist: "text-orange-600",
  traffic_dist: "text-amber-600",
  priorities: "text-green-600",
  nav_ia: "text-indigo-600",
  ia_blueprint: "text-indigo-600",
  ia_credibility: "text-cyan-600",
  whats_next: "text-emerald-600",
};

// ─── Slide Preview Card ───────────────────────────────────────────────────────

function SlidePreviewCard({
  slide,
  index,
  isSelected,
  onClick,
}: {
  slide: SlideContent;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = SLIDE_ICONS[slide.type] ?? Presentation;
  const color = SLIDE_COLOR[slide.type] ?? "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-2 px-3 py-2.5 rounded-md transition-colors border ${
        isSelected
          ? "bg-primary/10 border-primary/40 shadow-sm"
          : "hover:bg-muted/60 border-transparent hover:border-border"
      }`}
      data-testid={`slide-thumb-${slide.id}`}
    >
      <div className="shrink-0 mt-0.5">
        <span className="text-[10px] text-muted-foreground font-mono w-5 inline-block">{index}</span>
        <Icon className={`w-3.5 h-3.5 ${color} inline-block ml-0.5`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{slide.title}</p>
        {slide.kicker && <p className="text-[10px] text-muted-foreground truncate">{slide.kicker}</p>}
      </div>
    </button>
  );
}

// ─── Block editor ────────────────────────────────────────────────────────────

function BlockEditor({
  block,
  onChange,
  pendingSave,
}: {
  block: { key: string; label: string; value: string; type: string };
  onChange: (key: string, value: string) => void;
  pendingSave: boolean;
}) {
  const [draft, setDraft] = useState(block.value);
  const [dirty, setDirty] = useState(false);

  const handleChange = useCallback((v: string) => {
    setDraft(v);
    setDirty(v !== block.value);
  }, [block.value]);

  function save() {
    onChange(block.key, draft);
    setDirty(false);
  }

  const isLong = ["paragraph", "bullet_list", "opportunity", "whats_next_item"].includes(block.type);

  return (
    <div className="space-y-1" data-testid={`block-${block.key}`}>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{block.label}</Label>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 text-[10px] px-2 text-green-600 hover:text-green-700"
            onClick={save}
            disabled={pendingSave}
            data-testid={`button-save-block-${block.key}`}
          >
            <Check className="w-3 h-3 mr-0.5" /> Save
          </Button>
        )}
      </div>
      {isLong ? (
        <Textarea
          value={draft}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => { if (dirty) save(); }}
          rows={block.type === "bullet_list" ? 6 : 4}
          className="text-sm resize-y"
          data-testid={`textarea-${block.key}`}
        />
      ) : (
        <Input
          value={draft}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => { if (dirty) save(); }}
          className="text-sm h-8"
          data-testid={`input-${block.key}`}
        />
      )}
    </div>
  );
}

// ─── Slide detail panel ───────────────────────────────────────────────────────

function SlideDetailPanel({
  slide,
  onEditBlock,
  pendingSave,
}: {
  slide: SlideContent;
  onEditBlock: (key: string, value: string) => void;
  pendingSave: boolean;
}) {
  const Icon = SLIDE_ICONS[slide.type] ?? Presentation;
  const color = SLIDE_COLOR[slide.type] ?? "text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-base">{slide.title}</h3>
          {slide.kicker && <p className="text-xs text-muted-foreground mt-0.5">{slide.kicker}</p>}
          {slide.citationTrace && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Source: {slide.citationTrace.sourceSheet} · Generated {new Date(slide.citationTrace.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        {slide.narrativeBlocks.map(block => (
          <BlockEditor
            key={block.key}
            block={block}
            onChange={onEditBlock}
            pendingSave={pendingSave}
          />
        ))}
      </div>

      {/* Table preview */}
      {slide.tableData && slide.tableData.rows.length > 0 && (
        <div>
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 block">Data Table</Label>
          <div className="overflow-x-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {slide.tableData.headers.map(h => <TableHead key={h} className="text-xs py-1.5">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {slide.tableData.rows.map((row, i) => (
                  <TableRow key={i} data-testid={`slide-table-row-${i}`}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="text-xs py-1.5">{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Nav preview */}
      {slide.navData && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 block">Current Nav</Label>
            <div className="space-y-0.5">
              {slide.navData.current.map((item: any, i: number) => (
                <div key={i} className="text-xs px-2 py-1 bg-muted/40 rounded">{item.label}</div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 block">Future Nav</Label>
            <div className="space-y-0.5">
              {slide.navData.future.map((item: any, i: number) => (
                <div key={i} className={`text-xs px-2 py-1 rounded ${item.type === "cta" ? "bg-primary/10 text-primary font-medium" : "bg-muted/40"}`}>
                  {item.label} {item.type === "cta" && "→ CTA"}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IA Blueprint preview */}
      {slide.iaBlueprintData && (
        <div>
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 block">IA Structure</Label>
          <div className="space-y-2">
            {slide.iaBlueprintData.hubs.map((hub: any, i: number) => (
              <Collapsible key={i}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium hover:text-primary" data-testid={`hub-${hub.slug}`}>
                  <ChevronRight className="w-3 h-3" /> {hub.label} ({hub.slug})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-5 mt-1 space-y-0.5">
                    {(hub.children ?? []).map((child: any, j: number) => (
                      <div key={j} className="text-[10px] text-muted-foreground">↳ {child.label} ({child.slug})</div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Competitive scorecard ─────────────────────────────────────────────────────

function CompScorecard({ stats }: { stats: DeckPayload["summaryStats"] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border bg-muted/30 p-3 text-center">
        <p className="text-2xl font-bold">{stats.clientRank}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Client Rank</p>
      </div>
      <div className="rounded-lg border bg-muted/30 p-3 text-center">
        <p className="text-2xl font-bold">{stats.totalCompetitors}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Total in Set</p>
      </div>
      <div className="rounded-lg border p-3 text-center" style={{ background: stats.percentile >= 50 ? "rgb(240 253 244)" : "rgb(254 242 242)" }}>
        <p className="text-2xl font-bold">{stats.percentile}th</p>
        <p className="text-xs text-muted-foreground mt-0.5">Percentile</p>
      </div>
    </div>
  );
}

// ─── Deck list / selector ─────────────────────────────────────────────────────

function DeckSidebar({
  clientId,
  evalBatches,
  selected,
  onSelect,
}: {
  clientId: number;
  evalBatches: EvalBatch[];
  selected: MidStrategyDeck | null;
  onSelect: (d: MidStrategyDeck) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ reportName: "Mid-Strategy Deck", reportDate: new Date().toISOString().slice(0, 10), preparedBy: "", evalBatchId: "" });

  const { data: decks = [], isLoading } = useQuery<MidStrategyDeck[]>({
    queryKey: ["/api/mid-strategy-decks", { clientId }],
    queryFn: () => authedGet(`/api/mid-strategy-decks?clientId=${clientId}`),
    enabled: clientId > 0,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/mid-strategy-decks", {
        clientId,
        reportName: form.reportName,
        reportDate: form.reportDate,
        preparedBy: form.preparedBy || "",
        evalBatchId: form.evalBatchId && form.evalBatchId !== "none" ? parseInt(form.evalBatchId) : null,
        reportStatus: "draft",
      }),
    onSuccess: async resp => {
      const deck = await resp.json();
      qc.invalidateQueries({ queryKey: ["/api/mid-strategy-decks", { clientId }] });
      setCreating(false);
      onSelect(deck);
      toast({ title: "Deck created", description: deck.reportName });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/mid-strategy-decks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mid-strategy-decks", { clientId }] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Decks</Label>
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)} data-testid="button-new-deck">
          <Plus className="w-3.5 h-3.5 mr-1" /> New
        </Button>
      </div>

      {creating && (
        <div className="p-3 border-b space-y-2 bg-muted/20">
          <Input
            value={form.reportName}
            onChange={e => setForm(f => ({ ...f, reportName: e.target.value }))}
            placeholder="Deck name"
            className="text-sm h-8"
            data-testid="input-deck-title"
          />
          <Input
            value={form.reportDate}
            onChange={e => setForm(f => ({ ...f, reportDate: e.target.value }))}
            type="date"
            className="text-sm h-8"
            data-testid="input-deck-date"
          />
          <Input
            value={form.preparedBy}
            onChange={e => setForm(f => ({ ...f, preparedBy: e.target.value }))}
            placeholder="Prepared by (name)"
            className="text-sm h-8"
            data-testid="input-deck-preparedby"
          />
          {evalBatches.length > 0 && (
            <Select value={form.evalBatchId} onValueChange={v => setForm(f => ({ ...f, evalBatchId: v }))}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-deck-batch">
                <SelectValue placeholder="Link evaluation batch (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No batch</SelectItem>
                {evalBatches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)} data-testid={`option-batch-${b.id}`}>{b.evaluationName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.reportName.trim() || createMut.isPending} className="flex-1" data-testid="button-create-deck">
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)} data-testid="button-cancel-deck">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-3 text-center">Loading...</div>
        ) : decks.length === 0 ? (
          <div className="text-xs text-muted-foreground border border-dashed rounded p-4 text-center m-2">No decks yet. Create one above.</div>
        ) : (
          <div className="space-y-1">
            {decks.map(d => (
              <div
                key={d.id}
                onClick={() => onSelect(d)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer transition-colors border ${selected?.id === d.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted/60 border-transparent"}`}
                data-testid={`item-deck-${d.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.reportName}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(d.reportDate).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Badge variant="outline" className="text-[10px]">{d.reportStatus}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={e => { e.stopPropagation(); deleteMut.mutate(d.id); }}
                    data-testid={`button-delete-deck-${d.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MidStrategyDeckPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [clientId, setClientId] = useState<string>(() => new URLSearchParams(window.location.search).get("client") ?? "");
  const [selectedDeck, setSelectedDeck] = useState<MidStrategyDeck | null>(null);
  const [payload, setPayload] = useState<DeckPayload | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: evalBatches = [] } = useQuery<EvalBatch[]>({
    queryKey: ["/api/eval-batches", { clientId }],
    queryFn: () => authedGet(`/api/eval-batches?clientId=${clientId}`),
    enabled: !!clientId,
  });

  const generateMut = useMutation({
    mutationFn: async (deckId: number) => {
      const resp = await apiRequest("POST", `/api/mid-strategy-decks/${deckId}/generate`);
      return resp.json() as Promise<DeckPayload>;
    },
    onSuccess: (data: DeckPayload) => {
      setPayload(data);
      setPendingEdits({});
      if (data.slides?.length > 0) setSelectedSlideId(data.slides[0].id);
      toast({ title: "Deck generated", description: `${data.slides.length} slides ready.` });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveEditMut = useMutation({
    mutationFn: ({ deckId, edits }: { deckId: number; edits: Record<string, string> }) =>
      apiRequest("PATCH", `/api/mid-strategy-decks/${deckId}/edits`, edits),
    onSuccess: () => {
      toast({ title: "Changes saved" });
    },
  });

  function handleEditBlock(key: string, value: string) {
    if (!selectedDeck || !payload) return;
    const updated = { ...pendingEdits, [key]: value };
    setPendingEdits(updated);

    // Apply to payload locally
    setPayload(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        slides: prev.slides.map(s => ({
          ...s,
          narrativeBlocks: s.narrativeBlocks.map(b => b.key === key ? { ...b, value } : b),
        })),
      };
    });

    // Persist
    saveEditMut.mutate({ deckId: selectedDeck.id, edits: { [key]: value } });
  }

  const selectedSlide = payload?.slides?.find(s => s.id === selectedSlideId) ?? null;

  return (
    <div className="flex h-full">
      {/* Client selector sidebar */}
      <div className="w-56 border-r bg-muted/20 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Mid-Strategy Deck</h2>
          <p className="text-xs text-muted-foreground mt-0.5">14-slide presentation</p>
        </div>

        <div className="p-3 border-b">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Client</Label>
          <Select value={clientId} onValueChange={v => { setClientId(v); setSelectedDeck(null); setPayload(null); }}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-msd-client">
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)} data-testid={`option-msd-client-${c.id}`}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {clientId && (
          <DeckSidebar
            clientId={parseInt(clientId)}
            evalBatches={evalBatches}
            selected={selectedDeck}
            onSelect={d => { setSelectedDeck(d); setPayload(null); setSelectedSlideId(null); }}
          />
        )}
      </div>

      {/* Center: slide list */}
      {!clientId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Presentation className="w-12 h-12 opacity-30" />
          <p className="text-sm">Select a client to begin</p>
        </div>
      ) : !selectedDeck ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Presentation className="w-12 h-12 opacity-30" />
          <p className="text-sm">Select or create a deck</p>
        </div>
      ) : (
        <>
          {/* Slide list panel */}
          <div className="w-56 border-r bg-background flex flex-col">
            <div className="p-3 border-b flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{selectedDeck.reportName}</p>
                {payload && (
                  <p className="text-[10px] text-muted-foreground">{payload.slides.length} slides</p>
                )}
              </div>
              <Button
                size="sm"
                variant={payload ? "outline" : "default"}
                onClick={() => generateMut.mutate(selectedDeck.id)}
                disabled={generateMut.isPending}
                className="shrink-0 h-7"
                data-testid="button-generate-deck"
              >
                {generateMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span className="ml-1 text-xs">{payload ? "Regen" : "Generate"}</span>
              </Button>
            </div>

            {!payload ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-4">
                <Presentation className="w-8 h-8 opacity-30" />
                <p className="text-xs text-center">Click Generate to build all 14 slides from evaluation data.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {payload.slides.map((slide, i) => (
                  <SlidePreviewCard
                    key={slide.id}
                    slide={slide}
                    index={i + 1}
                    isSelected={slide.id === selectedSlideId}
                    onClick={() => setSelectedSlideId(slide.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Slide detail panel */}
          <div className="flex-1 overflow-auto">
            {!payload ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <Info className="w-8 h-8 opacity-30" />
                <p className="text-sm">Generate the deck to view and edit slides.</p>
                {selectedDeck.evalBatchId ? (
                  <Badge variant="outline" className="text-xs">Linked to eval batch #{selectedDeck.evalBatchId}</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground max-w-xs text-center">No evaluation batch linked. The deck will use template defaults. Link a batch for data-backed slides.</p>
                )}
              </div>
            ) : selectedSlide ? (
              <div className="p-6 max-w-2xl">
                {/* Scorecard for comp slides */}
                {["comp_analysis", "clicks_dist", "traffic_dist"].includes(selectedSlide.type) && payload.summaryStats && (
                  <div className="mb-5">
                    <CompScorecard stats={payload.summaryStats} />
                  </div>
                )}
                <SlideDetailPanel
                  slide={selectedSlide}
                  onEditBlock={handleEditBlock}
                  pendingSave={saveEditMut.isPending}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <p className="text-sm">Select a slide to edit</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
