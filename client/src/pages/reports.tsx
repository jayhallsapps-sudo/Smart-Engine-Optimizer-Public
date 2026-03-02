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
  Upload,
  Bug,
  Trash2,
  Calendar,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Client, CommandResult, SfReport } from "@shared/schema";
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

function inferSection(command: string, reportType: ReportType): string {
  const map: Record<ReportType, Record<string, string>> = {
    qbr: {
      gsc_qoq_queries: "qbr_scorecard",
      gsc_qoq_pages: "qbr_scorecard",
      ga4_qoq_organic_funnel: "qbr_scorecard",
      callrail_qoq_organic_calls: "qbr_scorecard",
      ctm_qoq_organic_calls: "qbr_scorecard",
      ahrefs_backlink_overview: "qbr_scorecard",
      semrush_organic_overview: "qbr_scorecard",
      ga4_qoq_organic_landing_pages: "qbr_drivers",
      callrail_qoq_top_landing_pages: "qbr_drivers",
      ctm_qoq_top_landing_pages: "qbr_drivers",
      ahrefs_keyword_rankings: "qbr_drivers",
      semrush_keyword_rankings: "qbr_drivers",
    },
    monthly: {
      ga4_qoq_organic_funnel: "mo_exec",
      callrail_qoq_organic_calls: "mo_exec",
      ctm_qoq_organic_calls: "mo_exec",
      ahrefs_backlink_overview: "mo_exec",
      semrush_organic_overview: "mo_exec",
      gsc_qoq_queries: "mo_visibility",
      gsc_qoq_pages: "mo_visibility",
      ahrefs_keyword_rankings: "mo_visibility",
      semrush_keyword_rankings: "mo_visibility",
      ga4_qoq_organic_landing_pages: "mo_conversion",
      callrail_qoq_top_landing_pages: "mo_conversion",
      ctm_qoq_top_landing_pages: "mo_conversion",
    },
    biweekly: {
      ga4_qoq_organic_funnel: "bw_topline",
      callrail_qoq_organic_calls: "bw_topline",
      ctm_qoq_organic_calls: "bw_topline",
      ahrefs_backlink_overview: "bw_topline",
      semrush_organic_overview: "bw_topline",
      gsc_qoq_queries: "bw_changes",
      gsc_qoq_pages: "bw_changes",
      ga4_qoq_organic_landing_pages: "bw_changes",
      callrail_qoq_top_landing_pages: "bw_changes",
      ctm_qoq_top_landing_pages: "bw_changes",
      ahrefs_keyword_rankings: "bw_changes",
      semrush_keyword_rankings: "bw_changes",
    },
  };
  return map[reportType]?.[command] ?? REPORT_SECTIONS[reportType].find(s => !s.manualInput)?.id ?? REPORT_SECTIONS[reportType][0].id;
}

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
      <div className="flex items-center gap-2 flex-wrap">
        {getCommandIcon(result.command)}
        <span className="text-sm font-medium">{commandDescription}</span>
        <Minus className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{dateRangeLabel}</span>
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

      {onCommit && (
        <div className="pt-1 flex justify-end">
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
              <><CheckCheck className="w-3 h-3 mr-1.5" /> Commit</>
            )}
          </Button>
        </div>
      )}
    </div>
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
  committedSections: Record<string, CommittedSection[]>;
}) {
  if (!client) return null;
  const sections = REPORT_SECTIONS[reportType];
  const dateRangeLabel = reportType === "biweekly" ? "Last 14 Days vs Previous 14 Days"
    : reportType === "monthly" ? "Last 30 Days vs Previous 30 Days"
    : "Last 90 Days vs Previous 90 Days";

  const now = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const formatSectionContent = (section: ReportSection): string => {
    const items = committedSections[section.id];
    if (!items || items.length === 0) return "[ No data committed ]";
    return items.map((committed, i) => {
      const prefix = items.length > 1 ? `[${i + 1}] ` : "";
      if (committed.manualText) return `${prefix}${committed.manualText}`;
      if (committed.response?.result) {
        const r = committed.response.result;
        const summaryLines = r.summary.map(s =>
          `  • ${s.label}: ${s.current} (vs ${s.previous} | ${s.deltaPercent})`
        ).join("\n");
        const tableCount = r.tables.length;
        return `${prefix}${committed.response.commandDescription ?? ""}${summaryLines ? "\n" + summaryLines : ""}${tableCount > 0 ? `\n  [${tableCount} data table${tableCount > 1 ? "s" : ""} attached]` : ""}`;
      }
      return `${prefix}[ Data committed ]`;
    }).join("\n\n");
  };

  const narrativeInstruction = `REPORT FRAMING — TRUSTED ADVISOR NARRATIVE
Frame each section as a trusted advisor, not a traffic reporter.
For every insight answer: what happened → why it happened → what we're doing next → what we need from the client.
Tie all findings to business outcomes: admissions leads, insurance verifications (VOBs), and confirmed admissions. Traffic alone is never the story.
${"━".repeat(48)}`;

  const reportText = [
    `${REPORT_TYPE_LABELS[reportType].toUpperCase()} REPORT`,
    `Client: ${client.name}`,
    `Date: ${now}`,
    `Date Range: ${dateRangeLabel}`,
    "",
    narrativeInstruction,
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
  committedSections: Record<string, CommittedSection[]>;
  onManualAdd: (section: ReportSection) => void;
  onGenerate: () => void;
}) {
  const sections = REPORT_SECTIONS[reportType];
  const filledCount = sections.filter(s => (committedSections[s.id]?.length ?? 0) > 0).length;
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
          const items = committedSections[section.id] ?? [];
          const hasItems = items.length > 0;
          const SIcon = section.icon;
          return (
            <div
              key={section.id}
              className={`rounded-md border p-3 transition-colors ${hasItems ? "border-primary/30 bg-primary/5" : "border-border"}`}
              data-testid={`checklist-item-${section.id}`}
            >
              <div className="flex items-start gap-2">
                {hasItems ? (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium leading-tight">{section.title}</p>
                    {items.length > 1 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{items.length}</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{section.description}</p>
                  {!hasItems && section.dateRange && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{section.dateRange}</p>
                  )}
                  {items.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {items.map((item, i) => (
                        <p key={i} className="text-[10px] text-primary/80 truncate">
                          {item.manualText
                            ? item.manualText.slice(0, 60) + (item.manualText.length > 60 ? "…" : "")
                            : item.response?.commandDescription ?? "Data committed"}
                        </p>
                      ))}
                    </div>
                  )}
                  {section.manualInput && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 mt-1"
                      onClick={() => onManualAdd(section)}
                      data-testid={`button-manual-${section.id}`}
                    >
                      {hasItems ? "+ Add more" : "+ Add manually"}
                    </Button>
                  )}
                  {!hasItems && !section.manualInput && section.hints.length > 0 && (
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

const PROMPTS_LIBRARY: Record<ReportType, { label: string; prompt: string }[]> = {
  biweekly: [
    {
      label: "Combined funnel snapshot",
      prompt: "Pull the combined organic funnel for the last 14 days vs the prior 14 days. Show: organic sessions, form conversions, organic calls, total leads (forms + calls), and lead CVR. Present as a single summary block.",
    },
    {
      label: "QTD funnel vs goal",
      prompt: "Pull quarter-to-date organic sessions, total leads (forms + calls), and CVR. Compare each to the quarterly goal. Flag any metric that is more than 10% below pace.",
    },
    {
      label: "Top 10 pages by sessions",
      prompt: "Show the top 10 landing pages by organic sessions for the last 14 days vs the prior 14 days. For each page include: sessions, form conversions, organic calls, total leads, CVR, and session delta %.",
    },
    {
      label: "Top 10 pages by conversions",
      prompt: "Show the top 10 landing pages sorted by total leads (forms + calls) for the last 14 days vs the prior 14 days. Include sessions, forms, calls, total leads, CVR, and lead delta %.",
    },
    {
      label: "Session movers (up & down)",
      prompt: "Show the top 5 pages that gained the most organic sessions and the top 5 that lost the most organic sessions over the last 14 days vs prior 14. Include current sessions, previous sessions, absolute delta, and delta %.",
    },
    {
      label: "Conversion movers (up & down)",
      prompt: "Show the top 5 pages that gained the most total leads (calls + forms) and the top 5 that lost the most leads over the last 14 days. Include current leads, previous leads, delta, and delta %.",
    },
    {
      label: "Top 20 GSC queries table",
      prompt: "Pull the top 20 non-branded GSC queries by clicks for the last 14 days. For each query show: clicks, impressions, CTR, average position, and all four metrics vs the prior 14 days with delta columns.",
    },
    {
      label: "GSC traffic snapshot",
      prompt: "Pull aggregate GSC clicks, impressions, CTR, and average position for the last 14 days vs the prior 14 days. Flag any metric that moved more than 10%.",
    },
    {
      label: "Call tracking summary",
      prompt: "Summarise call tracking for the last 14 days: total calls, answered rate, qualified rate, and top 5 traffic sources by call volume. Compare answered and qualified rates to the prior 14-day period and flag any drop.",
    },
    {
      label: "Work log by category",
      prompt: "Pull the work log for the last 14 days. Group items by category: Content (published / refreshed), Technical, Internal Linking, Local/GBP, Authority/Links. Show each task as a bullet under its category heading.",
    },
    {
      label: "New & updated pages tracker",
      prompt: "List all pages published or significantly updated in the last 30 days. For each show: URL, target keyword, current GSC index status, and early GSC signal (clicks and impressions to date).",
    },
    {
      label: "Tracking anomaly check",
      prompt: "Run a tracking health check across GA4, call tracking, and GSC for the last 14 days. Flag: missing or misfiring GA4 events, unexpected drops in call attribution, GSC data gaps, or redirect anomalies. List each issue with priority level.",
    },
  ],
  monthly: [
    {
      label: "Combined funnel MoM",
      prompt: "Pull the full organic funnel for this month vs last month. Show: engaged sessions, form conversions, organic calls, total leads (forms + calls), and CVR. Flag each metric with MoM delta % and highlight anything more than 15% off.",
    },
    {
      label: "YoY monthly comparison",
      prompt: "Compare this month's organic performance to the same month last year. Show: organic sessions, organic calls, form conversions, total leads, and CVR — all with YoY delta % and context on seasonality.",
    },
    {
      label: "GSC monthly snapshot",
      prompt: "Pull GSC clicks, impressions, CTR, and average position for this month vs last month. Highlight any metric that moved more than 15%.",
    },
    {
      label: "Top 30 GSC queries with MoM delta",
      prompt: "Pull the top 30 non-branded GSC queries by clicks for this month. Show clicks, impressions, CTR, position, and MoM delta for each metric. Highlight queries where position improved by 3+ places or clicks dropped more than 20%.",
    },
    {
      label: "Top 20 pages — full funnel MoM",
      prompt: "Pull the top 20 landing pages by organic sessions for this month. For each show: sessions, forms, calls, total leads, CVR, and MoM delta for sessions and leads. Flag pages with more than 20% drop in either metric.",
    },
    {
      label: "Top 20 pages by conversions",
      prompt: "Pull the top 20 landing pages sorted by total leads (forms + calls) for this month vs last month. Include sessions, forms, calls, total leads, CVR, and lead delta %.",
    },
    {
      label: "High impressions / low CTR finder",
      prompt: "Find the top 15 non-branded queries with more than 5,000 impressions this month and below-average CTR. Include impressions, clicks, CTR, and average position. These are title/meta description optimisation opportunities.",
    },
    {
      label: "High traffic / low CVR diagnostic",
      prompt: "Find the top 15 pages with above-average organic sessions but below-average lead CVR for this month. Show sessions, total leads, CVR, the site average CVR, and the gap. These are CRO priority targets.",
    },
    {
      label: "Content output summary",
      prompt: "List all pages published or refreshed this month. For each show: page title or URL, whether it was new or a refresh, target keyword, publication date, and early GSC performance (impressions and clicks to date).",
    },
    {
      label: "Technical health summary",
      prompt: "Summarise technical SEO work for the month from Screaming Frog and SEMrush. Show: issues found, issues fixed, outstanding issues, and the top 3–5 remaining critical items with priority and page count affected.",
    },
    {
      label: "Core Web Vitals trend",
      prompt: "Pull Core Web Vitals status from GSC for this month. Show % of URLs passing Good thresholds for LCP, CLS, and INP (or FID). Flag any regression vs the prior month and list specific failing URL templates.",
    },
    {
      label: "GBP / Local SEO summary",
      prompt: "Summarise Google Business Profile performance for the month: new reviews, average rating change, posts published, and GBP interactions (calls, direction requests, website clicks). Compare to the prior month.",
    },
    {
      label: "SEMrush / Ahrefs visibility",
      prompt: "Pull organic visibility and keyword growth from SEMrush and/or Ahrefs for this month vs last month. Show: total keywords tracked, top 3/10/20 counts, DR or Authority Score, and the top 3 competitor visibility scores.",
    },
    {
      label: "Work log by category",
      prompt: "Pull the work log for this month. Group items by category: Content (published / refreshed), Technical, CRO/UX, Internal Linking, Local/GBP, Authority/Links. Show each task as a bullet under its category heading.",
    },
    {
      label: "Next-month backlog priorities",
      prompt: "Based on this month's performance data, list the top 5 SEO priorities for next month. For each: what the task is, which metric it addresses, and the expected impact. Rank by estimated lead or sessions impact.",
    },
  ],
  qbr: [
    {
      label: "QoQ funnel (sessions → leads)",
      prompt: "Pull the full organic funnel for this quarter vs the prior quarter. Show: organic sessions, form conversions, organic calls, total leads (forms + calls), CVR, and QoQ delta % for each. This is the top-line funnel block for the QBR deck.",
    },
    {
      label: "YoY quarterly comparison",
      prompt: "Compare this quarter to the same quarter last year. Show the same funnel metrics — sessions, forms, calls, total leads, CVR — plus VOB volume if available, all with YoY delta % and seasonality context.",
    },
    {
      label: "Monthly trendline within quarter",
      prompt: "Break down the quarter into its 3 months. For each month show: organic sessions, organic calls, form conversions, total leads, and CVR. Identify whether we're accelerating, flat, or decelerating within the quarter.",
    },
    {
      label: "GSC QoQ snapshot",
      prompt: "Pull GSC clicks, impressions, CTR, and average position for this quarter vs the prior quarter. Show QoQ delta for each metric and flag any significant shifts.",
    },
    {
      label: "Top 50 GSC queries with QoQ delta",
      prompt: "Pull the top 50 non-branded GSC queries by clicks for this quarter. Show clicks, impressions, CTR, average position, and QoQ delta for each. Highlight the top 10 movers in each direction.",
    },
    {
      label: "Top 50 landing pages with QoQ delta",
      prompt: "Pull the top 50 landing pages by organic sessions for this quarter. Show sessions, forms, calls, total leads, CVR, and QoQ delta for sessions and leads. Flag pages that entered or exited the top 50.",
    },
    {
      label: "Query-to-page conversion map",
      prompt: "For the top 20 landing pages by total leads this quarter, pull the top 2–3 non-branded GSC queries driving clicks to each page. Show page URL, clicks, leads, CVR, and the primary queries alongside their impressions and CTR.",
    },
    {
      label: "Keyword distribution by tier (QoQ)",
      prompt: "Pull keyword distribution by position tier from SEMrush for this quarter vs last quarter: Top 3, Top 4–10, Top 11–20. Show counts and QoQ delta for each tier. Flag whether we're moving keywords up-funnel.",
    },
    {
      label: "Competitor domain visibility (QoQ)",
      prompt: "Pull the top 10 competitor domains by organic visibility from SEMrush or Ahrefs. Show their QoQ visibility % change alongside our own. Identify which competitors are gaining or losing ground relative to us.",
    },
    {
      label: "Content production summary",
      prompt: "Summarise all content published and refreshed during the quarter. For each piece: title/URL, type (new or refresh), target keyword, publish date, and current GSC performance (clicks and impressions). Highlight any pages that broke into top-50 queries.",
    },
    {
      label: "Technical SEO quarterly",
      prompt: "Summarise technical SEO for the quarter: total issues opened, issues resolved, critical issues outstanding. List the top 5 unresolved issues with priority level, page templates affected, and estimated organic impact.",
    },
    {
      label: "Indexation stability",
      prompt: "Pull GSC coverage report for this quarter vs the prior quarter. Show total indexed pages, total excluded pages, and a breakdown of exclusion reasons (not indexed, duplicate, redirect, etc.). Flag any trend that could affect organic reach.",
    },
    {
      label: "GBP / Local quarterly",
      prompt: "Summarise GBP performance across the quarter: total reviews received, average rating and trend, posts published, and total GBP interactions (calls, directions, website clicks). Compare to the prior quarter.",
    },
    {
      label: "Call quality quarterly",
      prompt: "Summarise call performance for the quarter from CallRail or CTM: total organic calls, answered rate, qualified rate, average call duration, and the top 5 landing pages by call volume. Compare each metric to the prior quarter.",
    },
    {
      label: "Top 10 wins (tied to metrics)",
      prompt: "List the top 10 wins from the quarter. Each win must be tied to a measurable outcome — e.g., 'Detox page moved from position 14 to 6, +40 clicks/month' or 'Insurance verification page CVR improved from 2.1% to 3.4%'. Be specific.",
    },
    {
      label: "Top 10 risks & problems",
      prompt: "List the top 10 risks or underperformance issues from the quarter. Each must reference the specific metric or page affected — e.g., 'Homepage organic sessions down 18% QoQ with no clear technical cause' or '3 money pages still not indexed'. Include recommended next step.",
    },
    {
      label: "Next-quarter forecast",
      prompt: "Build a Q+1 forecast with three scenarios — base, upside, downside — for organic sessions and total leads. State the key assumptions behind each scenario (e.g., content volume, link acquisition, algorithm stability). Express as ranges, not single point estimates.",
    },
  ],
};

function PromptsPanel({
  reportType,
  onSelectPrompt,
}: {
  reportType: ReportType;
  onSelectPrompt: (prompt: string) => void;
}) {
  const prompts = PROMPTS_LIBRARY[reportType];
  const labels: Record<ReportType, string> = {
    biweekly: "Bi-weekly Prompts",
    monthly: "Monthly Prompts",
    qbr: "QBR Prompts",
  };
  return (
    <div className="flex flex-col h-full w-64 border-r bg-muted/20">
      <div className="px-3 py-2.5 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--prompt-title))" }}>{labels[reportType]}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {prompts.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelectPrompt(p.prompt)}
            className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors group"
            data-testid={`prompt-item-${i}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: "hsl(var(--prompt-title) / 0.75)" }}>
              {i + 1}. {p.label}
            </span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground leading-snug line-clamp-2">
              {p.prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportType>("qbr");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [committedSections, setCommittedSections] = useState<Record<string, CommittedSection[]>>({});
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualTargetSection, setManualTargetSection] = useState<ReportSection | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sfPopoverOpen, setSfPopoverOpen] = useState(false);
  const [sfUploading, setSfUploading] = useState(false);
  const [promptsPanelOpen, setPromptsPanelOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sfFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients.find(c => String(c.id) === selectedClientId) || null;

  const { data: sfReports = [] } = useQuery<SfReport[]>({
    queryKey: ["/api/clients", selectedClientId, "sf-reports"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${selectedClientId}/sf-reports`);
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const deleteSfReportMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sf-reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      rqClient.invalidateQueries({ queryKey: ["/api/clients", selectedClientId, "sf-reports"] });
      toast({ title: "Crawl removed" });
    },
  });

  const handleSfUpload = async (file: File) => {
    setSfUploading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("File appears empty");
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").replace(/^"|"$/g, "").trim(); });
        return obj;
      });
      const today = new Date().toISOString().split("T")[0];
      const body = {
        reportDate: today,
        filename: file.name,
        rowCount: rows.length,
        headers,
        data: rows,
      };
      const res = await fetch(`/api/clients/${selectedClientId}/sf-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Upload failed");
      rqClient.invalidateQueries({ queryKey: ["/api/clients", selectedClientId, "sf-reports"] });
      toast({ title: "Crawl uploaded", description: `${rows.length} rows from ${file.name}` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setSfUploading(false);
      if (sfFileInputRef.current) sfFileInputRef.current.value = "";
    }
  };

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
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.response?.result) return;
    const sectionId = inferSection(msg.response.result.command, reportType);
    const sectionTitle = REPORT_SECTIONS[reportType].find(s => s.id === sectionId)?.title;
    setCommittedSections(prev => ({
      ...prev,
      [sectionId]: [
        ...(prev[sectionId] ?? []),
        {
          sectionId,
          messageId: msg.id,
          response: msg.response,
          committedAt: new Date(),
        },
      ],
    }));
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, committedTo: sectionId } : m
    ));
    toast({ title: `Committed to "${sectionTitle}"` });
  };

  const handleManualSave = (text: string) => {
    if (!manualTargetSection) return;
    setCommittedSections(prev => ({
      ...prev,
      [manualTargetSection.id]: [
        ...(prev[manualTargetSection.id] ?? []),
        {
          sectionId: manualTargetSection.id,
          manualText: text,
          committedAt: new Date(),
        },
      ],
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
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setPromptsPanelOpen(v => !v)}
          className="shrink-0"
          title={promptsPanelOpen ? "Hide prompts" : "Show prompts"}
          data-testid="button-toggle-prompts"
        >
          {promptsPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </Button>
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

          {selectedClientId && (
            <>
              <div className="w-px h-5 bg-border shrink-0" />
              <Popover open={sfPopoverOpen} onOpenChange={setSfPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                    data-testid="button-sf-reports"
                  >
                    <Bug className="w-3.5 h-3.5" />
                    Screaming Frog
                    {sfReports.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 ml-0.5">
                        {sfReports.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0" data-testid="popover-sf-reports">
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium">Screaming Frog Crawls</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Upload CSV exports from Screaming Frog desktop app</p>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {sfReports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                        <Bug className="w-7 h-7 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">No crawls uploaded yet</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Export as CSV from Screaming Frog, then upload below</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {sfReports.map(report => (
                          <div key={report.id} className="flex items-start gap-2 p-3 hover:bg-muted/40 transition-colors" data-testid={`row-sf-report-${report.id}`}>
                            <FileText className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{report.filename}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {report.reportDate}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{report.rowCount.toLocaleString()} rows</span>
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteSfReportMutation.mutate(report.id)}
                              data-testid={`button-delete-sf-${report.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t">
                    <input
                      ref={sfFileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleSfUpload(f); }}
                      data-testid="input-sf-file"
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => sfFileInputRef.current?.click()}
                      disabled={sfUploading}
                      data-testid="button-sf-upload"
                    >
                      {sfUploading ? (
                        <><span className="animate-spin mr-1.5">⏳</span>Uploading…</>
                      ) : (
                        <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload New Crawl</>
                      )}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
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
        {promptsPanelOpen && (
          <PromptsPanel
            reportType={reportType}
            onSelectPrompt={(prompt) => {
              setInputValue(prompt);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          />
        )}
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
                className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                rows={1}
                data-testid="input-query"
              />
              <Button
                size="icon"
                className="shrink-0"
                onClick={handleSubmit}
                disabled={!inputValue.trim() || queryMutation.isPending || !selectedClientId}
                data-testid="button-submit-query"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center max-w-3xl mx-auto">
              Results route to the right data source. Press "Commit" on any result to add it to your report.
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
