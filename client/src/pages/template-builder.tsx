import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ImageIcon, Save, Eye, RefreshCw, Download, FileText, Presentation, LayoutTemplate } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type TabType = "biweekly" | "monthly" | "qbr";

interface BiweeklyConfig {
  accentColor: string;
  purposeText: string;
  footerText: string;
  headerImageExists: boolean;
}

interface PptxConfig {
  accentColor: string;
  highlightColor: string;
}

interface FullConfig {
  biweekly: BiweeklyConfig;
  monthly: PptxConfig;
  qbr: PptxConfig;
}

const DEFAULT_CONFIG: FullConfig = {
  biweekly: {
    accentColor: "C0392B",
    purposeText: "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.",
    footerText: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
    headerImageExists: false,
  },
  monthly: { accentColor: "1B3A6B", highlightColor: "E8F0FE" },
  qbr: { accentColor: "1B3A6B", highlightColor: "E8F0FE" },
};

const TABS: { id: TabType; label: string; icon: React.ReactNode; reportLabel: string }[] = [
  { id: "biweekly", label: "Bi-weekly", icon: <FileText className="w-4 h-4" />, reportLabel: "DOCX Report" },
  { id: "monthly", label: "Monthly", icon: <Presentation className="w-4 h-4" />, reportLabel: "PPTX Report" },
  { id: "qbr", label: "QBR", icon: <LayoutTemplate className="w-4 h-4" />, reportLabel: "PPTX Report" },
];

const PREVIEW_SECTIONS = [
  { num: 1, title: "Performance Pulse & Key Insights" },
  { num: 2, title: "Progress & Quick Wins" },
  { num: 3, title: "Partnerships & Alignment" },
];

export default function TemplateBuilderPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("biweekly");
  const [config, setConfig] = useState<FullConfig>(DEFAULT_CONFIG);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/template/config")
      .then(r => r.json())
      .then((data: any) => {
        setConfig(prev => ({
          biweekly: {
            accentColor: data?.biweekly?.accentColor ?? data?.accentColor ?? prev.biweekly.accentColor,
            purposeText: data?.biweekly?.purposeText ?? prev.biweekly.purposeText,
            footerText: data?.biweekly?.footerText ?? prev.biweekly.footerText,
            headerImageExists: data?.headerImageExists ?? false,
          },
          monthly: {
            accentColor: data?.monthly?.accentColor ?? prev.monthly.accentColor,
            highlightColor: data?.monthly?.highlightColor ?? prev.monthly.highlightColor,
          },
          qbr: {
            accentColor: data?.qbr?.accentColor ?? prev.qbr.accentColor,
            highlightColor: data?.qbr?.highlightColor ?? prev.qbr.highlightColor,
          },
        }));
      })
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
      setDirty(true);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFilePick(file);
  }, [handleFilePick]);

  const updateBiweekly = (key: keyof BiweeklyConfig, value: string) => {
    setConfig(prev => ({ ...prev, biweekly: { ...prev.biweekly, [key]: value } }));
    setDirty(true);
  };

  const updatePptx = (type: "monthly" | "qbr", key: keyof PptxConfig, value: string) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], [key]: value } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === "biweekly") {
        await apiRequest("POST", "/api/template/save", {
          templateType: "biweekly",
          accentColor: config.biweekly.accentColor,
          purposeText: config.biweekly.purposeText,
          footerText: config.biweekly.footerText,
          imageBase64: pendingImageBase64 ?? undefined,
        });
        setConfig(prev => ({ ...prev, biweekly: { ...prev.biweekly, headerImageExists: true } }));
        setPendingImageBase64(null);
        setImageKey(k => k + 1);
      } else {
        await apiRequest("POST", "/api/template/save", {
          templateType: activeTab,
          accentColor: config[activeTab].accentColor,
        });
      }
      setDirty(false);
      toast({ title: "Template saved", description: "Your changes will appear in all new reports." });
    } catch {
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const bwAccentHex = `#${config.biweekly.accentColor}`;
  const serverImageUrl = `/api/template/header?v=${imageKey}`;
  const previewImageUrl = localImageUrl ?? (config.biweekly.headerImageExists ? serverImageUrl : null);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Template Builder</h1>
          <p className="text-sm text-muted-foreground">
            Customize each report template, then commit to apply to all future exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950">
              Unsaved changes
            </Badge>
          )}
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-template">
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Commit Template
          </Button>
        </div>
      </div>

      <div className="border-b px-6 shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              {tab.icon}
              {tab.label}
              <span className="text-xs text-muted-foreground">{tab.reportLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r p-5 overflow-y-auto shrink-0 flex flex-col gap-5">
          {activeTab === "biweekly" && (
            <BiweeklyPanel
              config={config.biweekly}
              localImageUrl={localImageUrl}
              previewImageUrl={previewImageUrl}
              fileInputRef={fileInputRef}
              accentHex={bwAccentHex}
              onDrop={handleDrop}
              onFilePick={handleFilePick}
              onChange={updateBiweekly}
            />
          )}
          {(activeTab === "monthly" || activeTab === "qbr") && (
            <PptxPanel
              type={activeTab}
              config={config[activeTab]}
              onChange={(key, val) => updatePptx(activeTab, key, val)}
            />
          )}

          <div className="mt-auto pt-2">
            {activeTab === "biweekly" && (
              <a href="/api/reports/biweekly/sample" download data-testid="link-download-sample">
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample DOCX
                </Button>
              </a>
            )}
            {activeTab === "monthly" && (
              <a href="/api/reports/monthly/sample" download data-testid="link-download-monthly-sample">
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample Monthly PPTX
                </Button>
              </a>
            )}
            {activeTab === "qbr" && (
              <a href="/api/reports/qbr/sample" download data-testid="link-download-qbr-sample">
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample QBR PPTX
                </Button>
              </a>
            )}
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto bg-muted/30 flex items-start justify-center p-6">
          {activeTab === "biweekly" && (
            <BiweeklyPreview
              accentColor={bwAccentHex}
              headerImageUrl={previewImageUrl}
              purposeText={config.biweekly.purposeText}
              footerText={config.biweekly.footerText}
            />
          )}
          {(activeTab === "monthly" || activeTab === "qbr") && (
            <PptxPreview
              accentColor={`#${config[activeTab].accentColor}`}
              highlightColor={`#${config[activeTab].highlightColor}`}
              reportType={activeTab === "monthly" ? "Monthly SEO Report" : "Quarterly Business Review"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BiweeklyPanel({
  config,
  previewImageUrl,
  fileInputRef,
  accentHex,
  onDrop,
  onFilePick,
  onChange,
}: {
  config: BiweeklyConfig;
  localImageUrl: string | null;
  previewImageUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  accentHex: string;
  onDrop: (e: React.DragEvent) => void;
  onFilePick: (f: File) => void;
  onChange: (key: keyof BiweeklyConfig, value: string) => void;
}) {
  return (
    <>
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Header Image
        </Label>
        <div
          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          data-testid="dropzone-header-image"
        >
          {previewImageUrl ? (
            <div className="space-y-2">
              <img src={previewImageUrl} alt="Header preview" className="w-full h-14 object-cover rounded" />
              <p className="text-xs text-muted-foreground">Click or drop to replace</p>
            </div>
          ) : (
            <div className="py-2 space-y-1">
              <ImageIcon className="w-7 h-7 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Drop image here</p>
              <p className="text-xs text-muted-foreground">PNG, JPG — wide/landscape works best</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFilePick(f); }}
          data-testid="input-header-image-file"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Rendered at 6" (text-area width) so it fits reliably in Word, Pages, and Google Docs.
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
            onChange={e => onChange("accentColor", e.target.value.replace("#", ""))}
            className="w-9 h-9 rounded cursor-pointer border"
            data-testid="input-accent-color"
          />
          <Input
            value={accentHex}
            onChange={e => {
              const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              onChange("accentColor", v);
            }}
            className="font-mono text-sm"
            placeholder="#C0392B"
            data-testid="input-accent-color-hex"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Applied to section headings and the Purpose label.</p>
      </div>

      <div>
        <Label htmlFor="purpose-text" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Purpose Text
        </Label>
        <Textarea
          id="purpose-text"
          value={config.purposeText}
          onChange={e => onChange("purposeText", e.target.value)}
          rows={3}
          className="text-sm resize-none"
          placeholder="To review recent SEO progress…"
          data-testid="input-purpose-text"
        />
        <p className="text-xs text-muted-foreground mt-1.5">Shown under the "Purpose:" heading on every bi-weekly report.</p>
      </div>

      <div>
        <Label htmlFor="footer-text" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Footer Text
        </Label>
        <Input
          id="footer-text"
          value={config.footerText}
          onChange={e => onChange("footerText", e.target.value)}
          className="text-sm"
          placeholder="Webserv  |  Address  |  webserv.io"
          data-testid="input-footer-text"
        />
        <p className="text-xs text-muted-foreground mt-1.5">Centered at the bottom of every page.</p>
      </div>

      <Card className="p-3 bg-muted/50">
        <div className="flex items-start gap-2">
          <Eye className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            The preview shows how the bi-weekly DOCX will look. The header image renders within the 1.25" page margins — this is intentional and ensures it displays correctly in all DOCX viewers.
          </p>
        </div>
      </Card>
    </>
  );
}

function PptxPanel({
  type,
  config,
  onChange,
}: {
  type: "monthly" | "qbr";
  config: PptxConfig;
  onChange: (key: keyof PptxConfig, value: string) => void;
}) {
  const accentHex = `#${config.accentColor}`;
  const highlightHex = `#${config.highlightColor}`;
  const label = type === "monthly" ? "Monthly PPTX" : "QBR PPTX";

  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground mb-4">
          Customize colors for the <strong>{label}</strong> slides. These apply to the title slide background, section headers, and metric highlight cards.
        </p>
      </div>

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Slide Accent Color
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accentHex}
            onChange={e => onChange("accentColor", e.target.value.replace("#", ""))}
            className="w-9 h-9 rounded cursor-pointer border"
            data-testid={`input-${type}-accent-color`}
          />
          <Input
            value={accentHex}
            onChange={e => {
              const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              onChange("accentColor", v);
            }}
            className="font-mono text-sm"
            data-testid={`input-${type}-accent-hex`}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Title slide background and section header bars.</p>
      </div>

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
          Metric Card Highlight Color
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={highlightHex}
            onChange={e => onChange("highlightColor", e.target.value.replace("#", ""))}
            className="w-9 h-9 rounded cursor-pointer border"
            data-testid={`input-${type}-highlight-color`}
          />
          <Input
            value={highlightHex}
            onChange={e => {
              const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              onChange("highlightColor", v);
            }}
            className="font-mono text-sm"
            data-testid={`input-${type}-highlight-hex`}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Background fill for KPI metric cards on content slides.</p>
      </div>

      <Card className="p-3 bg-muted/50">
        <div className="flex items-start gap-2">
          <Eye className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            The preview on the right shows a representative slide layout with your chosen colors. Download the sample PPTX below to see the full output.
          </p>
        </div>
      </Card>
    </>
  );
}

function BiweeklyPreview({
  accentColor,
  headerImageUrl,
  purposeText,
  footerText,
}: {
  accentColor: string;
  headerImageUrl: string | null;
  purposeText: string;
  footerText: string;
}) {
  return (
    <div
      className="bg-white shadow-xl"
      style={{ width: "680px", minHeight: "880px", fontFamily: "Calibri, 'Segoe UI', sans-serif", fontSize: "13px", color: "#111827" }}
      data-testid="preview-document"
    >
      <div style={{ padding: "0 0 0 0" }}>
        <div style={{ padding: "0 90px" }}>
          {headerImageUrl ? (
            <img
              src={headerImageUrl}
              alt="Header"
              style={{ width: "100%", display: "block", marginTop: "16px" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100px",
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}CC 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "20px",
                marginTop: "16px",
                borderRadius: "2px",
              }}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "white", letterSpacing: "2px" }}>WEBSERV</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", letterSpacing: "2px" }}>webserv.io</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "24px 90px 40px" }}>
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
            <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.5 }}>{purposeText}</div>
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
                    <div style={{ marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ marginRight: "6px" }}>●</span>
                      <strong style={{ color: accentColor }}>Organic Sessions QTD:</strong>
                      {" "}2,804 → Goal: 6,500 (43.1% of goal)
                    </div>
                    <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280", marginBottom: "2px" }}>○ Growth driven by emergency plumbing cluster — up +41% vs prior period.</div>
                    <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280", marginBottom: "6px" }}>○ Drain cleaning pages softened −6% — optimization sprint planned.</div>
                    <div style={{ marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ marginRight: "6px" }}>●</span>
                      <strong style={{ color: accentColor }}>NSM Metric QTD (Total Leads):</strong>
                      {" "}179 → Goal: 280 (63.9% of goal)
                    </div>
                    <div style={{ paddingLeft: "20px", fontSize: "11px", color: "#6B7280" }}>○ CVR holding at 3.99% — emergency and water heater pages converting well.</div>
                  </>
                )}
                {section.num === 2 && (
                  <div style={{ display: "table", width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    {[
                      ["New Content", "Published 'Signs Your Water Heater Needs Replacing'", "Monitor + build internal links"],
                      ["Content Opt.", "Rewrote meta titles for 8 AC repair pages — avg pos 18 → 15", "Refresh body copy on top 3"],
                      ["Technical", "Fixed 34 broken links + 2 redirect chains", "Re-crawl + address 12 slow pages"],
                    ].map(([area, did, next], i) => (
                      <div key={i} style={{ display: "table-row", backgroundColor: i % 2 === 0 ? "white" : "#F0F4FA" }}>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", fontWeight: 600, width: "80px" }}>{area}</div>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", width: "240px" }}>{did}</div>
                        <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px" }}>{next}</div>
                      </div>
                    ))}
                  </div>
                )}
                {section.num === 3 && (
                  <>
                    {[
                      "Client confirmed approval for drain-cleaning landing page — sending to dev this week.",
                      "Request for 2 city-specific pages (Laguna Beach, Newport Beach) — added to sprint backlog.",
                      "Webserv to share updated keyword tracking spreadsheet by Friday.",
                      "Next meeting: March 19 at 10am PT.",
                    ].map((line, i) => (
                      <div key={i} style={{ marginBottom: "4px", fontSize: "12px" }}>
                        <span style={{ marginRight: "6px" }}>●</span>{line}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}

          <div style={{ borderTop: "1px solid #9CA3AF", paddingTop: "8px", marginTop: "20px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
            {footerText}
          </div>
        </div>
      </div>
    </div>
  );
}

function PptxPreview({
  accentColor,
  highlightColor,
  reportType,
}: {
  accentColor: string;
  highlightColor: string;
  reportType: string;
}) {
  const METRICS = [
    { label: "Organic Sessions", value: "14,821", delta: "▲ +30.7%", positive: true },
    { label: "Goal Completions", value: "592", delta: "▲ +34.2%", positive: true },
    { label: "CVR", value: "3.99%", delta: "▲ +0.10%", positive: true },
    { label: "Organic Calls", value: "287", delta: "▲ +31.1%", positive: true },
  ];

  return (
    <div
      className="shadow-xl"
      style={{
        width: "680px",
        aspectRatio: "16/9",
        fontFamily: "'Segoe UI', Calibri, sans-serif",
        color: "#1F2937",
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="preview-pptx-slide"
    >
      <div style={{ backgroundColor: accentColor, padding: "28px 36px 24px", color: "white", flexShrink: 0 }}>
        <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>{reportType}</div>
        <div style={{ fontSize: "15px", opacity: 0.85 }}>Acme Plumbing &amp; HVAC</div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>Q1 2025 Performance</div>
      </div>

      <div style={{ flex: 1, backgroundColor: "#F8FAFC", padding: "20px 36px 16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
          QTD Key Performance Indicators
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {METRICS.map((m, i) => (
            <div
              key={i}
              style={{
                backgroundColor: highlightColor,
                border: "1px solid #D1D5DB",
                borderRadius: "4px",
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: "9px", color: "#6B7280", marginBottom: "4px" }}>{m.label}</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>{m.value}</div>
              <div style={{ fontSize: "9px", color: m.positive ? "#16A34A" : "#DC2626" }}>{m.delta}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "16px", backgroundColor: "white", border: "1px solid #E5E7EB", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ backgroundColor: accentColor, padding: "6px 12px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "white" }}>Top Landing Pages by Sessions</span>
          </div>
          {[
            ["/emergency-plumbing", "3,814", "+73.3%"],
            ["/water-heater-repair", "3,102", "+23.4%"],
            ["/ac-repair-irvine", "2,481", "+54.9%"],
          ].map(([page, sessions, change], i) => (
            <div key={i} style={{ display: "flex", fontSize: "10px", padding: "5px 12px", backgroundColor: i % 2 === 0 ? "white" : highlightColor, borderTop: i > 0 ? "1px solid #E5E7EB" : undefined }}>
              <span style={{ flex: 1, color: "#374151" }}>{page}</span>
              <span style={{ width: "60px", textAlign: "right", color: "#374151" }}>{sessions}</span>
              <span style={{ width: "50px", textAlign: "right", color: "#16A34A" }}>{change}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "12px", textAlign: "right", fontSize: "9px", color: "#9CA3AF" }}>
          Webserv  |  webserv.io
        </div>
      </div>
    </div>
  );
}
