import { useState, useRef, useCallback, useEffect } from "react";
import swooshHeaderImg from "@assets/HEADER_IMAGE_trans_deck_1774199155785.png";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  ChevronRight,
  Trash2,
  Copy,
  Layers,
  Move,
  RefreshCw,
  LayoutTemplate,
  FileText,
  Presentation,
  Map,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElemStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
  borderRadius?: number;
  opacity?: number;
  border?: string;
}

interface TemplateElement {
  id: string;
  label: string;
  type: "rect" | "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  src?: string;
  style: ElemStyle;
  locked?: boolean;
}

interface GlobalStyles {
  accentColor: string;
  darkColor: string;
  fontFamily: string;
}

type SlideKey = "title" | "divider" | "strategy" | "production";

interface TemplateState {
  globalStyles: GlobalStyles;
  slides: Record<SlideKey, TemplateElement[]>;
}

// ─── Defaults — QCR canvas mirroring qcrPptxGenerator.ts exactly ─────────────
// PPTX canvas: SW=10" × SH=7.5", ML=MR=0.38"  → x%=(x/10)*100, y%=(y/7.5)*100
// HDR_H_TITLE=1.45" (19.3%), HDR_H_CONTENT=0.72" (9.6%)
// FOOTER_LINE_Y=7.17" (95.6%), FOOTER_Y=7.21" (96.1%)

// Helper: PPTX inches → canvas %
const px = (inch: number) => parseFloat(((inch / 10) * 100).toFixed(2));  // x
const py = (inch: number) => parseFloat(((inch / 7.5) * 100).toFixed(2)); // y

const ML = 0.38;      // left margin inches
const INNER_W = 9.24; // 10 - 0.38 - 0.38

const HDR_TITLE   = 1.45;
const HDR_CONTENT = 0.72;
const FOOTER_LINE_Y_IN = 7.17;
const FOOTER_Y_IN      = 7.21;
const FOOTER_H_IN      = 0.22;

// Shared elements — NO locked flag, all fully editable
function swooshEl(id: string, hIn: number): TemplateElement {
  return { id, label: "Header Swoosh", type: "image", x: 0, y: 0, w: 100, h: py(hIn), src: swooshHeaderImg as string, style: {} };
}
function footerLineEl(id: string): TemplateElement {
  return { id, label: "Footer Separator", type: "rect", x: px(ML), y: py(FOOTER_LINE_Y_IN), w: px(INNER_W), h: 0.15, style: { backgroundColor: "#E5E7EB" } };
}
function footerLeftEl(id: string): TemplateElement {
  return { id, label: "Footer — Webserv", type: "text", x: px(ML), y: py(FOOTER_Y_IN), w: 35, h: py(FOOTER_H_IN), content: "Webserv  |  webserv.io", style: { color: "#6B7280", fontSize: 7, textAlign: "left" } };
}
function footerRightEl(id: string): TemplateElement {
  return { id, label: "Footer — Confidential", type: "text", x: 80, y: py(FOOTER_Y_IN), w: 16.2, h: py(FOOTER_H_IN), content: "CONFIDENTIAL", style: { color: "#C5CBD3", fontSize: 7, textAlign: "right" } };
}

const QCR_DEFAULTS: TemplateState = {
  globalStyles: { accentColor: "#C0392B", darkColor: "#1B3A6B", fontFamily: "Calibri" },
  slides: {

    // ── TITLE SLIDE ──────────────────────────────────────────────────────────
    // Elements mirror addQcrTitleSlide() in qcrPptxGenerator.ts
    title: [
      // Light-gray slide background (#F8FAFC)
      { id: "title-bg", label: "Slide Background", type: "rect", x: 0, y: 0, w: 100, h: 100, style: { backgroundColor: "#F8FAFC" } },
      // Swoosh image — tall (1.45")
      swooshEl("title-swoosh", HDR_TITLE),
      // Deck title (left-aligned, below swoosh) — y = HDR_H_TITLE + 0.35 = 1.80"
      { id: "title-text", label: "Deck Title", type: "text", x: px(ML), y: py(HDR_TITLE + 0.35), w: px(INNER_W), h: py(0.75), content: "Quarterly Content Roadmap", style: { color: "#111827", fontSize: 28, fontWeight: "bold", textAlign: "left" } },
      // Short red accent rule — y = HDR_H_TITLE + 1.14 = 2.59", w=1.2"
      { id: "title-accent-rule", label: "Accent Rule (short)", type: "rect", x: px(ML), y: py(HDR_TITLE + 1.14), w: px(1.2), h: py(0.035), style: { backgroundColor: "#C0392B" } },
      // Client name (accent color) — y = HDR_H_TITLE + 1.20 = 2.65"
      { id: "title-client", label: "Client Name", type: "text", x: px(ML), y: py(HDR_TITLE + 1.20), w: px(INNER_W), h: py(0.5), content: "[Client Name]", style: { color: "#C0392B", fontSize: 17, fontWeight: "bold", textAlign: "left" } },
      // Date / quarter — y = HDR_H_TITLE + 1.78 = 3.23"
      { id: "title-date", label: "Quarter / Date", type: "text", x: px(ML), y: py(HDR_TITLE + 1.78), w: px(INNER_W), h: py(0.35), content: "Q1 2026  •  Prepared by Webserv", style: { color: "#6B7280", fontSize: 10, textAlign: "left" } },
      footerLineEl("title-footer-line"),
      footerLeftEl("title-footer-left"),
      footerRightEl("title-footer-right"),
    ],

    // ── MONTH DIVIDER SLIDE ───────────────────────────────────────────────────
    // Elements mirror addQcrDividerSlide() in qcrPptxGenerator.ts
    // No swoosh — navy background, left red vertical stripe, large white text
    divider: [
      // Full-slide navy background
      { id: "div-bg", label: "Navy Background", type: "rect", x: 0, y: 0, w: 100, h: 100, style: { backgroundColor: "#1B3A6B" } },
      // Left vertical red stripe — x=0, y=SH*0.36=2.7", w=0.18", h=SH*0.28=2.1"
      { id: "div-stripe", label: "Left Red Stripe", type: "rect", x: 0, y: 36, w: px(0.18), h: 28, style: { backgroundColor: "#C0392B" } },
      // Large month name — y=SH*0.27=2.025" → 27%, h=SH*0.32=2.4" → 32%
      { id: "div-month", label: "Month Name", type: "text", x: px(ML), y: 27, w: px(INNER_W * 0.88), h: 32, content: "January 2026", style: { color: "#FFFFFF", fontSize: 48, fontWeight: "bold", textAlign: "left" } },
      // Subtitle — y=SH*0.60=4.5" → 60%, h=SH*0.14=1.05" → 14%
      { id: "div-subtitle", label: "Sub-label / Quarter", type: "text", x: px(ML), y: 60, w: px(INNER_W * 0.88), h: 14, content: "2026 Content Plan", style: { color: "#FFFFFF", fontSize: 14, textAlign: "left", opacity: 0.55 } },
      // Corner Webserv label — x≈8.6" → 86%, y=SH-0.38=7.12" → 94.9%
      { id: "div-webserv", label: "Webserv Watermark", type: "text", x: 86, y: py(7.12), w: 10, h: py(0.28), content: "Webserv", style: { color: "#FFFFFF", fontSize: 9, textAlign: "right", opacity: 0.45 } },
    ],

    // ── STRATEGY / BULLETS SLIDE ──────────────────────────────────────────────
    // Elements mirror addQcrStrategySlide() in qcrPptxGenerator.ts
    strategy: [
      // Light-gray background
      { id: "strat-bg", label: "Slide Background", type: "rect", x: 0, y: 0, w: 100, h: 100, style: { backgroundColor: "#F8FAFC" } },
      // Swoosh — short (0.72")
      swooshEl("strat-swoosh", HDR_CONTENT),
      // Slide title OVERLAID on swoosh in white — y=HDR_H_CONTENT*0.1=0.072"
      { id: "strat-title", label: "Slide Title (on swoosh)", type: "text", x: px(ML), y: py(HDR_CONTENT * 0.1), w: px(INNER_W * 0.78), h: py(HDR_CONTENT * 0.8), content: "January — Strategy Overview", style: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold", textAlign: "left" } },
      // Gray subtitle — y=bodyY=0.84" (HDR_H_CONTENT+0.12)
      { id: "strat-subtitle", label: "Subtitle / Period", type: "text", x: px(ML), y: py(HDR_CONTENT + 0.12), w: px(INNER_W), h: py(0.26), content: "Quarterly Strategy", style: { color: "#6B7280", fontSize: 8, fontStyle: "italic", textAlign: "left" } },
      // Red accent rule — y=bodyY+0.32=1.16"
      { id: "strat-rule", label: "Accent Rule", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.32), w: px(INNER_W), h: 0.25, style: { backgroundColor: "#C0392B", opacity: 0.3 } },
      // Bullets body — y=1.26"
      { id: "strat-bullets", label: "Bullets / Body Text", type: "text", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.42), w: px(INNER_W), h: py(FOOTER_LINE_Y_IN - (HDR_CONTENT + 0.12 + 0.42) - 0.06), content: "•  Strategy bullet 1\n•  Strategy bullet 2\n•  Strategy bullet 3\n•  Strategy bullet 4", style: { color: "#374151", fontSize: 10, textAlign: "left" } },
      footerLineEl("strat-footer-line"),
      footerLeftEl("strat-footer-left"),
      footerRightEl("strat-footer-right"),
    ],

    // ── PRODUCTION TABLE SLIDE ────────────────────────────────────────────────
    // Elements mirror addQcrTableSlide() in qcrPptxGenerator.ts
    production: [
      // Light-gray background
      { id: "prod-bg", label: "Slide Background", type: "rect", x: 0, y: 0, w: 100, h: 100, style: { backgroundColor: "#F8FAFC" } },
      // Swoosh — short (0.72")
      swooshEl("prod-swoosh", HDR_CONTENT),
      // Slide title OVERLAID on swoosh in white
      { id: "prod-title", label: "Slide Title (on swoosh)", type: "text", x: px(ML), y: py(HDR_CONTENT * 0.1), w: px(INNER_W * 0.78), h: py(HDR_CONTENT * 0.8), content: "January — Production Deliverables", style: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold", textAlign: "left" } },
      // Subtitle — y=bodyY=0.84"
      { id: "prod-subtitle", label: "Subtitle / Period", type: "text", x: px(ML), y: py(HDR_CONTENT + 0.12), w: px(INNER_W), h: py(0.26), content: "Q1 2026 Production Tasks", style: { color: "#6B7280", fontSize: 8, fontStyle: "italic", textAlign: "left" } },
      // Table header row (dark #1F2937) — y=bodyY+0.30=1.14"
      { id: "prod-tbl-hdr", label: "Table Header Row", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.30), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#1F2937" } },
      { id: "prod-tbl-hdr-text", label: "Table Header Text", type: "text", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.30), w: px(INNER_W), h: py(0.27), content: "Task Name  |  Content Type  |  Topic / Keyword  |  Status", style: { color: "#FFFFFF", fontSize: 8, fontWeight: "bold", textAlign: "left" } },
      // Alternating data rows (6 rows shown as preview)
      { id: "prod-row-1", label: "Table Row 1 (white)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.57), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#FFFFFF" } },
      { id: "prod-row-2", label: "Table Row 2 (alt)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 0.84), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#F9FAFB" } },
      { id: "prod-row-3", label: "Table Row 3 (white)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 1.11), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#FFFFFF" } },
      { id: "prod-row-4", label: "Table Row 4 (alt)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 1.38), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#F9FAFB" } },
      { id: "prod-row-5", label: "Table Row 5 (white)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 1.65), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#FFFFFF" } },
      { id: "prod-row-6", label: "Table Row 6 (alt)", type: "rect", x: px(ML), y: py(HDR_CONTENT + 0.12 + 1.92), w: px(INNER_W), h: py(0.27), style: { backgroundColor: "#F9FAFB" } },
      footerLineEl("prod-footer-line"),
      footerLeftEl("prod-footer-left"),
      footerRightEl("prod-footer-right"),
    ],
  },
};

const SLIDE_LABELS: Record<SlideKey, string> = {
  title: "Title Slide",
  divider: "Month Divider",
  strategy: "Strategy Slide",
  production: "Production Table",
};

const FONT_OPTIONS = ["Calibri", "Arial", "Helvetica", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana"];

// Template metadata for each supported template ID
const TEMPLATE_META: Record<string, { name: string; icon: React.ReactNode; description: string; supportsCanvas: boolean }> = {
  "quarterly-content-roadmap": {
    name: "Quarterly Content Roadmap",
    icon: <Map className="w-4 h-4 text-[#C0392B]" />,
    description: "Drag elements to reposition, select to edit properties. Changes apply to future generated decks.",
    supportsCanvas: true,
  },
  "biweekly-docx": {
    name: "Bi-Weekly SEO Report",
    icon: <FileText className="w-4 h-4 text-blue-600" />,
    description: "Edit visual settings for the Bi-Weekly DOCX report.",
    supportsCanvas: false,
  },
  "monthly-pptx": {
    name: "Monthly SEO Report",
    icon: <Presentation className="w-4 h-4 text-violet-600" />,
    description: "Edit visual settings for the Monthly PPTX report.",
    supportsCanvas: false,
  },
  "qbr-pptx": {
    name: "Quarterly Business Review",
    icon: <LayoutTemplate className="w-4 h-4 text-emerald-600" />,
    description: "Edit visual settings for the QBR PPTX report.",
    supportsCanvas: false,
  },
};

// ─── Canvas Editor ────────────────────────────────────────────────────────────

interface DragState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startElX: number;
  startElY: number;
}

interface ResizeState {
  id: string;
  handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
  startMouseX: number;
  startMouseY: number;
  startElX: number;
  startElY: number;
  startElW: number;
  startElH: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

interface CanvasEditorProps {
  elements: TemplateElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void;
}

function SlideCanvas({ elements, selectedId, onSelect, onUpdate }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const resizeRef = useRef(resize);
  resizeRef.current = resize;
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const getPercent = useCallback((dx: number, dy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { px: 0, py: 0 };
    return { px: (dx / rect.width) * 100, py: (dy / rect.height) * 100 };
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current;
      const r = resizeRef.current;
      if (d) {
        const { px, py } = getPercent(e.clientX - d.startMouseX, e.clientY - d.startMouseY);
        const el = elementsRef.current.find(el => el.id === d.id);
        if (!el) return;
        onUpdate(d.id, {
          x: clamp(d.startElX + px, 0, 100 - el.w),
          y: clamp(d.startElY + py, 0, 100 - el.h),
        });
      }
      if (r) {
        const { px, py } = getPercent(e.clientX - r.startMouseX, e.clientY - r.startMouseY);
        const el = elementsRef.current.find(el => el.id === r.id);
        if (!el) return;
        let { x, y, w, h } = { x: r.startElX, y: r.startElY, w: r.startElW, h: r.startElH };
        if (r.handle === "se" || r.handle === "e") { w = clamp(r.startElW + px, 3, 100 - r.startElX); }
        if (r.handle === "s" || r.handle === "se" || r.handle === "sw") { h = clamp(r.startElH + py, 1, 100 - r.startElY); }
        if (r.handle === "nw" || r.handle === "w" || r.handle === "sw") {
          const newX = clamp(r.startElX + px, 0, r.startElX + r.startElW - 3);
          w = r.startElW - (newX - r.startElX); x = newX;
        }
        if (r.handle === "n" || r.handle === "nw" || r.handle === "ne") {
          const newY = clamp(r.startElY + py, 0, r.startElY + r.startElH - 1);
          h = r.startElH - (newY - r.startElY); y = newY;
        }
        if (r.handle === "ne") { w = clamp(r.startElW + px, 3, 100 - r.startElX); }
        onUpdate(r.id, { x, y, w, h });
      }
    }
    function onMouseUp() {
      setDrag(null);
      setResize(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [getPercent, onUpdate]);

  const startDrag = useCallback((e: React.MouseEvent, el: TemplateElement) => {
    e.preventDefault();
    e.stopPropagation();
    if (el.locked) return;
    onSelect(el.id);
    setDrag({ id: el.id, startMouseX: e.clientX, startMouseY: e.clientY, startElX: el.x, startElY: el.y });
  }, [onSelect]);

  const startResize = useCallback((e: React.MouseEvent, el: TemplateElement, handle: ResizeState["handle"]) => {
    e.preventDefault();
    e.stopPropagation();
    setResize({ id: el.id, handle, startMouseX: e.clientX, startMouseY: e.clientY, startElX: el.x, startElY: el.y, startElW: el.w, startElH: el.h });
  }, []);

  const HANDLES: ResizeState["handle"][] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  function handlePosition(handle: ResizeState["handle"]) {
    const h = handle;
    const s = { position: "absolute" as const, width: 8, height: 8, backgroundColor: "#3B82F6", border: "1px solid #fff", borderRadius: 2, cursor: `${h}-resize`, zIndex: 30 };
    if (h === "nw") return { ...s, top: -4, left: -4 };
    if (h === "n") return { ...s, top: -4, left: "calc(50% - 4px)" };
    if (h === "ne") return { ...s, top: -4, right: -4 };
    if (h === "e") return { ...s, top: "calc(50% - 4px)", right: -4 };
    if (h === "se") return { ...s, bottom: -4, right: -4 };
    if (h === "s") return { ...s, bottom: -4, left: "calc(50% - 4px)" };
    if (h === "sw") return { ...s, bottom: -4, left: -4 };
    if (h === "w") return { ...s, top: "calc(50% - 4px)", left: -4 };
    return s;
  }

  return (
    <div
      ref={canvasRef}
      className="relative w-full bg-white shadow-lg select-none overflow-hidden"
      style={{ aspectRatio: "16/9", borderRadius: 4 }}
      onMouseDown={e => { if (e.target === canvasRef.current) onSelect(null); }}
    >
      {/* Render elements in layer order */}
      {[...elements].map(el => {
        const isSelected = el.id === selectedId;
        const isText = el.type === "text";
        const isImage = el.type === "image";

        return (
          <div
            key={el.id}
            data-testid={`canvas-element-${el.id}`}
            onMouseDown={e => startDrag(e, el)}
            style={{
              position: "absolute",
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              backgroundColor: !isImage ? el.style.backgroundColor : undefined,
              borderRadius: el.style.borderRadius ? `${el.style.borderRadius}px` : undefined,
              opacity: el.style.opacity,
              border: el.style.border,
              cursor: el.locked ? "default" : drag ? "grabbing" : "grab",
              display: "flex",
              alignItems: isText ? "center" : undefined,
              justifyContent: isText ? "center" : undefined,
              boxSizing: "border-box",
              outline: isSelected ? "2px solid #3B82F6" : "none",
              outlineOffset: 1,
              zIndex: isSelected ? 20 : undefined,
              overflow: "hidden",
            }}
          >
            {/* Image element (swoosh header) */}
            {isImage && el.src && (
              <img
                src={el.src}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top right", display: "block", pointerEvents: "none" }}
                draggable={false}
              />
            )}

            {/* Text content */}
            {isText && el.content && (
              <span
                style={{
                  fontSize: el.style.fontSize ? `${el.style.fontSize * 0.32}px` : "4px",
                  fontWeight: el.style.fontWeight,
                  fontStyle: el.style.fontStyle,
                  fontFamily: el.style.fontFamily,
                  color: el.style.color,
                  textAlign: el.style.textAlign,
                  whiteSpace: "pre-line",
                  lineHeight: 1.4,
                  overflow: "hidden",
                  display: "block",
                  width: "100%",
                  padding: "0 4%",
                }}
              >
                {el.content}
              </span>
            )}

            {/* Resize handles for selected element */}
            {isSelected && !el.locked && HANDLES.map(h => (
              <div
                key={h}
                style={handlePosition(h)}
                onMouseDown={e => startResize(e, el, h)}
              />
            ))}
          </div>
        );
      })}

      {/* Grid overlay hint */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)", backgroundSize: "5% 5%" }} />
    </div>
  );
}

// ─── Property Panel ───────────────────────────────────────────────────────────

interface PropsPanel {
  element: TemplateElement | null;
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function PropertiesPanel({ element, onUpdate, onDelete, onDuplicate }: PropsPanel) {
  if (!element) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 text-muted-foreground gap-2">
        <Layers className="w-8 h-8 opacity-30" />
        <p className="text-xs">Click any element on the canvas to select it and edit its properties.</p>
      </div>
    );
  }

  function patchStyle(s: Partial<ElemStyle>) {
    onUpdate(element!.id, { style: { ...element!.style, ...s } });
  }

  return (
    <div className="overflow-y-auto h-full px-3 py-3 space-y-4 text-xs">
      {/* Element label */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[11px] text-foreground truncate">{element.label}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => onDuplicate(element.id)}
            title="Duplicate element"
            data-testid="button-duplicate-element"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-red-600"
            onClick={() => onDelete(element.id)}
            title="Delete element"
            data-testid="button-delete-element"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <Separator />

      {/* Position & Size */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Move className="w-3 h-3" /> Position & Size
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["x", "y", "w", "h"] as const).map(prop => (
            <div key={prop} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase">{prop === "x" ? "X %" : prop === "y" ? "Y %" : prop === "w" ? "W %" : "H %"}</Label>
              <Input
                type="number"
                min={0}
                max={prop === "x" || prop === "w" ? 100 : 100}
                step={0.5}
                value={Math.round(element[prop] * 10) / 10}
                onChange={e => onUpdate(element.id, { [prop]: parseFloat(e.target.value) || 0 })}
                className="h-7 text-xs px-2"
                data-testid={`input-element-${prop}`}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {element.type === "image" ? (
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Image</Label>
          <p className="text-[10px] text-muted-foreground">Header swoosh image. Resize and reposition using the canvas controls.</p>
        </div>
      ) : (
        <>
          {/* Background color */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fill Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={element.style.backgroundColor?.startsWith("#") ? element.style.backgroundColor : "#ffffff"}
                onChange={e => patchStyle({ backgroundColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border"
                data-testid="input-element-bg-color"
              />
              <Input
                value={element.style.backgroundColor ?? ""}
                onChange={e => patchStyle({ backgroundColor: e.target.value })}
                className="h-7 text-xs font-mono px-2 flex-1"
                placeholder="transparent"
                data-testid="input-element-bg-hex"
              />
            </div>
          </div>

          {/* Border radius */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Border Radius (px)</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={element.style.borderRadius ?? 0}
              onChange={e => patchStyle({ borderRadius: parseInt(e.target.value) || 0 })}
              className="h-7 text-xs px-2"
              data-testid="input-element-border-radius"
            />
          </div>
        </>
      )}

      {element.type === "text" && (
        <>
          <Separator />

          {/* Text content */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview Text</Label>
            <textarea
              className="w-full border rounded text-xs px-2 py-1.5 resize-none bg-background"
              rows={3}
              value={element.content ?? ""}
              onChange={e => onUpdate(element.id, { content: e.target.value })}
              data-testid="input-element-content"
            />
          </div>

          {/* Text color */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Text Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={element.style.color?.startsWith("#") ? element.style.color : "#000000"}
                onChange={e => patchStyle({ color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border"
                data-testid="input-element-text-color"
              />
              <Input
                value={element.style.color ?? ""}
                onChange={e => patchStyle({ color: e.target.value })}
                className="h-7 text-xs font-mono px-2 flex-1"
                data-testid="input-element-text-hex"
              />
            </div>
          </div>

          {/* Font size */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Font Size (pt)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={6}
                max={72}
                value={element.style.fontSize ?? 12}
                onChange={e => patchStyle({ fontSize: parseInt(e.target.value) || 12 })}
                className="h-7 text-xs px-2"
                data-testid="input-element-font-size"
              />
              <span className="text-[10px] text-muted-foreground shrink-0">pt</span>
            </div>
          </div>

          {/* Font weight */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Font Weight</Label>
            <Select
              value={element.style.fontWeight ?? "normal"}
              onValueChange={v => patchStyle({ fontWeight: v as "normal" | "bold" })}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-element-font-weight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font style */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Font Style</Label>
            <Select
              value={element.style.fontStyle ?? "normal"}
              onValueChange={v => patchStyle({ fontStyle: v as "normal" | "italic" })}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-element-font-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="italic">Italic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Text align */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Text Align</Label>
            <Select
              value={element.style.textAlign ?? "left"}
              onValueChange={v => patchStyle({ textAlign: v as "left" | "center" | "right" })}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-element-text-align">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Opacity */}
      <Separator />
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opacity</Label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={element.style.opacity ?? 1}
            onChange={e => patchStyle({ opacity: parseFloat(e.target.value) })}
            className="flex-1 h-4 cursor-pointer"
            data-testid="input-element-opacity"
          />
          <span className="text-[10px] w-6 text-right">{Math.round((element.style.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Non-canvas templates (biweekly, monthly, qbr) ───────────────────────────

function SimpleTemplateEditor({ templateId }: { templateId: string }) {
  const { toast } = useToast();
  const [accentColor, setAccentColor] = useState("#C0392B");
  const [darkColor, setDarkColor] = useState("#1B3A6B");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/template/config").then(r => r.json()).then((data: any) => {
      const key = templateId === "biweekly-docx" ? "biweekly" : templateId === "monthly-pptx" ? "monthly" : "qbr";
      if (data?.[key]?.accentColor) setAccentColor("#" + data[key].accentColor);
    }).catch(() => {});
  }, [templateId]);

  async function handleSave() {
    setSaving(true);
    try {
      const key = templateId === "biweekly-docx" ? "biweekly" : templateId === "monthly-pptx" ? "monthly" : "qbr";
      await apiRequest("POST", "/api/template/save", {
        templateType: key,
        accentColor: accentColor.replace("#", ""),
      });
      toast({ title: "Template saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-sm mx-auto text-center">
      <div className="space-y-1">
        <p className="font-semibold text-sm">Visual Settings</p>
        <p className="text-xs text-muted-foreground">For full slide-level design control, use the Quarterly Content Roadmap template which supports the canvas editor.</p>
      </div>
      <div className="space-y-3 w-full text-left">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Accent Color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border" data-testid="input-accent-color" />
            <Input value={accentColor} onChange={e => setAccentColor(e.target.value)} className="font-mono text-sm h-9" data-testid="input-accent-hex" />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Additional visual options are available in the Template Builder under Admin settings.</p>
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="button-save-simple-template">
        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

// ─── Main Template Editor Page ────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const [, params] = useRoute<{ templateId: string }>("/templates/:templateId");
  const templateId = params?.templateId ?? "quarterly-content-roadmap";
  const meta = TEMPLATE_META[templateId] ?? TEMPLATE_META["quarterly-content-roadmap"];
  const { toast } = useToast();

  const [template, setTemplate] = useState<TemplateState>(QCR_DEFAULTS);
  const [activeSlide, setActiveSlide] = useState<SlideKey>("title");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load saved template from server
  useEffect(() => {
    if (!meta.supportsCanvas) { setLoading(false); return; }
    fetch("/api/template/config")
      .then(r => r.json())
      .then((data: any) => {
        const saved = data?.qcr_layout?.layout;
        if (saved) {
          // Re-hydrate image src (Vite asset URLs vary by build; always use the current import)
          const rehydrated: TemplateState = {
            ...saved,
            slides: Object.fromEntries(
              Object.entries(saved.slides as Record<SlideKey, TemplateElement[]>).map(([key, els]) => [
                key,
                (els as TemplateElement[]).map(el =>
                  el.type === "image" ? { ...el, src: swooshHeaderImg as string } : el
                ),
              ])
            ) as Record<SlideKey, TemplateElement[]>,
          };
          setTemplate(rehydrated);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [meta.supportsCanvas]);

  const elements = template.slides[activeSlide] ?? [];
  const selectedElement = elements.find(e => e.id === selectedId) ?? null;

  function updateElement(id: string, patch: Partial<TemplateElement>) {
    setTemplate(prev => ({
      ...prev,
      slides: {
        ...prev.slides,
        [activeSlide]: prev.slides[activeSlide].map(el =>
          el.id === id ? { ...el, ...patch, style: { ...el.style, ...(patch.style ?? {}) } } : el
        ),
      },
    }));
  }

  function updateElementFromCanvas(id: string, patch: Partial<TemplateElement>) {
    setTemplate(prev => ({
      ...prev,
      slides: {
        ...prev.slides,
        [activeSlide]: prev.slides[activeSlide].map(el =>
          el.id === id ? { ...el, ...patch } : el
        ),
      },
    }));
  }

  function deleteElement(id: string) {
    setTemplate(prev => ({
      ...prev,
      slides: {
        ...prev.slides,
        [activeSlide]: prev.slides[activeSlide].filter(el => el.id !== id),
      },
    }));
    setSelectedId(null);
  }

  function duplicateElement(id: string) {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const newEl: TemplateElement = { ...el, id: `${el.id}-copy-${Date.now()}`, label: `${el.label} (copy)`, x: el.x + 2, y: el.y + 2 };
    setTemplate(prev => ({
      ...prev,
      slides: {
        ...prev.slides,
        [activeSlide]: [...prev.slides[activeSlide], newEl],
      },
    }));
    setSelectedId(newEl.id);
  }

  function resetSlide() {
    setTemplate(prev => ({ ...prev, slides: { ...prev.slides, [activeSlide]: QCR_DEFAULTS.slides[activeSlide] } }));
    setSelectedId(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/template/save", {
        templateType: "qcr_layout",
        layout: template,
      });
      toast({ title: "Template saved", description: "Future Quarterly Content Roadmap decks will use this layout." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background" data-testid="page-template-editor">
      {/* Header */}
      <div className="border-b px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Link href="/templates" className="hover:text-foreground transition-colors">Templates</Link>
          <ChevronRight className="w-3 h-3" />
          <div className="flex items-center gap-1.5 text-foreground font-medium">
            {meta.icon}
            <span>{meta.name}</span>
          </div>
        </div>
        {meta.supportsCanvas && (
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs" data-testid="button-save-template">
            {saving ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
            Commit Template
          </Button>
        )}
      </div>

      {!meta.supportsCanvas ? (
        <SimpleTemplateEditor templateId={templateId} />
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Slide type selector + Global styles ───────────────── */}
          <div className="w-52 shrink-0 border-r flex flex-col overflow-y-auto bg-card">
            <div className="px-3 py-3 space-y-4 flex-1">
              {/* Slide type tabs */}
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Slide Type</p>
                {(Object.keys(SLIDE_LABELS) as SlideKey[]).map(key => (
                  <button
                    key={key}
                    onClick={() => { setActiveSlide(key); setSelectedId(null); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      activeSlide === key
                        ? "bg-[#C0392B]/10 text-[#C0392B] font-semibold"
                        : "text-foreground hover:bg-muted"
                    }`}
                    data-testid={`tab-slide-${key}`}
                  >
                    {SLIDE_LABELS[key]}
                  </button>
                ))}
              </div>

              <Separator />

              {/* Global styles */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Global Styles</p>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Accent Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={template.globalStyles.accentColor}
                      onChange={e => setTemplate(t => ({ ...t, globalStyles: { ...t.globalStyles, accentColor: e.target.value } }))}
                      className="w-7 h-7 rounded cursor-pointer border"
                      data-testid="input-global-accent"
                    />
                    <Input
                      value={template.globalStyles.accentColor}
                      onChange={e => setTemplate(t => ({ ...t, globalStyles: { ...t.globalStyles, accentColor: e.target.value } }))}
                      className="h-7 text-xs font-mono px-2"
                      data-testid="input-global-accent-hex"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Dark Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={template.globalStyles.darkColor}
                      onChange={e => setTemplate(t => ({ ...t, globalStyles: { ...t.globalStyles, darkColor: e.target.value } }))}
                      className="w-7 h-7 rounded cursor-pointer border"
                      data-testid="input-global-dark"
                    />
                    <Input
                      value={template.globalStyles.darkColor}
                      onChange={e => setTemplate(t => ({ ...t, globalStyles: { ...t.globalStyles, darkColor: e.target.value } }))}
                      className="h-7 text-xs font-mono px-2"
                      data-testid="input-global-dark-hex"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Default Font</Label>
                  <Select
                    value={template.globalStyles.fontFamily}
                    onValueChange={v => setTemplate(t => ({ ...t, globalStyles: { ...t.globalStyles, fontFamily: v } }))}
                  >
                    <SelectTrigger className="h-7 text-xs" data-testid="select-global-font">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map(f => (
                        <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Element list for current slide */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Slide Elements</p>
                {elements.map(el => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors flex items-center gap-1.5 ${
                      el.id === selectedId ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "hover:bg-muted text-foreground"
                    }`}
                    data-testid={`element-list-${el.id}`}
                  >
                    <span className={`shrink-0 w-2 h-2 rounded-sm`} style={{ backgroundColor: el.style.backgroundColor ?? el.style.color ?? "#888" }} />
                    {el.label}
                  </button>
                ))}
                <button
                  onClick={resetSlide}
                  className="w-full text-left px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors mt-1"
                  data-testid="button-reset-slide"
                >
                  Reset slide to defaults
                </button>
              </div>
            </div>
          </div>

          {/* ── Center: Canvas ────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-muted/30">
            <div className="border-b px-4 py-2 flex items-center justify-between shrink-0 bg-card">
              <p className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">{SLIDE_LABELS[activeSlide]}</strong> — Drag elements to reposition · Click to select · Use handles to resize
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
              <div className="w-full max-w-3xl">
                <SlideCanvas
                  elements={elements}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onUpdate={updateElementFromCanvas}
                />
              </div>
            </div>
          </div>

          {/* ── Right: Properties ─────────────────────────────────────────── */}
          <div className="w-56 shrink-0 border-l bg-card flex flex-col overflow-hidden">
            <div className="border-b px-3 py-2 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedElement ? "Element Properties" : "Properties"}
              </p>
            </div>
            <PropertiesPanel
              element={selectedElement}
              onUpdate={updateElement}
              onDelete={deleteElement}
              onDuplicate={duplicateElement}
            />
          </div>
        </div>
      )}
    </div>
  );
}
