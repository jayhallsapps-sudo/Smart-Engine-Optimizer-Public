/**
 * SmartEO Report Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all report types. Canonical names, families,
 * audiences, ordering, export formats, section-command mappings, and phase.
 *
 * CANONICAL REPORT ORDER (lifecycle order — use everywhere):
 *   1. Kickoff Deck        — slideshow, client-facing
 *   2. Mid-Strategy Deck   — slideshow, client-facing
 *   3. Launch Deck         — slideshow, client-facing
 *   4. Bi-Weekly Report    — document, client-facing
 *   5. Monthly Report      — document, client-facing
 *   6. QBS                 — document, internal only
 *   7. QBR                 — slideshow, client-facing (derived from QBS)
 *
 * KEY RULES:
 *   • QBS is internal-only. Never surface to clients.
 *   • QBR is client-facing and is downstream of QBS.
 *   • Do not rename QBR to "QBR Full". Do not rename QBS to "QBR Prep".
 *   • This order is the canonical lifecycle order for all UI, selectors, and logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Families ────────────────────────────────────────────────────────────────

/**
 * Two top-level layout families that drive preview component and export pipeline.
 *
 *  • slideshow  → PptxPreview + pptxgenjs export (Kickoff, Mid-Strategy, Launch, QBR)
 *  • document   → DocxPreview / section renderer + docx/Puppeteer export (Bi-Weekly, Monthly, QBS)
 */
export type ReportFamily = "slideshow" | "document";

// ─── Audience ─────────────────────────────────────────────────────────────────

/**
 * Who the report is intended for.
 *  • client   → delivered to or viewed by the client
 *  • internal → internal Webserv use only (e.g. QBS planning docs)
 */
export type ReportAudience = "client" | "internal";

// ─── Export formats ───────────────────────────────────────────────────────────

export type ExportFormat = "pptx" | "docx" | "pdf";

// ─── Phase ────────────────────────────────────────────────────────────────────

export type ReportPhase = 1 | 2;

// ─── Section-command manifest ─────────────────────────────────────────────────

/**
 * Maps a report's internal section IDs to the data commands that auto-populate
 * them. Used by routes.ts when auto-fetching data for a report.
 */
export type SectionCommandsManifest = Record<string, string[]>;

// ─── Report type definition ───────────────────────────────────────────────────

export interface ReportTypeDefinition {
  /** Stable string ID used in the database `report_type` column */
  id: string;

  /** Human-readable canonical name shown in the UI */
  displayName: string;

  /** Short description used in tooltips and the history view */
  description: string;

  /** Layout family – drives which preview component and exporter is used */
  family: ReportFamily;

  /**
   * Audience classification.
   * "internal" reports (QBS) should not be surfaced to clients.
   */
  audience: ReportAudience;

  /**
   * Optional: the ID of the report type this report is derived from.
   * QBR is derived from QBS, so QBR has derivedFrom: "qbr_prep".
   * Future: this relationship drives template pre-population and workflow linking.
   */
  derivedFrom?: string;

  /** Which export formats this report type supports */
  exportFormats: ExportFormat[];

  /**
   * Front-end route prefix, e.g. "/monthly".
   * Null for report types that don't have a dedicated page yet.
   */
  route: string | null;

  /** Section → commands mapping for auto-data-fetch (routes.ts) */
  sectionCommandsManifest: SectionCommandsManifest;

  /** Canonical lifecycle order (1 = earliest, 7 = latest) */
  order: number;

  /** Which product phase introduced this report type */
  phase: ReportPhase;

  /**
   * True once the generator, preview component, and route all exist.
   * Phase 2 stubs start as false until their sprint is complete.
   */
  implemented: boolean;
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Ordered by canonical lifecycle order. This order is authoritative.

const REGISTRY: ReportTypeDefinition[] = [

  // ── Phase 2 stubs ─────────────────────────────────────────────────────────
  {
    id: "kickoff_deck",
    displayName: "Kickoff Deck",
    description: "Client-facing kickoff presentation to establish initial direction and goals with a new client.",
    family: "slideshow",
    audience: "client",
    exportFormats: ["pptx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    order: 1,
    phase: 2,
    implemented: false,
  },

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  {
    id: "mid_strategy",
    displayName: "Mid-Strategy Deck",
    description: "Client-facing mid-engagement deck: highlights discovery-phase work, keeps the client engaged, and sets up the full strategy presentation.",
    family: "slideshow",
    audience: "client",
    exportFormats: ["pptx", "pdf"],
    route: "/mid-strategy",
    sectionCommandsManifest: {},
    order: 2,
    phase: 1,
    implemented: true,
  },

  // ── Phase 2 stubs ─────────────────────────────────────────────────────────
  {
    id: "launch_deck",
    displayName: "Launch Deck",
    description: "Client-facing presentation of the full SEO strategy and execution plan.",
    family: "slideshow",
    audience: "client",
    exportFormats: ["pptx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    order: 3,
    phase: 2,
    implemented: false,
  },

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  {
    id: "biweekly",
    displayName: "Bi-Weekly Report",
    description: "High-level summary of what is happening on the account for bi-weekly client check-ins. Exported as DOCX.",
    family: "document",
    audience: "client",
    exportFormats: ["docx", "pdf"],
    route: "/biweekly",
    sectionCommandsManifest: {
      bw_pulse: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "ga4_session_movers"],
      bw_progress: ["airtable_work_log"],
    },
    order: 4,
    phase: 1,
    implemented: true,
  },
  {
    id: "monthly",
    displayName: "Monthly Report",
    description: "High-level monthly report covering what happened in the prior month and what is planned for the coming month. Exported as PPTX.",
    family: "document",
    audience: "client",
    exportFormats: ["pptx", "pdf"],
    route: "/monthly",
    sectionCommandsManifest: {
      mo_qtd: ["ga4_qtd_totals"],
      mo_conversion: ["ga4_landing_pages_by_conversions", "callrail_qoq_top_landing_pages"],
      mo_gsc: ["gsc_qoq_queries", "gsc_top_queries"],
      mo_keywords: ["semrush_keyword_distribution", "semrush_keyword_rankings"],
      mo_initiatives: ["airtable_work_log"],
      mo_audit: ["technical_health_summary"],
      mo_content: ["content_output_summary", "new_pages_tracker"],
    },
    order: 5,
    phase: 1,
    implemented: true,
  },
  {
    id: "qbr_prep",
    displayName: "QBS",
    description: "Internal Quarterly Business Snapshot — covers what happened in the previous quarter and what is planned for the next quarter. Internal use only. Exported as DOCX.",
    family: "document",
    audience: "internal",
    exportFormats: ["docx", "pdf"],
    route: "/qbr-prep",
    sectionCommandsManifest: {},
    order: 6,
    phase: 1,
    implemented: true,
  },
  {
    id: "qbr_full",
    displayName: "QBR",
    description: "Client-facing Quarterly Business Review deck built from QBS content plus ADR and Director of SEO adjustments. Covers previous and next quarter in detail. Exported as PPTX.",
    family: "slideshow",
    audience: "client",
    derivedFrom: "qbr_prep",
    exportFormats: ["pptx", "pdf"],
    route: "/qbr",
    sectionCommandsManifest: {
      qbr_performance: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "semrush_organic_overview"],
      qbr_strategy: ["ga4_qoq_organic_landing_pages", "gsc_qoq_pages", "semrush_keyword_distribution"],
    },
    order: 7,
    phase: 1,
    implemented: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the full definition for a report type ID, or undefined if not found. */
export function getReportDefinition(id: string): ReportTypeDefinition | undefined {
  return REGISTRY.find(r => r.id === id);
}

/** Return the layout family for a report type. Defaults to "document" if unknown. */
export function getReportFamily(id: string): ReportFamily {
  return getReportDefinition(id)?.family ?? "document";
}

/** Return the audience for a report type. Defaults to "client" if unknown. */
export function getReportAudience(id: string): ReportAudience {
  return getReportDefinition(id)?.audience ?? "client";
}

/** True if a report type is internal-only (not client-facing). */
export function isInternalReport(id: string): boolean {
  return getReportAudience(id) === "internal";
}

/** Return all registered report types, optionally filtered. Always sorted by canonical order. */
export function listReportTypes(filters?: {
  family?: ReportFamily;
  audience?: ReportAudience;
  phase?: ReportPhase;
  implementedOnly?: boolean;
}): ReportTypeDefinition[] {
  return REGISTRY.filter(r => {
    if (filters?.family !== undefined && r.family !== filters.family) return false;
    if (filters?.audience !== undefined && r.audience !== filters.audience) return false;
    if (filters?.phase !== undefined && r.phase !== filters.phase) return false;
    if (filters?.implementedOnly && !r.implemented) return false;
    return true;
  }).sort((a, b) => a.order - b.order);
}

/**
 * Returns the SECTION_COMMANDS_AUTO-compatible map for all implemented
 * Phase 1 report types with non-empty manifests.
 *
 * Used by routes.ts to replace the previously inline-defined constant.
 */
export function buildSectionCommandsAutoMap(): Record<string, Record<string, string[]>> {
  const result: Record<string, Record<string, string[]>> = {};
  for (const report of REGISTRY) {
    if (!report.implemented) continue;
    const manifest = report.sectionCommandsManifest;
    if (Object.keys(manifest).length === 0) continue;
    result[report.id] = manifest;
  }
  return result;
}

/** True if the report type ID belongs to Phase 2. */
export function isPhase2Report(id: string): boolean {
  return getReportDefinition(id)?.phase === 2;
}

/** True if the report type ID belongs to the slideshow family. */
export function isSlideshowReport(id: string): boolean {
  return getReportFamily(id) === "slideshow";
}

/** True if the report type ID belongs to the document family. */
export function isDocumentReport(id: string): boolean {
  return getReportFamily(id) === "document";
}

/**
 * Returns the ID of the upstream report this report type is derived from.
 * For QBR, returns "qbr_prep" (QBS). Returns undefined for independent reports.
 */
export function getDerivedFrom(id: string): string | undefined {
  return getReportDefinition(id)?.derivedFrom;
}
