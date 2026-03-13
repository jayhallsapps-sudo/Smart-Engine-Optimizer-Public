/**
 * templateDefaults.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Code-defined canonical section definitions for each supported report type.
 * These are the immutable defaults that drive report structure.
 *
 * Admins can override sectionLabel, enabled, displayOrder, and helperCopy
 * via the Template Controls UI.  sectionKey is ALWAYS locked — it is the
 * stable identity used by report generators, saved-report JSON, and routing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SectionDef = {
  /** Stable code-defined identifier — NEVER editable by admin. */
  sectionKey: string;
  /** Human-readable label shown to AMs. Overridable. */
  defaultLabel: string;
  /** Zero-based render order. Overridable. */
  defaultOrder: number;
  /** Whether this section is shown by default. Overridable (unless alwaysEnabled). */
  defaultEnabled: boolean;
  /** If true, this section cannot be disabled by admin — it is structurally required. */
  alwaysEnabled: boolean;
  /** Short admin-facing description of what this section contains. Not shown to AMs. */
  description: string;
};

export const TEMPLATE_DEFAULTS: Record<string, SectionDef[]> = {
  biweekly: [
    {
      sectionKey: "purpose",
      defaultLabel: "Purpose",
      defaultOrder: 0,
      defaultEnabled: true,
      alwaysEnabled: true,
      description: "Report context, objectives, and reporting period. Structurally required.",
    },
    {
      sectionKey: "performance_pulse",
      defaultLabel: "Performance Pulse",
      defaultOrder: 1,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "GSC/GA4 organic traffic, clicks, and conversion metrics for the period.",
    },
    {
      sectionKey: "progress_quick_wins",
      defaultLabel: "Progress & Quick Wins",
      defaultOrder: 2,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Completed work items from Airtable and Asana — categorized by type.",
    },
    {
      sectionKey: "partnership_alignment",
      defaultLabel: "Partnership & Alignment",
      defaultOrder: 3,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "AM notes, client sentiment, priority checks, and upcoming focus areas.",
    },
  ],
  monthly: [
    {
      sectionKey: "title",
      defaultLabel: "Title Slide",
      defaultOrder: 0,
      defaultEnabled: true,
      alwaysEnabled: true,
      description: "Month, client name, and report type identifier. Structurally required.",
    },
    {
      sectionKey: "monthly_performance",
      defaultLabel: "Monthly Performance",
      defaultOrder: 1,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Organic traffic, clicks, and core KPI comparison MoM and YoY.",
    },
    {
      sectionKey: "top_queries",
      defaultLabel: "Top Queries",
      defaultOrder: 2,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Top keyword queries from Google Search Console for the month.",
    },
    {
      sectionKey: "qtd_kpis",
      defaultLabel: "QTD KPIs",
      defaultOrder: 3,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Quarter-to-date KPI tracking against leadership-set goals.",
    },
    {
      sectionKey: "top_landing_pages",
      defaultLabel: "Top Landing Pages",
      defaultOrder: 4,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Top organic landing pages by clicks from Google Search Console.",
    },
    {
      sectionKey: "keyword_distribution",
      defaultLabel: "Keyword Distribution",
      defaultOrder: 5,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Ranking position bucket breakdown (1-3, 4-10, 11-20, 21+).",
    },
    {
      sectionKey: "monthly_initiatives",
      defaultLabel: "Monthly Initiatives",
      defaultOrder: 6,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Key work items, AM strategic inputs, and content/technical focus.",
    },
  ],
  qbr_prep: [
    {
      sectionKey: "executive_summary",
      defaultLabel: "Executive Summary",
      defaultOrder: 0,
      defaultEnabled: true,
      alwaysEnabled: true,
      description: "Quarter wins, top opportunities, and strategic narrative. Structurally required.",
    },
    {
      sectionKey: "opportunity_backlog",
      defaultLabel: "Opportunity Backlog",
      defaultOrder: 1,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Prioritized opportunities categorized by Content, Technical, Local, Discoverability.",
    },
    {
      sectionKey: "data_driven_scoring",
      defaultLabel: "Data-Driven Scoring",
      defaultOrder: 2,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Opportunity scoring methodology and tier-based prioritization.",
    },
  ],
  qbr_full: [
    {
      sectionKey: "agenda",
      defaultLabel: "Agenda",
      defaultOrder: 0,
      defaultEnabled: true,
      alwaysEnabled: true,
      description: "Meeting agenda slide. Structurally required for client-facing deck.",
    },
    {
      sectionKey: "performance_review",
      defaultLabel: "Performance Review",
      defaultOrder: 1,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "NSM overview, call volume trends, and organic performance vs prior quarter.",
    },
    {
      sectionKey: "strategy_overview",
      defaultLabel: "Strategy Overview",
      defaultOrder: 2,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Biggest lift areas identified this quarter and competitive snapshot.",
    },
    {
      sectionKey: "strategic_plan",
      defaultLabel: "Strategic Plan",
      defaultOrder: 3,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Next quarter goals, key initiatives, and planned deliverables.",
    },
    {
      sectionKey: "roadmap",
      defaultLabel: "Roadmap",
      defaultOrder: 4,
      defaultEnabled: true,
      alwaysEnabled: false,
      description: "Forward-looking roadmap with initiatives, owners, and tentative timelines.",
    },
  ],
};

/** Get sorted section defaults for a report type, or empty array if unknown. */
export function getSectionDefaults(reportType: string): SectionDef[] {
  return (TEMPLATE_DEFAULTS[reportType] ?? []).slice().sort((a, b) => a.defaultOrder - b.defaultOrder);
}

/** All report types that support template controls (used for tab navigation). */
export const TEMPLATE_REPORT_TYPES: { value: string; label: string }[] = [
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "qbr_prep", label: "QBS" },
  { value: "qbr_full", label: "QBR" },
];
