import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_THEME_TOKENS } from "@shared/schema";
import type { DocBlock } from "@/components/biweekly-wysiwyg";
import { DEFAULT_BIWEEKLY_BLOCKS } from "@/components/biweekly-wysiwyg";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";

// ─── Spacing helpers ──────────────────────────────────────────────────────────

const SPACING_PY: Record<string, string> = {
  compact: "py-2",
  normal: "py-4",
  relaxed: "py-7",
};

// ─── Render newline-separated text as proper line breaks ─────────────────────

function RenderLines({ text }: { text: string }) {
  if (!text) return <span className="text-gray-300 italic">—</span>;
  const lines = text.split("\n").filter(l => l.trim() !== "" || true);
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// ─── Source label (Bi-Weekly v2: subtle gray, not colored pill) ──────────────

function SourceChip({ source }: { source: string }) {
  return (
    <span
      className="inline-block text-[9px] text-muted-foreground mr-2 mt-1"
      style={{ fontStyle: "italic" }}
    >
      Source: {source}
    </span>
  );
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  editKey: string;
  edits?: Record<string, string>;
  onEdit?: (key: string, val: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  sources?: string[];
  style?: React.CSSProperties;
  className?: string;
  multiline?: boolean;
}

function EditableCell({
  value,
  editKey,
  edits,
  onEdit,
  readOnly = false,
  placeholder = "Click to edit…",
  sources = [],
  style,
  className,
  multiline = true,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const displayVal = edits?.[editKey] !== undefined ? edits[editKey] : value;

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const uniqueSources = Array.from(new Set(sources)).filter(Boolean);

  if (readOnly || !onEdit) {
    return (
      <div style={style} className={className}>
        <RenderLines text={displayVal} />
        {uniqueSources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {uniqueSources.map(s => <SourceChip key={s} source={s} />)}
          </div>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div style={style} className={className}>
        <textarea
          ref={taRef}
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={() => {
            onEdit(editKey, localVal);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (!multiline && e.key === "Enter") {
              e.preventDefault();
              onEdit(editKey, localVal);
              setEditing(false);
            }
            if (e.key === "Escape") {
              setEditing(false);
            }
          }}
          rows={Math.max(2, (localVal.match(/\n/g) ?? []).length + 2)}
          className="w-full resize-none border border-blue-300 rounded px-2 py-1 bg-blue-50 text-xs outline-none ring-1 ring-blue-400"
          style={{ fontFamily: "inherit", fontSize: "inherit", lineHeight: 1.5, color: "#1e293b" }}
          placeholder={placeholder}
        />
        {uniqueSources.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {uniqueSources.map(s => <SourceChip key={s} source={s} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={`${className ?? ""} cursor-text rounded group relative`}
      onClick={() => {
        setLocalVal(displayVal);
        setEditing(true);
      }}
      title={`${editKey} — click to edit`}
      data-testid={`editable-${editKey}`}
    >
      <div className="group-hover:bg-blue-50/40 rounded px-0.5 transition-colors">
        {displayVal ? (
          <RenderLines text={displayVal} />
        ) : (
          <span className="text-gray-300 italic text-[11px]">{placeholder}</span>
        )}
      </div>
      <span className="absolute top-0 right-0 opacity-0 group-hover:opacity-60 text-blue-400 text-[10px] pointer-events-none select-none pr-0.5">
        ✎
      </span>
      {uniqueSources.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-0.5">
          {uniqueSources.map(s => <SourceChip key={s} source={s} />)}
        </div>
      )}
    </div>
  );
}

// ─── Block renderers ──────────────────────────────────────────────────────────

interface BlockProps {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
  edits?: Record<string, string>;
  onEdit?: (key: string, val: string) => void;
  printMode?: boolean;
}

function TitleBlock({ block, tokens }: BlockProps) {
  const align =
    block.settings.alignment === "center" ? "text-center"
    : block.settings.alignment === "right" ? "text-right"
    : "text-left";
  return (
    <div className={`${SPACING_PY[block.settings.spacing]} ${align}`}>
      <h1
        style={{
          color: tokens.primaryColor,
          fontFamily: tokens.headingFont,
          fontSize: tokens.headingXL,
          fontWeight: tokens.headingWeight,
          lineHeight: 1.2,
        }}
      >
        {block.content || "Title"}
      </h1>
    </div>
  );
}

function SubtitleBlock({ block, tokens }: BlockProps) {
  const align =
    block.settings.alignment === "center" ? "text-center"
    : block.settings.alignment === "right" ? "text-right"
    : "text-left";
  return (
    <div className={`${SPACING_PY[block.settings.spacing]} ${align}`}>
      <p
        style={{
          color: tokens.primaryColor,
          fontFamily: tokens.headingFont,
          fontSize: tokens.headingMD,
          fontWeight: 700,
        }}
      >
        {block.content || "Subtitle"}
      </p>
    </div>
  );
}

function ParagraphBlock({ block, tokens, edits, onEdit }: BlockProps) {
  const editKey = `${block.id}_content`;
  const displayVal = edits?.[editKey] !== undefined ? edits[editKey] : block.content;

  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <EditableCell
        value={block.content}
        editKey={editKey}
        edits={edits}
        onEdit={onEdit}
        style={{
          color: tokens.tableBodyText,
          fontFamily: tokens.bodyFont,
          fontSize: tokens.bodyMD,
          lineHeight: 1.7,
        }}
      />
    </div>
  );
}

function DividerBlock({ block, tokens }: BlockProps) {
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <hr style={{ border: "none", borderTop: `${block.settings.dividerThickness ?? 1}px solid ${tokens.tableBorderColor}` }} />
    </div>
  );
}

function SpacerBlock({ block }: BlockProps) {
  return <div style={{ height: block.settings.height ?? 24 }} />;
}

function CalloutBlock({ block, tokens, edits, onEdit, printMode }: BlockProps) {
  const editKey = `${block.id}_content`;
  const resolvedContent = edits?.[editKey] !== undefined ? edits[editKey] : block.content;
  const isEmpty = !resolvedContent || resolvedContent.trim() === "";

  // In print/export mode, hide the entire block when empty
  if (printMode && isEmpty) return null;

  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div
        className="px-4 py-3"
        style={{
          backgroundColor: tokens.calloutBg,
          borderLeft: `4px solid ${tokens.calloutBorderColor}`,
          borderRadius: `0 ${tokens.borderRadius}px ${tokens.borderRadius}px 0`,
        }}
      >
        <EditableCell
          value={block.content}
          editKey={editKey}
          edits={edits}
          onEdit={onEdit}
          style={{
            color: tokens.tableBodyText,
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyMD,
            lineHeight: 1.6,
          }}
          placeholder="Add optional commentary about this period (will be hidden on export when empty)…"
        />
      </div>
    </div>
  );
}

const BLOCK_TO_SECTION: Record<string, string> = {
  "blk-purpose":  "bw_purpose",
  "blk-closing":  "bw_partnership",
};

function BulletListBlock({ block, tokens, edits, onEdit }: BlockProps) {
  const rawItems: string[] = block.settings.items ?? [];
  const sectionId = BLOCK_TO_SECTION[block.id] ?? block.id;

  const itemKey = (i: number) => `${sectionId}_bullet_${i}`;

  const getItemVal = (i: number): string => {
    const key = itemKey(i);
    return edits?.[key] !== undefined ? edits[key] : rawItems[i] ?? "";
  };

  const [extraItems, setExtraItems] = useState<string[]>(() => {
    const extras: string[] = [];
    let i = rawItems.length;
    while (edits?.[itemKey(i)] !== undefined) {
      extras.push(edits[itemKey(i)]);
      i++;
    }
    return extras;
  });

  const totalCount = rawItems.length + extraItems.length;

  function handleAddItem() {
    const newIndex = totalCount;
    setExtraItems(prev => [...prev, ""]);
    if (onEdit) onEdit(itemKey(newIndex), "");
  }

  function handleRemoveExtra(extraIdx: number) {
    const absIdx = rawItems.length + extraIdx;
    const newExtras = extraItems.filter((_, i) => i !== extraIdx);
    setExtraItems(newExtras);
    if (onEdit) {
      onEdit(itemKey(absIdx), "__DELETED__");
    }
  }

  const allItems = [
    ...Array.from({ length: rawItems.length }, (_, i) => ({ idx: i, val: getItemVal(i), isExtra: false })),
    ...extraItems.map((_, ei) => {
      const absIdx = rawItems.length + ei;
      return { idx: absIdx, val: edits?.[itemKey(absIdx)] ?? "", isExtra: true, extraIdx: ei };
    }),
  ].filter(item => edits?.[itemKey(item.idx)] !== "__DELETED__");

  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p
          className="mb-1.5 text-xs font-semibold uppercase tracking-wider"
          style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}
        >
          {block.content}
        </p>
      )}
      <ul className="space-y-1 pl-3">
        {allItems.map(({ idx, val, isExtra, extraIdx }) => (
          <li key={idx} className="flex items-start gap-2 group">
            <span
              className="mt-1.5 shrink-0"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: tokens.primaryColor,
                display: "inline-block",
              }}
            />
            <EditableCell
              value={val}
              editKey={itemKey(idx)}
              edits={edits}
              onEdit={onEdit}
              multiline={false}
              placeholder="Enter item text…"
              style={{
                flex: 1,
                color: tokens.tableBodyText,
                fontFamily: tokens.bodyFont,
                fontSize: tokens.bodyMD,
                lineHeight: 1.6,
              }}
            />
            {isExtra && onEdit && (
              <button
                onClick={() => handleRemoveExtra(extraIdx as number)}
                className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-red-400 shrink-0 mt-0.5"
                title="Remove item"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {onEdit && (
        <button
          onClick={handleAddItem}
          className="mt-1.5 ml-3 flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 opacity-60 hover:opacity-100 transition-opacity"
          data-testid={`add-item-${block.id}`}
        >
          <Plus className="w-3 h-3" /> Add item
        </button>
      )}
    </div>
  );
}

function KPISummaryBlock({ block, tokens }: BlockProps) {
  const kpis = block.settings.kpis ?? [];
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}
        >
          {block.content}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="rounded px-3 py-2 flex items-center justify-between"
            style={{
              border: `1px solid ${tokens.tableBorderColor}`,
              backgroundColor: tokens.cardBg,
              borderRadius: tokens.borderRadius,
            }}
          >
            <span style={{ color: tokens.tableBodyText, fontFamily: tokens.bodyFont, fontSize: tokens.bodySM }}>
              {kpi.label}
            </span>
            <div className="flex items-center gap-1">
              <span style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont, fontWeight: 700, fontSize: tokens.bodyMD }}>
                {kpi.value}
              </span>
              <span style={{ fontSize: 10, color: kpi.trend === "up" ? "#16a34a" : kpi.trend === "down" ? "#dc2626" : "#9CA3AF" }}>
                {kpi.trend === "up" ? "↑" : kpi.trend === "down" ? "↓" : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusCell({ value }: { value: string }) {
  // Strip any leading emoji and whitespace to find the direction keyword
  const stripped = value.replace(/^[\u2705\u274C\u26A0\uFE0F\s]+/, "").trim();
  const lower = stripped.toLowerCase();
  const isAhead = lower.startsWith("ahead") || lower.startsWith("on track");
  const isBehind = lower.startsWith("behind");
  const iconColor = isAhead ? "#22c55e" : isBehind ? "#ef4444" : undefined;
  const Icon = isAhead ? TrendingUp : isBehind ? TrendingDown : null;
  return (
    <span className="inline-flex items-center gap-1">
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: iconColor }} />}
      <span>{value}</span>
    </span>
  );
}

interface DataTableBlockProps extends BlockProps {
  workLogSectionId?: string;
}

function DataTableBlock({ block, tokens, edits, onEdit, workLogSectionId, printMode }: DataTableBlockProps) {
  const colLabels = block.settings.colHeaders ?? ["Column 1", "Column 2", "Column 3"];
  const tableRows = block.settings.tableRows ?? [];
  const itemsWithSources: Array<{ did: Array<{ text: string; source?: string }>; next: Array<{ text: string; source?: string }> }> =
    block.settings.itemsWithSources ?? [];

  const isProgressTable = workLogSectionId === "bw_progress";

  const getEditKeyForCell = (ri: number, ci: number): string => {
    if (isProgressTable && ci === 1) return `${workLogSectionId}_worklog_${ri}_did`;
    if (isProgressTable && ci === 2) return `${workLogSectionId}_worklog_${ri}_next`;
    return `${block.id}_row_${ri}_col_${ci}`;
  };

  const isEditableCell = (ci: number): boolean => {
    if (!onEdit) return false;
    if (isProgressTable) return ci === 1 || ci === 2;
    // The NSM Status column (col 4 of blk-nsm) is auto-generated from data; not user-editable.
    if (block.id === "blk-nsm" && ci === 4) return false;
    return ci > 0;
  };

  const getSourcesForCell = (ri: number, ci: number): string[] => {
    if (!itemsWithSources[ri]) return [];
    const rowSources = ci === 1 ? itemsWithSources[ri].did : ci === 2 ? itemsWithSources[ri].next : [];
    return Array.from(new Set(rowSources.map(i => i.source).filter(Boolean) as string[]));
  };

  const [customRows, setCustomRows] = useState<string[][]>(() => {
    const crKey = `__cr__${workLogSectionId ?? block.id}_progress`;
    if (edits?.[crKey]) {
      try { return JSON.parse(edits[crKey]); } catch { return []; }
    }
    return [];
  });

  function handleAddRow() {
    const newRow = Array(colLabels.length).fill("");
    const updated = [...customRows, newRow];
    setCustomRows(updated);
    if (onEdit && workLogSectionId) {
      onEdit(`__cr__${workLogSectionId}_progress`, JSON.stringify(updated));
    }
  }

  function handleRemoveCustomRow(idx: number) {
    const updated = customRows.filter((_, i) => i !== idx);
    setCustomRows(updated);
    if (onEdit && workLogSectionId) {
      onEdit(`__cr__${workLogSectionId}_progress`, JSON.stringify(updated));
    }
  }

  function handleCustomCellEdit(rowIdx: number, colIdx: number, val: string) {
    const updated = customRows.map((row, ri) =>
      ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? val : cell)) : row
    );
    setCustomRows(updated);
    if (onEdit && workLogSectionId) {
      onEdit(`__cr__${workLogSectionId}_progress`, JSON.stringify(updated));
    }
  }

  const totalRows = tableRows.length + customRows.length;

  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {block.content && (
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}
        >
          {block.content}
        </p>
      )}
      <div
        className="overflow-hidden"
        style={{
          border: `1px solid ${tokens.tableBorderColor}`,
          borderRadius: tokens.borderRadius,
        }}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {colLabels.map((label, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold"
                  style={{
                    backgroundColor: tokens.tableHeaderBg,
                    color: tokens.tableHeaderText,
                    fontFamily: tokens.headingFont,
                    fontSize: tokens.bodySM,
                    width: i === 0 ? "18%" : undefined,
                  }}
                >
                  {label}
                </th>
              ))}
              {isProgressTable && onEdit && !printMode && (
                <th
                  style={{ backgroundColor: tokens.tableHeaderBg, width: "28px" }}
                />
              )}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr
                key={ri}
                style={{ backgroundColor: ri % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}
              >
                {row.map((cell, ci) => {
                  const editKey = getEditKeyForCell(ri, ci);
                  const cellSources = getSourcesForCell(ri, ci);
                  const editable = isEditableCell(ci);
                  return (
                    <td
                      key={ci}
                      className="px-3 py-2 border-t align-top"
                      style={{
                        color: tokens.tableBodyText,
                        fontFamily: tokens.bodyFont,
                        fontSize: tokens.bodySM,
                        borderColor: tokens.tableBorderColor,
                        lineHeight: 1.5,
                        verticalAlign: "top",
                      }}
                    >
                      {editable ? (
                        <EditableCell
                          value={cell}
                          editKey={editKey}
                          edits={edits}
                          onEdit={onEdit}
                          sources={cellSources}
                          multiline={true}
                        />
                      ) : (
                        <>
                          {block.id === "blk-nsm" && ci === 4 ? (
                            <StatusCell value={cell} />
                          ) : (
                            <RenderLines text={cell} />
                          )}
                          {cellSources.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-0.5">
                              {cellSources.map(s => <SourceChip key={s} source={s} />)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
                {isProgressTable && onEdit && !printMode && (
                  <td
                    className="px-1 py-2 border-t align-top"
                    style={{ borderColor: tokens.tableBorderColor, width: "28px" }}
                  />
                )}
              </tr>
            ))}

            {customRows.map((row, cri) => {
              const absRi = tableRows.length + cri;
              return (
                <tr
                  key={`custom-${cri}`}
                  style={{ backgroundColor: absRi % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}
                  className="ring-1 ring-inset ring-blue-200"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 border-t align-top"
                      style={{
                        color: tokens.tableBodyText,
                        fontFamily: tokens.bodyFont,
                        fontSize: tokens.bodySM,
                        borderColor: tokens.tableBorderColor,
                        lineHeight: 1.5,
                      }}
                    >
                      {onEdit ? (
                        <EditableCell
                          value={cell}
                          editKey={`__custom_${block.id}_${cri}_${ci}`}
                          edits={undefined}
                          onEdit={(_, val) => handleCustomCellEdit(cri, ci, val)}
                          placeholder={ci === 0 ? "Area…" : ci === 1 ? "What we did…" : "What's next…"}
                          multiline={ci > 0}
                        />
                      ) : (
                        <RenderLines text={cell} />
                      )}
                    </td>
                  ))}
                  {isProgressTable && onEdit && !printMode && (
                    <td
                      className="px-1 py-2 border-t align-middle"
                      style={{ borderColor: tokens.tableBorderColor }}
                    >
                      <button
                        onClick={() => handleRemoveCustomRow(cri)}
                        className="text-red-400 hover:text-red-600 opacity-60 hover:opacity-100"
                        title="Remove row"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {totalRows === 0 && (
              <tr>
                <td
                  colSpan={colLabels.length}
                  className="px-3 py-3 text-center italic"
                  style={{ color: "#9CA3AF", fontSize: tokens.bodySM }}
                >
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isProgressTable && onEdit && !printMode && (
        <button
          onClick={handleAddRow}
          className="mt-2 flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 opacity-60 hover:opacity-100 transition-opacity"
          data-testid="add-progress-row"
        >
          <Plus className="w-3 h-3" /> Add row
        </button>
      )}
    </div>
  );
}

function ClosingSummaryBlock({ block, tokens, edits, onEdit }: BlockProps) {
  const editKey = `${block.id}_content`;
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <div
        className="rounded-lg px-5 py-4"
        style={{
          background: `linear-gradient(135deg, ${tokens.primaryColor}15 0%, ${tokens.secondaryColor}10 100%)`,
          border: `1px solid ${tokens.primaryColor}30`,
          borderRadius: tokens.borderRadius,
        }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: tokens.primaryColor, fontFamily: tokens.headingFont }}
        >
          Summary
        </p>
        <EditableCell
          value={block.content}
          editKey={editKey}
          edits={edits}
          onEdit={onEdit}
          style={{
            color: tokens.tableBodyText,
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyMD,
            lineHeight: 1.7,
          }}
          placeholder="Closing summary text…"
        />
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  tokens,
  edits,
  onEdit,
  printMode,
}: BlockProps & { printMode?: boolean }) {
  if (!block.settings.visible) return null;
  const props = { block, tokens, edits, onEdit, printMode };
  switch (block.type) {
    case "title":         return <TitleBlock {...props} />;
    case "subtitle":      return <SubtitleBlock {...props} />;
    case "paragraph":     return <ParagraphBlock {...props} />;
    case "divider":       return <DividerBlock {...props} />;
    case "spacer":        return <SpacerBlock {...props} />;
    case "kpiSummary":    return <KPISummaryBlock {...props} />;
    case "dataTable":
      return (
        <DataTableBlock
          {...props}
          workLogSectionId={block.id === "blk-progress" ? "bw_progress" : undefined}
        />
      );
    case "callout":       return <CalloutBlock {...props} />;
    case "bulletList":    return <BulletListBlock {...props} />;
    case "closingSummary": return <ClosingSummaryBlock {...props} />;
    default:              return <ParagraphBlock {...props} />;
  }
}

// ─── Data hydration ───────────────────────────────────────────────────────────

function extractSources(items: any[]): Array<{ text: string; source?: string }> {
  return (items ?? []).map((i: any) =>
    typeof i === "string" ? { text: i } : { text: i.text ?? "", source: i.source }
  );
}

function hydrateBlocks(blocks: DocBlock[], report: any): DocBlock[] {
  const sections: any[] = report?.sections ?? [];
  const pulseSection    = sections.find((s: any) => s.id === "bw_pulse");
  const progressSection = sections.find((s: any) => s.id === "bw_progress");
  const purposeSection  = sections.find((s: any) => s.id === "bw_purpose");
  const partnerSection  = sections.find((s: any) => s.id === "bw_partnership");

  return blocks.map((block): DocBlock => {
    switch (block.id) {

      case "blk-title":
        return {
          ...block,
          content: report?.client_name
            ? `SEO Bi-weekly Meeting: ${report.client_name}`
            : block.content,
        };

      case "blk-meta":
        return {
          ...block,
          content: [
            `Reporting Period: ${report?.reportingWindow ?? "[Date Range]"}`,
            `Prepared by: ${report?.preparedBy ?? "[Your Name]"}`,
            `Reporting Date: ${report?.date ?? "[Date]"}`,
          ].join("\n"),
        };

      case "blk-purpose":
        if (purposeSection?.bullets?.length) {
          return {
            ...block,
            settings: { ...block.settings, items: purposeSection.bullets as string[] },
          };
        }
        return block;

      case "blk-nsm": {
        const metrics: any[] = pulseSection?.metrics ?? [];

        // Detect Bi-Weekly v2 NSM-missing warning case.
        const warningMetric = metrics.find((m: any) => typeof m.label === "string" && m.label.startsWith("⚠"));
        if (warningMetric) {
          return {
            ...block,
            content: warningMetric.label,
            settings: {
              ...block.settings,
              colHeaders: ["Warning"],
              tableRows: [[warningMetric.current ?? "NSM data could not be loaded."]],
              cols: 1,
              rows: 1,
            },
          };
        }

        // Bi-Weekly v2 normal case: 2 rows, each metric.current is "Goal | Actual | % | Status".
        const parseRow = (m: any): string[] => {
          const parts = String(m.current ?? "").split("|").map(s => s.trim());
          const [goal = "—", actual = "—", pct = "—", status = "—"] = parts;
          return [m.label, goal, actual, pct, status];
        };

        if (metrics.length > 0) {
          const tableRows = metrics.map(parseRow);
          return {
            ...block,
            content: "NSM Goals",
            settings: {
              ...block.settings,
              colHeaders: ["Metric", "Goal", "Actual", "%", "Status"],
              tableRows,
              cols: 5,
              rows: tableRows.length,
            },
          };
        }

        return block;
      }

      case "blk-progress": {
        const workLog: any[] = progressSection?.workLog ?? [];
        if (workLog.length > 0) {
          const tableRows: string[][] = workLog.map((row: any) => {
            const didText =
              row.whatWeDid ||
              (Array.isArray(row.items)
                ? row.items.map((i: any) => (typeof i === "string" ? i : i.text)).filter(Boolean).join("\n")
                : "") ||
              "—";
            const nextText =
              row.whatsNext ||
              (Array.isArray(row.nextItems)
                ? row.nextItems.map((i: any) => (typeof i === "string" ? i : i.text)).filter(Boolean).join("\n")
                : "") ||
              "—";
            return [row.area ?? "—", didText, nextText];
          });

          const itemsWithSources = workLog.map((row: any) => ({
            did:  extractSources(row.items ?? []),
            next: extractSources(row.nextItemsRich ?? row.nextItems ?? []),
          }));

          return {
            ...block,
            content: "Progress & Quick Wins",
            settings: {
              ...block.settings,
              colHeaders: ["Area", "What We Did / Learned", "What's Next"],
              tableRows,
              itemsWithSources,
              cols: 3,
              rows: tableRows.length,
            },
          };
        }
        return block;
      }

      case "blk-closing":
        if (partnerSection?.bullets?.length) {
          return {
            ...block,
            settings: { ...block.settings, items: partnerSection.bullets as string[] },
          };
        }
        return block;

      default:
        return block;
    }
  });
}

// ─── Main renderer component ──────────────────────────────────────────────────

interface BiweeklyReportRendererProps {
  report: any;
  printMode?: boolean;
  edits?: Record<string, string>;
  onEdit?: (key: string, val: string) => void;
}

export function BiweeklyReportRenderer({ report, printMode, edits, onEdit }: BiweeklyReportRendererProps) {
  const { data: savedTemplate } = useQuery<{ slides: DocBlock[] } | null>({
    queryKey: ["/api/template-structures/biweekly-docx"],
    retry: false,
  });

  const { data: activeTheme } = useQuery<{ id: number; tokens: typeof DEFAULT_THEME_TOKENS }>({
    queryKey: ["/api/themes/active"],
  });

  const tokens = activeTheme?.tokens ?? DEFAULT_THEME_TOKENS;

  const templateBlocks = useMemo((): DocBlock[] => {
    const saved = savedTemplate?.slides;
    if (Array.isArray(saved) && saved.length > 0 && saved[0] && typeof (saved[0] as any).settings === "object") {
      return saved as DocBlock[];
    }
    return DEFAULT_BIWEEKLY_BLOCKS;
  }, [savedTemplate]);

  const hydratedBlocks = useMemo(
    () => hydrateBlocks(templateBlocks, report),
    [templateBlocks, report]
  );

  const docPage = (
    <div
      className="w-full max-w-[760px] bg-white shadow-xl rounded-sm"
      style={{ minHeight: "1100px" }}
      data-report-root
      data-testid="bw-report-renderer"
    >
      {tokens.showHeader && (
        <div
          className="px-12 py-2.5 flex items-center justify-between"
          style={{ backgroundColor: tokens.headerColor }}
        >
          {tokens.logoUrl ? (
            <img
              src={tokens.logoUrl}
              alt={tokens.brandName}
              className="object-contain"
              style={{ maxHeight: 28, maxWidth: 120 }}
            />
          ) : (
            <span
              style={{
                color: tokens.headerTextColor,
                fontFamily: tokens.headingFont,
                fontSize: 13,
                fontWeight: tokens.headerFontWeight ?? 600,
              }}
            >
              {tokens.brandName}
            </span>
          )}
          <span
            style={{
              color: tokens.headerTextColor,
              fontFamily: tokens.reportLabelFontFamily ?? tokens.bodyFont,
              fontSize: tokens.reportLabelFontSize ?? 11,
              fontWeight: tokens.reportLabelFontWeight ?? 400,
            }}
          >
            {tokens.headerReportLabel ?? "Bi-Weekly SEO Report"}
          </span>
        </div>
      )}

      {!printMode && onEdit && (
        <div className="px-12 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <span className="text-[10px] text-blue-600 font-medium">
            ✎ Click any cell or text to edit inline
          </span>
        </div>
      )}

      <div className="px-12 pt-8 pb-12 bg-white">
        {hydratedBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            tokens={tokens}
            edits={edits}
            onEdit={onEdit}
            printMode={printMode}
          />
        ))}
      </div>
    </div>
  );

  if (printMode) {
    return (
      <div style={{ background: "white", margin: 0, padding: 0 }}>
        <style>{`
          html, body { margin: 0; padding: 0; background: white; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          button { display: none !important; }
        `}</style>
        {docPage}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center py-8 px-4 overflow-y-auto">
      {docPage}
    </div>
  );
}
