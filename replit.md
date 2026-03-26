# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot designed for SEO professionals working with recovery and addiction treatment centers. Its primary purpose is to streamline reporting workflows, generate QBR-ready reports from diverse SEO data sources using a natural language interface, and provide strategic insights. The project aims to deliver competitive intelligence and enhance the efficiency of SEO reporting within its specialized niche.

## User Preferences
I prefer iterative development with a focus on clear, maintainable code. Before making any major architectural changes or implementing complex features, please discuss the approach with me. I value detailed explanations for significant decisions.

## System Architecture
SmartEO utilizes a modern web stack: React, TypeScript, and Vite for the frontend, styled with Tailwind CSS and shadcn/ui. The backend is built with Express.js and TypeScript, interacting with a PostgreSQL database via Drizzle ORM. Client-side state management is handled by TanStack React Query.

The architecture is modular, separating concerns into distinct components and page views. Key design decisions and features include:

-   **UI/UX Design**: A consistent brand identity is maintained using `#C0392B` (red) and `#1B3A6B` (navy) colors, Calibri font, and an emphasis on intuitive data visualization and report generation layouts.
-   **Reporting Engines**: Dedicated generators for various report types (Bi-Weekly, Monthly, QBR Prep v2, QBR Full, Mid-Strategy) support inline editing, true calendar month logic, and multiple export formats (PPTX, PDF, DOCX). Hybrid DOCX rendering uses Puppeteer for visual fidelity.
-   **Data Handling**: A live data dispatcher prioritizes data sources (Google > Screaming Frog > Call Tracking > Airtable > SEMrush). Missing data is explicitly indicated. API credentials are encrypted with AES-256-GCM.
-   **Client Management**: Comprehensive CRUD operations for managing client data, including configuration of data sources and multi-account credential storage.
-   **Screaming Frog Integration**: Supports storage and retrieval of Screaming Frog crawl CSVs organized into named sessions.
-   **Natural Language Processing**: An NL query parser understands 37 distinct commands across various data sources, incorporating weighted source-priority scoring.
-   **Security**: API routes are protected with `X-Internal-Token`, rate limiting, body size guards, and ownership validation. Soft deletion is implemented for saved reports.
-   **QSSB & Strategy Bank Integration**: Integrates Google Docs for QSSB insights and Notion for a strategy bank, incorporating this content into reports with inline editing.
-   **Looker Studio-Style Data Views**: Provides advanced visualizations like query group tables, landing page tables with multi-metric deltas, and daily trend charts for GSC and GA4.
-   **"Fill in the Gaps" Feature**: An optional preflight step uses a rule-based engine to identify and prompt for missing information via a modal, validating answers server-side.
-   **Dashboard Client Info Tab**: Displays detailed client information, including NSM tracker data, website details, credits, and performance metrics.
-   **Report Workflow**: A 6-step stepper-based guided workflow (`/workflow`) for report preparation, allowing selection of report type, client, strategy areas, findings review, assembly, and preview/export.
-   **Priority Engine (First Layer)**: A lightweight, transparent heuristic scoring layer for workflow findings, visible through priority badges and sorting in various views.
-   **Native Comments & Review System**: A PostgreSQL-backed threaded commenting system integrated into key report pages, allowing for anchored comments, replies, and resolution.
-   **Admin Governance Layer**: An internal-only admin layer (`/admin`) for platform configuration and guidance, including a Config Viewer and a Guidance Library.
-   **Admin Permission System**: Server-enforced admin authentication via `ADMIN_TOKEN` with `requireAdmin` middleware protecting write routes.
-   **Template Builder (Lightweight Foundation)**: Admins can control report section labels, visibility, ordering, and helper notes for all four report types.
-   **Quarterly Content Roadmap (QCR)**: A dedicated 11-slide client-facing PPTX deck type (`/quarterly-content-roadmap`) pulling real QBS strategy data and Airtable production deliverables per quarter. Features a v2 schema adapter (`extractQbsStrategyV2`) that reads `section6Priorities.priorities[]`, `section1Goals.rows[]`, and `sourceSnapshot.manualInputs` from the latest QBS report. Task name parsing (`inferContentTypeFromTask`) maps Airtable shorthand like "AT - CRO Update - ..." to readable credit type labels. A dedicated PPTX generator (`server/qcrPptxGenerator.ts`) applies template accent/dark colors and font family to title slides, table headers, and section text.
-   **Visual Templates System**: A `/templates` page and WYSIWYG canvas editor (`/templates/:type`) for managing all report template types. Template save API (`POST /api/template/save`) is whitelist-validated against allowed keys: `biweekly`, `monthly`, `qbr`, `qbr_prep`, `qcr_layout`, `mid_strategy`. QCR PPTX export reads saved `qcr_layout` template colors from `server/assets/template_config.json`.
-   **Admin Config Overrides**: Extends governance with DB-backed editable config values for report descriptions and source hints.
-   **GuidancePanel**: A shared component that surfaces active guidance from the Admin Guidance Library into the AM workflow and report sidebars.
-   **Quarter-Aware QBS→QBR Bridge**: Logic to intelligently select QBS data sources based on quarter and year for QBR reports.
-   **Discoverability Tool (Keyword Research Engine)**: A core module for business-goal-aligned keyword research, featuring client intake, cluster management, opportunity scoring, a full keyword table with status management, AI generation (Claude) with detailed explainability, page-type recommendations, internal linking suggestions, and comprehensive XLSX/PDF export capabilities.
-   **Phase 2 Architecture Foundation**: Introduces a `Report Registry` and `Phase 2 Infrastructure` for extending generator capabilities, defining `slideshow` and `document` report families.
-   **Mid-Strategy Deck System**: A revamped two-part system (`/eval-sheets` and `/mid-strategy-deck`) for evaluation sheets with competitive benchmarking and a linked 14-slide deck generator supporting slide-by-slide editing and persistent overrides.
-   **Quarterly Content Roadmap (QCR)**: A new client-facing PPTX deck type (`/quarterly-content-roadmap`) pulling per-month strategy from QBS Google Docs and production deliverables from Airtable. Generates title, month-divider, strategy, and production-table slides. API routes: `POST /api/reports/quarterly-content-roadmap/generate` and `POST /api/reports/quarterly-content-roadmap/pptx`.
-   **Visual Templates System**: A `/templates` list page and `/templates/:id` WYSIWYG canvas editor for all report templates. The QCR template supports full element-level drag-to-reposition, resize handles, and a properties panel for colors, font size, weight, alignment, and opacity. Template layouts are stored in `server/assets/template_config.json` under the `qcr_layout` key. Other templates (biweekly, monthly, QBR) show a simpler color editor. Templates section is visible to all users in the sidebar.
-   **AI Provider Chain**: AMA uses Groq (Llama 3.3 70B) → Gemini (gemini-2.0-flash) → OpenAI (GPT-4o). Claude and Perplexity are not used. Required env vars: `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (at least one).
-   **/AMA (Ask Me Anything)**: Fully rebuilt chat interface (`/aca`) with: real SSE streaming via `POST /api/ama/stream`, persistent conversation history stored in `ama_conversations` + `ama_messages` tables, left sidebar navigation, parallel tool execution (`Promise.all`), expandable tool call result display, source filter panel, health check auto-refresh on client switch, NSM Goals now lookup by `client_id`, Airtable data window expanded to 365 days.
-   **Heartland Healing Center removed**: Client ID 12 has been removed from the system entirely (DB, seed, and credit map).

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
-   **Attention** (API key — `server/attentionClient.ts`; commands: `attention_recent_conversations`, `attention_call_summary`; optional per-client `attentionAccountId` for scoping)
-   **Asana** (via Replit connector)
-   **Google Drive** (via Replit connector)
-   **PostgreSQL** (Database)
-   **Google Docs** (for QSSB via Replit connector)
-   **Notion** (for Strategy Bank via Replit connector)
-   **Google Sheets** (NSM Tracker – via Google Drive Replit connector)
-   **Groq** (API key)
-   **Gemini** (API key)
-   **OpenAI** (API key)
-   **Anthropic** (API key)