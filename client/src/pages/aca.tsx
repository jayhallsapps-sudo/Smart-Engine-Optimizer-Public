import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Send, Loader2, Trash2, ChevronDown, ChevronRight, Settings, Plus,
  MessageSquare, Wrench, AlertCircle, CheckCircle2, Zap, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCallRecord {
  name: string;
  input?: Record<string, any>;
  result?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
  provider?: string;
  streaming?: boolean;
  streamingTools?: ToolCallRecord[];
}

interface AmaConversation {
  id: number;
  clientId: number | null;
  clientName: string | null;
  title: string;
  integrations: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExecutionHealth {
  clientId: number;
  sources: Record<string, { configured: boolean; credentialPresent: boolean; reason?: string }>;
}

// ─── Integration options ──────────────────────────────────────────────────────

const ALL_INTEGRATIONS = [
  { key: "gsc", label: "Google Search Console" },
  { key: "ga4", label: "Google Analytics 4" },
  { key: "callrail", label: "CallRail" },
  { key: "ctm", label: "CallTrackingMetrics" },
  { key: "semrush", label: "SEMrush" },
  { key: "ahrefs", label: "Ahrefs" },
  { key: "gbp", label: "Google Business Profile" },
  { key: "screaming_frog", label: "Screaming Frog" },
  { key: "airtable", label: "Airtable" },
  { key: "asana", label: "Asana" },
  { key: "nsm_goals", label: "NSM Goals" },
  { key: "strategy_bank", label: "Strategy Bank" },
  { key: "website", label: "Website Analysis" },
];

const TOOL_LABELS: Record<string, string> = {
  query_google_search_console: "Google Search Console",
  query_google_analytics: "Google Analytics 4",
  query_callrail: "CallRail",
  query_ctm: "CallTrackingMetrics",
  query_semrush: "SEMrush",
  query_ahrefs: "Ahrefs",
  query_gbp: "Google Business Profile",
  query_screaming_frog: "Screaming Frog",
  get_airtable_work_log: "Airtable",
  get_asana_tasks: "Asana",
  get_nsm_goals: "NSM Goals",
  get_notion_strategy_bank: "Strategy Bank",
  get_saved_reports: "Saved Reports",
  get_query_history: "Query History",
  list_clients: "Clients List",
  get_client_details: "Client Details",
  query_website: "Website",
};

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3 class='text-sm font-semibold mt-3 mb-1'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-base font-semibold mt-3 mb-1'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-lg font-bold mt-3 mb-1'>$1</h1>")
    .replace(/^- (.+)$/gm, "<li class='ml-4 list-disc text-sm'>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-4 list-decimal text-sm'>$2</li>")
    .replace(/`(.+?)`/g, "<code class='bg-muted px-1 py-0.5 rounded text-xs font-mono'>$1</code>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

// ─── ToolCallBadge ────────────────────────────────────────────────────────────

function ToolCallBadge({ tool, isActive }: { tool: ToolCallRecord; isActive?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[tool.name] || tool.name;
  const hasResult = !!tool.result;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          data-testid={`tool-badge-${tool.name}`}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors border",
            "hover:bg-muted/80 cursor-pointer",
            isActive
              ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
              : hasResult
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              : "bg-muted border-border text-muted-foreground"
          )}
        >
          {isActive ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : hasResult ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <Wrench className="h-3 w-3" />
          )}
          <span>{label}</span>
          {(hasResult || tool.input) && (
            open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          )}
        </button>
      </CollapsibleTrigger>
      {(hasResult || tool.input) && (
        <CollapsibleContent>
          <div className="mt-1 ml-1 rounded-md border border-border bg-muted/50 p-2 text-xs font-mono text-muted-foreground max-h-48 overflow-y-auto">
            {tool.input && Object.keys(tool.input).length > 0 && (
              <div className="mb-1">
                <span className="text-foreground/60 font-sans not-italic">Input:</span>{" "}
                {JSON.stringify(tool.input)}
              </div>
            )}
            {tool.result && (
              <div>
                <span className="text-foreground/60 font-sans not-italic">Result preview:</span>
                <pre className="whitespace-pre-wrap break-all mt-0.5">
                  {tool.result.slice(0, 1000)}{tool.result.length > 1000 ? "\n…(truncated)" : ""}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const tools: ToolCallRecord[] =
    message.toolCalls && message.toolCalls.length > 0
      ? message.toolCalls
      : message.streamingTools || [];

  return (
    <div
      data-testid={`message-${message.id}`}
      className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}
    >
      {!isUser && tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-w-[90%]">
          {tools.map((tool, i) => (
            <ToolCallBadge
              key={`${tool.name}-${i}`}
              tool={tool}
              isActive={message.streaming && i === tools.length - 1 && !tool.result}
            />
          ))}
        </div>
      )}

      <div
        className={cn(
          "rounded-xl px-4 py-3 max-w-[90%] text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.streaming && !message.content ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Processing…</span>
          </span>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
      </div>

      {!isUser && message.provider && (
        <span className="text-[10px] text-muted-foreground/60 ml-1">via {message.provider}</span>
      )}
    </div>
  );
}

// ─── Health indicator ─────────────────────────────────────────────────────────

function HealthDot({ status }: { status: "ok" | "warn" | "error" }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        status === "ok" && "bg-emerald-500",
        status === "warn" && "bg-yellow-500",
        status === "error" && "bg-red-500"
      )}
    />
  );
}

// ─── Conversation sidebar ─────────────────────────────────────────────────────

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
  hasClient,
}: {
  conversations: AmaConversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  isLoading: boolean;
  hasClient: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button
          data-testid="button-new-conversation"
          onClick={onNew}
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          New Conversation
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-2 leading-relaxed">
              {hasClient
                ? "No conversations for this client yet."
                : "Select a client to see its history."}
            </p>
          )}
          {conversations.map((convo) => (
            <div
              key={convo.id}
              data-testid={`conversation-${convo.id}`}
              className={cn(
                "group flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors",
                activeId === convo.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-foreground"
              )}
              onClick={() => onSelect(convo.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate leading-snug">{convo.title}</p>
                {convo.clientName && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{convo.clientName}</p>
                )}
              </div>
              <button
                data-testid={`button-delete-convo-${convo.id}`}
                onClick={(e) => { e.stopPropagation(); onDelete(convo.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main AMA page ────────────────────────────────────────────────────────────

export default function AcaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  // Data queries
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const conversationQueryKey = selectedClientId != null
    ? `/api/ama/conversations?clientId=${selectedClientId}`
    : "/api/ama/conversations";

  const { data: conversations = [], isLoading: convoLoading } = useQuery<AmaConversation[]>({
    queryKey: [conversationQueryKey],
    staleTime: 0,
  });

  const { data: executionHealth } = useQuery<ExecutionHealth>({
    queryKey: ["/api/aca/execution-health", selectedClientId],
    enabled: !!selectedClientId,
    staleTime: 0,
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load a past conversation
  const loadConversation = useCallback(async (id: number) => {
    setActiveConversationId(id);
    try {
      const resp = await fetch(`/api/ama/conversations/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      if (data.messages) {
        setMessages(
          data.messages.map((m: any) => ({
            id: `db-${m.id}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            toolCalls: m.toolCalls || [],
            provider: m.provider || undefined,
          }))
        );
      }
      if (data.clientId) setSelectedClientId(data.clientId);
      if (data.integrations?.length) setIntegrations(data.integrations);
    } catch {
      toast({ title: "Failed to load conversation", variant: "destructive" });
    }
  }, [authToken, toast]);

  // Clear conversation when client switches
  useEffect(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, [selectedClientId]);

  // Delete a conversation
  const deleteConversation = useCallback(async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/ama/conversations/${id}`);
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/ama/conversations"),
      });
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch {
      toast({ title: "Failed to delete conversation", variant: "destructive" });
    }
  }, [activeConversationId, queryClient, toast]);

  // Start fresh
  const startNewConversation = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    textareaRef.current?.focus();
  }, []);

  // Toggle integration filter
  const toggleIntegration = (key: string) => {
    setIntegrations((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Send message via SSE stream
  const sendMessage = useCallback(async () => {
    const userInput = input.trim();
    if (!userInput || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    const userMsgId = `user-${Date.now()}`;
    const asstMsgId = `asst-${Date.now()}`;

    const userMsg: ChatMessage = { id: userMsgId, role: "user", content: userInput };
    const asstMsg: ChatMessage = {
      id: asstMsgId, role: "assistant", content: "",
      streaming: true, streamingTools: [], toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, asstMsg]);

    const historyMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userInput },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAsst = (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === asstMsgId ? fn(m) : m)));
    };

    try {
      const resp = await fetch("/api/ama/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          messages: historyMessages,
          clientId: selectedClientId,
          integrations,
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;

          let ev: any;
          try { ev = JSON.parse(raw); } catch { continue; }

          switch (ev.type) {
            case "tool_call":
              updateAsst((m) => ({
                ...m,
                streamingTools: [...(m.streamingTools || []), { name: ev.name, input: ev.input }],
              }));
              break;

            case "tool_result":
              updateAsst((m) => {
                const tools = [...(m.streamingTools || [])];
                const ri = [...tools].reverse().findIndex((t) => t.name === ev.name);
                if (ri >= 0) tools[tools.length - 1 - ri] = { ...tools[tools.length - 1 - ri], result: ev.result };
                return { ...m, streamingTools: tools };
              });
              break;

            case "token":
              updateAsst((m) => ({ ...m, content: m.content + ev.text }));
              break;

            case "done":
              updateAsst((m) => ({
                ...m,
                streaming: false,
                provider: ev.provider,
                toolCalls: m.streamingTools || [],
                streamingTools: [],
              }));
              break;

            case "conversation_id":
              setActiveConversationId(ev.id);
              queryClient.invalidateQueries({
                predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/ama/conversations"),
              });
              break;

            case "error":
              updateAsst((m) => ({
                ...m,
                streaming: false,
                content: m.content || `Error: ${ev.message}`,
              }));
              toast({ title: "AI error", description: ev.message, variant: "destructive" });
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        updateAsst((m) => ({
          ...m,
          streaming: false,
          content: m.content || "Something went wrong. Please try again.",
        }));
        toast({ title: "Connection error", description: err.message, variant: "destructive" });
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, selectedClientId, integrations, activeConversationId, queryClient, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Health summary
  const healthSummary = selectedClientId && executionHealth
    ? (() => {
        const src = executionHealth.sources || {};
        const ok = Object.values(src).filter((s) => s.configured && s.credentialPresent).length;
        const total = Object.keys(src).length;
        return { ok, total, src };
      })()
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      {sidebarOpen && (
        <div
          data-testid="sidebar-conversations"
          className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/20"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Conversations
            </span>
            <button
              data-testid="button-close-sidebar"
              onClick={() => setSidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <ConversationSidebar
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={loadConversation}
            onNew={startNewConversation}
            onDelete={deleteConversation}
            isLoading={convoLoading}
            hasClient={selectedClientId != null}
          />
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0 h-12">
          {!sidebarOpen && (
            <button
              data-testid="button-open-sidebar"
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground mr-1"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm text-foreground hidden sm:block">AMA — Ask Me Anything</span>

          <div className="flex-1" />

          {/* Client selector */}
          <Select
            value={selectedClientId ? String(selectedClientId) : "__none__"}
            onValueChange={(v) => {
              const id = v === "__none__" ? null : parseInt(v, 10);
              setSelectedClientId(id);
              queryClient.invalidateQueries({ queryKey: ["/api/aca/execution-health"] });
            }}
          >
            <SelectTrigger data-testid="select-client" className="h-8 text-xs w-44">
              <SelectValue placeholder="No client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Health summary */}
          {healthSummary && (
            <div
              data-testid="health-indicator"
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={`${healthSummary.ok}/${healthSummary.total} sources OK`}
            >
              <HealthDot
                status={
                  healthSummary.ok >= healthSummary.total * 0.7 ? "ok"
                  : healthSummary.ok > 0 ? "warn"
                  : "error"
                }
              />
              <span className="text-xs">{healthSummary.ok}/{healthSummary.total}</span>
            </div>
          )}

          {/* Source filter */}
          <button
            data-testid="button-source-filter"
            onClick={() => setShowIntegrations((v) => !v)}
            className={cn(
              "flex items-center gap-1 text-xs rounded-md px-2 py-1 border transition-colors",
              integrations.length > 0
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings className="h-3 w-3" />
            <span className="hidden sm:inline">
              {integrations.length > 0 ? `${integrations.length} sources` : "All sources"}
            </span>
          </button>

          {/* New chat */}
          <button
            data-testid="button-new-chat"
            onClick={startNewConversation}
            className="text-muted-foreground hover:text-foreground"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Integration filter panel */}
        {showIntegrations && (
          <div
            data-testid="panel-integrations"
            className="px-4 py-2 border-b border-border bg-muted/30 flex flex-wrap gap-1.5"
          >
            {ALL_INTEGRATIONS.map((integ) => {
              const hs = healthSummary?.src[integ.key];
              const selected = integrations.includes(integ.key);
              return (
                <button
                  key={integ.key}
                  data-testid={`toggle-${integ.key}`}
                  onClick={() => toggleIntegration(integ.key)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {hs && (
                    <HealthDot
                      status={
                        hs.configured && hs.credentialPresent ? "ok"
                        : hs.credentialPresent ? "warn"
                        : "error"
                      }
                    />
                  )}
                  {integ.label}
                </button>
              );
            })}
            {integrations.length > 0 && (
              <button
                data-testid="button-clear-filter"
                onClick={() => setIntegrations([])}
                className="px-2.5 py-1 rounded-full text-xs border border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Ask Me Anything</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Ask about SEO performance, rankings, conversions, goals, work completed, or any data in the platform.
                  </p>
                </div>
                {selectedClientId && (
                  <div className="flex flex-wrap gap-1.5 justify-center mt-1 max-w-md">
                    {[
                      "What's organic traffic looking like this quarter?",
                      "Show top converting pages",
                      "How are we tracking against NSM goals?",
                      "What work was done last month?",
                    ].map((s) => (
                      <button
                        key={s}
                        data-testid={`suggestion-${s.slice(0, 15)}`}
                        onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className="text-xs px-3 py-1 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input bar */}
        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border bg-background">
          {!selectedClientId && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Select a client above to enable client-specific data queries.</span>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              data-testid="input-chat"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedClientId
                  ? "Ask about performance, rankings, goals, work done… (Enter to send)"
                  : "Ask a question or select a client first…"
              }
              className="flex-1 min-h-[64px] max-h-40 resize-none text-sm"
              disabled={isStreaming}
            />
            <Button
              data-testid="button-send"
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              size="sm"
              className="h-10 px-4 shrink-0"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5">
            Shift+Enter for new line · All responses grounded in retrieved data
          </p>
        </div>
      </div>
    </div>
  );
}
