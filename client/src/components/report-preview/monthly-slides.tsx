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

// ─── MonthlyTitleSlide ────────────────────────────────────────────────────────
export function MonthlyTitleSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}>
      <ReportTopHeaderLarge headerUrl={headerUrl} height={150} />
      <div style={{ position: "absolute", top: 158, left: 36, right: 36, bottom: 32 }}>
        <ReportTitleBlock
          slideId={slide.id}
          title={edits[`${slide.id}_title`] ?? slide.title ?? ""}
          clientName={edits[`${slide.id}_client`] ?? slide.clientName ?? ""}
          date={slide.date}
          edits={edits}
          onEdit={onEdit}
        />
      </div>
      <ReportFooter />
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

// ─── MonthlyKpiSlide (metrics grid) ──────────────────────────────────────────
export function MonthlyKpiSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const mets = slide.metrics ?? [];
  const cols = Math.min(4, mets.length || 1);
  const commentary = edits[`${slide.id}_commentary`] ?? slide.commentary;
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
        {slide.subtitle && (
          <div style={{ fontSize: 9, color: TEXT_SECONDARY }}>
            <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
          {mets.map((m, mi) => <ReportMetricCard key={mi} {...m} />)}
        </div>
        {commentary && (
          <ReportNarrativeCallout editKey={`${slide.id}_commentary`} value={commentary} edits={edits} onEdit={onEdit} />
        )}
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyConversionSlide (bar chart — conversion / traffic) ────────────────
export function MonthlyConversionSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {slide.subtitle && <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 8 }}>{slide.subtitle}</div>}
        {slide.chartData && (
          <ReportBarChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={265} />
        )}
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyTrendSlide (line chart — GSC, rankings, trends) ──────────────────
export function MonthlyTrendSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {slide.subtitle && <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 8 }}>{slide.subtitle}</div>}
        {slide.chartData && (
          <ReportLineChart data={slide.chartData} keys={slide.chartKeys ?? ["value"]} height={265} />
        )}
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyAuditProgressSlide (table — audit, content progress, keyword data) ─
export function MonthlyAuditProgressSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  const { headers = [], rows = [] } = slide.table ?? {};
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, overflow: "auto" }}>
        {slide.subtitle && (
          <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 6 }}>
            <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
          </div>
        )}
        <SlideTableWithCustomRows
          slideId={slide.id}
          tableKey="table"
          headers={headers}
          rows={rows}
          edits={edits}
          onEdit={onEdit}
        />
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── MonthlyInitiativesSlide (bullets — content initiatives, recommendations) ─
export function MonthlyInitiativesSlide({ slide, edits, onEdit, headerUrl }: SlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />
      <div style={{ position: "absolute", ...BODY_INSET, display: "flex", flexDirection: "column", justifyContent: "center", gap: 7 }}>
        {slide.subtitle && (
          <div style={{ fontSize: 9, color: TEXT_SECONDARY, marginBottom: 4 }}>
            <EditableSection editKey={`${slide.id}_subtitle`} value={slide.subtitle} edits={edits} onEdit={onEdit} as="span" />
          </div>
        )}
        {(slide.bullets ?? []).map((b, bi) => (
          <div key={bi} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ color: RED, fontWeight: 800, fontSize: 13, lineHeight: 1, flexShrink: 0 }}>•</span>
            <EditableSection
              editKey={`${slide.id}_bullet_${bi}`}
              value={b}
              edits={edits}
              onEdit={onEdit}
              as="div"
              multiline
              className="flex-1 leading-snug"
              style={{ fontSize: 10.5, color: TEXT_PRIMARY } as any}
            />
          </div>
        ))}
      </div>
      <ReportFooter />
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
