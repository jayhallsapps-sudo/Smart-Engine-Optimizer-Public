# SmartEO - Smart Engine Optimization

## Overview
SmartEO is a QBR (Quarterly Business Review) copilot for SEO professionals. It provides a natural language interface to query SEO data from Google Search Console, Google Analytics 4, and CallRail.

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
    clients.tsx        - Client CRUD management
    setup.tsx          - API credential configuration
    history.tsx        - Query log history
server/
  index.ts             - Express server entry
  routes.ts            - API routes
  storage.ts           - Database CRUD operations
  db.ts                - Database connection
  nlRouter.ts          - Natural language query parser
  mockData.ts          - Demo data generator
  seed.ts              - Database seeding
shared/
  schema.ts            - Drizzle schema + types
```

## Data Model
- **clients**: Client accounts with GSC, GA4, CallRail configs, brand terms, lead events, money pages
- **query_logs**: History of NL queries with parsed commands and results
- **api_credentials**: Encrypted API keys/tokens storage

## Available Commands
- `gsc_qoq_queries` - GSC query performance QoQ
- `gsc_qoq_pages` - GSC page performance QoQ
- `ga4_qoq_organic_funnel` - GA4 organic funnel metrics
- `ga4_qoq_organic_landing_pages` - GA4 landing page performance
- `callrail_qoq_organic_calls` - CallRail call volume
- `callrail_qoq_top_landing_pages` - CallRail calls by landing page

## Current Status
- MVP with demo/mock data
- NL router parses queries and maps to commands
- Ready for real API integration when OAuth/API keys are provided
- 4 seeded example clients

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session/encryption key
