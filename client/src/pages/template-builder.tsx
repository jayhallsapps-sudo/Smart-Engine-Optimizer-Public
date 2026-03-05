import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Save, Eye, RefreshCw, Download, FileText, Presentation, LayoutTemplate, Link2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { EditableSection } from "@/components/report-preview/editable-section";

type TabType = "biweekly" | "monthly" | "qbr";

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "biweekly", label: "Bi-weekly DOCX", icon: <FileText className="w-4 h-4" /> },
  { id: "monthly", label: "Monthly PPTX", icon: <Presentation className="w-4 h-4" /> },
  { id: "qbr", label: "QBR PPTX", icon: <LayoutTemplate className="w-4 h-4" /> },
];

const DEFAULT_EDITS: Record<string, string> = {
  purpose: "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.",
  title_pulse: "Performance Pulse & Key Insights",
  title_progress: "Progress & Quick Wins",
  title_partnership: "Partnerships & Alignment",
  footer: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
  pulse_b1_bold: "Organic Sessions QTD:",
  pulse_b1_normal: " 3,091 → Goal: 7,178 (43.06% of goal for the month)",
  pulse_b1_sub1: "Pacing is slightly behind, concentrated in a handful of landing pages.",
  pulse_b1_sub2: "Growth driven by emergency plumbing cluster — up +41% vs. prior period.",
  pulse_b1_sub3: "Drain cleaning pages softened (−6%). Optimization sprint planned for next period.",
  pulse_b2_bold: "NSM Metric QTD (Total Leads):",
  pulse_b2_normal: " 179 → Goal: 280 (63.9% of goal for the month)",
  pulse_b2_sub1: "Performance pacing ahead of the leads target relative to where sessions are.",
  pulse_b2_sub2: "CVR holding strong at 3.99% vs. 3.93% prior period.",
  partnership_text: "Client confirmed approval for drain-cleaning landing page — sending to dev this week.\nRequest for 2 city-specific pages (Laguna Beach, Newport Beach) — adding to sprint backlog.\nWebserv to share updated keyword tracking spreadsheet by Friday.\nNext meeting: March 19 at 10am PT.",
};

const DEFAULT_WORK_LOG = [
  { area: "New Content", whatWeDid: "Published 'Signs Your Water Heater Needs Replacing' blog post — 1,200 words, targeting water-heater-replacement-cost cluster.", whatsNext: "Monitor impressions over 30 days; build 2 internal links from service pages.", url: "" },
  { area: "Content Optimization", whatWeDid: "Rewrote meta titles and H1s for 8 AC repair pages. Average position improved from 18.3 → 14.7 after update.", whatsNext: "Refresh body copy on top 3 pages with new FAQ schema once rankings stabilize.", url: "" },
  { area: "Technical SEO", whatWeDid: "Fixed 34 broken internal links. Resolved 2 redirect chains > 3 hops.", whatsNext: "Run re-crawl next week to confirm fixes. Address remaining 12 slow pages (LCP > 4s).", url: "" },
  { area: "Local SEO", whatWeDid: "Optimized GBP posts for summer HVAC campaign. Profile views up 22% vs prior period.", whatsNext: "Upload 10 new job-site photos. Request 5 new Google reviews from recent customers.", url: "" },
];

const DEFAULT_PPTX = { monthly: { accentColor: "1B3A6B", highlightColor: "E8F0FE" }, qbr: { accentColor: "1B3A6B", highlightColor: "E8F0FE" } };

export default function TemplateBuilderPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>("biweekly");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [workLogRows, setWorkLogRows] = useState(DEFAULT_WORK_LOG);
  const [accentColor, setAccentColor] = useState("C0392B");
  const [pptxCfg, setPptxCfg] = useState(DEFAULT_PPTX);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [headerImageExists, setHeaderImageExists] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/template/config")
      .then(r => r.json())
      .then((data: any) => {
        const bw = data?.biweekly ?? {};
        const init: Record<string, string> = {};
        if (bw.purposeText) init.purpose = bw.purposeText;
        if (bw.footerText) init.footer = bw.footerText;
        if (bw.sectionTitles?.bw_pulse) init.title_pulse = bw.sectionTitles.bw_pulse;
        if (bw.sectionTitles?.bw_progress) init.title_progress = bw.sectionTitles.bw_progress;
        if (bw.sectionTitles?.bw_partnership) init.title_partnership = bw.sectionTitles.bw_partnership;
        setEdits(init);
        setAccentColor(bw.accentColor ?? data?.accentColor ?? "C0392B");
        setHeaderImageExists(data?.headerImageExists ?? false);
        if (data?.monthly) setPptxCfg(p => ({ ...p, monthly: { accentColor: data.monthly.accentColor ?? p.monthly.accentColor, highlightColor: data.monthly.highlightColor ?? p.monthly.highlightColor } }));
        if (data?.qbr) setPptxCfg(p => ({ ...p, qbr: { accentColor: data.qbr.accentColor ?? p.qbr.accentColor, highlightColor: data.qbr.highlightColor ?? p.qbr.highlightColor } }));
      })
      .catch(() => {});
  }, []);

  function getVal(key: string) {
    return edits[key] ?? DEFAULT_EDITS[key] ?? "";
  }

  function onEdit(key: string, val: string) {
    setEdits(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  }

  const handleFilePick = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      setLocalImageUrl(dataUrl);
      setPendingImageBase64(dataUrl.split(",")[1]);
      setDirty(true);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === "biweekly") {
        await apiRequest("POST", "/api/template/save", {
          templateType: "biweekly",
          accentColor,
          purposeText: getVal("purpose"),
          footerText: getVal("footer"),
          sectionTitles: {
            bw_pulse: getVal("title_pulse"),
            bw_progress: getVal("title_progress"),
            bw_partnership: getVal("title_partnership"),
          },
          imageBase64: pendingImageBase64 ?? undefined,
        });
        if (pendingImageBase64) setHeaderImageExists(true);
        setPendingImageBase64(null);
        setImageKey(k => k + 1);
      } else {
        const cfg = pptxCfg[activeTab];
        await apiRequest("POST", "/api/template/save", {
          templateType: activeTab,
          accentColor: cfg.accentColor,
        });
      }
      setDirty(false);
      toast({ title: "Template saved", description: "Changes will apply to all future report exports." });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const accentHex = `#${accentColor}`;
  const serverImageUrl = `/api/template/header?v=${imageKey}`;
  const previewImageUrl = localImageUrl ?? (headerImageExists ? serverImageUrl : null);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Template Builder</h1>
          <p className="text-sm text-muted-foreground">Click any text in the preview to edit it. Commit when ready.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950">Unsaved changes</Badge>
          )}
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-template">
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Commit Template
          </Button>
        </div>
      </div>

      <div className="border-b px-6 shrink-0 flex gap-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r p-4 overflow-y-auto shrink-0 flex flex-col gap-4">
          {activeTab === "biweekly" && (
            <>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Header Image</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary transition-colors"
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFilePick(f); }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-header-image"
                >
                  {previewImageUrl ? (
                    <div className="space-y-1.5">
                      <img src={previewImageUrl} alt="Header" className="w-full h-12 object-cover rounded" />
                      <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                    </div>
                  ) : (
                    <div className="py-2 space-y-1">
                      <ImageIcon className="w-7 h-7 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">Drop image here</p>
                      <p className="text-xs text-muted-foreground">PNG or JPG, wide/landscape</p>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }} data-testid="input-header-image-file" />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Accent Color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={accentHex} onChange={e => { setAccentColor(e.target.value.replace("#", "")); setDirty(true); }} className="w-9 h-9 rounded cursor-pointer border" data-testid="input-accent-color" />
                  <Input
                    value={accentHex}
                    onChange={e => { const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setAccentColor(v); setDirty(true); }}
                    className="font-mono text-sm"
                    data-testid="input-accent-color-hex"
                  />
                </div>
              </div>

              <Card className="p-3 bg-muted/50">
                <div className="flex items-start gap-2">
                  <Eye className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Click any text in the preview to edit it. Section titles, purpose text, bullet copy, work log entries, URLs, and the footer are all editable. Hit <strong>Commit</strong> to save the template settings.
                  </p>
                </div>
              </Card>

              <div className="mt-auto">
                <a href="/api/reports/biweekly/sample" download data-testid="link-download-sample">
                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="w-4 h-4 mr-2" />Download Sample DOCX
                  </Button>
                </a>
              </div>
            </>
          )}

          {(activeTab === "monthly" || activeTab === "qbr") && (
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-4">
                  Customize the slide accent and highlight colors for the <strong>{activeTab === "monthly" ? "Monthly" : "QBR"} PPTX</strong>.
                </p>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Slide Accent Color</Label>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="color"
                    value={`#${pptxCfg[activeTab].accentColor}`}
                    onChange={e => { setPptxCfg(p => ({ ...p, [activeTab]: { ...p[activeTab], accentColor: e.target.value.replace("#", "") } })); setDirty(true); }}
                    className="w-9 h-9 rounded cursor-pointer border"
                    data-testid={`input-${activeTab}-accent`}
                  />
                  <Input
                    value={`#${pptxCfg[activeTab].accentColor}`}
                    onChange={e => { const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setPptxCfg(p => ({ ...p, [activeTab]: { ...p[activeTab], accentColor: v } })); setDirty(true); }}
                    className="font-mono text-sm"
                  />
                </div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Metric Card Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={`#${pptxCfg[activeTab].highlightColor}`}
                    onChange={e => { setPptxCfg(p => ({ ...p, [activeTab]: { ...p[activeTab], highlightColor: e.target.value.replace("#", "") } })); setDirty(true); }}
                    className="w-9 h-9 rounded cursor-pointer border"
                  />
                  <Input
                    value={`#${pptxCfg[activeTab].highlightColor}`}
                    onChange={e => { const v = e.target.value.replace("#", "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setPptxCfg(p => ({ ...p, [activeTab]: { ...p[activeTab], highlightColor: v } })); setDirty(true); }}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="mt-auto">
                <a href={activeTab === "monthly" ? "/api/reports/monthly/sample" : "/api/reports/qbr/sample"} download>
                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="w-4 h-4 mr-2" />Download Sample PPTX
                  </Button>
                </a>
              </div>
            </>
          )}
        </aside>

        <div className="flex-1 overflow-y-auto bg-muted/30 flex items-start justify-center p-6">
          {activeTab === "biweekly" && (
            <BiweeklyPreview
              accentHex={accentHex}
              previewImageUrl={previewImageUrl}
              edits={edits}
              workLogRows={workLogRows}
              onEdit={onEdit}
              onWorkLogChange={(rows) => { setWorkLogRows(rows); setDirty(true); }}
              getVal={getVal}
            />
          )}
          {(activeTab === "monthly" || activeTab === "qbr") && (
            <PptxPreview
              accentColor={`#${pptxCfg[activeTab].accentColor}`}
              highlightColor={`#${pptxCfg[activeTab].highlightColor}`}
              reportType={activeTab === "monthly" ? "Monthly SEO Report" : "Quarterly Business Review"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type WorkLogRow = { area: string; whatWeDid: string; whatsNext: string; url: string };

function BiweeklyPreview({
  accentHex,
  previewImageUrl,
  edits,
  workLogRows,
  onEdit,
  onWorkLogChange,
  getVal,
}: {
  accentHex: string;
  previewImageUrl: string | null;
  edits: Record<string, string>;
  workLogRows: WorkLogRow[];
  onEdit: (key: string, val: string) => void;
  onWorkLogChange: (rows: WorkLogRow[]) => void;
  getVal: (key: string) => string;
}) {
  const editRow = (i: number, field: keyof WorkLogRow, val: string) => {
    const updated = workLogRows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    onWorkLogChange(updated);
  };

  return (
    <div
      className="bg-white shadow-xl"
      style={{ width: "700px", minHeight: "900px", fontFamily: "Calibri, 'Segoe UI', sans-serif", fontSize: "13px", color: "#111827" }}
      data-testid="preview-document"
    >
      <div style={{ width: "100%", overflow: "hidden", lineHeight: 0 }}>
        {previewImageUrl ? (
          <img src={previewImageUrl} alt="Header" style={{ width: "100%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "120px", background: `linear-gradient(135deg, ${accentHex} 60%, #a02820)`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "32px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "white", letterSpacing: "3px", lineHeight: 1 }}>W</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", letterSpacing: "4px" }}>WEBSERV</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "24px 56px 40px" }}>
        <div style={{ marginBottom: "6px", fontSize: "20px", fontWeight: 700 }}>
          SEO Bi-weekly Meeting: Acme Plumbing &amp; HVAC
        </div>
        <div style={{ fontSize: "12px", marginBottom: "4px" }}>
          <strong>Attendees:</strong> Sarah Mitchell (Acme), James Carter (Webserv), Dana Reyes (Webserv)
        </div>
        <div style={{ fontSize: "12px", display: "inline-block", backgroundColor: "#E8EAED", padding: "2px 8px", borderRadius: "3px", marginBottom: "20px" }}>
          <strong>Date:</strong> March 5, 2026
        </div>

        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: accentHex, marginBottom: "4px" }}>Purpose:</div>
          <div style={{ fontSize: "12px", color: "#374151" }}>
            <EditableSection editKey="purpose" value={DEFAULT_EDITS.purpose} edits={edits} onEdit={onEdit} multiline as="div" />
          </div>
        </div>

        <SectionBlock num={1} titleKey="title_pulse" accentHex={accentHex} edits={edits} onEdit={onEdit} getVal={getVal}>
          {[
            { boldKey: "pulse_b1_bold", normalKey: "pulse_b1_normal", subs: ["pulse_b1_sub1", "pulse_b1_sub2", "pulse_b1_sub3"] },
            { boldKey: "pulse_b2_bold", normalKey: "pulse_b2_normal", subs: ["pulse_b2_sub1", "pulse_b2_sub2"] },
          ].map((b, bi) => (
            <div key={bi} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "12px" }}>
                <span style={{ marginTop: "2px" }}>●</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: accentHex }}>
                    <EditableSection editKey={b.boldKey} value={DEFAULT_EDITS[b.boldKey]} edits={edits} onEdit={onEdit} as="span" />
                  </span>
                  <EditableSection editKey={b.normalKey} value={DEFAULT_EDITS[b.normalKey]} edits={edits} onEdit={onEdit} as="span" />
                </div>
              </div>
              {b.subs.map(sk => (
                <div key={sk} style={{ display: "flex", alignItems: "flex-start", gap: "6px", paddingLeft: "18px", marginTop: "2px", fontSize: "11px", color: "#6B7280" }}>
                  <span style={{ marginTop: "2px" }}>○</span>
                  <EditableSection editKey={sk} value={DEFAULT_EDITS[sk]} edits={edits} onEdit={onEdit} as="div" style={{ flex: 1 }} />
                </div>
              ))}
            </div>
          ))}
        </SectionBlock>

        <SectionBlock num={2} titleKey="title_progress" accentHex={accentHex} edits={edits} onEdit={onEdit} getVal={getVal}>
          <div style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", display: "table" }}>
            <div style={{ display: "table-row" }}>
              {["Area", "What We Did / Learned", "What's Next"].map(h => (
                <div key={h} style={{ display: "table-cell", backgroundColor: "#000", color: "#fff", padding: "5px 8px", fontWeight: 700, fontSize: "11px", border: "1px solid #D1D5DB" }}>{h}</div>
              ))}
            </div>
            {workLogRows.map((row, ri) => (
              <div key={ri} style={{ display: "table-row", backgroundColor: ri % 2 === 1 ? "#F0F4FA" : "white" }}>
                <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", verticalAlign: "top", width: "90px" }}>
                  <WorkLogCell value={row.area} onChange={v => editRow(ri, "area", v)} />
                </div>
                <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", verticalAlign: "top", width: "260px" }}>
                  <WorkLogCell value={row.whatWeDid} onChange={v => editRow(ri, "whatWeDid", v)} multiline />
                  <UrlField value={row.url} onChange={v => editRow(ri, "url", v)} />
                </div>
                <div style={{ display: "table-cell", border: "1px solid #D1D5DB", padding: "4px 6px", verticalAlign: "top" }}>
                  <WorkLogCell value={row.whatsNext} onChange={v => editRow(ri, "whatsNext", v)} multiline />
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock num={3} titleKey="title_partnership" accentHex={accentHex} edits={edits} onEdit={onEdit} getVal={getVal}>
          {getVal("partnership_text").split("\n").filter(l => l.trim()).map((line, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px", fontSize: "12px" }}>
              <span>●</span>
              <span>{line}</span>
            </div>
          ))}
          <div style={{ marginTop: "6px" }}>
            <EditableSection editKey="partnership_text" value={DEFAULT_EDITS.partnership_text} edits={edits} onEdit={onEdit} multiline as="div"
              style={{ fontSize: "11px", color: "#6B7280", fontStyle: "italic" }}
            />
            <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>↑ Click to edit all partnership bullets</div>
          </div>
        </SectionBlock>

        <div style={{ borderTop: "1px solid #9CA3AF", marginTop: "24px", paddingTop: "8px", textAlign: "center", fontSize: "10px", color: "#6B7280" }}>
          <EditableSection editKey="footer" value={DEFAULT_EDITS.footer} edits={edits} onEdit={onEdit} as="span" />
        </div>
      </div>
    </div>
  );
}

function SectionBlock({
  num, titleKey, accentHex, edits, onEdit, getVal, children,
}: {
  num: number;
  titleKey: string;
  accentHex: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  getVal: (k: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ borderBottom: `2px solid ${accentHex}`, paddingBottom: "3px", marginBottom: "10px", display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{ fontWeight: 700, fontSize: "14px", color: accentHex }}>{num}.</span>
        <EditableSection
          editKey={titleKey}
          value={DEFAULT_EDITS[titleKey]}
          edits={edits}
          onEdit={onEdit}
          as="span"
          style={{ fontWeight: 700, fontSize: "14px", color: accentHex }}
        />
      </div>
      {children}
    </div>
  );
}

function WorkLogCell({ value, onChange, multiline }: { value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function start() { setDraft(value); setEditing(true); }
  function commit() { onChange(draft); setEditing(false); }

  if (editing) {
    return (
      <span className="block">
        {multiline ? (
          <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            style={{ width: "100%", border: "1px solid #D1D5DB", borderRadius: "2px", padding: "2px 4px", fontSize: "11px", resize: "vertical", minHeight: "48px", fontFamily: "inherit" }} />
        ) : (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            style={{ width: "100%", border: "1px solid #D1D5DB", borderRadius: "2px", padding: "2px 4px", fontSize: "11px", fontFamily: "inherit" }} />
        )}
      </span>
    );
  }
  return (
    <span
      onClick={start}
      title="Click to edit"
      style={{ display: "block", cursor: "pointer", borderRadius: "2px" }}
      className="hover:bg-muted hover:outline hover:outline-1 hover:outline-border"
    >
      {value || <span style={{ color: "#9CA3AF" }}>—</span>}
    </span>
  );
}

function UrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "3px" }}>
      {open || value ? (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
          <Link2 style={{ width: "10px", height: "10px", color: "#6B7280", flexShrink: 0 }} />
          <input
            type="url"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="https://example.com/article"
            style={{ flex: 1, border: "1px dashed #D1D5DB", borderRadius: "2px", padding: "1px 4px", fontSize: "10px", color: "#374151", fontFamily: "inherit" }}
          />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{ fontSize: "10px", color: "#9CA3AF", cursor: "pointer", background: "none", border: "none", padding: "0", textDecoration: "underline dotted" }}
        >
          + add article URL
        </button>
      )}
    </div>
  );
}

function PptxPreview({ accentColor, highlightColor, reportType }: { accentColor: string; highlightColor: string; reportType: string }) {
  const METRICS = [
    { label: "Organic Sessions", value: "14,821", delta: "▲ +30.7%", pos: true },
    { label: "Goal Completions", value: "592", delta: "▲ +34.2%", pos: true },
    { label: "CVR", value: "3.99%", delta: "▲ +0.10%", pos: true },
    { label: "Organic Calls", value: "287", delta: "▲ +31.1%", pos: true },
  ];
  return (
    <div className="shadow-xl" style={{ width: "700px", aspectRatio: "16/9", fontFamily: "'Segoe UI', Calibri, sans-serif", display: "flex", flexDirection: "column" }} data-testid="preview-pptx-slide">
      <div style={{ backgroundColor: accentColor, padding: "28px 36px 24px", color: "white" }}>
        <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>{reportType}</div>
        <div style={{ fontSize: "15px", opacity: 0.85 }}>Acme Plumbing &amp; HVAC</div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>Q1 2025 Performance</div>
      </div>
      <div style={{ flex: 1, backgroundColor: "#F8FAFC", padding: "20px 36px 16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>QTD Key Performance Indicators</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {METRICS.map((m, i) => (
            <div key={i} style={{ backgroundColor: highlightColor, border: "1px solid #D1D5DB", borderRadius: "4px", padding: "10px 12px" }}>
              <div style={{ fontSize: "9px", color: "#6B7280", marginBottom: "4px" }}>{m.label}</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>{m.value}</div>
              <div style={{ fontSize: "9px", color: m.pos ? "#16A34A" : "#DC2626" }}>{m.delta}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "16px", backgroundColor: "white", border: "1px solid #E5E7EB", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ backgroundColor: accentColor, padding: "6px 12px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "white" }}>Top Landing Pages by Sessions</span>
          </div>
          {[["/emergency-plumbing", "3,814", "+73.3%"], ["/water-heater-repair", "3,102", "+23.4%"], ["/ac-repair-irvine", "2,481", "+54.9%"]].map(([p, s, c], i) => (
            <div key={i} style={{ display: "flex", fontSize: "10px", padding: "5px 12px", backgroundColor: i % 2 === 0 ? "white" : highlightColor, borderTop: i > 0 ? "1px solid #E5E7EB" : undefined }}>
              <span style={{ flex: 1, color: "#374151" }}>{p}</span>
              <span style={{ width: "60px", textAlign: "right", color: "#374151" }}>{s}</span>
              <span style={{ width: "50px", textAlign: "right", color: "#16A34A" }}>{c}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "12px", textAlign: "right", fontSize: "9px", color: "#9CA3AF" }}>Webserv  |  webserv.io</div>
      </div>
    </div>
  );
}
