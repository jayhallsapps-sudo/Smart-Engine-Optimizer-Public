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

// ─── Defaults ─────────────────────────────────────────────────────────────────
// All positions/sizes are canvas-% (x/w=% of canvas width, y/h=% of canvas height).
// Font sizes use canvas-display units where px_displayed = fontSize * 0.32.
// To read as canvas px: 22→7px, 28→9px, 34→11px, 44→14px, 56→18px, 90→29px, 140→45px.

// Shared canvas geometry
const CL = 4;           // left margin %
const CW = 92;          // inner width %
const FOOTER_LINE_Y = 90;
const FOOTER_Y = 91.5;
const FOOTER_H = 7;
const ROW_H = 7;        // table data row height %

function swooshEl(id: string, h: number): TemplateElement {
  return { id, label: "Header Swoosh", type: "image", x: 0, y: 0, w: 100, h, src: swooshHeaderImg as string, style: {} };
}
function footerLineEl(id: string): TemplateElement {
  return { id, label: "Footer Line", type: "rect", x: CL, y: FOOTER_LINE_Y, w: CW, h: 0.5, style: { backgroundColor: "#E5E7EB" } };
}
function footerLeftEl(id: string): TemplateElement {
  return { id, label: "Footer — Webserv", type: "text", x: CL, y: FOOTER_Y, w: 40, h: FOOTER_H, content: "Webserv  |  webserv.io", style: { color: "#6B7280", fontSize: 22, textAlign: "left" } };
}
function footerRightEl(id: string): TemplateElement {
  return { id, label: "Footer — Confidential", type: "text", x: 55, y: FOOTER_Y, w: 41, h: FOOTER_H, content: "CONFIDENTIAL", style: { color: "#C5CBD3", fontSize: 22, textAlign: "right" } };
}

const QCR_DEFAULTS: TemplateState = {
  globalStyles: { accentColor: "#C0392B", darkColor: "#1B3A6B", fontFamily: "Calibri" },
  slides: {

    // ── TITLE SLIDE ──────────────────────────────────────────────────────────
    title: [
      { id: "title-bg",          label: "Slide Background",   type: "rect", x: 0,  y: 0,  w: 100, h: 100, style: { backgroundColor: "#F8FAFC" } },
      swooshEl("title-swoosh", 22),
      { id: "title-text",        label: "Deck Title",          type: "text", x: CL, y: 27,  w: CW, h: 14, content: "Quarterly Content Roadmap",   style: { color: "#111827", fontSize: 56, fontWeight: "bold", textAlign: "left" } },
      { id: "title-rule",        label: "Accent Rule",         type: "rect", x: CL, y: 42,  w: 15, h: 1,  style: { backgroundColor: "#C0392B" } },
      { id: "title-client",      label: "Client Name",         type: "text", x: CL, y: 44,  w: CW, h: 10, content: "[Client Name]",                style: { color: "#C0392B", fontSize: 44, fontWeight: "bold", textAlign: "left" } },
      { id: "title-date",        label: "Quarter / Date",      type: "text", x: CL, y: 56,  w: CW, h: 7,  content: "Q1 2026  •  Prepared by Webserv", style: { color: "#6B7280", fontSize: 28, textAlign: "left" } },
      footerLineEl("title-footer-line"),
      footerLeftEl("title-footer-left"),
      footerRightEl("title-footer-right"),
    ],

    // ── MONTH COVER SLIDE ─────────────────────────────────────────────────────
    // White bg + swoosh (matches BiWeekly visual style), large dark month text
    divider: [
      { id: "div-bg",       label: "Slide Background",    type: "rect",  x: 0,  y: 0,    w: 100, h: 100,   style: { backgroundColor: "#FFFFFF" } },
      swooshEl("div-swoosh", 22),
      { id: "div-rule",     label: "Red Accent Rule",     type: "rect",  x: CL, y: 26,   w: 14,  h: 1,     style: { backgroundColor: "#C0392B" } },
      { id: "div-month",    label: "Month Name",          type: "text",  x: CL, y: 28,   w: 82,  h: 24,    content: "January 2026",      style: { color: "#111827", fontSize: 90, fontWeight: "bold", textAlign: "left" } },
      { id: "div-subtitle", label: "Quarter / Plan Label",type: "text",  x: CL, y: 53,   w: 82,  h: 8,     content: "Q1 2026 Content Plan", style: { color: "#6B7280", fontSize: 32, textAlign: "left" } },
      footerLineEl("div-footer-line"),
      footerLeftEl("div-footer-left"),
      footerRightEl("div-footer-right"),
    ],

    // ── STRATEGY SLIDE ────────────────────────────────────────────────────────
    // Light gray bg, NO swoosh, small italic label, large month name with red dot,
    // two body paragraphs on left half, Webserv logo bottom-left
    strategy: [
      { id: "strat-bg",      label: "Slide Background",    type: "rect", x: 0,    y: 0,    w: 100, h: 100, style: { backgroundColor: "#E8E8E8" } },
      { id: "strat-label",   label: "SEO Strategy Label",  type: "text", x: 7,    y: 26,   w: 28,  h: 5,   content: "SEO Strategy", style: { color: "#9CA3AF", fontSize: 20, fontStyle: "italic", textAlign: "left" } },
      { id: "strat-dot",     label: "Red Bullet Dot",      type: "rect", x: 3.2,  y: 31.5, w: 2.5, h: 4.5, style: { backgroundColor: "#C0392B", borderRadius: 100 } },
      { id: "strat-month",   label: "Month Name",          type: "text", x: 7,    y: 29,   w: 52,  h: 14,  content: "June", style: { color: "#111827", fontSize: 120, fontWeight: "bold", textAlign: "left" } },
      { id: "strat-body1",   label: "Strategy Body — Para 1", type: "text", x: 7, y: 45,   w: 43,  h: 24,  content: "This month builds on foundational stabilization by expanding coverage of high-intent treatment topics and capturing demand across both service and informational search. Work this month includes launching and scaling core pages, publishing high-traffic educational content designed to support lead capture, and aligning site-wide conversion elements with the structural changes already in place.", style: { color: "#374151", fontSize: 20, textAlign: "left" } },
      { id: "strat-body2",   label: "Strategy Body — Para 2", type: "text", x: 7, y: 70,   w: 43,  h: 16,  content: "This phase shifts the strategy from cleanup and stabilization to intent-driven growth, ensuring the site can capture users earlier in their decision process while reinforcing core service authority.", style: { color: "#374151", fontSize: 20, textAlign: "left" } },
      { id: "strat-logo-bg", label: "Webserv Icon",        type: "rect", x: 4,    y: 87,   w: 4,   h: 6.5, style: { backgroundColor: "#C0392B", borderRadius: 6 } },
      { id: "strat-logo",    label: "Webserv Wordmark",    type: "text", x: 9,    y: 87,   w: 18,  h: 6.5, content: "webserv", style: { color: "#111827", fontSize: 28, fontWeight: "bold", textAlign: "left" } },
    ],

    // ── PRODUCTION TABLE SLIDE ────────────────────────────────────────────────
    // White bg, NO swoosh, large month name at top, then full-width table:
    // dark header (6 cols) + sample data rows + gray summary row
    production: [
      { id: "prod-bg",       label: "Slide Background",    type: "rect", x: 0,  y: 0,    w: 100, h: 100,  style: { backgroundColor: "#FFFFFF" } },
      { id: "prod-month",    label: "Month Name",          type: "text", x: CL, y: 2,    w: 65,  h: 18,   content: "June", style: { color: "#111827", fontSize: 140, fontWeight: "bold", textAlign: "left" } },
      // Table
      { id: "prod-hdr",      label: "Table Header Row",    type: "rect", x: CL, y: 21,   w: CW,  h: 8.5,  style: { backgroundColor: "#1F2937" } },
      { id: "prod-hdr-txt",  label: "Table Header Text",   type: "text", x: CL, y: 21,   w: CW,  h: 8.5,  content: "Credit Cost   Credit Type   URL   New URL   Date Published   Reasoning", style: { color: "#FFFFFF", fontSize: 20, fontWeight: "bold", textAlign: "left" } },
      { id: "prod-r1",       label: "Row 1",               type: "rect", x: CL, y: 29.5, w: CW,  h: 8,    style: { backgroundColor: "#FFFFFF", border: "1px solid #D1D5DB" } },
      { id: "prod-r1-txt",   label: "Row 1 Text",          type: "text", x: CL, y: 29.5, w: CW,  h: 8,    content: "1   Scale   N/a   /blog/end-stage-alcoholism   March 3   High-traffic blog – lead capture", style: { color: "#374151", fontSize: 17, textAlign: "left" } },
      { id: "prod-r2",       label: "Row 2",               type: "rect", x: CL, y: 37.5, w: CW,  h: 8,    style: { backgroundColor: "#FFFFFF", border: "1px solid #D1D5DB" } },
      { id: "prod-r2-txt",   label: "Row 2 Text",          type: "text", x: CL, y: 37.5, w: CW,  h: 8,    content: "1   Scale   /alcohol-addiction-treatment/   /what-we-treat/alcohol-addiction-treatment   March 6   Stabilizing core service pages", style: { color: "#374151", fontSize: 17, textAlign: "left" } },
      { id: "prod-r3",       label: "Row 3",               type: "rect", x: CL, y: 45.5, w: CW,  h: 8,    style: { backgroundColor: "#FFFFFF", border: "1px solid #D1D5DB" } },
      { id: "prod-r3-txt",   label: "Row 3 Text",          type: "text", x: CL, y: 45.5, w: CW,  h: 8,    content: "1   Scale   /opioid-addiction-treatment/   /what-we-treat/opioid-addiction-treatment   March 11   Stabilizing core service pages", style: { color: "#374151", fontSize: 17, textAlign: "left" } },
      { id: "prod-r4",       label: "Row 4",               type: "rect", x: CL, y: 53.5, w: CW,  h: 8,    style: { backgroundColor: "#FFFFFF", border: "1px solid #D1D5DB" } },
      { id: "prod-r4-txt",   label: "Row 4 Text",          type: "text", x: CL, y: 53.5, w: CW,  h: 8,    content: "2   Service   N/a   /levels-of-care/detox-services/alcohol-detox   March 18   Stabilizing core service pages", style: { color: "#374151", fontSize: 17, textAlign: "left" } },
      { id: "prod-r5",       label: "Row 5",               type: "rect", x: CL, y: 61.5, w: CW,  h: 8,    style: { backgroundColor: "#FFFFFF", border: "1px solid #D1D5DB" } },
      { id: "prod-r5-txt",   label: "Row 5 Text",          type: "text", x: CL, y: 61.5, w: CW,  h: 8,    content: "0   CRO Update   N/a   https://[client].com/   March 30   Requires update to align with structural changes", style: { color: "#374151", fontSize: 17, textAlign: "left" } },
      { id: "prod-summ",     label: "Summary Row",         type: "rect", x: CL, y: 69.5, w: CW,  h: 10,   style: { backgroundColor: "#C9CACB" } },
      { id: "prod-summ-txt", label: "Summary Text",        type: "text", x: CL, y: 69.5, w: CW,  h: 10,   content: "8 total Credits   *Credit types allocated by Webserv on level of work   URL changes required for better information architecture   Due dates subject to change due to internal Webserv production workflows", style: { color: "#374151", fontSize: 16, textAlign: "left" } },
    ],
  },
};

const SLIDE_LABELS: Record<SlideKey, string> = {
  title: "Title Slide",
  divider: "Month Cover",
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
    const s = { position: "absolute" as const, width: 8, height: 8, backgroundColor: "#C0392B", border: "1px solid #fff", borderRadius: 2, cursor: `${h}-resize`, zIndex: 30 };
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
              outline: isSelected ? "2px solid #C0392B" : "none",
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
                style={{ width: "100%", height: "100%", objectFit: "fill", display: "block", pointerEvents: "none" }}
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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Image Source</Label>
            {element.src && (
              <img src={element.src} alt="" className="w-full rounded border object-cover" style={{ maxHeight: 60 }} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Upload Image</Label>
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded border border-dashed text-[10px] text-muted-foreground hover:bg-muted transition-colors" data-testid="button-upload-image">
              <span>Choose file…</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    onUpdate(element.id, { src: ev.target?.result as string });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <p className="text-[9px] text-muted-foreground">PNG, JPG, SVG. Replaces current image.</p>
          </div>
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

          {/* Border */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Border (CSS)</Label>
            <Input
              value={element.style.border ?? ""}
              onChange={e => patchStyle({ border: e.target.value || undefined })}
              placeholder="e.g. 2px solid #C0392B"
              className="h-7 text-xs px-2 font-mono"
              data-testid="input-element-border"
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

  function addElement(el: TemplateElement) {
    setTemplate(prev => ({
      ...prev,
      slides: { ...prev.slides, [activeSlide]: [...prev.slides[activeSlide], el] },
    }));
    setSelectedId(el.id);
  }

  function addTextElement() {
    const id = `text-${Date.now()}`;
    addElement({ id, label: "New Text", type: "text", x: 10, y: 30, w: 40, h: 12, content: "Text here", style: { color: "#111827", fontSize: 28, textAlign: "left" } });
  }

  function addRectElement() {
    const id = `rect-${Date.now()}`;
    addElement({ id, label: "New Shape", type: "rect", x: 10, y: 30, w: 30, h: 10, style: { backgroundColor: "#C0392B" } });
  }

  function addImageElement(src: string, label = "Uploaded Image") {
    const id = `img-${Date.now()}`;
    addElement({ id, label, type: "image", x: 5, y: 5, w: 40, h: 25, src, style: {} });
  }

  const imageUploadRef = useRef<HTMLInputElement>(null);

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

              {/* Add element section */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add Element</p>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={addTextElement}
                    className="px-2 py-1.5 rounded border text-[10px] hover:bg-muted transition-colors text-center"
                    data-testid="button-add-text"
                    title="Add text element"
                  >Text</button>
                  <button
                    onClick={addRectElement}
                    className="px-2 py-1.5 rounded border text-[10px] hover:bg-muted transition-colors text-center"
                    data-testid="button-add-shape"
                    title="Add shape element"
                  >Shape</button>
                  <label
                    className="px-2 py-1.5 rounded border text-[10px] hover:bg-muted transition-colors text-center cursor-pointer"
                    data-testid="button-add-image"
                    title="Upload and add image"
                  >
                    Image
                    <input
                      ref={imageUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          addImageElement(ev.target?.result as string, file.name.replace(/\.[^.]+$/, ""));
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
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
                      el.id === selectedId ? "bg-[#C0392B]/10 text-[#C0392B] font-medium" : "hover:bg-muted text-foreground"
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
