/**
 * Phase 2 Generator Base
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the contract that all Phase 2 report generators must implement.
 *
 * Phase 1 generators are standalone async functions with ad-hoc parameter
 * objects.  Phase 2 generators implement this interface so that:
 *
 *   1. The router can invoke any Phase 2 generator polymorphically.
 *   2. The gap-analysis engine can be wired in at a consistent point.
 *   3. Export pipelines can remain family-specific while the orchestration
 *      layer stays generic.
 *
 * Reuse principle
 * ───────────────
 * Phase 2 generators MUST reuse existing infrastructure wherever possible:
 *
 *   • Data fetching  — use the existing *Client.ts modules unchanged
 *   • Gap analysis   — call analyzeReportGaps() from gapAnalysisEngine.ts unchanged
 *   • Persistence    — call createSavedReport() / updateSavedReport() from savedReportService.ts unchanged
 *   • PPTX export    — call generatePptx() / generateMidStrategyPptx() from reportGenerators.ts or extend them
 *   • DOCX export    — call generateBiweeklyDocx() / generateQbrPrepV2Docx() from reportGenerators.ts or extend them
 *   • Preview        — use PptxPreview (slideshow) or DocxPreview (document) unchanged
 *
 * Only introduce new export/render code when the above cannot reasonably be
 * extended.  Document the reason in the generator file's header comment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Phase2GeneratorInput, Phase2SlideshowReportJson, Phase2DocumentReportJson, Phase2SectionCommandsManifest } from "./baseTypes";
import type { ReportFamily } from "../../shared/reportRegistry";

// ─── Generator interface ──────────────────────────────────────────────────────

/**
 * Every Phase 2 generator must implement this interface.
 *
 * @template TOutput  Either Phase2SlideshowReportJson or Phase2DocumentReportJson
 *                    (or a subtype thereof for highly structured reports).
 */
export interface Phase2Generator<TOutput extends Phase2SlideshowReportJson | Phase2DocumentReportJson> {
  /** The stable report type ID matching the entry in reportRegistry.ts */
  readonly reportTypeId: string;

  /** Layout family — must match the registry entry */
  readonly family: ReportFamily;

  /**
   * Semantic version of this generator.
   * Stored in the report JSON meta block so we can detect stale saved reports.
   */
  readonly version: string;

  /**
   * Section → commands manifest.
   * Returned here so routes.ts can pull it dynamically rather than hardcoding.
   */
  readonly sectionCommandsManifest: Phase2SectionCommandsManifest;

  /**
   * Core generation method.  Fetches data, assembles the report JSON, and
   * returns it ready to be saved and previewed.
   *
   * Does NOT write to the database — the caller (route handler) is responsible
   * for calling createSavedReport() so that error handling stays centralised.
   */
  generate(input: Phase2GeneratorInput): Promise<TOutput>;

  /**
   * Optional: validate the AM inputs before generation begins.
   * Return an array of human-readable error strings, or empty array if valid.
   *
   * Called by the route handler before invoking generate().
   * Defaults to no validation if not implemented.
   */
  validateInput?(input: Phase2GeneratorInput): string[];
}

// ─── Generator registry ───────────────────────────────────────────────────────

type AnyPhase2Generator = Phase2Generator<Phase2SlideshowReportJson | Phase2DocumentReportJson>;

const _generatorRegistry: Map<string, AnyPhase2Generator> = new Map();

/**
 * Register a Phase 2 generator so that the route handler can look it up by
 * report type ID.
 *
 * Call this from the generator's module-level initialisation, e.g.:
 *
 *   registerPhase2Generator(new AnnualReviewGenerator());
 */
export function registerPhase2Generator(generator: AnyPhase2Generator): void {
  if (_generatorRegistry.has(generator.reportTypeId)) {
    console.warn(`[Phase2] Generator for "${generator.reportTypeId}" is being re-registered. Check for duplicate imports.`);
  }
  _generatorRegistry.set(generator.reportTypeId, generator);
  console.log(`[Phase2] Registered generator: ${generator.reportTypeId} (${generator.family}, v${generator.version})`);
}

/**
 * Retrieve a registered Phase 2 generator by report type ID.
 * Returns undefined if no generator has been registered for that type yet.
 */
export function getPhase2Generator(reportTypeId: string): AnyPhase2Generator | undefined {
  return _generatorRegistry.get(reportTypeId);
}

/**
 * List all registered Phase 2 generators.  Useful for logging and diagnostics.
 */
export function listPhase2Generators(): AnyPhase2Generator[] {
  return Array.from(_generatorRegistry.values());
}

// ─── Route handler helper ─────────────────────────────────────────────────────

/**
 * Validates input and runs a registered Phase 2 generator.
 *
 * This is the standard entry point from routes.ts.  It centralises:
 *   • generator lookup
 *   • optional input validation
 *   • consistent error shape
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, errors }` on
 * validation failure.  Throws on unexpected generator errors (let the route
 * handler's try/catch surface these as 500s).
 */
export async function runPhase2Generator(
  reportTypeId: string,
  input: Phase2GeneratorInput
): Promise<
  | { ok: true; data: Phase2SlideshowReportJson | Phase2DocumentReportJson }
  | { ok: false; errors: string[] }
> {
  const generator = getPhase2Generator(reportTypeId);
  if (!generator) {
    return { ok: false, errors: [`No Phase 2 generator registered for report type "${reportTypeId}"`] };
  }

  if (generator.validateInput) {
    const errors = generator.validateInput(input);
    if (errors.length > 0) return { ok: false, errors };
  }

  const data = await generator.generate(input);
  return { ok: true, data };
}
