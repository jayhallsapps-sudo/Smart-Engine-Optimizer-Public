import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CalendarDays,
  Download,
  CloudUpload,
  Loader2,
  RefreshCw,
  Send,
  Bot,
  User,
  ChevronRight,
  FileText,
  NotebookPen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocxPreview } from "@/components/report-preview/docx-preview";
import type { Client } from "@shared/schema";
import { useReportSave } from "@/hooks/useReportSave";
import { SaveStatusIndicator } from "@/components/reports/SaveStatusIndicator";
import { ReportSaveSelector } from "@/components/reports/ReportSaveSelector";
import { CrawlAssetSelector } from "@/components/reports/CrawlAssetSelector";

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getBiweeklyWindow() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  return { startDate: toYMD(start), endDate: toYMD(end) };
}

function fmtWindowLabel(start: string, end: string): string {
  const fmt = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function AcaChatPanel({ clientId, clientName, report, edits }: {
  clientId: string;
  clientName: string | undefined;
  report: any;
  edits: Record<string, string>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const reportContext = report ? JSON.stringify({ ...report, edits }) : null;
      const res = await apiRequest("POST", "/api/aca/chat", {
        messages: next,
        clientId: clientId ? Number(clientId) : undefined,
        integrations: [],
        systemContext: reportContext
          ? `You are helping an SEO account manager prepare for a biweekly client call.\n\nCurrent report context (JSON):\n${reportContext}\n\nAnswer questions about the report, help fill gaps, suggest talking points, and reference sources when available. Be concise and practical. Do not overwrite the report unless explicitly asked.`
          : `You are helping an SEO account manager prepare a biweekly report for ${clientName ?? "the selected client"}. Answer questions about SEO performance, content, and technical priorities. Be concise and practical.`,
      });
      const data = await res.json();
      const reply = data.response ?? data.message ?? "No response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Error: " + (err.message ?? "Request failed.") }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b flex items-center gap-2 shrink-0">
        <Bot className="w-4 h-4 text-[#D97706]" />
        <span className="text-xs font-semibold">/ACA/ Chat</span>
        <span className="text-[10px] text-muted-foreground ml-auto">Ask about this report</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-[11px] text-muted-foreground text-center">Ask anything about the report or live data.</p>
            {[
              "Summarize performance pulse in one sentence.",
              "Which priorities look unfinished from last report?",
              "What should I write in the Local SEO section?",
              "What are the most urgent technical issues?",
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => { setInput(prompt); }}
                className="w-full text-left text-[11px] px-2 py-1.5 rounded border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                <ChevronRight className="inline w-3 h-3 mr-1 opacity-50" />
                {prompt}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${m.role === "user" ? "bg-primary" : "bg-[#D97706]"}`}>
              {m.role === "user" ? <User className="w-3 h-3 text-primary-foreground" /> : <Bot className="w-3 h-3 text-white" />}
            </div>
            <div className={`text-[12px] leading-relaxed rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="shrink-0 w-5 h-5 rounded-full bg-[#D97706] flex items-center justify-center mt-0.5">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 text-[12px]">
              <Loader2 className="w-3 h-3 animate-spin inline" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t shrink-0 flex gap-2">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about this report…"
          className="resize-none text-xs h-9 min-h-0 py-2"
          data-testid="input-aca-chat"
        />
        <Button size="sm" className="h-9 px-2 shrink-0" onClick={send} disabled={loading || !input.trim()} data-testid="button-aca-send">
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function InternalAmNotesPanel({ notes }: { notes: any }) {
  if (!notes) return (
    <div className="p-4 text-sm text-muted-foreground">Generate a report to see internal AM notes.</div>
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Internal — Not Client-Facing</p>
        <p className="text-xs text-amber-800 dark:text-amber-300">{notes.storyToTell}</p>
      </div>

      {notes.talkingPoints?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Talking Points</p>
          <ul className="space-y-1">
            {notes.talkingPoints.map((tp: string, i: number) => (
              <li key={i} className="text-xs text-foreground flex gap-1.5">
                <span className="text-muted-foreground shrink-0">•</span>{tp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.missingInputs?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Missing / Manual Fill</p>
          <ul className="space-y-1">
            {notes.missingInputs.map((m: string, i: number) => (
              <li key={i} className="text-xs text-destructive flex gap-1.5">
                <span className="shrink-0">⚠</span>{m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.risksCarryForwards?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Risks / Carry-Forwards</p>
          <ul className="space-y-1">
            {notes.risksCarryForwards.map((r: string, i: number) => (
              <li key={i} className="text-xs text-foreground flex gap-1.5">
                <span className="text-muted-foreground shrink-0">→</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.clientQuestions?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Questions to Ask Client</p>
          <ul className="space-y-1">
            {notes.clientQuestions.map((q: string, i: number) => (
              <li key={i} className="text-xs text-foreground flex gap-1.5">
                <span className="text-muted-foreground shrink-0">?</span>{q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function BiweeklyPage() {
  const { toast } = useToast();

  const [clientId, setClientId] = useState<string>(() => new URLSearchParams(window.location.search).get("client") ?? "");
  const [preparedBy, setPreparedBy] = useState("JAY HALL");
  const autoGeneratedRef = useRef<string>("");
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [currentCrawlId, setCurrentCrawlId] = useState<number | null>(null);
  const [comparisonCrawlId, setComparisonCrawlId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"aca" | "notes">("aca");

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const clientName = clients.find(c => String(c.id) === clientId)?.name;

  const { startDate, endDate } = getBiweeklyWindow();
  const windowLabel = fmtWindowLabel(startDate, endDate);

  const reportSave = useReportSave({
    reportType: "biweekly",
    clientId: clientId ? Number(clientId) : null,
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client first");
      const res = await apiRequest("POST", "/api/reports/biweekly/generate", {
        clientId: Number(clientId),
        startDate,
        endDate,
        preparedBy: preparedBy || "JAY HALL",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      reportSave.setSavedReportId(null);
      const meta = {
        reportPeriodLabel: windowLabel,
        analysisWindowStart: startDate,
        analysisWindowEnd: endDate,
        currentCrawlAssetId: currentCrawlId,
        comparisonCrawlAssetId: comparisonCrawlId,
      };
      reportSave.pendingPayloadRef.current = { reportData: data, edits: {}, meta };
      reportSave.save(data, {}, meta);
      toast({ title: "Report generated", description: "Click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (clientId && autoGeneratedRef.current !== clientId) {
      autoGeneratedRef.current = clientId;
      generateMut.mutate();
    }
  }, [clientId]);

  const downloadDocxMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Generate report first");
      const res = await apiRequest("POST", "/api/reports/biweekly/docx", { json: report, edits });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "biweekly_report.docx";
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    },
  });

  async function downloadPdf() {
    if (!report) return;
    try {
      const { getAuthHeaders } = await import("@/lib/queryClient");
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/reports/biweekly/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ report, edits }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.client_name ?? "report"} - Biweekly Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "PDF download failed", description: err.message, variant: "destructive" });
    }
  }

  async function uploadToDrive() {
    if (!report) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/reports/biweekly/upload-to-drive", { report, edits });
      const data = await res.json();
      if (data.webViewLink) {
        toast({
          title: "Saved to Drive",
          description: (
            <a href={data.webViewLink} target="_blank" rel="noopener noreferrer" className="underline">
              Open in Google Drive
            </a>
          ) as any,
        });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  function handleEdit(key: string, value: string) {
    setEdits(prev => {
      const next = { ...prev, [key]: value };
      reportSave.pendingPayloadRef.current = {
        reportData: report,
        edits: next,
        meta: { reportPeriodLabel: windowLabel, analysisWindowStart: startDate, analysisWindowEnd: endDate, currentCrawlAssetId: currentCrawlId, comparisonCrawlAssetId: comparisonCrawlId },
      };
      return next;
    });
    reportSave.markDirty();
  }

  return (
    <div className="flex h-full min-h-0" data-testid="biweekly-page">

      {/* LEFT SIDEBAR — Setup */}
      <div className="w-64 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-sm">Bi-Weekly Report</h1>
              <p className="text-xs text-muted-foreground">Live data · click to edit</p>
            </div>
          </div>
          {clientId && <div className="mt-1"><SaveStatusIndicator status={reportSave.saveStatus} /></div>}
        </div>

        <div className="flex-1 p-4 space-y-4">
          {/* Step 1 — Client */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">1 · Client</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setReport(null); reportSave.setSavedReportId(null); }}>
              <SelectTrigger data-testid="select-client">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {(clients as Client[]).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2 — Prepared by */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">2 · Prepared by</Label>
            <Input
              placeholder="e.g. JAY HALL"
              value={preparedBy}
              onChange={e => setPreparedBy(e.target.value)}
              className="text-sm"
              data-testid="input-prepared-by"
            />
          </div>

          {/* Reporting period */}
          <div className="rounded-md bg-muted/60 px-3 py-2 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Reporting Period</p>
            <p className="text-xs font-mono text-foreground">{windowLabel}</p>
          </div>

          {/* Optional crawl */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Screaming Frog Crawl</Label>
              <CrawlAssetSelector
                clientId={clientId ? Number(clientId) : null}
                clientName={clientName}
                currentCrawlId={currentCrawlId}
                comparisonCrawlId={comparisonCrawlId}
                onCurrentChange={setCurrentCrawlId}
                onComparisonChange={setComparisonCrawlId}
                showComparison={false}
              />
            </div>
          )}

          {/* Load saved */}
          {clientId && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Load Saved</Label>
              <ReportSaveSelector
                clientId={clientId ? Number(clientId) : null}
                reportType="biweekly"
                onLoad={(data, savedEdits, id) => {
                  setReport(data);
                  setEdits(savedEdits);
                  reportSave.setSavedReportId(id);
                  reportSave.pendingPayloadRef.current = {
                    reportData: data,
                    edits: savedEdits,
                    meta: { reportPeriodLabel: windowLabel, analysisWindowStart: startDate, analysisWindowEnd: endDate },
                  };
                  toast({ title: "Report loaded" });
                }}
              />
            </div>
          )}

          {/* Generate */}
          <Button
            className="w-full"
            onClick={() => generateMut.mutate()}
            disabled={!clientId || generateMut.isPending}
            data-testid="button-generate"
          >
            {generateMut.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : report ? (
              <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              "Generate Report"
            )}
          </Button>
        </div>

        {/* Export actions */}
        {report && (
          <div className="p-4 border-t space-y-2">
            <Button className="w-full text-xs" onClick={downloadPdf} disabled={downloadDocxMut.isPending} data-testid="button-download-pdf">
              <Download className="w-3 h-3 mr-1.5" />
              Download PDF
            </Button>
            <Button variant="outline" className="w-full text-xs" onClick={() => downloadDocxMut.mutate()} disabled={downloadDocxMut.isPending} data-testid="button-download-docx">
              {downloadDocxMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download DOCX
            </Button>
            <Button variant="outline" className="w-full text-xs" onClick={uploadToDrive} disabled={isUploading} data-testid="button-save-drive">
              {isUploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CloudUpload className="w-3 h-3 mr-1.5" />}
              Save to Drive (PDF)
            </Button>
          </div>
        )}
      </div>

      {/* CENTER — Report Preview */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!report && !generateMut.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">Bi-Weekly Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client, enter Prepared by, and click Generate. The report will appear here — click any text to edit.
              </p>
            </div>
          </div>
        )}

        {generateMut.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Fetching live data and building report…</p>
            </div>
          </div>
        )}

        {report && !generateMut.isPending && (
          <DocxPreview
            clientName={edits["client_name"] ?? report.client_name}
            reportTitle={edits["report_title"] ?? report.report_title}
            date={edits["report_date"] ?? report.date}
            reportingWindow={report.reportingWindow}
            preparedBy={edits["preparedBy"] ?? report.preparedBy}
            sections={report.sections ?? []}
            edits={edits}
            onEdit={handleEdit}
            bwTheme
          />
        )}
      </div>

      {/* RIGHT — ACA Chat + AM Notes */}
      <div className="w-72 shrink-0 border-l bg-card flex flex-col min-h-0">
        <Tabs value={rightTab} onValueChange={v => setRightTab(v as any)} className="flex flex-col h-full min-h-0">
          <TabsList className="w-full rounded-none border-b bg-card shrink-0 h-9">
            <TabsTrigger value="aca" className="flex-1 text-xs gap-1" data-testid="tab-aca">
              <Bot className="w-3 h-3" /> /ACA/
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-xs gap-1" data-testid="tab-notes">
              <NotebookPen className="w-3 h-3" /> AM Notes
            </TabsTrigger>
          </TabsList>
          <TabsContent value="aca" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <AcaChatPanel
              clientId={clientId}
              clientName={clientName}
              report={report}
              edits={edits}
            />
          </TabsContent>
          <TabsContent value="notes" className="flex-1 min-h-0 overflow-y-auto mt-0">
            <InternalAmNotesPanel notes={report?.internalAmNotes} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
