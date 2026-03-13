import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  FileText,
  Monitor,
  User,
  Lock,
  AlertCircle,
  Sparkles,
  MessageSquare,
  ClipboardList,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  CircleDot,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { FindingChatPanel } from "@/components/workflow/FindingChatPanel";
import {
  makeFinding,
  type Finding,
  type FindingStatus,
} from "@/lib/findingTypes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listReportTypes,
  getReportDefinition,
  familyColor,
  type ReportTypeDefinition,
} from "@/lib/reportFamilyUtils";
import {
  DEFAULT_STRATEGY_AREAS,
  getStrategyAreas,
  type StrategyAreaId,
} from "@/lib/workflowStrategyAreas";
import { saveWorkflowContext } from "@/lib/workflowHandoff";
import { GuidancePanel, areaIdToWorkflowGroup } from "@/components/GuidancePanel";
import { useConfigOverrides } from "@/hooks/useConfigOverrides";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Report Type" },
  { id: 2, label: "Client" },
  { id: 3, label: "Strategy Areas" },
  { id: 4, label: "Findings Review" },
  { id: 5, label: "Assembly" },
  { id: 6, label: "Preview & Export" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ─── State types ──────────────────────────────────────────────────────────────

type SectionPhase = "idle" | "input" | "analyzing" | "questions" | "findings" | "committed";

interface SectionState {
  phase: SectionPhase;
  amInput: string;
  questionAnswers: Record<number, string>;
  /** Findings as durable objects — single source of truth for body, status, and selection */
  findings: Finding[];
  committed: boolean;
}

interface WorkflowState {
  step: StepId;
  reportTypeId: string | null;
  clientId: number | null;
  activeSectionId: StrategyAreaId;
  sections: Record<StrategyAreaId, SectionState>;
  chatFinding: Finding | null;
}

type Client = { id: number; name: string; gscSiteUrl?: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUrlParams(): { type?: string; client?: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get("type") ?? undefined,
    client: params.get("client") ?? undefined,
  };
}

function makeDefaultSections(): Record<StrategyAreaId, SectionState> {
  const result = {} as Record<StrategyAreaId, SectionState>;
  for (const area of DEFAULT_STRATEGY_AREAS) {
    result[area.id] = {
      phase: "idle",
      amInput: "",
      questionAnswers: {},
      findings: area.mockFindings.map(body => makeFinding(area.id, area.label, body)),
      committed: false,
    };
  }
  return result;
}

function sectionStatus(state: SectionState): "idle" | "in-progress" | "committed" {
  if (state.committed) return "committed";
  if (state.phase !== "idle") return "in-progress";
  return "idle";
}

function committedCount(sections: Record<StrategyAreaId, SectionState>): number {
  return Object.values(sections).filter(s => s.committed).length;
}

// ─── Stepper header ───────────────────────────────────────────────────────────

function StepperHeader({ currentStep }: { currentStep: StepId }) {
  return (
    <div className="flex items-center flex-wrap gap-y-2 px-6 py-3 border-b bg-card/50 shrink-0">
      {STEPS.map((step, idx) => {
        const isDone = step.id < currentStep;
        const isActive = step.id === currentStep;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={[
                  "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors shrink-0",
                  isDone
                    ? "bg-[#1B3A6B] text-white"
                    : isActive
                    ? "bg-[#C0392B] text-white"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {isDone ? <Check className="w-3 h-3" /> : step.id}
              </div>
              <span
                className={[
                  "text-xs font-medium hidden sm:block",
                  isActive
                    ? "text-foreground"
                    : isDone
                    ? "text-[#1B3A6B] dark:text-blue-400"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={["mx-3 h-px w-6 shrink-0", isDone ? "bg-[#1B3A6B]/40" : "bg-border"].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Select Report Type ───────────────────────────────────────────────

function StepSelectType({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const allTypes = listReportTypes();
  const { getNote: getAdminNote, getValue: getConfigValue } = useConfigOverrides("reportType");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-bold text-foreground">Select Report Type</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Choose the type of report you are preparing.</p>
      </div>
      <ScrollArea className="flex-1 px-6 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pb-2">
          {allTypes.map(rt => {
            const isSelectable = rt.implemented;
            const isSelected = selected === rt.id;
            const color = familyColor(rt.family);
            return (
              <button
                key={rt.id}
                disabled={!isSelectable}
                onClick={() => isSelectable && onSelect(rt.id)}
                className={[
                  "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-100",
                  isSelected
                    ? "border-[#1B3A6B] bg-[#1B3A6B]/5 ring-1 ring-[#1B3A6B]/20"
                    : isSelectable
                    ? "border-border bg-card hover:border-[#1B3A6B]/30 hover:bg-muted/30 cursor-pointer"
                    : "border-border bg-card opacity-45 cursor-not-allowed",
                ].join(" ")}
                data-testid={`btn-report-type-${rt.id}`}
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
                  style={{ backgroundColor: `${color}12`, border: `1.5px solid ${color}25` }}
                >
                  {rt.family === "slideshow" ? (
                    <Monitor className="w-4 h-4" style={{ color }} />
                  ) : (
                    <FileText className="w-4 h-4" style={{ color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-foreground">{rt.displayName}</span>
                    {!rt.implemented && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Lock className="w-2 h-2" /> Phase 2
                      </span>
                    )}
                    {rt.audience === "internal" && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                        <User className="w-2 h-2" /> Internal
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {getConfigValue(rt.id, "description", rt.description)}
                  </p>
                  {(() => {
                    const adminNote = getAdminNote(rt.id);
                    return adminNote ? (
                      <p className="text-[10px] text-[#1B3A6B]/80 leading-relaxed mt-1 italic border-t border-[#1B3A6B]/15 pt-1">
                        {adminNote}
                      </p>
                    ) : null;
                  })()}
                </div>
                {isSelected && <Check className="w-4 h-4 text-[#1B3A6B] shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Step 2: Select Client ────────────────────────────────────────────────────

function StepSelectClient({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-bold text-foreground">Select Client</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Choose the client this report is for.</p>
      </div>
      <div className="px-6 pb-3 shrink-0">
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#1B3A6B]/30 placeholder:text-muted-foreground"
          data-testid="input-client-search"
        />
      </div>
      <ScrollArea className="flex-1 px-6 pb-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading clients…
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(client => (
              <button
                key={client.id}
                onClick={() => onSelect(client.id)}
                className={[
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-100",
                  selected === client.id
                    ? "border-[#1B3A6B] bg-[#1B3A6B]/5 ring-1 ring-[#1B3A6B]/20"
                    : "border-border bg-card hover:border-[#1B3A6B]/30 hover:bg-muted/30 cursor-pointer",
                ].join(" ")}
                data-testid={`btn-client-${client.id}`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0 text-xs font-bold text-muted-foreground">
                  {client.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground flex-1 truncate">{client.name}</span>
                {selected === client.id && <Check className="w-4 h-4 text-[#1B3A6B] shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No clients match your search.</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Step 3: Strategy Areas — section mini-flow ───────────────────────────────

function SectionMiniFlow({
  area,
  state,
  onChange,
  onOpenChat,
}: {
  area: typeof DEFAULT_STRATEGY_AREAS[number];
  state: SectionState;
  onChange: (next: Partial<SectionState>) => void;
  onOpenChat: (finding: Finding) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnalysis = useCallback(() => {
    onChange({ phase: "analyzing" });
    timerRef.current = setTimeout(() => {
      onChange({ phase: "questions" });
    }, 2200);
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (state.phase === "idle" || state.phase === "input") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold text-foreground mb-1">AM Context</p>
          <p className="text-xs text-muted-foreground mb-2">{area.inputPrompt}</p>
          <Textarea
            value={state.amInput}
            onChange={e => onChange({ amInput: e.target.value, phase: "input" })}
            placeholder="Share any observations, flags, or context before analysis begins…"
            className="min-h-[90px] text-sm resize-none"
            data-testid="textarea-am-input"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={startAnalysis}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white"
            data-testid="btn-start-analysis"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Analyze
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ phase: "questions" })}
            className="text-xs"
          >
            Skip to Questions
          </Button>
        </div>
      </div>
    );
  }

  if (state.phase === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#1B3A6B]/10">
          <Loader2 className="w-6 h-6 text-[#1B3A6B] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Analyzing {area.label}…</p>
          <p className="text-xs text-muted-foreground mt-1">Cross-referencing AM context with account data</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#1B3A6B]/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === "questions") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#1B3A6B]" />
          <p className="text-xs font-semibold text-foreground">Clarifying Questions</p>
          <span className="text-[10px] text-muted-foreground">Answer any that apply</span>
        </div>
        <div className="flex flex-col gap-3">
          {area.mockQuestions.map((q, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-xs text-foreground leading-snug">{q}</span>
              <input
                type="text"
                value={state.questionAnswers[i] ?? ""}
                onChange={e =>
                  onChange({ questionAnswers: { ...state.questionAnswers, [i]: e.target.value } })
                }
                placeholder="Optional — leave blank to skip"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1B3A6B]/30 placeholder:text-muted-foreground"
                data-testid={`input-question-${i}`}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => onChange({ phase: "findings" })}
          className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white self-start"
          data-testid="btn-to-findings"
        >
          View Findings <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    );
  }

  if (state.phase === "findings") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[#C0392B]" />
          <p className="text-xs font-semibold text-foreground">Findings & Recommendations</p>
          <span className="text-[10px] text-muted-foreground">Select what to include</span>
        </div>
        <div className="flex flex-col gap-2">
          {state.findings.map(finding => {
            const isRevised = finding.body !== finding.originalBody;
            return (
              <div
                key={finding.id}
                className={[
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all",
                  finding.selected
                    ? "border-[#1B3A6B]/40 bg-[#1B3A6B]/5"
                    : "border-border bg-card",
                  finding.status === "rejected" ? "opacity-50" : "",
                ].join(" ")}
                data-testid={`finding-card-${finding.id}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => {
                    onChange({
                      findings: state.findings.map(f =>
                        f.id === finding.id ? { ...f, selected: !f.selected } : f
                      ),
                    });
                  }}
                  className={[
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5",
                    finding.selected ? "border-[#1B3A6B] bg-[#1B3A6B]" : "border-border hover:border-[#1B3A6B]/50",
                  ].join(" ")}
                  data-testid={`btn-finding-${finding.id}`}
                >
                  {finding.selected && <Check className="w-2.5 h-2.5 text-white" />}
                </button>

                {/* Body + status */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{finding.body}</p>
                  {isRevised && (
                    <p className="text-[10px] text-muted-foreground line-through mt-0.5">{finding.originalBody}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {finding.status !== "draft" && (
                      <span className={[
                        "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        finding.status === "accepted" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                        finding.status === "rejected" ? "bg-red-500/10 text-[#C0392B]" :
                        "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      ].join(" ")}>
                        {finding.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chat button */}
                <button
                  onClick={() => onOpenChat(finding)}
                  className="shrink-0 text-muted-foreground hover:text-[#1B3A6B] transition-colors p-1 rounded"
                  title="Interrogate with AI"
                  data-testid={`btn-chat-finding-${finding.id}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => onChange({ phase: "committed", committed: true })}
            disabled={!state.findings.some(f => f.selected)}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white"
            data-testid="btn-commit-section"
          >
            <Check className="w-3.5 h-3.5 mr-1.5" />
            Commit ({state.findings.filter(f => f.selected).length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ phase: "questions" })}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Back to Questions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Section Committed</p>
        <p className="text-xs text-muted-foreground mt-1">
          {state.findings.filter(f => f.selected).length} finding{state.findings.filter(f => f.selected).length !== 1 ? "s" : ""} included
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ phase: "findings", committed: false })}
        className="text-xs"
      >
        <RotateCcw className="w-3 h-3 mr-1" /> Revise
      </Button>
    </div>
  );
}

function StepStrategyAreas({
  sections,
  activeSectionId,
  onActivate,
  onSectionChange,
  onOpenChat,
  reportTypeId,
}: {
  sections: Record<StrategyAreaId, SectionState>;
  activeSectionId: StrategyAreaId;
  onActivate: (id: StrategyAreaId) => void;
  onSectionChange: (id: StrategyAreaId, next: Partial<SectionState>) => void;
  onOpenChat: (finding: Finding) => void;
  reportTypeId?: string | null;
}) {
  // DIVERGENCE POINT (Step 3): replace getStrategyAreas() with getStrategyAreas(reportFamily)
  // when per-family section sets are needed. Section state keys are typed to DEFAULT_STRATEGY_AREAS ids.
  const areas = getStrategyAreas();
  const activeArea = areas.find(a => a.id === activeSectionId) ?? areas[0];
  const activeState = sections[activeArea.id];

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-52 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Strategy Areas
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {committedCount(sections)}/{areas.length} committed
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {areas.map(area => {
              const status = sectionStatus(sections[area.id]);
              const isActive = activeSectionId === area.id;
              return (
                <button
                  key={area.id}
                  onClick={() => onActivate(area.id)}
                  className={[
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left w-full transition-colors",
                    isActive
                      ? "bg-[#1B3A6B]/8 text-foreground"
                      : "hover:bg-muted/60 text-foreground",
                  ].join(" ")}
                  data-testid={`btn-section-${area.id}`}
                >
                  <div className="shrink-0">
                    {status === "committed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : status === "in-progress" ? (
                      <CircleDot className="w-3.5 h-3.5 text-[#C0392B]" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                    )}
                  </div>
                  <span className="text-xs font-medium leading-snug truncate">{area.label}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">{activeArea.label}</p>
            {(() => {
              const status = sectionStatus(activeState);
              if (status === "committed")
                return (
                  <Badge className="text-[9px] h-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0">
                    Committed
                  </Badge>
                );
              if (status === "in-progress")
                return (
                  <Badge className="text-[9px] h-4 bg-[#C0392B]/10 text-[#C0392B] border-0">
                    In Progress
                  </Badge>
                );
              return null;
            })()}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{activeArea.description}</p>
        </div>
        <GuidancePanel
          reportType={reportTypeId ?? null}
          workflowArea={areaIdToWorkflowGroup(activeSectionId)}
          sessionKey={`workflow-area-${activeSectionId}`}
        />
        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            <SectionMiniFlow
              area={activeArea}
              state={activeState}
              onChange={next => onSectionChange(activeArea.id, next)}
              onOpenChat={onOpenChat}
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Step 4: Findings Review ──────────────────────────────────────────────────

function StepFindingsReview({
  sections,
  onEdit,
  onOpenChat,
}: {
  sections: Record<StrategyAreaId, SectionState>;
  onEdit: (id: StrategyAreaId) => void;
  onOpenChat: (finding: Finding) => void;
}) {
  const committed = DEFAULT_STRATEGY_AREAS.filter(a => sections[a.id].committed);
  const skipped = DEFAULT_STRATEGY_AREAS.filter(a => !sections[a.id].committed);
  const totalFindings = committed.reduce(
    (acc, a) => acc + sections[a.id].findings.filter(f => f.selected).length,
    0,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-bold text-foreground">Findings Review</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {committed.length} section{committed.length !== 1 ? "s" : ""} committed · {totalFindings} total
          finding{totalFindings !== 1 ? "s" : ""} selected
        </p>
      </div>
      <ScrollArea className="flex-1 px-6 pb-4">
        {committed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No sections committed yet.</p>
            <p className="text-xs text-muted-foreground">
              Go back to Strategy Areas and commit at least one section.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {committed.map(area => {
              const state = sections[area.id];
              return (
                <div key={area.id} className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{area.label}</span>
                    </div>
                    <button
                      onClick={() => onEdit(area.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      data-testid={`btn-edit-section-${area.id}`}
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Edit
                    </button>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    {state.findings.filter(f => f.selected).map(finding => {
                      const isRevised = finding.body !== finding.originalBody;
                      return (
                        <div key={finding.id} className="flex items-start gap-2 group" data-testid={`review-finding-${finding.id}`}>
                          <div className={[
                            "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                            finding.status === "accepted" ? "bg-emerald-500" :
                            finding.status === "rejected" ? "bg-[#C0392B]" :
                            finding.status === "revised" ? "bg-amber-500" :
                            "bg-[#1B3A6B]",
                          ].join(" ")} />
                          <div className="flex-1 min-w-0">
                            <p className={[
                              "text-xs leading-relaxed",
                              finding.status === "rejected" ? "line-through text-muted-foreground" : "text-foreground",
                            ].join(" ")}>{finding.body}</p>
                            {isRevised && (
                              <p className="text-[10px] text-muted-foreground line-through">{finding.originalBody}</p>
                            )}
                            {finding.status !== "draft" && (
                              <span className={[
                                "inline-block text-[9px] font-semibold uppercase tracking-wide mt-0.5 px-1.5 py-0.5 rounded",
                                finding.status === "accepted" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                finding.status === "rejected" ? "bg-red-500/10 text-[#C0392B]" :
                                "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                              ].join(" ")}>
                                {finding.status}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => onOpenChat(finding)}
                            className="shrink-0 text-muted-foreground hover:text-[#1B3A6B] transition-colors p-1 rounded opacity-0 group-hover:opacity-100"
                            title="Interrogate with AI"
                            data-testid={`btn-review-chat-${finding.id}`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {state.amInput && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/40">
                        <p className="text-[10px] text-muted-foreground italic">
                          AM context: {state.amInput}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {skipped.length > 0 && (
              <div className="rounded-lg border border-dashed border-border px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Not Addressed
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {skipped.map(a => (
                    <span
                      key={a.id}
                      className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded"
                    >
                      {a.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Step 5: Assembly ─────────────────────────────────────────────────────────

function StepAssembly({
  reportType,
  clientName,
  sections,
}: {
  reportType: ReportTypeDefinition | null;
  clientName: string | null;
  sections: Record<StrategyAreaId, SectionState>;
}) {
  const [phase, setPhase] = useState<"building" | "ready">("building");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("ready"), 2400);
    return () => clearTimeout(timer);
  }, []);

  // DIVERGENCE POINT (Step 5): deck vs. document assembly could show different previews.
  // When ready, branch on reportType.family here to show slide-count estimate vs. page-count estimate.
  const committed = DEFAULT_STRATEGY_AREAS.filter(a => sections[a.id].committed);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-bold text-foreground">Report Assembly</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Mapping findings into the {reportType?.displayName ?? "report"} structure.
        </p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        {phase === "building" ? (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#1B3A6B]/10">
              <Loader2 className="w-7 h-7 text-[#1B3A6B] animate-spin" />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-sm font-semibold text-foreground">Building your report structure…</p>
              <p className="text-xs text-muted-foreground mt-1">
                Organizing committed findings into report sections
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-sm font-semibold text-foreground">Structure Ready</p>
              <p className="text-xs text-muted-foreground mt-1">
                {committed.length} strategy area{committed.length !== 1 ? "s" : ""} mapped to your{" "}
                {reportType?.displayName ?? "report"}
                {clientName ? ` for ${clientName}` : ""}.
              </p>
            </div>
            <div className="w-full max-w-md rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                What's included
              </p>
              <div className="flex flex-col gap-2">
                {committed.map(area => (
                  <div key={area.id} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs text-foreground">{area.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {sections[area.id].findings.filter(f => f.selected).length} finding
                      {sections[area.id].findings.filter(f => f.selected).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step 6: Preview & Export (handoff) ───────────────────────────────────────

function StepHandoff({
  reportType,
  clientName,
  clientId,
  sections,
}: {
  reportType: ReportTypeDefinition | null;
  clientName: string | null;
  clientId: number | null;
  sections: Record<StrategyAreaId, SectionState>;
}) {
  const color = reportType ? familyColor(reportType.family) : "#1B3A6B";

  useEffect(() => {
    if (!reportType || !clientId) return;
    const strategyAreas = getStrategyAreas(reportType.family);
    const committedAreas = (Object.entries(sections) as [StrategyAreaId, SectionState][])
      .filter(([, s]) => s.committed)
      .map(([areaId, s]) => {
        const areaDef = strategyAreas.find(a => a.id === areaId);
        return {
          areaId,
          areaLabel: areaDef?.label ?? areaId,
          amInput: s.amInput,
          findings: s.findings,
        };
      });
    saveWorkflowContext({
      reportTypeId: reportType.id,
      clientId,
      clientName: clientName ?? "",
      committedAreas,
    });
  }, []); 
  const baseRoute = reportType?.route ?? null;
  // Pass the selected client into the report builder so it can pre-select on load.
  // DIVERGENCE POINT (Step 6): deck reports may eventually open a slide preview instead.
  const route = baseRoute
    ? clientId
      ? `${baseRoute}?client=${clientId}`
      : baseRoute
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-bold text-foreground">Preview & Export</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Open the report builder to preview, edit, and export your{" "}
          {reportType?.displayName ?? "report"}.
        </p>
      </div>
      <GuidancePanel
        reportType={reportType?.id ?? null}
        sessionKey={`workflow-handoff-${reportType?.id ?? "none"}`}
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 pb-4 overflow-y-auto">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl"
          style={{ backgroundColor: `${color}12`, border: `2px solid ${color}20` }}
        >
          {reportType?.family === "slideshow" ? (
            <Monitor className="w-7 h-7" style={{ color }} />
          ) : (
            <FileText className="w-7 h-7" style={{ color }} />
          )}
        </div>

        <div className="text-center max-w-sm">
          <p className="text-sm font-semibold text-foreground">
            {reportType?.displayName ?? "Report"} — ready to build
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {clientName ? `For ${clientName}. ` : ""}Open the report builder to generate, review, and export.
            {clientName ? " Your selected client will be pre-loaded." : ""}
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          {route ? (
            <a href={route} target="_blank" rel="noopener noreferrer">
              <Button
                className="w-full"
                style={{ backgroundColor: color }}
                data-testid="btn-open-report-builder"
              >
                Open Report Builder
                <ExternalLink className="w-3.5 h-3.5 ml-2" />
              </Button>
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                This report type doesn't have a full builder yet. It's coming in Phase 2.
              </p>
            </div>
          )}
          <a href="/reports">
            <Button
              variant="outline"
              className="w-full text-xs"
              data-testid="btn-view-past-reports"
            >
              View Past Reports
              <ArrowRight className="w-3.5 h-3.5 ml-2" />
            </Button>
          </a>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 max-w-sm w-full">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Coming in a future sprint: </span>
            Strategy findings committed in this workflow will pre-populate the report builder's section
            inputs, reducing manual entry. For now, use your committed findings as reference while
            building in the editor.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const [, setLocation] = useLocation();
  const urlParams = getUrlParams();

  const [state, setState] = useState<WorkflowState>(() => {
    const initialStep: StepId = urlParams.type ? (urlParams.client ? 3 : 2) : 1;
    return {
      step: initialStep,
      reportTypeId: urlParams.type ?? null,
      clientId: urlParams.client ? parseInt(urlParams.client, 10) : null,
      activeSectionId: DEFAULT_STRATEGY_AREAS[0].id,
      sections: makeDefaultSections(),
      chatFinding: null,
    };
  });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const reportType = state.reportTypeId ? (getReportDefinition(state.reportTypeId) ?? null) : null;
  const selectedClient = clients.find(c => c.id === state.clientId) ?? null;
  const numCommitted = committedCount(state.sections);

  const canAdvance =
    state.step === 1
      ? state.reportTypeId !== null
      : state.step === 2
      ? state.clientId !== null
      : state.step === 3
      ? numCommitted >= 1
      : true;

  const isLastStep = state.step === STEPS.length;

  const goNext = useCallback(() => {
    setState(s => ({ ...s, step: Math.min(s.step + 1, STEPS.length) as StepId, chatFinding: null }));
  }, []);

  const goBack = useCallback(() => {
    setState(s => ({ ...s, step: Math.max(s.step - 1, 1) as StepId, chatFinding: null }));
  }, []);

  const onSectionChange = useCallback((id: StrategyAreaId, next: Partial<SectionState>) => {
    setState(s => ({
      ...s,
      sections: { ...s.sections, [id]: { ...s.sections[id], ...next } },
    }));
  }, []);

  const onEditSection = useCallback((id: StrategyAreaId) => {
    setState(s => ({ ...s, step: 3, activeSectionId: id }));
  }, []);

  const onOpenChatFinding = useCallback((finding: Finding) => {
    setState(s => ({ ...s, chatFinding: finding }));
  }, []);

  const onCloseChatFinding = useCallback(() => {
    setState(s => ({ ...s, chatFinding: null }));
  }, []);

  const onCommitFindingRevision = useCallback((finding: Finding, newBody: string, status: FindingStatus) => {
    setState(s => {
      const areaId = finding.areaId as StrategyAreaId;
      const section = s.sections[areaId];
      if (!section) return { ...s, chatFinding: null };
      return {
        ...s,
        chatFinding: null,
        sections: {
          ...s.sections,
          [areaId]: {
            ...section,
            findings: section.findings.map(f =>
              f.id === finding.id ? { ...f, body: newBody, status } : f
            ),
          },
        },
      };
    });
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background" data-testid="page-workflow">
      <StepperHeader currentStep={state.step} />

      <div className="flex-1 min-h-0 overflow-hidden">
        {state.step === 1 && (
          <StepSelectType
            selected={state.reportTypeId}
            onSelect={id =>
              setState(s => ({
                ...s,
                reportTypeId: id,
                sections: makeDefaultSections(),
                chatFinding: null,
              }))
            }
          />
        )}
        {state.step === 2 && (
          <StepSelectClient
            selected={state.clientId}
            onSelect={id =>
              setState(s => ({
                ...s,
                clientId: id,
                sections: makeDefaultSections(),
                chatFinding: null,
              }))
            }
          />
        )}
        {state.step === 3 && (
          <StepStrategyAreas
            sections={state.sections}
            activeSectionId={state.activeSectionId}
            onActivate={id => setState(s => ({ ...s, activeSectionId: id }))}
            onSectionChange={onSectionChange}
            onOpenChat={onOpenChatFinding}
            reportTypeId={state.reportTypeId ?? null}
          />
        )}
        {state.step === 4 && (
          <StepFindingsReview
            sections={state.sections}
            onEdit={onEditSection}
            onOpenChat={onOpenChatFinding}
          />
        )}
        {state.step === 5 && (
          <StepAssembly
            reportType={reportType}
            clientName={selectedClient?.name ?? null}
            sections={state.sections}
          />
        )}
        {state.step === 6 && (
          <StepHandoff
            reportType={reportType}
            clientName={selectedClient?.name ?? null}
            clientId={state.clientId}
            sections={state.sections}
          />
        )}
      </div>

      {/* Finding AI chat panel — portal-style fixed overlay */}
      {state.chatFinding && (
        <FindingChatPanel
          finding={state.chatFinding}
          onClose={onCloseChatFinding}
          onCommit={(newBody, status) => onCommitFindingRevision(state.chatFinding!, newBody, status)}
        />
      )}

      <div className="flex items-center justify-between px-6 py-3 border-t bg-card/40 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={goBack}
          disabled={state.step === 1}
          data-testid="btn-workflow-back"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-1" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Step {state.step} of {STEPS.length}
          </span>
          {state.step === 3 && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              · {numCommitted}/{DEFAULT_STRATEGY_AREAS.length} committed
            </span>
          )}
          {!canAdvance && state.step === 1 && (
            <span className="text-[10px] text-muted-foreground">Select a report type to continue</span>
          )}
          {!canAdvance && state.step === 2 && (
            <span className="text-[10px] text-muted-foreground">Select a client to continue</span>
          )}
          {!canAdvance && state.step === 3 && (
            <span className="text-[10px] text-muted-foreground">Commit at least one section</span>
          )}
        </div>

        <Button
          size="sm"
          onClick={isLastStep ? () => setLocation("/command-center") : goNext}
          disabled={!canAdvance}
          className={
            isLastStep
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white"
          }
          data-testid="btn-workflow-next"
        >
          {isLastStep ? "Done" : "Next"}
          {!isLastStep && <ChevronRight className="w-3.5 h-3.5 ml-1" />}
        </Button>
      </div>
    </div>
  );
}
