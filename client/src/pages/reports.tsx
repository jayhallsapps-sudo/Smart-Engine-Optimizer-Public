import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient as rqClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Download,
  Globe,
  BarChart3,
  Phone,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  GitMerge,
  Lightbulb,
  AlertTriangle,
  CalendarCheck,
  TrendingUp,
  Search,
  ChevronRight,
  CheckCheck,
} from "lucide-react";
import type { Client, CommandResult } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface QueryResponse {
  success: boolean;
  error?: string;
  suggestions?: string[];
  commandDescription?: string;
  dateRangeLabel?: string;
  result?: CommandResult;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "error";
  content: string;
  response?: QueryResponse;
  timestamp: Date;
  committedTo?: string;
}

interface CommittedSection {
  sectionId: string;
  messageId?: string;
  response?: QueryResponse;
  manualText?: string;
  committedAt: Date;
}

type ReportType = "biweekly" | "monthly" | "qbr";

interface ReportSection {
  id: string;
  title: string;
  description: string;
  icon: any;
  manualInput: boolean;
  hints: string[];
  dateRange: string;
}

const REPORT_SECTIONS: Record<ReportType, ReportSection[]> = {
  biweekly: [
    {
      id: "bw_topline",
      title: "Topline Snapshot",
      description: "Organic clicks, sessions, leads, and calls (last 14 days vs prev 14 days)",
      icon: TrendingUp,
      manualInput: false,
      hints: ["Show GSC clicks last 14 days", "GA4 organic sessions this fortnight", "CallRail organic calls last 14 days"],
      dateRange: "Last 14 days vs previous 14 days",
    },
    {
      id: "bw_shipped",
      title: "What We Shipped",
      description: "Work completed in the past two weeks (manual work log entry)",
      icon: ClipboardList,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "bw_changes",
      title: "What Changed & Why",
      description: "3 bullets on largest movers from GSC queries/pages and GA landing pages",
      icon: GitMerge,
      manualInput: false,
      hints: ["Top query winners and losers last 14 days", "Page performance movers", "What changed in organic traffic"],
      dateRange: "Last 14 days",
    },
    {
      id: "bw_risks",
      title: "Risks & Blocks",
      description: "Risks, blockers, and what we need from the client",
      icon: AlertTriangle,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "bw_next",
      title: "Next Two Weeks",
      description: "3–5 prioritized actions for the upcoming fortnight",
      icon: CalendarCheck,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
  ],
  monthly: [
    {
      id: "mo_exec",
      title: "Executive Summary KPIs",
      description: "GSC clicks/impressions/CTR/position, GA4 organic sessions/leads/CVR, CallRail calls",
      icon: TrendingUp,
      manualInput: false,
      hints: ["GSC month over month performance", "GA4 organic funnel monthly", "CallRail organic calls monthly"],
      dateRange: "Last 30 days vs previous 30 days",
    },
    {
      id: "mo_visibility",
      title: "Visibility & Demand",
      description: "Top query winners/losers (non-branded) and money page performance",
      icon: Globe,
      manualInput: false,
      hints: ["Non-branded keyword winners this month", "Top page movers MoM", "Money pages performance"],
      dateRange: "Last 30 days",
    },
    {
      id: "mo_conversion",
      title: "Conversion Performance",
      description: "Top organic landing pages by leads & CVR, call volume and quality",
      icon: BarChart3,
      manualInput: false,
      hints: ["GA4 organic landing pages by conversions", "CallRail organic calls by landing page", "Top converting pages this month"],
      dateRange: "Last 30 days",
    },
    {
      id: "mo_work",
      title: "Work Completed",
      description: "Work log from this month and outcomes delivered",
      icon: ClipboardList,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "mo_priorities",
      title: "Next Month Priorities",
      description: "3–5 items tied to the North Star Metric for the client",
      icon: CalendarCheck,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
  ],
  qbr: [
    {
      id: "qbr_scorecard",
      title: "QBR Scorecard",
      description: "NSM pacing + full funnel: GSC trends, GA4 organic, CallRail qualified calls",
      icon: TrendingUp,
      manualInput: false,
      hints: ["QBR GSC query performance quarter over quarter", "GA4 organic funnel QoQ", "CallRail organic calls QoQ", "Ahrefs backlink overview"],
      dateRange: "Last 90 days vs previous 90 days",
    },
    {
      id: "qbr_drivers",
      title: "What Worked / What Didn't",
      description: "Top 10 pages that drove leads, major query intent shifts (non-branded)",
      icon: GitMerge,
      manualInput: false,
      hints: ["Top landing pages by leads QBR", "Non-branded keyword winners and losers", "Page performance quarter over quarter"],
      dateRange: "Last 90 days",
    },
    {
      id: "qbr_insights",
      title: "Strategic Insights",
      description: "3–5 data-backed strategic insights for the quarter",
      icon: Lightbulb,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "qbr_risks",
      title: "Risks & Constraints",
      description: "Expectation management: blockers, dependencies, external factors",
      icon: AlertTriangle,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "qbr_roadmap",
      title: "Next Quarter Roadmap",
      description: "Prioritized initiatives (Technical, Content, CRO/UX, Local)",
      icon: CalendarCheck,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "qbr_appendix",
      title: "Appendix",
      description: "Full query tables, page tables, landing page tables",
      icon: FileText,
      manualInput: false,
      hints: ["Full top queries report", "Full top pages report", "All organic landing pages"],
      dateRange: "Last 90 days",
    },
  ],
};

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  qbr: "QBR",
};

const REPORT_DATE_RANGES: Record<ReportType, string> = {
  biweekly: "last_14_vs_prev_14",
  monthly: "last_30_vs_prev_30",
  qbr: "last_90_vs_prev_90",
};

function getCommandIcon(command?: string) {
  if (!command) return <Search className="w-4 h-4" />;
  if (command.startsWith("gsc")) return <Globe className="w-4 h-4" />;
  if (command.startsWith("ga4")) return <BarChart3 className="w-4 h-4" />;
  if (command.startsWith("callrail") || command.startsWith("ctm")) return <Phone className="w-4 h-4" />;
  return <Search className="w-4 h-4" />;
}

function MetricCard({ metric }: { metric: CommandResult["summary"][0] }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/50">
      <span className="text-[10px] text-muted-foreground font-medium">{metric.label}</span>
      <span className="text-lg font-semibold tabular-nums">{metric.current}</span>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">vs {metric.previous}</span>
        <Badge
          variant={metric.isPositive ? "default" : "destructive"}
          className="text-[10px] px-1 py-0"
        >
          {metric.isPositive ? (
            <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
          ) : (
            <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />
          )}
          {metric.deltaPercent}
        </Badge>
      </div>
    </div>
  );
}

function ResultDisplay({
  response,
  onCommit,
  isCommitted,
}: {
  response: QueryResponse;
  onCommit?: () => void;
  isCommitted?: boolean;
}) {
  if (!response.result) return null;
  const { result, commandDescription, dateRangeLabel } = response;

  const downloadCSV = (table: CommandResult["tables"][0]) => {
    const csvContent = [
      table.headers.join(","),
      ...table.rows.map(row => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.title.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {getCommandIcon(result.command)}
          <span className="text-sm font-medium">{commandDescription}</span>
          <Minus className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{dateRangeLabel}</span>
        </div>
        {onCommit && (
          <Button
            size="sm"
            variant={isCommitted ? "secondary" : "default"}
            onClick={onCommit}
            disabled={isCommitted}
            data-testid="button-commit-result"
          >
            {isCommitted ? (
              <><CheckCircle2 className="w-3 h-3 mr-1.5" /> Committed</>
            ) : (
              <><CheckCheck className="w-3 h-3 mr-1.5" /> Commit to Report</>
            )}
          </Button>
        )}
      </div>

      {result.summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {result.summary.map((metric, idx) => (
            <MetricCard key={idx} metric={metric} />
          ))}
        </div>
      )}

      {result.tables.map((table, idx) => (
        <div key={idx} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium">{table.title}</h4>
            <Button variant="outline" size="sm" onClick={() => downloadCSV(table)} data-testid={`button-download-csv-${idx}`}>
              <Download className="w-3 h-3 mr-1" />
              CSV
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.headers.map((h, hi) => (
                    <TableHead key={hi} className="text-[10px] whitespace-nowrap py-2">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.slice(0, 15).map((row, ri) => (
                  <TableRow key={ri}>
                    {row.map((cell, ci) => (
                      <TableCell key={ci} className="text-[10px] tabular-nums whitespace-nowrap py-1.5">
                        {typeof cell === "string" && cell.startsWith("+") ? (
                          <span className="text-green-600 dark:text-green-400">{cell}</span>
                        ) : typeof cell === "string" && cell.startsWith("-") ? (
                          <span className="text-red-600 dark:text-red-400">{cell}</span>
                        ) : typeof cell === "number" ? (
                          cell.toLocaleString()
                        ) : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommitDialog({
  open,
  onOpenChange,
  reportType,
  committedSections,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportType: ReportType;
  committedSections: Record<string, CommittedSection>;
  onCommit: (sectionId: string) => void;
}) {
  const sections = REPORT_SECTIONS[reportType];
  const [selected, setSelected] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Commit to Report Section</DialogTitle>
          <DialogDescription>
            Choose which section of the {REPORT_TYPE_LABELS[reportType]} report this data belongs to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {sections.filter(s => !s.manualInput).map(section => {
            const isAlreadyCommitted = !!committedSections[section.id];
            return (
              <button
                key={section.id}
                onClick={() => setSelected(section.id)}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  selected === section.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                } ${isAlreadyCommitted ? "opacity-60" : ""}`}
                data-testid={`button-section-${section.id}`}
              >
                <div className="flex items-center gap-2">
                  <section.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{section.title}</p>
                    <p className="text-[10px] text-muted-foreground">{section.description}</p>
                  </div>
                  {isAlreadyCommitted && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Filled</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (selected) {
                onCommit(selected);
                setSelected("");
                onOpenChange(false);
              }
            }}
            disabled={!selected}
            data-testid="button-confirm-commit"
          >
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualInputDialog({
  open,
  onOpenChange,
  section,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: ReportSection | null;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  if (!section) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{section.title}</DialogTitle>
          <DialogDescription>{section.description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Enter ${section.title.toLowerCase()} notes...`}
          className="min-h-[140px] resize-none"
          data-testid="input-manual-section"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (text.trim()) { onSave(text.trim()); onOpenChange(false); } }} disabled={!text.trim()} data-testid="button-save-manual">
            Save to Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateReportDialog({
  open,
  onOpenChange,
  reportType,
  client,
  committedSections,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportType: ReportType;
  client: Client | null;
  committedSections: Record<string, CommittedSection>;
}) {
  if (!client) return null;
  const sections = REPORT_SECTIONS[reportType];
  const dateRangeLabel = reportType === "biweekly" ? "Last 14 Days vs Previous 14 Days"
    : reportType === "monthly" ? "Last 30 Days vs Previous 30 Days"
    : "Last 90 Days vs Previous 90 Days";

  const now = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const formatSectionContent = (section: ReportSection): string => {
    const committed = committedSections[section.id];
    if (!committed) return "[ No data committed ]";
    if (committed.manualText) return committed.manualText;
    if (committed.response?.result) {
      const r = committed.response.result;
      const summaryLines = r.summary.map(s =>
        `  • ${s.label}: ${s.current} (vs ${s.previous} | ${s.deltaPercent})`
      ).join("\n");
      const tableCount = r.tables.length;
      return `${summaryLines}${tableCount > 0 ? `\n  [${tableCount} data table${tableCount > 1 ? "s" : ""} attached]` : ""}`;
    }
    return "[ Data committed ]";
  };

  const reportText = [
    `${REPORT_TYPE_LABELS[reportType].toUpperCase()} REPORT`,
    `Client: ${client.name}`,
    `Date: ${now}`,
    `Date Range: ${dateRangeLabel}`,
    "",
    "━".repeat(48),
    "",
    ...sections.map(s => [
      `## ${s.title}`,
      s.description,
      "",
      formatSectionContent(s),
      "",
    ]).flat(),
    "━".repeat(48),
    "Generated by SmartEO",
  ].join("\n");

  const downloadReport = () => {
    const blob = new Blob([reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client.name.toLowerCase().replace(/\s+/g, "_")}_${reportType}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{REPORT_TYPE_LABELS[reportType]} Report — {client.name}</DialogTitle>
          <DialogDescription>{dateRangeLabel}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 rounded-md p-4 border">
            {reportText}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={downloadReport} data-testid="button-download-report">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download .txt
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistPanel({
  reportType,
  committedSections,
  onManualAdd,
  onGenerate,
}: {
  reportType: ReportType;
  committedSections: Record<string, CommittedSection>;
  onManualAdd: (section: ReportSection) => void;
  onGenerate: () => void;
}) {
  const sections = REPORT_SECTIONS[reportType];
  const filledCount = sections.filter(s => !!committedSections[s.id]).length;
  const pct = Math.round((filledCount / sections.length) * 100);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{REPORT_TYPE_LABELS[reportType]} Report</h3>
          <Badge variant="secondary" className="text-[10px]">{filledCount}/{sections.length}</Badge>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{pct}% complete</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sections.map((section) => {
          const committed = committedSections[section.id];
          const SIcon = section.icon;
          return (
            <div
              key={section.id}
              className={`rounded-md border p-3 transition-colors ${committed ? "border-primary/30 bg-primary/5" : "border-border"}`}
              data-testid={`checklist-item-${section.id}`}
            >
              <div className="flex items-start gap-2">
                {committed ? (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-tight">{section.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{section.description}</p>
                  {!committed && section.dateRange && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{section.dateRange}</p>
                  )}
                  {committed?.manualText && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic line-clamp-2">
                      {committed.manualText}
                    </p>
                  )}
                  {committed?.response?.commandDescription && (
                    <p className="text-[10px] text-primary/80 mt-1">
                      {committed.response.commandDescription}
                    </p>
                  )}
                  {!committed && section.manualInput && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 mt-1"
                      onClick={() => onManualAdd(section)}
                      data-testid={`button-manual-${section.id}`}
                    >
                      + Add manually
                    </Button>
                  )}
                  {!committed && !section.manualInput && section.hints.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                      Ask in chat → Commit
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t">
        <Button
          className="w-full"
          onClick={onGenerate}
          data-testid="button-generate-report"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
        {filledCount === 0 && (
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Commit at least one section to generate
          </p>
        )}
      </div>
    </div>
  );
}

const EXAMPLE_QUERIES_BY_TYPE: Record<ReportType, string[]> = {
  biweekly: [
    "GSC clicks last 14 days",
    "GA4 organic sessions this fortnight",
    "CallRail organic calls last 14 days",
    "Top query movers last 14 days",
  ],
  monthly: [
    "GSC month over month performance",
    "GA4 organic funnel MoM",
    "CallRail organic calls monthly",
    "Non-branded keyword winners this month",
  ],
  qbr: [
    "GSC QoQ query performance",
    "GA4 organic funnel quarter over quarter",
    "CallRail organic calls QoQ",
    "Ahrefs backlink overview",
  ],
};

export default function ReportsPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportType>("qbr");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [committedSections, setCommittedSections] = useState<Record<string, CommittedSection>>({});
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitTargetMessageId, setCommitTargetMessageId] = useState<string | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualTargetSection, setManualTargetSection] = useState<ReportSection | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients.find(c => String(c.id) === selectedClientId) || null;

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      const cid = selectedClientId ? Number(selectedClientId) : undefined;
      const res = await apiRequest("POST", "/api/query", { query, clientId: cid });
      return res.json() as Promise<QueryResponse>;
    },
    onSuccess: (data, query) => {
      if (data.success) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: "assistant",
          content: data.commandDescription || "Results",
          response: data,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: "error",
          content: data.error || "Something went wrong",
          response: data,
          timestamp: new Date(),
        }]);
      }
      rqClient.invalidateQueries({ queryKey: ["/api/query-logs"] });
    },
  });

  const handleSubmit = () => {
    const query = inputValue.trim();
    if (!query || queryMutation.isPending) return;
    if (!selectedClientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      type: "user",
      content: query,
      timestamp: new Date(),
    }]);
    setInputValue("");
    queryMutation.mutate(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCommitClick = (messageId: string) => {
    setCommitTargetMessageId(messageId);
    setCommitDialogOpen(true);
  };

  const handleCommit = (sectionId: string) => {
    const msg = messages.find(m => m.id === commitTargetMessageId);
    if (!msg?.response) return;

    setCommittedSections(prev => ({
      ...prev,
      [sectionId]: {
        sectionId,
        messageId: msg.id,
        response: msg.response,
        committedAt: new Date(),
      },
    }));
    setMessages(prev => prev.map(m =>
      m.id === commitTargetMessageId ? { ...m, committedTo: sectionId } : m
    ));
    const sectionTitle = REPORT_SECTIONS[reportType].find(s => s.id === sectionId)?.title;
    toast({ title: `Committed to "${sectionTitle}"` });
  };

  const handleManualSave = (text: string) => {
    if (!manualTargetSection) return;
    setCommittedSections(prev => ({
      ...prev,
      [manualTargetSection.id]: {
        sectionId: manualTargetSection.id,
        manualText: text,
        committedAt: new Date(),
      },
    }));
    toast({ title: `"${manualTargetSection.title}" saved to report` });
  };

  const handleExampleClick = (example: string) => {
    if (!selectedClientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    const clientName = selectedClient?.name || "";
    setInputValue(`${example} for ${clientName}`);
    inputRef.current?.focus();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setCommittedSections({});
    setMessages([]);
  }, [reportType, selectedClientId]);

  const examples = EXAMPLE_QUERIES_BY_TYPE[reportType];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-48 shrink-0">
            {clientsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={String(client.id)} data-testid={`select-client-${client.id}`}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />

          <div className="flex gap-1.5">
            {(["biweekly", "monthly", "qbr"] as ReportType[]).map(type => (
              <Button
                key={type}
                size="sm"
                variant={reportType === type ? "default" : "outline"}
                onClick={() => setReportType(type)}
                data-testid={`button-report-type-${type}`}
              >
                {REPORT_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
        </div>

        {selectedClient && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{selectedClient.name}</span>
            <Minus className="w-3 h-3" />
            <span>{REPORT_TYPE_LABELS[reportType]}</span>
            <Minus className="w-3 h-3" />
            <span>{reportType === "biweekly" ? "14d vs 14d" : reportType === "monthly" ? "30d vs 30d" : "90d vs 90d"}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-center max-w-xl"
                >
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-5">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2" data-testid="text-welcome-title">
                    {selectedClient
                      ? `Building ${REPORT_TYPE_LABELS[reportType]} for ${selectedClient.name}`
                      : "Select a client to start"}
                  </h2>
                  <p className="text-muted-foreground mb-6 text-sm">
                    {selectedClient
                      ? `Ask questions about ${selectedClient.name}'s data, then commit each answer to the right panel to build your ${REPORT_TYPE_LABELS[reportType]} report.`
                      : "Choose a client and report type above, then ask questions to pull data from GSC, GA4, CallRail, Ahrefs, and more."
                    }
                  </p>

                  {selectedClient && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
                      {examples.map((example, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExampleClick(example)}
                          className="text-left p-3 rounded-md bg-muted/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
                          data-testid={`button-example-${idx}`}
                        >
                          <Search className="w-3 h-3 inline-block mr-2 opacity-50" />
                          {example} for {selectedClient.name}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto p-4 space-y-4">
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      {msg.type === "user" ? (
                        <div className="flex justify-end">
                          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                            <p className="text-sm">{msg.content}</p>
                          </div>
                        </div>
                      ) : msg.type === "error" ? (
                        <Card className="p-4 border-destructive/30 bg-destructive/5">
                          <p className="text-sm text-destructive">{msg.content}</p>
                          {msg.response?.suggestions && msg.response.suggestions.length > 0 && (
                            <div className="mt-2 flex gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">Did you mean:</span>
                              {msg.response.suggestions.map((s, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="cursor-pointer"
                                  onClick={() => handleExampleClick(`GSC queries for ${s}`)}
                                >
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Card>
                      ) : (
                        <Card className={`p-4 ${msg.committedTo ? "border-primary/30 bg-primary/5" : ""}`}>
                          {msg.committedTo && (
                            <div className="flex items-center gap-1.5 text-[10px] text-primary mb-2">
                              <CheckCircle2 className="w-3 h-3" />
                              Committed to "{REPORT_SECTIONS[reportType].find(s => s.id === msg.committedTo)?.title}"
                            </div>
                          )}
                          {msg.response && (
                            <ResultDisplay
                              response={msg.response}
                              onCommit={() => handleCommitClick(msg.id)}
                              isCommitted={!!msg.committedTo}
                            />
                          )}
                        </Card>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {queryMutation.isPending && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm text-muted-foreground">Pulling data…</span>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </Card>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t bg-background p-3">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedClient
                    ? `Ask about ${selectedClient.name}'s ${reportType === "biweekly" ? "14-day" : reportType === "monthly" ? "30-day" : "quarterly"} data…`
                    : "Select a client to start querying…"
                  }
                  disabled={!selectedClientId}
                  className="w-full min-h-[40px] max-h-[120px] resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pr-12 disabled:opacity-50"
                  rows={1}
                  data-testid="input-query"
                />
                <Button
                  size="icon"
                  className="absolute right-1.5 bottom-1.5"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || queryMutation.isPending || !selectedClientId}
                  data-testid="button-submit-query"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center max-w-3xl mx-auto">
              Results route to the right data source. Press "Commit to Report" on any result to add it to your checklist.
            </p>
          </div>
        </div>

        <div className="w-72 border-l flex-shrink-0 flex flex-col overflow-hidden">
          <ChecklistPanel
            reportType={reportType}
            committedSections={committedSections}
            onManualAdd={(section) => {
              setManualTargetSection(section);
              setManualDialogOpen(true);
            }}
            onGenerate={() => setGenerateDialogOpen(true)}
          />
        </div>
      </div>

      <CommitDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        reportType={reportType}
        committedSections={committedSections}
        onCommit={handleCommit}
      />

      <ManualInputDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        section={manualTargetSection}
        onSave={handleManualSave}
      />

      <GenerateReportDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        reportType={reportType}
        client={selectedClient}
        committedSections={committedSections}
      />
    </div>
  );
}
