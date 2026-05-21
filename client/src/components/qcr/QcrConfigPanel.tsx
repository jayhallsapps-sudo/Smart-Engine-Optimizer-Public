import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QcrConfigPanelProps {
  clientId: number;
}

const SECTION_KEYS = [
  { key: "seo_strategy", label: "SEO Strategy Section ID" },
  { key: "seo_content", label: "SEO Content Section ID" },
  { key: "technical_seo", label: "Technical SEO Section ID" },
  { key: "local_seo", label: "Local SEO Section ID" },
];

const PAGE_TYPE_KEYS = [
  { key: "informational", label: "Informational", defaultPatterns: "/blog/*\n/articles/*\n/news/*\n/resources/*" },
  { key: "service", label: "Service", defaultPatterns: "/services/*\n/programs/*\n/levels-of-care/*\n/therapies/*\n/conditions/*" },
  { key: "cro", label: "CRO", defaultPatterns: "/contact/*\n/admissions/*\n/verify-insurance/*\n/get-help*" },
  { key: "local_intent", label: "Local Intent", defaultPatterns: "/locations/*\n/areas-served/*" },
  { key: "commercial", label: "Commercial", defaultPatterns: "" },
];

export function QcrConfigPanel({ clientId }: QcrConfigPanelProps) {
  const { toast } = useToast();
  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/qcr/config", clientId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/qcr/config/${clientId}`);
      return res.json();
    },
    enabled: !!clientId,
  });

  const [sectionIds, setSectionIds] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (config) {
      setSectionIds((config.asanaSectionIds as Record<string, string>) ?? {});
      setOverrides(
        Object.fromEntries(
          Object.entries((config.urlPatternOverrides as Record<string, string[]>) ?? {}).map(
            ([k, v]) => [k, Array.isArray(v) ? v.join("\n") : ""],
          ),
        ),
      );
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const urlPatternOverrides: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(overrides)) {
        const lines = v.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) urlPatternOverrides[k] = lines;
      }
      const res = await apiRequest("PUT", `/api/qcr/config/${clientId}`, {
        asanaSectionIds: sectionIds,
        urlPatternOverrides,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qcr/config", clientId] });
      toast({ title: "QCR config saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading config…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold">Quarterly Content Roadmap</h3>

      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">Asana Section IDs</p>
        {SECTION_KEYS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-[10px]">{label}</Label>
            <Input
              className="h-7 text-xs"
              value={sectionIds[key] ?? ""}
              onChange={(e) => setSectionIds((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="e.g. 1203456789012345"
            />
          </div>
        ))}
        <p className="text-[9px] text-muted-foreground">
          Find these in your client&apos;s Asana project — open a section, copy the number after /0/ in the URL.
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">URL Pattern Overrides</p>
        {PAGE_TYPE_KEYS.map(({ key, label, defaultPatterns }) => (
          <div key={key} className="space-y-1">
            <Label className="text-[10px]">{label}</Label>
            <textarea
              className="w-full min-h-[48px] rounded-md border bg-background px-2 py-1 text-[10px] leading-relaxed"
              value={overrides[key] ?? ""}
              onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={defaultPatterns}
            />
          </div>
        ))}
      </div>

      <Button
        className="w-full h-8 text-xs"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
        Save QCR Config
      </Button>
    </div>
  );
}
