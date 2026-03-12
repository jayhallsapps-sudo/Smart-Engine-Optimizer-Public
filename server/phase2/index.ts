/**
 * Phase 2 module barrel export.
 *
 * Import from this file in routes.ts to keep the import surface clean.
 * As Phase 2 generators are implemented, they should register themselves
 * by importing this file (which triggers their module-level registerPhase2Generator() call).
 *
 * Example (once AnnualReviewGenerator exists):
 *   import "./generators/annualReviewGenerator"; // side-effect: registers itself
 */

export {
  registerPhase2Generator,
  getPhase2Generator,
  listPhase2Generators,
  runPhase2Generator,
} from "./generatorBase";

export type {
  Phase2Generator,
} from "./generatorBase";

export type {
  Phase2GeneratorInput,
  Phase2SlideshowReportJson,
  Phase2DocumentReportJson,
  Phase2ReportMeta,
  Phase2Slide,
  Phase2DocxSection,
  Phase2SectionMeta,
  Phase2SectionCommandsManifest,
} from "./baseTypes";
