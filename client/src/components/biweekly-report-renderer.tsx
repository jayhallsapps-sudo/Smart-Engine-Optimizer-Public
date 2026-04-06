import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_THEME_TOKENS } from "@shared/schema";
import type { DocBlock } from "@/components/biweekly-wysiwyg";
import { DEFAULT_BIWEEKLY_BLOCKS } from "@/components/biweekly-wysiwyg";

// ─── Spacing helpers ──────────────────────────────────────────────────────────

const SPACING_PY: Record<string, string> = {
  compact: "py-2",
  normal: "py-4",
  relaxed: "py-7",
};

// ─── Block renderers (read-only, same visual style as template editor) ─────────

function TitleBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const align =
    block.settings.alignment === "center"
      ? "text-center"
      : block.settings.alignment === "right"
      ? "text-right"
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

function SubtitleBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const align =
    block.settings.alignment === "center"
      ? "text-center"
      : block.settings.alignment === "right"
      ? "text-right"
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

function ParagraphBlock({ block, tokens }: { block: DocBlock; tokens: typeof DEFAULT_THEME_TOKENS }) {
  const lines = block.content.split("\n");
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      {lines.map((line, i) => (
        <p
          key={i}
          style={{
            color: tokens.tableBodyText,
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyMD,
            lineHeight: 1.7,
            marginBottom: i < lines.length - 1 ? 2 : 0,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function DividerBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
  const thickness = block.settings.dividerThickness ?? 1;
  return (
    <div className={SPACING_PY[block.settings.spacing]}>
      <hr style={{ border: "none", borderTop: `${thickness}px solid ${tokens.tableBorderColor}` }} />
    </div>
  );
}

function SpacerBlock({ block }: { block: DocBlock }) {
  return <div style={{ height: block.settings.height ?? 24 }} />;
}

function DataTableBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
  const colLabels = block.settings.colHeaders ?? ["Column 1", "Column 2", "Column 3"];
  const tableRows = block.settings.tableRows ?? [];

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
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr
                key={ri}
                style={{ backgroundColor: ri % 2 === 1 ? tokens.tableAltRowBg : tokens.cardBg }}
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
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {tableRows.length === 0 && (
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
    </div>
  );
}

function CalloutBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
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
        <p
          style={{
            color: tokens.calloutText,
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyMD,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {block.content || "Callout text..."}
        </p>
      </div>
    </div>
  );
}

function BulletListBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
  const items = block.settings.items ?? [];
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
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
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
            <span
              style={{
                color: tokens.tableBodyText,
                fontFamily: tokens.bodyFont,
                fontSize: tokens.bodyMD,
                lineHeight: 1.6,
              }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KPISummaryBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
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

function ClosingSummaryBlock({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
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
        <p
          style={{
            color: tokens.tableBodyText,
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyMD,
            lineHeight: 1.7,
          }}
        >
          {block.content || "Closing summary text..."}
        </p>
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  tokens,
}: {
  block: DocBlock;
  tokens: typeof DEFAULT_THEME_TOKENS;
}) {
  if (!block.settings.visible) return null;
  switch (block.type) {
    case "title":         return <TitleBlock block={block} tokens={tokens} />;
    case "subtitle":      return <SubtitleBlock block={block} tokens={tokens} />;
    case "paragraph":     return <ParagraphBlock block={block} tokens={tokens} />;
    case "divider":       return <DividerBlock block={block} tokens={tokens} />;
    case "spacer":        return <SpacerBlock block={block} />;
    case "kpiSummary":    return <KPISummaryBlock block={block} tokens={tokens} />;
    case "dataTable":     return <DataTableBlock block={block} tokens={tokens} />;
    case "callout":       return <CalloutBlock block={block} tokens={tokens} />;
    case "bulletList":    return <BulletListBlock block={block} tokens={tokens} />;
    case "closingSummary":return <ClosingSummaryBlock block={block} tokens={tokens} />;
    default:              return <ParagraphBlock block={block} tokens={tokens} />;
  }
}

// ─── Data hydration ───────────────────────────────────────────────────────────

function hydrateBlocks(blocks: DocBlock[], report: any): DocBlock[] {
  const sections: any[] = report?.sections ?? [];
  const pulseSection = sections.find((s: any) => s.id === "bw_pulse");
  const progressSection = sections.find((s: any) => s.id === "bw_progress");
  const purposeSection = sections.find((s: any) => s.id === "bw_purpose");
  const partnerSection = sections.find((s: any) => s.id === "bw_partnership");

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
        const get = (label: string) =>
          metrics.find((m: any) => m.label === label)?.current ?? "—";

        const nsmQuarter  = get("NSM Quarter");
        const sessGoal    = get("NSM Sessions Goal");
        const sessActual  = get("NSM Sessions Actual");
        const sessPct     = get("NSM Sessions %");
        const sessTrack   = get("NSM Sessions On Track");
        const mvpMetric   = metrics.find((m: any) => /NSM MVP .* Goal/.test(m.label));
        const mvpFullLabel = mvpMetric?.label ?? "";
        const mvpRowLabel = mvpFullLabel.replace(/\s*Goal$/, "").replace(/^NSM MVP\s*/, "").trim();
        const mvpGoal     = mvpMetric?.current ?? "—";
        const mvpActual   = get(`${mvpFullLabel.replace(" Goal", "")} Actual`);
        const mvpPct      = get(`${mvpFullLabel.replace(" Goal", "")} %`);
        const mvpTrack    = get(`${mvpFullLabel.replace(" Goal", "")} On Track`);

        if (sessGoal !== "—" || mvpGoal !== "—") {
          const tableRows: string[][] = [];
          if (sessGoal !== "—") {
            tableRows.push(["Organic Sessions", sessGoal, sessActual, sessPct, sessTrack]);
          }
          if (mvpGoal !== "—") {
            tableRows.push([mvpRowLabel || "MVP Metric", mvpGoal, mvpActual, mvpPct, mvpTrack]);
          }
          return {
            ...block,
            content: `NSM Goals — ${nsmQuarter}`,
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

      case "blk-insight": {
        const metrics: any[] = pulseSection?.metrics ?? [];
        const nonNsm = metrics.filter((m: any) => !m.label.startsWith("NSM"));
        if (nonNsm.length > 0) {
          const summary = nonNsm
            .map((m: any) => `${m.label}: ${m.current}${m.delta ? ` (${m.delta})` : ""}`)
            .join(" · ");
          return { ...block, content: summary };
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
                ? row.items.map((i: any) => (typeof i === "string" ? i : i.text)).join("\n")
                : "") ||
              "—";
            const nextText =
              row.whatsNext ||
              (Array.isArray(row.nextItems)
                ? row.nextItems.map((i: any) => (typeof i === "string" ? i : i.text)).join("\n")
                : "") ||
              "—";
            return [row.area ?? "—", didText, nextText];
          });
          return {
            ...block,
            content: "Progress & Quick Wins",
            settings: {
              ...block.settings,
              colHeaders: ["Area", "What We Did / Learned", "What's Next"],
              tableRows,
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
}

export function BiweeklyReportRenderer({ report, printMode }: BiweeklyReportRendererProps) {
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
    if (
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved[0] &&
      typeof (saved[0] as any).settings === "object"
    ) {
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
      {/* Header bar — same as template editor */}
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

      {/* Document body */}
      <div className="px-12 pt-8 pb-12 bg-white">
        {hydratedBlocks.map((block) => (
          <BlockRenderer key={block.id} block={block} tokens={tokens} />
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
