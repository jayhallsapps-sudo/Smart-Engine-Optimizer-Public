import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import type { Finding, FindingStatus, FindingChatMessage } from "@/lib/findingTypes";

// ─── Quick action definitions ─────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    id: "why",
    label: "Why did this surface?",
    prompt:
      "Why did this finding surface? What signals or data patterns typically indicate this issue?",
  },
  {
    id: "strengthen",
    label: "Strengthen it",
    prompt:
      "What additional data or evidence would make this recommendation stronger? What specifics should I look for?",
  },
  {
    id: "rewrite",
    label: "Rewrite clearly",
    prompt: "Rewrite this finding to be clearer and more actionable. Suggest an improved version.",
  },
  {
    id: "cautious",
    label: "Make cautious",
    prompt:
      "Rewrite this as a more cautious, conditional recommendation. Suggest an improved version.",
  },
  {
    id: "direct",
    label: "Make direct",
    prompt:
      "Rewrite this as a more direct, decisive recommendation with a clear action. Suggest an improved version.",
  },
] as const;

// ─── Status display helpers ───────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────────

interface FindingChatPanelProps {
  finding: Finding;
  onClose: () => void;
  onCommit: (newBody: string, status: FindingStatus) => void;
}

export function FindingChatPanel({ finding, onClose, onCommit }: FindingChatPanelProps) {
  // finding.body is always the current text (originalBody unless already revised in state)
  const currentBody = finding.body;

  const [messages, setMessages] = useState<FindingChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Close on Escape
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
      const res = await apiRequest("POST", "/api/workflow/finding-chat", {
        findingId: finding.id,
        findingBody: pendingRevision ?? currentBody,
        areaId: finding.areaId,
        areaLabel: finding.areaLabel,
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

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div className="flex flex-col gap-1.5 pr-3 min-w-0">
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
            </div>
            <Badge
              className="text-[9px] h-4 w-fit bg-[#1B3A6B]/8 text-[#1B3A6B] dark:text-blue-300 border border-[#1B3A6B]/15"
            >
              {finding.areaLabel}
            </Badge>
          </div>
          <button
            data-testid="finding-chat-close"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Finding body card */}
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

        {/* Quick actions — shown only until first message */}
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

        {/* Messages area */}
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

              {/* Inline revision adoption button */}
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

        {/* Input */}
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
