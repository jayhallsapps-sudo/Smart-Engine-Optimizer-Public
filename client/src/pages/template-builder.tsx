import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ImageIcon, Save, Eye, RefreshCw, Download } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TemplateConfig {
  accentColor: string;
  headerImageExists: boolean;
}

const DEFAULT_CONFIG: TemplateConfig = {
  accentColor: "C0392B",
  headerImageExists: false,
};

const PREVIEW_SECTIONS = [
  { num: 1, title: "Performance Pulse & Key Insights" },
  { num: 2, title: "Progress & Quick Wins" },
  { num: 3, title: "Partnerships & Alignment" },
];

export default function TemplateBuilderPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageKey, setImageKey] = useState(0);

  useEffect(() => {
    fetch("/api/template/config")
      .then(r => r.json())
      .then((data: TemplateConfig) => setConfig(data))
      .catch(() => {});
  }, []);

  const handleFilePick = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file (PNG, JPG, etc.)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      setLocalImageUrl(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setPendingImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFilePick(file);
  }, [handleFilePick]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFilePick(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/template/save", {
        accentColor: config.accentColor,
        imageBase64: pendingImageBase64 ?? undefined,
      });
      setConfig(prev => ({ ...prev, headerImageExists: true }));
      setPendingImageBase64(null);
      setImageKey(k => k + 1);
      toast({ title: "Template saved", description: "Your changes will appear in all new bi-weekly reports." });
    } catch {
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const accentHex = `#${config.accentColor}`;

  const serverImageUrl = `/api/template/header?v=${imageKey}`;
  const previewImageUrl = localImageUrl ?? (config.headerImageExists ? serverImageUrl : null);

  const hasPendingChanges = pendingImageBase64 !== null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Template Builder</h1>
          <p className="text-sm text-muted-foreground">Customize the bi-weekly report header and colors, then commit to apply to all future exports.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPendingChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950">
              Unsaved changes
            </Badge>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="button-save-template"
          >
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Commit Template
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r p-4 overflow-y-auto shrink-0 flex flex-col gap-5">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Header Image
            </Label>
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-header-image"
            >
              {previewImageUrl ? (
                <div className="space-y-2">
                  <img
                    src={previewImageUrl}
                    alt="Header preview"
                    className="w-full h-16 object-cover rounded"
                  />
                  <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                </div>
              ) : (
                <div className="py-2 space-y-2">
                  <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Drop image here</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG — any size</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInput}
              data-testid="input-header-image-file"
            />
            <p className="text-xs text-muted-foreground mt-2">
              The image spans the full header. For best results use a wide (landscape) image.
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Accent Color
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentHex}
                onChange={e => setConfig(prev => ({ ...prev, accentColor: e.target.value.replace("#", "") }))}
                className="w-10 h-10 rounded cursor-pointer border"
                data-testid="input-accent-color"
              />
              <Input
                value={accentHex}
                onChange={e => {
                  const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                  setConfig(prev => ({ ...prev, accentColor: v }));
                }}
                className="font-mono text-sm"
                placeholder="#C0392B"
                data-testid="input-accent-color-hex"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Used for section headings and the "Purpose:" label.
            </p>
          </div>

          <Card className="p-3 bg-muted/50">
            <div className="flex items-start gap-2">
              <Eye className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                The preview on the right shows exactly how your bi-weekly report will be laid out. Click <strong>Commit Template</strong> to save and apply.
              </p>
            </div>
          </Card>

          <div className="mt-auto">
            <a href="/api/reports/biweekly/sample" download data-testid="link-download-sample">
              <Button variant="outline" size="sm" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Download Sample DOCX
              </Button>
            </a>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-900 flex items-start justify-center p-6">
          <DocumentPreview
            accentColor={accentHex}
            headerImageUrl={previewImageUrl}
          />
        </div>
      </div>
    </div>
  );
}

function DocumentPreview({
  accentColor,
  headerImageUrl,
}: {
  accentColor: string;
  headerImageUrl: string | null;
}) {
  return (
    <div
      className="bg-white shadow-xl"
      style={{
        width: "680px",
        minHeight: "880px",
        fontFamily: "Calibri, 'Segoe UI', sans-serif",
        fontSize: "13px",
        color: "#111827",
      }}
      data-testid="preview-document"
    >
      <div
        style={{
          width: "100%",
          height: "140px",
          overflow: "hidden",
          position: "relative",
          backgroundColor: headerImageUrl ? "transparent" : accentColor,
        }}
      >
        {headerImageUrl ? (
          <img
            src={headerImageUrl}
            alt="Header"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center center", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "24px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "white", letterSpacing: "2px" }}>W</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)", letterSpacing: "3px", textTransform: "uppercase" }}>webserv</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "28px 60px 40px" }}>
        <div style={{ marginBottom: "6px" }}>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#111827" }}>
            SEO Bi-weekly Meeting: Acme Plumbing &amp; HVAC
          </span>
        </div>
        <div style={{ fontSize: "12px", marginBottom: "4px" }}>
          <strong>Attendees:</strong> Sarah Mitchell (Acme), James Carter (Webserv), Dana Reyes (Webserv)
        </div>
        <div style={{ fontSize: "12px", display: "inline-block", backgroundColor: "#E8EAED", padding: "2px 8px", borderRadius: "3px", marginBottom: "20px" }}>
          <strong>Date:</strong> March 5, 2026
        </div>

        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: accentColor, marginBottom: "4px" }}>Purpose:</div>
          <div style={{ fontSize: "12px", color: "#374151" }}>
            To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.
          </div>
        </div>

        {PREVIEW_SECTIONS.map(section => (
          <div key={section.num} style={{ marginBottom: "18px" }}>
            <div style={{
              fontSize: "14px",
              fontWeight: 700,
              color: accentColor,
              borderBottom: `2px solid ${accentColor}`,
              paddingBottom: "3px",
              marginBottom: "8px",
            }}>
              {section.num}. {section.title}
            </div>
            <div style={{ paddingLeft: "16px" }}>
              {section.num === 1 && (
                <>
                  <div style={{ marginBottom: "5px", fontSize: "12px" }}>
                    <span style={{ display: "inline-block", marginRight: "6px" }}>●</span>
                    <strong style={{ color: accentColor }}>Organic Sessions QTD:</strong>
                    {" "}2,804 → Goal: 6,500 (43.1% of goal)
                  </div>
                  <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280", marginBottom: "3px" }}>
                    ○ Growth driven by emergency plumbing cluster — up +41% vs prior period.
                  </div>
                  <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280", marginBottom: "8px" }}>
                    ○ Drain cleaning pages softened −6% — optimization sprint planned.
                  </div>
                  <div style={{ marginBottom: "5px", fontSize: "12px" }}>
                    <span style={{ display: "inline-block", marginRight: "6px" }}>●</span>
                    <strong style={{ color: accentColor }}>NSM Metric QTD (Total Leads):</strong>
                    {" "}179 → Goal: 280 (63.9% of goal)
                  </div>
                  <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280" }}>
                    ○ CVR holding at 3.99% — emergency and water heater pages converting well.
                  </div>
                </>
              )}
              {section.num === 2 && (
                <>
                  <div style={{ width: "100%", borderCollapse: "collapse", display: "table", fontSize: "11px" }}>
                    {[
                      ["New Content", "Published 'Signs Your Water Heater Needs Replacing'", "Monitor + build internal links"],
                      ["Content Opt.", "Rewrote meta titles for 8 AC repair pages — avg pos 18 → 15", "Refresh body copy on top 3 pages"],
                      ["Technical SEO", "Fixed 34 broken links + 2 redirect chains", "Re-crawl + address 12 slow pages"],
                    ].map(([area, did, next], i) => (
                      <div key={i} style={{ display: "table-row", backgroundColor: i % 2 === 0 ? "white" : "#F0F4FA" }}>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", fontWeight: 600, width: "80px" }}>{area}</div>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", width: "250px" }}>{did}</div>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px" }}>{next}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {section.num === 3 && (
                <>
                  {[
                    "Client confirmed approval for drain-cleaning landing page design — sending to dev this week.",
                    "Request for 2 city-specific pages (Laguna Beach, Newport Beach) — added to sprint backlog.",
                    "Webserv to share updated keyword tracking spreadsheet by Friday.",
                    "Next meeting: March 19 at 10am PT.",
                  ].map((line, i) => (
                    <div key={i} style={{ marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ display: "inline-block", marginRight: "6px" }}>●</span>{line}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}

        <div style={{ borderTop: "1px solid #9CA3AF", paddingTop: "8px", marginTop: "20px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
          Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io
        </div>
      </div>
    </div>
  );
}
