import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Plus, Trash2, Download, Sparkles, ChevronRight, Check,
  Building2, Layers, BarChart3, FileText, Link2, Star, Settings,
  Edit3, Lock, Unlock, Eye, AlertTriangle, CheckCircle2, Clock,
  ArrowUpDown, Filter, MoreHorizontal, RefreshCw, X, BookOpen,
  TrendingUp, Target, Globe, MapPin, Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessProfile {
  clientName: string;
  domain: string;
  subfolderScope?: string;
  businessType: string;
  industryCategory: string;
  marketType: string;
  locationTargets: string[];
  primaryServices: string[];
  secondaryServices: string[];
  targetAudiences: string[];
  primaryConversionGoals: string[];
  northStarMetric: string;
  seasonalPriorities?: string;
  competitorDomains: string[];
  notes?: string;
  isYmyl: boolean;
  complianceSensitivity: "low" | "medium" | "high";
}

interface Cluster {
  id: string;
  name: string;
  clusterType: string;
  clusterRole: string;
  linkedBusinessGoal: string;
  notes?: string;
}

interface Keyword {
  id: string;
  keyword: string;
  clusterId: string;
  source: string;
  estimatedVolume?: string;
  estimatedDifficulty?: number;
  searchVolume?: number;
  difficulty?: number;
  currentPosition?: number;
  impressions?: number;
  clicks?: number;
  businessGoal: string;
  dominantIntent: string;
  businessGoalAlignmentScore: number;
  intentFitScore: number;
  currentTractionScore: number;
  rankingOpportunityScore: number;
  conversionProximityScore: number;
  topicalAuthorityValueScore: number;
  contentEffortScore: number;
  existingCoverageScore: number;
  localRelevanceScore: number;
  trustComplianceComplexityScore: number;
  finalOpportunityScore: number;
  recommendedPageType: string;
  recommendedTargetUrl?: string;
  pageTypeReason?: string;
  serpNotes?: string;
  status: "pending" | "approved" | "rejected" | "watchlist";
  reviewState?: "new_suggestion" | "changed" | "unchanged" | null;
  isLocked: boolean;
  notes?: string;
  manualOverrides: Record<string, boolean>;
  confidence?: "high" | "medium" | "low";
  cannibalizationWarning?: string | null;
  cannibalizationSeverity?: "low" | "medium" | "high" | null;
  cannibalizationAction?: string | null;
  bgaHigh?: string[];
  bgaLow?: string[];
  clientRanksForKeyword?: boolean | null;
  clientEstimatedPosition?: number | null;
  competitorRankingDomains?: string[];
}

interface InternalLinkSuggestion {
  clusterId: string;
  clusterName: string;
  supportingPages: string[];
  anchorTextSuggestions: string[];
  linkingNotes: string;
  linkType?: string;
  rationale?: string;
}

interface ScoringWeights {
  businessGoalAlignment: number;
  intentFit: number;
  currentTraction: number;
  rankingOpportunity: number;
  conversionProximity: number;
  topicalAuthorityValue: number;
  contentEffort: number;
  existingCoverage: number;
}

interface Workspace {
  id: number;
  clientId?: number | null;
  name: string;
  businessProfile?: BusinessProfile | null;
  clusters?: Cluster[];
  keywords?: Keyword[];
  scoringWeights?: ScoringWeights | null;
  internalLinkSuggestions?: InternalLinkSuggestion[];
  changeLog?: { timestamp: string; action: string; detail: string }[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Client {
  id: number;
  name: string;
  gscSiteUrl?: string | null;
  ahrefsProjectUrl?: string | null;
  competitorDomains?: string[] | null;
  brandTerms?: string[] | null;
  leadEvents?: string[] | null;
  moneyPages?: string[] | null;
  primaryGoal?: string | null;
  gbpLocationName?: string | null;
  aboutPageUrl?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "profile", label: "Business Profile", icon: Building2 },
  { id: "clusters", label: "Clusters", icon: Layers },
  { id: "keywords", label: "Keywords & Scoring", icon: BarChart3 },
  { id: "recommendations", label: "Page Recommendations", icon: FileText },
  { id: "linking", label: "Internal Linking", icon: Link2 },
  { id: "export", label: "Export", icon: Download },
];

const DEFAULT_WEIGHTS: ScoringWeights = {
  businessGoalAlignment: 20, intentFit: 20, currentTraction: 10,
  rankingOpportunity: 15, conversionProximity: 15, topicalAuthorityValue: 10,
  contentEffort: 5, existingCoverage: 5,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  watchlist: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
};

const STATUS_ICONS: Record<string, typeof Check> = {
  pending: Clock, approved: CheckCircle2, rejected: X, watchlist: Eye,
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  existing_page_refresh: "Refresh Existing",
  new_blog: "New Blog",
  new_service_page: "New Service Page",
  new_location_page: "New Location Page",
  new_faq_page: "New FAQ Page",
  comparison_page: "Comparison Page",
  booking_page: "Booking/Amenity Page",
  category_hub_page: "Category Hub",
  no_action: "No Action",
};

const INTENT_COLORS: Record<string, string> = {
  transactional: "text-emerald-600 dark:text-emerald-400",
  commercial_investigation: "text-blue-600 dark:text-blue-400",
  informational: "text-violet-600 dark:text-violet-400",
  navigational: "text-gray-500",
  local_intent: "text-orange-600 dark:text-orange-400",
  mixed: "text-amber-600 dark:text-amber-400",
};

// ─── Helper components ────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? "text-emerald-600 dark:text-emerald-400"
    : score >= 4 ? "text-amber-600 dark:text-amber-400"
    : "text-red-500 dark:text-red-400";
  return <span className={`font-semibold tabular-nums text-xs ${color}`}>{score?.toFixed?.(1) ?? score}</span>;
}

function TagInput({
  values, onChange, placeholder, disabled
}: { values: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [input, setInput] = useState("");
  function add() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[38px]">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
          {v}
          {!disabled && (
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-red-500">
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : "Add more…"}
          className="flex-1 min-w-[100px] text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}

function ScoreSlider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <input
        type="range" min={0} max={10} step={1}
        value={value}
        onChange={e => !disabled && onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 h-1.5 accent-[#1B3A6B]"
      />
      <span className="text-xs font-semibold tabular-nums w-4 text-right">{value}</span>
    </div>
  );
}

// ─── Workspace list / picker ──────────────────────────────────────────────────

function WorkspacePicker({ onSelect }: { onSelect: (ws: Workspace) => void }) {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClientId, setNewClientId] = useState<string>("");

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/discoverability/workspaces"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/discoverability/workspaces", data),
    onSuccess: async (res) => {
      const ws = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/discoverability/workspaces"] });
      setShowCreate(false);
      setNewName("");
      setNewClientId("");
      onSelect(ws);
    },
    onError: () => toast({ title: "Error", description: "Could not create workspace", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/discoverability/workspaces/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/discoverability/workspaces"] }),
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-discoverability-picker">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#1B3A6B]/10 border border-[#1B3A6B]/20 flex items-center justify-center">
            <Search className="w-5 h-5 text-[#1B3A6B] dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Discoverability Tool</h1>
            <p className="text-xs text-muted-foreground">Keyword Research Engine — Webserv SEO Workflow</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6 ml-13">
          Structured keyword research aligned to client business goals, search intent, and conversion outcomes.
        </p>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Research Workspaces</h2>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5" data-testid="button-create-workspace">
            <Plus className="w-3.5 h-3.5" /> New Workspace
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading workspaces…</div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No workspaces yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first keyword research workspace to get started.</p>
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-workspace-empty">
              <Plus className="w-3.5 h-3.5 mr-1" /> Create Workspace
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {workspaces.map((ws) => {
              const kwCount = (ws.keywords as any[])?.length ?? 0;
              const clCount = (ws.clusters as any[])?.length ?? 0;
              const approvedCount = (ws.keywords as any[])?.filter((k: any) => k.status === "approved").length ?? 0;
              const client = clients.find(c => c.id === ws.clientId);
              return (
                <div
                  key={ws.id}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-[#1B3A6B]/30 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => onSelect(ws)}
                  data-testid={`workspace-card-${ws.id}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#1B3A6B]/10 border border-[#1B3A6B]/20 flex items-center justify-center shrink-0">
                    <Search className="w-4 h-4 text-[#1B3A6B] dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate">{ws.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 shrink-0">
                        {ws.status === "draft" ? "Draft" : ws.status === "active" ? "Active" : ws.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {client && <span>{client.name}</span>}
                      <span>{clCount} clusters</span>
                      <span>{kwCount} keywords</span>
                      {kwCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">{approvedCount} approved</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground hidden group-hover:block">
                      Updated {new Date(ws.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      onClick={e => { e.stopPropagation(); if (confirm("Delete this workspace?")) deleteMutation.mutate(ws.id); }}
                      data-testid={`button-delete-workspace-${ws.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Research Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Workspace Name</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Sunrise Recovery — Q2 Keyword Research"
                data-testid="input-workspace-name"
                onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate({ name: newName.trim(), clientId: newClientId ? Number(newClientId) : null, status: "draft" })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Client (optional)</label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger data-testid="select-workspace-client">
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ name: newName.trim() || "Untitled Workspace", clientId: newClientId && newClientId !== "none" ? Number(newClientId) : null, status: "draft" })}
              disabled={createMutation.isPending}
              data-testid="button-create-workspace-confirm"
            >
              {createMutation.isPending ? "Creating…" : "Create Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Step 1: Business Profile ─────────────────────────────────────────────────

interface ClientCompetitor { id: number; clientId: number; name: string; url: string; ordinal: number; }

function BusinessProfileStep({ ws, onSave }: { ws: Workspace; onSave: (bp: BusinessProfile) => void }) {
  const { data: clientList = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const client = ws.clientId ? clientList.find(c => c.id === ws.clientId) : null;

  const { data: competitorRows = [] } = useQuery<ClientCompetitor[]>({
    queryKey: ["/api/clients", ws.clientId, "competitors"],
    queryFn: () => fetch(`/api/clients/${ws.clientId}/competitors`).then(r => r.json()),
    enabled: !!ws.clientId,
  });

  const defaultBp: BusinessProfile = {
    clientName: "", domain: "", businessType: "", industryCategory: "",
    marketType: "local", locationTargets: [], primaryServices: [], secondaryServices: [],
    targetAudiences: [], primaryConversionGoals: [], northStarMetric: "",
    competitorDomains: [], isYmyl: false, complianceSensitivity: "low",
  };

  function buildFromClient(c: Client, competitors: ClientCompetitor[]): Partial<BusinessProfile> {
    const domain = c.ahrefsProjectUrl || c.gscSiteUrl || "";
    const competitorDomains = competitors
      .filter(comp => comp.url)
      .map(comp => comp.url.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, ""));
    return {
      clientName: c.name,
      domain: domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^(sc-domain:|www\.)/, ""),
      competitorDomains,
      primaryConversionGoals: (c.leadEvents || []).filter(Boolean),
    };
  }

  const [bp, setBp] = useState<BusinessProfile>(() => {
    const saved = ws.businessProfile as BusinessProfile | null;
    if (saved?.businessType) return saved;
    return defaultBp;
  });

  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (client && competitorRows !== undefined && !synced) {
      const saved = ws.businessProfile as BusinessProfile | null;
      if (!saved?.businessType) {
        setBp(prev => ({ ...prev, ...buildFromClient(client, competitorRows) }));
        setSynced(true);
      }
    }
  }, [client, competitorRows]);

  function syncFromClient() {
    if (!client) return;
    setBp(prev => ({ ...prev, ...buildFromClient(client, competitorRows) }));
    setSynced(true);
  }

  function set(key: keyof BusinessProfile, val: any) {
    setBp(prev => ({ ...prev, [key]: val }));
  }

  const autoFilledFields = client
    ? [
        client.name && "Client name",
        (client.ahrefsProjectUrl || client.gscSiteUrl) && "Domain",
        competitorRows.length > 0 && `${competitorRows.length} competitor${competitorRows.length > 1 ? "s" : ""}`,
        (client.leadEvents?.length ?? 0) > 0 && "Conversion goals",
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">Business Profile</h2>
        <p className="text-xs text-muted-foreground">This profile drives all AI-generated clusters, keyword scoring, and recommendations.</p>
      </div>

      {client && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start gap-3">
          <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">Auto-populated from Client Info</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {autoFilledFields.length > 0
                ? `Pulled: ${autoFilledFields.join(" · ")}`
                : "Client record linked — refresh to pull latest data."}
            </p>
            {competitorRows.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {competitorRows.map(comp => (
                  <span key={comp.id} className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-mono">
                    {comp.url.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "")}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" className="shrink-0 text-xs h-7 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300" onClick={syncFromClient}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Client Name *</label>
          <Input value={bp.clientName} onChange={e => set("clientName", e.target.value)} placeholder="e.g. Sunrise Recovery Center" data-testid="input-client-name" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Primary Domain *</label>
          <Input value={bp.domain} onChange={e => set("domain", e.target.value)} placeholder="e.g. sunriserecovery.com" data-testid="input-domain" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Business Type *</label>
          <Input value={bp.businessType} onChange={e => set("businessType", e.target.value)} placeholder="e.g. Addiction Treatment Center, RV Resort, Plumbing Service" data-testid="input-business-type" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Industry Category</label>
          <Input value={bp.industryCategory} onChange={e => set("industryCategory", e.target.value)} placeholder="e.g. Behavioral Health, Hospitality, Home Services" data-testid="input-industry" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Market Type</label>
          <Select value={bp.marketType} onValueChange={v => set("marketType", v)}>
            <SelectTrigger data-testid="select-market-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["local", "regional", "national", "multi-location", "ecommerce", "hospitality", "healthcare/YMYL", "other"].map(v => (
                <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Subfolder / Subdomain Scope</label>
          <Input value={bp.subfolderScope || ""} onChange={e => set("subfolderScope", e.target.value)} placeholder="e.g. /blog, location.example.com" data-testid="input-subfolder" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Location Targets</label>
        <TagInput values={bp.locationTargets} onChange={v => set("locationTargets", v)} placeholder="Add a city, state, or region then press Enter…" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Primary Services / Products</label>
          <TagInput values={bp.primaryServices} onChange={v => set("primaryServices", v)} placeholder="Add primary service then Enter…" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Secondary Services / Products</label>
          <TagInput values={bp.secondaryServices} onChange={v => set("secondaryServices", v)} placeholder="Add secondary service then Enter…" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Target Audience(s)</label>
          <TagInput values={bp.targetAudiences} onChange={v => set("targetAudiences", v)} placeholder="Add audience segment then Enter…" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Primary Conversion Goals</label>
          <TagInput values={bp.primaryConversionGoals} onChange={v => set("primaryConversionGoals", v)} placeholder="e.g. Phone call, Form fill, Booking…" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">North Star Metric / Main Business KPI</label>
        <Input value={bp.northStarMetric} onChange={e => set("northStarMetric", e.target.value)} placeholder="e.g. Organic admissions calls, Booked campsites, Online orders" data-testid="input-north-star" />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Seasonal or Campaign Priorities</label>
        <Textarea value={bp.seasonalPriorities || ""} onChange={e => set("seasonalPriorities", e.target.value)} placeholder="e.g. Summer bookings (May–Aug), Q4 detox surge, Spring deals…" rows={2} data-testid="input-seasonal" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">YMYL / Regulated Industry</label>
          <Select value={bp.isYmyl ? "yes" : "no"} onValueChange={v => set("isYmyl", v === "yes")}>
            <SelectTrigger data-testid="select-ymyl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No — standard business rules</SelectItem>
              <SelectItem value="yes">Yes — healthcare, legal, finance, addiction treatment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Compliance Sensitivity</label>
          <Select value={bp.complianceSensitivity} onValueChange={v => set("complianceSensitivity", v as any)}>
            <SelectTrigger data-testid="select-compliance"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Notes / Strategic Context</label>
        <Textarea value={bp.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Any additional context the keyword research should consider…" rows={3} data-testid="input-bp-notes" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave(bp)} data-testid="button-save-profile">
          <Check className="w-4 h-4 mr-1.5" /> Save & Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Clusters ─────────────────────────────────────────────────────────

function ClustersStep({ ws, onUpdate, onGenerate }: { ws: Workspace; onUpdate: (clusters: Cluster[]) => void; onGenerate: () => void }) {
  const clusters: Cluster[] = (ws.clusters as Cluster[]) || [];
  const keywords: Keyword[] = (ws.keywords as Keyword[]) || [];
  const [editingId, setEditingId] = useState<string | null>(null);

  const CLUSTER_TYPE_OPTS = [
    "service", "location", "problem_symptom", "comparison", "cost_pricing",
    "amenity_experience", "branded", "faq_informational",
  ];
  const CLUSTER_ROLE_OPTS = [
    "core_revenue", "support_authority", "local_visibility", "cro_support", "brand_protection",
  ];

  const ROLE_COLORS: Record<string, string> = {
    core_revenue: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    support_authority: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    local_visibility: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    cro_support: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    brand_protection: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  function addCluster() {
    const newCluster: Cluster = {
      id: `cluster_${Date.now()}`,
      name: "New Cluster",
      clusterType: "service",
      clusterRole: "core_revenue",
      linkedBusinessGoal: "",
      notes: "",
    };
    onUpdate([...clusters, newCluster]);
    setEditingId(newCluster.id);
  }

  function updateCluster(id: string, updates: Partial<Cluster>) {
    onUpdate(clusters.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  function deleteCluster(id: string) {
    onUpdate(clusters.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-0.5">Keyword Clusters</h2>
          <p className="text-xs text-muted-foreground">AI generates clusters from your business profile. Review, edit, or delete after generation.</p>
        </div>
        {clusters.length > 0 && (
          <Button size="sm" variant="outline" onClick={addCluster} data-testid="button-add-cluster">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Cluster
          </Button>
        )}
      </div>

      {clusters.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#EA580C]/40 bg-orange-50/50 dark:bg-orange-950/10 p-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-[#EA580C]/10 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-[#EA580C]" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Let AI build your clusters</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-6">
            Based on your business profile, the AI will generate keyword clusters organized by type, role, and business goal — then populate each with scored keywords.
          </p>
          <Button
            className="bg-[#EA580C] hover:bg-[#EA580C]/90 text-white gap-2 px-6"
            onClick={onGenerate}
            data-testid="button-generate-clusters"
          >
            <Sparkles className="w-4 h-4" />
            Generate Clusters &amp; Keywords with AI
          </Button>
          <button
            className="mt-4 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={addCluster}
            data-testid="button-add-cluster-manual"
          >
            or add a cluster manually
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {clusters.map((cluster) => {
            const kwCount = keywords.filter(k => k.clusterId === cluster.id).length;
            const approvedCount = keywords.filter(k => k.clusterId === cluster.id && k.status === "approved").length;
            const isEditing = editingId === cluster.id;
            return (
              <div key={cluster.id} className="p-4 rounded-xl border bg-card" data-testid={`cluster-card-${cluster.id}`}>
                {isEditing ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Cluster Name</label>
                        <Input
                          value={cluster.name}
                          onChange={e => updateCluster(cluster.id, { name: e.target.value })}
                          className="text-sm font-semibold h-8"
                          data-testid={`input-cluster-name-${cluster.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Business Goal Link</label>
                        <Input
                          value={cluster.linkedBusinessGoal}
                          onChange={e => updateCluster(cluster.id, { linkedBusinessGoal: e.target.value })}
                          placeholder="Which business goal does this support?"
                          className="h-8 text-xs"
                          data-testid={`input-cluster-goal-${cluster.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Cluster Type</label>
                        <Select value={cluster.clusterType} onValueChange={v => updateCluster(cluster.id, { clusterType: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CLUSTER_TYPE_OPTS.map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Cluster Role</label>
                        <Select value={cluster.clusterRole} onValueChange={v => updateCluster(cluster.id, { clusterRole: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CLUSTER_ROLE_OPTS.map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Done</Button>
                      <button
                        onClick={() => deleteCluster(cluster.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                        data-testid={`button-delete-cluster-${cluster.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{cluster.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[cluster.clusterRole] || "bg-muted text-muted-foreground"}`}>
                          {cluster.clusterRole.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{cluster.clusterType.replace(/_/g, " ")}</span>
                      </div>
                      {cluster.linkedBusinessGoal && (
                        <p className="text-xs text-muted-foreground">Goal: {cluster.linkedBusinessGoal}</p>
                      )}
                      {cluster.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{cluster.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">{kwCount} kws · <span className="text-emerald-600">{approvedCount} approved</span></span>
                      <button
                        onClick={() => setEditingId(cluster.id)}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`button-edit-cluster-${cluster.id}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCluster(cluster.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                        data-testid={`button-delete-cluster-${cluster.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Keywords & Scoring ───────────────────────────────────────────────

function KeywordDetailDrawer({
  kw, clusters, onClose, onSave
}: {
  kw: Keyword; clusters: Cluster[];
  onClose: () => void;
  onSave: (updated: Keyword) => void;
}) {
  const [draft, setDraft] = useState<Keyword>({ ...kw });

  function setScore(key: keyof Keyword, val: number) {
    setDraft(prev => ({ ...prev, [key]: val, manualOverrides: { ...prev.manualOverrides, [key]: true } }));
  }

  function recalcFinal(d: Keyword) {
    const w = DEFAULT_WEIGHTS;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const raw =
      d.businessGoalAlignmentScore * (w.businessGoalAlignment / total) +
      d.intentFitScore * (w.intentFit / total) +
      d.currentTractionScore * (w.currentTraction / total) +
      d.rankingOpportunityScore * (w.rankingOpportunity / total) +
      d.conversionProximityScore * (w.conversionProximity / total) +
      d.topicalAuthorityValueScore * (w.topicalAuthorityValue / total) +
      ((10 - d.contentEffortScore) * (w.contentEffort / total)) +
      d.existingCoverageScore * (w.existingCoverage / total);
    return Math.round(raw * 10) / 10;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="h-full w-[480px] bg-background border-l shadow-2xl overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">Keyword Detail</p>
            <h3 className="text-sm font-bold text-foreground leading-tight">{kw.keyword}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { const updated = { ...draft, finalOpportunityScore: recalcFinal(draft) }; onSave(updated); onClose(); }} data-testid="button-save-kw-drawer">
              <Check className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted" data-testid="button-close-drawer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Keyword</label>
              <Input value={draft.keyword} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} className="text-sm h-8" data-testid="input-kw-keyword" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Cluster</label>
              <Select value={draft.clusterId} onValueChange={v => setDraft(d => ({ ...d, clusterId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Est. Volume</label>
              <Input value={draft.estimatedVolume || ""} onChange={e => setDraft(d => ({ ...d, estimatedVolume: e.target.value }))} placeholder="e.g. 200-500" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Est. Difficulty (0–100)</label>
              <Input type="number" min={0} max={100} value={draft.estimatedDifficulty || ""} onChange={e => setDraft(d => ({ ...d, estimatedDifficulty: Number(e.target.value) }))} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Current Position</label>
              <Input type="number" value={draft.currentPosition || ""} onChange={e => setDraft(d => ({ ...d, currentPosition: Number(e.target.value) }))} placeholder="GSC avg position" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Source</label>
              <Select value={draft.source} onValueChange={v => setDraft(d => ({ ...d, source: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["gsc", "ahrefs", "semrush", "crawl", "manual", "ai_inferred"].map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Business Goal</label>
            <Input value={draft.businessGoal} onChange={e => setDraft(d => ({ ...d, businessGoal: e.target.value }))} placeholder="Which specific business goal does this support?" className="h-8 text-xs" />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Dominant Intent</label>
            <Select value={draft.dominantIntent} onValueChange={v => setDraft(d => ({ ...d, dominantIntent: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["transactional", "commercial_investigation", "informational", "navigational", "local_intent", "mixed"].map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Recommended Page Type</label>
            <Select value={draft.recommendedPageType} onValueChange={v => setDraft(d => ({ ...d, recommendedPageType: v, manualOverrides: { ...d.manualOverrides, recommendedPageType: true } }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAGE_TYPE_LABELS).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            {draft.pageTypeReason && (
              <p className="mt-1.5 text-[11px] text-muted-foreground italic leading-snug">{draft.pageTypeReason}</p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Recommended Target URL</label>
            <Input value={draft.recommendedTargetUrl || ""} onChange={e => setDraft(d => ({ ...d, recommendedTargetUrl: e.target.value }))} placeholder="Existing URL or /proposed-slug" className="h-8 text-xs" />
          </div>

          {/* Confidence & AI explainability */}
          {(draft.confidence || (draft.bgaHigh && draft.bgaHigh.length > 0)) && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Explainability</p>
              {draft.confidence && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Confidence:</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    draft.confidence === "high" ? "bg-green-50 text-green-700 border-green-200" :
                    draft.confidence === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-red-50 text-red-600 border-red-200"
                  }`}>{draft.confidence.charAt(0).toUpperCase() + draft.confidence.slice(1)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {draft.confidence === "high" ? "— clear intent + goal match" : draft.confidence === "medium" ? "— partial signal" : "— inferred, thin data"}
                  </span>
                </div>
              )}
              {draft.bgaHigh && draft.bgaHigh.length > 0 && (
                <div>
                  <p className="text-[10px] text-green-700 font-medium mb-0.5">What raised alignment score:</p>
                  {draft.bgaHigh.map((f, i) => (
                    <p key={i} className="text-[11px] text-foreground/80 ml-2">+ {f}</p>
                  ))}
                </div>
              )}
              {draft.bgaLow && draft.bgaLow.length > 0 && (
                <div>
                  <p className="text-[10px] text-amber-700 font-medium mb-0.5">What tempered alignment score:</p>
                  {draft.bgaLow.map((f, i) => (
                    <p key={i} className="text-[11px] text-foreground/80 ml-2">− {f}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cannibalization warning */}
          {draft.cannibalizationWarning && (
            <div className={`rounded-lg border p-3 ${
              draft.cannibalizationSeverity === "high" ? "border-red-200 bg-red-50" :
              draft.cannibalizationSeverity === "medium" ? "border-amber-200 bg-amber-50" :
              "border-yellow-200 bg-yellow-50"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className={`w-3.5 h-3.5 ${draft.cannibalizationSeverity === "high" ? "text-red-600" : "text-amber-600"}`} />
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${draft.cannibalizationSeverity === "high" ? "text-red-700" : "text-amber-700"}`}>
                  Cannibalization Risk — {draft.cannibalizationSeverity || "low"}
                </p>
              </div>
              <p className="text-[11px] text-foreground/80 leading-snug">{draft.cannibalizationWarning}</p>
              {draft.cannibalizationAction && (
                <p className="mt-1 text-[11px] font-medium text-foreground/70">
                  Action: {draft.cannibalizationAction.replace(/_/g, " ")}
                </p>
              )}
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground">Opportunity Scores (0–10)</p>
              <span className="text-xs text-muted-foreground">
                Final: <ScoreBadge score={recalcFinal(draft)} />
              </span>
            </div>
            <div className="space-y-2.5">
              <ScoreSlider label="Business Goal Alignment" value={draft.businessGoalAlignmentScore} onChange={v => setScore("businessGoalAlignmentScore", v)} />
              <ScoreSlider label="Intent Fit" value={draft.intentFitScore} onChange={v => setScore("intentFitScore", v)} />
              <ScoreSlider label="Current Traction" value={draft.currentTractionScore} onChange={v => setScore("currentTractionScore", v)} />
              <ScoreSlider label="Ranking Opportunity" value={draft.rankingOpportunityScore} onChange={v => setScore("rankingOpportunityScore", v)} />
              <ScoreSlider label="Conversion Proximity" value={draft.conversionProximityScore} onChange={v => setScore("conversionProximityScore", v)} />
              <ScoreSlider label="Topical Authority Value" value={draft.topicalAuthorityValueScore} onChange={v => setScore("topicalAuthorityValueScore", v)} />
              <ScoreSlider label="Content Effort (burden)" value={draft.contentEffortScore} onChange={v => setScore("contentEffortScore", v)} />
              <ScoreSlider label="Existing Coverage" value={draft.existingCoverageScore} onChange={v => setScore("existingCoverageScore", v)} />
              <ScoreSlider label="Local Relevance" value={draft.localRelevanceScore} onChange={v => setScore("localRelevanceScore", v)} />
              <ScoreSlider label="Trust/Compliance Complexity" value={draft.trustComplianceComplexityScore} onChange={v => setScore("trustComplianceComplexityScore", v)} />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              {draft.isLocked && <span className="flex items-center gap-1 text-[10px] text-amber-600"><Lock className="w-3 h-3" /> Locked</span>}
            </div>
            <div className="flex gap-1.5 mb-3">
              {([
                { value: "pending", label: "Needs Review" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "watchlist", label: "Watchlist" },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDraft(d => ({ ...d, status: value }))}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${draft.status === value ? STATUS_COLORS[value] + " border-current" : "border-border text-muted-foreground hover:bg-muted"}`}
                  data-testid={`button-kw-status-${value}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setDraft(d => ({ ...d, isLocked: !d.isLocked }))}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-kw-lock-toggle"
            >
              {draft.isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {draft.isLocked ? "Unlock row" : "Lock row from edits"}
            </button>
          </div>

          <div className="border-t pt-4">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">SERP Notes</label>
            <Textarea value={draft.serpNotes || ""} onChange={e => setDraft(d => ({ ...d, serpNotes: e.target.value }))} placeholder="Notes on SERP composition, intent signals, ranking patterns…" rows={3} className="text-xs" />
          </div>

          <div className="border-t pt-4">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Notes</label>
            <Textarea value={draft.notes || ""} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Strategy notes, caveats, manual observations…" rows={2} className="text-xs" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KeywordsStep({ ws, onUpdate }: { ws: Workspace; onUpdate: (keywords: Keyword[]) => void }) {
  const clusters: Cluster[] = (ws.clusters as Cluster[]) || [];
  const keywords: Keyword[] = (ws.keywords as Keyword[]) || [];

  const [selectedKw, setSelectedKw] = useState<Keyword | null>(null);
  const [filterCluster, setFilterCluster] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterIntent, setFilterIntent] = useState("all");
  const [sortBy, setSortBy] = useState<string>("finalOpportunityScore");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [newKeyword, setNewKeyword] = useState("");

  const clusterMap = Object.fromEntries(clusters.map(c => [c.id, c.name]));

  function getSortValue(k: Keyword, field: string): string | number {
    if (field === "clusterName") return clusterMap[k.clusterId] || "";
    if (field === "estimatedVolume") {
      const v = k.estimatedVolume || k.searchVolume || "0";
      return parseInt(String(v).split("-")[0].replace(/[^\d]/g, "") || "0", 10);
    }
    if (field === "competitorCount") return (k.competitorRankingDomains?.length ?? 0);
    if (field === "clientRanksForKeyword") return k.clientRanksForKeyword === true ? 1 : 0;
    return (k as any)[field] ?? "";
  }

  const filtered = keywords
    .filter(k => filterCluster === "all" || k.clusterId === filterCluster)
    .filter(k => filterStatus === "all" || (filterStatus === "new_suggestion" ? k.reviewState === "new_suggestion" : k.status === filterStatus))
    .filter(k => filterIntent === "all" || k.dominantIntent === filterIntent)
    .sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function addKeyword() {
    if (!newKeyword.trim()) return;
    const kw: Keyword = {
      id: `kw_${Date.now()}`,
      keyword: newKeyword.trim(),
      clusterId: clusters[0]?.id || "",
      source: "manual",
      businessGoal: "",
      dominantIntent: "informational",
      businessGoalAlignmentScore: 5, intentFitScore: 5, currentTractionScore: 3,
      rankingOpportunityScore: 5, conversionProximityScore: 5, topicalAuthorityValueScore: 5,
      contentEffortScore: 5, existingCoverageScore: 3, localRelevanceScore: 5,
      trustComplianceComplexityScore: 2, finalOpportunityScore: 5,
      recommendedPageType: "new_blog", status: "pending", isLocked: false,
      manualOverrides: {},
    };
    onUpdate([...keywords, kw]);
    setNewKeyword("");
  }

  function updateKeyword(updated: Keyword) {
    onUpdate(keywords.map(k => k.id === updated.id ? updated : k));
  }

  function deleteKeyword(id: string) {
    onUpdate(keywords.filter(k => k.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function bulkSetStatus(status: Keyword["status"]) {
    onUpdate(keywords.map(k => selectedIds.has(k.id) ? { ...k, status } : k));
    setSelectedIds(new Set());
  }

  function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} keyword(s)?`)) return;
    onUpdate(keywords.filter(k => !selectedIds.has(k.id)));
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(k => k.id)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">Keywords & Scoring</h2>
        <p className="text-xs text-muted-foreground">Review, edit, approve, and score keyword candidates. Click any row to open the detail drawer.</p>
      </div>

      {/* Filters + add */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={filterCluster} onValueChange={setFilterCluster}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-filter-cluster">
              <SelectValue placeholder="All clusters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clusters</SelectItem>
              {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-7 text-xs w-28" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {[
                { value: "pending", label: "Needs Review" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "watchlist", label: "Watchlist" },
              ].map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              <SelectItem value="new_suggestion">New suggestions</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterIntent} onValueChange={setFilterIntent}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="Intent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intent</SelectItem>
              {["transactional", "commercial_investigation", "informational", "navigational", "local_intent", "mixed"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("approved")} data-testid="button-bulk-approve">Approve</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("rejected")} data-testid="button-bulk-reject">Reject</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("watchlist")} data-testid="button-bulk-watchlist">Watchlist</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-600" onClick={bulkDelete} data-testid="button-bulk-delete">Delete</Button>
          </div>
        )}

        {/* Add keyword */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Input
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addKeyword()}
            placeholder="Add keyword…"
            className="h-7 text-xs w-44"
            data-testid="input-add-keyword"
          />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={addKeyword} data-testid="button-add-keyword">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
        <span className="font-medium text-foreground">{keywords.length} total</span>
        <span className="text-emerald-600 dark:text-emerald-400">{keywords.filter(k => k.status === "approved").length} approved</span>
        <span className="text-red-500">{keywords.filter(k => k.status === "rejected").length} rejected</span>
        <span className="text-amber-600">{keywords.filter(k => k.status === "watchlist").length} watchlist</span>
        <span>{keywords.filter(k => k.status === "pending").length} needs review</span>
        {keywords.filter(k => k.reviewState === "new_suggestion").length > 0 && (
          <span className="text-purple-600 dark:text-purple-400 font-medium">{keywords.filter(k => k.reviewState === "new_suggestion").length} new suggestions</span>
        )}
        <span className="ml-auto">Showing {filtered.length}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No keywords match your filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-max w-full text-xs" data-testid="keywords-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 p-2 sticky left-0 bg-muted/50 z-10">
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" data-testid="checkbox-select-all" />
                  </th>
                  {([
                    { label: "Keyword", field: "keyword", sticky: true },
                    { label: "Cluster", field: "clusterName" },
                    { label: "Intent", field: "dominantIntent" },
                    { label: "Volume", field: "estimatedVolume" },
                    { label: "Site Ranks?", field: "clientRanksForKeyword" },
                    { label: "Competitors", field: "competitorCount" },
                    { label: "Goal Align", field: "businessGoalAlignmentScore" },
                    { label: "Intent Fit", field: "intentFitScore" },
                    { label: "Conv Prox", field: "conversionProximityScore" },
                    { label: "Final Score", field: "finalOpportunityScore" },
                    { label: "Page Type", field: "recommendedPageType" },
                    { label: "Status", field: "status" },
                  ] as { label: string; field: string; sticky?: boolean }[]).map(({ label, field, sticky }) => (
                    <th
                      key={field}
                      className={`text-left p-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap select-none ${sticky ? "sticky left-8 bg-muted/50 z-10" : ""}`}
                      onClick={() => toggleSort(field)}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {sortBy === field
                          ? (sortDir === "desc" ? <ArrowUpDown className="w-3 h-3 text-foreground" /> : <ArrowUpDown className="w-3 h-3 text-foreground rotate-180" />)
                          : <ArrowUpDown className="w-3 h-3 opacity-30" />
                        }
                      </span>
                    </th>
                  ))}
                  <th className="w-8 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw) => {
                  const StatusIcon = STATUS_ICONS[kw.status] || Clock;
                  return (
                    <tr
                      key={kw.id}
                      className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${kw.isLocked ? "opacity-70" : ""}`}
                      onClick={() => !kw.isLocked && setSelectedKw(kw)}
                      data-testid={`kw-row-${kw.id}`}
                    >
                      <td className="p-2 sticky left-0 bg-background z-10 border-r border-border/30" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(kw.id)} onChange={() => toggleSelect(kw.id)} className="rounded" />
                      </td>
                      <td className="p-2 sticky left-8 bg-background z-10 border-r border-border/30 min-w-[160px] max-w-[240px]">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-medium text-foreground">{kw.keyword}</span>
                          {kw.isLocked && <Lock className="w-2.5 h-2.5 text-muted-foreground" />}
                          {kw.reviewState === "new_suggestion" && (
                            <span className="text-[9px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded-full font-semibold">new</span>
                          )}
                          {Object.keys(kw.manualOverrides).length > 0 && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-1 rounded">edited</span>
                          )}
                          {kw.cannibalizationWarning && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="w-3 h-3 text-amber-500 cursor-pointer" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{kw.cannibalizationWarning}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">{clusterMap[kw.clusterId] || kw.clusterId}</td>
                      <td className="p-2">
                        <span className={`font-medium ${INTENT_COLORS[kw.dominantIntent] || ""}`}>
                          {kw.dominantIntent?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground">{kw.estimatedVolume || kw.searchVolume || "—"}</td>
                      <td className="p-2">
                        {kw.clientRanksForKeyword === true ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-xs cursor-default">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {kw.clientEstimatedPosition ? `#${kw.clientEstimatedPosition}` : "Yes"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Client estimated to rank{kw.clientEstimatedPosition ? ` around position #${kw.clientEstimatedPosition}` : " in top 30"}</TooltipContent>
                          </Tooltip>
                        ) : kw.clientRanksForKeyword === false ? (
                          <span className="text-xs text-muted-foreground">Not ranking</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {(kw.competitorRankingDomains?.length ?? 0) > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full cursor-default">
                                {kw.competitorRankingDomains!.length} competing
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              <p className="font-semibold mb-1">Competitors ranking for this keyword:</p>
                              <ul className="space-y-0.5">
                                {kw.competitorRankingDomains!.map(d => <li key={d} className="font-mono">{d}</li>)}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2"><ScoreBadge score={kw.businessGoalAlignmentScore} /></td>
                      <td className="p-2"><ScoreBadge score={kw.intentFitScore} /></td>
                      <td className="p-2"><ScoreBadge score={kw.conversionProximityScore} /></td>
                      <td className="p-2">
                        <span className="font-bold text-foreground tabular-nums">{kw.finalOpportunityScore?.toFixed(1)}</span>
                      </td>
                      <td className="p-2">
                        {kw.recommendedPageType === "existing_page_refresh" && kw.recommendedTargetUrl ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer text-xs font-medium">
                                <RefreshCw className="w-3 h-3" />
                                Refresh Existing
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs max-w-xs">
                              <p className="font-semibold mb-0.5">Recommended page to refresh:</p>
                              <p className="font-mono text-blue-300">{kw.recommendedTargetUrl}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-xs">{PAGE_TYPE_LABELS[kw.recommendedPageType] || kw.recommendedPageType}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-default ${STATUS_COLORS[kw.status]}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {kw.status === "pending" ? "Needs Review" : kw.status.charAt(0).toUpperCase() + kw.status.slice(1)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-xs">
                            {kw.status === "pending" && "This keyword hasn't been reviewed yet. Open it to approve, reject, or add to watchlist."}
                            {kw.status === "approved" && "Approved for targeting — include in content strategy."}
                            {kw.status === "rejected" && "Rejected — not a priority for this cycle."}
                            {kw.status === "watchlist" && "On watchlist — monitor but not actively targeting yet."}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="p-2" onClick={e => e.stopPropagation()}>
                        <button
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={() => deleteKeyword(kw.id)}
                          data-testid={`button-delete-kw-${kw.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedKw && (
        <KeywordDetailDrawer
          kw={selectedKw}
          clusters={clusters}
          onClose={() => setSelectedKw(null)}
          onSave={(updated) => { updateKeyword(updated); setSelectedKw(null); }}
        />
      )}
    </div>
  );
}

// ─── Step 4: Page Recommendations ────────────────────────────────────────────

function RecommendationsStep({ ws }: { ws: Workspace }) {
  const clusters: Cluster[] = (ws.clusters as Cluster[]) || [];
  const keywords: Keyword[] = (ws.keywords as Keyword[]) || [];

  const byPageType = keywords.reduce((acc, kw) => {
    const t = kw.recommendedPageType || "no_action";
    if (!acc[t]) acc[t] = [];
    acc[t].push(kw);
    return acc;
  }, {} as Record<string, Keyword[]>);

  const clusterMap = Object.fromEntries(clusters.map(c => [c.id, c.name]));

  const prioritized = Object.fromEntries(
    Object.entries(byPageType)
      .filter(([type]) => type !== "no_action")
      .map(([type, kws]) => [type, [...kws].sort((a, b) => b.finalOpportunityScore - a.finalOpportunityScore)])
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">Page-Type Recommendations</h2>
        <p className="text-xs text-muted-foreground">Keywords grouped by their recommended target asset type. Scores reflect business-goal-weighted opportunity.</p>
      </div>

      {Object.entries(prioritized).length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Generate keywords first to see page-type recommendations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(prioritized).map(([pageType, kws]) => {
            const approved = kws.filter(k => k.status === "approved");
            return (
              <div key={pageType} className="border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{PAGE_TYPE_LABELS[pageType] || pageType}</h3>
                    <Badge variant="secondary" className="text-[10px]">{kws.length} keyword{kws.length !== 1 ? "s" : ""}</Badge>
                    {approved.length > 0 && (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-0">{approved.length} approved</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Avg score: {(kws.reduce((a, k) => a + k.finalOpportunityScore, 0) / kws.length).toFixed(1)}
                  </span>
                </div>
                <div className="divide-y">
                  {kws.slice(0, 8).map(kw => (
                    <div key={kw.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`rec-row-${kw.id}`}>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${STATUS_COLORS[kw.status]}`}>
                        {kw.status === "pending" ? "Needs Review" : kw.status.charAt(0).toUpperCase() + kw.status.slice(1)}
                      </div>
                      <span className="text-sm text-foreground font-medium flex-1 min-w-0 truncate">{kw.keyword}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{clusterMap[kw.clusterId] || ""}</span>
                      {kw.recommendedTargetUrl && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-mono shrink-0 truncate max-w-[140px]">{kw.recommendedTargetUrl}</span>
                      )}
                      {kw.cannibalizationWarning && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>{kw.cannibalizationWarning}</TooltipContent>
                        </Tooltip>
                      )}
                      <span className="font-bold text-foreground tabular-nums text-xs shrink-0">{kw.finalOpportunityScore?.toFixed(1)}</span>
                    </div>
                  ))}
                  {kws.length > 8 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                      +{kws.length - 8} more — review in Keywords tab
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {byPageType["no_action"]?.length > 0 && (
            <div className="border rounded-xl overflow-hidden opacity-60">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">No Action Recommended</h3>
                  <Badge variant="secondary" className="text-[10px]">{byPageType["no_action"].length}</Badge>
                </div>
              </div>
              <div className="divide-y">
                {byPageType["no_action"].slice(0, 5).map(kw => (
                  <div key={kw.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="text-xs text-muted-foreground flex-1 truncate">{kw.keyword}</span>
                    <span className="text-xs text-muted-foreground">{kw.serpNotes?.slice(0, 60)}…</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Internal Linking ─────────────────────────────────────────────────

function InternalLinkingStep({ ws }: { ws: Workspace }) {
  const suggestions: InternalLinkSuggestion[] = (ws.internalLinkSuggestions as InternalLinkSuggestion[]) || [];
  const clusters: Cluster[] = (ws.clusters as Cluster[]) || [];
  const keywords: Keyword[] = (ws.keywords as Keyword[]) || [];

  if (suggestions.length === 0 && clusters.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-0.5">Internal Linking & Topical Authority</h2>
          <p className="text-xs text-muted-foreground">AI-generated internal linking recommendations and anchor text suggestions by cluster.</p>
        </div>
        <div className="flex flex-col items-center py-10 text-center border-2 border-dashed rounded-xl">
          <Link2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Generate keywords to receive internal linking recommendations.</p>
        </div>
      </div>
    );
  }

  const clusterMap = Object.fromEntries(clusters.map(c => [c.id, c]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">Internal Linking & Topical Authority</h2>
        <p className="text-xs text-muted-foreground">Cluster-level internal linking recommendations. Use these to reinforce topical authority and funnel intent.</p>
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const cluster = clusters.find(c => c.id === s.clusterId);
            const clusterKws = keywords.filter(k => k.clusterId === s.clusterId && k.status === "approved");
            return (
              <div key={s.clusterId || i} className="border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b">
                  <Link2 className="w-4 h-4 text-[#1B3A6B] dark:text-blue-400" />
                  <h3 className="text-sm font-semibold text-foreground flex-1">{s.clusterName}</h3>
                  {s.linkType && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                      {s.linkType.replace(/_/g, " ")}
                    </span>
                  )}
                  {cluster && !s.linkType && (
                    <span className="text-[10px] text-muted-foreground">{cluster.clusterRole.replace(/_/g, " ")}</span>
                  )}
                  {clusterKws.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{clusterKws.length} approved kws</Badge>
                  )}
                </div>
                <div className="px-4 py-3 space-y-3">
                  {s.rationale && (
                    <p className="text-xs text-foreground/80 italic leading-snug">{s.rationale}</p>
                  )}
                  {s.supportingPages?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Supporting Page Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.supportingPages.map((p, j) => (
                          <span key={j} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.anchorTextSuggestions?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Anchor Text Suggestions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.anchorTextSuggestions.map((a, j) => (
                          <span key={j} className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full border border-border font-mono">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.linkingNotes && (
                    <p className="text-xs text-muted-foreground border-t pt-2">{s.linkingNotes}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {clusters.map(cluster => {
            const clusterKws = keywords.filter(k => k.clusterId === cluster.id);
            const approved = clusterKws.filter(k => k.status === "approved");
            return (
              <div key={cluster.id} className="border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{cluster.name}</span>
                  <span className="text-xs text-muted-foreground">{approved.length}/{clusterKws.length} approved</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Goal: {cluster.linkedBusinessGoal || "Not specified"} · Role: {cluster.clusterRole.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 italic">
                  Regenerate keywords with AI to receive linking suggestions for this cluster.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 6: Export ───────────────────────────────────────────────────────────

function ExportStep({ ws }: { ws: Workspace }) {
  const { toast } = useToast();
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [exportMode, setExportMode] = useState<"all" | "approved">("all");
  const keywords: Keyword[] = (ws.keywords as Keyword[]) || [];
  const clusters: Cluster[] = (ws.clusters as Cluster[]) || [];
  const bp = ws.businessProfile as BusinessProfile | null;

  async function downloadXlsx() {
    setIsDownloadingXlsx(true);
    try {
      const res = await fetch(`/api/discoverability/workspaces/${ws.id}/export-xlsx?mode=${exportMode}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `discoverability_${(ws.name || "workspace").replace(/\s+/g, "_").toLowerCase()}_${exportMode}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "XLSX exported", description: `${exportMode === "approved" ? "Approved keywords only" : "All keywords"} downloaded.` });
    } catch {
      toast({ title: "Export failed", description: "Could not download XLSX.", variant: "destructive" });
    } finally {
      setIsDownloadingXlsx(false);
    }
  }

  async function downloadPdf() {
    setIsDownloadingPdf(true);
    try {
      const res = await fetch(`/api/discoverability/workspaces/${ws.id}/export-pdf?mode=${exportMode}`);
      if (!res.ok) throw new Error("PDF export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `discoverability_${(ws.name || "workspace").replace(/\s+/g, "_").toLowerCase()}_${exportMode}_${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported", description: "Keyword research report downloaded." });
    } catch {
      toast({ title: "PDF failed", description: "Could not generate PDF report.", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const changeLog = (ws.changeLog as any[]) || [];
  const exportedKeywords = exportMode === "approved" ? keywords.filter(k => k.status === "approved") : keywords;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">Export</h2>
        <p className="text-xs text-muted-foreground">Download your keyword research workspace for client delivery or team use.</p>
      </div>

      {/* Export mode selector */}
      <div className="flex items-center gap-2 p-3 rounded-xl border bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Export scope:</span>
        <div className="flex gap-1.5">
          {[
            { value: "all", label: `All keywords (${keywords.length})` },
            { value: "approved", label: `Approved only (${keywords.filter(k => k.status === "approved").length})` },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setExportMode(opt.value as "all" | "approved")}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${exportMode === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              data-testid={`button-export-mode-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground ml-auto">{exportedKeywords.length} keyword{exportedKeywords.length !== 1 ? "s" : ""} included</span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Keywords", value: keywords.length, icon: Search },
          { label: "Clusters", value: clusters.length, icon: Layers },
          { label: "Approved", value: keywords.filter(k => k.status === "approved").length, icon: CheckCircle2 },
          { label: "Needs Review", value: keywords.filter(k => k.status === "pending").length, icon: Clock },
          { label: "Rejected", value: keywords.filter(k => k.status === "rejected").length, icon: X },
          { label: "New Suggestions", value: keywords.filter(k => k.reviewState === "new_suggestion").length, icon: Sparkles },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-lg font-bold text-foreground leading-none">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Export actions */}
      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">XLSX Workbook</h3>
            <p className="text-xs text-muted-foreground">8 tabs: Summary, Clusters, Keywords (with confidence + cannibalization), Existing Page Mapping, Internal Linking, Rejected/Watchlist, Scoring Weights, Change Log.</p>
          </div>
          <Button onClick={downloadXlsx} disabled={isDownloadingXlsx || keywords.length === 0} data-testid="button-export-xlsx">
            {isDownloadingXlsx ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
            {isDownloadingXlsx ? "Exporting…" : "Download XLSX"}
          </Button>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">PDF Report</h3>
            <p className="text-xs text-muted-foreground">Client-ready keyword research report — cover, business profile, cluster overview, top opportunities, page-type recs, internal linking, and methodology.</p>
          </div>
          <Button variant="outline" onClick={downloadPdf} disabled={isDownloadingPdf || keywords.length === 0} data-testid="button-export-pdf">
            {isDownloadingPdf ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
            {isDownloadingPdf ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Workspace info */}
      {bp && (
        <div className="border rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-widest text-muted-foreground mb-2">Workspace Summary</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {[
              ["Client", bp.clientName],
              ["Domain", bp.domain],
              ["Business Type", bp.businessType],
              ["Market", bp.marketType],
              ["YMYL", bp.isYmyl ? "Yes" : "No"],
              ["Compliance", bp.complianceSensitivity],
              ["Status", ws.status],
              ["Last Updated", new Date(ws.updatedAt).toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">{k}:</span>
                <span className="text-foreground font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change log */}
      {changeLog.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40">
            <h3 className="text-xs font-semibold text-foreground">Change Log</h3>
          </div>
          <div className="divide-y max-h-48 overflow-y-auto">
            {[...changeLog].reverse().map((entry: any, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="text-muted-foreground shrink-0">{new Date(entry.timestamp).toLocaleString()}</span>
                <span className="font-medium text-foreground">{entry.action.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground flex-1">{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main workspace editor ────────────────────────────────────────────────────

function WorkspaceEditor({ initialWs, onBack }: { initialWs: Workspace; onBack: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState("profile");
  const [ws, setWs] = useState<Workspace>(initialWs);
  const [isGenerating, setIsGenerating] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave debounced
  const autoSave = useCallback((data: Partial<Workspace>) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        const res = await apiRequest("PUT", `/api/discoverability/workspaces/${ws.id}`, data);
        const updated = await res.json();
        setWs(updated);
        queryClient.invalidateQueries({ queryKey: ["/api/discoverability/workspaces"] });
      } catch {
        toast({ title: "Autosave failed", variant: "destructive" });
      }
    }, 1200);
  }, [ws.id, toast]);

  function saveBusinessProfile(bp: BusinessProfile) {
    const changeLog = [...((ws.changeLog as any[]) || []), { timestamp: new Date().toISOString(), action: "profile_saved", detail: `Business profile updated for ${bp.clientName}` }];
    const updated = { ...ws, businessProfile: bp, changeLog };
    setWs(updated);
    autoSave({ businessProfile: bp as any, changeLog: changeLog as any });
    toast({ title: "Business profile saved" });
    setStep("clusters");
  }

  function saveClusters(clusters: Cluster[]) {
    const changeLog = [...((ws.changeLog as any[]) || []), { timestamp: new Date().toISOString(), action: "clusters_updated", detail: `${clusters.length} clusters` }];
    const updated = { ...ws, clusters, changeLog };
    setWs(updated as any);
    autoSave({ clusters: clusters as any, changeLog: changeLog as any });
  }

  function saveKeywords(keywords: Keyword[]) {
    const changeLog = [...((ws.changeLog as any[]) || []), { timestamp: new Date().toISOString(), action: "keywords_updated", detail: `${keywords.length} keywords` }];
    const updated = { ...ws, keywords, changeLog };
    setWs(updated as any);
    autoSave({ keywords: keywords as any, changeLog: changeLog as any });
  }

  async function runGenerate() {
    if (!ws.businessProfile) {
      toast({ title: "Set business profile first", description: "Complete Step 1 before generating.", variant: "destructive" });
      setStep("profile");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", `/api/discoverability/workspaces/${ws.id}/generate`, {});
      const updated = await res.json();
      setWs(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/discoverability/workspaces"] });
      toast({ title: "Generation complete", description: `${(updated.clusters as any[])?.length || 0} clusters · ${(updated.keywords as any[])?.length || 0} keywords generated.` });
      setStep("keywords");
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message || "Check API key configuration.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  const bp = ws.businessProfile as BusinessProfile | null;
  const kwCount = (ws.keywords as Keyword[])?.length ?? 0;
  const approvedCount = (ws.keywords as Keyword[])?.filter(k => k.status === "approved").length ?? 0;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left nav */}
      <div className="w-52 shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2" data-testid="button-back-to-picker">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" /> All Workspaces
          </button>
          <h2 className="text-xs font-semibold text-foreground truncate leading-snug">{ws.name}</h2>
          {bp?.clientName && <p className="text-[10px] text-muted-foreground truncate">{bp.clientName}</p>}
        </div>

        <nav className="flex-1 py-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCurrent = step === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-colors text-left ${isCurrent ? "bg-background text-foreground border-r-2 border-[#1B3A6B]" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                data-testid={`step-nav-${s.id}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{s.label}</span>
                {i === 0 && bp?.clientName && <Check className="w-2.5 h-2.5 ml-auto text-emerald-500" />}
                {i === 1 && (ws.clusters as any[])?.length > 0 && <Check className="w-2.5 h-2.5 ml-auto text-emerald-500" />}
                {i === 2 && kwCount > 0 && <span className="ml-auto text-[9px] text-muted-foreground">{kwCount}</span>}
              </button>
            );
          })}
        </nav>

        {/* Generate button */}
        <div className="p-3 border-t space-y-2">
          <Button
            size="sm"
            className="w-full gap-1.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white"
            onClick={runGenerate}
            disabled={isGenerating}
            data-testid="button-generate-ai"
          >
            {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isGenerating ? "Generating…" : "Generate with AI"}
          </Button>
          <p className="text-[9px] text-muted-foreground text-center leading-tight">
            Uses business profile to generate clusters, keywords, scores & recommendations
          </p>
          {kwCount > 0 && (
            <div className="text-[10px] text-center text-muted-foreground">
              {kwCount} kws · <span className="text-emerald-600">{approvedCount} approved</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {step === "profile" && (
            <BusinessProfileStep ws={ws} onSave={saveBusinessProfile} />
          )}
          {step === "clusters" && (
            <ClustersStep ws={ws} onUpdate={saveClusters} onGenerate={runGenerate} />
          )}
          {step === "keywords" && (
            <KeywordsStep ws={ws} onUpdate={saveKeywords} />
          )}
          {step === "recommendations" && (
            <RecommendationsStep ws={ws} />
          )}
          {step === "linking" && (
            <InternalLinkingStep ws={ws} />
          )}
          {step === "export" && (
            <ExportStep ws={ws} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function DiscoverabilityPage() {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);

  if (activeWorkspace) {
    return (
      <WorkspaceEditor
        initialWs={activeWorkspace}
        onBack={() => setActiveWorkspace(null)}
      />
    );
  }

  return <WorkspacePicker onSelect={setActiveWorkspace} />;
}
