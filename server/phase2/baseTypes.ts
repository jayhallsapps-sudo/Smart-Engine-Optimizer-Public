/**
 * Phase 2 Base Types
 * ─────────────────────────────────────────────────────────────────────────────
 * These interfaces extend the existing Phase 1 data shapes so that Phase 2
 * generators can be built without modifying core Phase 1 types.
 *
 * Design rule: Phase 2 types WRAP or EXTEND — they never replace.
 *
 *   Phase 1 shape            Phase 2 extension
 *   ─────────────────────── ─────────────────────────────────────────
 *   Slide (pptx-preview)    Phase2Slide (adds phase2Meta optional bag)
 *   DocxSection             Phase2DocxSection (adds phase2Meta optional bag)
 *   BiweeklyReportJson      Phase2DocumentReportJson (generic doc root)
 *   MonthlyReportJson       Phase2SlideshowReportJson (generic slide root)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Slide } from "../../client/src/components/report-preview/pptx-preview";
import type { DocxSection } from "../../client/src/components/report-preview/docx-preview";
import type { GapContext } from "../gapAnswerContext";
import type { Client } from "../../shared/schema";

// ─── Shared metadata bag ──────────────────────────────────────────────────────

/**
 * Optional metadata that Phase 2 generators can attach to any slide or section
 * without breaking the Phase 1 renderer.  Fields here are informational — the
 * existing preview components will silently ignore unknown keys.
 */
export interface Phase2SectionMeta {
  /** Which Phase 2 report type generated this slide/section */
  sourceReportType: string;
  /** Whether the AM can hide this slide/section in the preview */
  hideable?: boolean;
  /** Whether the AM can reorder this slide/section */
  reorderable?: boolean;
  /** Arbitrary tags for future filtering logic */
  tags?: string[];
}

// ─── Phase 2 slide (slideshow family) ────────────────────────────────────────

/**
 * Extends the existing `Slide` type from pptx-preview without modifying it.
 * Phase 2 slideshow generators should use this as their slide element type.
 * The preview component receives `Phase2Slide[]` cast as `Slide[]` — the
 * extra `phase2Meta` field is safely ignored.
 */
export interface Phase2Slide extends Slide {
  phase2Meta?: Phase2SectionMeta;
}

// ─── Phase 2 section (document family) ────────────────────────────────────────

/**
 * Extends the existing `DocxSection` type without modifying it.
 * Phase 2 document generators should use this as their section element type.
 */
export interface Phase2DocxSection extends DocxSection {
  phase2Meta?: Phase2SectionMeta;
}

// ─── Phase 2 report JSON roots ────────────────────────────────────────────────

/**
 * Root JSON shape for Phase 2 slideshow reports.
 * Mirrors `MonthlyReportJson` but uses `Phase2Slide[]` and adds a `meta` block.
 *
 * Stored in `savedReports.generatedReportJson`.
 */
export interface Phase2SlideshowReportJson {
  report_title: string;
  client_name: string;
  period_label: string;
  generated_at: string;
  report_type: string;
  slides: Phase2Slide[];
  meta: Phase2ReportMeta;
}

/**
 * Root JSON shape for Phase 2 document reports.
 * Mirrors `BiweeklyReportJson` but uses `Phase2DocxSection[]` and adds a `meta` block.
 *
 * Stored in `savedReports.generatedReportJson`.
 */
export interface Phase2DocumentReportJson {
  report_title: string;
  client_name: string;
  period_label: string;
  generated_at: string;
  report_type: string;
  sections: Phase2DocxSection[];
  meta: Phase2ReportMeta;
}

/**
 * Metadata attached to every Phase 2 report root.
 * Captured at generation time so the history view can surface context without
 * re-fetching the source snapshot.
 */
export interface Phase2ReportMeta {
  generatorVersion: string;
  dataSourcesUsed: string[];
  gapQuestionsAnswered: number;
  generatedWithLiveData: boolean;
  notes?: string[];
}

// ─── Generator input ──────────────────────────────────────────────────────────

/**
 * The common context object passed to every Phase 2 generator.
 * Mirrors the inline parameter objects in Phase 1 generators but uses a single
 * stable interface so Phase 2 generators can evolve independently.
 */
export interface Phase2GeneratorInput {
  client: Client;
  dateRange: {
    start: string;
    end: string;
    label: string;
  };
  amInputs: {
    clientSentiment?: string;
    amThoughts?: string;
    priorityChecks?: string;
    clientNotes?: string;
    [key: string]: string | undefined;
  };
  gapContext?: GapContext;
  /** Pre-fetched section data keyed by section ID, matching the report's SectionCommandsManifest */
  prefetchedData?: Record<string, any>;
  /** Optional free-form context from Phase 2-specific AM input forms */
  extendedInputs?: Record<string, unknown>;
}

// ─── Section-commands manifest type ──────────────────────────────────────────

/**
 * Used by Phase 2 generator files to declare which data commands each section
 * needs.  Passed to the registry when the generator registers itself.
 */
export type Phase2SectionCommandsManifest = Record<string, string[]>;
