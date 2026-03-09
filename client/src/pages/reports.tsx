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
  Zap,
  Loader2,
  Pencil,
  Play,
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
  liveSource?: string;
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

interface WorkLogRow {
  area: string;
  whatWeDid: string;
  whatsNext: string;
}

interface CommittedSection {
  sectionId: string;
  messageId?: string;
  response?: QueryResponse;
  manualText?: string;
  workLogRows?: WorkLogRow[];
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
      id: "bw_purpose",
      title: "Purpose",
      description: "Auto-filled: meeting purpose statement",
      icon: FileText,
      manualInput: false,
      hints: [],
      dateRange: "",
    },
    {
      id: "bw_pulse",
      title: "Performance Pulse & Key Insights",
      description: "Organic traffic trends, lead pacing, and what's driving movement",
      icon: TrendingUp,
      manualInput: false,
      hints: ["GSC query performance last 14 days", "Organic funnel last 14 days", "CallRail organic calls last 14 days", "Session movers last 14 days"],
      dateRange: "Last 14 days vs previous 14 days",
    },
    {
      id: "bw_progress",
      title: "Progress & Quick Wins",
      description: "Work completed — Area, What We Did / Learned, What's Next",
      icon: ClipboardList,
      manualInput: true,
      hints: ["work log last 14 days"],
      dateRange: "",
    },
    {
      id: "bw_partnership",
      title: "Partnerships & Alignment",
      description: "Open discussion, feedback, next steps, and upcoming deliverables",
      icon: CheckCircle2,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
  ],
  monthly: [
    {
      id: "mo_qtd",
      title: "QTD Key Performance Indicators",
      description: "Quarter-to-date organic sessions, leads, CVR vs goal",
      icon: TrendingUp,
      manualInput: false,
      hints: ["Quarter to date sessions and leads", "QTD totals this quarter", "QTD sessions and leads"],
      dateRange: "Quarter to date",
    },
    {
      id: "mo_conversion",
      title: "Top Conversion Locations",
      description: "Top organic landing pages by leads & CVR, call volume by page",
      icon: BarChart3,
      manualInput: false,
      hints: ["Top pages by conversions this month", "GA4 organic landing pages by conversions", "CallRail organic calls by landing page"],
      dateRange: "Last 30 days",
    },
    {
      id: "mo_gsc",
      title: "Google Search Console Performance",
      description: "Clicks, impressions, CTR, position — MoM trends and top queries",
      icon: Globe,
      manualInput: false,
      hints: ["GSC query performance month over month", "Top queries last 30 days", "Page performance last 30 days"],
      dateRange: "Last 30 days vs previous 30 days",
    },
    {
      id: "mo_keywords",
      title: "Keyword Tracking",
      description: "Keyword rankings, distribution, and visibility from SEMrush",
      icon: Search,
      manualInput: false,
      hints: ["SEMrush keyword distribution", "SEMrush keyword rankings this month", "Keyword distribution by tier"],
      dateRange: "Last 30 days",
    },
    {
      id: "mo_initiatives",
      title: "Supporting Strategic Initiatives",
      description: "Work completed this month and outcomes delivered",
      icon: GitMerge,
      manualInput: true,
      hints: ["work log this month"],
      dateRange: "",
    },
    {
      id: "mo_audit",
      title: "AUDIT Content",
      description: "Technical health, crawl issues, Core Web Vitals, indexation",
      icon: Bug,
      manualInput: true,
      hints: ["Technical health summary", "Core Web Vitals trend", "Indexation stability"],
      dateRange: "",
    },
    {
      id: "mo_content",
      title: "Content Completion",
      description: "Pages published, refreshed, and early GSC performance signals",
      icon: CalendarCheck,
      manualInput: true,
      hints: ["Content output summary", "New & updated pages tracker"],
      dateRange: "",
    },
  ],
  qbr: [
    {
      id: "qbr_performance",
      title: "Performance Review",
      description: "Full funnel QoQ: GSC, GA4 organic, CallRail calls, keyword rankings",
      icon: TrendingUp,
      manualInput: false,
      hints: ["GSC QoQ query performance", "GA4 organic funnel quarter over quarter", "CallRail organic calls QoQ", "SEMrush organic overview QoQ"],
      dateRange: "Last 90 days vs previous 90 days",
    },
    {
      id: "qbr_strategy",
      title: "Strategy Overview",
      description: "Top pages that drove leads, query intent shifts, keyword wins/losses",
      icon: GitMerge,
      manualInput: false,
      hints: ["GA4 landing pages quarter over quarter", "GSC queries quarter over quarter", "Keyword distribution by tier QoQ"],
      dateRange: "Last 90 days",
    },
    {
      id: "qbr_strategic_plan",
      title: "Strategic Plan",
      description: "Data-backed strategic insights and recommendations for next quarter",
      icon: Lightbulb,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "qbr_roadmap",
      title: "Roadmap & Alignment",
      description: "Prioritized Q+1 initiatives: Technical, Content, CRO/UX, Local",
      icon: CalendarCheck,
      manualInput: true,
      hints: [],
      dateRange: "",
    },
    {
      id: "qbr_partnership",
      title: "Partnership Items",
      description: "Risks, blockers, dependencies, and open client discussion items",
      icon: AlertTriangle,
      manualInput: true,
      hints: [],
      dateRange: "",
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

const AUTO_BUILD_PERIOD_LABEL: Record<ReportType, string> = {
  biweekly: "Last 14 days vs previous 14 days",
  monthly: "Last 30 days vs previous 30 days",
  qbr: "Last 90 days vs previous 90 days",
};

const MANUAL_SECTIONS = new Set([
  "bw_purpose", "bw_partnership",
  "qbr_strategic_plan", "qbr_roadmap", "qbr_partnership",
]);

type BuildPhase = "idle" | "building" | "complete";
interface SectionBuildStatus {
  status: "waiting" | "loading" | "done" | "empty" | "manual";
  itemCount: number;
}

function inferSection(command: string, reportType: ReportType): string {
  const map: Record<ReportType, Record<string, string>> = {
    qbr: {
      gsc_qoq_queries: "qbr_performance",
      gsc_qoq_pages: "qbr_performance",
      ga4_qoq_organic_funnel: "qbr_performance",
      callrail_qoq_organic_calls: "qbr_performance",
      ctm_qoq_organic_calls: "qbr_performance",
      ahrefs_backlink_overview: "qbr_performance",
      semrush_organic_overview: "qbr_performance",
      ga4_combined_funnel: "qbr_performance",
      monthly_trendline: "qbr_performance",
      ga4_qoq_organic_landing_pages: "qbr_strategy",
      callrail_qoq_top_landing_pages: "qbr_strategy",
      ctm_qoq_top_landing_pages: "qbr_strategy",
      ahrefs_keyword_rankings: "qbr_strategy",
      semrush_keyword_rankings: "qbr_strategy",
      semrush_keyword_distribution: "qbr_strategy",
      semrush_competitor_visibility: "qbr_strategy",
      ahrefs_competitor_visibility: "qbr_strategy",
      gsc_top_queries: "qbr_strategy",
      gsc_query_to_page_map: "qbr_strategy",
      content_output_summary: "qbr_strategic_plan",
      technical_health_summary: "qbr_strategic_plan",
      quarterly_forecast: "qbr_roadmap",
      airtable_work_log: "qbr_strategic_plan",
    },
    monthly: {
      ga4_qtd_totals: "mo_qtd",
      ga4_combined_funnel: "mo_qtd",
      ga4_qoq_organic_funnel: "mo_qtd",
      callrail_summary: "mo_qtd",
      ga4_landing_pages_by_conversions: "mo_conversion",
      ga4_high_traffic_low_cvr: "mo_conversion",
      callrail_qoq_organic_calls: "mo_qtd",
      callrail_qoq_top_landing_pages: "mo_conversion",
      ctm_qoq_organic_calls: "mo_qtd",
      ctm_qoq_top_landing_pages: "mo_conversion",
      gsc_qoq_queries: "mo_gsc",
      gsc_qoq_pages: "mo_gsc",
      gsc_top_queries: "mo_gsc",
      gsc_high_impressions_low_ctr: "mo_gsc",
      gsc_indexation_stability: "mo_audit",
      ahrefs_keyword_rankings: "mo_keywords",
      semrush_keyword_rankings: "mo_keywords",
      semrush_keyword_distribution: "mo_keywords",
      ahrefs_backlink_overview: "mo_keywords",
      semrush_organic_overview: "mo_keywords",
      airtable_work_log: "mo_initiatives",
      content_output_summary: "mo_content",
      new_pages_tracker: "mo_content",
      technical_health_summary: "mo_audit",
      core_web_vitals: "mo_audit",
      tracking_anomaly_check: "mo_audit",
      gbp_local_summary: "mo_initiatives",
      monthly_trendline: "mo_gsc",
      ga4_yoy_comparison: "mo_gsc",
      ga4_session_movers: "mo_conversion",
      ga4_conversion_movers: "mo_conversion",
      ga4_landing_pages_by_sessions: "mo_conversion",
      gsc_high_traffic_low_cvr: "mo_conversion",
    },
    biweekly: {
      ga4_qoq_organic_funnel: "bw_pulse",
      ga4_combined_funnel: "bw_pulse",
      ga4_qtd_totals: "bw_pulse",
      callrail_qoq_organic_calls: "bw_pulse",
      callrail_summary: "bw_pulse",
      ctm_qoq_organic_calls: "bw_pulse",
      gsc_qoq_queries: "bw_pulse",
      gsc_qoq_pages: "bw_pulse",
      gsc_top_queries: "bw_pulse",
      ga4_qoq_organic_landing_pages: "bw_pulse",
      ga4_landing_pages_by_sessions: "bw_pulse",
      ga4_landing_pages_by_conversions: "bw_pulse",
      ga4_session_movers: "bw_pulse",
      ga4_conversion_movers: "bw_pulse",
      callrail_qoq_top_landing_pages: "bw_pulse",
      ctm_qoq_top_landing_pages: "bw_pulse",
      ahrefs_keyword_rankings: "bw_pulse",
      semrush_keyword_rankings: "bw_pulse",
      airtable_work_log: "bw_progress",
      content_output_summary: "bw_progress",
      new_pages_tracker: "bw_progress",
      technical_health_summary: "bw_progress",
      tracking_anomaly_check: "bw_progress",
      gbp_local_summary: "bw_progress",
    },
  };
  return map[reportType]?.[command] ?? REPORT_SECTIONS[reportType].find(s => !s.manualInput && s.id !== "bw_purpose")?.id ?? REPORT_SECTIONS[reportType][0].id;
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
  const { result, commandDescription, dateRangeLabel, liveSource } = response;

  const LIVE_SOURCE_LABELS: Record<string, string> = {
    gsc: "Live · GSC",
    ga4: "Live · GA4",
    screaming_frog: "Live · Screaming Frog",
    callrail: "Live · CallRail",
    ctm: "Live · CTM",
    semrush: "Live · SEMrush",
    gbp: "Live · GBP",
  };

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
        {liveSource && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            {LIVE_SOURCE_LABELS[liveSource] ?? "Live"}
          </span>
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
  onSaveWorkLog,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: ReportSection | null;
  onSave: (text: string) => void;
  onSaveWorkLog?: (rows: WorkLogRow[]) => void;
}) {
  const [text, setText] = useState("");
  const [wlArea, setWlArea] = useState("");
  const [wlDid, setWlDid] = useState("");
  const [wlNext, setWlNext] = useState("");
  const [wlRows, setWlRows] = useState<WorkLogRow[]>([]);

  useEffect(() => {
    if (open) {
      setText("");
      setWlArea("");
      setWlDid("");
      setWlNext("");
      setWlRows([]);
    }
  }, [open]);

  if (!section) return null;

  const isWorkLog = section.id === "bw_progress";

  const handleAddRow = () => {
    if (!wlDid.trim()) return;
    setWlRows(prev => [...prev, { area: wlArea.trim(), whatWeDid: wlDid.trim(), whatsNext: wlNext.trim() }]);
    setWlArea("");
    setWlDid("");
    setWlNext("");
  };

  const handleRemoveRow = (idx: number) => {
    setWlRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveWorkLog = () => {
    const finalRows = [...wlRows];
    if (wlDid.trim()) finalRows.push({ area: wlArea.trim(), whatWeDid: wlDid.trim(), whatsNext: wlNext.trim() });
    if (finalRows.length === 0) return;
    onSaveWorkLog?.(finalRows);
    onOpenChange(false);
  };

  if (isWorkLog) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Progress & Quick Wins</DialogTitle>
            <DialogDescription>Add work items — Area, What We Did / Learned, What's Next</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            {wlRows.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-[22%]">Area</TableHead>
                      <TableHead className="text-[10px] w-[38%]">What We Did / Learned</TableHead>
                      <TableHead className="text-[10px] w-[33%]">What's Next</TableHead>
                      <TableHead className="text-[10px] w-[7%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wlRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs py-1.5">{row.area || "—"}</TableCell>
                        <TableCell className="text-xs py-1.5">{row.whatWeDid}</TableCell>
                        <TableCell className="text-xs py-1.5">{row.whatsNext || "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleRemoveRow(i)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">Add a row</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Area</label>
                  <input
                    value={wlArea}
                    onChange={e => setWlArea(e.target.value)}
                    placeholder="e.g. New Content"
                    className="w-full text-xs rounded border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid="input-wl-area"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">What We Did / Learned</label>
                  <Textarea
                    value={wlDid}
                    onChange={e => setWlDid(e.target.value)}
                    placeholder="What we delivered or learned…"
                    className="text-xs min-h-[60px] resize-none"
                    data-testid="input-wl-did"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">What's Next</label>
                  <Textarea
                    value={wlNext}
                    onChange={e => setWlNext(e.target.value)}
                    placeholder="Next steps…"
                    className="text-xs min-h-[60px] resize-none"
                    data-testid="input-wl-next"
                  />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleAddRow} disabled={!wlDid.trim()} data-testid="button-add-wl-row">
                + Add Row
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSaveWorkLog}
              disabled={wlRows.length === 0 && !wlDid.trim()}
              data-testid="button-save-manual"
            >
              Save to Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
  const [attendees, setAttendees] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDriveLink(null);
      setAttendees("");
    }
  }, [open]);

  if (!client) return null;

  const now = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const fileExt = reportType === "biweekly" ? "docx" : "pptx";
  const fileLabel = reportType === "biweekly" ? ".docx" : ".pptx";

  const sections = REPORT_SECTIONS[reportType];
  const filledCount = sections.filter(s =>
    s.id === "bw_purpose" || (committedSections[s.id]?.length ?? 0) > 0
  ).length;

  function buildSectionsPayload() {
    return sections
      .filter(s => s.id !== "bw_purpose")
      .map(s => {
        const items = committedSections[s.id] ?? [];
        return {
          sectionId: s.id,
          title: s.title,
          items: items.map(committed => {
            if (committed.workLogRows) {
              return { tableRows: committed.workLogRows };
            }
            if (committed.manualText) {
              return { manualText: committed.manualText };
            }
            if (committed.response?.result) {
              const r = committed.response.result;
              return {
                commandDescription: committed.response.commandDescription,
                dateRangeLabel: committed.response.dateRangeLabel,
                summary: r.summary.map(s => ({
                  label: s.label,
                  current: s.current,
                  previous: s.previous,
                  deltaPercent: s.deltaPercent,
                  isPositive: s.isPositive,
                })),
                tables: r.tables.map(t => ({
                  title: t.title,
                  headers: t.headers,
                  rows: t.rows,
                })),
              };
            }
            return {};
          }).filter(i => Object.keys(i).length > 0),
        };
      });
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          clientId: client.id,
          sections: buildSectionsPayload(),
          attendees,
          date: now,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.message || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${client.name.toLowerCase().replace(/\s+/g, "_")}_${reportType}_${Date.now()}.${fileExt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Report downloaded as ${fileLabel}` });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadToDrive = async () => {
    setUploading(true);
    setDriveLink(null);
    try {
      const res = await fetch("/api/reports/upload-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          clientId: client.id,
          sections: buildSectionsPayload(),
          attendees,
          date: now,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setDriveLink(data.webViewLink);
      toast({ title: "Uploaded to Google Drive", description: data.fileName });
    } catch (err: any) {
      toast({ title: "Drive upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{REPORT_TYPE_LABELS[reportType]} Report — {client.name}</DialogTitle>
          <DialogDescription>
            {filledCount} of {sections.length} sections filled
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {reportType === "biweekly" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Attendees</label>
              <input
                value={attendees}
                onChange={e => setAttendees(e.target.value)}
                placeholder="Names of meeting attendees…"
                className="w-full text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-attendees"
              />
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            {sections.map(s => {
              const filled = s.id === "bw_purpose" || (committedSections[s.id]?.length ?? 0) > 0;
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  {filled
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  }
                  <span className={filled ? "text-foreground" : "text-muted-foreground"}>{s.title}</span>
                  {!filled && <span className="text-muted-foreground/60 italic">(empty)</span>}
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {reportType === "biweekly"
              ? "Downloads as a formatted Word document (.docx)"
              : "Downloads as a PowerPoint presentation (.pptx)"}
            {" — or upload directly to Google Drive."}
          </div>

          {driveLink && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Uploaded to Google Drive</p>
                <a
                  href={driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline truncate block"
                  data-testid="link-drive-file"
                >
                  Open in Google Drive →
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleUploadToDrive}
            disabled={uploading || downloading}
            className="w-full sm:w-auto"
            data-testid="button-upload-drive"
          >
            {uploading ? (
              <><div className="w-3.5 h-3.5 mr-1.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Uploading…</>
            ) : (
              <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload to Google Drive</>
            )}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={downloading || uploading}
            className="w-full sm:w-auto"
            data-testid="button-download-report"
          >
            {downloading ? (
              <><div className="w-3.5 h-3.5 mr-1.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Generating…</>
            ) : (
              <><Download className="w-3.5 h-3.5 mr-1.5" />Download {fileLabel}</>
            )}
          </Button>
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
  const isFilled = (s: ReportSection) => s.id === "bw_purpose" || (committedSections[s.id]?.length ?? 0) > 0;
  const filledCount = sections.filter(isFilled).length;
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
          const isAutoPurpose = section.id === "bw_purpose";
          const hasItems = isAutoPurpose || items.length > 0;
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
                    {isAutoPurpose && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">auto</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{section.description}</p>
                  {!hasItems && section.dateRange && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{section.dateRange}</p>
                  )}
                  {isAutoPurpose && (
                    <p className="text-[10px] text-primary/70 mt-0.5 italic">Pre-filled from template</p>
                  )}
                  {!isAutoPurpose && items.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {items.map((item, i) => (
                        <p key={i} className="text-[10px] text-primary/80 truncate">
                          {item.workLogRows
                            ? `${item.workLogRows.length} work item${item.workLogRows.length > 1 ? "s" : ""}`
                            : item.manualText
                            ? item.manualText.slice(0, 60) + (item.manualText.length > 60 ? "…" : "")
                            : item.response?.commandDescription ?? "Data committed"}
                        </p>
                      ))}
                    </div>
                  )}
                  {!isAutoPurpose && section.manualInput && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 mt-1"
                      onClick={() => onManualAdd(section)}
                      data-testid={`button-manual-${section.id}`}
                    >
                      {items.length > 0 ? "+ Add more" : "+ Add manually"}
                    </Button>
                  )}
                  {!isAutoPurpose && !hasItems && !section.manualInput && section.hints.length > 0 && (
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
    "SEMrush organic overview QoQ",
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
      label: "SEMrush keyword visibility",
      prompt: "Pull organic visibility and keyword growth from SEMrush for this month vs last month. Show: total keywords tracked, top 3/10/20 counts, Authority Score, and the top 3 competitor visibility scores.",
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
      prompt: "Pull the top 10 competitor domains by organic visibility from SEMrush. Show their QoQ visibility % change alongside our own. Identify which competitors are gaining or losing ground relative to us.",
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

function AutoBuildLivePanel({
  reportType,
  selectedClient,
  buildPhase,
  sectionStatuses,
  onGenerateReport,
  onBackToManual,
  onManualAdd,
}: {
  reportType: ReportType;
  selectedClient: Client | null;
  buildPhase: BuildPhase;
  sectionStatuses: Record<string, SectionBuildStatus>;
  onGenerateReport: () => void;
  onBackToManual: () => void;
  onManualAdd: (section: ReportSection) => void;
}) {
  const sections = REPORT_SECTIONS[reportType];
  const autoSections = sections.filter(s => !MANUAL_SECTIONS.has(s.id));
  const doneCount = autoSections.filter(s => {
    const st = sectionStatuses[s.id]?.status;
    return st === "done" || st === "empty";
  }).length;
  const totalAuto = autoSections.length;
  const progressPct = totalAuto > 0 ? Math.round((doneCount / totalAuto) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b bg-background">
        <div className="flex items-center gap-3 mb-3">
          {buildPhase === "building" ? (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          )}
          <div>
            <p className="font-semibold text-sm">
              {buildPhase === "building" ? "Building" : "Built"} {REPORT_TYPE_LABELS[reportType]} · {selectedClient?.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {buildPhase === "building"
                ? `${doneCount} of ${totalAuto} data sections complete…`
                : "All data fetched — ready to generate"}
            </p>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {sections.map((section) => {
          const st = sectionStatuses[section.id];
          const isPurpose = section.id === "bw_purpose";
          const isManual = MANUAL_SECTIONS.has(section.id);

          let icon: React.ReactNode;
          let label: string;
          let rowCls = "border border-border/50";

          if (isPurpose) {
            icon = <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
            label = "Auto-filled";
            rowCls = "border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10";
          } else if (isManual) {
            icon = <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />;
            label = "Needs your input";
          } else if (!st || st.status === "waiting") {
            icon = <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />;
            label = "Waiting…";
          } else if (st.status === "loading") {
            icon = <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
            label = "Fetching…";
            rowCls = "border border-primary/20 bg-primary/5";
          } else if (st.status === "done") {
            icon = <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
            label = `${st.itemCount} data quer${st.itemCount === 1 ? "y" : "ies"} complete`;
            rowCls = "border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10";
          } else {
            icon = <Minus className="w-4 h-4 text-muted-foreground/50 shrink-0" />;
            label = "No live data · template defaults applied";
          }

          return (
            <div key={section.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-md ${rowCls}`}>
              {icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{section.title}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
              {isManual && !isPurpose && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 shrink-0"
                  onClick={() => onManualAdd(section)}
                  data-testid={`button-auto-manual-${section.id}`}
                >
                  + Fill in
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t bg-background flex items-center gap-3">
        {buildPhase === "complete" && (
          <Button className="gap-1.5" onClick={onGenerateReport} data-testid="button-generate-from-build">
            <Download className="w-3.5 h-3.5" />
            Generate Report
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onBackToManual} data-testid="button-back-manual">
          ← Back to Manual Mode
        </Button>
      </div>
    </div>
  );
}

function sfFileTypeLabel(fileType: string | null | undefined): string {
  switch (fileType) {
    case "issues":        return "⚠ [Issues] ";
    case "internal":     return "[Internal] ";
    case "h1":           return "[H1] ";
    case "h2":           return "[H2] ";
    case "meta_keywords":   return "[Meta KW] ";
    case "meta_description": return "[Meta Desc] ";
    case "page_titles":  return "[Page Titles] ";
    case "canonicals":   return "[Canonicals] ";
    case "images":       return "[Images] ";
    case "outlinks":     return "[Outlinks] ";
    default:             return "";
  }
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
  const [sfActiveId, setSfActiveId] = useState<number | null>(null);
  const [sfCompareId, setSfCompareId] = useState<number | null>(null);
  const [sfCompareEnabled, setSfCompareEnabled] = useState(false);
  const [sfUploading, setSfUploading] = useState(false);

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
  };
  const defaultDates = (type: ReportType) => {
    if (type === "biweekly") return { start: daysAgoStr(14), end: todayStr() };
    if (type === "monthly")  return { start: daysAgoStr(30), end: todayStr() };
    return { start: daysAgoStr(90), end: todayStr() };
  };
  const shiftOneYearBack = (s: string) => { const d = new Date(s); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };

  const initDates = defaultDates(reportType);
  const [dateStart, setDateStart] = useState(initDates.start);
  const [dateEnd,   setDateEnd]   = useState(initDates.end);
  const [dateCompareEnabled, setDateCompareEnabled] = useState(false);
  const [compareDateStart, setCompareDateStart] = useState(() => shiftOneYearBack(initDates.start));
  const [compareDateEnd,   setCompareDateEnd]   = useState(() => shiftOneYearBack(initDates.end));
  const [promptsPanelOpen, setPromptsPanelOpen] = useState(true);
  const [buildPhase, setBuildPhase] = useState<BuildPhase>("idle");
  const [sectionStatuses, setSectionStatuses] = useState<Record<string, SectionBuildStatus>>({});
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

  useEffect(() => {
    if (sfReports.length > 0) {
      setSfActiveId(prev => (prev && sfReports.some(r => r.id === prev)) ? prev : sfReports[0].id);
      setSfCompareId(prev => (prev && sfReports.some(r => r.id === prev)) ? prev : (sfReports[1]?.id ?? null));
    } else {
      setSfActiveId(null);
      setSfCompareId(null);
    }
  }, [sfReports]);

  useEffect(() => {
    setSfActiveId(null);
    setSfCompareId(null);
    setSfCompareEnabled(false);
  }, [selectedClientId]);

  useEffect(() => {
    const d = defaultDates(reportType);
    setDateStart(d.start);
    setDateEnd(d.end);
    setCompareDateStart(shiftOneYearBack(d.start));
    setCompareDateEnd(shiftOneYearBack(d.end));
    setDateCompareEnabled(false);
  }, [reportType]);

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
      const rawText = await file.text();
      const text = rawText.replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("File appears empty");
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").replace(/^"|"$/g, "").trim(); });
        return obj;
      });
      const fn = file.name.toLowerCase();
      const detectedFileType = (() => {
        const isIssuesByHeader =
          headers.some(h => /^issue(\s*(name|type))?$/i.test(h)) &&
          headers.some(h => /priority/i.test(h));
        if (isIssuesByHeader || fn.includes("issues")) return "issues";
        if (fn.includes("internal_all")) return "internal";
        if (fn.includes("h1_all")) return "h1";
        if (fn.includes("h2_all")) return "h2";
        if (fn.includes("meta_keywords")) return "meta_keywords";
        if (fn.includes("meta_description")) return "meta_description";
        if (fn.includes("page_titles")) return "page_titles";
        if (fn.includes("canonicals")) return "canonicals";
        if (fn.includes("images_all")) return "images";
        if (fn.includes("outlinks")) return "outlinks";
        return null;
      })();
      const today = new Date().toISOString().split("T")[0];
      const body = {
        reportDate: today,
        filename: file.name,
        rowCount: rows.length,
        headers,
        data: rows,
        fileType: detectedFileType,
      };
      const { getAuthHeaders } = await import("@/lib/queryClient");
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/clients/${selectedClientId}/sf-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Upload failed");
      const created = await res.json();
      rqClient.invalidateQueries({ queryKey: ["/api/clients", selectedClientId, "sf-reports"] });
      if (created?.id) setSfActiveId(created.id);
      const typeLabel = detectedFileType === "issues" ? "Issues report" : detectedFileType ? `${detectedFileType} crawl` : "Crawl";
      toast({
        title: `${typeLabel} uploaded`,
        description: `${rows.length} rows from ${file.name}`,
      });
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

  const handleManualWorkLogSave = (rows: WorkLogRow[]) => {
    if (!manualTargetSection) return;
    setCommittedSections(prev => ({
      ...prev,
      [manualTargetSection.id]: [
        ...(prev[manualTargetSection.id] ?? []),
        {
          sectionId: manualTargetSection.id,
          workLogRows: rows,
          committedAt: new Date(),
        },
      ],
    }));
    toast({ title: `${rows.length} item${rows.length > 1 ? "s" : ""} added to "Progress & Quick Wins"` });
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
    setBuildPhase("idle");
    setSectionStatuses({});
  }, [reportType, selectedClientId]);

  const handleAutoBuild = () => {
    if (!selectedClientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setCommittedSections({});
    setSectionStatuses({});
    setBuildPhase("building");
    setPromptsPanelOpen(false);

    const dateRange = REPORT_DATE_RANGES[reportType];
    const url = `/api/reports/auto-build?clientId=${selectedClientId}&reportType=${reportType}&dateRange=${dateRange}`;
    const es = new EventSource(url);

    es.addEventListener("section_loading", (e) => {
      const { sectionId } = JSON.parse(e.data);
      setSectionStatuses(prev => ({ ...prev, [sectionId]: { status: "loading", itemCount: 0 } }));
    });

    es.addEventListener("section_done", (e) => {
      const { sectionId, items } = JSON.parse(e.data) as { sectionId: string; items: CommittedSection[] };
      if (items.length > 0) {
        setCommittedSections(prev => ({ ...prev, [sectionId]: items }));
        setSectionStatuses(prev => ({ ...prev, [sectionId]: { status: "done", itemCount: items.length } }));
      } else {
        setSectionStatuses(prev => ({ ...prev, [sectionId]: { status: "empty", itemCount: 0 } }));
      }
    });

    es.addEventListener("complete", () => {
      setBuildPhase("complete");
      es.close();
      toast({ title: "Report built", description: "All data sections filled — ready to generate." });
    });

    es.onerror = () => {
      es.close();
      setBuildPhase("complete");
      toast({ title: "Build finished", description: "Some sections may have used default data.", variant: "default" });
    };
  };

  const examples = EXAMPLE_QUERIES_BY_TYPE[reportType];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
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

        <div className="w-52 shrink-0">
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

        <div className="w-40 shrink-0">
          <Select value={reportType} onValueChange={v => setReportType(v as ReportType)}>
            <SelectTrigger data-testid="select-report-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["biweekly", "monthly", "qbr"] as ReportType[]).map(type => (
                <SelectItem key={type} value={type} data-testid={`select-report-type-${type}`}>
                  {REPORT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedClientId && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={dateStart}
              onChange={e => setDateStart(e.target.value)}
              className="h-7 text-xs border border-input rounded px-1.5 bg-background text-foreground w-[118px] focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-date-start"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              value={dateEnd}
              onChange={e => setDateEnd(e.target.value)}
              className="h-7 text-xs border border-input rounded px-1.5 bg-background text-foreground w-[118px] focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-date-end"
            />
            <label className="flex items-center gap-1 cursor-pointer ml-1 shrink-0" data-testid="label-date-compare">
              <input
                type="checkbox"
                checked={dateCompareEnabled}
                onChange={e => setDateCompareEnabled(e.target.checked)}
                className="rounded"
                data-testid="checkbox-date-compare"
              />
              <span className="text-xs text-muted-foreground">Compare</span>
            </label>
            {dateCompareEnabled && (
              <>
                <input
                  type="date"
                  value={compareDateStart}
                  onChange={e => setCompareDateStart(e.target.value)}
                  className="h-7 text-xs border border-input rounded px-1.5 bg-background text-foreground w-[118px] focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-compare-date-start"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  type="date"
                  value={compareDateEnd}
                  onChange={e => setCompareDateEnd(e.target.value)}
                  className="h-7 text-xs border border-input rounded px-1.5 bg-background text-foreground w-[118px] focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-compare-date-end"
                />
              </>
            )}
          </div>
        )}

        {selectedClientId && buildPhase === "idle" && (
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={handleAutoBuild}
            data-testid="button-auto-build"
          >
            <Zap className="w-3.5 h-3.5" />
            Auto-Build
          </Button>
        )}

        {selectedClientId && buildPhase !== "idle" && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={handleAutoBuild}
            data-testid="button-rebuild"
          >
            <Zap className="w-3.5 h-3.5" />
            Rebuild
          </Button>
        )}

        {selectedClientId && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Bug className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
            <span className="text-xs text-muted-foreground shrink-0">SF Crawl</span>

            <input
              ref={sfFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleSfUpload(f); }}
              data-testid="input-sf-file"
            />

            <Select
              value={sfActiveId ? String(sfActiveId) : "__none__"}
              onValueChange={v => {
                if (v === "__upload__") { sfFileInputRef.current?.click(); return; }
                setSfActiveId(v === "__none__" ? null : Number(v));
              }}
            >
              <SelectTrigger className="h-7 text-xs w-48" data-testid="select-sf-active">
                <SelectValue placeholder="Select crawl…" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="__none__">No crawl selected</SelectItem>
                {sfReports.map(r => (
                  <SelectItem key={r.id} value={String(r.id)} data-testid={`sf-active-option-${r.id}`}>
                    {sfFileTypeLabel(r.fileType)}{r.reportDate} — {r.filename}
                  </SelectItem>
                ))}
                <SelectItem value="__upload__" data-testid="sf-upload-option">
                  {sfUploading ? "Uploading…" : "↑ Upload crawl or issues CSV…"}
                </SelectItem>
              </SelectContent>
            </Select>

            <label className="flex items-center gap-1 cursor-pointer shrink-0" data-testid="label-sf-compare">
              <input
                type="checkbox"
                checked={sfCompareEnabled}
                onChange={e => setSfCompareEnabled(e.target.checked)}
                className="rounded"
                data-testid="checkbox-sf-compare"
              />
              <span className="text-xs text-muted-foreground">Compare</span>
            </label>

            {sfCompareEnabled && (
              <Select
                value={sfCompareId ? String(sfCompareId) : "__none__"}
                onValueChange={v => setSfCompareId(v === "__none__" ? null : Number(v))}
              >
                <SelectTrigger className="h-7 text-xs w-48" data-testid="select-sf-compare">
                  <SelectValue placeholder="Compare crawl…" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="__none__">No crawl selected</SelectItem>
                  {sfReports.map(r => (
                    <SelectItem key={r.id} value={String(r.id)} data-testid={`sf-compare-option-${r.id}`}>
                      {sfFileTypeLabel(r.fileType)}{r.reportDate} — {r.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {promptsPanelOpen && buildPhase === "idle" && (
          <PromptsPanel
            reportType={reportType}
            onSelectPrompt={(prompt) => {
              setInputValue(prompt);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          />
        )}
        {buildPhase !== "idle" && (
          <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r">
            <AutoBuildLivePanel
              reportType={reportType}
              selectedClient={selectedClient}
              buildPhase={buildPhase}
              sectionStatuses={sectionStatuses}
              onGenerateReport={() => setGenerateDialogOpen(true)}
              onBackToManual={() => { setBuildPhase("idle"); setPromptsPanelOpen(true); }}
              onManualAdd={(section) => {
                setManualTargetSection(section);
                setManualDialogOpen(true);
              }}
            />
          </div>
        )}
        <div className={`flex flex-col flex-1 min-w-0 min-h-0 ${buildPhase !== "idle" ? "hidden" : ""}`}>
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
                      : "Choose a client and report type above, then ask questions to pull data from GSC, GA4, CallRail, SEMrush, and more."
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
        onSaveWorkLog={handleManualWorkLogSave}
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
