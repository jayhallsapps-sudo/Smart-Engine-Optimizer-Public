import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CrawlSessionFile {
  id: number;
  fileType: string | null;
  filename: string;
  rowCount: number;
}

interface CrawlSession {
  sessionId: string | null;
  sessionName: string;
  createdAt: string;
  files: CrawlSessionFile[];
  primaryFileId: number;
}

interface QueuedFile {
  file: File;
  fileType: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

interface CrawlAssetSelectorProps {
  clientId: number | null | undefined;
  clientName?: string;
  currentCrawlId: number | null;
  comparisonCrawlId?: number | null;
  onCurrentChange: (id: number | null) => void;
  onComparisonChange?: (id: number | null) => void;
  showComparison?: boolean;
  freshnessLimitDays?: number;
  asOfDate?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILE_TYPE_OPTIONS = [
  { value: "internal",         label: "Internal" },
  { value: "page_titles",      label: "Page Titles" },
  { value: "meta_description", label: "Meta Descriptions" },
  { value: "meta_keywords",    label: "Meta Keywords" },
  { value: "h1",               label: "H1" },
  { value: "h2",               label: "H2" },
  { value: "images",           label: "Images" },
  { value: "canonicals",       label: "Canonicals" },
  { value: "outlinks",         label: "Outlinks" },
  { value: "issues",           label: "Issues Report" },
  { value: "rendered",         label: "Rendered Page" },
  { value: "other",            label: "Other" },
];

const FILE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FILE_TYPE_OPTIONS.map(o => [o.value, o.label])
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectFileType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("issues")) return "issues";
  if (lower.includes("internal") || lower.includes("all_inlink")) return "internal";
  if (lower.includes("page_title") || lower.includes("pagetitle")) return "page_titles";
  if (lower.includes("meta_keyword") || lower.includes("metakeyword")) return "meta_keywords";
  if (lower.includes("meta_desc") || lower.includes("metadesc")) return "meta_description";
  if (/\bh1\b/.test(lower) || lower.startsWith("h1") || lower.includes("_h1") || lower.includes("-h1")) return "h1";
  if (/\bh2\b/.test(lower) || lower.startsWith("h2") || lower.includes("_h2") || lower.includes("-h2")) return "h2";
  if (lower.includes("image") || lower.includes("_img")) return "images";
  if (lower.includes("canonical")) return "canonicals";
  if (lower.includes("outlink") || lower.includes("outbound")) return "outlinks";
  if (lower.includes("rendered")) return "rendered";
  return "other";
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function defaultSessionName(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatReportDate(yyyymmdd: string): string {
  // Parse YYYY-MM-DD directly to avoid UTC-to-local offset issues
  const parts = yyyymmdd.split("-");
  const month = parseInt(parts[1] ?? "1", 10);
  const day = parseInt(parts[2] ?? "1", 10);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${monthNames[month - 1]} ${day}`;
}

function sessionLabel(session: CrawlSession): string {
  const date = formatSessionDate(session.createdAt);
  if (session.sessionId) {
    // Named session (new-style upload)
    if (session.files.length > 1) {
      return `${session.sessionName} · ${session.files.length} files · ${date}`;
    }
    return `${session.sessionName} · ${date}`;
  }
  // Legacy — grouped by reportDate
  if (session.files.length > 1) {
    const reportDate = formatReportDate(session.sessionName); // sessionName = "YYYY-MM-DD"
    return `${reportDate} Crawl · ${session.files.length} files`;
  }
  // Single legacy file — show filename without extension + date
  const fname = session.files[0]?.filename?.replace(/\.csv$/i, "") ?? session.sessionName;
  return `${fname} · ${date}`;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') { field += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ",") { row.push(field.trim()); field = ""; i++; }
      else if (ch === "\r") {
        row.push(field.trim()); field = ""; rows.push(row); row = [];
        if (i + 1 < n && text[i + 1] === "\n") i++; i++;
      } else if (ch === "\n") {
        row.push(field.trim()); field = ""; rows.push(row); row = []; i++;
      } else { field += ch; i++; }
    }
  }
  if (field.trim() !== "" || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows.filter(r => r.some(f => f !== ""));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CrawlAssetSelector({
  clientId,
  clientName,
  currentCrawlId,
  comparisonCrawlId = null,
  onCurrentChange,
  onComparisonChange,
  showComparison = false,
}: CrawlAssetSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [sessionNameInput, setSessionNameInput] = useState(defaultSessionName());
  const [showQueue, setShowQueue] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: sessions = [], isLoading } = useQuery<CrawlSession[]>({
    queryKey: [`/api/clients/${clientId}/crawl-sessions`],
    enabled: !!clientId,
  });

  const currentSession = sessions.find(s => s.primaryFileId === currentCrawlId);
  const comparisonSession = sessions.find(s => s.primaryFileId === comparisonCrawlId);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setQueuedFiles(files.map(f => ({ file: f, fileType: detectFileType(f.name), status: "pending" })));
    setSessionNameInput(defaultSessionName());
    setShowQueue(true);
  };

  const updateFileType = (idx: number, fileType: string) => {
    setQueuedFiles(prev => prev.map((f, i) => i === idx ? { ...f, fileType } : f));
  };

  const handleUploadAll = async () => {
    if (!clientId || !sessionNameInput.trim()) return;
    setUploading(true);
    const sessionId = crypto.randomUUID();
    const reportDate = new Date().toISOString().split("T")[0];
    let firstId: number | null = null;

    const results = await Promise.allSettled(
      queuedFiles.map(async (qf, idx) => {
        setQueuedFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: "uploading" } : f));
        const text = await qf.file.text();
        const rows = parseCSV(text);
        if (rows.length < 1) throw new Error("Empty CSV");
        const headers = rows[0];
        const data = rows.slice(1).map(cells => {
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
          return row;
        });
        const res = await fetch("/api/crawl-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            clientName: clientName ?? "Unknown",
            filename: qf.file.name,
            reportDate,
            headers,
            data,
            sessionId,
            sessionName: sessionNameInput.trim(),
            fileType: qf.fileType,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Upload failed");
        }
        const created = await res.json();
        setQueuedFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: "done" } : f));
        return created;
      })
    );

    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        setQueuedFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: "error", errorMsg: r.reason?.message } : f));
      } else if (r.value?.fileType === "internal" || firstId === null) {
        firstId = r.value?.id ?? firstId;
      }
    });

    const successCount = results.filter(r => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    await queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/crawl-sessions`] });

    if (successCount > 0) {
      const refreshed = await queryClient.fetchQuery<CrawlSession[]>({
        queryKey: [`/api/clients/${clientId}/crawl-sessions`],
      });
      const newSession = refreshed.find(s => s.sessionId === sessionId);
      if (newSession) onCurrentChange(newSession.primaryFileId);
      toast({
        title: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded`,
        description: `Session "${sessionNameInput.trim()}" is ready${failCount > 0 ? ` (${failCount} failed)` : ""}`,
      });
    }

    if (failCount === 0) {
      setShowQueue(false);
      setQueuedFiles([]);
    }
    setUploading(false);
  };

  const handleCloseQueue = () => {
    if (uploading) return;
    setShowQueue(false);
    setQueuedFiles([]);
  };

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      {/* Hidden file input — triggered by the Upload option inside the dropdown */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* Current Crawl */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Current Crawl</Label>
        <Select
          value={currentCrawlId != null ? String(currentCrawlId) : ""}
          onValueChange={v => {
            if (v === "__upload__") { fileInputRef.current?.click(); return; }
            onCurrentChange(v ? Number(v) : null);
          }}
          disabled={isLoading}
        >
          <SelectTrigger data-testid="select-current-crawl" className="h-8 text-xs w-full">
            <SelectValue placeholder={isLoading ? "Loading..." : "Select crawl session..."} />
          </SelectTrigger>
          <SelectContent>
            {sessions.map(s => (
              <SelectItem key={s.primaryFileId} value={String(s.primaryFileId)} data-testid={`option-crawl-${s.primaryFileId}`}>
                {sessionLabel(s)}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="__upload__" data-testid="btn-upload-crawl" className="text-muted-foreground">
              <Upload className="w-3 h-3 mr-1.5 inline-block" />
              Upload new crawl...
            </SelectItem>
          </SelectContent>
        </Select>
        {currentSession && currentSession.files.length > 1 && (
          <p className="text-[10px] text-muted-foreground pl-0.5">
            {currentSession.files.map(f => {
              const type = f.fileType ?? detectFileType(f.filename);
              return FILE_TYPE_LABEL[type] ?? f.filename.replace(/\.csv$/i, "");
            }).join(" · ")}
          </p>
        )}
      </div>

      {/* Comparison Crawl */}
      {showComparison && onComparisonChange && (
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Comparison Crawl</Label>
          <Select
            value={comparisonCrawlId != null ? String(comparisonCrawlId) : ""}
            onValueChange={v => {
              if (v === "__upload__") { fileInputRef.current?.click(); return; }
              onComparisonChange(v ? Number(v) : null);
            }}
            disabled={isLoading}
          >
            <SelectTrigger data-testid="select-comparison-crawl" className="h-8 text-xs w-full">
              <SelectValue placeholder="Select comparison session..." />
            </SelectTrigger>
            <SelectContent>
              {sessions.map(s => (
                <SelectItem key={s.primaryFileId} value={String(s.primaryFileId)}>
                  {sessionLabel(s)}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="__upload__" className="text-muted-foreground">
                <Upload className="w-3 h-3 mr-1.5 inline-block" />
                Upload new crawl...
              </SelectItem>
            </SelectContent>
          </Select>
          {comparisonSession && comparisonSession.files.length > 1 && (
            <p className="text-[10px] text-muted-foreground pl-0.5">
              {comparisonSession.files.map(f => {
                const type = f.fileType ?? detectFileType(f.filename);
                return FILE_TYPE_LABEL[type] ?? f.filename.replace(/\.csv$/i, "");
              }).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Upload Queue Dialog */}
      <Dialog open={showQueue} onOpenChange={open => { if (!open) handleCloseQueue(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Crawl Session</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Session Name</Label>
              <Input
                data-testid="input-session-name"
                value={sessionNameInput}
                onChange={e => setSessionNameInput(e.target.value)}
                placeholder="e.g. March 2026"
                className="h-8 text-sm"
                disabled={uploading}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Files ({queuedFiles.length})</Label>
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {queuedFiles.map((qf, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{qf.file.name}</p>
                      {qf.errorMsg && (
                        <p className="text-[10px] text-destructive">{qf.errorMsg}</p>
                      )}
                    </div>
                    <Select
                      value={qf.fileType}
                      onValueChange={v => updateFileType(idx, v)}
                      disabled={uploading || qf.status === "done"}
                    >
                      <SelectTrigger data-testid={`select-file-type-${idx}`} className="h-7 text-xs w-36 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILE_TYPE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="w-4 shrink-0">
                      {qf.status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      {qf.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                      {qf.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              data-testid="btn-cancel-upload"
              variant="outline"
              size="sm"
              onClick={handleCloseQueue}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              data-testid="btn-upload-all"
              size="sm"
              onClick={handleUploadAll}
              disabled={uploading || !sessionNameInput.trim() || queuedFiles.length === 0}
            >
              {uploading ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Uploading...</>
              ) : (
                <><Upload className="w-3 h-3 mr-1" /> Upload {queuedFiles.length > 1 ? `${queuedFiles.length} Files` : "File"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
