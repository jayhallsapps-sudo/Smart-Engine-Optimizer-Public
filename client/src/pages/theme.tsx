import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronRight,
  Palette,
  Type,
  Image,
  Layout,
  Table2,
  Layers,
  FileText,
  Save,
  Globe,
  MoreHorizontal,
  Copy,
  Pencil,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  Presentation,
  BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_THEME_TOKENS,
  type Theme,
  type ThemeTokens,
  type BackgroundDef,
} from "@shared/schema";

// ─── Google Fonts available ──────────────────────────────────────────────────

const HEADING_FONTS = [
  "Montserrat", "Raleway", "Playfair Display", "Inter", "Roboto",
  "Open Sans", "Lato", "Merriweather", "Source Serif 4", "DM Sans",
];
const BODY_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "DM Sans",
  "Nunito", "Source Sans 3", "Noto Sans", "Work Sans", "Poppins",
];

// ─── Font injection ───────────────────────────────────────────────────────────

function useFontInjection(headingFont: string, bodyFont: string) {
  useEffect(() => {
    const fonts = [...new Set([headingFont, bodyFont])];
    const query = fonts.map(f => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
    const id = "smarteo-theme-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  }, [headingFont, bodyFont]);
}

// ─── Background helpers ───────────────────────────────────────────────────────

function bgStyle(bg: BackgroundDef): React.CSSProperties {
  if (bg.type === "gradient") {
    return { background: `linear-gradient(${bg.gradientDirection}, ${bg.gradientFrom}, ${bg.gradientTo})` };
  }
  if (bg.type === "solid") {
    return { backgroundColor: bg.solidColor };
  }
  return { backgroundColor: "#ffffff" };
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true, onOpen }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => {
          const opening = !open;
          setOpen(opening);
          if (opening) onOpen?.();
        }}
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Color swatch input ───────────────────────────────────────────────────────

function ColorField({ label, value, onChange, testId }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [hex, setHex] = useState(value);

  // Keep hex input in sync when value changes externally
  useEffect(() => { setHex(value); }, [value]);

  const handleHexBlur = () => {
    // Validate and apply hex on blur
    const cleaned = hex.startsWith("#") ? hex : `#${hex}`;
    const valid = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleaned);
    if (valid) {
      onChange(cleaned);
    } else {
      setHex(value); // revert if invalid
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] text-muted-foreground min-w-0 flex-1 truncate">{label}</Label>
      <div className="flex items-center gap-1.5 shrink-0">
        <label
          className="w-7 h-7 rounded border border-border shrink-0 cursor-pointer block relative"
          style={{ backgroundColor: value }}
          title={`Pick ${label} color`}
        >
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            data-testid={testId}
          />
        </label>
        <Input
          value={hex}
          onChange={e => { setHex(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(e.target.value); }}
          onBlur={handleHexBlur}
          onKeyDown={e => { if (e.key === "Enter") handleHexBlur(); }}
          className="h-6 w-20 text-[10px] px-1.5 font-mono"
          placeholder="#000000"
          data-testid={testId ? `${testId}-hex` : undefined}
        />
      </div>
    </div>
  );
}

// ─── Background editor ────────────────────────────────────────────────────────

function BackgroundEditor({ label, value, onChange }: {
  label: string;
  value: BackgroundDef;
  onChange: (v: BackgroundDef) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded shrink-0" style={bgStyle(value)} />
        <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(["solid", "gradient", "none"] as const).map(t => (
          <button
            key={t}
            className={`text-[10px] py-1 rounded border transition-colors capitalize ${value.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            onClick={() => onChange({ ...value, type: t })}
          >
            {t}
          </button>
        ))}
      </div>
      {value.type === "solid" && (
        <ColorField label="Color" value={value.solidColor} onChange={c => onChange({ ...value, solidColor: c })} />
      )}
      {value.type === "gradient" && (
        <div className="space-y-2">
          <ColorField label="From" value={value.gradientFrom} onChange={c => onChange({ ...value, gradientFrom: c })} />
          <ColorField label="To" value={value.gradientTo} onChange={c => onChange({ ...value, gradientTo: c })} />
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Direction</Label>
            <Select value={value.gradientDirection} onValueChange={d => onChange({ ...value, gradientDirection: d })}>
              <SelectTrigger className="h-6 text-[10px] w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="135deg">Diagonal ↘</SelectItem>
                <SelectItem value="to-r">Horizontal →</SelectItem>
                <SelectItem value="to-b">Vertical ↓</SelectItem>
                <SelectItem value="225deg">Diagonal ↙</SelectItem>
                <SelectItem value="45deg">Diagonal ↗</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Preview Slides ───────────────────────────────────────────────────────────

type PreviewSlide = "title" | "kpi" | "chart" | "table" | "content" | "divider" | "summary";
type PreviewPage = "cover" | "executive" | "data" | "detail";
type PreviewMode = "slides" | "pages";

const PREVIEW_TABS: { id: PreviewSlide; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "kpi", label: "KPI" },
  { id: "chart", label: "Chart" },
  { id: "table", label: "Table" },
  { id: "content", label: "Content" },
  { id: "divider", label: "Divider" },
  { id: "summary", label: "Summary" },
];

const PAGE_TABS: { id: PreviewPage; label: string }[] = [
  { id: "cover", label: "Cover" },
  { id: "executive", label: "Exec. Summary" },
  { id: "data", label: "GSC Data" },
  { id: "detail", label: "Sprint" },
];

function SlideFrame({ tokens, children, bgKey }: {
  tokens: ThemeTokens;
  children: React.ReactNode;
  bgKey: keyof ThemeTokens["backgrounds"];
}) {
  const bg = tokens.backgrounds[bgKey];
  return (
    <div
      className="relative w-full overflow-hidden flex flex-col"
      style={{
        ...bgStyle(bg),
        aspectRatio: "16/9",
        borderRadius: `${tokens.borderRadius / 2}px`,
        fontFamily: tokens.bodyFont,
      }}
    >
      {tokens.showHeader && (
        <div
          className="w-full flex items-center px-4 py-1.5 shrink-0"
          style={{ backgroundColor: tokens.headerColor, minHeight: "28px" }}
        >
          {tokens.logoUrl ? (
            <img src={tokens.logoUrl} alt={tokens.brandName} style={{ maxHeight: 14, maxWidth: 60, objectFit: "contain" }} />
          ) : (
            <span style={{ color: tokens.headerTextColor, fontFamily: tokens.headingFont, fontSize: "9px", fontWeight: tokens.headingWeight }}>
              {tokens.brandName}
            </span>
          )}
          <div className="flex-1" />
          <span style={{ color: `${tokens.headerTextColor}99`, fontSize: "8px" }}>{tokens.tagline}</span>
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      {tokens.showFooter && (
        <div
          className="w-full flex items-center px-4 py-1 shrink-0"
          style={{ backgroundColor: tokens.footerColor, minHeight: "20px" }}
        >
          <span style={{ color: tokens.footerTextColor, fontSize: "7px" }}>Confidential · Prepared by {tokens.brandName}</span>
          <div className="flex-1" />
          {tokens.showPageNumbers && (
            <span style={{ color: tokens.footerTextColor, fontSize: "7px" }}>1</span>
          )}
        </div>
      )}
    </div>
  );
}

function TitleSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <SlideFrame tokens={tokens} bgKey="titleSlide">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-2">
        <div className="w-16 h-1.5 rounded-full mb-1" style={{ backgroundColor: tokens.secondaryColor }} />
        <h1 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingXL * 0.55}px`, fontWeight: tokens.headingWeight, color: "#FFFFFF", lineHeight: 1.1 }}>
          Monthly SEO Report
        </h1>
        <p style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodyMD * 0.9}px`, color: "#FFFFFF99" }}>
          Anchored Tides Recovery · October 2025
        </p>
        <div className="w-8 h-0.5 mt-1" style={{ backgroundColor: tokens.secondaryColor }} />
      </div>
    </SlideFrame>
  );
}

function KpiSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  const metrics = [
    { label: "Organic Sessions", value: "4,821", delta: "+12%", up: true },
    { label: "Organic Clicks", value: "2,103", delta: "+8%", up: true },
    { label: "Avg. Position", value: "14.2", delta: "-1.3", up: true },
    { label: "Conversions", value: "38", delta: "-4%", up: false },
  ];
  return (
    <SlideFrame tokens={tokens} bgKey="kpiSlide">
      <div className="flex-1 flex flex-col px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
          <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM * 0.85}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>
            Performance Overview
          </h2>
        </div>
        <div className="grid grid-cols-4 gap-2 flex-1">
          {metrics.map(m => (
            <div
              key={m.label}
              className="flex flex-col justify-between p-2 rounded"
              style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorderColor}`, borderTopWidth: "2px", borderTopColor: tokens.secondaryColor, borderRadius: `${tokens.borderRadius / 2}px` }}
            >
              <span style={{ fontFamily: tokens.bodyFont, fontSize: "7px", color: "#64748B" }}>{m.label}</span>
              <div>
                <div style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingMD * 0.65}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>{m.value}</div>
                <div style={{ fontSize: "7px", color: m.up ? tokens.successColor : tokens.errorColor, fontWeight: 600 }}>{m.delta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

function ChartSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  const bars = [42, 67, 55, 80, 61, 75, 90, 58, 72, 85, 68, 76];
  return (
    <SlideFrame tokens={tokens} bgKey="chartSlide">
      <div className="flex-1 flex flex-col px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
          <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM * 0.85}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>
            Organic Sessions Trend
          </h2>
        </div>
        <div className="flex-1 flex items-end gap-1 pb-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${h}%`, backgroundColor: i === bars.length - 1 ? tokens.secondaryColor : tokens.primaryColor, opacity: i === bars.length - 1 ? 1 : 0.7 }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(m => (
            <span key={m} style={{ fontFamily: tokens.bodyFont, fontSize: "6px", color: "#94A3B8" }}>{m}</span>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

function TableSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  const rows = [
    ["addiction treatment orange county", "341", "8.2", "1.4"],
    ["womens drug rehab california", "218", "12.5", "2.1"],
    ["outpatient rehab near me", "187", "15.3", "1.8"],
    ["alcohol detox center", "156", "9.7", "2.4"],
    ["dual diagnosis treatment", "134", "18.2", "0.9"],
  ];
  return (
    <SlideFrame tokens={tokens} bgKey="tableSlide">
      <div className="flex-1 flex flex-col px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
          <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM * 0.85}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>
            Top Queries by Clicks
          </h2>
        </div>
        <div className="flex-1 overflow-hidden" style={{ borderRadius: `${tokens.borderRadius / 3}px`, border: `1px solid ${tokens.tableBorderColor}` }}>
          <table className="w-full" style={{ fontFamily: tokens.bodyFont, fontSize: "7px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: tokens.tableHeaderBg }}>
                {["Query", "Clicks", "Position", "CTR%"].map(h => (
                  <td key={h} className="px-2 py-1.5" style={{ color: tokens.tableHeaderText, fontWeight: 600 }}>{h}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1" style={{ color: tokens.tableBodyText, borderTop: `1px solid ${tokens.tableBorderColor}` }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SlideFrame>
  );
}

function ContentSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  const items = [
    "Published 4 new service pages targeting high-intent treatment keywords",
    "Completed technical audit — fixed 12 broken internal links",
    "Optimized meta titles and H1s across all money pages",
    "Added structured data markup to Contact and FAQ pages",
  ];
  return (
    <SlideFrame tokens={tokens} bgKey="contentSlide">
      <div className="flex-1 flex flex-col px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
          <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM * 0.85}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>
            Work Completed This Month
          </h2>
        </div>
        <div className="flex-1 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
              <span style={{ fontFamily: tokens.bodyFont, fontSize: "8px", color: "#334155", lineHeight: 1.4 }}>{item}</span>
            </div>
          ))}
        </div>
        <div
          className="px-3 py-2 rounded"
          style={{ backgroundColor: tokens.calloutBg, border: `1px solid ${tokens.calloutBorderColor}`, borderRadius: `${tokens.borderRadius / 3}px` }}
        >
          <span style={{ fontFamily: tokens.bodyFont, fontSize: "7px", color: tokens.calloutText, fontStyle: "italic" }}>
            💡 Focus for next 30 days: Local SEO citations and GBP optimization
          </span>
        </div>
      </div>
    </SlideFrame>
  );
}

function DividerSlidePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <SlideFrame tokens={tokens} bgKey="sectionDivider">
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: tokens.secondaryColor }} />
        <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingLG * 0.6}px`, fontWeight: tokens.headingWeight, color: "#FFFFFF", textAlign: "center" }}>
          Organic Performance
        </h2>
        <p style={{ fontFamily: tokens.bodyFont, fontSize: "8px", color: "#FFFFFF80", textAlign: "center" }}>
          Search Console · Google Analytics 4
        </p>
        <div className="w-8 h-1 rounded-full" style={{ backgroundColor: tokens.secondaryColor, opacity: 0.6 }} />
      </div>
    </SlideFrame>
  );
}

function SummarySlidePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <SlideFrame tokens={tokens} bgKey="summarySlide">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: tokens.secondaryColor }} />
        <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingLG * 0.6}px`, fontWeight: tokens.headingWeight, color: "#FFFFFF" }}>
          Key Takeaways
        </h2>
        <div className="w-full space-y-1.5 text-left max-w-xs">
          {["Organic sessions up 12% month-over-month", "New money pages indexed and ranking", "Q4 roadmap: Local + Technical sprint"].map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: tokens.secondaryColor }} />
              <span style={{ fontFamily: tokens.bodyFont, fontSize: "8px", color: "#FFFFFFDD" }}>{s}</span>
            </div>
          ))}
        </div>
        <div className="w-8 h-1 rounded-full" style={{ backgroundColor: tokens.secondaryColor, opacity: 0.6 }} />
        <p style={{ fontFamily: tokens.bodyFont, fontSize: "8px", color: "#FFFFFF80" }}>Thank you · {tokens.brandName}</p>
      </div>
    </SlideFrame>
  );
}

// ─── Page Previews (DOCX-style, Bi-Weekly report source of truth) ────────────

// Natural page dimensions — content is rendered at full size and scaled to fit
const PAGE_W = 612; // letter width in points (px at 96dpi equiv)
const PAGE_H = PAGE_W * (11 / 8.5); // ~792px

function usePageScale(ref: React.RefObject<HTMLDivElement>) {
  const [scale, setScale] = useState(0.88);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setScale(Math.min(1, w / PAGE_W));
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return scale;
}

function PageFrame({ tokens, children, pageNum = 1 }: { tokens: ThemeTokens; children: React.ReactNode; pageNum?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = usePageScale(containerRef);
  const br = Math.round(tokens.borderRadius / 4);

  return (
    <div
      ref={containerRef}
      className="w-full shadow-lg"
      style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}`, overflow: "hidden", borderRadius: `${br}px` }}
    >
      <div style={{
        width: `${PAGE_W}px`,
        height: `${PAGE_H}px`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        display: "flex",
        flexDirection: "column",
        ...bgStyle(tokens.backgrounds.global),
        fontFamily: tokens.bodyFont,
      }}>
        {/* Header */}
        <div style={{ backgroundColor: tokens.headerColor, height: "46px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px", flexShrink: 0 }}>
          {tokens.logoUrl ? (
            <img src={tokens.logoUrl} alt={tokens.brandName} style={{ maxHeight: 26, maxWidth: 110, objectFit: "contain" }} />
          ) : (
            <span style={{ color: tokens.headerTextColor, fontFamily: tokens.headingFont, fontSize: "13px", fontWeight: tokens.headingWeight, letterSpacing: "0.02em" }}>
              {tokens.brandName}
            </span>
          )}
          <span style={{ color: `${tokens.headerTextColor}B0`, fontSize: "11px", fontFamily: tokens.bodyFont }}>
            {tokens.tagline}
          </span>
        </div>
        {/* Body */}
        <div style={{ flex: 1, padding: "28px 40px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {children}
        </div>
        {/* Footer */}
        <div style={{ height: "30px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px", flexShrink: 0, backgroundColor: tokens.footerColor, borderTop: `1px solid ${tokens.tableBorderColor}` }}>
          <span style={{ color: tokens.footerTextColor, fontSize: "10px", fontFamily: tokens.bodyFont }}>Confidential — {tokens.brandName}</span>
          {tokens.showPageNumbers && <span style={{ color: tokens.footerTextColor, fontSize: "10px" }}>Page {pageNum}</span>}
        </div>
      </div>
    </div>
  );
}

// Shared sub-components for pages
function PageSectionTitle({ tokens, children }: { tokens: ThemeTokens; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingMD}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor, margin: 0, lineHeight: 1.2 }}>
        {children}
      </h1>
      <div style={{ height: "2px", backgroundColor: tokens.secondaryColor, width: "48px", marginTop: "6px", borderRadius: "2px" }} />
    </div>
  );
}

function PageSubTitle({ tokens, children }: { tokens: ThemeTokens; children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ display: "inline-block", width: "4px", height: "14px", backgroundColor: tokens.secondaryColor, borderRadius: "2px", flexShrink: 0 }} />
      {children}
    </h2>
  );
}

function PageBullet({ tokens, children, accent = false }: { tokens: ThemeTokens; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: accent ? tokens.accentColor : tokens.secondaryColor, flexShrink: 0, marginTop: "5px" }} />
      <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodyMD}px`, color: "#334155", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function PageCallout({ tokens, children }: { tokens: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: tokens.calloutBg, border: `1px solid ${tokens.calloutBorderColor}`, borderLeft: `3px solid ${tokens.calloutBorderColor}`, borderRadius: `${Math.round(tokens.borderRadius / 4)}px`, padding: "10px 14px" }}>
      <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: tokens.calloutText, lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

// ── Page 1: Cover ──────────────────────────────────────────────────────────────
function CoverPagePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <PageFrame tokens={tokens} pageNum={1}>
      {/* Title block — centered vertically by pushing with spacer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "24px" }}>
        {/* Accent bar */}
        <div style={{ width: "64px", height: "4px", backgroundColor: tokens.secondaryColor, borderRadius: "2px" }} />

        {/* Report title */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h1 style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingXL}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor, lineHeight: 1.15, margin: 0 }}>
            Bi-Weekly SEO Report
          </h1>
          <p style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodyLG}px`, color: "#64748B", margin: 0 }}>
            Anchored Tides Recovery
          </p>
          <p style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodyMD}px`, color: "#94A3B8", margin: 0 }}>
            October 1–15, 2025 · Sprint 21
          </p>
        </div>

        {/* Meta info block */}
        <div style={{ borderLeft: `3px solid ${tokens.primaryColor}`, paddingLeft: "14px", display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
          {[
            ["Prepared by", tokens.brandName],
            ["Report period", "Oct 1–15, 2025"],
            ["Report type", "Bi-Weekly"],
            ["Next report", "Oct 31, 2025"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", gap: "8px" }}>
              <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: "#94A3B8", minWidth: "100px" }}>{label}</span>
              <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: "#334155", fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* NSM snapshot */}
        <div style={{ backgroundColor: tokens.calloutBg, border: `1px solid ${tokens.calloutBorderColor}`, borderRadius: `${Math.round(tokens.borderRadius / 4)}px`, padding: "12px 16px", display: "flex", gap: "32px" }}>
          {[
            ["Q4 Goal", "5,400 sessions"],
            ["QTD Actual", "4,821 sessions"],
            ["Pace", "On track ✓"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: "#94A3B8" }}>{label}</span>
              <span style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingSM}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

// ── Page 2: Executive Summary ──────────────────────────────────────────────────
function ExecutiveSummaryPagePreview({ tokens }: { tokens: ThemeTokens }) {
  const kpis = [
    { label: "Organic Sessions", value: "4,821", delta: "+12%", up: true },
    { label: "Organic Clicks", value: "2,103", delta: "+8%", up: true },
    { label: "Avg. Position", value: "14.2", delta: "↑1.3 pos", up: true },
    { label: "Organic Calls", value: "38", delta: "−4%", up: false },
  ];
  return (
    <PageFrame tokens={tokens} pageNum={2}>
      <PageSectionTitle tokens={tokens}>Executive Summary</PageSectionTitle>

      {/* QTD pacing callout */}
      <div style={{ backgroundColor: `${tokens.primaryColor}0D`, border: `1px solid ${tokens.primaryColor}30`, borderRadius: `${Math.round(tokens.borderRadius / 4)}px`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: tokens.primaryColor, fontWeight: 600 }}>Q4 NSM Pacing</span>
        <span style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.bodyMD}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor }}>4,821 / 5,400 sessions — On Track</span>
        <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: tokens.successColor, fontWeight: 700 }}>89%</span>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px" }}>
        {kpis.map(k => (
          <div key={k.label} style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorderColor}`, borderTop: `3px solid ${tokens.secondaryColor}`, borderRadius: `${Math.round(tokens.borderRadius / 4)}px`, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM - 1}px`, color: "#64748B" }}>{k.label}</span>
            <span style={{ fontFamily: tokens.headingFont, fontSize: `${tokens.headingLG}px`, fontWeight: tokens.headingWeight, color: tokens.primaryColor, lineHeight: 1 }}>{k.value}</span>
            <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM - 1}px`, fontWeight: 700, color: k.up ? tokens.successColor : tokens.errorColor }}>{k.delta} vs prior period</span>
          </div>
        ))}
      </div>

      {/* Summary paragraph */}
      <p style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodyMD}px`, color: "#334155", lineHeight: 1.65, margin: 0 }}>
        Organic performance strengthened this period. Sessions grew 12% driven by improved rankings on high-intent treatment queries. The "addiction treatment orange county" cluster gained 3 positions, now averaging 8.2 in GSC — tied to service pages published last month. Call volume sits at 38, which is slightly below pace but within range given the two-week window.
      </p>

      {/* Key insight */}
      <PageCallout tokens={tokens}>
        <strong>Key Insight:</strong> Service page updates are showing traction in GSC. The IOP and PHP pages both crossed page 1 this period. Recommend continuing the content refresh cadence before the next crawl window.
      </PageCallout>

      <PageSubTitle tokens={tokens}>Work Completed (Oct 1–15)</PageSubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          "Published IOP service page refresh targeting high-intent treatment keywords",
          "Fixed 12 broken internal links surfaced in Screaming Frog crawl",
          "Optimized meta titles and H1s across all 8 money pages",
        ].map((item, i) => <PageBullet key={i} tokens={tokens}>{item}</PageBullet>)}
      </div>
    </PageFrame>
  );
}

// ── Page 3: Data Table (GSC Top Queries) ──────────────────────────────────────
function DataTablePagePreview({ tokens }: { tokens: ThemeTokens }) {
  const rows = [
    ["addiction treatment orange county", "341", "1,820", "8.2", "1.4%", "↑3"],
    ["womens drug rehab california",       "218", "1,140", "12.5","2.1%", "→0"],
    ["outpatient rehab near me",           "187", "980",   "15.3","1.8%", "↑2"],
    ["alcohol detox center",               "156", "870",   "9.7", "2.4%", "↓1"],
    ["dual diagnosis treatment",           "134", "760",   "18.2","0.9%", "↑5"],
    ["inpatient rehab california",         "121", "620",   "21.4","0.7%", "↑4"],
    ["medically assisted detox",           "98",  "510",   "24.1","0.6%", "→0"],
    ["php treatment program",              "84",  "430",   "19.6","0.8%", "↑6"],
  ];
  const br = Math.round(tokens.borderRadius / 4);
  return (
    <PageFrame tokens={tokens} pageNum={3}>
      <PageSectionTitle tokens={tokens}>Top Organic Queries — GSC</PageSectionTitle>
      <p style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: "#94A3B8", margin: 0 }}>
        Source: Google Search Console · Oct 1–15, 2025 · Brand terms excluded
      </p>
      <div style={{ border: `1px solid ${tokens.tableBorderColor}`, borderRadius: `${br}px`, overflow: "hidden" }}>
        <table style={{ width: "100%", fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: tokens.tableHeaderBg }}>
              {["Query", "Clicks", "Impr.", "Position", "CTR", "Δ Pos"].map((h, i) => (
                <td key={h} style={{ color: tokens.tableHeaderText, fontWeight: 700, fontSize: `${tokens.bodySM - 1}px`, padding: "10px 12px", textAlign: i === 0 ? "left" : "right" }}>{h}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}>
                {row.map((cell, j) => (
                  <td key={j} style={{
                    color: j === 5 ? (cell.startsWith("↑") ? tokens.successColor : cell.startsWith("↓") ? tokens.errorColor : "#94A3B8") : tokens.tableBodyText,
                    borderTop: `1px solid ${tokens.tableBorderColor}`,
                    fontSize: `${tokens.bodySM - 1}px`,
                    fontWeight: j === 5 ? 700 : 400,
                    padding: "8px 12px",
                    textAlign: j === 0 ? "left" : "right",
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageCallout tokens={tokens}>
        <strong>Note:</strong> Position deltas reflect 2-week period-over-period averages. Clicks and impressions reflect raw GSC data for the Oct 1–15 window. Branded queries excluded. PHP page movement is the highlight — +6 positions in one sprint.
      </PageCallout>
    </PageFrame>
  );
}

// ── Page 4: Sprint Summary (Work Completed + Next Sprint) ─────────────────────
function DetailPagePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <PageFrame tokens={tokens} pageNum={4}>
      <PageSectionTitle tokens={tokens}>Sprint Summary</PageSectionTitle>

      <PageSubTitle tokens={tokens}>Completed — Oct 1–15, 2025</PageSubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          "IOP service page refresh — published and indexed (1 credit)",
          "PHP program page updated with new clinical copy (1 credit)",
          "12 broken internal links resolved from Screaming Frog crawl",
          "Meta title and H1 revisions on 8 money pages",
          "GBP post published with October special event + photo",
        ].map((item, i) => <PageBullet key={i} tokens={tokens}>{item}</PageBullet>)}
      </div>

      <PageSubTitle tokens={tokens}>Planned — Oct 16–31, 2025</PageSubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          "Detox service page refresh — Tier 1 priority, 1 credit",
          "Dual diagnosis hub page — new, 2 credits",
          "Resolve 4 duplicate meta descriptions on service area variations",
          "Implement FAQ schema on FAQ page",
        ].map((item, i) => <PageBullet key={i} tokens={tokens} accent={true}>{item}</PageBullet>)}
      </div>

      <PageSubTitle tokens={tokens}>Technical Flags (Screaming Frog)</PageSubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          { sev: "Warning", text: "4 pages with duplicate meta descriptions — service area variations", color: tokens.warningColor, bg: `${tokens.warningColor}12` },
          { sev: "Error", text: "2 images missing alt text — About and Contact pages", color: tokens.errorColor, bg: `${tokens.errorColor}10` },
          { sev: "Info", text: "FAQ schema missing — HowTo or FAQ schema recommended", color: tokens.accentColor, bg: `${tokens.accentColor}10` },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", backgroundColor: item.bg, border: `1px solid ${item.color}40`, borderLeft: `3px solid ${item.color}`, borderRadius: `${Math.round(tokens.borderRadius / 4)}px`, padding: "8px 12px" }}>
            <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM - 1}px`, fontWeight: 700, color: item.color, whiteSpace: "nowrap", marginTop: "1px", minWidth: "48px" }}>{item.sev}</span>
            <span style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.bodySM}px`, color: "#334155", lineHeight: 1.5 }}>{item.text}</span>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}

// ─── Main Theme Page ──────────────────────────────────────────────────────────

export default function ThemePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("slides");
  const [activeSlide, setActiveSlide] = useState<PreviewSlide>("title");
  const [activePage, setActivePage] = useState<PreviewPage>("cover");
  const [activeThemeId, setActiveThemeId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ThemeTokens>(DEFAULT_THEME_TOKENS);
  const [isDirty, setIsDirty] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newThemeDialogOpen, setNewThemeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const focusPreview = useCallback((mode: PreviewMode, slide?: PreviewSlide, page?: PreviewPage) => {
    setPreviewMode(mode);
    if (slide) setActiveSlide(slide);
    if (page) setActivePage(page);
  }, []);

  const { data: themes, isLoading: themesLoading } = useQuery<Theme[]>({ queryKey: ["/api/themes"] });
  const { data: activeTheme } = useQuery<Theme>({
    queryKey: ["/api/themes/active"],
  });

  const selectedTheme = themes?.find(t => t.id === activeThemeId) ?? activeTheme;

  useEffect(() => {
    if (activeTheme && !activeThemeId) {
      setActiveThemeId(activeTheme.id);
      const tokens = activeTheme.hasDraft && activeTheme.draftTokens ? activeTheme.draftTokens : activeTheme.tokens;
      setDraft(tokens as ThemeTokens);
      setIsDirty(false);
    }
  }, [activeTheme, activeThemeId]);

  useEffect(() => {
    if (selectedTheme && activeThemeId) {
      const tokens = selectedTheme.hasDraft && selectedTheme.draftTokens ? selectedTheme.draftTokens : selectedTheme.tokens;
      setDraft(tokens as ThemeTokens);
      setIsDirty(false);
    }
  }, [activeThemeId]);

  useFontInjection(draft.headingFont, draft.bodyFont);

  const update = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setDraft(prev => {
      const next = { ...prev, [key]: value };

      // Smart cascade: when primary or secondary color changes, update all
      // backgrounds and tokens that currently reference those colors so the
      // preview immediately reflects the change everywhere it matters.
      if (key === "primaryColor") {
        const oldColor = prev.primaryColor;
        const newColor = value as string;
        const updatedBgs = { ...prev.backgrounds };
        for (const bgKey of Object.keys(updatedBgs) as (keyof typeof updatedBgs)[]) {
          const bg = { ...updatedBgs[bgKey] };
          if (bg.solidColor === oldColor) bg.solidColor = newColor;
          if (bg.gradientFrom === oldColor) bg.gradientFrom = newColor;
          if (bg.gradientTo === oldColor) bg.gradientTo = newColor;
          updatedBgs[bgKey] = bg;
        }
        next.backgrounds = updatedBgs;
        if (prev.headerColor === oldColor) (next as any).headerColor = newColor;
        if (prev.tableHeaderBg === oldColor) (next as any).tableHeaderBg = newColor;
        if (prev.calloutBorderColor === oldColor) (next as any).calloutBorderColor = newColor;
      }

      if (key === "secondaryColor") {
        const oldColor = prev.secondaryColor;
        const newColor = value as string;
        const updatedBgs = { ...prev.backgrounds };
        for (const bgKey of Object.keys(updatedBgs) as (keyof typeof updatedBgs)[]) {
          const bg = { ...updatedBgs[bgKey] };
          if (bg.solidColor === oldColor) bg.solidColor = newColor;
          if (bg.gradientFrom === oldColor) bg.gradientFrom = newColor;
          if (bg.gradientTo === oldColor) bg.gradientTo = newColor;
          updatedBgs[bgKey] = bg;
        }
        next.backgrounds = updatedBgs;
      }

      return next;
    });
    setIsDirty(true);
  }, []);

  const updateBg = useCallback((bgKey: keyof ThemeTokens["backgrounds"], value: BackgroundDef) => {
    setDraft(prev => ({ ...prev, backgrounds: { ...prev.backgrounds, [bgKey]: value } }));
    setIsDirty(true);
  }, []);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTheme) throw new Error("No theme selected");
      await apiRequest("PATCH", `/api/themes/${selectedTheme.id}/draft`, { draftTokens: draft });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      setIsDirty(false);
      toast({ title: "Draft saved", description: "Changes are saved as a draft. Publish to apply system-wide." });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTheme) throw new Error("No theme selected");
      if (isDirty) await apiRequest("PATCH", `/api/themes/${selectedTheme.id}/draft`, { draftTokens: draft });
      await apiRequest("POST", `/api/themes/${selectedTheme.id}/publish`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      setIsDirty(false);
      toast({ title: "Theme published", description: "This theme is now the active system theme." });
    },
    onError: (err: any) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const discardDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTheme) return;
      await apiRequest("POST", `/api/themes/${selectedTheme.id}/discard-draft`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      const tokens = selectedTheme?.tokens as ThemeTokens ?? DEFAULT_THEME_TOKENS;
      setDraft(tokens);
      setIsDirty(false);
      toast({ title: "Draft discarded", description: "Reverted to last published version." });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/themes/${id}/activate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      toast({ title: "Active theme changed" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      return apiRequest("POST", `/api/themes/${id}/duplicate`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      toast({ title: "Theme duplicated" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      return apiRequest("PATCH", `/api/themes/${id}/rename`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      toast({ title: "Theme renamed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/themes/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      toast({ title: "Theme deleted" });
    },
    onError: () => toast({ title: "Cannot delete", description: "Default themes cannot be deleted.", variant: "destructive" }),
  });

  const createThemeMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", `/api/themes`, { name, tokens: DEFAULT_THEME_TOKENS }) as Promise<Theme>;
    },
    onSuccess: (theme) => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      setActiveThemeId((theme as any).id);
      toast({ title: "New theme created" });
    },
  });

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTheme?.name ?? "theme"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const tokens = JSON.parse(ev.target?.result as string) as ThemeTokens;
        setDraft(tokens);
        setIsDirty(true);
        toast({ title: "Theme imported", description: "Review changes and publish when ready." });
      } catch {
        toast({ title: "Import failed", description: "Invalid theme JSON file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetToDefault = () => {
    setDraft(DEFAULT_THEME_TOKENS);
    setIsDirty(true);
    toast({ title: "Reset to SmartEO defaults" });
  };

  const hasDraft = selectedTheme?.hasDraft ?? false;
  const isPublished = selectedTheme?.isActive ?? false;
  const publishedDraftLabel = isDirty ? "Unsaved Changes" : hasDraft ? "Draft" : isPublished ? "Published" : "Saved";
  const statusColor = isDirty ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : hasDraft ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background" data-testid="page-theme">
      {/* Header */}
      <div className="border-b px-5 py-3 shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600 shrink-0">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground leading-none truncate">Theme</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Centralized design system for all SmartEO reports</p>
          </div>
        </div>

        {/* Theme selector */}
        {themes && themes.length > 0 && (
          <Select
            value={activeThemeId?.toString() ?? ""}
            onValueChange={id => setActiveThemeId(Number(id))}
          >
            <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-theme">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              {themes.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  <span className="flex items-center gap-2">
                    {t.name}
                    {t.isActive && <span className="text-[9px] text-emerald-600 font-semibold">ACTIVE</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Badge className={`text-[10px] px-2 py-0.5 ${statusColor}`} variant="secondary">
          {isDirty ? <><AlertCircle className="w-2.5 h-2.5 mr-1" />{publishedDraftLabel}</> : <><CheckCircle2 className="w-2.5 h-2.5 mr-1" />{publishedDraftLabel}</>}
        </Badge>

        <div className="flex items-center gap-1.5">
          {(isDirty || hasDraft) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => discardDraftMutation.mutate()}
              disabled={discardDraftMutation.isPending}
              data-testid="button-discard-draft"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Revert
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => saveDraftMutation.mutate()}
            disabled={!isDirty || saveDraftMutation.isPending}
            data-testid="button-save-draft"
          >
            <Save className="w-3 h-3 mr-1" />
            Save Draft
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending}
            data-testid="button-publish-theme"
          >
            <Globe className="w-3 h-3 mr-1" />
            Publish
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid="button-theme-menu">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {selectedTheme && (
                <>
                  {!selectedTheme.isActive && (
                    <DropdownMenuItem onClick={() => activateMutation.mutate(selectedTheme.id)}>
                      <Eye className="w-3.5 h-3.5 mr-2" /> Set as Active Theme
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => { setDialogName(`${selectedTheme.name} (copy)`); setNewThemeDialogOpen(true); }}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate Theme
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setDialogName(selectedTheme.name); setRenameDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Rename Theme
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExport}>
                    <Download className="w-3.5 h-3.5 mr-2" /> Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-2" /> Import JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleResetToDefault}>
                    <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reset to Defaults
                  </DropdownMenuItem>
                  {!selectedTheme.isDefault && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600" onClick={() => setDeleteDialogOpen(true)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Theme
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setDialogName("New Theme"); setNewThemeDialogOpen(true); }}>
                <Sparkles className="w-3.5 h-3.5 mr-2" /> New Theme
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: controls */}
        <div className="w-[300px] shrink-0 border-r overflow-y-auto bg-background">

          <Section title="Branding" icon={Layers} onOpen={() => focusPreview("slides", "title")}>
            <div className="space-y-3">
              {/* Logo upload */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Agency Logo</Label>
                {draft.logoUrl ? (
                  <div className="relative border rounded-md overflow-hidden bg-muted/30 flex items-center justify-center" style={{ height: 72 }}>
                    <img
                      src={draft.logoUrl}
                      alt="Agency logo"
                      className="max-h-14 max-w-full object-contain"
                      data-testid="img-agency-logo"
                    />
                    <button
                      onClick={() => update("logoUrl", "")}
                      className="absolute top-1 right-1 rounded-full bg-background/80 hover:bg-background border p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      data-testid="button-remove-logo"
                      title="Remove logo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-md cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    style={{ height: 72 }}
                    data-testid="label-logo-upload"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Click to upload logo</span>
                    <span className="text-[9px] text-muted-foreground/70">PNG, SVG, JPG</span>
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      className="sr-only"
                      data-testid="input-logo-file"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const result = ev.target?.result as string;
                          if (result) update("logoUrl", result);
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <p className="text-[10px] text-muted-foreground/70 leading-snug">
                  Replaces the brand name text in report headers.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Brand Name</Label>
                <Input
                  value={draft.brandName}
                  onChange={e => update("brandName", e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-brand-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Report Tagline</Label>
                <Input
                  value={draft.tagline}
                  onChange={e => update("tagline", e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-tagline"
                />
              </div>
            </div>
          </Section>

          <Section title="Colors" icon={Palette} onOpen={() => focusPreview("slides", "title")}>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground leading-snug bg-muted/40 rounded px-2 py-1.5">
                Changing Primary or Secondary cascades to slide backgrounds, headers, and tables that use that color.
              </p>
              <ColorField label="Primary" value={draft.primaryColor} onChange={c => update("primaryColor", c)} testId="color-primary" />
              <ColorField label="Secondary" value={draft.secondaryColor} onChange={c => update("secondaryColor", c)} testId="color-secondary" />
              <ColorField label="Accent" value={draft.accentColor} onChange={c => update("accentColor", c)} testId="color-accent" />
              <Separator className="my-1" />
              <ColorField label="Success" value={draft.successColor} onChange={c => update("successColor", c)} />
              <ColorField label="Warning" value={draft.warningColor} onChange={c => update("warningColor", c)} />
              <ColorField label="Error" value={draft.errorColor} onChange={c => update("errorColor", c)} />
            </div>
          </Section>

          <Section title="Typography" icon={Type} defaultOpen={false} onOpen={() => focusPreview("slides", "content")}>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Heading Font</Label>
                <Select value={draft.headingFont} onValueChange={v => update("headingFont", v)}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-heading-font">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADING_FONTS.map(f => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Body Font</Label>
                <Select value={draft.bodyFont} onValueChange={v => update("bodyFont", v)}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-body-font">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BODY_FONTS.map(f => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Heading Weight</Label>
                <Select value={draft.headingWeight.toString()} onValueChange={v => update("headingWeight", Number(v))}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[400, 500, 600, 700, 800].map(w => <SelectItem key={w} value={w.toString()}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Separator className="my-1" />
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Heading Sizes (px)</p>
                {(["headingXL", "headingLG", "headingMD", "headingSM"] as const).map((k, i) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-muted-foreground min-w-[28px]">{["XL", "LG", "MD", "SM"][i]}</Label>
                    <Slider
                      value={[draft[k] as number]}
                      onValueChange={([v]) => update(k, v)}
                      min={10} max={48} step={1}
                      className="flex-1"
                    />
                    <span className="text-[10px] text-muted-foreground w-6 text-right">{draft[k]}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-1" />
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Body Sizes (px)</p>
                {(["bodyLG", "bodyMD", "bodySM"] as const).map((k, i) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-muted-foreground min-w-[28px]">{["LG", "MD", "SM"][i]}</Label>
                    <Slider
                      value={[draft[k] as number]}
                      onValueChange={([v]) => update(k, v)}
                      min={8} max={24} step={1}
                      className="flex-1"
                    />
                    <span className="text-[10px] text-muted-foreground w-6 text-right">{draft[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Backgrounds" icon={Image} defaultOpen={false} onOpen={() => focusPreview("slides", "title")}>
            <div className="space-y-4">
              {([
                ["global", "Page / Global Background"],
                ["titleSlide", "Title Slide"],
                ["sectionDivider", "Section Divider"],
                ["kpiSlide", "KPI Summary"],
                ["chartSlide", "Chart Slides"],
                ["tableSlide", "Table Slides"],
                ["contentSlide", "Content Slides"],
                ["summarySlide", "Closing Summary"],
              ] as const).map(([bgKey, label]) => (
                <BackgroundEditor
                  key={bgKey}
                  label={label}
                  value={draft.backgrounds[bgKey]}
                  onChange={v => updateBg(bgKey, v)}
                />
              ))}
            </div>
          </Section>

          <Section title="Tables" icon={Table2} defaultOpen={false} onOpen={() => focusPreview("slides", "table")}>
            <div className="space-y-2">
              <ColorField label="Header Background" value={draft.tableHeaderBg} onChange={c => update("tableHeaderBg", c)} />
              <ColorField label="Header Text" value={draft.tableHeaderText} onChange={c => update("tableHeaderText", c)} />
              <ColorField label="Alt Row Background" value={draft.tableAltRowBg} onChange={c => update("tableAltRowBg", c)} />
              <ColorField label="Border Color" value={draft.tableBorderColor} onChange={c => update("tableBorderColor", c)} />
              <ColorField label="Body Text" value={draft.tableBodyText} onChange={c => update("tableBodyText", c)} />
            </div>
          </Section>

          <Section title="Components" icon={Layout} defaultOpen={false} onOpen={() => focusPreview("slides", "kpi")}>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Cards</p>
              <ColorField label="Card Background" value={draft.cardBg} onChange={c => update("cardBg", c)} />
              <ColorField label="Card Border" value={draft.cardBorderColor} onChange={c => update("cardBorderColor", c)} />
              <Separator className="my-1" />
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Callouts</p>
              <ColorField label="Callout Background" value={draft.calloutBg} onChange={c => update("calloutBg", c)} />
              <ColorField label="Callout Border" value={draft.calloutBorderColor} onChange={c => update("calloutBorderColor", c)} />
              <ColorField label="Callout Text" value={draft.calloutText} onChange={c => update("calloutText", c)} />
              <Separator className="my-1" />
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Border Radius (px)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[draft.borderRadius]}
                    onValueChange={([v]) => update("borderRadius", v)}
                    min={0} max={20} step={1}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-6">{draft.borderRadius}</span>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Reports &amp; Slides" icon={FileText} defaultOpen={false} onOpen={() => focusPreview("pages", undefined, "cover")}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Show Header Bar</Label>
                <Switch checked={draft.showHeader} onCheckedChange={v => update("showHeader", v)} data-testid="switch-show-header" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Show Footer Bar</Label>
                <Switch checked={draft.showFooter} onCheckedChange={v => update("showFooter", v)} data-testid="switch-show-footer" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Show Page Numbers</Label>
                <Switch checked={draft.showPageNumbers} onCheckedChange={v => update("showPageNumbers", v)} />
              </div>
              <Separator className="my-1" />
              <ColorField label="Header Color" value={draft.headerColor} onChange={c => update("headerColor", c)} />
              <ColorField label="Header Text Color" value={draft.headerTextColor} onChange={c => update("headerTextColor", c)} />
              <ColorField label="Footer Color" value={draft.footerColor} onChange={c => update("footerColor", c)} />
              <ColorField label="Footer Text Color" value={draft.footerTextColor} onChange={c => update("footerTextColor", c)} />
            </div>
          </Section>

        </div>

        {/* Right panel: preview */}
        <div className="flex-1 min-w-0 bg-muted/30 flex flex-col overflow-hidden">

          {/* Preview header: mode toggle + tabs */}
          <div className="border-b px-4 py-2 flex items-center gap-3 bg-background shrink-0 flex-wrap">
            <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground shrink-0">Live Preview</span>

            {/* Mode toggle */}
            <div className="flex items-center rounded border border-border overflow-hidden shrink-0">
              <button
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 transition-colors ${previewMode === "slides" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setPreviewMode("slides")}
                data-testid="button-mode-slides"
              >
                <Presentation className="w-3 h-3" /> Slides
              </button>
              <button
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 transition-colors ${previewMode === "pages" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setPreviewMode("pages")}
                data-testid="button-mode-pages"
              >
                <BookOpen className="w-3 h-3" /> Pages
              </button>
            </div>

            <div className="h-4 w-px bg-border shrink-0" />

            {/* Slide or page type tabs */}
            {previewMode === "slides" ? (
              <div className="flex items-center gap-1 flex-wrap">
                {PREVIEW_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${activeSlide === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    onClick={() => setActiveSlide(tab.id)}
                    data-testid={`tab-slide-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {PAGE_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${activePage === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    onClick={() => setActivePage(tab.id)}
                    data-testid={`tab-page-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview content */}
          <div className={`flex-1 min-h-0 flex justify-center p-6 overflow-auto ${previewMode === "pages" ? "items-start" : "items-center"}`}>
            {previewMode === "slides" ? (
              <div className="w-full max-w-3xl shadow-xl rounded-lg overflow-hidden border border-border">
                {activeSlide === "title" && <TitleSlidePreview tokens={draft} />}
                {activeSlide === "kpi" && <KpiSlidePreview tokens={draft} />}
                {activeSlide === "chart" && <ChartSlidePreview tokens={draft} />}
                {activeSlide === "table" && <TableSlidePreview tokens={draft} />}
                {activeSlide === "content" && <ContentSlidePreview tokens={draft} />}
                {activeSlide === "divider" && <DividerSlidePreview tokens={draft} />}
                {activeSlide === "summary" && <SummarySlidePreview tokens={draft} />}
              </div>
            ) : (
              <div className="w-full max-w-[540px]">
                {activePage === "cover" && <CoverPagePreview tokens={draft} />}
                {activePage === "executive" && <ExecutiveSummaryPagePreview tokens={draft} />}
                {activePage === "data" && <DataTablePagePreview tokens={draft} />}
                {activePage === "detail" && <DetailPagePreview tokens={draft} />}
              </div>
            )}
          </div>

          <div className="border-t bg-background px-4 py-2 shrink-0">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Preview updates instantly — no page refresh needed</span>
              <span>{selectedTheme?.isActive ? "🟢 Active" : "⚪ Not active"} · {previewMode === "slides" ? "16:9 slide" : "8.5×11 page"} · {draft.headingFont} / {draft.bodyFont}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

      {/* Rename dialog */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Theme</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={dialogName} onChange={e => setDialogName(e.target.value)} placeholder="Theme name" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (selectedTheme && dialogName.trim()) {
                renameMutation.mutate({ id: selectedTheme.id, name: dialogName.trim() });
              }
              setRenameDialogOpen(false);
            }}>Rename</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate / New theme dialog */}
      <AlertDialog open={newThemeDialogOpen} onOpenChange={setNewThemeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Theme</AlertDialogTitle>
            <AlertDialogDescription>Enter a name for the new theme.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={dialogName} onChange={e => setDialogName(e.target.value)} placeholder="Theme name" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (dialogName.trim()) {
                if (selectedTheme && dialogName.includes("copy")) {
                  duplicateMutation.mutate({ id: selectedTheme.id, name: dialogName.trim() });
                } else {
                  createThemeMutation.mutate(dialogName.trim());
                }
              }
              setNewThemeDialogOpen(false);
            }}>Create</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Theme</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTheme?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (selectedTheme) deleteMutation.mutate(selectedTheme.id);
                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
