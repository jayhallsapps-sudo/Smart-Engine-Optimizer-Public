import type { ReactNode } from "react";

const ACCENT = "#C0392B";

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
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        display: "inline-block",
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {source}
    </span>
  );
}

export function ReportTable({
  title,
  headers,
  rows,
  accent = ACCENT,
  fontSize = "10px",
}: {
  title?: string;
  headers: string[];
  rows: ReactNode[][];
  accent?: string;
  fontSize?: string;
}) {
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
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize }}>
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
            <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? "#FBF8F7" : "white" }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #F3EDED",
                    verticalAlign: "top",
                    lineHeight: 1.4,
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
