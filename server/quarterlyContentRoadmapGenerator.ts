/**
 * quarterlyContentRoadmapGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Isolated generator for the Quarterly Content Roadmap deck.
 *
 * Data sources:
 *   1. QBS (qbr_prep saved report) — strategy narrative per quarter
 *   2. Airtable production view — deliverables for each month in the quarter
 *
 * NON-REGRESSION GUARANTEE:
 *   This file has zero imports from any existing generator.
 *   It only uses shared utilities (storage, airtable client, encryption).
 *   Existing generators are completely untouched.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { storage } from "./storage";
import { listSavedReportsByClientAndType } from "./savedReportService";
import { fetchAirtableWorkLog } from "./airtable";
import type { Slide } from "../client/src/components/report-preview/report-primitives";

// ─── Quarter helpers ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March",
  "April", "May", "June",
  "July", "August", "September",
  "October", "November", "December",
];

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Returns the 3 0-based month indices for a given quarter (1-4). */
function quarterMonths(quarter: number): [number, number, number] {
  const start = (quarter - 1) * 3;
  return [start, start + 1, start + 2];
}

/** Last day of a month (1-based month, 1-based return). */
function lastDayOfMonth(year: number, month1based: number): number {
  return new Date(year, month1based, 0).getDate();
}

/** ISO date string for the first day of a month. */
function monthStart(year: number, month0based: number): string {
  const m = String(month0based + 1).padStart(2, "0");
  return `${year}-${m}-01`;
}

/** ISO date string for the last day of a month. */
function monthEnd(year: number, month0based: number): string {
  const m = String(month0based + 1).padStart(2, "0");
  const d = String(lastDayOfMonth(year, month0based + 1)).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Human-readable quarter label e.g. "Q2 2026". */
function quarterLabel(quarter: number, year: number): string {
  return `Q${quarter} ${year}`;
}

// ─── QBS (saved QBR Prep) lookup ──────────────────────────────────────────────

interface QbsMatch {
  json: any;
  tier: string;
}

/**
 * Finds the best QBS (qbr_prep) saved report for the given client + quarter/year.
 * Uses the same tier logic as qbsQbrMapping.ts but keeps this file self-contained.
 */
async function findQbsForQuarter(
  clientId: number,
  targetQuarter: number,
  targetYear: number,
): Promise<QbsMatch | null> {
  let records: any[] = [];
  try {
    records = await listSavedReportsByClientAndType(clientId, "qbr_prep");
  } catch {
    return null;
  }

  if (!records.length) return null;

  // Tier 1 — exact quarter + year
  const tier1 = records.filter(
    r => r.planningQuarter === targetQuarter && r.planningYear === targetYear,
  );
  if (tier1.length) {
    return { json: tier1[0].generatedReportJson ?? null, tier: "exact" };
  }

  // Tier 2 — same year, any quarter
  const tier2 = records.filter(
    r => r.planningYear === targetYear && r.planningQuarter !== targetQuarter,
  );
  if (tier2.length) {
    return { json: tier2[0].generatedReportJson ?? null, tier: "year" };
  }

  // Tier 3 — legacy (no metadata)
  const tier3 = records.filter(
    r => r.planningQuarter == null && r.planningYear == null,
  );
  if (tier3.length) {
    return { json: tier3[0].generatedReportJson ?? null, tier: "legacy" };
  }

  // Tier 4 — any remaining
  return { json: records[0].generatedReportJson ?? null, tier: "fallback" };
}

// ─── Strategy text extraction from QBS ───────────────────────────────────────

interface QbsStrategyContext {
  quarterSummary: string;
  categoryThemes: string[];
  topOpportunities: string[];
  manualThoughts: string;
  futureLabel: string;
}

/**
 * Detects whether a QBS JSON blob is v1 or v2 schema.
 *
 * v1 keys: executive_summary, opportunity_backlog, future_window_label, sourceSnapshotJson
 * v2 keys: section6Priorities, section1Goals, sourceSnapshot
 */
function isV2QbsSchema(qbsJson: any): boolean {
  return (
    qbsJson?.section6Priorities != null ||
    qbsJson?.section1Goals != null ||
    qbsJson?.sourceSnapshot != null
  );
}

/**
 * v2 adapter — reads the live QBR Prep schema used by all current clients.
 *
 * Field precedence:
 *   1. section6Priorities.priorities (sorted by priority number asc)
 *      → each priority contributes one categoryTheme: "[initiative]: [first sentence of action]"
 *      → topOpportunities = Tier 1 priorities only, short form: "[actionType]: [initiative]"
 *   2. sourceSnapshot.manualInputs.amThoughts / hypothesis → quarterSummary & manualThoughts
 *   3. sourceSnapshot.manualInputs.prevQtrAssessment → additional manualThoughts context
 *   4. section1Goals.rows[0].goal → appended to manualThoughts if no AM thoughts available
 *
 * Month distribution: categoryThemes array is distributed across months by
 * buildMonthStrategyBullets() using ceil(n/3) per month.
 */
function extractQbsStrategyV2(qbsJson: any): QbsStrategyContext {
  const rawPriorities: any[] = qbsJson.section6Priorities?.priorities ?? [];
  const priorities = [...rawPriorities].sort(
    (a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99),
  );

  const manualInputs = qbsJson.sourceSnapshot?.manualInputs ?? {};
  const goals: any[] = qbsJson.section1Goals?.rows ?? [];

  const categoryThemes = priorities
    .map((p: any) => {
      const initiative: string = p.initiative ?? p.actionType ?? "Priority";
      const action: string = p.action ?? "";
      const firstSentence = action.split(/\.\s/)[0].slice(0, 130);
      return `${initiative}: ${firstSentence}`;
    })
    .filter(Boolean)
    .slice(0, 9);

  const topOpportunities = priorities
    .filter((p: any) => p.tier === "Tier 1")
    .map((p: any) => `${p.actionType ?? "SEO"}: ${p.initiative ?? p.action?.slice(0, 60) ?? ""}`)
    .slice(0, 4);

  const amThoughts: string =
    manualInputs.amThoughts ?? manualInputs.hypothesis ?? "";
  const prevAssessment: string = manualInputs.prevQtrAssessment ?? "";

  const manualThoughtsSentence = amThoughts
    ? amThoughts.split(".")[0].trim() + "."
    : prevAssessment
    ? prevAssessment.split(".")[0].trim() + "."
    : goals[0]?.goal
    ? `Quarter target: ${goals[0].goal}`
    : "";

  const quarterSummary =
    manualInputs.amThoughts?.split(".")[0] ??
    goals[0]?.goal ??
    "";

  return {
    quarterSummary,
    categoryThemes,
    topOpportunities,
    manualThoughts: manualThoughtsSentence,
    futureLabel: "",
  };
}

/**
 * v1 adapter — reads the legacy QBR Prep schema (executive_summary, opportunity_backlog, etc.)
 * Preserved unchanged so existing v1 clients continue to work.
 */
function extractQbsStrategyV1(qbsJson: any): QbsStrategyContext {
  const summary = qbsJson.executive_summary ?? {};
  const opps = (qbsJson.opportunity_backlog ?? []) as Array<{
    category_name: string;
    opportunities: Array<{ opportunity_title: string }>;
  }>;

  const categoryThemes = opps
    .filter(cat => cat.opportunities?.length > 0)
    .map(cat => {
      const top = cat.opportunities[0];
      return `${cat.category_name}: ${top.opportunity_title}`;
    })
    .slice(0, 6);

  const topOpportunities = ((summary.top_opportunities ?? []) as Array<{ title: string; category: string }>)
    .slice(0, 5)
    .map(o => `${o.category}: ${o.title}`);

  const manualInputs = (qbsJson.sourceSnapshotJson as any)?.manualInputs ?? {};
  const manualThoughts = [
    manualInputs.amThoughts ?? "",
    manualInputs.hypothesis ?? "",
    manualInputs.prevQtrAssessment ?? "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    quarterSummary: qbsJson.future_window_label ?? "",
    categoryThemes,
    topOpportunities,
    manualThoughts,
    futureLabel: qbsJson.future_window_label ?? "",
  };
}

function extractQbsStrategy(qbsJson: any): QbsStrategyContext {
  if (!qbsJson) {
    return {
      quarterSummary: "",
      categoryThemes: [],
      topOpportunities: [],
      manualThoughts: "",
      futureLabel: "",
    };
  }
  return isV2QbsSchema(qbsJson)
    ? extractQbsStrategyV2(qbsJson)
    : extractQbsStrategyV1(qbsJson);
}

/**
 * Builds strategy bullet points for a specific month within the quarter.
 * Distributes QBS category themes across the 3 months to avoid repetition.
 */
function buildMonthStrategyBullets(
  monthIndex: 0 | 1 | 2,
  monthName: string,
  quarterNum: number,
  year: number,
  ctx: QbsStrategyContext,
): string[] {
  const bullets: string[] = [];

  if (ctx.categoryThemes.length === 0 && ctx.topOpportunities.length === 0) {
    bullets.push(`${monthName} ${year} SEO strategy focus — edit this text with the planned monthly priorities.`);
    bullets.push("Content topics and deliverables are reflected in the production table below.");
    bullets.push("Update this section with the specific strategic rationale for this month's work.");
    return bullets;
  }

  const themesPerMonth = Math.ceil(ctx.categoryThemes.length / 3);
  const myThemes = ctx.categoryThemes.slice(
    monthIndex * themesPerMonth,
    (monthIndex + 1) * themesPerMonth,
  );

  const monthFocus = ["early-quarter foundation and quick wins", "mid-quarter execution and momentum", "late-quarter compounding and refinement"][monthIndex];
  bullets.push(`${monthName} ${year} — Strategy focus: ${monthFocus}.`);

  for (const theme of myThemes) {
    bullets.push(theme);
  }

  if (monthIndex === 0 && ctx.manualThoughts) {
    bullets.push(ctx.manualThoughts);
  }

  if (monthIndex === 2 && ctx.topOpportunities.length > 0) {
    bullets.push(`Top opportunity area this quarter: ${ctx.topOpportunities[0]}`);
  }

  return bullets.filter(Boolean);
}

// ─── Airtable type normalization ──────────────────────────────────────────────

/**
 * Infers a clean client-facing content type from the deliverable task name.
 *
 * Many Airtable bases embed the content type in the task name using the pattern:
 *   "[CLIENT ABBR] - [Type] - [Category] - [Topic]"
 * e.g. "AT - CRO Update - Treatment Modalities - relapse definition"
 *      "AT - Half Scale - Guide - recovery cycle"
 *
 * Precedence:
 *   1. Parse the task name for the second dash-delimited segment and map it.
 *   2. If parseable but not in the map, return the raw segment (better than "Other").
 *   3. If the raw creditType is not "Other", return it unchanged.
 *   4. Fallback: "Deliverable" (never expose "Other" to clients).
 */
const TASK_TYPE_MAP: Record<string, string> = {
  "Scale": "New Content",
  "Half Scale": "Half-Scale Content",
  "Optimization": "Content Optimization",
  "CRO Update": "CRO/UX Update",
  "Service": "Service Page",
  "Technical": "Technical SEO",
  "Link Building": "Link Building",
  "Citation": "Citations",
  "GBP": "GBP Update",
  "Blog": "Blog Post",
  "Landing": "Landing Page",
  "Local": "Local SEO",
};

function inferContentTypeFromTask(task: string, rawCreditType: string): string {
  const match = task.match(/^[A-Z]{1,6}\s*-\s*([^-]+?)\s*-/i);
  if (match) {
    const extracted = match[1].trim();
    return TASK_TYPE_MAP[extracted] ?? extracted;
  }
  return rawCreditType === "Other" ? "Deliverable" : rawCreditType;
}

// ─── Airtable production fetcher ──────────────────────────────────────────────

interface MonthProductionResult {
  rows: (string | number)[][];
  totalItems: number;
  hasData: boolean;
}

async function fetchMonthProduction(
  clientId: number,
  year: number,
  month0based: number,
): Promise<MonthProductionResult> {
  const start = monthStart(year, month0based);
  const end = monthEnd(year, month0based);

  const result = await fetchAirtableWorkLog(clientId, start, end, "production");

  if (!result.success) {
    console.warn(`[QCR] Airtable fetch for ${start}→${end}: ${result.error}`);
    return { rows: [], totalItems: 0, hasData: false };
  }

  const items = Object.values(result.data.byCreditType).flat();
  const rows: (string | number)[][] = items.map(item => [
    item.task,
    inferContentTypeFromTask(item.task, item.creditType),
    item.targetKeyword ?? "—",
    item.statusLabel ?? item.status ?? "—",
  ]);

  return { rows, totalItems: items.length, hasData: rows.length > 0 };
}

// ─── Main generator ───────────────────────────────────────────────────────────

export interface QcrInput {
  clientId: number;
  quarter: number;
  year: number;
}

export interface QcrReportJson {
  report_type: "quarterly_content_roadmap";
  report_title: string;
  client_name: string;
  quarter: number;
  year: number;
  quarter_label: string;
  generated_at: string;
  slides: Slide[];
}

export async function generateQuarterlyContentRoadmap(
  input: QcrInput,
): Promise<QcrReportJson> {
  const { clientId, quarter, year } = input;

  const client = await storage.getClient(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const clientName = client.name;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const qLabel = quarterLabel(quarter, year);
  const [m0, m1, m2] = quarterMonths(quarter);

  console.log(`[QCR] Generating for ${clientName} — ${qLabel}`);

  // ── Fetch QBS context ──────────────────────────────────────────────────────
  const qbsMatch = await findQbsForQuarter(clientId, quarter, year);
  const stratCtx = extractQbsStrategy(qbsMatch?.json ?? null);
  if (qbsMatch) {
    console.log(`[QCR] QBS found (tier: ${qbsMatch.tier})`);
  } else {
    console.log("[QCR] No QBS found — using placeholder strategy text");
  }

  // ── Fetch Airtable production for each month ───────────────────────────────
  const [prod0, prod1, prod2] = await Promise.all([
    fetchMonthProduction(clientId, year, m0),
    fetchMonthProduction(clientId, year, m1),
    fetchMonthProduction(clientId, year, m2),
  ]);

  console.log(
    `[QCR] Airtable: ${MONTH_NAMES[m0]}=${prod0.totalItems}, ` +
    `${MONTH_NAMES[m1]}=${prod1.totalItems}, ${MONTH_NAMES[m2]}=${prod2.totalItems} items`,
  );

  const TABLE_HEADERS = ["Deliverable", "Type", "Target Keyword", "Status"];

  // ── Build the overview bullet context ─────────────────────────────────────
  const overviewBullets: string[] = [];
  overviewBullets.push(`${qLabel} Content Roadmap — ${clientName}`);
  if (stratCtx.categoryThemes.length > 0) {
    overviewBullets.push(`Strategic priority areas: ${stratCtx.categoryThemes.slice(0, 3).join(" · ")}`);
  } else {
    overviewBullets.push("Strategic content priorities are outlined in each monthly section below.");
  }
  overviewBullets.push(`Production plan covers: ${MONTH_NAMES[m0]}, ${MONTH_NAMES[m1]}, and ${MONTH_NAMES[m2]} ${year}.`);
  const totalItems = prod0.totalItems + prod1.totalItems + prod2.totalItems;
  if (totalItems > 0) {
    overviewBullets.push(`Total planned deliverables across the quarter: ${totalItems}`);
  }

  // ── Assemble slides ───────────────────────────────────────────────────────
  const slides: Slide[] = [];

  // Slide 1 — Title
  slides.push({
    id: "qcr_title",
    type: "title",
    title: "Quarterly Content Roadmap",
    clientName,
    date: today,
    producedBy: "",
  });

  // Slide 2 — Quarter Overview
  slides.push({
    id: "qcr_overview",
    type: "bullets",
    title: `${qLabel} — Content Strategy Overview`,
    sectionLabel: "Quarter Overview",
    subtitle: `Planned content production and SEO strategy for ${MONTH_NAMES[m0]}–${MONTH_NAMES_SHORT[m2]} ${year}`,
    bullets: overviewBullets,
  });

  // Slides 3–5: Month 1
  const month0Name = MONTH_NAMES[m0];
  slides.push({
    id: "qcr_m1_divider",
    type: "divider",
    title: `${month0Name} ${year}`,
    subtitle: "Monthly Strategy & Content Plan",
  });
  slides.push({
    id: "qcr_m1_strategy",
    type: "bullets",
    title: `${month0Name} — SEO Strategy`,
    sectionLabel: `${month0Name} Strategy`,
    subtitle: "Monthly strategic rationale — edit to reflect the approved plan for this month.",
    bullets: buildMonthStrategyBullets(0, month0Name, quarter, year, stratCtx),
  });
  slides.push({
    id: "qcr_m1_table",
    type: "table",
    title: `${month0Name} — Content Production`,
    sectionLabel: `${month0Name} Deliverables`,
    subtitle: prod0.hasData
      ? `${prod0.totalItems} planned deliverable${prod0.totalItems !== 1 ? "s" : ""} — from Airtable production view`
      : "No Airtable production records found for this month.",
    table: {
      headers: TABLE_HEADERS,
      rows: prod0.hasData ? prod0.rows : [["No deliverables found for this month", "", "", ""]],
    },
  });

  // Slides 6–8: Month 2
  const month1Name = MONTH_NAMES[m1];
  slides.push({
    id: "qcr_m2_divider",
    type: "divider",
    title: `${month1Name} ${year}`,
    subtitle: "Monthly Strategy & Content Plan",
  });
  slides.push({
    id: "qcr_m2_strategy",
    type: "bullets",
    title: `${month1Name} — SEO Strategy`,
    sectionLabel: `${month1Name} Strategy`,
    subtitle: "Monthly strategic rationale — edit to reflect the approved plan for this month.",
    bullets: buildMonthStrategyBullets(1, month1Name, quarter, year, stratCtx),
  });
  slides.push({
    id: "qcr_m2_table",
    type: "table",
    title: `${month1Name} — Content Production`,
    sectionLabel: `${month1Name} Deliverables`,
    subtitle: prod1.hasData
      ? `${prod1.totalItems} planned deliverable${prod1.totalItems !== 1 ? "s" : ""} — from Airtable production view`
      : "No Airtable production records found for this month.",
    table: {
      headers: TABLE_HEADERS,
      rows: prod1.hasData ? prod1.rows : [["No deliverables found for this month", "", "", ""]],
    },
  });

  // Slides 9–11: Month 3
  const month2Name = MONTH_NAMES[m2];
  slides.push({
    id: "qcr_m3_divider",
    type: "divider",
    title: `${month2Name} ${year}`,
    subtitle: "Monthly Strategy & Content Plan",
  });
  slides.push({
    id: "qcr_m3_strategy",
    type: "bullets",
    title: `${month2Name} — SEO Strategy`,
    sectionLabel: `${month2Name} Strategy`,
    subtitle: "Monthly strategic rationale — edit to reflect the approved plan for this month.",
    bullets: buildMonthStrategyBullets(2, month2Name, quarter, year, stratCtx),
  });
  slides.push({
    id: "qcr_m3_table",
    type: "table",
    title: `${month2Name} — Content Production`,
    sectionLabel: `${month2Name} Deliverables`,
    subtitle: prod2.hasData
      ? `${prod2.totalItems} planned deliverable${prod2.totalItems !== 1 ? "s" : ""} — from Airtable production view`
      : "No Airtable production records found for this month.",
    table: {
      headers: TABLE_HEADERS,
      rows: prod2.hasData ? prod2.rows : [["No deliverables found for this month", "", "", ""]],
    },
  });

  const result: QcrReportJson = {
    report_type: "quarterly_content_roadmap",
    report_title: `${clientName} — Quarterly Content Roadmap — ${qLabel}`,
    client_name: clientName,
    quarter,
    year,
    quarter_label: qLabel,
    generated_at: new Date().toISOString(),
    slides,
  };

  console.log(`[QCR] Done — ${slides.length} slides for ${clientName} ${qLabel}`);
  return result;
}
