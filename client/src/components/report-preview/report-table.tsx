import { useState } from "react";
import type { ReactNode } from "react";

const ACCENT = "#C0392B";

export const CR_PREFIX = "__cr__";

export function getCustomRows(edits: Record<string, string>, tableId: string): string[][] {
  try {
    const raw = edits[CR_PREFIX + tableId];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as string[][];
  } catch {
    return [];
  }
}

export function setCustomRows(
  tableId: string,
  rows: string[][],
  onEdit: (k: string, v: string) => void,
) {
  onEdit(CR_PREFIX + tableId, JSON.stringify(rows));
}

export const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  "Airtable":            { bg: "#FFF3D6", text: "#B45309" },
  "Asana":               { bg: "#FDEAEA", text: "#C0392B" },
  "Multi-source":        { bg: "#E6F4EA", text: "#1E7E34" },
  "GA4":                 { bg: "#E8F0FE", text: "#1967D2" },
  "GSC":                 { bg: "#E6F4EA", text: "#137333" },
  "GBP":                 { bg: "#FFF7ED", text: "#9A3412" },
  "CallRail":            { bg: "#F3E8FF", text: "#6D28D9" },
  "CTM":                 { bg: "#EDE9FE", text: "#5B21B6" },
  "Nimbata":             { bg: "#EDE9FE", text: "#5B21B6" },
  "SEMrush":             { bg: "#FEF9C3", text: "#854D0E" },
  "Ahrefs":              { bg: "#F0FDF4", text: "#166534" },
  "NSM":                 { bg: "#EEF2FF", text: "#4338CA" },
  "Screaming Frog":      { bg: "#F0FDF4", text: "#065F46" },
  "SF":                  { bg: "#F0FDF4", text: "#065F46" },
  "Manual entry needed": { bg: "#F9FAFB", text: "#9CA3AF" },
};

export function SourceBadge({ source }: { source: string }) {
  const colors = SOURCE_COLORS[source] ?? { bg: "#F3F4F6", text: "#6B7280" };
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: "8px",
        padding: "1px 5px",
        borderRadius: "4px",
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        wordBreak: "normal",
        display: "inline-block",
        letterSpacing: "0.02em",
      }}
    >
      {source}
    </span>
  );
}

function CustomRowCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
        style={{
          width: "100%",
          fontSize: "10px",
          fontFamily: "inherit",
          resize: "vertical",
          minHeight: 28,
          padding: "2px 4px",
          border: "1px solid #C0392B60",
          borderRadius: 3,
          outline: "none",
          background: "white",
          lineHeight: 1.4,
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{
        display: "block",
        minHeight: 16,
        cursor: "text",
        color: value ? "#111827" : "#9CA3AF",
        fontStyle: value ? "normal" : "italic",
        fontSize: "10px",
        lineHeight: 1.4,
      }}
    >
      {value || "Click to edit…"}
    </span>
  );
}

export function ReportTable({
  title,
  headers,
  rows,
  accent = ACCENT,
  fontSize = "10px",
  highlightRows,
  colWidths,
}: {
  title?: string;
  headers: string[];
  rows: ReactNode[][];
  accent?: string;
  fontSize?: string;
  highlightRows?: number[];
  colWidths?: (string | undefined)[];
}) {
  const highlightSet = new Set(highlightRows ?? []);
  return (
    <div
      style={{
        border: `1px solid ${accent}28`,
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 12,
        backgroundColor: "#FFFDFB",
      }}
    >
      {title && (
        <div
          style={{
            padding: "5px 10px",
            fontWeight: 700,
            fontSize: "9px",
            backgroundColor: `${accent}12`,
            color: accent,
            borderBottom: `1px solid ${accent}20`,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize, tableLayout: colWidths ? "fixed" : undefined }}>
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr style={{ backgroundColor: `${accent}0D` }}>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: "5px 8px",
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: "9px",
                  color: accent,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  borderBottom: `1px solid ${accent}20`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                backgroundColor: highlightSet.has(ri)
                  ? "#FFFBEB"
                  : ri % 2 === 1
                  ? "#FBF8F7"
                  : "white",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #F3EDED",
                    verticalAlign: "top",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AddableReportTable({
  tableId,
  headers,
  sourceRows,
  edits,
  onEdit,
  exportMode = false,
  accent = ACCENT,
  fontSize = "10px",
  title,
}: {
  tableId: string;
  headers: string[];
  sourceRows: ReactNode[][];
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  exportMode?: boolean;
  accent?: string;
  fontSize?: string;
  title?: string;
}) {
  const customRows = getCustomRows(edits, tableId);
  const colCount = headers.length;

  function addRow() {
    const next = [...customRows, Array(colCount).fill("")];
    setCustomRows(tableId, next, onEdit);
  }

  function updateCell(ri: number, ci: number, val: string) {
    const next = customRows.map((r, r_i) =>
      r_i === ri ? r.map((c, c_i) => (c_i === ci ? val : c)) : r,
    );
    setCustomRows(tableId, next, onEdit);
  }

  function deleteRow(ri: number) {
    const next = customRows.filter((_, r_i) => r_i !== ri);
    setCustomRows(tableId, next, onEdit);
  }

  const customNodeRows: ReactNode[][] = customRows.map((row, ri) =>
    row.map((cell, ci) => {
      const isLast = ci === colCount - 1;
      if (exportMode) {
        return <span key={ci}>{cell}</span>;
      }
      return (
        <span
          key={ci}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <span style={{ flex: 1 }}>
            <CustomRowCell value={cell} onChange={v => updateCell(ri, ci, v)} />
          </span>
          {isLast && (
            <button
              onClick={() => deleteRow(ri)}
              title="Delete row"
              data-testid={`button-delete-customrow-${tableId}-${ri}`}
              style={{
                flexShrink: 0,
                color: "#EF4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: "0 2px",
                borderRadius: 3,
              }}
            >
              ×
            </button>
          )}
        </span>
      );
    }),
  );

  const allRows = [...sourceRows, ...customNodeRows];
  const highlightRows = customRows.map((_, i) => sourceRows.length + i);

  return (
    <div>
      <ReportTable
        title={title}
        headers={headers}
        rows={allRows}
        accent={accent}
        fontSize={fontSize}
        highlightRows={highlightRows}
      />
      {!exportMode && (
        <button
          onClick={addRow}
          data-testid={`button-add-row-${tableId}`}
          style={{
            fontSize: "10px",
            color: "#6B7280",
            marginTop: -8,
            marginBottom: 12,
            background: "none",
            border: "1px dashed #D1D5DB",
            borderRadius: 4,
            padding: "2px 10px",
            cursor: "pointer",
            display: "block",
          }}
        >
          + Add row
        </button>
      )}
    </div>
  );
}
