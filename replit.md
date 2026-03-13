# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot designed for SEO professionals working with recovery and addiction treatment centers. Its primary purpose is to streamline reporting workflows, generate QBR-ready reports from diverse SEO data sources using a natural language interface, and provide strategic insights. The project aims to deliver competitive intelligence and enhance the efficiency of SEO reporting within its specialized niche.

## User Preferences
I prefer iterative development with a focus on clear, maintainable code. Before making any major architectural changes or implementing complex features, please discuss the approach with me. I value detailed explanations for significant decisions.

## System Architecture
SmartEO utilizes a modern web stack: React, TypeScript, and Vite for the frontend, styled with Tailwind CSS and shadcn/ui. The backend is built with Express.js and TypeScript, interacting with a PostgreSQL database via Drizzle ORM. Client-side state management is handled by TanStack React Query.

The architecture is modular, separating concerns into distinct components and page views. Key design decisions and features include:

-   **UI/UX Design**: A consistent brand identity is maintained using `#C0392B` (red) and `#1B3A6B` (navy) colors, Calibri font, and an emphasis on intuitive data visualization and report generation layouts.
-   **Reporting Engines**: Dedicated generators for various report types (Bi-Weekly, Monthly, QBR Prep v2, QBR Full, Mid-Strategy) support inline editing, true calendar month logic, and multiple export formats (PPTX, PDF, DOCX).
-   **Hybrid DOCX Rendering (QBS)**: For DOCX exports, a Puppeteer-based renderer captures screenshots of HTML sections (ensuring visual fidelity with the in-app preview) and embeds them as PNGs into the DOCX.
-   **Data Handling**: A live data dispatcher prioritizes data sources (Google > Screaming Frog > Call Tracking > Airtable > SEMrush). Missing data is explicitly indicated. All API credentials are encrypted with AES-256-GCM.
-   **Client Management**: Comprehensive CRUD operations for managing client data, including configuration of data sources and multi-account credential storage.
-   **Screaming Frog Integration**: Supports storage and retrieval of Screaming Frog crawl CSVs organized into named sessions.
-   **Natural Language Processing**: An NL query parser understands 37 distinct commands across various data sources, incorporating weighted source-priority scoring.
-   **Security**: API routes are protected with `X-Internal-Token`, rate limiting, body size guards, and ownership validation. Soft deletion is implemented for saved reports.
-   **QSSB & Strategy Bank Integration**: Integrates Google Docs for QSSB insights and Notion for a strategy bank, incorporating this content into reports with inline editing.
-   **Looker Studio-Style Data Views**: Provides advanced visualizations like query group tables, landing page tables with multi-metric deltas, and daily trend charts for GSC and GA4.
-   **"Fill in the Gaps" Feature**: An optional preflight step uses a rule-based engine to identify and prompt for missing information via a modal, validating answers server-side.
-   **Dashboard Client Info Tab**: Displays detailed client information, including NSM tracker data, website details, credits, and performance metrics.
-   **Report Workflow**: A 6-step stepper-based guided workflow (`/workflow`) for report preparation, allowing selection of report type, client, strategy areas, findings review, assembly, and preview/export.
-   **Native Comments & Review System**: A `reportComments` PostgreSQL table stores threaded comments keyed by `reportType` + `clientId` + `anchorId`. The `CommentPanel` component (`client/src/components/comments/CommentPanel.tsx`) renders as a fixed-width right-side drawer inside the flex layout. Integrated into Bi-Weekly, Monthly, QBR Full, and QBS pages. Each page exposes a message-square icon toggle in the sidebar header. Anchors map to DocxPreview section IDs (e.g. `bw_pulse`) or slide indices (`slide:0`). Author names persist in localStorage. Full CRUD via `/api/comments` GET/POST/PATCH/DELETE. Supports threaded replies and resolve/unresolve.
-   **Admin Governance Layer**: An internal-only admin layer (`/admin`) for platform configuration and guidance. Includes a Config Viewer (report registry, workflow-field maps, QBS→QBR tier table) and a Guidance Library — a CRUD interface for leadership guidance notes keyed by `reportType` + `workflowArea` + `status` (draft/active/archived). Schema: `adminGuidance` table (`shared/schema.ts`). Routes: `/api/admin/guidance` CRUD. Pages: `admin-guidance.tsx`, `admin-config.tsx`. Sidebar links are gated by an `isAdminRole()` localStorage check.
-   **Admin Config Overrides**: Extends the governance layer with DB-backed editable config values. Schema: `adminConfigOverrides (id, namespace, itemKey, field, value, updatedAt)`. Routes: `GET/PUT/DELETE /api/admin/config-overrides`. Hook: `useConfigOverrides(namespace?)` exposes `getValue(itemKey, field, fallback)`, `getNote(itemKey)`, `getFieldEntry(itemKey, field)`. Editable values: report type `description` (namespace: `reportType`, field: `description`) and field map/QBS `sourceHint` (field: `sourceHint`). Note-only values: free annotations (field: `note`). Code-only values: IDs, routes, family, audience, mapping keys, phase, buildFrom logic. Runtime: workflow Step 1 reads description override; QbsContextBanner reads sourceHint override. Fallback: code defaults are always used when no override exists.
-   **GuidancePanel**: A shared component (`client/src/components/GuidancePanel.tsx`) that surfaces active guidance from the Admin Guidance Library into the AM workflow. Accepts `reportType` and `workflowArea` props and filters entries by priority tier (exact match → report-type-only → area-only → global). Integrated into: the workflow's Strategy Areas step (per-area guidance), the workflow Handoff step, and all four report page sidebars (Bi-Weekly, Monthly, QBR Prep, QBR Full). Collapsible, accordion entries, session-dismissible via `sessionStorage`.
-   **Quarter-Aware QBS→QBR Bridge**: `selectQbsSource()` in `client/src/lib/qbsQbrMapping.ts` applies 4-tier priority selection (exact Q+Y > year-only > legacy/null > fallback). `QbsContextBanner` shows tier warning badges and inline multi-candidate `<select>` picker. `qbr-full.tsx` uses `useMemo` + `useEffect` for selection and reset.
-   **Phase 2 Architecture Foundation**: Introduces a `Report Registry` (`shared/reportRegistry.ts`) for managing report types and a `Phase 2 Infrastructure` (`server/phase2/`) for extending generator capabilities, defining `slideshow` and `document` report families.
-   **Mid-Strategy Report**: A slide-based PowerPoint-aligned report with 14+ sections, featuring a dedicated generator, preview component, and robust PPTX/PDF export functionality. Includes health checks for integrations and specific slide types for strategic decisions and content structures.

## External Dependencies
SmartEO integrates with the following services:

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
-   **Google Sheets** (NSM Tracker – via Google Drive Replit connector)