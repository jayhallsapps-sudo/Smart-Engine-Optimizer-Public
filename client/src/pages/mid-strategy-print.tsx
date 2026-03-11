import { useEffect, useState } from "react";

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const NAVY      = "#1B3A6B";
const NAVY_DARK = "#0D2240";
const RED       = "#C0392B";
const GRAY_BG   = "#F8FAFC";
const PANEL_L   = "#EEF3F9";
const PANEL_R   = "#FFF8F2";
const BORDER    = "#DDE3EC";
const TEXT      = "#111827";
const TEXT_MED  = "#374151";
const TEXT_SUB  = "#6B7280";
const TEXT_META = "#9CA3AF";
const GREEN     = "#059669";
const AMBER     = "#B45309";
const FOOTER_TEXT = "Webserv  ·  32 Discovery, Suite 130, Irvine CA 92618  ·  webserv.io";

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface SlideData {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  commentary?: string;
  clientName?: string;
  date?: string;
  sectionLabel?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  chartData?: Array<{ label: string; [key: string]: string | number }>;
  chartKeys?: string[];
  bullets?: string[];
  leftContent?: any;
  rightContent?: any;
  decisionOptions?: Array<{ label: string; subtitle?: string; pros: string[]; cons?: string[]; recommended?: boolean }>;
  decisionConclusion?: string;
  currentIA?: Array<{ label: string; children?: string[] }>;
  futureIA?: Array<{ label: string; children?: string[] }>;
  clusters?: Array<{ hub: string; pages: string[] }>;
  hidden?: boolean;
  confidence?: string;
  sources?: string[];
}

function r(edits: Record<string, string>, key: string, fallback: string): string {
  return edits[key] ?? fallback;
}

// ─── Reusable Atoms ────────────────────────────────────────────────────────────

function SectionTag({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: RED, marginBottom: 4 }}>
      {label}
    </div>
  );
}

function SlideTitle({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, lineHeight: 1.2, marginBottom: 2 }}>
      {title}
    </div>
  );
}

function SlideSubtitle({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ fontSize: 10, color: TEXT_SUB, lineHeight: 1.4, marginBottom: 10 }}>
      {subtitle}
    </div>
  );
}

function SourcesMeta({ sources, confidence }: { sources?: string[]; confidence?: string }) {
  if (!sources?.length && !confidence) return null;
  const confMap: Record<string, string> = {
    "data-backed": "Data-Backed",
    "mixed-source": "Mixed Source",
    "ai-synthesized": "AI-Synthesized",
    "missing-data": "Missing Data",
  };
  const confColor: Record<string, string> = {
    "data-backed": GREEN,
    "mixed-source": "#1D4ED8",
    "ai-synthesized": AMBER,
    "missing-data": RED,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
      {confidence && confidence !== "data-backed" && (
        <span style={{ fontSize: 7.5, fontWeight: 700, color: confColor[confidence] ?? TEXT_META, letterSpacing: "0.07em", textTransform: "uppercase", background: `${confColor[confidence] ?? TEXT_META}12`, padding: "2px 6px", borderRadius: 2, border: `1px solid ${confColor[confidence] ?? TEXT_META}30` }}>
          {confMap[confidence] ?? confidence}
        </span>
      )}
      {sources && sources.length > 0 && (
        <span style={{ fontSize: 8, color: TEXT_META }}>
          Sources: {sources.join(" · ")}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 2, background: RED, margin: "0 0 0 0" }} />;
}

function SlideFooter({ label }: { label?: string }) {
  return (
    <div>
      <Divider />
      <div style={{ height: 20, background: GRAY_BG, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16 }}>
        <span style={{ fontSize: 7.5, color: TEXT_META }}>{FOOTER_TEXT}</span>
        {label && <span style={{ fontSize: 7.5, color: TEXT_META, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>}
      </div>
    </div>
  );
}

function ContentShell({ sectionLabel, title, subtitle, children, sources, confidence, footerLabel }:
  { sectionLabel?: string; title: string; subtitle?: string; children: React.ReactNode; sources?: string[]; confidence?: string; footerLabel?: string }) {
  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      {/* Header zone */}
      <div style={{ padding: "14px 24px 0", background: "white" }}>
        {sectionLabel && <SectionTag label={sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: subtitle ? 4 : 0 }} />
        {subtitle && <SlideSubtitle subtitle={subtitle} />}
      </div>
      {/* Content zone */}
      <div style={{ flex: 1, padding: "10px 24px 0 24px" }}>
        {children}
      </div>
      {/* Source meta + footer */}
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={sources} confidence={confidence} />
      </div>
      <SlideFooter label={footerLabel} />
    </div>
  );
}

// ─── PrintTable ────────────────────────────────────────────────────────────────
function PrintTable({ headers, rows, compact }: { headers: string[]; rows: (string | number)[][]; compact?: boolean }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 9 : 10 }}>
      <thead>
        <tr style={{ background: NAVY }}>
          {headers.map((h, hi) => (
            <th key={hi} style={{ color: "white", padding: compact ? "4px 8px" : "6px 10px", textAlign: "left", fontWeight: 700, fontSize: compact ? 8 : 9, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : GRAY_BG, borderBottom: `1px solid ${BORDER}` }}>
            {row.map((cell, ci) => {
              const v = String(cell);
              const isPriority = v.startsWith("🔴") || v.startsWith("🟡") || v.startsWith("🟢");
              return (
                <td key={ci} style={{ padding: compact ? "3px 8px" : "5px 10px", color: TEXT_MED, fontSize: compact ? 9 : 10, lineHeight: 1.4, verticalAlign: "top" }}>
                  {isPriority ? <PriorityChip label={v} /> : v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PriorityChip({ label }: { label: string }) {
  const isHigh = label.includes("High");
  const isMed = label.includes("Medium") || label.includes("Med");
  const bg = isHigh ? "#FEE2E2" : isMed ? "#FEF3C7" : "#D1FAE5";
  const color = isHigh ? "#991B1B" : isMed ? "#92400E" : "#065F46";
  const text = isHigh ? "HIGH" : isMed ? "MED" : "LOW";
  return (
    <span style={{ display: "inline-block", background: bg, color, fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
      {text}
    </span>
  );
}

// ─── MetricBox ─────────────────────────────────────────────────────────────────
function MetricBox({ m }: { m: { label: string; current: string; previous?: string; delta?: string; isPositive?: boolean } }) {
  const arrow = m.delta ? (m.isPositive ? "▲" : "▼") : "";
  const deltaColor = m.isPositive ? GREEN : RED;
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: "8px 12px", background: "white" }}>
      <div style={{ fontSize: 8, color: TEXT_SUB, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, lineHeight: 1 }}>{m.current}</div>
      {m.delta && <div style={{ fontSize: 9, color: deltaColor, fontWeight: 700, marginTop: 3 }}>{arrow} {m.delta}</div>}
      {m.previous && <div style={{ fontSize: 8, color: TEXT_META, marginTop: 1 }}>prev: {m.previous}</div>}
    </div>
  );
}

// ─── BulletList ────────────────────────────────────────────────────────────────
function BulletList({ bullets, edits, slideId, startIdx = 0 }:
  { bullets: string[]; edits: Record<string, string>; slideId: string; startIdx?: number }) {
  return (
    <div>
      {bullets.map((b, bi) => {
        const text = r(edits, `${slideId}_bullet_${startIdx + bi}`, b);
        const isHeader = text.endsWith(":") || (bi === 0 && text === text.toUpperCase() && text.length < 40);
        if (isHeader) {
          return (
            <div key={bi} style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: bi > 0 ? 10 : 0, marginBottom: 4, borderBottom: `1px solid ${BORDER}`, paddingBottom: 3 }}>
              {text.replace(/:$/, "")}
            </div>
          );
        }
        return (
          <div key={bi} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
            <span style={{ color: RED, fontWeight: 900, fontSize: 11, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>›</span>
            <span style={{ fontSize: 10.5, color: TEXT_MED, lineHeight: 1.55 }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── ColumnPanel ───────────────────────────────────────────────────────────────
function ColumnPanel({ label, color, bg, children }: { label: string; color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 4, padding: "10px 14px", border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 8, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${BORDER}` }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Horizontal Bar Chart ──────────────────────────────────────────────────────
function HorizontalBarChart({ chartData, chartKeys }: { chartData: any[]; chartKeys: string[] }) {
  if (!chartData?.length || !chartKeys?.length) return null;

  // Parse values — handles formatted strings like "12.3K", "1.2M" and raw numbers
  function parseVal(v: any): number {
    if (typeof v === "number") return v;
    const s = String(v ?? "0").replace(/,/g, "");
    if (s === "—" || s === "" || s === "Manual entry needed") return 0;
    const m = s.match(/^([\d.]+)([KMB]?)$/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const mult = m[2].toUpperCase() === "K" ? 1000 : m[2].toUpperCase() === "M" ? 1_000_000 : m[2].toUpperCase() === "B" ? 1_000_000_000 : 1;
    return n * mult;
  }

  function fmtShort(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(Math.round(v));
  }

  const rows = chartData.slice(0, 8);
  const key0 = chartKeys[0] ?? "value";
  const key1 = chartKeys[1];

  const allVals = rows.flatMap(d => [parseVal(d[key0]), key1 ? parseVal(d[key1]) : 0]);
  const maxVal = Math.max(...allVals, 1);

  const LABEL_W = 110;
  const CHART_W = 200;
  const BAR_H = 9;
  const BAR_GAP = 3;
  const ROW_H = (key1 ? BAR_H * 2 + BAR_GAP : BAR_H) + 14;
  const W = LABEL_W + CHART_W + 40;
  const H = rows.length * ROW_H + 24;

  const COLORS = [NAVY, RED, "#2563EB", "#7C3AED"];
  const CLIENT_HIGHLIGHT = "#0D2240";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Key */}
      {chartKeys.slice(0, 2).map((k, ki) => (
        <g key={ki} transform={`translate(${ki * 110}, 0)`}>
          <rect x={0} y={4} width={10} height={8} rx={1} fill={COLORS[ki]} />
          <text x={14} y={12} fontSize={8} fill={TEXT_SUB}>{k}</text>
        </g>
      ))}

      {rows.map((d, ri) => {
        const isClient = d.label?.startsWith("★");
        const textColor = isClient ? NAVY : TEXT_MED;
        const y = 22 + ri * ROW_H;
        const label = (d.label ?? "").replace(/^★\s*/, "");
        const val0 = parseVal(d[key0]);
        const val1 = key1 ? parseVal(d[key1]) : 0;
        const w0 = Math.max(2, (val0 / maxVal) * CHART_W);
        const w1 = key1 ? Math.max(2, (val1 / maxVal) * CHART_W) : 0;

        return (
          <g key={ri} transform={`translate(0, ${y})`}>
            {isClient && (
              <rect x={0} y={-2} width={W} height={ROW_H - 2} rx={2} fill={`${NAVY}08`} />
            )}
            {/* Domain label */}
            <text x={LABEL_W - 4} y={BAR_H - 1} fontSize={8.5} textAnchor="end" fill={textColor} fontWeight={isClient ? "700" : "400"}>
              {label.length > 16 ? label.slice(0, 15) + "…" : label}
            </text>
            {/* Bar 0 */}
            <rect x={LABEL_W} y={0} width={w0} height={BAR_H} rx={2} fill={isClient ? CLIENT_HIGHLIGHT : COLORS[0]} opacity={isClient ? 1 : 0.6} />
            {val0 > 0 && (
              <text x={LABEL_W + w0 + 3} y={BAR_H - 1} fontSize={7.5} fill={TEXT_META}>{fmtShort(val0)}</text>
            )}
            {/* Bar 1 */}
            {key1 && (
              <>
                <rect x={LABEL_W} y={BAR_H + BAR_GAP} width={w1} height={BAR_H} rx={2} fill={isClient ? "#8B1A0E" : COLORS[1]} opacity={isClient ? 1 : 0.6} />
                {val1 > 0 && (
                  <text x={LABEL_W + w1 + 3} y={BAR_H + BAR_GAP + BAR_H - 1} fontSize={7.5} fill={TEXT_META}>{fmtShort(val1)}</text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── renderColContent ──────────────────────────────────────────────────────────
function renderColContent(col: any, edits: Record<string, string>, slideId: string) {
  if (!col) return null;
  if (col.type === "bullets") {
    return <BulletList bullets={col.bullets ?? []} edits={edits} slideId={slideId} />;
  }
  if (col.type === "table" && col.table) {
    return <PrintTable headers={col.table.headers} rows={col.table.rows} />;
  }
  if (col.type === "metrics") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(col.metrics ?? []).map((m: any, mi: number) => (
          <MetricBox key={mi} m={m} />
        ))}
      </div>
    );
  }
  if ((col.type === "chart-bar" || col.type === "chart-line") && col.chartData) {
    return <HorizontalBarChart chartData={col.chartData} chartKeys={col.chartKeys ?? ["value"]} />;
  }
  return null;
}

// ─── Slide Renderers ──────────────────────────────────────────────────────────

function TitleSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const subtitle = r(edits, `${slide.id}_subtitle`, slide.subtitle ?? "Content & SEO Mid-Strategy Check-in");
  return (
    <div style={{ background: `linear-gradient(140deg, ${NAVY_DARK} 0%, ${NAVY} 60%, #253F7A 100%)`, position: "relative", minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
      {/* Top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: RED }} />
      {/* Decorative geometric accent */}
      <div style={{ position: "absolute", right: -20, top: -20, width: 200, height: 200, background: `${RED}18`, borderRadius: "50%", transform: "rotate(0deg)" }} />
      <div style={{ position: "absolute", right: 60, bottom: -30, width: 120, height: 120, background: `${RED}10`, borderRadius: "50%" }} />
      {/* Content */}
      <div style={{ padding: "30px 44px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14 }}>
          {subtitle}
        </div>
        <div style={{ width: 36, height: 3, background: RED, marginBottom: 16 }} />
        <div style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1.15, maxWidth: 480, marginBottom: 20 }}>
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#BFD7FF" }}>
              {r(edits, `${slide.id}_client`, slide.clientName ?? "")}
            </div>
            <div style={{ fontSize: 10, color: "#93C5FD", marginTop: 2 }}>{slide.date}</div>
          </div>
        </div>
      </div>
      {/* Bottom bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 44, paddingRight: 44 }}>
        <span style={{ fontSize: 8, color: "#93C5FD", letterSpacing: "0.08em" }}>Webserv  ·  webserv.io</span>
        <span style={{ fontSize: 8, color: "#93C5FD" }}>CONFIDENTIAL</span>
      </div>
    </div>
  );
}

function DividerSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  return (
    <div style={{ background: `linear-gradient(120deg, ${NAVY_DARK} 0%, ${NAVY} 100%)`, position: "relative", minHeight: 130, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 44px" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: RED }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: RED }} />
      <div style={{ fontSize: 8, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>
        {slide.sectionLabel ?? "Section"}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1.2, maxWidth: 500 }}>
        {title}
      </div>
      {slide.subtitle && (
        <div style={{ fontSize: 11, color: "#BFD7FF", marginTop: 8 }}>
          {r(edits, `${slide.id}_subtitle`, slide.subtitle)}
        </div>
      )}
    </div>
  );
}

function AgendaSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const bullets = slide.bullets ?? [];
  const half = Math.ceil(bullets.length / 2);
  const left = bullets.slice(0, half);
  const right = bullets.slice(half);
  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: NAVY, padding: "14px 24px 12px" }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
          Mid-Strategy Check-in
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
          {r(edits, `${slide.id}_title`, slide.title ?? "Agenda")}
        </div>
      </div>
      <div style={{ height: 3, background: RED }} />
      {/* Numbered items in two columns */}
      <div style={{ flex: 1, padding: "14px 24px 10px", display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          {left.map((b, bi) => {
            const text = r(edits, `${slide.id}_bullet_${bi}`, b);
            return (
              <div key={bi} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
                <div style={{ minWidth: 22, height: 22, background: RED, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: "white" }}>{String(bi + 1).padStart(2, "0")}</span>
                </div>
                <span style={{ fontSize: 11, color: TEXT_MED, lineHeight: 1.45, paddingTop: 3 }}>{text}</span>
              </div>
            );
          })}
        </div>
        {right.length > 0 && (
          <div style={{ flex: 1 }}>
            {right.map((b, bi) => {
              const globalIdx = half + bi;
              const text = r(edits, `${slide.id}_bullet_${globalIdx}`, b);
              return (
                <div key={bi} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
                  <div style={{ minWidth: 22, height: 22, background: `${NAVY}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "white" }}>{String(globalIdx + 1).padStart(2, "0")}</span>
                  </div>
                  <span style={{ fontSize: 11, color: TEXT_MED, lineHeight: 1.45, paddingTop: 3 }}>{text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SlideFooter />
    </div>
  );
}

function BulletsSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const confidence = slide.confidence;
  const sources = slide.sources;
  const sectionLabel = slide.sectionLabel;
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const subtitle = slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined;
  const bullets = slide.bullets ?? [];

  return (
    <ContentShell sectionLabel={sectionLabel} title={title} subtitle={subtitle} sources={sources} confidence={confidence}>
      <BulletList bullets={bullets} edits={edits} slideId={slide.id} />
    </ContentShell>
  );
}

function TwoColSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const confidence = slide.confidence;
  const sources = slide.sources;
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const subtitle = slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined;

  // Detect if right column is a chart
  const rightIsChart = slide.rightContent?.type === "chart-bar" || slide.rightContent?.type === "chart-line";

  // Determine column labels
  const leftLabel = detectColumnLabel(slide.leftContent);
  const rightLabel = rightIsChart ? "Organic Competitive Footprint" : detectColumnLabel(slide.rightContent);

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px 0", background: "white" }}>
        {slide.sectionLabel && <SectionTag label={slide.sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: subtitle ? 4 : 0 }} />
        {subtitle && <SlideSubtitle subtitle={subtitle} />}
      </div>
      {/* Two columns */}
      <div style={{ flex: 1, padding: "10px 24px 0 24px", display: "flex", gap: 12 }}>
        <ColumnPanel label={leftLabel} color={NAVY} bg={PANEL_L}>
          {renderColContent(slide.leftContent, edits, slide.id)}
        </ColumnPanel>
        <ColumnPanel label={rightLabel} color={rightIsChart ? NAVY : RED} bg={rightIsChart ? "white" : PANEL_R}>
          {renderColContent(slide.rightContent, edits, slide.id)}
        </ColumnPanel>
      </div>
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={sources} confidence={confidence} />
      </div>
      <SlideFooter label={slide.sectionLabel} />
    </div>
  );
}

function detectColumnLabel(col: any): string {
  if (!col) return "";
  const bullets: string[] = col.bullets ?? [];
  if (bullets.length > 0) {
    const first = bullets[0]?.toUpperCase() ?? "";
    if (first.includes("FINDING") || first.includes("WHAT WE'RE SEEING") || first.includes("TRUST AUDIT")) return "Findings";
    if (first.includes("FIX") || first.includes("ACTION") || first.includes("RECOMMENDED") || first.includes("WHAT WE'RE FIXING") || first.includes("TRUST ACTION") || first.includes("PRIORITY")) return "Actions";
    if (first.includes("WEBSERV")) return "Webserv Actions";
    if (first.includes("INTEGRATION")) return "Integration Gaps";
  }
  if (col.type === "metrics") return "Client Actions";
  if (col.type === "table") return "Data";
  return "Details";
}

function ScorecardSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const subtitle = slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined;
  const commentary = r(edits, `${slide.id}_commentary`, slide.commentary ?? "");
  const { headers, rows } = slide.table ?? { headers: [], rows: [] };

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px 0" }}>
        {slide.sectionLabel && <SectionTag label={slide.sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: subtitle ? 4 : 0 }} />
        {subtitle && <SlideSubtitle subtitle={subtitle} />}
      </div>
      <div style={{ flex: 1, padding: "10px 24px 0 24px" }}>
        {headers.length > 0 && <PrintTable headers={headers} rows={rows} />}
        {commentary && (
          <div style={{ marginTop: 10, padding: "8px 14px", background: PANEL_L, borderLeft: `3px solid ${NAVY}`, borderRadius: 2, fontSize: 10, color: TEXT_MED, lineHeight: 1.55 }}>
            {commentary}
          </div>
        )}
      </div>
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={slide.sources} confidence={slide.confidence} />
      </div>
      <SlideFooter label="Priority Actions" />
    </div>
  );
}

function DecisionCardSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const options = slide.decisionOptions ?? [];
  const conclusion = r(edits, `${slide.id}_conclusion`, slide.decisionConclusion ?? "");

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px 0" }}>
        {slide.sectionLabel && <SectionTag label={slide.sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: slide.subtitle ? 4 : 0 }} />
        {slide.subtitle && <SlideSubtitle subtitle={r(edits, `${slide.id}_subtitle`, slide.subtitle)} />}
      </div>
      <div style={{ flex: 1, padding: "10px 24px 0 24px", display: "flex", gap: 12 }}>
        {options.map((opt, oi) => (
          <div key={oi} style={{
            flex: 1, border: opt.recommended ? `2px solid ${RED}` : `1px solid ${BORDER}`,
            borderRadius: 5, padding: "12px 14px", background: opt.recommended ? "#FFF5F5" : GRAY_BG,
          }}>
            {opt.recommended && (
              <div style={{ fontSize: 7.5, fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>★ Recommended</div>
            )}
            <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 3, lineHeight: 1.2 }}>
              {r(edits, `${slide.id}_opt_${oi}_label`, opt.label)}
            </div>
            {opt.subtitle && <div style={{ fontSize: 9, color: TEXT_SUB, marginBottom: 7 }}>{opt.subtitle}</div>}
            {opt.pros.map((p, pi) => (
              <div key={pi} style={{ display: "flex", gap: 5, fontSize: 9.5, color: TEXT_MED, marginBottom: 3 }}>
                <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                <span>{r(edits, `${slide.id}_opt_${oi}_pro_${pi}`, p)}</span>
              </div>
            ))}
            {(opt.cons ?? []).map((c, ci) => (
              <div key={ci} style={{ display: "flex", gap: 5, fontSize: 9.5, color: TEXT_MED, marginBottom: 3 }}>
                <span style={{ color: RED, fontWeight: 700 }}>✗</span>
                <span>{r(edits, `${slide.id}_opt_${oi}_con_${ci}`, c)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {conclusion && (
        <div style={{ margin: "8px 24px 0", padding: "8px 14px", background: PANEL_L, borderLeft: `3px solid ${NAVY}`, borderRadius: 2, fontSize: 10, color: TEXT_MED, lineHeight: 1.5 }}>
          {conclusion}
        </div>
      )}
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={slide.sources} confidence={slide.confidence} />
      </div>
      <SlideFooter />
    </div>
  );
}

function NextStepsSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "Next Steps");
  const leftBullets: string[] = slide.leftContent?.bullets ?? [];
  const rightBullets: string[] = slide.rightContent?.bullets ?? [];
  const rightMetrics: any[] = slide.rightContent?.metrics ?? [];

  // Build right-side items from either bullets or metrics
  const rightItems: string[] = rightBullets.length > 0
    ? rightBullets
    : rightMetrics.map((m: any) => m.current ?? "").filter(Boolean);

  // Filter out header items from left
  const webservHeader = leftBullets[0]?.toUpperCase().includes("WEBSERV") ? leftBullets[0] : null;
  const webservItems = webservHeader ? leftBullets.slice(1) : leftBullets;

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: NAVY, padding: "14px 24px 12px" }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
          Closing Actions
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
          {title}
        </div>
      </div>
      <div style={{ height: 3, background: RED }} />
      {/* Two-column ownership grid */}
      <div style={{ flex: 1, padding: "14px 24px 10px", display: "flex", gap: 16 }}>
        {/* Webserv column */}
        <div style={{ flex: 1 }}>
          <div style={{ background: NAVY, borderRadius: "4px 4px 0 0", padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, background: RED, borderRadius: "50%" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>Webserv</span>
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "10px 14px" }}>
            {webservItems.filter((_, i) => i < 6).map((item, ii) => (
              <div key={ii} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ minWidth: 18, height: 18, background: RED, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: "white" }}>{ii + 1}</span>
                </div>
                <span style={{ fontSize: 10, color: TEXT_MED, lineHeight: 1.5, paddingTop: 2 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Client column */}
        <div style={{ flex: 1 }}>
          <div style={{ background: "#374151", borderRadius: "4px 4px 0 0", padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, background: "#93C5FD", borderRadius: "50%" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>Client Team</span>
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "10px 14px" }}>
            {rightItems.filter((_, i) => i < 5).map((item, ii) => (
              <div key={ii} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ minWidth: 18, height: 18, background: "#374151", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: "white" }}>{ii + 1}</span>
                </div>
                <span style={{ fontSize: 10, color: TEXT_MED, lineHeight: 1.5, paddingTop: 2 }}>{item}</span>
              </div>
            ))}
            {rightItems.length === 0 && (
              <div style={{ fontSize: 10, color: TEXT_META, fontStyle: "italic", padding: "4px 0" }}>
                To be confirmed at next checkpoint
              </div>
            )}
          </div>
        </div>
      </div>
      <SlideFooter />
    </div>
  );
}

function UrlAuditSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "Crawl Audit");
  const bullets = slide.bullets ?? [];
  const hasTable = !!(slide.table?.headers?.length);

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px 0" }}>
        {slide.sectionLabel && <SectionTag label={slide.sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: slide.subtitle ? 4 : 0 }} />
        {slide.subtitle && <SlideSubtitle subtitle={r(edits, `${slide.id}_subtitle`, slide.subtitle)} />}
      </div>
      <div style={{ flex: 1, padding: "10px 24px 0 24px" }}>
        {/* Insight callout */}
        {bullets.length > 0 && (
          <div style={{ background: PANEL_L, borderLeft: `4px solid ${NAVY}`, borderRadius: 3, padding: "8px 12px", marginBottom: 10 }}>
            {bullets.slice(0, 3).map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 7, marginBottom: bi < Math.min(bullets.length, 3) - 1 ? 5 : 0 }}>
                <span style={{ color: RED, fontWeight: 900, fontSize: 11, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>›</span>
                <span style={{ fontSize: 10, color: TEXT_MED, lineHeight: 1.5 }}>{r(edits, `${slide.id}_bullet_${bi}`, b)}</span>
              </div>
            ))}
          </div>
        )}
        {/* Data table */}
        {hasTable && (
          <PrintTable headers={slide.table!.headers} rows={slide.table!.rows.slice(0, 10)} compact />
        )}
      </div>
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={slide.sources} confidence={slide.confidence} />
      </div>
      <SlideFooter label="Technical Findings" />
    </div>
  );
}

function IAComparisonSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const current = slide.currentIA ?? [];
  const future = slide.futureIA ?? [];

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px 0" }}>
        {slide.sectionLabel && <SectionTag label={slide.sectionLabel} />}
        <SlideTitle title={title} />
        <div style={{ height: 3, width: 40, background: RED, marginTop: 6, marginBottom: slide.commentary ? 4 : 0 }} />
        {slide.commentary && <SlideSubtitle subtitle={r(edits, `${slide.id}_commentary`, slide.commentary)} />}
      </div>
      <div style={{ flex: 1, padding: "10px 24px 0 24px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${NAVY}30` }}>Current Structure</div>
          <div style={{ background: PANEL_L, borderRadius: 3, padding: 10 }}>
            {current.map((item, ii) => (
              <div key={ii} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: NAVY, padding: "2px 7px", background: `${NAVY}15`, borderRadius: 2, display: "inline-block" }}>
                  {r(edits, `${slide.id}_cur_${ii}`, item.label)}
                </div>
                {item.children?.map((c, ci) => <div key={ci} style={{ fontSize: 8.5, color: TEXT_SUB, paddingLeft: 12, marginTop: 2 }}>— {c}</div>)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 24 }}>
          <span style={{ fontSize: 20, color: RED, fontWeight: 900 }}>→</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${GREEN}30` }}>Future Structure</div>
          <div style={{ background: "#F0FAF4", borderRadius: 3, padding: 10 }}>
            {future.map((item, ii) => (
              <div key={ii} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#065F46", padding: "2px 7px", background: "#D1FAE5", borderRadius: 2, display: "inline-block" }}>
                  {r(edits, `${slide.id}_fut_${ii}`, item.label)}
                </div>
                {item.children?.map((c, ci) => <div key={ci} style={{ fontSize: 8.5, color: TEXT_SUB, paddingLeft: 12, marginTop: 2 }}>— {c}</div>)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 6px" }}>
        <SourcesMeta sources={slide.sources} confidence={slide.confidence} />
      </div>
      <SlideFooter />
    </div>
  );
}

function MetricsSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const mets = slide.metrics ?? [];
  const cols = Math.min(4, mets.length || 1);
  const commentary = r(edits, `${slide.id}_commentary`, slide.commentary ?? "");

  return (
    <ContentShell sectionLabel={slide.sectionLabel} title={title} subtitle={slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined} sources={slide.sources} confidence={slide.confidence}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
        {mets.map((m, mi) => <MetricBox key={mi} m={m} />)}
      </div>
      {commentary && (
        <div style={{ marginTop: 10, padding: "6px 12px", background: PANEL_L, borderLeft: `3px solid ${NAVY}`, borderRadius: 2, fontSize: 10, color: TEXT_MED, lineHeight: 1.5, fontStyle: "italic" }}>
          {commentary}
        </div>
      )}
    </ContentShell>
  );
}

function TableSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  return (
    <ContentShell sectionLabel={slide.sectionLabel} title={title} subtitle={slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined} sources={slide.sources} confidence={slide.confidence}>
      {slide.table && <PrintTable headers={slide.table.headers} rows={slide.table.rows} />}
    </ContentShell>
  );
}

function ClusterMapSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const title = r(edits, `${slide.id}_title`, slide.title ?? "");
  const cols = Math.max(1, Math.min(4, (slide.clusters ?? []).length));
  return (
    <ContentShell sectionLabel={slide.sectionLabel} title={title} sources={slide.sources} confidence={slide.confidence}>
      {slide.commentary && (
        <div style={{ fontSize: 10, color: TEXT_SUB, marginBottom: 8 }}>{r(edits, `${slide.id}_commentary`, slide.commentary)}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
        {(slide.clusters ?? []).map((cluster, ci) => (
          <div key={ci} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: NAVY, color: "white", fontSize: 9, fontWeight: 700, padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {r(edits, `${slide.id}_cluster_${ci}_hub`, cluster.hub)}
            </div>
            <div style={{ padding: 6 }}>
              {cluster.pages.map((page, pi) => (
                <div key={pi} style={{ fontSize: 8.5, color: TEXT_MED, padding: "2px 4px", borderBottom: `1px solid ${GRAY_BG}`, display: "flex", gap: 4 }}>
                  <span style={{ color: RED, fontSize: 7 }}>●</span>
                  <span>{r(edits, `${slide.id}_cluster_${ci}_page_${pi}`, page)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ContentShell>
  );
}

// ─── Main Slide Dispatcher ────────────────────────────────────────────────────

function PrintSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  if (slide.type === "title") return <TitleSlide slide={slide} edits={edits} />;
  if (slide.type === "divider") return <DividerSlide slide={slide} edits={edits} />;

  // Agenda slide: bullets type with id s02_agenda
  if (slide.id === "s02_agenda" && slide.type === "bullets") return <AgendaSlide slide={slide} edits={edits} />;

  // URL audit slide: bullets type with optional table
  if (slide.id === "s09b_url_audit") return <UrlAuditSlide slide={slide} edits={edits} />;

  // Next steps slide
  if (slide.id === "s15_next_steps") return <NextStepsSlide slide={slide} edits={edits} />;

  if (slide.type === "bullets") return <BulletsSlide slide={slide} edits={edits} />;
  if (slide.type === "two-col" && slide.leftContent && slide.rightContent) return <TwoColSlide slide={slide} edits={edits} />;
  if (slide.type === "scorecard") return <ScorecardSlide slide={slide} edits={edits} />;
  if (slide.type === "decision-card" && slide.decisionOptions) return <DecisionCardSlide slide={slide} edits={edits} />;
  if (slide.type === "ia-comparison") return <IAComparisonSlide slide={slide} edits={edits} />;
  if (slide.type === "metrics") return <MetricsSlide slide={slide} edits={edits} />;
  if (slide.type === "table" && slide.table) return <TableSlide slide={slide} edits={edits} />;
  if (slide.type === "cluster-map") return <ClusterMapSlide slide={slide} edits={edits} />;

  // chart-bar / chart-line standalone
  if ((slide.type === "chart-bar" || slide.type === "chart-line") && slide.chartData) {
    return (
      <ContentShell sectionLabel={slide.sectionLabel} title={r(edits, `${slide.id}_title`, slide.title ?? "")} subtitle={slide.subtitle ? r(edits, `${slide.id}_subtitle`, slide.subtitle) : undefined} sources={slide.sources} confidence={slide.confidence}>
        <HorizontalBarChart chartData={slide.chartData} chartKeys={slide.chartKeys ?? ["value"]} />
      </ContentShell>
    );
  }

  // Fallback
  return (
    <ContentShell title={r(edits, `${slide.id}_title`, slide.title ?? "")}>
      <div style={{ fontSize: 10, color: TEXT_META, padding: "8px 0" }}>Slide type: {slide.type}</div>
    </ContentShell>
  );
}

// ─── Page Root ─────────────────────────────────────────────────────────────────

export default function MidStrategyPrint() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch("/api/auth/bootstrap")
      .then(res => res.json())
      .then(({ token: authToken }) =>
        fetch(`/api/print-cache/${token}`, { headers: { "X-Internal-Token": authToken } })
          .then(res => { if (!res.ok) throw new Error(`${res.status}`); return res.json(); })
          .then(d => setData(d))
      )
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 32, fontFamily: "sans-serif" }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32, fontFamily: "sans-serif" }}>Loading…</div>;

  const { report, edits } = data;
  const slides: SlideData[] = (report.slides ?? []).filter((s: SlideData) => !s.hidden);

  return (
    <div data-report-root style={{ background: "#EAECEF", margin: 0, padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        html, body { margin: 0; padding: 0; background: #EAECEF; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button { display: none !important; }
        @media print { body { background: white; } }
      `}</style>

      <div style={{ width: "10in", margin: "0 auto", padding: 0 }}>
        {slides.map((slide, i) => (
          <div key={slide.id} style={{ marginBottom: i < slides.length - 1 ? 6 : 0, pageBreakAfter: i < slides.length - 1 ? "always" : "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <PrintSlide slide={slide} edits={edits} />
          </div>
        ))}
      </div>
    </div>
  );
}
