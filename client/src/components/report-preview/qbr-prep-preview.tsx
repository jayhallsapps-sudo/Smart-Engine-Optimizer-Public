import React, { useState, useEffect, useRef } from "react";
import { EyeOff, Eye } from "lucide-react";
import { EditableSection } from "./editable-section";
import { AddableReportTable, SourceBadge } from "./report-table";
import swoopHeaderFallback from "@assets/HEADER_IMAGE_1773063127856.png";

const ACCENT = "#C0392B";

// Last-resort guardrail: if an AM input field somehow contains internal prompt/implementation
// artifacts (e.g. from accidental paste or upstream contamination), block rendering and surface
// a controlled error state. This is NOT the primary fix — it is a safety net only.
const PROMPT_ARTIFACT_SIGNALS = [
  "PRIMARY PRODUCT GOAL",
  "CURRENT PROBLEMS THAT MUST BE FIXED",
  "NON-NEGOTIABLE PRODUCT RULES",
  "WHAT MID-STRATEGY SHOULD ACTUALLY ANALYZE",
  "REQUIRED OUTPUT",
  "FINAL WARNING",
  "SLIDE GENERATION PHILOSOPHY",
  "DESIGN REQUIREMENT",
  "COLOUR + LAYOUT RULES",
  "CRITICAL WORDING RULE",
  "NON-NEGOTIABLE FIX REQUIREMENTS",
  "STRICT QA ACCEPTANCE CRITERIA",
];
function isPromptArtifact(text: string | undefined): boolean {
  if (!text) return false;
  const upper = text.toUpperCase();
  return PROMPT_ARTIFACT_SIGNALS.some(s => upper.includes(s));
}

const SECTION_DEFS = [
  { key: "section_goals", title: "What Matters Most This Quarter" },
  { key: "section_conversions", title: "Where Conversions Actually Happen" },
  { key: "section_traffic", title: "Top Organic Traffic Drivers" },
  { key: "section_services", title: "Levels of Care Overview" },
  { key: "section_diagnosis", title: "SEO Tier Diagnosis" },
  { key: "section_priorities", title: "What We Need to Do Next" },
  { key: "section_keywords", title: "Suggested Keywords for Next Quarter" },
  { key: "section_tracking", title: "What We Track" },
  { key: "section_opportunities", title: "Additional Opportunities" },
];
const SECTION_TABLES: Record<string, string[]> = {
  section_conversions: ["table_s2_pages", "table_s2_patterns", "table_s2_sources"],
  section_traffic: ["table_s3_topics", "table_s3_pages"],
  section_services: ["table_s4_services"],
  section_priorities: ["table_s6"],
  section_tracking: ["table_s8"],
};
function isSectionAutoHidden(secKey: string, hiddenTables: Record<string, boolean>): boolean {
  const tables = SECTION_TABLES[secKey];
  return !!(tables && tables.length > 0 && tables.every(t => hiddenTables[t]));
}
function computeSectionNums(hiddenSections: Record<string, boolean>, hiddenTables: Record<string, boolean>, hasKeywords: boolean, hasOpps: boolean): Record<string, number> {
  const result: Record<string, number> = {};
  let n = 1;
  for (const def of SECTION_DEFS) {
    if (def.key === "section_keywords" && !hasKeywords) continue;
    if (def.key === "section_opportunities" && !hasOpps) continue;
    if (hiddenSections[def.key] || isSectionAutoHidden(def.key, hiddenTables)) continue;
    result[def.key] = n++;
  }
  return result;
}

interface CreditMonthBlock {
  month: string;
  rows: Array<{ credits: number; activity: string }>;
}

interface SuggestedKeywordRow {
  keyword: string;
  recommendationType: "optimize-existing" | "refresh-existing" | "create-new" | "cro-update" | "internal-linking";
  targetPage: string;
  whyRecommended: string;
  sources: string[];
}

interface SectionSuggestedKeywords {
  rows: SuggestedKeywordRow[];
  quarterlyCreditCap: number;
  monthlyCredits: number;
}

interface QbrPrepMeta {
  site: string;
  domain: string;
  primaryLocation: string;
  programPositioning: string;
  analysisWindow: string;
  planningQuarter: string;
  generatedOn: string;
}

interface GoalRow {
  goalType: string;
  goal: string;
  measurementSource: string;
  goalShift: string;
  reason: string;
}

interface ConvertingPageRow {
  type: string;
  page: string;
  notes: string;
  dataSource?: string;
}

interface ConvertingSourceRow {
  source: string;
  whatsConverting: string;
  notes: string;
  dataSource?: string;
}

interface ConversionPatternRow {
  pattern: string;
  whyItMatters: string;
  evidence: string;
}

interface TrafficTopicRow {
  topic: string;
  exampleQueries: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
  queryCount?: number;
  queryCountDelta?: string;
  impressions?: number;
  impressionsDelta?: string;
}

interface TrafficPageRow {
  page: string;
  clicks: string;
  clicksDelta?: string;
  impressions?: string;
  impressionsDelta?: string;
  queries?: string;
  queriesDelta?: string;
  ctr: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
}

interface ServiceRow {
  service: string;
  examplePage: string;
  seoScore?: number;
  notes?: string;
}

interface TierScorecardEntry {
  tierNumber: number;
  tierName: string;
  status: "Pass" | "Partial" | "Blocked" | "Unknown";
  findings: string;
  inferences: string;
  whyItMatters: string;
  source: string;
}

interface PriorityRow {
  priority: number;
  initiative: string;
  tier: string;
  action: string;
  reason: string;
  source?: string;
  actionType?: string;
  impact?: string;
}

interface TrackingRow {
  focusArea: string;
  metric: string;
  source: string;
  whyItMatters: string;
}

interface QssbInsight { question: string; }
interface QssbOpportunity { title: string; description: string; }
interface SectionQssb { clientInsights: QssbInsight[]; additionalOpportunities: QssbOpportunity[]; }

interface AdditionalOpportunity {
  type: "upsell" | "cross_sell";
  title: string;
  why_now: string;
  evidence: string[];
  recommendation: string;
  framing: string;
}

export interface QbrPrepPreviewProps {
  meta: QbrPrepMeta;
  section1Goals: { rows: GoalRow[] };
  section2Conversions: { topConvertingPages: ConvertingPageRow[]; topConversionPatterns?: ConversionPatternRow[]; topConvertingSources: ConvertingSourceRow[]; trackingDisclaimer?: string };
  section3Traffic: { topTrafficTopics: TrafficTopicRow[]; topTrafficPages: TrafficPageRow[] };
  section4Services: { services: ServiceRow[] };
  section5Diagnosis: { tier: number; tierName: string; diagnosis: string; tierScorecard?: TierScorecardEntry[] };
  section6Priorities: { priorities: PriorityRow[]; shortSummary?: string[]; crossSellPreview?: any[]; auditMissing?: boolean; strategyBankFetchFailed?: boolean };
  section7Tracking: { tracking: TrackingRow[] };
  section7Credits?: { months: CreditMonthBlock[] };
  sectionSuggestedKeywords?: SectionSuggestedKeywords;
  sectionQssb?: SectionQssb;
  additionalOpportunities?: AdditionalOpportunity[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  generationMeta?: { dataSources: string[]; missingData: string[] };
  amInputs?: { clientSentiment?: string; amThoughts?: string; prevQtrAssessment?: string; priorityChecks?: string; clientNotes?: string; creditUsage?: string };
  hiddenSections?: Record<string, boolean>;
  hiddenTables?: Record<string, boolean>;
  onToggleSection?: (key: string) => void;
  onToggleTable?: (key: string) => void;
}

function SeoScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#065F46" : score >= 6 ? "#92400E" : score >= 4 ? "#B45309" : "#991B1B";
  const bg = score >= 8 ? "#D1FAE5" : score >= 6 ? "#FEF3C7" : score >= 4 ? "#FEF3C7" : "#FEE2E2";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, backgroundColor: bg, color, fontWeight: 700, fontSize: "11px" }}>
      {score}/10
    </span>
  );
}

function ActionTypeBadge({ value }: { value: string }) {
  const COLOR_MAP: Record<string, [string, string]> = {
    "Technical SEO": ["#374151", "#F3F4F6"],
    "Tracking / Analytics": ["#1E40AF", "#DBEAFE"],
    "CRO": ["#9A3412", "#FFEDD5"],
    "Content": ["#5B21B6", "#EDE9FE"],
    "IA / Architecture": ["#1E3A5F", "#DBEAFE"],
    "Local SEO": ["#065F46", "#D1FAE5"],
    "Internal Linking": ["#0F766E", "#CCFBF1"],
    "Link Building": ["#991B1B", "#FEE2E2"],
  };
  const [color, bg] = COLOR_MAP[value] ?? ["#374151", "#F3F4F6"];
  if (!value) return null;
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 10, backgroundColor: bg, color, fontWeight: 600, fontSize: "10px", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

function TierScorecardCard({ entry }: { entry: TierScorecardEntry }) {
  const STATUS_MAP: Record<string, [string, string]> = {
    "Pass": ["#065F46", "#D1FAE5"],
    "Partial": ["#92400E", "#FEF3C7"],
    "Blocked": ["#991B1B", "#FEE2E2"],
    "Unknown": ["#374151", "#F3F4F6"],
  };
  const [sColor, sBg] = STATUS_MAP[entry.status] ?? ["#374151", "#F3F4F6"];
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <span style={{ fontWeight: 700, fontSize: "11px", color: ACCENT }}>Tier {entry.tierNumber} — {entry.tierName}</span>
        <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 10, backgroundColor: sBg, color: sColor, fontWeight: 700, fontSize: "10px" }}>{entry.status}</span>
      </div>
      <div style={{ padding: "8px 12px", fontSize: "10.5px", lineHeight: 1.55 }}>
        <div style={{ marginBottom: 5 }}><span style={{ fontWeight: 600, color: "#374151" }}>Findings: </span><span style={{ color: "#4B5563" }}>{entry.findings}</span></div>
        <div style={{ marginBottom: 5 }}><span style={{ fontWeight: 600, color: "#374151" }}>Inference: </span><span style={{ color: "#4B5563" }}>{entry.inferences}</span></div>
        <div style={{ marginBottom: 5 }}><span style={{ fontWeight: 600, color: "#374151" }}>Why It Matters: </span><span style={{ color: "#6B7280" }}>{entry.whyItMatters}</span></div>
        <div style={{ color: "#9CA3AF", fontSize: "10px" }}>Source: {entry.source}</div>
      </div>
    </div>
  );
}

function QueryChipsCell({
  editKey,
  value,
  edits,
  onEdit,
}: {
  editKey: string;
  value: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = edits[editKey] ?? value;
  const chips = current
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);

  function startEdit() {
    setDraft(current);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    onEdit(editKey, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "100%" }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 6px", fontSize: "10px", outline: "none" }}
          data-testid={`input-edit-${editKey}`}
        />
      </span>
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 3 }}
      data-testid={`chips-${editKey}`}
    >
      {chips.length > 0 ? chips.map((chip, ci) => (
        <span
          key={ci}
          style={{
            display: "inline-block",
            background: `${ACCENT}12`,
            border: `1px solid ${ACCENT}28`,
            borderRadius: 10,
            padding: "1px 7px",
            fontSize: "9px",
            color: "#374151",
            fontWeight: 500,
            whiteSpace: "normal",
            wordBreak: "break-word",
          }}
          data-testid={`chip-query-${editKey}-${ci}`}
        >
          {chip}
        </span>
      )) : (
        <span style={{ color: "#9CA3AF", fontSize: "10px", fontStyle: "italic" }}>—</span>
      )}
    </span>
  );
}

function EditableCell({
  editKey,
  value,
  edits,
  onEdit,
  style,
  normalize,
}: {
  editKey: string;
  value: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  style?: React.CSSProperties;
  normalize?: (v: string) => string;
}) {
  const normalizedValue = normalize ? normalize(value) : value;
  const normalizedEdits = normalize && edits[editKey] !== undefined
    ? { ...edits, [editKey]: normalize(edits[editKey]) }
    : edits;
  const display = normalizedEdits[editKey] ?? normalizedValue;
  const isManual = display.includes("Manual entry needed");

  return (
    <EditableSection
      editKey={editKey}
      value={normalizedValue}
      edits={normalizedEdits}
      onEdit={onEdit}
      as="span"
      className={isManual ? "italic text-gray-400" : ""}
      style={style}
    />
  );
}


function isPathLike(v: string): boolean {
  const t = v.trim();
  return /^\/[a-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*/i.test(t) || /^https?:\/\//i.test(t);
}

function PathTag({ value }: { value: string }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: "9px", fontWeight: 500, backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, color: "#374151", wordBreak: "break-all" }}>
      {value}
    </span>
  );
}

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  "1": { bg: "#FEE2E2", color: "#991B1B" },
  "2": { bg: "#FEF3C7", color: "#92400E" },
  "3": { bg: "#DBEAFE", color: "#1E40AF" },
};
function TierBadge({ tier }: { tier: string }) {
  const t = tier.replace(/[^0-9]/g, "");
  const colors = TIER_COLORS[t] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: colors.bg, color: colors.color, whiteSpace: "nowrap" }}>
      {tier || "—"}
    </span>
  );
}

function HiddenSectionBar({ secKey, num, title, onShow }: { secKey: string; num?: number; title: string; onShow: () => void }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 4, padding: "5px 8px", backgroundColor: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 4, fontSize: "10px", color: "#9CA3AF" }}
      data-testid={`section-hidden-bar-${secKey}`}
    >
      <EyeOff size={10} />
      <span style={{ fontStyle: "italic" }}>{title} — hidden from report</span>
      <button
        onClick={onShow}
        data-testid={`button-show-section-${secKey}`}
        style={{ color: ACCENT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "10px", marginLeft: 2 }}
      >Show in report</button>
    </div>
  );
}

function SectionHeading({ num, title, onHide }: { num: number; title: string; onHide?: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: ACCENT,
        fontWeight: 700,
        fontSize: "14px",
        borderBottom: `2px solid ${ACCENT}`,
        paddingBottom: 4,
        marginBottom: 12,
        marginTop: num > 1 ? 28 : 0,
      }}
      data-testid={`section-heading-${num}`}
    >
      <span>{num}. {title}</span>
      {onHide && (
        <button
          onClick={onHide}
          title="Hide from report"
          data-testid={`button-hide-section-${num}`}
          style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: "10px", fontWeight: 400, padding: "0 2px" }}
        >
          <EyeOff size={10} /><span>Hide</span>
        </button>
      )}
    </div>
  );
}

function parseS7Sources(source: string): string[] {
  return source.split(" + ").map(s => {
    if (s === "Google Search Console") return "GSC";
    if (s === "Call Tracking") return "CallRail";
    return s;
  });
}

function computeSharedSource(sources: (string | undefined)[]): string | null {
  const filtered = sources.filter(
    (s): s is string => !!s && s !== "Manual entry needed" && s !== "—" && s !== "Site Structure"
  );
  if (filtered.length === 0) return null;
  const unique = Array.from(new Set(filtered));
  return unique.length === 1 ? unique[0] : null;
}

function computeSharedSourceList(sourceSets: string[][]): string | null {
  if (sourceSets.length === 0) return null;
  const joined = sourceSets.map(s => Array.from(s).sort().join("+"));
  const unique = Array.from(new Set(joined));
  if (unique.length !== 1) return null;
  return sourceSets[0].join(" + ") || null;
}

function BadgeCell({
  editKey,
  value,
  dataSource,
  edits,
  onEdit,
}: {
  editKey: string;
  value: string;
  dataSource?: string;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <EditableCell editKey={editKey} value={value} edits={edits} onEdit={onEdit} />
      {dataSource && <SourceBadge source={dataSource} />}
    </span>
  );
}

export function QbrPrepPreview({
  meta,
  section1Goals,
  section2Conversions,
  section3Traffic,
  section4Services,
  section5Diagnosis,
  section6Priorities,
  section7Tracking,
  section7Credits,
  sectionSuggestedKeywords,
  sectionQssb,
  additionalOpportunities,
  edits,
  onEdit,
  generationMeta,
  amInputs,
  hiddenSections = {},
  hiddenTables = {},
  onToggleSection,
  onToggleTable,
}: QbrPrepPreviewProps) {
  const [headerImgUrl, setHeaderImgUrl] = useState<string | null>(null);
  const [showSection8, setShowSection8] = useState(true);

  const hasKeywords = (sectionSuggestedKeywords?.rows?.length ?? 0) > 0;
  const hasOpps = (additionalOpportunities?.length ?? 0) > 0 || showSection8;
  const sectionNums = computeSectionNums(hiddenSections, hiddenTables, hasKeywords, hasOpps);

  const hideSecBtn = (key: string) => onToggleSection ? () => onToggleSection(key) : undefined;
  const hideTblBtn = (key: string) => onToggleTable ? () => onToggleTable(key) : undefined;

  const tblHiddenBar = (tblKey: string, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "4px 8px", backgroundColor: "#F9FAFB", border: "1px dashed #E5E7EB", borderRadius: 4, fontSize: "10px", color: "#9CA3AF" }}>
      <EyeOff size={9} /><span style={{ fontStyle: "italic" }}>{label} — hidden from report</span>
      <button onClick={() => onToggleTable?.(tblKey)} style={{ color: ACCENT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "10px" }}>Show</button>
    </div>
  );
  const tblSubLabel = (tblKey: string, label: string, hidden: boolean, sources?: string[]) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hidden ? 0 : 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11px", fontWeight: 600, color: "#374151" }}>
        {label}
        {sources && sources.map((src, si) => <SourceBadge key={si} source={src} />)}
      </div>
      {onToggleTable && (
        <button onClick={() => onToggleTable(tblKey)} style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, fontSize: "9px", padding: "0 2px" }}>
          {hidden ? <><Eye size={9} /><span>Show table</span></> : <><EyeOff size={9} /><span>Hide table</span></>}
        </button>
      )}
    </div>
  );

  useEffect(() => {
    fetch("/api/template/header")
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setHeaderImgUrl(URL.createObjectURL(blob)))
      .catch(() => setHeaderImgUrl(null));
  }, []);

  const s1SourceRows: React.ReactNode[][] = section1Goals.rows.map((r, ri) => [
    <span key="g" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <EditableCell editKey={`s1_${ri}_0`} value={r.goalType} edits={edits} onEdit={onEdit} />
      {r.measurementSource && r.measurementSource !== "—" && (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
          {(edits[`s1_${ri}_2`] ?? r.measurementSource).split(/[,+]/).map((s, si) => (
            <SourceBadge key={si} source={s.trim()} />
          ))}
        </span>
      )}
    </span>,
    <EditableCell key="go" editKey={`s1_${ri}_1`} value={r.goal} edits={edits} onEdit={onEdit} />,
    <EditableCell key="gs" editKey={`s1_${ri}_3`} value={r.goalShift} edits={edits} onEdit={onEdit} normalize={(v) => v === "0%" ? "Par" : v} />,
    <EditableCell key="r" editKey={`s1_${ri}_4`} value={r.reason} edits={edits} onEdit={onEdit} />,
  ]);

  // Source-label switching: compute shared source for each table BEFORE row builders
  const s2aSharedSource = computeSharedSource(section2Conversions.topConvertingPages.map(r => r.dataSource));
  const s6SharedSource  = computeSharedSource(section6Priorities.priorities.map((r: any) => r.source));
  const s7TrackingSharedSource = computeSharedSource(section7Tracking.tracking.map((r: any) => r.source));
  const kwSharedSource  = computeSharedSourceList((sectionSuggestedKeywords?.rows ?? []).map((r: any) => r.sources ?? []));

  // Compute actual source tags per Section 2 sub-table from row-level dataSource values
  const s2aActualSources = Array.from(new Set(
    section2Conversions.topConvertingPages
      .map(r => r.dataSource)
      .filter((s): s is string => !!s && s !== "Manual entry needed" && s !== "Site Structure")
  ));
  const s2bActualSources = Array.from(new Set(
    section2Conversions.topConvertingSources
      .map(r => r.dataSource)
      .filter((s): s is string => !!s && s !== "Manual entry needed")
  ));
  // Patterns table has no per-row dataSource — derive from the pool sources used in s2a + s2b
  const s2cActualSources = Array.from(new Set([...s2aActualSources, ...s2bActualSources]));

  // When shared source, suppress per-row dataSource badge (shown at header instead)
  const s2aSourceRows: React.ReactNode[][] = section2Conversions.topConvertingPages.map((r, ri) => [
    <BadgeCell key="t" editKey={`s2a_${ri}_0`} value={r.type} dataSource={s2aSharedSource ? undefined : r.dataSource} edits={edits} onEdit={onEdit} />,
    <span key="p" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {(() => {
        const pageVal = edits[`s2a_${ri}_1`] ?? r.page;
        return isPathLike(pageVal)
          ? <PathTag value={pageVal} />
          : <EditableCell editKey={`s2a_${ri}_1`} value={r.page} edits={edits} onEdit={onEdit} />;
      })()}
    </span>,
    <EditableCell key="n" editKey={`s2a_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const s2cSourceRows: React.ReactNode[][] = (section2Conversions.topConversionPatterns ?? []).map((r, ri) => [
    <EditableCell key="p" editKey={`s2c_${ri}_0`} value={r.pattern} edits={edits} onEdit={onEdit} />,
    <EditableCell key="w" editKey={`s2c_${ri}_1`} value={r.whyItMatters} edits={edits} onEdit={onEdit} />,
    <EditableCell key="e" editKey={`s2c_${ri}_2`} value={r.evidence} edits={edits} onEdit={onEdit} />,
  ]);

  const s2bSourceRows: React.ReactNode[][] = section2Conversions.topConvertingSources.map((r, ri) => [
    <BadgeCell key="s" editKey={`s2b_${ri}_0`} value={r.source} dataSource={r.dataSource} edits={edits} onEdit={onEdit} />,
    <EditableCell key="wc" editKey={`s2b_${ri}_1`} value={r.whatsConverting} edits={edits} onEdit={onEdit} />,
    <EditableCell key="n" editKey={`s2b_${ri}_2`} value={r.notes} edits={edits} onEdit={onEdit} />,
  ]);

  const hasTopicDeltas = section3Traffic.topTrafficTopics.some(r => r.queryCount != null);
  const topicColCount = hasTopicDeltas ? 7 : 3;

  const hasPageDeltas = section3Traffic.topTrafficPages.some(r => r.clicksDelta || r.impressions || r.queries);
  const pageColCount = hasPageDeltas ? 9 : 4;

  const s4SourceRows: React.ReactNode[][] = section4Services.services.map((r, ri) => [
    <EditableCell key="s" editKey={`s4_${ri}_0`} value={r.service} edits={edits} onEdit={onEdit} />,
    <span key="e" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {(() => {
        const epVal = edits[`s4_${ri}_1`] ?? r.examplePage;
        return isPathLike(epVal)
          ? <PathTag value={epVal} />
          : <EditableCell editKey={`s4_${ri}_1`} value={r.examplePage} edits={edits} onEdit={onEdit} />;
      })()}
    </span>,
    <span key="score">{r.seoScore != null ? <SeoScoreBadge score={r.seoScore} /> : <span style={{ color: "#9CA3AF", fontSize: "10px" }}>—</span>}</span>,
    <span key="notes" style={{ fontSize: "10px", color: "#6B7280", lineHeight: 1.4 }}>{r.notes ?? ""}</span>,
  ]);

  const s6SourceRows: React.ReactNode[][] = section6Priorities.priorities.map((r, ri) => [
    <EditableCell key="n" editKey={`s6_${ri}_0`} value={String(r.priority)} edits={edits} onEdit={onEdit} />,
    <BadgeCell key="i" editKey={`s6_${ri}_1`} value={r.initiative} dataSource={s6SharedSource ? undefined : r.source} edits={edits} onEdit={onEdit} />,
    <TierBadge key="t" tier={edits[`s6_${ri}_2`] ?? r.tier} />,
    <ActionTypeBadge key="at" value={edits[`s6_${ri}_5`] ?? (r.actionType ?? "")} />,
    <EditableCell key="a" editKey={`s6_${ri}_3`} value={r.action} edits={edits} onEdit={onEdit} />,
    <EditableCell key="r" editKey={`s6_${ri}_4`} value={r.reason} edits={edits} onEdit={onEdit} />,
  ]);

  const s7SourceRows: React.ReactNode[][] = section7Tracking.tracking.map((r, ri) => [
    <EditableCell key="f" editKey={`s7_${ri}_0`} value={r.focusArea} edits={edits} onEdit={onEdit} />,
    <EditableCell key="m" editKey={`s7_${ri}_1`} value={r.metric} edits={edits} onEdit={onEdit} />,
    s7TrackingSharedSource
      ? <span key="s" style={{ color: "#9CA3AF", fontSize: "9px" }}>—</span>
      : <span key="s" style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
          {parseS7Sources(edits[`s7_${ri}_2`] ?? r.source).map((src, si) => (
            <SourceBadge key={si} source={src} />
          ))}
        </span>,
    // Status column removed — was showing "Comment Out Status" / verification states not ready for clients
    <EditableCell key="w" editKey={`s7_${ri}_4`} value={r.whyItMatters} edits={edits} onEdit={onEdit} />,
  ]);

  return (
    <div className="bg-muted/30 min-h-full flex items-start justify-center p-6 overflow-y-auto" data-testid="qbr-prep-preview-wrapper">
      <div
        className="bg-white shadow-lg overflow-hidden"
        style={{
          width: "794px",
          minHeight: "1123px",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
          fontSize: "11pt",
          color: "#111827",
        }}
        data-testid="qbr-prep-preview-page"
      >
        <img
          src={headerImgUrl ?? swoopHeaderFallback}
          alt="Header"
          style={{ width: "100%", display: "block", flexShrink: 0 }}
        />

        <div style={{ padding: "24px 56px 0", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <div
              style={{ marginBottom: "4px", fontSize: "20px", fontWeight: 700 }}
              className="text-[32px] font-extrabold text-[#f0000f]">
              Quarterly Business Snapshot
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "12px" }}>
              <EditableCell editKey="meta_site" value={meta.site} edits={edits} onEdit={onEdit} />
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 24px",
              fontSize: "11px",
              marginBottom: "20px",
              padding: "12px 16px",
              backgroundColor: "#F9FAFB",
              borderRadius: 4,
              border: "1px solid #E5E7EB",
            }}>
              <div><strong>Domain:</strong> <EditableCell editKey="meta_domain" value={meta.domain} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Primary Location:</strong> <EditableCell editKey="meta_location" value={meta.primaryLocation} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Program / Positioning:</strong> <EditableCell editKey="meta_program" value={meta.programPositioning} edits={edits} onEdit={onEdit} /></div>
              <div><strong>Analysis Window:</strong> {meta.analysisWindow}</div>
              <div><strong>Planning Quarter:</strong> {meta.planningQuarter}</div>
              <div><strong>Generated On:</strong> {meta.generatedOn}</div>
            </div>

            {/* AM Context Block — appears before Section 1; Priority Checks intentionally excluded */}
            {amInputs && (amInputs.amThoughts || amInputs.prevQtrAssessment || amInputs.clientNotes || amInputs.clientSentiment) && (
              <div style={{
                border: `1px solid ${ACCENT}28`,
                borderRadius: 6,
                padding: "10px 14px",
                marginBottom: 20,
                backgroundColor: "#FFFDFB",
                fontSize: "10px",
              }} data-testid="am-context-block">
                <div style={{ fontWeight: 700, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Account Manager Context
                </div>
                {amInputs.amThoughts && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#374151" }}>AM's Hypothesis: </span>
                    {isPromptArtifact(amInputs.amThoughts) ? (
                      <span style={{ color: "#B91C1C", fontStyle: "italic" }}>[AM input contains invalid system text — please regenerate with correct account notes]</span>
                    ) : (
                      <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amInputs.amThoughts}</span>
                    )}
                  </div>
                )}
                {amInputs.prevQtrAssessment && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#374151" }}>Previous Quarter Assessment: </span>
                    {isPromptArtifact(amInputs.prevQtrAssessment) ? (
                      <span style={{ color: "#B91C1C", fontStyle: "italic" }}>[AM input contains invalid system text — please regenerate with correct account notes]</span>
                    ) : (
                      <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amInputs.prevQtrAssessment}</span>
                    )}
                  </div>
                )}
                {amInputs.clientNotes && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#374151" }}>Client Insights: </span>
                    {isPromptArtifact(amInputs.clientNotes) ? (
                      <span style={{ color: "#B91C1C", fontStyle: "italic" }}>[AM input contains invalid system text — please regenerate with correct account notes]</span>
                    ) : (
                      <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amInputs.clientNotes}</span>
                    )}
                  </div>
                )}
                {amInputs.clientSentiment && (
                  <div>
                    <span style={{ fontWeight: 700, color: "#374151" }}>Client Sentiment: </span>
                    <span style={{ color: "#4B5563", whiteSpace: "pre-wrap" }}>{amInputs.clientSentiment}</span>
                  </div>
                )}
              </div>
            )}

            {hiddenSections["section_goals"] ? (
              <HiddenSectionBar secKey="section_goals" title="What Matters Most This Quarter" onShow={() => onToggleSection?.("section_goals")} />
            ) : sectionNums["section_goals"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_goals"]} title="What Matters Most This Quarter" onHide={hideSecBtn("section_goals")} />
                <AddableReportTable tableId="s1" headers={["Goal Type", "Goal", "Goal Shift vs Last Quarter", "Reason"]} sourceRows={s1SourceRows} edits={edits} onEdit={onEdit} />
              </>
            ) : null}

            {hiddenSections["section_conversions"] ? (
              <HiddenSectionBar secKey="section_conversions" title="Where Conversions Actually Happen" onShow={() => onToggleSection?.("section_conversions")} />
            ) : !isSectionAutoHidden("section_conversions", hiddenTables) && sectionNums["section_conversions"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_conversions"]} title="Where Conversions Actually Happen" onHide={hideSecBtn("section_conversions")} />
                {tblSubLabel("table_s2_pages", "Top Converting Pages", !!hiddenTables["table_s2_pages"], s2aSharedSource ? [s2aSharedSource] : undefined)}
                {hiddenTables["table_s2_pages"] ? tblHiddenBar("table_s2_pages", "Top Converting Pages") : (
                  <AddableReportTable tableId="s2a" headers={["Type", "Page", "Notes / What We're Learning"]} sourceRows={s2aSourceRows} edits={edits} onEdit={onEdit} />
                )}
                {tblSubLabel("table_s2_patterns", "Top Conversion Patterns", !!hiddenTables["table_s2_patterns"], s2cActualSources.length > 0 ? s2cActualSources : undefined)}
                {hiddenTables["table_s2_patterns"] ? tblHiddenBar("table_s2_patterns", "Top Conversion Patterns") : (
                  <AddableReportTable tableId="s2c" headers={["Pattern", "Why It Matters", "Evidence"]} sourceRows={s2cSourceRows} edits={edits} onEdit={onEdit} />
                )}
                {tblSubLabel("table_s2_sources", "Top Converting Sources", !!hiddenTables["table_s2_sources"])}
                {hiddenTables["table_s2_sources"] ? tblHiddenBar("table_s2_sources", "Top Converting Sources") : (
                  <AddableReportTable tableId="s2b" headers={["Source", "What's Converting", "Notes / What We're Learning"]} sourceRows={s2bSourceRows} edits={edits} onEdit={onEdit} />
                )}
                {section2Conversions.trackingDisclaimer && (
                  <div style={{ fontSize: "9px", fontStyle: "italic", color: "#6b7280", marginTop: 4, marginBottom: 8 }} data-testid="tracking-disclaimer">
                    {section2Conversions.trackingDisclaimer}
                  </div>
                )}
              </>
            ) : null}

            {hiddenSections["section_traffic"] ? (
              <HiddenSectionBar secKey="section_traffic" title="Top Organic Traffic Drivers" onShow={() => onToggleSection?.("section_traffic")} />
            ) : !isSectionAutoHidden("section_traffic", hiddenTables) && sectionNums["section_traffic"] !== undefined ? (<>
            <SectionHeading num={sectionNums["section_traffic"]} title="Top Organic Traffic Drivers" onHide={hideSecBtn("section_traffic")} />
            {tblSubLabel("table_s3_topics", "Top Traffic Topics", !!hiddenTables["table_s3_topics"], ["GSC"])}
            {hiddenTables["table_s3_topics"] ? tblHiddenBar("table_s3_topics", "Top Traffic Topics") : (
            <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", marginBottom: 12, backgroundColor: "#FFFDFB" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
                <colgroup>
                  {hasTopicDeltas ? (
                    <>
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "27%" }} />
                      <col style={{ width: "14%" }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "52%" }} />
                      <col style={{ width: "18%" }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                    {["Topic", ...(hasTopicDeltas ? ["# Queries", "QoQ Queries", "TOTAL IMP.", "QOQ IMP."] : []), "Example Queries", "🔗 Admits"].map(h => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: h === "🔗 Admits" ? "center" : "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section3Traffic.topTrafficTopics.map((r, ri) => {
                    const insightVal = edits[`s3a_${ri}_3`] ?? r.insight;
                    const hasInsight = !!insightVal;
                    const cellBorder = hasInsight ? "none" : "1px solid #F3EDED";
                    const bg = ri % 2 === 1 ? "#FBF8F7" : "white";
                    return (
                      <React.Fragment key={`topic-${ri}`}>
                        <tr style={{ backgroundColor: bg }}>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>
                            <EditableCell editKey={`s3a_${ri}_0`} value={r.topic} edits={edits} onEdit={onEdit} />
                          </td>
                          {hasTopicDeltas && <>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }} data-testid={`text-query-count-${ri}`}>{r.queryCount ?? "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.queryCountDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }} data-testid={`text-query-delta-${ri}`}>{r.queryCountDelta ?? "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }} data-testid={`text-impressions-${ri}`}>{r.impressions != null ? r.impressions.toLocaleString("en-US") : "—"}</td>
                            <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }} data-testid={`text-impressions-delta-${ri}`}>{r.impressionsDelta ?? "—"}</td>
                          </>}
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>
                            <QueryChipsCell editKey={`s3a_${ri}_1`} value={r.exampleQueries} edits={edits} onEdit={onEdit} />
                          </td>
                          <td style={{ padding: "6px 8px", borderBottom: cellBorder, verticalAlign: "top", lineHeight: 1.4, textAlign: "center", wordBreak: "break-word", overflow: "hidden" }}>
                            <EditableCell editKey={`s3a_${ri}_2`} value={r.connectionToAdmits} edits={edits} onEdit={onEdit} />
                          </td>
                        </tr>
                        {hasInsight && (
                          <tr style={{ backgroundColor: "#FFFBEB" }}>
                            <td colSpan={topicColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 0 }}>
                              <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                              <EditableCell editKey={`s3a_${ri}_3`} value={r.insight} edits={edits} onEdit={onEdit} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {tblSubLabel("table_s3_pages", "Top Traffic Pages", !!hiddenTables["table_s3_pages"], ["GSC"])}
            {hiddenTables["table_s3_pages"] ? tblHiddenBar("table_s3_pages", "Top Traffic Pages") : (
            <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", marginBottom: 12, backgroundColor: "#FFFDFB" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
                <colgroup>
                  {hasPageDeltas ? (
                    <>
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "12%" }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: "55%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "18%" }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                    {["Page", "Clicks", ...(hasPageDeltas ? ["QoQ Clicks", "TOTAL IMP.", "QOQ IMP.", "# Queries", "QoQ Queries"] : []), "CTR", "🔗 Admits"].map(h => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: h === "🔗 Admits" ? "center" : "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section3Traffic.topTrafficPages.map((r, ri) => (
                    <React.Fragment key={`page-${ri}`}>
                      <tr style={{ backgroundColor: ri % 2 === 1 ? "#FBF8F7" : "white" }}>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word" }}>
                          {(() => { const v = edits[`s3b_${ri}_0`] ?? r.page; return isPathLike(v) ? <PathTag value={v} /> : <EditableCell editKey={`s3b_${ri}_0`} value={r.page} edits={edits} onEdit={onEdit} />; })()}
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}><EditableCell editKey={`s3b_${ri}_1`} value={r.clicks} edits={edits} onEdit={onEdit} /></td>
                        {hasPageDeltas && <>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.clicksDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.clicksDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.impressions ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.impressionsDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.impressionsDelta ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}>{r.queries ?? "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden", color: r.queriesDelta?.startsWith("-") ? "#DC2626" : "#16A34A" }}>{r.queriesDelta ?? "—"}</td>
                        </>}
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", overflow: "hidden" }}><EditableCell editKey={`s3b_${ri}_2`} value={r.ctr} edits={edits} onEdit={onEdit} /></td>
                        <td style={{ padding: "6px 8px", borderBottom: (edits[`s3b_${ri}_4`] ?? r.insight) ? "none" : "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, textAlign: "center", wordBreak: "break-word", overflow: "hidden" }}><EditableCell editKey={`s3b_${ri}_3`} value={r.connectionToAdmits} edits={edits} onEdit={onEdit} /></td>
                      </tr>
                      {(edits[`s3b_${ri}_4`] ?? r.insight) && (
                        <tr key={`${ri}-i`} style={{ backgroundColor: "#FFFBEB" }}>
                          <td colSpan={pageColCount} style={{ padding: "4px 10px 6px 14px", borderBottom: "1px solid #F3EDED", borderLeft: `3px solid ${ACCENT}40`, fontSize: "9px", color: "#6B7280", lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: ACCENT, marginRight: 4 }}>Insight:</span>
                            <EditableCell editKey={`s3b_${ri}_4`} value={r.insight} edits={edits} onEdit={onEdit} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            </>) : null}

            {hiddenSections["section_services"] ? (
              <HiddenSectionBar secKey="section_services" title="Levels of Care Overview" onShow={() => onToggleSection?.("section_services")} />
            ) : !isSectionAutoHidden("section_services", hiddenTables) && sectionNums["section_services"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_services"]} title="Levels of Care Overview" onHide={hideSecBtn("section_services")} />
                {tblSubLabel("table_s4_services", "Levels of Care", !!hiddenTables["table_s4_services"], ["Screaming Frog"])}
                {hiddenTables["table_s4_services"] ? tblHiddenBar("table_s4_services", "Levels of Care") : (
                  <AddableReportTable tableId="s4" headers={["Level of Care", "Page", "SEO Score", "Notes"]} sourceRows={s4SourceRows} edits={edits} onEdit={onEdit} />
                )}
              </>
            ) : null}

            {hiddenSections["section_diagnosis"] ? (
              <HiddenSectionBar secKey="section_diagnosis" title="SEO Tier Diagnosis" onShow={() => onToggleSection?.("section_diagnosis")} />
            ) : sectionNums["section_diagnosis"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_diagnosis"]} title="SEO Tier Diagnosis" onHide={hideSecBtn("section_diagnosis")} />
                <div style={{ padding: "12px 16px", backgroundColor: "#FDF2F0", borderRadius: 4, border: `1px solid ${ACCENT}33`, marginBottom: 10, fontSize: "11px" }}>
                  <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "12px" }}>Tier {section5Diagnosis.tier} — {section5Diagnosis.tierName}</div>
                  <EditableSection editKey="s5_diagnosis" value={section5Diagnosis.diagnosis} edits={edits} onEdit={onEdit} as="div" multiline className="text-gray-700 leading-relaxed" />
                </div>
                {section5Diagnosis.tierScorecard && section5Diagnosis.tierScorecard.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {section5Diagnosis.tierScorecard.map(entry => (
                      <TierScorecardCard key={entry.tierNumber} entry={entry} />
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {hiddenSections["section_priorities"] ? (
              <HiddenSectionBar secKey="section_priorities" title="What We Need to Do Next" onShow={() => onToggleSection?.("section_priorities")} />
            ) : !isSectionAutoHidden("section_priorities", hiddenTables) && sectionNums["section_priorities"] !== undefined ? (<>
            <SectionHeading num={sectionNums["section_priorities"]} title="What We Need to Do Next" onHide={hideSecBtn("section_priorities")} />
            {section6Priorities.shortSummary && section6Priorities.shortSummary.length > 0 && (
              <div style={{ padding: "10px 14px", backgroundColor: "#FFF5F5", borderRadius: 4, border: `1.5px solid ${ACCENT}40`, marginBottom: 10, fontSize: "10.5px" }}>
                <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 6, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Critical Observations</div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", lineHeight: 1.6, color: "#374151" }}>
                  {section6Priorities.shortSummary.map((b, i) => {
                    const colonIdx = b.indexOf(":");
                    if (colonIdx > 0 && colonIdx < 60) {
                      return <li key={i}><strong>{b.slice(0, colonIdx)}:</strong> {b.slice(colonIdx + 1).trimStart()}</li>;
                    }
                    return <li key={i}>{b}</li>;
                  })}
                </ul>
              </div>
            )}
            {tblSubLabel("table_s6", "Priority Actions", !!hiddenTables["table_s6"], s6SharedSource ? [s6SharedSource] : undefined)}
            {hiddenTables["table_s6"] ? tblHiddenBar("table_s6", "Priority Actions") : (
            <AddableReportTable
              tableId="s6"
              headers={["#", "Initiative", "Tier", "Type", "Action", "Why It Matters"]}
              sourceRows={s6SourceRows}
              edits={edits}
              onEdit={onEdit}
            />
            )}
            {(() => {
              const raw = edits["s6_crossSells_confirmed"];
              if (!raw) return null;
              let items: { recommendation: string; type: string; relevance: string }[] = [];
              try { items = JSON.parse(raw); } catch { return null; }
              if (!items.length) return null;
              return (
                <div
                  style={{
                    marginBottom: 16,
                    border: `1px solid #3B82F640`,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                  data-testid="s6-crosssell-block"
                >
                  <div
                    style={{
                      backgroundColor: "#EFF6FF",
                      padding: "6px 10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#1D4ED8",
                      borderBottom: "1px solid #3B82F640",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Confirmed Opportunities (Cross-sell / Upsell)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#EFF6FF80" }}>
                        {["Opportunity", "Type", "Relevance"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "5px 8px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: "9px",
                              color: "#1D4ED8",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              borderBottom: "1px solid #3B82F640",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 1 ? "#F8FAFF" : "white" }}>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>{item.recommendation}</td>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4 }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "1px 6px",
                                borderRadius: 10,
                                fontSize: "9px",
                                fontWeight: 600,
                                backgroundColor: item.type === "upsell" ? "#FEF3C7" : "#DBEAFE",
                                color: item.type === "upsell" ? "#92400E" : "#1E40AF",
                              }}
                            >
                              {item.type}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #EFF6FF", verticalAlign: "top", lineHeight: 1.4, color: "#4B5563" }}>{item.relevance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            </>) : null}

            {hasKeywords && (
              hiddenSections["section_keywords"] ? (
                <HiddenSectionBar secKey="section_keywords" title="Suggested Keywords for Next Quarter" onShow={() => onToggleSection?.("section_keywords")} />
              ) : sectionNums["section_keywords"] !== undefined ? (
                <>
                  <SectionHeading num={sectionNums["section_keywords"]} title="Suggested Keywords for Next Quarter" onHide={hideSecBtn("section_keywords")} />
                  {sectionSuggestedKeywords?.rows?.length > 0 && (
                    <div style={{ padding: "8px 12px", backgroundColor: "#FFF5F5", borderRadius: 4, border: `1.5px solid ${ACCENT}40`, marginBottom: 10, fontSize: "9.5px", color: "#374151", lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontSize: "9px", marginRight: 6 }}>About This List:</span>
                      Showing {sectionSuggestedKeywords.rows.length} keyword opportunities (2× monthly credit capacity of {sectionSuggestedKeywords.monthlyCredits}). Grounded in GSC query data, site crawl inventory, and page performance. Filtered to strategic Level of Care, program, condition, and location-intent terms.
                    </div>
                  )}
                  <div style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", marginBottom: 12, backgroundColor: "#FFFDFB" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "32%" }} />
                        <col style={{ width: "12%" }} />
                      </colgroup>
                      <thead>
                        <tr style={{ backgroundColor: `${ACCENT}0D` }}>
                          {(kwSharedSource ? ["Keyword", "Suggested Type", "Target", "Why It's Suggested"] : ["Keyword", "Suggested Type", "Target", "Why It's Suggested", "Source"]).map(h => (
                            <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20`, wordBreak: "break-word" }}>{h}</th>
                          ))}
                          {kwSharedSource && (
                            <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: "9px", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: `1px solid ${ACCENT}20` }}>
                              <SourceBadge source={kwSharedSource} />
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sectionSuggestedKeywords?.rows.map((row, ri) => {
                          const recTypeColors: Record<string, { bg: string; color: string }> = {
                            "optimize-existing": { bg: "#D1FAE5", color: "#065F46" },
                            "refresh-existing":  { bg: "#FEF3C7", color: "#92400E" },
                            "create-new":        { bg: "#DBEAFE", color: "#1E40AF" },
                            "cro-update":        { bg: "#F3E8FF", color: "#6B21A8" },
                            "internal-linking":  { bg: "#F0FDF4", color: "#14532D" },
                          };
                          const recTypeLabels: Record<string, string> = {
                            "optimize-existing": "Optimize existing page",
                            "refresh-existing":  "Refresh existing page",
                            "create-new":        "Create new content",
                            "cro-update":        "CRO / supporting update",
                            "internal-linking":  "Internal linking support",
                          };
                          const colors = recTypeColors[row.recommendationType] ?? { bg: "#F3F4F6", color: "#374151" };
                          const label = recTypeLabels[row.recommendationType] ?? row.recommendationType;
                          const isNewContent = row.targetPage === "New content needed" || row.targetPage === "Suggest new content for this keyword";
                          return (
                            <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? "#FBF8F7" : "white" }} data-testid={`row-keyword-${ri}`}>
                              <td style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", fontWeight: 600, wordBreak: "break-word" }}>
                                <EditableCell editKey={`kw_${ri}_keyword`} value={row.keyword} edits={edits} onEdit={onEdit} />
                              </td>
                              <td style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", wordBreak: "break-word" }}>
                                <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: colors.bg, color: colors.color, whiteSpace: "normal", wordBreak: "break-word" }} data-testid={`badge-rec-type-${ri}`}>
                                  {label}
                                </span>
                              </td>
                              <td style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", wordBreak: "break-word" }}>
                                {isNewContent ? (
                                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: "8px", fontWeight: 700, backgroundColor: "#FEF3C7", color: "#92400E", whiteSpace: "normal", wordBreak: "break-word" }} data-testid={`badge-new-content-${ri}`}>New content needed</span>
                                ) : (
                                  <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: "9px", fontWeight: 500, backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, color: "#374151", wordBreak: "break-all" }} data-testid={`tag-target-page-${ri}`}>
                                    <EditableCell editKey={`kw_${ri}_targetPage`} value={row.targetPage} edits={edits} onEdit={onEdit} />
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top", lineHeight: 1.4, wordBreak: "break-word", color: "#4B5563", fontSize: "9px" }}>
                                <EditableCell editKey={`kw_${ri}_why`} value={row.whyRecommended} edits={edits} onEdit={onEdit} />
                              </td>
                              {!kwSharedSource && (
                                <td style={{ padding: "6px 8px", borderBottom: "1px solid #F3EDED", verticalAlign: "top" }}>
                                  <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
                                    {row.sources.map((src, si) => (
                                      <SourceBadge key={si} source={src} />
                                    ))}
                                  </span>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null
            )}

            {hiddenSections["section_tracking"] ? (
              <HiddenSectionBar secKey="section_tracking" title="What We Track" onShow={() => onToggleSection?.("section_tracking")} />
            ) : !isSectionAutoHidden("section_tracking", hiddenTables) && sectionNums["section_tracking"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_tracking"]} title="What We Track" onHide={hideSecBtn("section_tracking")} />
                {tblSubLabel("table_s8", "Tracked Metrics", !!hiddenTables["table_s8"], s7TrackingSharedSource ? [s7TrackingSharedSource] : undefined)}
                {hiddenTables["table_s8"] ? tblHiddenBar("table_s8", "Tracked Metrics") : (
                  <AddableReportTable tableId="s7" headers={["Focus Area", "Metric", "Source", "Why It Matters"]} sourceRows={s7SourceRows} edits={edits} onEdit={onEdit} />
                )}
              </>
            ) : null}

            {/* Client Insights — commented out pending redesign
            {sectionQssb && sectionQssb.clientInsights.length > 0 && (
              <>
                <SectionHeading num={8} title="Client Insights" />
                <div style={{ fontSize: "11px", color: "#374151", marginBottom: 12 }} data-testid="qssb-insights-section">
                  {sectionQssb.clientInsights.map((insight, i) => (
                    <div key={i} style={{ marginBottom: 6, paddingLeft: 12, borderLeft: `3px solid ${ACCENT}44` }}>
                      <EditableCell editKey={`qssb_insight_${i}`} value={insight.question} edits={edits} onEdit={onEdit} />
                    </div>
                  ))}
                </div>
              </>
            )}
            */}

            {/* QSSB Additional Opportunities — commented out pending redesign
            {sectionQssb && sectionQssb.additionalOpportunities.length > 0 && (
              <>
                <SectionHeading num={sectionQssb.clientInsights.length > 0 ? 9 : 8} title="Additional Opportunities" />
                ...
              </>
            )}
            */}

            {/* Additional Opportunities — auto-generated cards + manual AM entries */}
            {hiddenSections["section_opportunities"] ? (
              <HiddenSectionBar secKey="section_opportunities" title="Additional Opportunities" onShow={() => onToggleSection?.("section_opportunities")} />
            ) : sectionNums["section_opportunities"] !== undefined ? (
              <>
                <SectionHeading num={sectionNums["section_opportunities"]} title="Additional Opportunities" onHide={hideSecBtn("section_opportunities")} />
                {(additionalOpportunities?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {additionalOpportunities!.map((opp, i) => (
                      <div key={i} style={{ border: `1px solid ${ACCENT}28`, borderRadius: 6, overflow: "hidden", fontSize: "11px" }} data-testid={`card-additional-opportunity-${i}`}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: `${ACCENT}0A`, borderBottom: `1px solid ${ACCENT}28` }}>
                          <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", backgroundColor: opp.type === "upsell" ? "#FEF3C7" : "#DBEAFE", color: opp.type === "upsell" ? "#92400E" : "#1E40AF" }} data-testid={`badge-opp-type-${i}`}>{opp.type === "upsell" ? "Upsell" : "Cross-sell"}</span>
                          <span style={{ fontWeight: 700, fontSize: "12px", color: "#111827" }} data-testid={`text-opp-title-${i}`}>
                            <EditableCell editKey={`opp_${i}_title`} value={opp.title} edits={edits} onEdit={onEdit} />
                          </span>
                        </div>
                        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ color: "#374151", fontStyle: "italic" }} data-testid={`text-opp-whynow-${i}`}>
                            <EditableCell editKey={`opp_${i}_why_now`} value={opp.why_now} edits={edits} onEdit={onEdit} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Evidence</div>
                            <ul style={{ margin: 0, paddingLeft: 16, color: "#374151" }}>
                              {opp.evidence.map((ev, j) => (
                                <li key={j} style={{ marginBottom: 2 }} data-testid={`text-opp-evidence-${i}-${j}`}>
                                  <EditableCell editKey={`opp_${i}_evidence_${j}`} value={ev} edits={edits} onEdit={onEdit} />
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "10px", color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Recommendation</div>
                            <div style={{ color: "#1B3A6B" }} data-testid={`text-opp-recommendation-${i}`}>
                              <EditableCell editKey={`opp_${i}_recommendation`} value={opp.recommendation} edits={edits} onEdit={onEdit} />
                            </div>
                          </div>
                          <div style={{ fontSize: "10px", color: "#9CA3AF", borderTop: "1px solid #F3F4F6", paddingTop: 6, fontStyle: "italic" }}>
                            <EditableCell editKey={`opp_${i}_framing`} value={opp.framing} edits={edits} onEdit={onEdit} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {generationMeta && (
              <div style={{ fontSize: "9px", color: "#9CA3AF", marginTop: 16 }}>
                <strong>Sources used:</strong> {generationMeta.dataSources.join(", ") || "None"}
                {generationMeta.missingData.length > 0 && (
                  <span> · <strong>Missing:</strong> {generationMeta.missingData.join(", ")}</span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid #9CA3AF",
              marginTop: "24px",
              paddingTop: "8px",
              paddingBottom: "32px",
              textAlign: "center",
              fontSize: "10px",
              color: "#6B7280",
            }}
          >
            Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io
          </div>
        </div>
      </div>
    </div>
  );
}
