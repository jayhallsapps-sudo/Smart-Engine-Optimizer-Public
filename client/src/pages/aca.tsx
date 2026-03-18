import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  Database,
  Search,
  BarChart3,
  Phone,
  Globe,
  FileText,
  Layers,
  ChevronDown,
  Users,
  Mic,
  MicOff,
  Check,
  X,
  Filter,
} from "lucide-react";

// ─── SpeechRecognition browser API types ─────────────────────────────────────

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  timestamp: Date;
}

// ─── Tool call display ───────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ElementType> = {
  list_clients: Layers,
  get_client_details: FileText,
  query_google_search_console: Search,
  query_google_analytics: BarChart3,
  query_callrail: Phone,
  query_ctm: Phone,
  query_semrush: Globe,
  query_ahrefs: Globe,
  query_gbp: Globe,
  query_screaming_frog: Database,
  get_airtable_work_log: Database,
  get_asana_tasks: Database,
  get_nsm_goals: BarChart3,
  get_notion_strategy_bank: FileText,
  get_saved_reports: FileText,
  get_query_history: FileText,
  query_website: Globe,
};

const TOOL_LABELS: Record<string, string> = {
  list_clients: "Listing clients",
  get_client_details: "Getting client details",
  query_google_search_console: "Querying Google Search Console",
  query_google_analytics: "Querying Google Analytics",
  query_callrail: "Querying CallRail",
  query_ctm: "Querying CallTrackingMetrics",
  query_semrush: "Querying SEMrush",
  query_ahrefs: "Querying Ahrefs",
  query_gbp: "Querying Google Business Profile",
  query_screaming_frog: "Querying Screaming Frog data",
  get_airtable_work_log: "Fetching Airtable work log",
  get_asana_tasks: "Fetching Asana tasks",
  get_nsm_goals: "Fetching NSM goals from Google Sheets",
  get_notion_strategy_bank: "Fetching Notion Strategy Bank",
  get_saved_reports: "Loading saved reports",
  get_query_history: "Loading query history",
  query_website: "Analyzing website",
};

function ToolCallBadge({ toolName }: { toolName: string }) {
  const Icon = TOOL_ICONS[toolName] || Database;
  const label = TOOL_LABELS[toolName] || toolName;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-0.5">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Markdown-light renderer ─────────────────────────────────────────────────
// Handles bold, bullet points, numbered lists, and line breaks

function renderContent(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  }

  function formatLine(line: string): React.ReactNode {
    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Bullet point
    if (/^[-•*]\s/.test(trimmed)) {
      inList = true;
      listItems.push(
        <li key={`li-${i}`} className="text-sm leading-relaxed">
          {formatLine(trimmed.replace(/^[-•*]\s/, ""))}
        </li>
      );
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      inList = true;
      listItems.push(
        <li key={`li-${i}`} className="text-sm leading-relaxed">
          {formatLine(trimmed.replace(/^\d+[.)]\s/, ""))}
        </li>
      );
      continue;
    }

    flushList();

    // Empty line = paragraph break
    if (!trimmed) {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Heading (###)
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={`h-${i}`} className="text-sm font-semibold text-foreground mt-3 mb-1">
          {formatLine(trimmed.slice(4))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={`h-${i}`} className="text-base font-semibold text-foreground mt-3 mb-1">
          {formatLine(trimmed.slice(3))}
        </h3>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed">
        {formatLine(trimmed)}
      </p>
    );
  }

  flushList();
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Suggested prompts ───────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "How many organic sessions did we get this quarter across all clients?",
  "Show me the top 10 queries for [client] in the last 90 days.",
  "Which client has the best conversion rate right now?",
  "How many calls did we get this quarter and how does it compare to last quarter?",
  "What's our progress toward the NSM goals this quarter?",
  "Are there any technical SEO issues I should know about?",
];

// ─── Client type ─────────────────────────────────────────────────────────────

interface AcaClient {
  id: number;
  name: string;
  gscSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  callrailCompanyId?: string | null;
  ctmAccountId?: string | null;
  semrushProjectId?: string | null;
  ahrefsProjectUrl?: string | null;
  gbpLocationName?: string | null;
  airtableBaseId?: string | null;
  asanaProjectId?: string | null;
}

// ─── Integration config ──────────────────────────────────────────────────────

const INTEGRATION_CONFIG: Array<{
  key: string;
  label: string;
  check: (c: AcaClient) => boolean;
}> = [
  { key: "gsc", label: "Google Search Console", check: (c) => !!c.gscSiteUrl },
  { key: "ga4", label: "Google Analytics", check: (c) => !!c.ga4PropertyId },
  { key: "callrail", label: "CallRail", check: (c) => !!c.callrailCompanyId },
  { key: "ctm", label: "CallTrackingMetrics", check: (c) => !!c.ctmAccountId },
  { key: "semrush", label: "SEMrush", check: (c) => !!c.semrushProjectId },
  { key: "ahrefs", label: "Ahrefs", check: (c) => !!c.ahrefsProjectUrl },
  { key: "gbp", label: "Google Business Profile", check: (c) => !!c.gbpLocationName },
  { key: "screaming_frog", label: "Screaming Frog", check: () => true },
  { key: "airtable", label: "Airtable", check: (c) => !!c.airtableBaseId },
  { key: "asana", label: "Asana", check: (c) => !!c.asanaProjectId },
  { key: "nsm_goals", label: "NSM Goals", check: () => true },
  { key: "strategy_bank", label: "Strategy Bank", check: () => true },
  { key: "website", label: "Website", check: () => true },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function AcaPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const integrationDropdownRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Fetch clients
  const { data: clients = [] } = useQuery<AcaClient[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;
  const availableIntegrations = selectedClient
    ? INTEGRATION_CONFIG.filter((cfg) => cfg.check(selectedClient))
    : [];

  // Reset integrations when client changes
  useEffect(() => {
    setSelectedIntegrations([]);
  }, [selectedClientId]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
      if (integrationDropdownRef.current && !integrationDropdownRef.current.contains(e.target as Node)) {
        setIntegrationDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const SpeechRecognitionClass = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
  const speechSupported = !!SpeechRecognitionClass;

  const preVoiceInputRef = useRef("");
  const inputValueRef = useRef("");
  const manualStopRef = useRef(false);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startSessionRef = useRef<(() => void) | null>(null);

  useEffect(() => { inputValueRef.current = input; }, [input]);

  const stopRecognition = useCallback(() => {
    manualStopRef.current = true;
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      if (maxTimeoutRef.current) clearTimeout(maxTimeoutRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const buildAndStartSession = useCallback(() => {
    if (!SpeechRecognitionClass || manualStopRef.current) return;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r[0].transcript;
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      const combined = finalText + interim;
      const base = preVoiceInputRef.current;
      const newVal = base ? base + " " + combined.trim() : combined.trim();
      setInput(newVal);
      inputValueRef.current = newVal;
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      if (!manualStopRef.current) {
        setTimeout(() => startSessionRef.current?.(), 300);
      } else {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!manualStopRef.current) {
        preVoiceInputRef.current = inputValueRef.current;
        setTimeout(() => startSessionRef.current?.(), 150);
      } else {
        setIsListening(false);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.style.height = "auto";
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + "px";
          }
        }, 0);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      if (!manualStopRef.current) {
        setTimeout(() => startSessionRef.current?.(), 500);
      } else {
        setIsListening(false);
      }
    }
  }, [SpeechRecognitionClass]);

  useEffect(() => {
    startSessionRef.current = buildAndStartSession;
  }, [buildAndStartSession]);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopRecognition();
      return;
    }

    if (!SpeechRecognitionClass) return;

    manualStopRef.current = false;
    preVoiceInputRef.current = input;
    inputValueRef.current = input;
    setIsListening(true);

    maxTimeoutRef.current = setTimeout(() => {
      stopRecognition();
    }, 10 * 60 * 1000);

    buildAndStartSession();
  }, [isListening, input, SpeechRecognitionClass, stopRecognition, buildAndStartSession]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  }, []);

  async function sendMessage(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    stopRecognition();
    setInput("");
    setError(null);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await apiRequest("POST", "/api/aca/chat", {
        messages: apiMessages,
        clientId: selectedClientId,
        integrations: selectedIntegrations,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Received an unexpected response from the server. Please try again.");
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        toolCalls: data.toolCalls,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorText = err.message || "Something went wrong";
      let displayError = errorText;
      try {
        const match = errorText.match(/^(\d+):\s*(.+)/);
        if (match) {
          const statusCode = match[1];
          const body = match[2];
          if (body.trimStart().startsWith("<") || body.trimStart().startsWith("<!")) {
            displayError = `Server error (${statusCode}). Please try again.`;
          } else {
            try {
              const parsed = JSON.parse(body);
              displayError = parsed.message || errorText;
            } catch {
              displayError = `Server error (${statusCode}). Please try again.`;
            }
          }
        }
      } catch {}
      setError(displayError);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleClearChat() {
    setMessages([]);
    setError(null);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-background" data-testid="page-aca">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between max-w-[900px] mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#D97706] to-[#B45309] shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: "#D97706" }}>/ACA/</h1>
              <p className="text-[11px] text-muted-foreground">
                Query any data source, analyze client performance, explore integrations.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
              data-testid="button-clear-chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Integrations panel */}
      <div className="shrink-0 border-b">
        <div className="max-w-[900px] mx-auto w-full px-6 py-3">
          <IntegrationsPanel
            integrations={[
              {
                id: "gsc",
                how: "Queries search performance data including top queries, page performance, CTR opportunities, impressions without clicks, and indexation status for the selected client.",
                why: "GSC is the only authoritative source for actual Google search visibility. Without it, ACA answers about keyword rankings or traffic drops are guesses.",
              },
              {
                id: "ga4",
                how: "Pulls organic session funnels, landing page performance, conversion movers, QTD totals, and year-over-year comparisons from the client's GA4 property.",
                why: "GA4 connects search visibility to actual user behavior and conversions — the data needed to answer whether SEO is driving business outcomes.",
              },
              {
                id: "callrail",
                how: "Reads organic call volume, top call-driving landing pages, and call source breakdowns from CallRail for clients using that platform for call tracking.",
                why: "Calls are often the primary conversion for treatment centers. CallRail data is required to show whether search traffic is converting to actual leads.",
              },
              {
                id: "ctm",
                how: "Reads the same call-tracking signals as CallRail (volume, sources, landing pages) for clients using CallTrackingMetrics instead.",
                why: "CTM is used by a subset of clients. ACA checks for it automatically when CallRail is not configured so no call data is left on the table.",
              },
              {
                id: "semrush",
                how: "Pulls keyword distribution, domain-level organic rankings, and competitor visibility metrics from SEMrush for the selected client.",
                why: "SEMrush provides third-party keyword footprint data that GSC alone can't supply, including competitive share of voice and keyword difficulty context.",
              },
              {
                id: "ahrefs",
                how: "Queries keyword rankings, backlink profile (DR, referring domains), and competitor overlap from Ahrefs Site Explorer for the selected client.",
                why: "Ahrefs is the authoritative source for backlink authority signals. ACA uses it to answer questions about domain strength and link-building ROI.",
              },
              {
                id: "gbp",
                how: "Reads Google Business Profile metrics including local search impressions, direction requests, calls, and photo views for the client's location(s).",
                why: "Local SEO performance is invisible without GBP data. Treatment centers with physical locations need this to track local visibility separately from organic.",
              },
              {
                id: "airtable",
                how: "Reads the client's published and in-production content work log from Airtable to ground execution questions in real deliverable records.",
                why: "Airtable is where content production is tracked. Without it, ACA can't answer what content actually shipped or what's still in the queue.",
              },
              {
                id: "asana",
                how: "Reads open and completed tasks from the client's linked Asana project, grouped by category (Technical SEO, Content, Local, etc.).",
                why: "Asana is the source of truth for ongoing deliverables. It lets ACA answer what work is in flight — not just what's been published.",
              },
              {
                id: "google-sheets",
                how: "Reads the client's North Star Metric goals (NSM targets by quarter) from the shared Google Sheet used for goal-setting.",
                why: "NSM goals are the benchmark for every performance conversation. ACA needs them to contextualize whether metrics are on track or off.",
              },
              {
                id: "notion",
                how: "Searches the Webserv Strategy Bank for relevant SOPs, playbooks, behavioral health glossary entries, and client strategy notes.",
                why: "Notion houses institutional knowledge that doesn't exist in structured data. It lets ACA cite approved Webserv methodology rather than generic AI reasoning.",
              },
              {
                id: "screaming-frog",
                how: "Reads uploaded Screaming Frog crawl reports to surface technical issues including broken links, redirect chains, missing tags, and crawl errors.",
                why: "Screaming Frog is the most complete source of on-site technical data. ACA uses it to answer technical audit questions with specifics, not generalities.",
              },
            ]}
          />
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-[900px] mx-auto w-full space-y-4">
          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D97706]/10 to-[#B45309]/10 border border-[#D97706]/20 mb-6">
                <Sparkles className="w-8 h-8 text-[#D97706]" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">What do you want to know?</h2>
              <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
                I have access to all your connected integrations — GSC, GA4, CallRail, CTM, SEMrush, Ahrefs, Airtable, Asana, Notion, and Google Sheets. Ask me anything.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted border border-border rounded-lg px-3 py-2.5 transition-colors leading-relaxed"
                    data-testid={`suggested-${i}`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-start pt-1 shrink-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#D97706] to-[#B45309]">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              )}

              <div
                className={`max-w-[75%] ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
                    : "bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3"
                }`}
              >
                {/* Tool call badges */}
                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {[...new Set(msg.toolCalls)].map((tool, i) => (
                      <ToolCallBadge key={i} toolName={tool} />
                    ))}
                  </div>
                )}

                {msg.role === "user" ? (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                ) : (
                  renderContent(msg.content)
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex items-start pt-1 shrink-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading state */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="flex items-start pt-1 shrink-0">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#D97706] to-[#B45309]">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your data...
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex gap-3 justify-start">
              <div className="flex items-start pt-1 shrink-0">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 dark:bg-red-950">
                  <Bot className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-md px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t px-6 py-4 bg-background">
        <div className="max-w-[900px] mx-auto w-full">
          {/* Client selector row */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setClientDropdownOpen((o) => !o)}
                className={[
                  "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                  selectedClient
                    ? "bg-[#D97706]/10 border-[#D97706]/30 text-[#D97706] dark:text-amber-400 hover:bg-[#D97706]/15"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
                data-testid="button-client-selector"
              >
                <Users className="w-3.5 h-3.5" />
                {selectedClient ? selectedClient.name : "All Clients"}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {clientDropdownOpen && (
                <div className="absolute bottom-full mb-1 left-0 z-50 min-w-[200px] max-h-[240px] overflow-y-auto bg-popover border border-border rounded-lg shadow-lg py-1">
                  <button
                    onClick={() => {
                      setSelectedClientId(null);
                      setClientDropdownOpen(false);
                    }}
                    className={[
                      "w-full text-left px-3 py-2 text-xs transition-colors",
                      selectedClientId === null
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    All Clients
                  </button>
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedClientId(c.id);
                        setClientDropdownOpen(false);
                      }}
                      className={[
                        "w-full text-left px-3 py-2 text-xs transition-colors",
                        selectedClientId === c.id
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Integration selector */}
            <div className="relative" ref={integrationDropdownRef}>
              <button
                onClick={() => {
                  if (!selectedClient) return;
                  setIntegrationDropdownOpen((o) => !o);
                }}
                disabled={!selectedClient}
                className={[
                  "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                  selectedIntegrations.length > 0
                    ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-400"
                    : "bg-muted/50 border-border text-muted-foreground",
                  !selectedClient ? "opacity-40 cursor-not-allowed" : "hover:bg-muted hover:text-foreground",
                ].join(" ")}
                data-testid="button-integration-selector"
                title={!selectedClient ? "Select a client first" : undefined}
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedIntegrations.length > 0 ? `Sources (${selectedIntegrations.length})` : "Sources"}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {integrationDropdownOpen && selectedClient && (
                <div className="absolute bottom-full mb-1 left-0 z-50 w-[220px] bg-popover border border-border rounded-lg shadow-lg py-1">
                  {/* Select All / Deselect All */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Data Sources</span>
                    <button
                      onClick={() => {
                        if (selectedIntegrations.length === availableIntegrations.length) {
                          setSelectedIntegrations([]);
                        } else {
                          setSelectedIntegrations(availableIntegrations.map((a) => a.key));
                        }
                      }}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {selectedIntegrations.length === availableIntegrations.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  {availableIntegrations.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">No integrations configured</p>
                  ) : (
                    availableIntegrations.map((cfg) => {
                      const checked = selectedIntegrations.includes(cfg.key);
                      return (
                        <button
                          key={cfg.key}
                          onClick={() => {
                            setSelectedIntegrations((prev) =>
                              checked ? prev.filter((k) => k !== cfg.key) : [...prev, cfg.key]
                            );
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-blue-600 border-blue-600" : "border-border bg-background"}`}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          {cfg.label}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selectedIntegrations.length > 0 && (
              <button
                onClick={() => setSelectedIntegrations([])}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Clear source filters"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {/* Input row */}
          <div className={`flex items-end gap-2 bg-card border rounded-xl px-3 py-2 transition-all ${
            isListening
              ? "border-red-400 dark:border-red-600 ring-2 ring-red-400/20"
              : "border-border focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-ring"
          }`}>
            {isListening ? (
              <div className="flex-1 flex items-center gap-3 min-h-[30px] py-1 overflow-hidden">
                {/* Animated waveform bars */}
                <div className="flex items-end gap-[3px] h-5 shrink-0 text-red-500">
                  {[0, 0.12, 0.24, 0.36, 0.48, 0.36, 0.24].map((delay, i) => (
                    <span key={i} className="aca-bar" style={{ animationDelay: `${delay}s` }} />
                  ))}
                </div>
                {/* Interim transcript or "Listening..." */}
                <span className="text-sm text-muted-foreground/70 truncate">
                  {input || "Listening\u2026"}
                </span>
              </div>
            ) : (
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedClient
                    ? `Ask anything about ${selectedClient.name}...`
                    : "Ask anything about your clients, data, or integrations..."
                }
                rows={1}
                disabled={loading}
                className="flex-1 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/60 min-h-[24px] max-h-[200px] py-1"
                data-testid="input-aca-message"
              />
            )}
            {speechSupported && (
              <button
                onClick={toggleVoiceInput}
                disabled={loading}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${
                  isListening
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                data-testid="button-aca-voice"
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !isListening) || loading}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              data-testid="button-aca-send"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            /ACA/ reads live data from your connected integrations. Responses may take a moment when pulling from multiple sources.
          </p>
        </div>
      </div>
    </div>
  );
}
