# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot for SEO professionals specializing in recovery and addiction treatment centers. It provides a natural language interface to query diverse SEO data sources, generating QBR-ready reports complete with metric cards, data tables, and CSV export. The project's vision is to streamline reporting workflows, enhance strategic insights, and deliver competitive intelligence within its target niche.

## User Preferences
I prefer iterative development with a focus on clear, maintainable code. Before making any major architectural changes or implementing complex features, please discuss the approach with me. I value detailed explanations for significant decisions.

## System Architecture
SmartEO is built with a React, TypeScript, and Vite frontend, styled using Tailwind CSS and shadcn/ui for a modern and responsive user experience. The backend uses Express.js and TypeScript, interacting with a PostgreSQL database via Drizzle ORM. TanStack React Query manages client-side state.

The application employs a modular architecture, segregating concerns into distinct client-side components for navigation, theme management, and various page views (Dashboard, Reports, QBR Prep, Mid-Strategy, Clients, Integrations, Security).

Key architectural decisions and features include:
-   **UI/UX Design**: Employs a consistent brand identity with `#C0392B` red and `#1B3A6B` navy colors, Calibri font, and an emphasis on intuitive layouts for data visualization and report generation.
-   **Reporting Engines**: Dedicated generators for Bi-Weekly, Monthly, QBR Prep v2, QBR Full, and Mid-Strategy SEO reports. Reports support inline editing, true calendar month logic, and various export formats (PPTX, PDF, DOCX).
-   **Hybrid DOCX Rendering (QBS)**: The QBS DOCX export uses a Puppeteer-based screenshot renderer (`server/qbrPrepScreenshotter.ts` + `server/qbrPrepHtmlRenderer.ts`). Each report section is rendered as standalone HTML (matching the preview's visual design with exact fonts, colors, and card layouts), screenshotted at 794×N px using the system Chromium binary (nix), and embedded as a PNG image in the DOCX at the correct 6.5" page width. This ensures the exported DOCX visually matches the in-app HTML preview exactly. The Drive upload uses Google's resumable upload API (two-step: init session through proxy, then PUT directly to Google) to handle file sizes > 1 MB.
-   **Data Handling & Prioritization**: A live data dispatcher prioritizes data sources (Google > Screaming Frog > Call Tracking > Airtable > SEMrush). Unavailability of live data results in explicit "Manual entry needed" or "Data unavailable" messages. All stored API credentials are encrypted with AES-256-GCM.
-   **Client Management**: Comprehensive CRUD operations for recovery center clients, supporting configuration of various data sources and multi-account credential management for services.
-   **Screaming Frog Integration**: Facilitates storage and retrieval of Screaming Frog crawl CSVs, organizing multiple exports into named sessions.
-   **Natural Language Processing**: Features an NL query parser capable of understanding 37 distinct commands across various data sources, incorporating weighted source-priority scoring.
-   **Security**: API routes are protected with `X-Internal-Token` (HMAC-derived), rate limiting (10 req/min) on report generation endpoints, body size guards (2MB for most, 50MB for uploads), and ownership validation for client-specific data. Soft deletion is implemented for saved reports.
-   **QSSB & Strategy Bank Integration**: Integrates with Google Docs for QSSB insights and Notion for a strategy bank, incorporating these into QBR Prep, QBR Full, and Mid-Strategy reports with inline editing and export support.
-   **Looker Studio-Style Data Views**: Provides advanced data visualizations such as query groups tables, landing page tables with multi-metric deltas, and daily trend charts for GSC and GA4.
-   **"Fill in the Gaps" Feature**: An optional preflight clarification step for all report types. It uses a rule-based engine to identify missing information, presenting questions to the user via a modal. Answers are validated and sanitized server-side, and clarification trails are displayed post-report generation.
-   **Dashboard Client Info Tab**: Offers a detailed view of client information, including NSM tracker data, website details, credits, and current/next quarter performance metrics (Sessions, MVP, target percentages).

## External Dependencies
SmartEO integrates with the following external services and APIs:

-   **Google Search Console** (OAuth)
-   **Google Analytics 4** (OAuth)
-   **Google Business Profile** (OAuth)
-   **CallRail** (API key)
-   **CallTrackingMetrics** (API key + secret)
-   **SEMrush** (API key)
-   **Ahrefs** (API key, Bearer token)
-   **Screaming Frog** (desktop CSV import)
-   **Airtable** (PAT)
-   **Asana** (via Replit connector)
-   **Google Drive** (via Replit connector)
-   **PostgreSQL** (Database)
-   **Google Docs** (for QSSB via Replit connector)
-   **Notion** (for Strategy Bank via Replit connector)
-   **Google Sheets** (NSM Tracker — via Google Drive Replit connector)

## Webserv Operations Reference Library

SmartEO is built for Webserv's SEO team. The `docs/webserv/` directory contains the full operational knowledge base that governs how all SEO work is done, how clients are served, and what industry-specific rules apply. **These documents must be referenced whenever generating reports, recommendations, or client-facing content.**

### Key Files (`docs/webserv/`)

| File | What It Covers |
|------|---------------|
| `README.md` | Index of all docs + quick-reference principles |
| `how-we-operate.md` | Core SEO philosophy, decision hierarchy, quality standards — READ FIRST |
| `behavioral-health-glossary.md` | Industry terms: VOB, PHI, YMYL, PPO/HMO/IOP/PHP/RTC, LegitScript, E-E-A-T, Admissions, Payer-Mix |
| `local-seo-behavioral-health.md` | Location page rules: one page per real address, no city-variant pages, trusted advisor responses |
| `sop-new-blog-content.md` | New blog content process (Airtable-generated) |
| `sop-updated-blog-content.md` | Blog content refresh/update process |
| `sop-new-service-page.md` | Net-new service page creation process |
| `sop-primary-location-page.md` | Primary location page structure and eligibility rules |
| `sop-verify-insurance-page.md` | Verify Insurance page structure (Tier 1 Care Access) |
| `sop-monthly-technical-audits.md` | Monthly SEMrush audit → Google Sheet → Asana workflow |
| `sop-biweekly-meetings.md` | Bi-weekly client meeting prep, agenda, email templates |
| `sop-monthly-meetings.md` | Monthly strategy meeting prep, 6-step checklist, email templates |
| `art-of-client-service.md` | Managing expectations, trusted advisor mindset, saying no gracefully |
| `seo-am-job-description.md` | AM role scope, KPIs, competency framework, growth path |

### Critical Industry Context
- **Primary conversion goal**: VOBs (Verified Organic Benefits) and Admissions calls — not just traffic or rankings
- **Content classification**: Behavioral health = YMYL — Google holds these to the highest quality standards
- **Local SEO rule**: No physical address = no location page. Period.
- **Compliance**: HIPAA applies; no retargeting for addiction treatment; LegitScript required for paid ads
- **Decision hierarchy**: Client business goals → Search intent → Google quality → Data → Best practices

## NSM Tracker Integration
The NSM (North Star Metric) Tracker is a Google Sheets-based goal tracking system. `fetchNsmGoals()` in `server/sheetsClient.ts` retrieves session goals, MVP goals (calls/admits), and on-track status for each client. NSM data is wired into:
- **Monthly generator**: QTD KPI slide (Slide 4) — Goal, % to Goal, Status columns
- **QBR Full generator**: NSM Next-Quarter Goals slide (Slide 15) — NSM Tracker goals override smart projections when available
- **Bi-weekly generator**: Performance Pulse section — NSM metrics displayed alongside GA4/GSC/CallRail data
- **Dashboard**: Client Info tab — NSM quarter, goals, actuals, and on-track status

## Guided Report Workflow (`/workflow`)

A 6-step stepper-based report preparation flow at `/workflow`. Accessible from **Prepare a Report** (`/prepare`) — clicking any live report type now routes to `/workflow?type=<id>` instead of directly to the report page. The old direct report page routes (`/biweekly`, `/monthly`, etc.) remain fully intact.

### Steps
1. **Select Report Type** — Card grid from registry; Phase 2 stubs shown as disabled
2. **Select Client** — Searchable client list from `/api/clients`
3. **Strategy Areas** — 8 strategy areas with a nested mini-flow per section (Input → Analyzing 2.2s → Questions → Findings → Committed). Left panel = section list with status icons; Right panel = active section mini-flow
4. **Findings Review** — Summary of all committed sections; individual sections editable (routes back to Step 3)
5. **Report Assembly** — 2.4s building animation → list of committed areas + finding counts
6. **Preview & Export** — Handoff screen with "Open Report Builder" link (to existing report page) and "View Past Reports"; note about future findings pre-population

### Key files
- `client/src/pages/workflow.tsx` — Self-contained page (all steps, all state in one file)
- State is React-local only; no backend round-trips in the workflow shell
- `window.location.search` used for URL param parsing (consistent with other print pages in this project)

### Interaction model
- Back/Next navigation in footer, gated per step (type required for Step 1, client for Step 2, ≥1 committed section for Step 3)
- Each strategy area has 3 mock findings pre-selected; user can deselect before committing
- The "Analyze" button triggers a 2.2s timer then shows clarifying questions
- All 8 strategy areas have contextually relevant questions and findings for behavioral health SEO

### Pre-seeding via URL
- `/workflow?type=biweekly` → starts at Step 2 (type pre-selected)
- `/workflow?type=biweekly&client=9` → starts at Step 3 (type + client pre-selected)

## Phase 2 Architecture Foundation

SmartEO Phase 2 builds on the existing Phase 1 infrastructure without rebuilding it. The following systems were added in Phase 2 to create a clean extension point for new report types.

### Report Registry (`shared/reportRegistry.ts`)
Single source of truth for all report types. Defines `ReportFamily` (`"slideshow" | "document"`), `ReportTypeDefinition`, and exports helpers: `getReportDefinition()`, `getReportFamily()`, `listReportTypes()`, `buildSectionCommandsAutoMap()`. All five Phase 1 report types are registered. Four Phase 2 stubs (Annual Review, Competitive Landscape, Onboarding Report, Content Audit) are pre-registered with `implemented: false`.

`SECTION_COMMANDS_AUTO` in `routes.ts` is now derived from the registry via `buildSectionCommandsAutoMap()` instead of being hardcoded inline.

### Phase 2 Infrastructure (`server/phase2/`)
- `baseTypes.ts` — `Phase2Slide`, `Phase2DocxSection`, `Phase2GeneratorInput`, `Phase2SlideshowReportJson`, `Phase2DocumentReportJson`, `Phase2ReportMeta`
- `generatorBase.ts` — `Phase2Generator<T>` interface, runtime generator registry (`registerPhase2Generator`, `getPhase2Generator`, `runPhase2Generator`)
- `index.ts` — barrel export; import Phase 2 generator files here to trigger their self-registration

### Frontend Utilities (`client/src/lib/reportFamilyUtils.ts`)
Re-exports all registry helpers for React components. Adds `getReportDisplayName()`, `getReportRoute()`, `familyBadgeClass()`, `familyLabel()`, `navigableReportTypes()`.

### Two Report Families
| Family | Data Shape | Preview | Export | Phase 1 Members |
|--------|-----------|---------|--------|-----------------|
| slideshow | `Slide[]` | `PptxPreview` | `generatePptx()` | Monthly, QBR Full, Mid-Strategy |
| document | `DocxSection[]` | `DocxPreview` | `generateBiweeklyDocx()` | Bi-Weekly, QBR Prep/QBS |

### Architecture Reference
Full reuse inventory, extension guide, and brittle-area catalogue: `docs/phase2-architecture.md`

## Mid-Strategy Report
The Mid-Strategy SEO report is a slide-based PowerPoint-aligned report with 14+ sections. Key architecture:
- **Generator**: `server/midStrategyGenerator.ts` — produces structured slides (Cover, Agenda, Checkpoint, Domain Strategy, Migration, Competitive DR, AI Visibility, Efficiency Scorecard, First Focus, IA Comparison, Cluster Blueprint, Credibility Layer, URL Audit, What's Next, Next Steps)
- **Preview**: `client/src/components/report-preview/pptx-preview.tsx` — renders all slide types including `decision-card`, `ia-comparison`, `cluster-map`, `scorecard`, `two-col`, `bullets`, `table`, `metrics`, `chart-bar`, `chart-line`
- **Print page**: `client/src/pages/mid-strategy-print.tsx` — Puppeteer-renderable print layout for PDF generation
- **Exports**: PPTX (via PptxGenJS), PDF (via Puppeteer rendering print page), Google Drive upload
- **Routes**: `/api/reports/mid-strategy/generate`, `/api/reports/mid-strategy/pptx`, `/api/reports/mid-strategy/pdf`, `/api/reports/mid-strategy/upload-to-drive`, `/api/reports/mid-strategy/health-check`
- **Health Check**: Integration health panel checks Screaming Frog, GSC, GA4, NSM Sheet, GBP, CallRail/CTM, Airtable, Asana, SEMrush, Ahrefs status per client
- **New slide types**: `DecisionOption` (domain strategy pros/cons), `IAItem` (current/future nav structure), `ContentCluster` (hub/spoke content clusters)
- **PPTX export hardening**: decision-card → text with ✓/✗ markers, ia-comparison → current/future text blocks, cluster-map → Hub/Page table
- **Credibility controls**: IA/cluster slides (s10–s12) and strategy slides (s09, s_whats_next, s_next_steps) use `sourceType: "needs_input"` / `exportAllowed: false` when no strategist content is entered. All three export routes (PPTX, PDF, Drive) filter out suppressed slides. Preview shows amber "⚠ Needs strategist input" badge on suppressed slides.
- **Strategy Content sidebar section**: Collapsible form for firstFocusBullets, whatsNextBullets, webservNextSteps, clientNextSteps (one per line). Shows amber warning when empty.
- **IA Framework sidebar section**: Collapsible form for currentNav, futureNav, clusters, credibilityPages. Shows amber warning when empty. Format: "LABEL: /child1/, /child2/" for nav/clusters.
- **Route fix**: `/api/reports/mid-strategy/generate` merges raw amInputs fields (strategy/IA) with validated core fields so extra fields reach the generator.
- **PPTX cover**: Uses `generateMidStrategyPptx()` with red accent bars at y=0 and y=7.28, matching the preview.