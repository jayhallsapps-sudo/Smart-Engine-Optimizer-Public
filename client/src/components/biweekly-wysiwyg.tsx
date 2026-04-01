import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, GripVertical, Trash2, Plus,
  Type, Minus, LayoutGrid, Table2,
  AlignLeft, AlignCenter, AlignRight,
  ChevronUp, ChevronDown, Eye, EyeOff,
  FileText, List, ListOrdered, Sparkles,
  TrendingUp, BarChart2, MessageSquare, Columns,
} from "lucide-react";
import { DEFAULT_THEME_TOKENS } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType =
  | "title" | "subtitle" | "paragraph" | "richText"
  | "divider" | "spacer"
  | "kpiSummary" | "dataTable" | "workLog"
  | "callout" | "bulletList" | "numberedList" | "closingSummary";

export interface KPIItem {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
}

export interface BlockSettings {
  spacing: "compact" | "normal" | "relaxed";
  alignment: "left" | "center" | "right";
  visible: boolean;
  rows?: number;
  cols?: number;
  kpis?: KPIItem[];
  items?: string[];
  height?: number;
  dividerThickness?: number;
}

export interface DocBlock {
  id: string;
  type: BlockType;
  content: string;
  settings: BlockSettings;
}

// ─── Default document blocks ──────────────────────────────────────────────────

function uid() {
  return `blk-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_BIWEEKLY_BLOCKS: DocBlock[] = [
  {
    id: "blk-title",
    type: "title",
    content: "Bi-Weekly SEO Performance Report",
    settings: { spacing: "normal", alignment: "center", visible: true },
  },
  {
    id: "blk-subtitle",
    type: "subtitle",
    content: "Client Name  ·  Report Period",
    settings: { spacing: "compact", alignment: "center", visible: true },
  },
  {
    id: "blk-div1",
    type: "divider",
    content: "",
    settings: { spacing: "normal", alignment: "left", visible: true, dividerThickness: 2 },
  },
  {
    id: "blk-kpi",
    type: "kpiSummary",
    content: "Performance Overview",
    settings: {
      spacing: "normal",
      alignment: "left",
      visible: true,
      kpis: [
        { label: "Organic Sessions", value: "12,847", trend: "up" },
        { label: "Keyword Rankings", value: "234", trend: "up" },
        { label: "Avg. Position", value: "14.2", trend: "down" },
        { label: "Click-Through Rate", value: "3.8%", trend: "up" },
      ],
    },
  },
  {
    id: "blk-exec",
    type: "paragraph",
    content:
      "This report covers SEO performance for the period indicated above. Traffic continues to trend upward, driven by improved rankings for core service keywords and recent content optimizations.",
    settings: { spacing: "normal", alignment: "left", visible: true },
  },
  {
    id: "blk-table",
    type: "dataTable",
    content: "Top Keyword Rankings",
    settings: { spacing: "normal", alignment: "left", visible: true, rows: 5, cols: 4 },
  },
  {
    id: "blk-insight",
    type: "callout",
    content:
      "Key Insight: Three high-priority keywords entered the top 10 this period, representing a significant opportunity for continued organic growth.",
    settings: { spacing: "normal", alignment: "left", visible: true },
  },
  {
    id: "blk-worklog",
    type: "workLog",
    content: "Work Completed This Period",
    settings: {
      spacing: "normal",
      alignment: "left",
      visible: true,
      items: [
        "Technical audit and on-page optimizations",
        "Content refresh for 4 service pages",
        "Link building outreach (8 prospects contacted)",
      ],
    },
  },
  {
    id: "blk-next",
    type: "bulletList",
    content: "Priorities Next Period",
    settings: {
      spacing: "normal",
      alignment: "left",
      visible: true,
      items: [
        "Publish 2 new blog posts targeting informational queries",
        "Resolve Core Web Vitals issues on 3 key landing pages",
        "Review and update meta descriptions across service pages",
      ],
    },
  },
  {
    id: "blk-close",
    type: "closingSummary",
    content:
      "Overall momentum remains positive. The implemented changes are showing measurable impact and positioning the site for continued organic growth in the next period.",
    settings: { spacing: "normal", alignment: "left", visible: true },
  },
];

// ─── Palette block definitions ─────────────────────────────────────────────────

interface PaletteItem {
  type: BlockType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}

const PALETTE: PaletteItem[] = [
  { type: "title", label: "Title", icon: Type, group: "Content" },
  { type: "subtitle", label: "Subtitle", icon: Type, group: "Content" },
  { type: "paragraph", label: "Paragraph", icon: FileText, group: "Content" },
  { type: "richText", label: "Rich Text", icon: FileText, group: "Content" },
  { type: "divider", label: "Divider", icon: Minus, group: "Structure" },
  { type: "spacer", label: "Spacer", icon: Columns, group: "Structure" },
  { type: "kpiSummary", label: "KPI Summary", icon: LayoutGrid, group: "Data" },
  { type: "dataTable", label: "Data Table", icon: Table2, group: "Data" },
  { type: "callout", label: "Callout / Insight", icon: MessageSquare, group: "Components" },
  { type: "workLog", label: "Work Log", icon: BarChart2, group: "Components" },
  { type: "bulletList", label: "Bullet List", icon: List, group: "Components" },
  { type: "numberedList", label: "Numbered List", icon: ListOrdered, group: "Components" },
  { type: "closingSummary", label: "Closing Summary", icon: Sparkles, group: "Components" },
];

const PALETTE_GROUPS = ["Content", "Structure", "Data", "Components"];

// ─── Block factory ─────────────────────────────────────────────────────────────

function createBlock(type: BlockType): DocBlock {
  const base: DocBlock = {
    id: uid(),
    type,
    content: "",
    settings: { spacing: "normal", alignment: "left", visible: true },
  };
  switch (type) {
    case "title": return { ...base, content: "Section Title" };
    case "subtitle": return { ...base, content: "Subtitle or date range" };
    case "paragraph": return { ...base, content: "Enter paragraph text here..." };
    case "richText": return { ...base, content: "Rich text content..." };
    case "kpiSummary":
      return {
        ...base,
        content: "KPI Overview",
        settings: {
          ...base.settings,
          kpis: [
            { label: "Metric 1", value: "—", trend: "flat" },
            { label: "Metric 2", value: "—", trend: "flat" },
            { label: "Metric 3", value: "—", trend: "flat" },
            { label: "Metric 4", value: "—", trend: "flat" },
          ],
        },
      };
    case "dataTable":
      return { ...base, content: "Table Title", settings: { ...base.settings, rows: 4, cols: 3 } };
    case "callout":
      return { ...base, content: "Key insight or callout text goes here." };
    case "workLog":
      return {
        ...base,
        content: "Work Log",
        settings: { ...base.settings, items: ["Task completed", "Another item"] },
      };
    case "bulletList":
      return {
        ...base,
        content: "List Title",
        settings: { ...base.settings, items: ["Item one", "Item two", "Item three"] },
      };
    case "numberedList":
      return {
        ...base,
        content: "Numbered List Title",
        settings: { ...base.settings, items: ["First item", "Second item", "Third item"] },
      };
    case "closingSummary":
      return { ...base, content: "Closing summary or next steps." };
    case "divider":
      return { ...base, settings: { ...base.settings, dividerThickness: 2 } };
    case "spacer":
      return { ...base, settings: { ...base.settings, height: 24 } };
    default:
      return base;
  }
}

// ─── Spacing helpers ──────────────────────────────────────────────────────────

const SPACING_PY: Record<string, string> = {
  compact: "py-2",
  normal: "py-4",
  relaxed: "py-7",
};

// ─── Block renderers (canvas view) ────────────────────────────────────────────

function TitleBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const align = block.settings.alignment === "center" ? "text-center" : block.settings.alignment === "right" ? "text-right" : "text-left";
  return (
    <div className={`${SPACING_PY[block.settings.spacing]} ${align}`}>
      <h1 style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont, fontSize: tokens.headingXL, fontWeight: tokens.headingWeight, lineHeight: 1.2 }}>
        {block.content || "Title"}
      </h1>
    </div>
  );
}

function SubtitleBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const align = block.settings.alignment === "center" ? "text-center" : block.settings.alignment === "right" ? "text-right" : "text-left";
  return (
    <div className={`${SPACING_PY[block.settings.spacing]} ${align}`}>
      <p style={{ color: tokens.secondaryColor, fontFamily: tokens.bodyFont, fontSize: tokens.bodyLG, opacity: 0.8 }}>
        {block.content || "Subtitle"}
      </p>
    </div>
  );
}

function ParagraphBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const align = block.settings.alignment === "center" ? "text-center" : block.settings.alignment === "right" ? "text-right" : "text-left";
  return (
    <div className={`${SPACING_PY[block.settings.spacing]} ${align}`}>
      <p style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.7 }}>
        {block.content || "Enter text here..."}
      </p>
    </div>
  );
}

function DividerBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const thickness = block.settings.dividerThickness ?? 1;
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div style={{ height: thickness, backgroundColor: tokens.primaryColor, opacity: 0.8 }} />
    </div>
  );
}

function SpacerBlock({ block }: { block: DocBlock }) {
  return <div style={{ height: block.settings.height ?? 24 }} />;
}

function KPISummaryBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const kpis = block.settings.kpis ?? [];
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          {block.content}
        </p>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)` }}>
        {kpis.map((kpi, i) => (
          <div key={i} className="rounded-lg border p-3" style={{ backgroundColor: tokens.cardBg, borderColor: tokens.cardBorderColor, borderRadius: tokens.borderRadius }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#6B7280", fontFamily: tokens.bodyFont }}>
              {kpi.label}
            </p>
            <p className="font-bold text-lg leading-none" style={{ color: tokens.secondaryColor, fontFamily: tokens.headingFont }}>
              {kpi.value}
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              {kpi.trend === "up" && <TrendingUp className="w-3 h-3" style={{ color: tokens.successColor }} />}
              {kpi.trend === "down" && <TrendingUp className="w-3 h-3 rotate-180" style={{ color: tokens.errorColor }} />}
              <span className="text-[10px]" style={{ color: kpi.trend === "up" ? tokens.successColor : kpi.trend === "down" ? tokens.errorColor : "#6B7280" }}>
                {kpi.trend === "up" ? "↑" : kpi.trend === "down" ? "↓" : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTableBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const rows = block.settings.rows ?? 4;
  const cols = block.settings.cols ?? 3;
  const colLabels = ["Keyword", "Position", "Change", "Volume"].slice(0, cols);
  const sampleRows = Array.from({ length: rows }, (_, i) => [
    `keyword-${i + 1}`, `${Math.floor(Math.random() * 50) + 1}`, "+2", `${Math.floor(Math.random() * 5000) + 100}`,
  ].slice(0, cols));

  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          {block.content}
        </p>
      )}
      <div className="overflow-hidden rounded" style={{ border: `1px solid ${tokens.tableBorderColor}`, borderRadius: tokens.borderRadius }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {colLabels.map((label, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold"
                  style={{ backgroundColor: tokens.tableHeaderBg, color: tokens.tableHeaderText, fontFamily: tokens.headingFont, fontSize: tokens.bodySM }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 border-t"
                    style={{ color: tokens.tableBodyText, fontFamily: tokens.bodyFont, fontSize: tokens.bodySM, borderColor: tokens.tableBorderColor }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalloutBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div className="px-4 py-3 rounded-r" style={{ backgroundColor: tokens.calloutBg, borderLeft: `4px solid ${tokens.calloutBorderColor}`, borderRadius: `0 ${tokens.borderRadius}px ${tokens.borderRadius}px 0` }}>
        <p style={{ color: tokens.calloutText, fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.6 }}>
          {block.content || "Callout text..."}
        </p>
      </div>
    </div>
  );
}

function WorkLogBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const items = block.settings.items ?? [];
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          {block.content}
        </p>
      )}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded" style={{ backgroundColor: "#F9FAFB", border: `1px solid ${tokens.tableBorderColor}`, borderRadius: tokens.borderRadius }}>
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: tokens.primaryColor }} />
            <span style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD }}>
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletListBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const items = block.settings.items ?? [];
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          {block.content}
        </p>
      )}
      <ul className="space-y-1 pl-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 shrink-0" style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: tokens.primaryColor, display: "inline-block" }} />
            <span style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.6 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NumberedListBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const items = block.settings.items ?? [];
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          {block.content}
        </p>
      )}
      <ol className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="font-bold text-xs shrink-0 mt-0.5 w-5 text-right" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>{i + 1}.</span>
            <span style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.6 }}>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ClosingSummaryBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div className="rounded-lg px-5 py-4" style={{ background: `linear-gradient(135deg, ${tokens.primaryColor}15 0%, ${tokens.secondaryColor}10 100%)`, border: `1px solid ${tokens.primaryColor}30`, borderRadius: tokens.borderRadius }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}>
          Summary
        </p>
        <p style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.7 }}>
          {block.content || "Closing summary text..."}
        </p>
      </div>
    </div>
  );
}

function RichTextBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div className="rounded px-3 py-2" style={{ border: `1px solid ${tokens.tableBorderColor}`, borderRadius: tokens.borderRadius }}>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "#9CA3AF", fontFamily: tokens.bodyFont }}>Rich Text</p>
        <p style={{ color: "#374151", fontFamily: tokens.bodyFont, fontSize: tokens.bodyMD, lineHeight: 1.7 }}>
          {block.content || "Rich text section..."}
        </p>
      </div>
    </div>
  );
}

// ─── Block renderer dispatcher ────────────────────────────────────────────────

function BlockRenderer({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  if (!block.settings.visible) {
    return (
      <div className="py-2 flex items-center gap-2 opacity-40">
        <EyeOff className="w-3 h-3" />
        <span className="text-xs italic text-muted-foreground">Hidden: {block.type}</span>
      </div>
    );
  }
  switch (block.type) {
    case "title": return <TitleBlock block={block} tokens={tokens} />;
    case "subtitle": return <SubtitleBlock block={block} tokens={tokens} />;
    case "paragraph": return <ParagraphBlock block={block} tokens={tokens} />;
    case "richText": return <RichTextBlock block={block} tokens={tokens} />;
    case "divider": return <DividerBlock block={block} tokens={tokens} />;
    case "spacer": return <SpacerBlock block={block} />;
    case "kpiSummary": return <KPISummaryBlock block={block} tokens={tokens} />;
    case "dataTable": return <DataTableBlock block={block} tokens={tokens} />;
    case "callout": return <CalloutBlock block={block} tokens={tokens} />;
    case "workLog": return <WorkLogBlock block={block} tokens={tokens} />;
    case "bulletList": return <BulletListBlock block={block} tokens={tokens} />;
    case "numberedList": return <NumberedListBlock block={block} tokens={tokens} />;
    case "closingSummary": return <ClosingSummaryBlock block={block} tokens={tokens} />;
    default: return <ParagraphBlock block={block} tokens={tokens} />;
  }
}

// ─── Left panel: block palette ────────────────────────────────────────────────

function BlockPalette({ onDragStart }: { onDragStart: (type: BlockType) => void }) {
  return (
    <div className="h-full flex flex-col bg-background border-r">
      <div className="px-3 py-2.5 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blocks</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Drag into the page</p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {PALETTE_GROUPS.map(group => {
          const groupItems = PALETTE.filter(p => p.group === group);
          return (
            <div key={group} className="mb-3">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {group}
              </p>
              <div className="px-2 space-y-0.5">
                {groupItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("source", "palette");
                        e.dataTransfer.setData("blockType", item.type);
                        e.dataTransfer.effectAllowed = "copy";
                        onDragStart(item.type);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-muted transition-colors select-none"
                      data-testid={`palette-block-${item.type}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-foreground">{item.label}</span>
                      <GripVertical className="w-3 h-3 text-muted-foreground/40 ml-auto shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Insertion zone ────────────────────────────────────────────────────────────

function InsertionZone({
  index,
  active,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  index: number;
  active: boolean;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
  onDragLeave: () => void;
}) {
  return (
    <div
      className="relative transition-all"
      style={{ height: active ? 32 : 8 }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={(e) => onDrop(e, index)}
      onDragLeave={onDragLeave}
    >
      {active && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-1">
          <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: "#C0392B" }} />
          <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: "#C0392B" }} />
          <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: "#C0392B" }} />
        </div>
      )}
    </div>
  );
}

// ─── Canvas block wrapper ──────────────────────────────────────────────────────

function CanvasBlock({
  block,
  tokens,
  selected,
  index,
  total,
  onSelect,
  onDelete,
  onMove,
  onDragStart,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
  selected: boolean;
  index: number;
  total: number;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onDragStart: (id: string) => void;
}) {
  return (
    <div
      className={`relative group rounded transition-all ${selected ? "ring-2 ring-offset-1" : "hover:ring-1 hover:ring-border"}`}
      style={selected ? { ringColor: "#C0392B" } : {}}
      onClick={onSelect}
      data-testid={`canvas-block-${block.id}`}
    >
      {/* Control bar */}
      <div className={`absolute -top-7 left-0 flex items-center gap-1 z-10 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData("source", "canvas");
            e.dataTransfer.setData("blockId", block.id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart(block.id);
          }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted cursor-grab active:cursor-grabbing border border-border"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground capitalize">{block.type}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onMove("up"); }}
          disabled={index === 0}
          className="p-0.5 rounded bg-muted border border-border hover:bg-accent disabled:opacity-30"
        >
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove("down"); }}
          disabled={index === total - 1}
          className="p-0.5 rounded bg-muted border border-border hover:bg-accent disabled:opacity-30"
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-0.5 rounded bg-muted border border-border hover:bg-destructive/10 hover:border-destructive/30"
          data-testid={`delete-block-${block.id}`}
        >
          <Trash2 className="w-3 h-3 text-destructive" />
        </button>
      </div>
      <BlockRenderer block={block} tokens={tokens} />
    </div>
  );
}

// ─── Right panel: properties ───────────────────────────────────────────────────

function PropertiesPanel({
  block,
  onUpdate,
}: {
  block: DocBlock | null;
  onUpdate: (id: string, changes: Partial<DocBlock>) => void;
}) {
  if (!block) {
    return (
      <div className="h-full flex flex-col bg-background border-l">
        <div className="px-3 py-2.5 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center px-4">
            Click a block on the page to edit its properties
          </p>
        </div>
      </div>
    );
  }

  const updateSettings = (s: Partial<BlockSettings>) => {
    onUpdate(block.id, { settings: { ...block.settings, ...s } });
  };

  const isTextBlock = ["title", "subtitle", "paragraph", "richText", "callout", "closingSummary"].includes(block.type);
  const isList = ["bulletList", "numberedList", "workLog"].includes(block.type);

  return (
    <div className="h-full flex flex-col bg-background border-l overflow-y-auto">
      <div className="px-3 py-2.5 border-b shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{block.type}</p>
      </div>

      <div className="flex-1 p-3 space-y-4 min-h-0 overflow-y-auto">
        {/* Visibility */}
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Visible</Label>
          <Switch
            checked={block.settings.visible}
            onCheckedChange={(v) => updateSettings({ visible: v })}
            data-testid="prop-visible"
          />
        </div>

        {/* Spacing */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Spacing</Label>
          <div className="flex gap-1">
            {(["compact", "normal", "relaxed"] as const).map(s => (
              <button
                key={s}
                onClick={() => updateSettings({ spacing: s })}
                className={`flex-1 py-1 text-[10px] rounded capitalize border transition-colors ${block.settings.spacing === s ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/30"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        {!["divider", "spacer"].includes(block.type) && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Alignment</Label>
            <div className="flex gap-1">
              {([
                { v: "left", Icon: AlignLeft },
                { v: "center", Icon: AlignCenter },
                { v: "right", Icon: AlignRight },
              ] as const).map(({ v, Icon }) => (
                <button
                  key={v}
                  onClick={() => updateSettings({ alignment: v })}
                  className={`flex-1 py-1 rounded border flex items-center justify-center transition-colors ${block.settings.alignment === v ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  <Icon className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content (text blocks) */}
        {isTextBlock && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Content</Label>
            <Textarea
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              className="text-xs min-h-[80px] resize-none"
              placeholder="Enter content..."
              data-testid="prop-content"
            />
          </div>
        )}

        {/* Block-specific: title/subtitle override label */}
        {(block.type === "title" || block.type === "subtitle") && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Label</Label>
            <Input
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              className="text-xs h-7"
              data-testid="prop-label"
            />
          </div>
        )}

        {/* Divider thickness */}
        {block.type === "divider" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Thickness (px)</Label>
            <div className="flex gap-1">
              {[1, 2, 4].map(t => (
                <button
                  key={t}
                  onClick={() => updateSettings({ dividerThickness: t })}
                  className={`flex-1 py-1 text-[10px] rounded border transition-colors ${block.settings.dividerThickness === t ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  {t}px
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spacer height */}
        {block.type === "spacer" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Height (px): {block.settings.height}</Label>
            <div className="flex gap-1">
              {[12, 24, 40, 64].map(h => (
                <button
                  key={h}
                  onClick={() => updateSettings({ height: h })}
                  className={`flex-1 py-1 text-[10px] rounded border transition-colors ${block.settings.height === h ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Table rows/cols */}
        {block.type === "dataTable" && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Table Title</Label>
              <Input
                value={block.content}
                onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                className="text-xs h-7"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Rows</Label>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateSettings({ rows: Math.max(1, (block.settings.rows ?? 4) - 1) })} className="p-1 rounded border hover:bg-muted"><ChevronDown className="w-3 h-3" /></button>
                  <span className="text-xs flex-1 text-center">{block.settings.rows ?? 4}</span>
                  <button onClick={() => updateSettings({ rows: (block.settings.rows ?? 4) + 1 })} className="p-1 rounded border hover:bg-muted"><ChevronUp className="w-3 h-3" /></button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Columns</Label>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateSettings({ cols: Math.max(1, (block.settings.cols ?? 3) - 1) })} className="p-1 rounded border hover:bg-muted"><ChevronDown className="w-3 h-3" /></button>
                  <span className="text-xs flex-1 text-center">{block.settings.cols ?? 3}</span>
                  <button onClick={() => updateSettings({ cols: Math.min(4, (block.settings.cols ?? 3) + 1) })} className="p-1 rounded border hover:bg-muted"><ChevronUp className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* KPI fields */}
        {block.type === "kpiSummary" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Section Label</Label>
            <Input
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              className="text-xs h-7 mb-2"
            />
            <Label className="text-xs text-muted-foreground mb-1.5 block">KPI Values</Label>
            <div className="space-y-1.5">
              {(block.settings.kpis ?? []).map((kpi, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    value={kpi.label}
                    onChange={(e) => {
                      const kpis = [...(block.settings.kpis ?? [])];
                      kpis[i] = { ...kpis[i], label: e.target.value };
                      updateSettings({ kpis });
                    }}
                    className="text-xs h-6 flex-1"
                    placeholder="Label"
                  />
                  <Input
                    value={kpi.value}
                    onChange={(e) => {
                      const kpis = [...(block.settings.kpis ?? [])];
                      kpis[i] = { ...kpis[i], value: e.target.value };
                      updateSettings({ kpis });
                    }}
                    className="text-xs h-6 w-20"
                    placeholder="Value"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List items */}
        {isList && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Section Title</Label>
            <Input
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              className="text-xs h-7 mb-2"
            />
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-muted-foreground">Items</Label>
              <button
                onClick={() => updateSettings({ items: [...(block.settings.items ?? []), "New item"] })}
                className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded border hover:bg-muted"
              >
                <Plus className="w-2.5 h-2.5" /> Add
              </button>
            </div>
            <div className="space-y-1">
              {(block.settings.items ?? []).map((item, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={item}
                    onChange={(e) => {
                      const items = [...(block.settings.items ?? [])];
                      items[i] = e.target.value;
                      updateSettings({ items });
                    }}
                    className="text-xs h-6 flex-1"
                  />
                  <button
                    onClick={() => {
                      const items = (block.settings.items ?? []).filter((_, j) => j !== i);
                      updateSettings({ items });
                    }}
                    className="p-1 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page canvas ──────────────────────────────────────────────────────────────

function PageCanvas({
  blocks,
  tokens,
  selectedId,
  dropTarget,
  onSelect,
  onDelete,
  onMove,
  onDragOver,
  onDrop,
  onDragLeave,
  onBlockDragStart,
}: {
  blocks: DocBlock[];
  tokens: typeof DEFAULT_THEME_TOKENS;
  selectedId: string | null;
  dropTarget: number | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
  onDragLeave: () => void;
  onBlockDragStart: (id: string) => void;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center py-8 px-4"
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Page shadow doc */}
      <div
        className="w-full max-w-[760px] bg-white shadow-xl rounded-sm"
        style={{ minHeight: "1100px" }}
      >
        {/* Header bar */}
        {tokens.showHeader && (
          <div className="px-12 py-3 flex items-center justify-between" style={{ backgroundColor: tokens.headerColor }}>
            <span className="text-xs font-semibold" style={{ color: tokens.headerTextColor, fontFamily: tokens.headingFont }}>
              {tokens.brandName}
            </span>
            <span className="text-[10px]" style={{ color: tokens.headerTextColor, opacity: 0.7, fontFamily: tokens.bodyFont }}>
              Bi-Weekly SEO Report
            </span>
          </div>
        )}

        {/* Document body */}
        <div className="px-12 pt-8 pb-12">
          <InsertionZone
            index={0}
            active={dropTarget === 0}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
          />
          {blocks.map((block, i) => (
            <div key={block.id}>
              <CanvasBlock
                block={block}
                tokens={tokens}
                selected={selectedId === block.id}
                index={i}
                total={blocks.length}
                onSelect={() => onSelect(block.id)}
                onDelete={() => onDelete(block.id)}
                onMove={(dir) => onMove(block.id, dir)}
                onDragStart={onBlockDragStart}
              />
              <InsertionZone
                index={i + 1}
                active={dropTarget === i + 1}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragLeave={onDragLeave}
              />
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg" style={{ borderColor: "#E2E8F0" }}>
              <p className="text-sm text-muted-foreground">Drag blocks from the left panel to start building</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {tokens.showFooter && (
          <div className="px-12 py-2 flex items-center justify-between border-t" style={{ backgroundColor: tokens.footerColor, borderColor: "#E2E8F0" }}>
            <span className="text-[10px]" style={{ color: tokens.footerTextColor, fontFamily: tokens.bodyFont }}>
              Confidential — {tokens.brandName}
            </span>
            {tokens.showPageNumbers && (
              <span className="text-[10px]" style={{ color: tokens.footerTextColor, fontFamily: tokens.bodyFont }}>1</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main WYSIWYG component ───────────────────────────────────────────────────

export default function BiweeklyWYSIWYG({ onBack }: { onBack: () => void }) {
  const [blocks, setBlocks] = useState<DocBlock[]>(DEFAULT_BIWEEKLY_BLOCKS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const dragRef = useRef<{ source: "palette" | "canvas"; blockType?: BlockType; blockId?: string } | null>(null);

  const { data: activeTheme } = useQuery<{ tokens: typeof DEFAULT_THEME_TOKENS }>({
    queryKey: ["/api/themes/active"],
  });
  const tokens = activeTheme?.tokens ?? DEFAULT_THEME_TOKENS;

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handlePaletteDragStart = useCallback((type: BlockType) => {
    dragRef.current = { source: "palette", blockType: type };
  }, []);

  const handleBlockDragStart = useCallback((id: string) => {
    dragRef.current = { source: "canvas", blockId: id };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDropTarget(idx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const info = dragRef.current;
    if (!info) return;

    if (info.source === "palette" && info.blockType) {
      const newBlock = createBlock(info.blockType);
      setBlocks(prev => {
        const next = [...prev];
        next.splice(idx, 0, newBlock);
        return next;
      });
      setSelectedId(newBlock.id);
    } else if (info.source === "canvas" && info.blockId) {
      setBlocks(prev => {
        const fromIdx = prev.findIndex(b => b.id === info.blockId);
        if (fromIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const targetIdx = idx > fromIdx ? idx - 1 : idx;
        next.splice(targetIdx, 0, moved);
        return next;
      });
    }

    dragRef.current = null;
    setDropTarget(null);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  // ── Block operations ──────────────────────────────────────────────────────

  const handleDelete = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedId(curr => (curr === id ? null : curr));
  }, []);

  const handleMove = useCallback((id: string, dir: "up" | "down") => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      if (dir === "up" && idx === 0) return prev;
      if (dir === "down" && idx === prev.length - 1) return prev;
      const next = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const handleUpdate = useCallback((id: string, changes: Partial<DocBlock>) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...changes } : b)));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="biweekly-wysiwyg-editor">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b bg-background">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="back-to-templates"
        >
          <ArrowLeft className="w-4 h-4" />
          Templates
        </button>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#C0392B" }} />
          <span className="text-sm font-medium">Bi-Weekly SEO Report</span>
          <span className="text-xs text-muted-foreground">— WYSIWYG Editor</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{blocks.length} blocks</span>
          <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: "#C0392B", color: "#fff" }}>
            Save Template
          </Button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: palette (220px) */}
        <div className="w-[220px] shrink-0 overflow-hidden">
          <BlockPalette onDragStart={handlePaletteDragStart} />
        </div>

        {/* Center: page canvas */}
        <PageCanvas
          blocks={blocks}
          tokens={tokens}
          selectedId={selectedId}
          dropTarget={dropTarget}
          onSelect={setSelectedId}
          onDelete={handleDelete}
          onMove={handleMove}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragLeave={handleDragLeave}
          onBlockDragStart={handleBlockDragStart}
        />

        {/* Right: properties (240px) */}
        <div className="w-[240px] shrink-0 overflow-hidden">
          <PropertiesPanel block={selectedBlock} onUpdate={handleUpdate} />
        </div>
      </div>
    </div>
  );
}
