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
- `server/ahrefsClient.ts` - Ahrefs v3 API client
- `server/sheetsClient.ts` - NSM Google Sheet XLSX parser (10MB size cap)
- `client/src/lib/queryClient.ts` - TanStack Query client + auth token bootstrap
- `client/src/hooks/useReportSave.ts` - Autosave hook with sourceSnapshotJson population
- `shared/schema.ts` - Drizzle schema (all tables including deletedAt on saved_reports)
- `.agents/skills/data-handling-rules/SKILL.md` - Data handling rules for all report types

## Removed / Legacy
- QBR Prep v1 routes (`/generate`, `/docx`, `/upload-to-drive`, `/saved/*`) — removed; use v2 routes only
- SEMrush Project ID input field removed from client setup UI (field still in DB; connectedServices now checks actual API credential existence)
- History page renamed to "Query Log" to avoid confusion with saved reports
