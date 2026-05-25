import { EditableSection } from "./editable-section";
import { ReportBarChart, ReportLineChart } from "./report-chart";
import {
  RED, PAGE_BG, TEXT_PRIMARY, TEXT_SECONDARY, BORDER_COLOR,
  ReportTopHeader,
  ReportTopHeaderLarge,
  ReportTitleBlock,
  ReportSectionHeader,
  ReportTable,
  SlideTableWithCustomRows,
  ReportNarrativeCallout,
  ReportFooter,
  ReportMetricCard,
  // MV2 (Dashboard) — used by the rewritten Monthly slide components below.
  MV2_BG_PAGE,
  MV2_BG_CARD,
  MV2_BG_HEADER,
  MV2_BG_SUBTLE,
  MV2_ACCENT,
  MV2_TEXT_HEADER,
  MV2_TEXT_PRIMARY,
  MV2_TEXT_SECONDARY,
  MV2_TEXT_MUTED,
  MV2_BORDER,
  MV2_POSITIVE,
  MV2_NEGATIVE,
  MV2_FONT_HEADER,
  MV2_FONT_BODY,
  MV2HeaderBand,
  MV2Footer,
  MV2StatCard,
  MV2ContentCard,
  MV2InsightCallout,
  MV2MoversList,
  MV2Table,
  type MV2Column,
} from "./report-primitives";
import type { Slide } from "./report-primitives";

// ─── Shared prop type for all slide components ────────────────────────────────
export interface SlideProps {
  slide: Slide;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  headerUrl: string;
}

// Content body top offset — space below ReportTopHeader (58px) plus small gap
const BODY_TOP = 66;
const BODY_BOTTOM = 30;
const BODY_INSET = { top: BODY_TOP, left: 16, right: 16, bottom: BODY_BOTTOM };

// ─── MonthlyTitleSlide (V2 Dashboard) ────────────────────────────────────────
// Dark theme cover. Big sentence-case client name in Archivo, "produced by"
// metadata below. No swoosh image — pure typographic cover.
export function MonthlyTitleSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Monthly Report";
  const clientName = edits[`${slide.id}_client`] ?? slide.clientName ?? "";
  const date = slide.date ?? "";
  const producedBy = edits[`${slide.id}_producedBy`] ?? slide.producedBy ?? "";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: MV2_BG_HEADER,
        fontFamily: MV2_FONT_BODY,
        color: MV2_TEXT_HEADER,
      }}
    >
      {/* Brand-red accent stripe top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: MV2_ACCENT,
        }}
      />

      {/* Top metadata row */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 44,
          right: 44,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: 10,
          letterSpacing: "1.5px",
          color: "#B4B2A9",
          textTransform: "uppercase",
        }}
      >
        <span>SEO Monthly Report</span>
        <span>{date}</span>
      </div>

      {/* Eyebrow + huge title */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 44,
          right: 44,
        }}
      >
        <EditableSection
          editKey={`${slide.id}_title`}
          value={title}
          edits={edits}
          onEdit={onEdit}
          as="div"
          style={{
            fontSize: 12,
            letterSpacing: "1.8px",
            color: MV2_ACCENT,
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 18,
          } as any}
        />
        <EditableSection
          editKey={`${slide.id}_client`}
          value={clientName}
          edits={edits}
          onEdit={onEdit}
          as="div"
          style={{
            fontFamily: MV2_FONT_HEADER,
            fontSize: 52,
            fontWeight: 500,
            color: MV2_TEXT_HEADER,
            lineHeight: 1,
            letterSpacing: "-1.5px",
          } as any}
        />
      </div>

      {/* Produced By bottom-left */}
      {(producedBy || slide.producedBy !== undefined) && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: 44,
            fontSize: 10,
            color: "#B4B2A9",
          }}
        >
          <span style={{ letterSpacing: "1.2px", textTransform: "uppercase", marginRight: 8 }}>
            Produced by
          </span>
          <EditableSection
            editKey={`${slide.id}_producedBy`}
            value={producedBy || "—"}
            edits={edits}
            onEdit={onEdit}
            as="span"
            style={{
              fontSize: 11,
              color: MV2_TEXT_HEADER,
              fontWeight: 500,
            } as any}
          />
        </div>
      )}

      {/* Bottom-right page indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          right: 44,
          fontSize: 10,
          color: "#B4B2A9",
          letterSpacing: "1.2px",
          textTransform: "uppercase",
        }}
      >
        Cover
      </div>
    </div>
  );
}

// ─── MonthlyDividerSlide (section breaks) ────────────────────────────────────
export function MonthlyDividerSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeaderLarge headerUrl={headerUrl} height={90} />
      <div style={{ position: "absolute", top: 98, left: 0, right: 0, bottom: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ReportSectionHeader
          slideId={slide.id}
          title={edits[`${slide.id}_title`] ?? slide.title ?? ""}
          subtitle={edits[`${slide.id}_subtitle`] ?? slide.subtitle}
          edits={edits}
          onEdit={onEdit}
        />
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyKpiSlide (V2 Dashboard) ──────────────────────────────────────────
// "Getting Gains" style executive summary. Black header band, row of stat
// cards, AI insight callout, dark footer.
export function MonthlyKpiSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const mets = slide.metrics ?? [];
  // Cap at 4 across — beyond that the cards get cramped at 720px.
  const visibleMets = mets.slice(0, 4);
  const cols = Math.max(1, visibleMets.length);
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;

  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Performance summary";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: MV2_BG_PAGE,
        fontFamily: MV2_FONT_BODY,
      }}
    >
      <MV2HeaderBand title={title} subtitle={subtitle} />

      {/* Body: stat cards row, then optional insight callout */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 28,
          right: 28,
          bottom: 36,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {visibleMets.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 10,
            }}
          >
            {visibleMets.map((m, mi) => (
              <MV2StatCard
                key={mi}
                label={m.label}
                value={String(m.current ?? "—")}
                delta={m.delta}
                deltaPositive={m.isPositive}
                accent={true}
              />
            ))}
          </div>
        )}

        {commentary && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MV2InsightCallout
              text={
                <EditableSection
                  editKey={`${slide.id}_commentary`}
                  value={commentary}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                  multiline
                  style={{ fontSize: 10, lineHeight: 1.5, color: "#2C2C2A" } as any}
                />
              }
            />
          </div>
        )}

        {/* Source / period eyebrow at the bottom of body */}
        {(slide.sourceNote || subtitle) && (
          <div
            style={{
              marginTop: "auto",
              fontSize: 8,
              color: MV2_TEXT_MUTED,
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {slide.sourceNote ?? `Source: ${subtitle ?? ""}`}
          </div>
        )}
      </div>

      <MV2Footer
        sourceLabel={slide.sourceNote ?? "GA4 · GSC · GBP Insights"}
        dateLabel={subtitle ?? ""}
      />
    </div>
  );
}

// ─── MonthlyConversionSlide (V2 Dashboard) ───────────────────────────────────
// Bar chart slide for conversion / traffic metrics. Same dashboard wrapper as
// MonthlyTrendSlide — black header band, chart in white card, dark footer.
export function MonthlyConversionSlide({ slide, edits: _edits, onEdit: _onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = _edits[`${slide.id}_title`] ?? slide.title ?? "Performance";
  const subtitle = _edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  return (
    <div style={{ position: "absolute", inset: 0, background: MV2_BG_PAGE, fontFamily: MV2_FONT_BODY }}>
      <MV2HeaderBand title={title} subtitle={subtitle} />

      <div
        style={{
          position: "absolute",
          top: 76,
          left: 28,
          right: 28,
          bottom: 32,
        }}
      >
        <MV2ContentCard padding="14px 16px" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            {slide.chartData && (
              <ReportBarChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={235} />
            )}
            {!slide.chartData && (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: MV2_TEXT_MUTED,
                  fontSize: 11,
                  fontStyle: "italic",
                }}
              >
                No chart data for this period.
              </div>
            )}
          </div>
        </MV2ContentCard>
      </div>

      <MV2Footer
        sourceLabel={slide.sourceNote ?? ""}
        dateLabel={subtitle ?? ""}
      />
    </div>
  );
}

// ─── MonthlyTrendSlide (V2 Dashboard) ────────────────────────────────────────
// Line chart slide. Black header band, chart in a white card, dark footer.
// Chart styling is inherited from ReportLineChart for now — a follow-up could
// restyle the chart to match the dashboard palette (red strokes, dark text).
export function MonthlyTrendSlide({ slide, edits: _edits, onEdit: _onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = _edits[`${slide.id}_title`] ?? slide.title ?? "Trend";
  const subtitle = _edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  return (
    <div style={{ position: "absolute", inset: 0, background: MV2_BG_PAGE, fontFamily: MV2_FONT_BODY }}>
      <MV2HeaderBand title={title} subtitle={subtitle} />

      <div
        style={{
          position: "absolute",
          top: 76,
          left: 28,
          right: 28,
          bottom: 32,
        }}
      >
        <MV2ContentCard padding="14px 16px" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            {slide.chartData && (
              <ReportLineChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={235} />
            )}
            {!slide.chartData && (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: MV2_TEXT_MUTED,
                  fontSize: 11,
                  fontStyle: "italic",
                }}
              >
                No chart data for this period.
              </div>
            )}
          </div>
        </MV2ContentCard>
      </div>

      <MV2Footer
        sourceLabel={slide.sourceNote ?? ""}
        dateLabel={subtitle ?? ""}
      />
    </div>
  );
}

// ─── MonthlyAuditProgressSlide (V2 Dashboard) ────────────────────────────────
// Generic table slide using the new MV2Table primitive.
// Auto-detects delta columns by header text (contains "Δ", "%", "Δ %", etc.)
// and applies red/green coloring to those cells.
export function MonthlyAuditProgressSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const { headers = [], rows = [] } = slide.table ?? {};
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  // Build columns from headers, auto-detecting which are deltas vs text/number
  const columns: MV2Column[] = headers.map((h) => {
    const lower = String(h).toLowerCase();
    const isDelta = lower.includes("δ") || lower.includes("%") || lower.includes("delta") || lower.includes("chg") || lower.includes("change");
    const isNumber = !isDelta && (
      lower.includes("count") || lower.includes("clicks") || lower.includes("impressions") ||
      lower.includes("queries") || lower.includes("sessions") || lower.includes("calls") ||
      lower.includes("cost") || lower.includes("#") || lower.includes("position") ||
      lower.includes("rank") || lower.includes("vol")
    );
    return {
      header: String(h),
      format: isDelta ? "delta" : isNumber ? "number" : "text",
      align: (isDelta || isNumber) ? "right" : "left",
    };
  });

  return (
    <div style={{ position: "absolute", inset: 0, background: MV2_BG_PAGE, fontFamily: MV2_FONT_BODY }}>
      <MV2HeaderBand title={title} subtitle={subtitle} />

      <div
        style={{
          position: "absolute",
          top: 76,
          left: 28,
          right: 28,
          bottom: 32,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Pass-through to the legacy editable table component so AMs can edit
            individual cells — but we visually overlay our MV2 styling by
            wrapping in MV2ContentCard and using SlideTableWithCustomRows. */}
        {rows.length > 0 ? (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MV2Table
              columns={columns}
              rows={rows}
              fontSize={9}
            />
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: MV2_TEXT_MUTED,
              fontSize: 11,
              fontStyle: "italic",
            }}
          >
            No data for this period.
          </div>
        )}
      </div>

      <MV2Footer
        sourceLabel={slide.sourceNote ?? ""}
        dateLabel={subtitle ?? ""}
      />
    </div>
  );
}

// ─── MonthlyInitiativesSlide (V2 Dashboard) ──────────────────────────────────
// Renders bullets in a clean stacked layout inside a white content card,
// each bullet with a small red accent square. Used for content initiatives,
// recommendations, next steps.
export function MonthlyInitiativesSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Initiatives";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const bullets = slide.bullets ?? [];

  return (
    <div style={{ position: "absolute", inset: 0, background: MV2_BG_PAGE, fontFamily: MV2_FONT_BODY }}>
      <MV2HeaderBand title={title} subtitle={subtitle} />

      <div
        style={{
          position: "absolute",
          top: 76,
          left: 28,
          right: 28,
          bottom: 32,
        }}
      >
        <MV2ContentCard padding="16px 18px">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bullets.map((b, bi) => (
              <div
                key={bi}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  paddingBottom: bi < bullets.length - 1 ? 8 : 0,
                  borderBottom: bi < bullets.length - 1 ? `0.5px solid ${MV2_BORDER}` : "none",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    background: MV2_ACCENT,
                    flexShrink: 0,
                    marginTop: 6,
                  }}
                />
                <EditableSection
                  editKey={`${slide.id}_bullet_${bi}`}
                  value={b}
                  edits={edits}
                  onEdit={onEdit}
                  as="div"
                  multiline
                  style={{
                    fontSize: 10.5,
                    color: MV2_TEXT_PRIMARY,
                    lineHeight: 1.5,
                    flex: 1,
                  } as any}
                />
              </div>
            ))}
            {bullets.length === 0 && (
              <div style={{ color: MV2_TEXT_MUTED, fontSize: 11, fontStyle: "italic" }}>
                No items for this period.
              </div>
            )}
          </div>
        </MV2ContentCard>
      </div>

      <MV2Footer dateLabel={subtitle ?? ""} />
    </div>
  );
}

// ─── MonthlyNextStepsSlide — alias of initiatives for semantic clarity ────────
export const MonthlyNextStepsSlide = MonthlyInitiativesSlide;

// ─── MonthlyClusterSlide (content cluster / topic map) ───────────────────────
export function MonthlyClusterSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const cols = Math.min(4, (slide.clusters ?? []).length);
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column" }}>
        {slide.commentary && (
          <div style={{ fontSize: 8, color: TEXT_SECONDARY, marginBottom: 6 }}>
            <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1, minHeight: 0, overflow: "auto" }}>
          {(slide.clusters ?? []).map((cluster, ci) => (
            <div key={ci} style={{ border: `1px solid ${BORDER_COLOR}`, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: RED, color: "white", fontSize: 8, fontWeight: 700, padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <EditableSection editKey={`${slide.id}_cluster_${ci}_hub`} value={cluster.hub} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700, color: "white" } as any} />
              </div>
              <div style={{ padding: 4 }}>
                {cluster.pages.map((page, pi) => (
                  <div key={pi} style={{ fontSize: 7, color: "#374151", padding: "1px 4px", borderBottom: `1px solid #F3F4F6`, display: "flex", gap: 3, alignItems: "center" }}>
                    <span style={{ color: RED, fontSize: 6 }}>●</span>
                    <EditableSection editKey={`${slide.id}_cluster_${ci}_page_${pi}`} value={page} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 7 } as any} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyScorecardSlide (table + metrics side panel) ──────────────────────
export function MonthlyScorecardSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const mets = slide.metrics ?? [];
  const { headers = [], rows = [] } = slide.table ?? {};
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", gap: 12 }}>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
          {slide.subtitle && (
            <div style={{ fontSize: 9, color: TEXT_SECONDARY }}>
              <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
            </div>
          )}
          {headers.length > 0 && (
            <SlideTableWithCustomRows
              slideId={slide.id}
              tableKey="scorecard"
              headers={headers}
              rows={rows}
              edits={edits}
              onEdit={onEdit}
              maxRows={14}
            />
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {mets.slice(0, 4).map((m, mi) => <ReportMetricCard key={mi} {...m} />)}
          {commentary && (
            <ReportNarrativeCallout editKey={`${slide.id}_commentary`} value={commentary} edits={edits} onEdit={onEdit} />
          )}
        </div>
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyDecisionSlide (decision options) ──────────────────────────────────
export function MonthlyDecisionSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const options = slide.decisionOptions ?? [];
  const conclusion = edits[`${slide.id}_conclusion`] ?? slide.decisionConclusion;
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
        {slide.subtitle && (
          <div style={{ fontSize: 9, color: TEXT_SECONDARY, textAlign: "center" }}>
            <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 9 } as any} />
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
          {options.map((opt, oi) => (
            <div key={oi} style={{ flex: 1, border: opt.recommended ? `2px solid ${RED}` : `1px solid ${BORDER_COLOR}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4, background: opt.recommended ? "#FFF8F7" : "white" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_PRIMARY }}>
                <EditableSection editKey={`${slide.id}_opt_${oi}_label`} value={opt.label} edits={edits} onEdit={onEdit} as="div" style={{ fontSize: 10, fontWeight: 700 } as any} />
              </div>
              {opt.subtitle && <div style={{ fontSize: 8, color: opt.recommended ? RED : TEXT_SECONDARY, fontWeight: 600 }}>{opt.subtitle}</div>}
              {opt.recommended && <div style={{ fontSize: 7, color: RED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Recommended</div>}
              <div style={{ marginTop: 2 }}>
                {opt.pros.map((p, pi) => (
                  <div key={pi} style={{ display: "flex", gap: 4, fontSize: 8, color: "#374151", marginBottom: 2 }}>
                    <span style={{ color: "#10B981", fontWeight: 700 }}>✓</span>
                    <EditableSection editKey={`${slide.id}_opt_${oi}_pro_${pi}`} value={p} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8 } as any} />
                  </div>
                ))}
                {(opt.cons ?? []).map((c, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 4, fontSize: 8, color: "#374151", marginBottom: 2 }}>
                    <span style={{ color: "#EF4444", fontWeight: 700 }}>✗</span>
                    <EditableSection editKey={`${slide.id}_opt_${oi}_con_${ci}`} value={c} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8 } as any} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {conclusion && (
          <ReportNarrativeCallout editKey={`${slide.id}_conclusion`} value={conclusion} edits={edits} onEdit={onEdit} />
        )}
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyIaComparisonSlide ─────────────────────────────────────────────────
export function MonthlyIaComparisonSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const currentItems = slide.currentIA ?? [];
  const futureItems = slide.futureIA ?? [];
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", gap: 6 }}>
        {slide.commentary && (
          <div style={{ fontSize: 8, color: TEXT_SECONDARY }}>
            <EditableSection editKey={`${slide.id}_commentary`} value={slide.commentary} edits={edits} onEdit={onEdit} as="div" multiline style={{ fontSize: 8 } as any} />
          </div>
        )}
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Current</div>
            <div style={{ border: `1px solid ${BORDER_COLOR}`, borderRadius: 4, padding: 6, background: "#FAFAFA", height: "calc(100% - 20px)", overflow: "auto" }}>
              {currentItems.map((item, ii) => (
                <div key={ii} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: TEXT_PRIMARY, padding: "2px 5px", background: "#F3F4F6", borderRadius: 3, display: "inline-block" }}>
                    <EditableSection editKey={`${slide.id}_cur_${ii}`} value={item.label} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700 } as any} />
                  </div>
                  {item.children?.map((c, ci) => (
                    <div key={ci} style={{ fontSize: 7, color: "#4B5563", paddingLeft: 10, marginTop: 1 }}>— {c}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 18, color: RED, fontWeight: 700 }}>→</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Future</div>
            <div style={{ border: `1px solid ${RED}30`, borderRadius: 4, padding: 6, background: "#FFF8F7", height: "calc(100% - 20px)", overflow: "auto" }}>
              {futureItems.map((item, ii) => (
                <div key={ii} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: TEXT_PRIMARY, padding: "2px 5px", background: `${RED}14`, borderRadius: 3, display: "inline-block" }}>
                    <EditableSection editKey={`${slide.id}_fut_${ii}`} value={item.label} edits={edits} onEdit={onEdit} as="span" style={{ fontSize: 8, fontWeight: 700 } as any} />
                  </div>
                  {item.children?.map((c, ci) => (
                    <div key={ci} style={{ fontSize: 7, color: "#4B5563", paddingLeft: 10, marginTop: 1 }}>— {c}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── Shared MV2 layout shell ─────────────────────────────────────────────────
// Standard dashboard chrome: warm page bg, black header band, dark footer.
// Body slot sits between top: 76 and bottom: 32 so children get ~297px.
function MV2SlideShell({
  title,
  subtitle,
  sourceLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  sourceLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, background: MV2_BG_PAGE, fontFamily: MV2_FONT_BODY }}>
      <MV2HeaderBand title={title} subtitle={subtitle} />
      <div style={{ position: "absolute", top: 76, left: 28, right: 28, bottom: 32 }}>
        {children}
      </div>
      <MV2Footer sourceLabel={sourceLabel ?? ""} dateLabel={subtitle ?? ""} />
    </div>
  );
}

// Auto-column builder for the MV2Table primitive. Mirrors the heuristic in
// MonthlyAuditProgressSlide so spec tables get consistent formatting (right-
// aligned numbers, red/green delta columns).
function autoColumnsFromHeaders(headers: string[]): MV2Column[] {
  return headers.map((h) => {
    const lower = String(h).toLowerCase();
    const isDelta = lower.includes("δ") || lower.includes("%") || lower.includes("delta") || lower.includes("chg") || lower.includes("change") || lower.includes("pacing");
    const isNumber = !isDelta && (
      lower.includes("count") || lower.includes("clicks") || lower.includes("impressions") ||
      lower.includes("queries") || lower.includes("sessions") || lower.includes("calls") ||
      lower.includes("cost") || lower.includes("#") || lower.includes("position") ||
      lower.includes("rank") || lower.includes("vol") || lower.includes("completed") ||
      lower.includes("affected")
    );
    return {
      header: String(h),
      format: isDelta ? "delta" : isNumber ? "number" : "text",
      align: (isDelta || isNumber) ? "right" : "left",
    };
  });
}

// ─── MonthlyExecSummarySlide (V2 — Slide 2) ──────────────────────────────────
// Headline + executive narrative + 3 key moves. AI synthesizes copy in Phase
// 3f; Phase 3e renders the shape so AMs can edit any block.
export function MonthlyExecSummarySlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Headline & executive summary";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const headline = edits[`${slide.id}_headline`] ?? slide.headline ?? "";
  const narrative = edits[`${slide.id}_narrative`] ?? slide.narrative ?? "";
  const keyMoves = slide.keyMoves ?? [];

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="Synthesis of all sources">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        {/* Headline */}
        <MV2ContentCard padding="14px 16px">
          <div
            style={{
              fontSize: 7,
              color: MV2_TEXT_MUTED,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Headline
          </div>
          <EditableSection
            editKey={`${slide.id}_headline`}
            value={headline || "—"}
            edits={edits}
            onEdit={onEdit}
            as="div"
            multiline
            style={{
              fontFamily: MV2_FONT_HEADER,
              fontSize: 18,
              fontWeight: 500,
              color: MV2_TEXT_PRIMARY,
              lineHeight: 1.2,
              letterSpacing: "-0.3px",
            } as any}
          />
        </MV2ContentCard>

        {/* Narrative — fills middle space */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <MV2InsightCallout
            text={
              <EditableSection
                editKey={`${slide.id}_narrative`}
                value={narrative || "—"}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                style={{
                  fontSize: 10,
                  lineHeight: 1.55,
                  color: "#2C2C2A",
                } as any}
              />
            }
            style={{ height: "100%" }}
          />
        </div>

        {/* Key moves — 3 stacked bullet cards across */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, keyMoves.length)}, 1fr)`, gap: 8 }}>
          {keyMoves.map((m, mi) => (
            <MV2ContentCard key={mi} padding="8px 10px">
              <div
                style={{
                  fontSize: 7,
                  color: MV2_ACCENT,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  marginBottom: 3,
                  fontWeight: 600,
                }}
              >
                Key move {mi + 1}
              </div>
              <EditableSection
                editKey={`${slide.id}_keymove_${mi}`}
                value={m}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                style={{ fontSize: 9, lineHeight: 1.45, color: MV2_TEXT_PRIMARY } as any}
              />
            </MV2ContentCard>
          ))}
          {keyMoves.length === 0 && (
            <div style={{ fontSize: 9, color: MV2_TEXT_MUTED, fontStyle: "italic" }}>
              Key moves pending — AI synthesis populates in Phase 3f.
            </div>
          )}
        </div>
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyOutcomesSlide (V2 — Slide 3) ─────────────────────────────────────
// Business outcomes + QTD goal pacing. Three regions: stat cards row,
// pacing-badges row (NSM goal progress), commentary callout.
export function MonthlyOutcomesSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Business outcomes";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  const metrics = slide.metrics ?? [];
  const pacing = slide.pacingBadges ?? [];
  const visibleMetrics = metrics.slice(0, 4);

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="GA4 · Call tracker · NSM Tracker">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        {/* Outcome stat cards */}
        {visibleMetrics.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${visibleMetrics.length}, 1fr)`,
              gap: 8,
            }}
          >
            {visibleMetrics.map((m, mi) => (
              <MV2StatCard
                key={mi}
                label={m.label}
                value={String(m.current ?? "—")}
                delta={m.delta}
                deltaPositive={m.isPositive}
                accent
              />
            ))}
          </div>
        )}

        {/* Pacing badges */}
        {pacing.length > 0 && (
          <MV2ContentCard padding="10px 12px">
            <div
              style={{
                fontSize: 7,
                color: MV2_TEXT_MUTED,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              QTD goal pacing
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${pacing.length}, 1fr)`, gap: 10 }}>
              {pacing.map((b, bi) => {
                const statusColor =
                  b.status === "Ahead" ? MV2_POSITIVE :
                  b.status === "At Risk" ? MV2_NEGATIVE :
                  MV2_TEXT_SECONDARY;
                return (
                  <div
                    key={bi}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${statusColor}`,
                    }}
                  >
                    <div style={{ fontSize: 8, color: MV2_TEXT_MUTED, letterSpacing: "0.3px" }}>
                      {b.label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: MV2_TEXT_PRIMARY, fontFamily: MV2_FONT_HEADER }}>
                      {b.current} <span style={{ fontSize: 9, color: MV2_TEXT_MUTED, fontWeight: 400 }}>/ {b.goal}</span>
                    </div>
                    <div style={{ fontSize: 8, color: statusColor, fontWeight: 600, letterSpacing: "0.3px" }}>
                      {b.status.toUpperCase()} · {b.pacingPercent}
                    </div>
                  </div>
                );
              })}
            </div>
          </MV2ContentCard>
        )}

        {/* Commentary callout fills remaining space */}
        {commentary && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <MV2InsightCallout
              text={
                <EditableSection
                  editKey={`${slide.id}_commentary`}
                  value={commentary}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                  multiline
                  style={{ fontSize: 10, lineHeight: 1.5, color: "#2C2C2A" } as any}
                />
              }
              style={{ height: "100%" }}
            />
          </div>
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyVisibilitySlide (V2 — Slide 4) ───────────────────────────────────
// Stat cards (clicks / impressions / DR / org keywords) + cluster impression
// table + commentary. Empty states populate from generator placeholders.
export function MonthlyVisibilitySlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Organic visibility & discoverability";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  const metrics = (slide.metrics ?? []).slice(0, 4);
  const { headers = [], rows = [] } = slide.table ?? {};
  const columns = autoColumnsFromHeaders(headers);

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="GSC · Ahrefs">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        {metrics.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${metrics.length}, 1fr)`,
              gap: 8,
            }}
          >
            {metrics.map((m, mi) => (
              <MV2StatCard
                key={mi}
                label={m.label}
                value={String(m.current ?? "—")}
                delta={m.delta}
                deltaPositive={m.isPositive}
                accent
              />
            ))}
          </div>
        )}

        {/* Cluster impression table */}
        {rows.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <MV2Table columns={columns} rows={rows} fontSize={9} />
          </div>
        )}

        {commentary && (
          <MV2InsightCallout
            text={
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={commentary}
                edits={edits}
                onEdit={onEdit}
                as="span"
                multiline
                style={{ fontSize: 9.5, lineHeight: 1.5, color: "#2C2C2A" } as any}
              />
            }
          />
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyKeywordTableSlide (V2 — Slide 5) ─────────────────────────────────
// Cluster-level table — # queries, Δ queries, clicks, Δ clicks, intent, notes.
// Big editable table dominates the slide; commentary lives at the bottom.
export function MonthlyKeywordTableSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Keyword & intent movement";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  const { headers = [], rows = [] } = slide.table ?? {};
  const columns = autoColumnsFromHeaders(headers);

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="GSC · Topic clustering">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {rows.length > 0 ? (
            <MV2Table columns={columns} rows={rows} fontSize={9} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: MV2_TEXT_MUTED, fontSize: 11, fontStyle: "italic" }}>
              No cluster data this period — connect GSC to populate.
            </div>
          )}
        </div>
        {commentary && (
          <MV2InsightCallout
            text={
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={commentary}
                edits={edits}
                onEdit={onEdit}
                as="span"
                multiline
                style={{ fontSize: 9.5, lineHeight: 1.5, color: "#2C2C2A" } as any}
              />
            }
          />
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyIntentAlignmentSlide (V2 — Slide 6) ──────────────────────────────
// Stacked cards, one per flagged misalignment. Each shows URL, expected vs
// observed intent, and a recommendation. All copy editable.
export function MonthlyIntentAlignmentSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Search intent alignment";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const findings = slide.intentFindings ?? [];
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="GSC query-to-page map">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", overflow: "hidden" }}>
        {findings.length > 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
            {findings.map((f, fi) => (
              <MV2ContentCard key={fi} padding="8px 12px">
                <div
                  style={{
                    fontSize: 8,
                    color: MV2_ACCENT,
                    letterSpacing: "0.6px",
                    fontWeight: 600,
                    marginBottom: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <EditableSection
                    editKey={`${slide.id}_finding_${fi}_url`}
                    value={f.url}
                    edits={edits}
                    onEdit={onEdit}
                    as="span"
                    style={{ fontSize: 8, color: MV2_ACCENT, fontWeight: 600 } as any}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 7, color: MV2_TEXT_MUTED, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 1 }}>
                      Expected
                    </div>
                    <EditableSection
                      editKey={`${slide.id}_finding_${fi}_expected`}
                      value={f.expected}
                      edits={edits}
                      onEdit={onEdit}
                      as="div"
                      multiline
                      style={{ fontSize: 9, color: MV2_TEXT_PRIMARY, lineHeight: 1.35 } as any}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 7, color: MV2_TEXT_MUTED, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 1 }}>
                      Observed
                    </div>
                    <EditableSection
                      editKey={`${slide.id}_finding_${fi}_observed`}
                      value={f.observed}
                      edits={edits}
                      onEdit={onEdit}
                      as="div"
                      multiline
                      style={{ fontSize: 9, color: MV2_TEXT_PRIMARY, lineHeight: 1.35 } as any}
                    />
                  </div>
                </div>
                <div style={{ borderTop: `0.5px solid ${MV2_BORDER}`, paddingTop: 4 }}>
                  <div style={{ fontSize: 7, color: MV2_TEXT_MUTED, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 1 }}>
                    Recommendation
                  </div>
                  <EditableSection
                    editKey={`${slide.id}_finding_${fi}_rec`}
                    value={f.recommendation}
                    edits={edits}
                    onEdit={onEdit}
                    as="div"
                    multiline
                    style={{ fontSize: 9, color: MV2_TEXT_PRIMARY, lineHeight: 1.4 } as any}
                  />
                </div>
              </MV2ContentCard>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MV2InsightCallout
              text={
                <EditableSection
                  editKey={`${slide.id}_commentary`}
                  value={commentary ?? "No major intent misalignments detected."}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                  multiline
                  style={{ fontSize: 10, lineHeight: 1.5, color: "#2C2C2A" } as any}
                />
              }
            />
          </div>
        )}
        {findings.length > 0 && commentary && (
          <MV2InsightCallout
            text={
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={commentary}
                edits={edits}
                onEdit={onEdit}
                as="span"
                multiline
                style={{ fontSize: 9.5, lineHeight: 1.5, color: "#2C2C2A" } as any}
              />
            }
          />
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyStatGridSlide (V2 — Slides 7, 8, 9, 10, 11, 12) ──────────────────
// Generic dashboard slide: 3-4 stat cards across the top, optional table in
// the middle, AI commentary callout at the bottom. Used for E-E-A-T,
// technical, speed, CRO, authority, and AI discoverability.
export function MonthlyStatGridSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  const metrics = (slide.metrics ?? []).slice(0, 4);
  const { headers = [], rows = [] } = slide.table ?? {};
  const columns = autoColumnsFromHeaders(headers);
  const hasTable = rows.length > 0;

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel={slide.sourceNote ?? ""}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        {metrics.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${metrics.length}, 1fr)`,
              gap: 8,
            }}
          >
            {metrics.map((m, mi) => (
              <MV2StatCard
                key={mi}
                label={m.label}
                value={String(m.current ?? "—")}
                delta={m.delta}
                deltaPositive={m.isPositive}
                accent
              />
            ))}
          </div>
        )}

        {hasTable && (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <MV2Table columns={columns} rows={rows} fontSize={9} />
          </div>
        )}

        {commentary && (
          <div style={{ flex: hasTable ? undefined : 1, minHeight: 0 }}>
            <MV2InsightCallout
              text={
                <EditableSection
                  editKey={`${slide.id}_commentary`}
                  value={commentary}
                  edits={edits}
                  onEdit={onEdit}
                  as="span"
                  multiline
                  style={{ fontSize: 10, lineHeight: 1.5, color: "#2C2C2A" } as any}
                />
              }
              style={hasTable ? undefined : { height: "100%" }}
            />
          </div>
        )}

        {/* Stat-only slides with no commentary or table still need to fill
            vertical space, otherwise the stat cards float at the top. */}
        {!commentary && !hasTable && metrics.length > 0 && <div style={{ flex: 1 }} />}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyContentPipelineSlide (V2 — Slide 13) ─────────────────────────────
// Single MV2Table with the next month's scheduled content from Airtable.
export function MonthlyContentPipelineSlide({ slide, edits: _edits, onEdit: _onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = _edits[`${slide.id}_title`] ?? slide.title ?? "Content pipeline";
  const subtitle = _edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const { headers = [], rows = [] } = slide.table ?? {};
  const columns = autoColumnsFromHeaders(headers);

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="Airtable Production view">
      <div style={{ height: "100%", overflow: "hidden" }}>
        {rows.length > 0 ? (
          <MV2Table columns={columns} rows={rows} fontSize={9} />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MV2_TEXT_MUTED, fontSize: 11, fontStyle: "italic" }}>
            No content scheduled in Airtable Production view for next month.
          </div>
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyInitiativesPanelSlide (V2 — Slide 14) ────────────────────────────
// Two-panel slide: left = this-month status table from Asana; right =
// editable bullets for next-month priorities. Distinct from the legacy
// MonthlyInitiativesSlide (single-column bullets) — that's still the
// renderer for type "bullets".
export function MonthlyInitiativesPanelSlide({ slide, edits, onEdit, headerUrl: _headerUrl }: SlideProps) {
  const title = edits[`${slide.id}_title`] ?? slide.title ?? "Strategic initiatives & next month priorities";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  const { headers = [], rows = [] } = slide.table ?? {};
  const columns = autoColumnsFromHeaders(headers);
  const bullets = slide.bullets ?? [];

  return (
    <MV2SlideShell title={title} subtitle={subtitle} sourceLabel="Asana · AM input">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1, minHeight: 0 }}>
          {/* Left panel — this-month status */}
          <MV2ContentCard padding="10px 12px" style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 7,
                color: MV2_TEXT_MUTED,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              This month
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              {rows.length > 0 ? (
                <MV2Table columns={columns} rows={rows} fontSize={8} rowHeight={20} />
              ) : (
                <div style={{ fontSize: 9, color: MV2_TEXT_MUTED, fontStyle: "italic" }}>
                  No Asana data — connect Asana in client settings.
                </div>
              )}
            </div>
          </MV2ContentCard>

          {/* Right panel — next-month priorities */}
          <MV2ContentCard padding="10px 12px" style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 7,
                color: MV2_ACCENT,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Next month priorities
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
              {bullets.length > 0 ? bullets.map((b, bi) => (
                <div
                  key={bi}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    paddingBottom: bi < bullets.length - 1 ? 5 : 0,
                    borderBottom: bi < bullets.length - 1 ? `0.5px solid ${MV2_BORDER}` : "none",
                  }}
                >
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      background: MV2_ACCENT,
                      flexShrink: 0,
                      marginTop: 5,
                    }}
                  />
                  <EditableSection
                    editKey={`${slide.id}_priority_${bi}`}
                    value={b}
                    edits={edits}
                    onEdit={onEdit}
                    as="div"
                    multiline
                    style={{ fontSize: 9, lineHeight: 1.4, color: MV2_TEXT_PRIMARY, flex: 1 } as any}
                  />
                </div>
              )) : (
                <div style={{ fontSize: 9, color: MV2_TEXT_MUTED, fontStyle: "italic" }}>
                  Add priorities in the AM input form, or connect Asana to surface upcoming tasks.
                </div>
              )}
            </div>
          </MV2ContentCard>
        </div>

        {commentary && (
          <MV2InsightCallout
            text={
              <EditableSection
                editKey={`${slide.id}_commentary`}
                value={commentary}
                edits={edits}
                onEdit={onEdit}
                as="span"
                multiline
                style={{ fontSize: 9.5, lineHeight: 1.5, color: "#2C2C2A" } as any}
              />
            }
          />
        )}
      </div>
    </MV2SlideShell>
  );
}

// ─── MonthlyTwoColSlide ───────────────────────────────────────────────────────
export function MonthlyTwoColSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const lc = slide.leftContent;
  const rc = slide.rightContent;
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", gap: 12, alignItems: "stretch" }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          {lc?.type === "bullets" && (lc.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 5, fontSize: 9 }}>
              <span style={{ color: RED, fontWeight: "bold" }}>•</span>
              <span style={{ color: TEXT_PRIMARY }}>{b}</span>
            </div>
          ))}
          {lc?.type === "table" && lc.table && (
            <ReportTable headers={lc.table.headers} rows={lc.table.rows} maxRows={12} fontSize={7} cellPadding="2px 4px" />
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {rc?.type === "chart-bar" && rc.chartData && (
            <ReportBarChart data={rc.chartData} keys={rc.chartKeys ?? ["value"]} height={265} />
          )}
          {rc?.type === "chart-line" && rc.chartData && (
            <ReportLineChart data={rc.chartData} keys={rc.chartKeys ?? ["value"]} height={265} />
          )}
          {rc?.type === "metrics" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(rc.metrics ?? []).map((m, mi) => <ReportMetricCard key={mi} {...m} />)}
            </div>
          )}
        </div>
      </div>
      <ReportFooter />
    </div>
  );
}
