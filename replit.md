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
    app-sidebar.tsx    - Navigation sidebar
    theme-provider.tsx - Dark/light mode
    theme-toggle.tsx   - Theme switcher
  pages/
    query.tsx          - Main chat-like query interface
    clients.tsx        - Client CRUD management (tabbed form: Data Sources, SEO Tools, Config)
    setup.tsx          - Multi-account credential management for 7 services
    history.tsx        - Query log history
server/
  index.ts             - Express server entry
  routes.ts            - API routes
  storage.ts           - Database CRUD operations
  db.ts                - Database connection
  encryption.ts        - AES-256-GCM encryption for credentials
  nlRouter.ts          - Natural language query parser (12 commands)
  mockData.ts          - Demo data generator with addiction-space content
  seed.ts              - Seeds 4 recovery centre clients
shared/
  schema.ts            - Drizzle schema, types, SERVICE_CONFIGS, COMMANDS
```

## Data Model
- **clients**: Recovery centre accounts with GSC, GA4, CallRail, CTM, Ahrefs, SEMrush, Screaming Frog configs; brand terms, lead events, money pages, organic source terms
- **query_logs**: History of NL queries with parsed commands and results
- **api_credentials**: Encrypted API keys/tokens with `accountLabel` for multi-account support per service

## Data Sources (7)
1. Google Search Console (OAuth)
2. Google Analytics 4 (OAuth)
3. CallRail (API key)
4. CallTrackingMetrics (API key + secret)
5. Ahrefs (API key)
6. SEMrush (API key)
7. Screaming Frog (desktop import, no credentials)

## Available Commands (12)
- `gsc_qoq_queries` / `gsc_qoq_pages` - GSC search performance
- `ga4_qoq_organic_funnel` / `ga4_qoq_organic_landing_pages` - GA4 organic metrics
- `callrail_qoq_organic_calls` / `callrail_qoq_top_landing_pages` - CallRail call tracking
- `ctm_qoq_organic_calls` / `ctm_qoq_top_landing_pages` - CTM call tracking
- `ahrefs_backlink_overview` / `ahrefs_keyword_rankings` - Ahrefs SEO data
- `semrush_organic_overview` / `semrush_keyword_rankings` - SEMrush competitive data

## Industry Focus
Recovery and addiction treatment centres. Seed clients: Sunrise Recovery Center, New Horizons Treatment, Clarity Behavioral Health, Pathways to Freedom Recovery. Mock data uses addiction treatment keywords (detox, residential, PHP/IOP, dual diagnosis, insurance verification, admissions).

## Multi-Account Design
Setup page supports connecting multiple accounts per service. Each credential has an `accountLabel` field to identify it (e.g., "Main Agency Account"). SERVICE_CONFIGS in shared/schema.ts drives the Setup page UI.

## Security
- AES-256-GCM encryption for all stored credentials (server/encryption.ts)
- Encryption key derived from SESSION_SECRET via scrypt

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session/encryption key
