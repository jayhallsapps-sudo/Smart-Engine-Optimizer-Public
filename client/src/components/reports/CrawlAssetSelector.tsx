import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CrawlAsset {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
  assetName: string;
  notes: string | null;
  createdAt: string;
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

function isFresh(createdAt: string, limitDays: number, asOfDate?: string): boolean {
  const base = asOfDate ? new Date(asOfDate) : new Date();
  const created = new Date(createdAt);
  const diffDays = (base.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= limitDays;
}

function FreshnessTag({ createdAt, limitDays, asOfDate }: { createdAt: string; limitDays?: number; asOfDate?: string }) {
  if (!limitDays) return null;
  const fresh = isFresh(createdAt, limitDays, asOfDate);
  return (
    <span
      data-testid="text-crawl-freshness"
      className={`text-xs font-medium px-1.5 py-0.5 rounded ${fresh ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
    >
      {fresh ? "Fresh" : "Stale"}
    </span>
  );
}

export function CrawlAssetSelector({
  clientId,
  clientName,
  currentCrawlId,
  comparisonCrawlId = null,
  onCurrentChange,
  onComparisonChange,
  showComparison = false,
  freshnessLimitDays,
  asOfDate,
}: CrawlAssetSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: crawlAssets = [], isLoading } = useQuery<CrawlAsset[]>({
    queryKey: [`/api/crawl-assets?clientId=${clientId}`],
    enabled: !!clientId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const data = lines.slice(1).map((line) => {
        const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = cells[i] ?? "";
        });
        return row;
      });

      const reportDate = new Date().toISOString().split("T")[0];

      const res = await fetch("/api/crawl-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: clientName ?? "Unknown",
          filename: file.name,
          reportDate,
          headers,
          data,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Upload failed");
      }
      return res.json() as Promise<CrawlAsset>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [`/api/crawl-assets?clientId=${clientId}`] });
      onCurrentChange(created.id);
      toast({ title: "Crawl uploaded", description: created.assetName });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  const selectedCurrent = crawlAssets.find((a) => a.id === currentCrawlId);
  const selectedComparison = crawlAssets.find((a) => a.id === comparisonCrawlId);

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Current Crawl</Label>
          <div className="flex items-center gap-2">
            <Select
              value={currentCrawlId != null ? String(currentCrawlId) : ""}
              onValueChange={(v) => onCurrentChange(v ? Number(v) : null)}
              disabled={isLoading}
            >
              <SelectTrigger data-testid="select-current-crawl" className="h-8 text-xs flex-1">
                <SelectValue placeholder={isLoading ? "Loading..." : "Select crawl..."} />
              </SelectTrigger>
              <SelectContent>
                {crawlAssets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.assetName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCurrent && (
              <FreshnessTag
                createdAt={selectedCurrent.createdAt}
                limitDays={freshnessLimitDays}
                asOfDate={asOfDate}
              />
            )}
          </div>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            data-testid="btn-upload-crawl"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Upload className="w-3 h-3 mr-1" />
            )}
            Upload CSV
          </Button>
        </div>
      </div>

      {showComparison && onComparisonChange && (
        <div className="flex-1 space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Comparison Crawl</Label>
          <div className="flex items-center gap-2">
            <Select
              value={comparisonCrawlId != null ? String(comparisonCrawlId) : ""}
              onValueChange={(v) => onComparisonChange(v ? Number(v) : null)}
              disabled={isLoading}
            >
              <SelectTrigger data-testid="select-comparison-crawl" className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select comparison crawl..." />
              </SelectTrigger>
              <SelectContent>
                {crawlAssets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.assetName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedComparison && (
              <FreshnessTag
                createdAt={selectedComparison.createdAt}
                limitDays={freshnessLimitDays}
                asOfDate={asOfDate}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
