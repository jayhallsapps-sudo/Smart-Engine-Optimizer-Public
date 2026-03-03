import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CalendarDays, Download, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocxPreview } from "@/components/report-preview/docx-preview";
import type { Client } from "@shared/schema";

export default function BiweeklyPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [report, setReport] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client first");
      const res = await apiRequest("POST", "/api/reports/biweekly/generate", {
        clientId: Number(clientId),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setReport(data);
      setEdits({});
      toast({ title: "Report generated", description: "Preview ready — click any text to edit." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

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

  async function uploadToDrive() {
    if (!report) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/reports/biweekly/upload-to-drive", { json: report, edits });
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
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const windowLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="flex h-full min-h-0" data-testid="biweekly-page">
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Bi-Weekly Report</h1>
              <p className="text-xs text-muted-foreground">SEO Bi-weekly Meeting Doc</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
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

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Window</Label>
            <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5 font-mono">
              {windowLabel} (14 days)
            </div>
            <p className="text-[10px] text-muted-foreground">Auto-computed: most recent 14 days vs prior 14</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendees (optional)</Label>
            <Input
              placeholder="e.g. John, Sarah, Team..."
              value={edits["attendees"] ?? ""}
              onChange={e => handleEdit("attendees", e.target.value)}
              className="text-sm"
              data-testid="input-attendees"
            />
            <p className="text-[10px] text-muted-foreground">Added to doc header</p>
          </div>

          <Separator />

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

        {report && (
          <div className="p-4 border-t space-y-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => downloadDocxMut.mutate()}
              disabled={downloadDocxMut.isPending}
              data-testid="button-download-docx"
            >
              {downloadDocxMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
              Download DOCX
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={uploadToDrive}
              disabled={isUploading}
              data-testid="button-save-drive"
            >
              {isUploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CloudUpload className="w-3 h-3 mr-1.5" />}
              Save to Drive
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-auto">
        {!report && !generateMut.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="font-semibold text-lg">Bi-Weekly Report</h2>
              <p className="text-sm text-muted-foreground">
                Select a client and click Generate to build your bi-weekly SEO meeting document. Click any text in the preview to edit before downloading.
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
            clientName={report.client_name}
            reportTitle={report.report_title}
            date={report.date}
            attendees={report.attendees ?? ""}
            sections={report.sections ?? []}
            edits={edits}
            onEdit={handleEdit}
          />
        )}
      </div>
    </div>
  );
}
