/**
 * SmartEO Report Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all report types: their family, display metadata,
 * export formats, section-command mappings, and which phase introduced them.
 *
 * Phase 1 reports are registered here to document existing behaviour and to
 * ensure that routes.ts, the history page, and future Phase 2 modules can all
 * use a single authoritative list instead of scattered constants.
 *
 * Phase 2 report types are pre-registered as stubs.  Their generators and
 * preview components don't exist yet; the registry entry gives later modules a
 * stable home to attach to without touching existing infrastructure.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Families ────────────────────────────────────────────────────────────────

/**
 * Two top-level layout families that drive which preview component and export
 * pipeline is used.
 *
 *  • slideshow  → PptxPreview + pptxgenjs export  (Monthly, QBR Full, Mid-Strategy)
 *  • document   → DocxPreview or QbrPrepPreview + docx/Puppeteer export
 *                 (Biweekly, QBR Prep / QBS)
 */
export type ReportFamily = "slideshow" | "document";

// ─── Export formats ───────────────────────────────────────────────────────────

export type ExportFormat = "pptx" | "docx" | "pdf";

// ─── Phase ────────────────────────────────────────────────────────────────────

export type ReportPhase = 1 | 2;

// ─── Section-command manifest ─────────────────────────────────────────────────

/**
 * Maps a report's internal section IDs to the data commands that auto-populate
 * them.  Used by routes.ts when auto-fetching data for a report.
 *
 * Phase 1 values match the existing SECTION_COMMANDS_AUTO constants.
 * Phase 2 generators declare their own manifest alongside their generator file.
 */
export type SectionCommandsManifest = Record<string, string[]>;

// ─── Report type definition ───────────────────────────────────────────────────

export interface ReportTypeDefinition {
  /** Stable string ID used in the database `report_type` column */
  id: string;

  /** Human-readable name shown in the UI */
  displayName: string;

  /** Short description used in tooltips and the history view */
  description: string;

  /** Layout family – drives which preview component and exporter is used */
  family: ReportFamily;

  /** Which export formats this report type supports */
  exportFormats: ExportFormat[];

  /**
   * Front-end route prefix, e.g. "/monthly".
   * Null for report types that don't have a dedicated page yet.
   */
  route: string | null;

  /** Section → commands mapping for auto-data-fetch (routes.ts) */
  sectionCommandsManifest: SectionCommandsManifest;

  /** Which product phase introduced this report type */
  phase: ReportPhase;

  /**
   * True once the generator, preview component, and route all exist.
   * Phase 2 stubs start as false until their sprint is complete.
   */
  implemented: boolean;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const REGISTRY: ReportTypeDefinition[] = [
  // ── Phase 1 ──────────────────────────────────────────────────────────────
  {
    id: "biweekly",
    displayName: "Bi-Weekly Report",
    description: "Pulse metrics and work log for bi-weekly client check-ins. Exported as DOCX.",
    family: "document",
    exportFormats: ["docx", "pdf"],
    route: "/biweekly",
    sectionCommandsManifest: {
      bw_pulse: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "ga4_session_movers"],
      bw_progress: ["airtable_work_log"],
    },
    phase: 1,
    implemented: true,
  },
  {
    id: "monthly",
    displayName: "Monthly Report",
    description: "Comprehensive monthly performance slide deck with QTD data and trendlines. Exported as PPTX.",
    family: "slideshow",
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
    phase: 1,
    implemented: true,
  },
  {
    id: "qbr_prep",
    displayName: "QBR Prep (QBS)",
    description: "Internal Quarterly Business Snapshot — wins, losses, and opportunities for the upcoming quarter. Exported as DOCX via Puppeteer screenshot renderer.",
    family: "document",
    exportFormats: ["docx", "pdf"],
    route: "/qbr-prep",
    sectionCommandsManifest: {},
    phase: 1,
    implemented: true,
  },
  {
    id: "qbr_full",
    displayName: "QBR Full",
    description: "Client-facing Quarterly Business Review slide deck. Exported as PPTX.",
    family: "slideshow",
    exportFormats: ["pptx", "pdf"],
    route: "/qbr-full",
    sectionCommandsManifest: {
      qbr_performance: ["gsc_qoq_queries", "ga4_qoq_organic_funnel", "callrail_qoq_organic_calls", "semrush_organic_overview"],
      qbr_strategy: ["ga4_qoq_organic_landing_pages", "gsc_qoq_pages", "semrush_keyword_distribution"],
    },
    phase: 1,
    implemented: true,
  },
  {
    id: "mid_strategy",
    displayName: "Mid-Strategy SEO Report",
    description: "Deep-dive audit: competitor benchmarks, URL-level audits, and long-term keyword strategy. Exported as PPTX.",
    family: "slideshow",
    exportFormats: ["pptx", "pdf"],
    route: "/mid-strategy",
    sectionCommandsManifest: {},
    phase: 1,
    implemented: true,
  },

  // ── Phase 2 stubs ─────────────────────────────────────────────────────────
  // Generators, preview components, and routes will be added in subsequent
  // sprints.  The registry entries are created now so that:
  //  • routes.ts and the history page can reference them without magic strings
  //  • the family is locked in before implementation starts
  //  • `implemented: false` clearly signals "not yet usable"
  {
    id: "annual_review",
    displayName: "Annual Review",
    description: "Year-over-year performance summary slide deck. Phase 2.",
    family: "slideshow",
    exportFormats: ["pptx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    phase: 2,
    implemented: false,
  },
  {
    id: "competitive_landscape",
    displayName: "Competitive Landscape Report",
    description: "Deep competitor visibility and gap analysis. Phase 2.",
    family: "slideshow",
    exportFormats: ["pptx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    phase: 2,
    implemented: false,
  },
  {
    id: "onboarding_report",
    displayName: "Onboarding Report",
    description: "Initial technical and content audit delivered at client onboarding. Phase 2.",
    family: "document",
    exportFormats: ["docx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    phase: 2,
    implemented: false,
  },
  {
    id: "content_audit",
    displayName: "Content Audit Report",
    description: "URL-level content performance and pruning recommendations. Phase 2.",
    family: "document",
    exportFormats: ["docx", "pdf"],
    route: null,
    sectionCommandsManifest: {},
    phase: 2,
    implemented: false,
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

/** Return all registered report types, optionally filtered by family or phase. */
export function listReportTypes(filters?: {
  family?: ReportFamily;
  phase?: ReportPhase;
  implementedOnly?: boolean;
}): ReportTypeDefinition[] {
  return REGISTRY.filter(r => {
    if (filters?.family !== undefined && r.family !== filters.family) return false;
    if (filters?.phase !== undefined && r.phase !== filters.phase) return false;
    if (filters?.implementedOnly && !r.implemented) return false;
    return true;
  });
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
