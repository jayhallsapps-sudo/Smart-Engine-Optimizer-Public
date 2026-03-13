import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Loader2,
  RotateCcw,
  Check,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  MessageSquare,
  ShieldAlert,
  BarChart2,
  Link2,
  Search,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { findingShortLabel } from "@/lib/findingTypes";
import type { Finding, FindingStatus, FindingChatMessage } from "@/lib/findingTypes";
import {
  BUCKET_LABELS,
  BUCKET_BADGE_COLORS,
  BUCKET_DOT_COLORS,
  BUCKET_SCORES,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_CHIP_COLORS,
  EXECUTION_STATUS_DOT_COLORS,
  getExecutionStatusHint,
  type PriorityBucket,
  type PriorityOverride,
  type ExecutionStatus,
  type ExecutionContext,
  type ExecutionRef,
} from "@/lib/priorityEngine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Quick actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    id: "why",
    label: "Why did this surface?",
    prompt: "Why did this finding surface? What signals or data patterns typically indicate this issue?",
  },
  {
    id: "strengthen",
    label: "Strengthen it",
    prompt: "What additional data or evidence would make this recommendation stronger? What specifics should I look for?",
  },
  {
    id: "rewrite",
    label: "Rewrite clearly",
    prompt: "Rewrite this finding to be clearer and more actionable. Suggest an improved version.",
  },
  {
    id: "concise",
    label: "Make concise",
    prompt: "Make this finding more concise — same meaning, fewer words. Suggest a tightened version.",
  },
  {
    id: "client_facing",
    label: "Client-facing",
    prompt: "Rewrite this finding in language suitable for direct client delivery — clear, jargon-light, and benefit-oriented. Suggest an improved version.",
  },
  {
    id: "strategic",
    label: "Strategic lens",
    prompt: "Reframe this finding from an internal strategic perspective — what does it mean for the account direction and AM positioning? Suggest a version.",
  },
  {
    id: "defend",
    label: "Defend it",
    prompt: "Why does this finding matter? How would you pitch its importance to a skeptical client or AM? Give me the strongest case.",
  },
  {
    id: "uncertainty",
    label: "Flag uncertainty",
    prompt: "This finding may need more evidence before committing. Reframe it to clearly signal it needs validation before acting. Suggest a version.",
  },
  {
    id: "cautious",
    label: "Make cautious",
    prompt: "Rewrite this as a more cautious, conditional recommendation. Suggest an improved version.",
  },
  {
    id: "direct",
    label: "Make direct",
    prompt: "Rewrite this as a more direct, decisive recommendation with a clear action. Suggest an improved version.",
  },
] as const;

// ─── Status display ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<FindingStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border/50",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-400/20",
  rejected: "bg-red-500/10 text-[#C0392B] border-red-300/30",
  revised: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/20",
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  draft: "Draft",
  accepted: "Accepted",
  rejected: "Rejected",
  revised: "Revised",
};

const CONFIDENCE_COLORS = {
  low: "text-[#C0392B] border-red-300/40 bg-red-500/5",
  medium: "text-amber-600 border-amber-400/40 bg-amber-500/5",
  high: "text-emerald-600 border-emerald-400/40 bg-emerald-500/5",
};

// ─── Execution ref source metadata ───────────────────────────────────────────
const REF_SOURCE_LABELS: Record<ExecutionRef["type"], string> = {
  asana:   "Asana",
  airtable: "Airtable",
  manual:  "Manual",
};

const REF_SOURCE_COLORS: Record<ExecutionRef["type"], string> = {
  asana:   "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-400/25",
  airtable: "text-purple-600 dark:text-purple-400 bg-purple-500/8 border-purple-400/25",
  manual:  "text-muted-foreground bg-muted border-border/50",
};

// ─── ExecutionRefPicker ───────────────────────────────────────────────────────
// Inline search-and-select component for linking a finding to a real work item.

interface ExecutionRefPickerProps {
  allRefs: ExecutionRef[];
  refsStatus: "idle" | "loading" | "loaded" | "error";
  selectedRef: ExecutionRef | null;
  legacyRef: string;
  onSelectRef: (ref: ExecutionRef | null) => void;
  onLegacyChange: (text: string) => void;
  onLoadRefs: () => void;
}

function ExecutionRefPicker({
  allRefs,
  refsStatus,
  selectedRef,
  legacyRef,
  onSelectRef,
  onLegacyChange,
  onLoadRefs,
}: ExecutionRefPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = allRefs.filter(r =>
    r.title.toLowerCase().includes(searchText.toLowerCase())
  ).slice(0, 8);

  const showManualOption = searchText.trim().length > 0;

  const allDropdownItems = [
    ...filtered,
    ...(showManualOption ? [{ type: "manual" as const, ref: searchText, title: searchText }] : []),
  ];

  function handleFocus() {
    setIsOpen(true);
    if (refsStatus === "idle") onLoadRefs();
  }

  function handleSelect(ref: ExecutionRef) {
    if (ref.type === "manual") {
      onSelectRef(null);
      onLegacyChange(ref.title);
      setSearchText(ref.title);
    } else {
      onSelectRef(ref);
      onLegacyChange("");
      setSearchText("");
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, allDropdownItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && allDropdownItems[highlightedIndex]) {
        handleSelect(allDropdownItems[highlightedIndex]);
      } else if (searchText.trim()) {
        handleSelect({ type: "manual", ref: searchText.trim(), title: searchText.trim() });
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Linked state — show the selected ref with unlink button.
  if (selectedRef && selectedRef.type !== "manual") {
    return (
      <div
        className="mt-2 flex items-center gap-2 rounded border border-border bg-background px-2.5 py-1.5"
        data-testid="execution-ref-linked"
      >
        <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
        <span
          className={`text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded border ${REF_SOURCE_COLORS[selectedRef.type]}`}
          data-testid="execution-ref-source-badge"
        >
          {REF_SOURCE_LABELS[selectedRef.type]}
        </span>
        <span className="flex-1 text-[11px] text-foreground truncate" data-testid="execution-ref-title">
          {selectedRef.title}
        </span>
        {selectedRef.url && (
          <a
            href={selectedRef.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            data-testid="execution-ref-external-link"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={() => { onSelectRef(null); setSearchText(""); }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-0.5"
          data-testid="btn-unlink-ref"
          title="Unlink task"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Manual legacy ref display.
  if (!selectedRef && legacyRef && !searchText) {
    return (
      <div
        className="mt-2 flex items-center gap-2 rounded border border-border bg-background px-2.5 py-1.5"
        data-testid="execution-ref-manual"
      >
        <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="flex-1 text-[11px] text-foreground truncate">{legacyRef}</span>
        <span className="text-[9px] text-muted-foreground italic">(manual)</span>
        <button
          onClick={() => { onLegacyChange(""); setSearchText(""); setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          data-testid="btn-clear-manual-ref"
          title="Clear manual ref"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Search input + dropdown.
  return (
    <div className="mt-2 relative">
      <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1">
        {refsStatus === "loading"
          ? <Loader2 className="w-3 h-3 text-muted-foreground shrink-0 animate-spin" />
          : <Search className="w-3 h-3 text-muted-foreground shrink-0" />
        }
        <input
          ref={inputRef}
          data-testid="input-execution-ref"
          type="text"
          value={searchText}
          onChange={e => { setSearchText(e.target.value); setHighlightedIndex(-1); }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={
            refsStatus === "loaded" && allRefs.length === 0
              ? "No tasks found — type to add manual ref…"
              : "Search Asana / Airtable tasks…"
          }
          className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>

      {isOpen && (allDropdownItems.length > 0 || refsStatus === "loading") && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          data-testid="execution-ref-dropdown"
        >
          {refsStatus === "loading" && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading tasks…
            </div>
          )}
          {refsStatus !== "loading" && allDropdownItems.map((item, idx) => {
            const isManual = item.type === "manual";
            const isHighlighted = idx === highlightedIndex;
            return (
              <button
                key={`${item.type}-${item.ref}`}
                className={[
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
                  isHighlighted ? "bg-[#1B3A6B]/8 text-foreground" : "hover:bg-muted/50 text-foreground",
                ].join(" ")}
                data-testid={`execution-ref-option-${idx}`}
                onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {isManual
                  ? <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <span className={`text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded border shrink-0 ${REF_SOURCE_COLORS[item.type]}`}>
                      {REF_SOURCE_LABELS[item.type]}
                    </span>
                }
                <span className="text-[11px] truncate flex-1">
                  {isManual ? `Use "${item.title}" as manual ref` : item.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// All selectable execution statuses in display order.
const EXECUTION_STATUS_OPTIONS: ExecutionStatus[] = [
  "not_tracked",
  "proposed",
  "planned",
  "in_progress",
  "blocked",
  "deferred",
  "completed",
];

interface FindingChatPanelProps {
  finding: Finding;
  onClose: () => void;
  onCommit: (newBody: string, status: FindingStatus) => void;
  /** Called when the AM sets or clears a manual priority override. */
  onOverride: (override: PriorityOverride | null) => void;
  /** Called when the AM updates the execution context. Pass null to clear. */
  onUpdateExecution: (ctx: ExecutionContext | null) => void;
  /** Client ID — enables live Asana/Airtable ref lookup. Optional for backward compat. */
  clientId?: number | null;
}

// All selectable buckets in display order for the override picker.
const BUCKET_OPTIONS: PriorityBucket[] = [
  "must_do_now",
  "should_do_next",
  "worth_doing_later",
  "deprioritize",
];

export function FindingChatPanel({ finding, onClose, onCommit, onOverride, onUpdateExecution, clientId }: FindingChatPanelProps) {
  const currentBody = finding.body;
  const shortTitle = findingShortLabel(finding.body);

  const [messages, setMessages] = useState<FindingChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Local override state — mirrors the finding's current override (if any) ──
  const [overrideBucket, setOverrideBucket] = useState<PriorityBucket | "">(
    finding.priorityOverride?.bucket ?? "",
  );
  const [overrideReason, setOverrideReason] = useState<string>(
    finding.priorityOverride?.reason ?? "",
  );

  // ── Local execution state — mirrors the finding's current execution context ──
  const [execStatus, setExecStatus] = useState<ExecutionStatus>(
    finding.executionContext?.status ?? "not_tracked",
  );
  const [execNote, setExecNote] = useState<string>(
    finding.executionContext?.note ?? "",
  );
  // Legacy free-text ref (pre-linkedRefData sessions).
  const [execRef, setExecRef] = useState<string>(
    finding.executionContext?.linkedRef ?? "",
  );
  // Structured ref — set when AM picks from Asana/Airtable picker.
  const [execRefData, setExecRefData] = useState<ExecutionRef | null>(
    finding.executionContext?.linkedRefData ?? null,
  );

  // ── Execution refs fetch state (per-panel, lazy-loaded on first picker focus) ──
  const [allRefs, setAllRefs] = useState<ExecutionRef[]>([]);
  const [refsStatus, setRefsStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const loadRefs = useCallback(async () => {
    if (!clientId || refsStatus !== "idle") return;
    setRefsStatus("loading");
    try {
      const res = await apiRequest("GET", `/api/clients/${clientId}/execution-refs`);
      const data = await res.json() as { asana: ExecutionRef[]; airtable: ExecutionRef[] };
      setAllRefs([...data.asana, ...data.airtable]);
      setRefsStatus("loaded");
    } catch {
      setRefsStatus("error");
      setAllRefs([]);
    }
  }, [clientId, refsStatus]);

  // Sync all local state if the finding prop changes (AM opened a different finding).
  useEffect(() => {
    setOverrideBucket(finding.priorityOverride?.bucket ?? "");
    setOverrideReason(finding.priorityOverride?.reason ?? "");
    setExecStatus(finding.executionContext?.status ?? "not_tracked");
    setExecNote(finding.executionContext?.note ?? "");
    setExecRef(finding.executionContext?.linkedRef ?? "");
    setExecRefData(finding.executionContext?.linkedRefData ?? null);
  }, [finding.id]);

  function applyOverride(bucket: PriorityBucket, reason: string) {
    onOverride({ bucket, reason: reason.trim() || undefined, overriddenAt: Date.now() });
  }

  function clearOverride() {
    setOverrideBucket("");
    setOverrideReason("");
    onOverride(null);
  }

  function applyExecution(status: ExecutionStatus, note: string, ref: string, refData: ExecutionRef | null) {
    if (status === "not_tracked" && !note.trim() && !ref.trim() && !refData) {
      onUpdateExecution(null);
    } else {
      const prevCtx = finding.executionContext;
      const deferCount =
        status === "deferred"
          ? (prevCtx?.status === "deferred" ? (prevCtx.deferCount ?? 1) + 1 : 1)
          : prevCtx?.deferCount;
      onUpdateExecution({
        status,
        note: note.trim() || undefined,
        // When a structured ref is set, legacy linkedRef is cleared.
        linkedRef: refData ? undefined : (ref.trim() || undefined),
        linkedRefData: refData ?? undefined,
        deferCount,
        updatedAt: Date.now(),
      });
    }
  }

  function clearExecution() {
    setExecStatus("not_tracked");
    setExecNote("");
    setExecRef("");
    setExecRefData(null);
    onUpdateExecution(null);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function sendMessage(userMessage: string) {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: FindingChatMessage = {
      role: "user",
      content: userMessage.trim(),
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Send the full finding object — route extracts what it needs.
      // pendingRevision is used as the "current body" if a draft revision is in flight.
      const activeFinding: Finding = pendingRevision
        ? { ...finding, body: pendingRevision }
        : finding;

      const res = await apiRequest("POST", "/api/workflow/finding-chat", {
        finding: activeFinding,
        messages: nextMessages,
      });
      const data = await res.json();
      const assistantMsg: FindingChatMessage = {
        role: "assistant",
        content: data.reply,
        suggestedRevision: data.suggestedRevision ?? undefined,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (data.suggestedRevision && !pendingRevision) {
        setPendingRevision(data.suggestedRevision);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Couldn't reach the analyst. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const displayStatus: FindingStatus = pendingRevision ? "revised" : finding.status;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="finding-chat-panel">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close chat panel"
      />

      {/* Panel */}
      <div className="w-full max-w-[480px] h-full bg-background border-l border-border flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div className="flex flex-col gap-1.5 pr-3 min-w-0">
            {/* Identity row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#1B3A6B]" />
                <span className="text-xs font-semibold text-foreground">Finding Analysis</span>
              </div>
              <Badge
                className={`text-[9px] h-4 px-1.5 border ${STATUS_COLORS[displayStatus]}`}
                data-testid="finding-status-badge"
              >
                {STATUS_LABELS[displayStatus]}
              </Badge>
              {finding.confidence && (
                <Badge
                  className={`text-[9px] h-4 px-1.5 border ${CONFIDENCE_COLORS[finding.confidence]}`}
                  data-testid="finding-confidence-badge"
                >
                  {finding.confidence} confidence
                </Badge>
              )}
              {finding.priority && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-help ${BUCKET_BADGE_COLORS[finding.priority.bucket]}`}
                        data-testid="finding-priority-badge"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${BUCKET_DOT_COLORS[finding.priority.bucket]}`} />
                        {BUCKET_LABELS[finding.priority.bucket]}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[240px] text-[11px] leading-relaxed z-[9999]"
                      data-testid="finding-priority-tooltip"
                    >
                      <p className="font-semibold mb-1">
                        {BUCKET_LABELS[finding.priority.bucket]} · score {finding.priority.score.toFixed(1)}/10
                      </p>
                      <p className="text-muted-foreground leading-snug text-[10px]">{finding.priority.rationale}</p>
                      {finding.priority.signals.length > 0 && (
                        <p className="text-muted-foreground/80 mt-1 text-[10px]">
                          Signals: {finding.priority.signals.join(", ")}
                        </p>
                      )}
                      <p className="text-muted-foreground/60 mt-1 text-[10px] italic">
                        First-pass heuristic — human judgment takes precedence.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {/* Area breadcrumb */}
            <Badge
              className="text-[9px] h-4 w-fit bg-[#1B3A6B]/8 text-[#1B3A6B] dark:text-blue-300 border border-[#1B3A6B]/15"
              data-testid="finding-area-badge"
            >
              {finding.areaLabel}
            </Badge>
            {/* Short finding title */}
            <p
              className="text-[11px] font-medium text-foreground/70 leading-snug mt-0.5 line-clamp-2"
              data-testid="finding-short-title"
              title={finding.body}
            >
              {shortTitle}
            </p>
          </div>
          <button
            data-testid="finding-chat-close"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Finding body card ── */}
        <div className="px-5 pt-4 shrink-0 space-y-2">
          <div
            className={[
              "rounded-lg border px-3.5 py-3 transition-colors",
              pendingRevision
                ? "border-amber-400/40 bg-amber-500/5"
                : "border-border bg-muted/30",
            ].join(" ")}
          >
            {pendingRevision && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Pending revision
                </span>
              </div>
            )}
            <p className="text-xs text-foreground leading-relaxed" data-testid="finding-current-body">
              {pendingRevision ?? currentBody}
            </p>
            {pendingRevision && (
              <div className="mt-2.5 pt-2 border-t border-amber-400/20">
                <p className="text-[10px] text-muted-foreground line-through leading-relaxed">
                  {currentBody}
                </p>
              </div>
            )}
          </div>

          {/* Evidence hint — shown if evidence is populated; slot renders for future wiring */}
          {finding.evidence ? (
            <div
              className="flex items-start gap-2 rounded border border-[#1B3A6B]/15 bg-[#1B3A6B]/4 px-3 py-2"
              data-testid="finding-evidence-block"
            >
              <BarChart2 className="w-3 h-3 text-[#1B3A6B] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#1B3A6B]/80 leading-relaxed">{finding.evidence}</p>
            </div>
          ) : null}

          {/* Uncertainty indicator — shown when confidence is low */}
          {finding.confidence === "low" && (
            <div
              className="flex items-center gap-1.5 rounded border border-[#C0392B]/20 bg-red-500/5 px-3 py-1.5"
              data-testid="finding-low-confidence-banner"
            >
              <ShieldAlert className="w-3 h-3 text-[#C0392B] shrink-0" />
              <p className="text-[10px] text-[#C0392B]">
                Low confidence — validate the underlying data before committing.
              </p>
            </div>
          )}

          {/* Revision actions */}
          {pendingRevision && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => onCommit(pendingRevision, "revised")}
                data-testid="btn-accept-revision"
              >
                <Check className="w-3 h-3" /> Accept revision
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => setPendingRevision(null)}
                data-testid="btn-discard-revision"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Discard
              </Button>
            </div>
          )}
        </div>

        {/* ── Priority override section ── */}
        {finding.priority && (
          <div
            className="mx-5 mt-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3"
            data-testid="priority-override-section"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Priority signal
              </p>
              <div className="flex items-center gap-1.5">
                {finding.priorityOverride ? (
                  <>
                    <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                      Adjusted
                    </span>
                    <button
                      data-testid="btn-reset-priority"
                      onClick={clearOverride}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                      Reset to auto
                    </button>
                  </>
                ) : (
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                    System
                  </span>
                )}
              </div>
            </div>

            {/* Heuristic reference (always shown for context) */}
            {finding.priorityOverride && finding.priority && (
              <p className="text-[10px] text-muted-foreground mb-2">
                Auto-scored: <span className="font-medium">{BUCKET_LABELS[finding.priority.bucket]}</span>
                {" "}· {finding.priority.score.toFixed(1)}/10
              </p>
            )}

            {/* Bucket picker */}
            <Select
              value={overrideBucket}
              onValueChange={(val) => {
                const bucket = val as PriorityBucket;
                setOverrideBucket(bucket);
                applyOverride(bucket, overrideReason);
              }}
            >
              <SelectTrigger
                className="h-7 text-[11px] w-full"
                data-testid="select-priority-override"
              >
                <SelectValue placeholder="Override priority…" />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_OPTIONS.map(b => (
                  <SelectItem key={b} value={b} className="text-[11px]">
                    <span className={`inline-flex items-center gap-1.5`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${BUCKET_DOT_COLORS[b]}`} />
                      {BUCKET_LABELS[b]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Optional reason — shown when a bucket is selected */}
            {overrideBucket && (
              <input
                data-testid="input-priority-reason"
                type="text"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                onBlur={() => overrideBucket && applyOverride(overrideBucket, overrideReason)}
                onKeyDown={e => {
                  if (e.key === "Enter" && overrideBucket) {
                    applyOverride(overrideBucket, overrideReason);
                  }
                }}
                placeholder="Reason (optional)…"
                className="mt-2 w-full rounded border border-border bg-background text-[11px] text-foreground px-2 py-1 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40"
              />
            )}
          </div>
        )}

        {/* ── Execution context section ── */}
        <div
          className="mx-5 mt-2 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3"
          data-testid="execution-context-section"
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Execution status
            </p>
            <div className="flex items-center gap-1.5">
              {finding.executionContext && finding.executionContext.status !== "not_tracked" ? (
                <>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide ${EXECUTION_STATUS_CHIP_COLORS[finding.executionContext.status].split(" ")[0]}`}>
                    {EXECUTION_STATUS_LABELS[finding.executionContext.status]}
                  </span>
                  <button
                    data-testid="btn-clear-execution"
                    onClick={clearExecution}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Not set
                </span>
              )}
            </div>
          </div>

          {/* Status picker */}
          <Select
            value={execStatus}
            onValueChange={(val) => {
              const status = val as ExecutionStatus;
              setExecStatus(status);
              applyExecution(status, execNote, execRef, execRefData);
            }}
          >
            <SelectTrigger
              className="h-7 text-[11px] w-full"
              data-testid="select-execution-status"
            >
              <SelectValue placeholder="Set execution status…" />
            </SelectTrigger>
            <SelectContent>
              {EXECUTION_STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s} className="text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${EXECUTION_STATUS_DOT_COLORS[s]}`} />
                    {EXECUTION_STATUS_LABELS[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Note + linked ref — shown when a meaningful status is set */}
          {execStatus !== "not_tracked" && (
            <>
              <input
                data-testid="input-execution-note"
                type="text"
                value={execNote}
                onChange={e => setExecNote(e.target.value)}
                onBlur={() => applyExecution(execStatus, execNote, execRef, execRefData)}
                onKeyDown={e => { if (e.key === "Enter") applyExecution(execStatus, execNote, execRef, execRefData); }}
                placeholder="Note (optional)…"
                className="mt-2 w-full rounded border border-border bg-background text-[11px] text-foreground px-2 py-1 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]/40"
              />
              {/* Ref picker — replaces the old free-text input */}
              <ExecutionRefPicker
                allRefs={allRefs}
                refsStatus={refsStatus}
                selectedRef={execRefData}
                legacyRef={execRef}
                onSelectRef={(ref) => {
                  setExecRefData(ref);
                  if (ref) setExecRef("");
                  applyExecution(execStatus, execNote, ref ? "" : execRef, ref);
                }}
                onLegacyChange={(text) => {
                  setExecRef(text);
                  applyExecution(execStatus, execNote, text, null);
                }}
                onLoadRefs={loadRefs}
              />
              {/* Link confidence indicator */}
              <p className="mt-1.5 text-[9px] text-muted-foreground/60 leading-relaxed flex items-center gap-1">
                {execRefData && execRefData.type !== "manual" ? (
                  <>
                    <Link2 className="w-2.5 h-2.5 shrink-0" />
                    Linked to a real {REF_SOURCE_LABELS[execRefData.type]} task — execution is grounded.
                  </>
                ) : execRef ? (
                  <>
                    <Pencil className="w-2.5 h-2.5 shrink-0" />
                    Manual reference — not linked to a real task.
                  </>
                ) : clientId ? (
                  <>
                    <Search className="w-2.5 h-2.5 shrink-0" />
                    Search to link a real Asana or Airtable task.
                  </>
                ) : null}
              </p>
            </>
          )}

          {/* Deferred recurrence escalation hint */}
          {execStatus === "deferred" && finding.executionContext?.deferCount !== undefined && finding.executionContext.deferCount >= 2 && (
            <p className="mt-2 text-[10px] text-orange-500 dark:text-orange-400">
              {getExecutionStatusHint(finding.executionContext)}
            </p>
          )}
        </div>

        {/* ── Quick actions — shown only until first message ── */}
        {messages.length === 0 && !isLoading && (
          <div className="px-5 pt-3 shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Quick actions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.id}
                  data-testid={`quick-action-${qa.id}`}
                  onClick={() => sendMessage(qa.prompt)}
                  className="text-[11px] rounded-full border border-border px-2.5 py-1 text-foreground hover:border-[#1B3A6B]/40 hover:bg-[#1B3A6B]/5 transition-colors"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages area ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center pb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                Use a quick action above or ask a question to interrogate this finding.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={["flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start"].join(" ")}
            >
              <div
                className={[
                  "max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-[#1B3A6B] text-white rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm border border-border/50",
                ].join(" ")}
              >
                {msg.content}
              </div>

              {/* Inline revision adoption */}
              {msg.role === "assistant" && msg.suggestedRevision && !pendingRevision && (
                <button
                  className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline ml-1 mt-0.5"
                  onClick={() => setPendingRevision(msg.suggestedRevision!)}
                  data-testid="btn-use-revision"
                >
                  <ChevronRight className="w-3 h-3" />
                  Use this revision
                </button>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2">
              <div className="bg-muted border border-border/50 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                Analyzing…
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ── */}
        <div className="px-5 pb-4 pt-2 border-t shrink-0 space-y-2">
          <div className="flex gap-2">
            <Textarea
              data-testid="finding-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about this finding… (Enter to send)"
              className="min-h-[56px] text-xs resize-none"
              disabled={isLoading}
            />
            <Button
              data-testid="finding-chat-send"
              size="sm"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-auto px-3 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white shrink-0 self-end"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Commit row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] text-emerald-700 dark:text-emerald-400 border-emerald-400/40 hover:bg-emerald-500/5"
              onClick={() => onCommit(pendingRevision ?? currentBody, "accepted")}
              data-testid="btn-accept-finding"
            >
              <Check className="w-3 h-3 mr-1" /> Accept finding
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] text-[#C0392B] border-red-300/40 hover:bg-red-500/5"
              onClick={() => onCommit(currentBody, "rejected")}
              data-testid="btn-reject-finding"
            >
              <AlertTriangle className="w-3 h-3 mr-1" /> Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground ml-auto"
              onClick={onClose}
              data-testid="btn-close-finding-chat"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
