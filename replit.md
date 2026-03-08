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
- **Reporting Engines**: Dedicated generators for Bi-Weekly, Monthly (9-slide PPTX with true calendar month logic, AM inputs, and inline editing), QBR Prep (7-section quarterly snapshot with inline editing and PDF/DOCX export), and Mid-Strategy SEO (14-slide PPTX competitive intelligence deck with a 3-layer architecture: source normalization, workbook builder, slide generator).
- **Data Handling**: A live data dispatcher prioritizes data sources (Google > Screaming Frog > Call Tracking > Airtable > SEMrush) and includes mock fallbacks for unconfigured or errored clients. All stored API credentials are encrypted using AES-256-GCM.
- **Client Management**: Supports CRUD operations for recovery center clients, including configuration of various data sources and SEO tools. Multi-account credential management is available for services.
- **Screaming Frog Integration**: Handles storage and retrieval of Screaming Frog crawl CSVs, grouping multiple exports into named sessions for comprehensive technical health analysis.
- **Natural Language Processing**: An NL query parser with weighted source-priority scoring supports 37 distinct commands across various data sources.

## External Dependencies
SmartEO integrates with the following external services and APIs:

-   **Google Search Console** (OAuth) - LIVE
-   **Google Analytics 4** (OAuth) - LIVE
-   **Google Business Profile** (OAuth) - LIVE
-   **CallRail** (API key) - LIVE
-   **CallTrackingMetrics** (API key + secret) - LIVE
-   **SEMrush** (API key) - LIVE
-   **Screaming Frog** (desktop CSV import) - LIVE (reads stored crawl data)
-   **Nimbata** (API key) - Mock fallback
-   **Airtable** (PAT) - LIVE
-   **Asana API** (via Replit connector)
-   **PostgreSQL** (Database)