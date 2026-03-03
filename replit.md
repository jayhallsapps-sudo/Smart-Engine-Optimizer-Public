# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot for SEO professionals serving the **recovery and addiction centre space**. It provides a natural language interface to query SEO data from 7 data sources and returns QBR-ready results with metric cards, data tables, and CSV export.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State Management**: TanStack React Query

## Architecture
```
client/src/
  App.tsx              - Main app with sidebar layout
  components/
    app-sidebar.tsx    - Navigation sidebar (Reports, Clients, History, Setup)
    theme-provider.tsx - Dark/light mode
    theme-toggle.tsx   - Theme switcher
  pages/
    reports.tsx        - Main Reports page (3-panel: selectors top, chat left, checklist right)
    clients.tsx        - Client CRUD management (tabbed form: Data Sources, SEO Tools, Config)
    setup.tsx          - Multi-account credential management for 7 services
    history.tsx        - Query log history
server/
  index.ts             - Express server entry
  routes.ts            - API routes with live data dispatcher (priority: Google→SF→CallRail→CTM→SEMrush→GBP→mock)
  storage.ts           - Database CRUD operations
  db.ts                - Database connection
  encryption.ts        - AES-256-GCM encryption for credentials
  nlRouter.ts          - NL query parser with weighted source-priority scoring (37 commands)
  mockData.ts          - Demo data generator with addiction-space content (37 mock generators)
  googleToken.ts       - Shared Google OAuth token exchange + date utilities
  gscClient.ts         - Live Google Search Console API (gsc_top_queries, gsc_qoq_queries/pages, query_to_page, high_imp_low_ctr)
  ga4Client.ts         - Live GA4 Data API (funnel, landing pages, session movers, QTD, YoY)
  callrailClient.ts    - Live CallRail v3 API (calls, landing pages, summary)
  ctmClient.ts         - Live CallTrackingMetrics API (calls, landing pages)
  semrushClient.ts     - Live SEMrush API (organic overview, keyword rankings, distribution, competitors)
  gbpClient.ts         - Live Google Business Profile API (reviews, star rating)
  sfClient.ts          - Screaming Frog stored data reader (technical health, new pages diff)
  airtable.ts          - Live Airtable REST API for work log
  reportGenerators.ts  - .docx (biweekly) and .pptx (monthly/QBR) generators
  googleAuth.ts        - Google OAuth flow (GSC, GA4, GBP, Sheets scopes)
  seed.ts              - Seeds 8 recovery centre clients
shared/
  schema.ts            - Drizzle schema, types, SERVICE_CONFIGS (10 services incl. GBP), COMMANDS (37)
```

## Data Model
- **clients**: Recovery centre accounts with GSC, GA4, CallRail, CTM, SEMrush, Screaming Frog, Nimbata, Airtable, GBP configs; brand terms, lead events, money pages, organic source terms, gbpLocationName
- **query_logs**: History of NL queries with parsed commands and results
- **api_credentials**: Encrypted API keys/tokens with `accountLabel` for multi-account support per service

## Data Source Priority
When multiple sources can answer a query, the system picks the highest-priority one:
1. Google (GSC, GA4) — Tier 1
2. Screaming Frog — Tier 2
3. Call tracking (CallRail, CTM, Nimbata) — Tier 3
4. Airtable — Tier 4
5. SEMrush — Tier 5
6. Ahrefs — Tier 6 (blocked, MCP/Connect only)

## Data Sources (10)
1. Google Search Console (OAuth) — LIVE
2. Google Analytics 4 (OAuth) — LIVE
3. Google Business Profile (OAuth, scope: business.manage) — LIVE
4. CallRail (API key) — LIVE
5. CallTrackingMetrics (API key + secret) — LIVE
6. SEMrush (API key) — LIVE
7. Screaming Frog (desktop CSV import) — LIVE (reads stored crawl data)
8. Nimbata (API key) — mock fallback
9. Airtable (PAT) — LIVE
10. Ahrefs — BLOCKED (MCP/Connect only)

## Live vs Mock fallback
Each live client returns `null` if the client is not configured (no siteUrl, propertyId, etc.) or if no credential is stored. Routes dispatcher falls back to mock in that case with a console warning. If the live client throws (API error), it also falls back to mock.

## Available Commands (37)
GSC: gsc_top_queries, gsc_qoq_queries, gsc_qoq_pages, gsc_query_to_page_map, gsc_high_impressions_low_ctr, gsc_high_traffic_low_cvr, gsc_indexation_stability
GA4: ga4_combined_funnel, ga4_qoq_organic_funnel, ga4_landing_pages_by_sessions, ga4_qoq_organic_landing_pages, ga4_landing_pages_by_conversions, ga4_qtd_totals, ga4_session_movers, ga4_conversion_movers, ga4_yoy_comparison
CallRail: callrail_summary, callrail_qoq_organic_calls, callrail_qoq_top_landing_pages
CTM: ctm_qoq_organic_calls, ctm_qoq_top_landing_pages
SEMrush: semrush_organic_overview, semrush_keyword_rankings, semrush_keyword_distribution, semrush_competitor_visibility
Ahrefs (blocked): ahrefs_backlink_overview, ahrefs_keyword_rankings, ahrefs_competitor_visibility
Other: gbp_local_summary, content_output_summary, technical_health_summary, core_web_vitals, new_pages_tracker, tracking_anomaly_check, monthly_trendline, quarterly_forecast, airtable_work_log

## Reports Page Layout
- Top bar: Toggle prompts panel button + Client dropdown + Report type buttons (Bi-Weekly | Monthly | QBR)
- Left panel (w-64, collapsible): Prompts library — type-specific prompts (12 bi-weekly, 15 monthly, 18 QBR). Clicking a prompt fills the textarea. Toggle button in top bar shows/hides.
- Center panel (flex-1): Chat/query interface. Send button is outside the textarea (flex sibling, not absolutely positioned). Each result card has a "Commit to Report" button.
- Right panel (w-72): Checklist of required sections for the selected report type. Manual sections have "+ Add manually" for freetext entry. Progress bar shows % complete. "Generate Report" button outputs formatted report.
- Report types and sections:
  - Bi-Weekly (14d): Topline Snapshot, What We Shipped, What Changed & Why, Risks & Blocks, Next Two Weeks
  - Monthly (30d): Executive Summary KPIs, Visibility & Demand, Conversion Performance, Work Completed, Next Month Priorities
  - QBR (90d): QBR Scorecard, What Worked/Didn't, Strategic Insights, Risks & Constraints, Next Quarter Roadmap, Appendix
- "Generate Report" compiles all committed data into a formatted text report (downloadable as .txt) with a trusted advisor narrative instruction block at the top (what happened / why / next steps / what we need from the client — tied to leads/VOBs/admissions)

## Industry Focus
Recovery and addiction treatment centres. Seed clients: Anchored Tides Recovery, Bliss Recovery, Horseshoe Ridge Recovery, Heartland Healing Center, Iris Healing, New Day Recovery, Sol Womens Treatment, Williamsburg House. Mock data uses addiction treatment keywords (detox, residential, PHP/IOP, dual diagnosis, insurance verification, admissions).

## Multi-Account Design
Setup page supports connecting multiple accounts per service. Each credential has an `accountLabel` field to identify it (e.g., "Main Agency Account"). SERVICE_CONFIGS in shared/schema.ts drives the Setup page UI.

## Security
- AES-256-GCM encryption for all stored credentials (server/encryption.ts)
- Encryption key derived from SESSION_SECRET via scrypt

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session/encryption key
