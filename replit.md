# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot designed for SEO professionals working with recovery and addiction treatment centers. It offers a natural language interface to query SEO data from multiple sources, generating QBR-ready results with metric cards, data tables, and CSV export capabilities. The project aims to streamline reporting, enhance strategic planning, and provide competitive intelligence within this specialized niche.

## User Preferences
I prefer iterative development with a focus on clear, maintainable code. Before making any major architectural changes or implementing complex features, please discuss the approach with me. I value detailed explanations for significant decisions.

## System Architecture
SmartEO utilizes a React, TypeScript, and Vite frontend with Tailwind CSS and shadcn/ui for a modern and responsive user interface. The backend is built with Express.js and TypeScript, connected to a PostgreSQL database via Drizzle ORM. State management is handled by TanStack React Query.

The application features a modular structure, separating concerns into client-side components for navigation, theme management, and distinct page views (Dashboard, Reports, QBR Prep, Mid-Strategy, Clients, Setup, History).

Key architectural decisions include:
- **UI/UX**: Consistent branding with `#C0392B` red and `#1B3A6B` navy, Calibri font, and a focus on intuitive layouts for data presentation and report generation.
- **Reporting Engines**: Dedicated generators for Bi-Weekly, Monthly (15-slide PPTX with true calendar month logic, AM inputs, and inline editing), QBR Prep v2 (snapshot with inline editing and PDF/DOCX export), QBR Full, and Mid-Strategy SEO (14-slide PPTX competitive intelligence deck).
- **Data Handling**: A live data dispatcher prioritizes data sources (Google > Screaming Frog > Call Tracking > Airtable > SEMrush). When live data is unavailable, sections show "Manual entry needed" or "Data unavailable" rather than silently substituting mock values. All stored API credentials are encrypted using AES-256-GCM (SESSION_SECRET required at startup — no fallback).
- **Client Management**: Supports CRUD operations for recovery center clients, including configuration of various data sources and SEO tools. Multi-account credential management is available for services.
- **Screaming Frog Integration**: Handles storage and retrieval of Screaming Frog crawl CSVs, grouping multiple exports into named sessions. Max 24 reports per client (oldest deleted on 25th upload).
- **Natural Language Processing**: An NL query parser with weighted source-priority scoring supports 37 distinct commands across various data sources.

## Security Architecture
- **API Route Protection**: All `/api/*` routes require `X-Internal-Token` header (derived from SESSION_SECRET via HMAC). Frontend auto-fetches token from `GET /api/auth/bootstrap` (unprotected) via `queryClient.ts`.
- **Rate Limiting**: `express-rate-limit` (10 req/min) applied to all `/api/reports/*` routes.
- **Body Size Guards**: Content-Length header checked; non-export routes limited to 2MB, export/upload routes limited to 50MB (global 50MB parser limit in index.ts).
- **Ownership Validation**: DELETE/PATCH on saved-reports, sf-reports, call-tracking-reports, and crawl-assets validate that the requested clientId matches the record's clientId.
- **Soft Delete**: saved_reports table uses `deletedAt` nullable timestamp; DELETE endpoint sets deletedAt instead of hard-deleting.

## External Dependencies
SmartEO integrates with the following external services and APIs:

-   **Google Search Console** (OAuth) - LIVE
-   **Google Analytics 4** (OAuth) - LIVE
-   **Google Business Profile** (OAuth) - LIVE
-   **CallRail** (API key) - LIVE
-   **CallTrackingMetrics** (API key + secret) - LIVE
-   **SEMrush** (API key) - LIVE
-   **Ahrefs** (API key, Bearer token) - LIVE (backlink_overview, keyword_rankings, competitor_visibility)
-   **Screaming Frog** (desktop CSV import) - LIVE (reads stored crawl data)
-   **Nimbata** (API key) - Mock fallback
-   **Airtable** (PAT) - LIVE
-   **Asana** (via Replit connector) - LIVE
-   **Google Drive** (via Replit connector) - LIVE (NSM Sheet download, DOCX/PPTX upload)
-   **PostgreSQL** (Database)

## Key Files
- `server/routes.ts` - All API routes (2150+ lines); auth middleware, rate limiting, report generation
- `server/encryption.ts` - AES-256-GCM encrypt/decrypt + deriveInternalToken() via HMAC
- `server/savedReportService.ts` - Saved report CRUD with soft delete
- `server/monthlyGenerator.ts` - Monthly 15-slide PPTX generator
- `server/midStrategyGenerator.ts` - 14-slide mid-strategy generator
- `server/qbrPrepSectionGenerator.ts` - QBR Prep v2 section generator (7 sections with tracking gaps, topic clustering, sanitization)
- `server/qbrPrepHelpers.ts` - QBR Prep helpers (topic patterns, tier diagnosis, source normalization)
- `server/qbrPrepTypes.ts` - QBR Prep types (TrackingRow with status field, Section2Conversions with trackingDisclaimer)
- `server/qbrPrepDocxGenerator.ts` - QBR Prep DOCX export (5-col Section 7 with Status, tracking disclaimer, S7 edit migration)
- `server/ahrefsClient.ts` - Ahrefs v3 API client
- `server/sheetsClient.ts` - NSM Google Sheet XLSX parser (10MB size cap)
- `client/src/lib/queryClient.ts` - TanStack Query client + auth token bootstrap
- `client/src/hooks/useReportSave.ts` - Autosave hook with sourceSnapshotJson population
- `shared/schema.ts` - Drizzle schema (all tables including deletedAt on saved_reports)
- `.agents/skills/data-handling-rules/SKILL.md` - Data handling rules for all report types

## Master Patch (March 2026)
- **NSM Tracker KPI Logic**: `fetchNsmGoals()` supports `forwardLooking` param for next-quarter tab; `normalizeKpiLabel()` maps mvpType to display label; QBR Prep Section 1 primary KPI is dynamic (e.g., "Organic + GMB + AI LLM Calls")
- **Mandatory AM Inputs**: All 5 report types require Client Sentiment, AM's Thoughts, Priority Checks before generation; Client Notes is optional; frontend + backend validation blocks generation if required fields empty
- **Legacy Label Migration**: `hypothesis` → `amThoughts`, `auditNotes` → `priorityChecks`, `sentiment` → `clientSentiment`; `migrateLegacyAmInputs()` in shared/schema.ts; DOCX guards check both old and new field names
- **Connection to Admits**: Uses High/Medium/Low labels (replaced Direct/Assisted/Informational); `topicAdmitConnection()` and `classifyTrafficPageConnection()` both return High/Medium/Low
- **Source Hierarchy**: Olivia alignment — Contact vs VOB form distinction; page diagnosis wording reflects crawl status
- **AM Inputs Edit Keys**: `am_sentiment`, `am_thoughts`, `am_priority_checks`, `am_client_notes`
- **CLIENT_SENTIMENT_OPTIONS**: `["Happy", "Neutral", "Concerned", "Frustrated"]`
- **Routes use validated/normalized amInputs**: All generate endpoints pass `amValidation.amInputs` (not raw body) to generators

## QSSB & Strategy Bank Integration (March 2026)
- **QSSB Google Doc**: `server/qssbClient.ts` fetches and parses QSSB document via Google Docs connector; extracts "Client Insights" (questions for client) and "Additional Opportunities" (upsells/cross-sells); 1hr cache TTL
- **Notion Strategy Bank**: `server/notionClient.ts` queries Notion SEO Strategy Bank via Notion connector; Strategy Bank entries merged into "Additional Opportunities"
- **Report Integration**: QSSB sections added to QBR Prep (Section 8/9), QBR Full (slides), Mid-Strategy (slides); all with inline editing support
- **Export Support**: QSSB sections included in DOCX export (qbrPrepDocxGenerator.ts) and print view (qbr-prep-print.tsx)
- **Settings UI**: Setup page has QSSB Doc URL and Notion Strategy Bank URL inputs with "Test Connection" buttons
- **Test Routes**: `GET /api/qssb/test` and `GET /api/strategy-bank/test` verify document access
- **Settings Keys**: `qssb_document_id`, `strategy_bank_page_id`

## Looker Studio-Style Data Views (March 2026)
- **Query Groups Table**: Topic-level aggregation with % deltas (# Queries Δ, Impressions Δ) in QBR Prep Section 3 and Monthly report
- **Landing Page Table**: Multi-metric deltas (Clicks Δ, Impressions Δ, # Queries Δ) in QBR Prep Section 3 and Monthly report
- **Daily Trend Charts**: GSC (Clicks + Impressions) and GA4 (Sessions + Engaged Sessions) daily line charts comparing current vs previous period in Monthly report
- **Data Functions**: `fetchGscDailyTrend()` in gscClient.ts, `fetchGa4DailyTrend()` in ga4Client.ts, `fetchGscQueryRowsForTopicClustering()` in gscClient.ts

## Fill in the Gaps (March 2026)
- **Feature**: Optional preflight clarification step for all 5 report types (Bi-Weekly, Monthly, QBR Prep, QBR Full, Mid-Strategy)
- **UI**: Checkbox labeled "Fill in the gaps" above Generate button in every report sidebar; unchecked by default; helper text explains the purpose
- **Flow**: When enabled, clicking Generate first calls `POST /api/reports/gap-analysis` → evaluates inputs → if questions found, opens `FillInTheGapsModal`; if no questions, generates immediately
- **Engine**: `server/gapAnalysisEngine.ts` — 80+ rule-based question templates across 9 categories; hard cap of 6 questions; 5-second timeout on SEO HQ context load; `overallStatus: "timed_out"` vs `"unavailable"` are distinct; returns `SeoHqLoadStatus` (`{strategyBank, qssb, overallStatus}`)
- **Modal**: `client/src/components/FillInTheGapsModal.tsx` — step-by-step one-question-at-a-time; file validation (MIME type + 5MB size limit); strict URL scheme enforcement (http/https only; blocks javascript:, data:, file:, ftp:, mailto:); supports `initialAnswers` + `onAnswersChange` props for draft recovery
- **Hook**: `client/src/hooks/useFillInTheGaps.ts` — idempotency guards (`isRunningRef`, `isSubmittingRef`, `sessionIdRef`); localStorage draft recovery (2hr TTL, keyed by `gap_draft_{reportType}_{clientId}`); `answerUsage` state; `fetchAnswerUsage(sessionId)` fetches usage map after generation; `seoHqLoadStatus` state
- **Clarification Trail**: `client/src/components/ClarificationTrail.tsx` — internal-only collapsible QA panel (screen only, `print:hidden`); shows Fill in the Gaps status, SEO HQ context status (with distinct "Timed out (5s)" label), Q&A summary, supporting links/files per answer; "Used in report" green badges per answer (with field label from `GAP_CONTEXT_FIELD_LABELS`); integrated into all 5 report pages after report preview
- **Server-side Validation**: `server/gapAnswerValidator.ts` — `validateAndSanitizeGapAnswers()` validates MIME types, file sizes, URL schemes; used in session creation route
- **Context + Usage**: `server/gapAnswerContext.ts` — `buildGapContext()` converts answers to structured `GapContext`; `getAnswerUsageMap(answers)` maps questionId → report field name; usage stored in `answerUsageJson` column
- **Persistence**: `gap_analysis_sessions` DB table — `seoHqLoadStatus`, `answerUsageJson` columns; usage populated after report generation; `GET /api/reports/gap-analysis/session/:id` returns session + answerUsage
- **Constants**: `ALLOWED_GAP_FILE_TYPES`, `MAX_GAP_FILE_SIZE_BYTES` (5MB), `ALLOWED_URL_SCHEMES`, `GAP_CONTEXT_FIELD_LABELS` in shared/schema.ts
- **Routes**: `POST /api/reports/gap-analysis` + session; `GET /api/reports/gap-analysis/session/:id`; all 5 generate routes accept `gapSessionId` and call `storage.updateGapSession` with `answerUsage` after generation via `onSettled`
- **Draft Recovery**: localStorage key `gap_draft_{reportType}_{clientId}` stores `{questions, partialAnswers, seoHqLoadStatus, savedAt}`; 2hr TTL; cleared on submit; modal hydrates from draft when question IDs match

## Removed / Legacy
- QBR Prep v1 routes (`/generate`, `/docx`, `/upload-to-drive`, `/saved/*`) — removed; use v2 routes only
- SEMrush Project ID input field removed from client setup UI (field still in DB; connectedServices now checks actual API credential existence)
- History page renamed to "Query Log" to avoid confusion with saved reports
