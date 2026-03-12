/**
 * Frontend Report Registry Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrappers around the shared reportRegistry that are safe to import in
 * React components.  All heavy logic stays in the registry; this file just
 * re-exports the helpers that the frontend needs most.
 *
 * Usage:
 *   import { getReportFamily, getReportDefinition, listReportTypes } from "@/lib/reportFamilyUtils";
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  getReportDefinition,
  getReportFamily,
  listReportTypes,
  isPhase2Report,
  isSlideshowReport,
  isDocumentReport,
} from "@shared/reportRegistry";

export type {
  ReportFamily,
  ReportPhase,
  ExportFormat,
  ReportTypeDefinition,
  SectionCommandsManifest,
} from "@shared/reportRegistry";

// ─── UI helpers ───────────────────────────────────────────────────────────────

import { getReportDefinition, listReportTypes } from "@shared/reportRegistry";
import type { ReportFamily } from "@shared/reportRegistry";

/**
 * Returns the display name for a report type ID.
 * Falls back to the raw ID if the type is not registered.
 */
export function getReportDisplayName(id: string): string {
  return getReportDefinition(id)?.displayName ?? id;
}

/**
 * Returns the front-end route for a report type ID, or null if it has no
 * dedicated page (e.g. un-implemented Phase 2 stubs).
 */
export function getReportRoute(id: string): string | null {
  return getReportDefinition(id)?.route ?? null;
}

/**
 * Returns the icon/badge colour class for a report family.
 * Matches the existing design token palette (Webserv Navy / Red).
 */
export function familyBadgeClass(family: ReportFamily): string {
  return family === "slideshow"
    ? "bg-[#1B3A6B] text-white"
    : "bg-[#C0392B] text-white";
}

/**
 * Returns a short human-readable label for a report family.
 */
export function familyLabel(family: ReportFamily): string {
  return family === "slideshow" ? "Slideshow" : "Document";
}

/**
 * All report types that have a front-end route (i.e. are navigable),
 * optionally filtered to a specific family.
 */
export function navigableReportTypes(family?: ReportFamily) {
  return listReportTypes({ implementedOnly: true, family }).filter(r => r.route !== null);
}
