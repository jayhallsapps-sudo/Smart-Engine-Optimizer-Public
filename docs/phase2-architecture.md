# SmartEO Phase 2 Architecture

## Purpose

This document captures the Phase 2 architectural decisions, the reuse inventory from Phase 1, and the extension points that new report modules should use.

**Core rule: reuse first, extend second, replace only as a last resort.**

---

## Phase 1 Reuse Inventory

The following Phase 1 systems are **fully reusable** as-is for Phase 2 modules.

### Data Clients (server/)
All external API clients are stateless async functions. Phase 2 generators import and call them directly — no changes needed.

| File | What it provides |
|------|-----------------|
| `gscClient.ts` | Google Search Console queries |
| `ga4Client.ts` | Google Analytics 4 queries |
| `callrailClient.ts` | CallRail call tracking |
| `ctmClient.ts` | CallTrackingMetrics |
| `semrushClient.ts` | SEMrush competitive data |
| `ahrefsClient.ts` | Ahrefs backlink/keyword data |
| `gbpClient.ts` | Google Business Profile |
| `sfClient.ts` | Screaming Frog crawl data |
| `airtable.ts` | Airtable work log |
| `asanaClient.ts` | Asana task log |
| `sheetsClient.ts` | NSM Tracker (Google Sheets) |
| `notionClient.ts` | Notion strategy bank |
| `qssbClient.ts` | QSSB Google Docs integration |

### Persistence (server/)
Phase 2 generators write reports using the same functions Phase 1 uses.

| Function | Location | Usage |
|----------|----------|-------|
| `createSavedReport()` | `savedReportService.ts` | Create a new saved report record |
| `updateSavedReport()` | `savedReportService.ts` | Persist edits back to DB |
| `getSavedReportById()` | `savedReportService.ts` | Load a saved report by ID |
| `listSavedReportsByClientAndType()` | `savedReportService.ts` | History view per type |
| `createCrawlAsset()` | `crawlAssetService.ts` | Attach Screaming Frog data |

The `savedReports` database table stores all report families via a generic `generatedReportJson: jsonb` column — no schema changes required for new report types.

### Gap Analysis Engine (server/gapAnalysisEngine.ts)
`analyzeReportGaps()` accepts any `AccountContext` + `reportType` string. Phase 2 generators pass their new report type ID and the engine works without modification.

### Preview Components (client/src/components/report-preview/)
Both Phase 1 preview components are family-scoped and reusable as-is:

| Component | Family | Used by |
|-----------|--------|---------|
| `PptxPreview` | slideshow | Monthly, QBR Full, Mid-Strategy (Phase 1) + all Phase 2 slideshow reports |
| `DocxPreview` | document | Bi-Weekly (Phase 1) + Phase 2 document reports |
| `QbrPrepPreview` | document (specialized) | QBR Prep / QBS only — too domain-specific to reuse for general document reports |
| `EditableSection` | any | Universal inline-edit component — use for all Phase 2 editable fields |
| `ReportBarChart` / `ReportLineChart` | any | Recharts wrappers — use in Phase 2 slides and sections |
| `MetricCard` | any | KPI delta cards — use in Phase 2 metric slides/sections |
| `AddableReportTable` | any | Tables with user-addable rows — use wherever Phase 2 needs editable tables |

### Export Pipeline (server/reportGenerators.ts)
Phase 2 slideshow reports should call `generatePptx()` or `generateMidStrategyPptx()` directly. Phase 2 document reports should call `generateBiweeklyDocx()` or extend it. New export code is only justified when the slide/section layout requires capabilities that `reportGenerators.ts` cannot support.

### Design Tokens
These colour constants in `reportGenerators.ts` are the canonical brand palette and must be used in all Phase 2 export code:

```ts
const WEBSERV_BLUE  = "1B3A6B";  // Primary navy
const WEBSERV_RED   = "C0392B";  // Accent red
const WEBSERV_LIGHT = "F0F4FA";  // Table row shading
const WEBSERV_GRAY  = "6B7280";  // Secondary text
const WHITE         = "FFFFFF";
```

The same colours are also in the React preview components as hex literals (`#1B3A6B`, `#C0392B`). Do not introduce new brand colours without explicit design approval.

---

## Two Report Families

SmartEO supports exactly two layout families. Every report type (Phase 1 and Phase 2) belongs to one:

### Slideshow family
- **Data shape**: `Slide[]` array (defined in `pptx-preview.tsx`)
- **Phase 2 extension**: `Phase2Slide[]` (adds optional `phase2Meta` bag without touching the base type)
- **Preview**: `<PptxPreview slides={...} edits={...} onEdit={...} />`
- **Export**: `generatePptx()` / `generateMidStrategyPptx()` in `reportGenerators.ts`
- **Phase 1 members**: Monthly, QBR Full, Mid-Strategy
- **Phase 2 stubs**: Annual Review, Competitive Landscape

### Document family
- **Data shape**: `DocxSection[]` array (defined in `docx-preview.tsx`)
- **Phase 2 extension**: `Phase2DocxSection[]` (adds optional `phase2Meta` bag)
- **Preview**: `<DocxPreview sections={...} edits={...} onEdit={...} />`
- **Export**: `generateBiweeklyDocx()` in `reportGenerators.ts`
- **Phase 1 members**: Bi-Weekly, QBR Prep/QBS (uses specialized `QbrPrepPreview`)
- **Phase 2 stubs**: Onboarding Report, Content Audit

---

## Phase 2 Infrastructure Files

| File | Purpose |
|------|---------|
| `shared/reportRegistry.ts` | Single source of truth for all report type IDs, families, display names, export formats, section-command manifests, and phase |
| `server/phase2/baseTypes.ts` | Extended type interfaces for Phase 2 generators (Phase2Slide, Phase2DocxSection, Phase2GeneratorInput, etc.) |
| `server/phase2/generatorBase.ts` | The `Phase2Generator<T>` interface + runtime registry + `runPhase2Generator()` orchestrator |
| `server/phase2/index.ts` | Barrel export for Phase 2 infrastructure |
| `client/src/lib/reportFamilyUtils.ts` | Frontend helpers: `getReportFamily()`, `getReportDisplayName()`, `getReportRoute()`, `navigableReportTypes()` |

---

## How to Add a Phase 2 Report

### Step 1 — Register in the registry
Update `shared/reportRegistry.ts`: find the stub for your report type and set `implemented: true`, add the `route`, and fill in `sectionCommandsManifest`.

### Step 2 — Write the generator
Create `server/phase2/generators/<reportTypeId>Generator.ts`. Implement the `Phase2Generator<Phase2SlideshowReportJson | Phase2DocumentReportJson>` interface. At the bottom of the file, call `registerPhase2Generator(new YourGenerator())`.

Import the generator file in `server/phase2/index.ts` so it self-registers when the server starts.

### Step 3 — Add the API route
In `server/routes.ts`, add a POST `/api/reports/<report-type>/generate` route that:
1. Validates the request body
2. Calls `runPhase2Generator(reportTypeId, input)`
3. Calls `createSavedReport()` with the result
4. Returns the saved report

Follow the existing biweekly/monthly route patterns.

### Step 4 — Add the frontend page
Create `client/src/pages/<report-type>.tsx`. Follow the `monthly.tsx` pattern for slideshow family or `biweekly.tsx` for document family. Use `<PptxPreview>` or `<DocxPreview>` unchanged.

### Step 5 — Register the route in App.tsx
Add `<Route path="/your-route" component={YourPage} />` to `client/src/App.tsx`.

---

## What Does NOT Need to Change for Phase 2

- `shared/schema.ts` — the `savedReports` table supports any `reportType` string and stores JSON generically. No migration needed for new Phase 2 report types.
- All Phase 1 data clients (`*Client.ts`) — import and call as-is.
- `gapAnalysisEngine.ts` — pass the new `reportType` string; engine adapts.
- `savedReportService.ts` — call existing functions unchanged.
- `PptxPreview` and `DocxPreview` — use as-is; Phase 2 slide/section types extend, not replace.
- `EditableSection`, `MetricCard`, `ReportBarChart`, `ReportLineChart`, `AddableReportTable` — use as-is.
- The Puppeteer/screenshot export pipeline (`qbrPrepScreenshotter.ts`) — QBR Prep-specific; only reuse if a Phase 2 document report genuinely needs pixel-perfect DOCX output.

---

## Brittle Areas Identified (Refactor Candidates)

These are not blockers for Phase 2 but should be addressed before the system scales further:

### 1. `SECTION_COMMANDS_AUTO` was a hardcoded inline constant in `routes.ts`
**Status**: Fixed in Phase 2 scaffolding — now derived from `shared/reportRegistry.ts` via `buildSectionCommandsAutoMap()`.

### 2. Report type strings are not validated at the API boundary
`savedReports.reportType` is a plain `text` column. Nothing prevents a typo from creating orphaned records. Phase 2 should add a Zod enum validator in routes.ts that references `listReportTypes()` from the registry.

### 3. Gap analysis `reportType` parameter is untyped
`analyzeReportGaps()` accepts `reportType: string`. A union type derived from the registry would catch mismatches at compile time.

### 4. `qbr_prep_reports` is a separate table from `saved_reports`
The `qbrPrepReports` table duplicates most columns from `savedReports`. For Phase 2 the QBR Prep workflow should migrate to `savedReports` (it already partially does via `qbr_prep` rows in that table). The `qbrPrepReports` table is a historical artefact.

### 5. Preview component prop drilling
`edits` and `onEdit` are passed as props through multiple preview component layers. A React context for edits would clean this up and make it easier for Phase 2 previews to participate in the edit system without manual wiring.
