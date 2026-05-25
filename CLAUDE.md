# CLAUDE.md — SmartEO project guidance for Claude Code

This file is read by every Claude Code session that starts in this repo. It explains the project, conventions, current state, and the rules of engagement.

---

## What this is

SmartEO is the internal SEO platform for **Webserv**, a digital marketing agency that primarily serves behavioral health and addiction treatment center clients. Built by Jay Hall as a single-operator app for the AM team to use.

The product produces three deliverables for clients:
1. **Monthly Reports** — 14-slide decks with SEO performance, business outcomes, and strategy (the active rebuild)
2. **Biweekly Reports** — Google Docs summarizing work done; rendered via native Google Docs API
3. **QBR Prep** — quarterly strategy artifacts

Plus internal tooling around it (Slack scheduler, content tracking, NSM goal tracking, etc).

---

## Tech stack

- **Frontend:** React + TypeScript + Vite, Tailwind, shadcn/ui
- **Backend:** Node + Express + TypeScript
- **Database:** PostgreSQL via Drizzle ORM
- **Hosting:** Replit (Replit autorestart, Replit secrets)
- **Auth:** session-based with `smarteo_session` cookie
- **Color palette:** `#C0392B` red + black `#1A1A1A` + white. **NO blue, NO navy.** Dark-mode-only UI.
- **Fonts:** Archivo for headers, Inter for body
- **PDF generation:** Puppeteer renders print pages and outputs PDF (so PDFs match the on-screen preview byte-for-byte)
- **Google integrations:** Native Google Docs API for biweekly, native Google Slides API planned for monthly (Phase 3g)

---

## Key data integrations

| Source | Client file | Purpose |
|---|---|---|
| Google Search Console (GSC) | `server/gscClient.ts` | Queries, impressions, clicks, positions, topic clustering, daily trends |
| Google Analytics 4 (GA4) | `server/ga4Client.ts` | Sessions, conversions, engagement, landing pages |
| CallRail | `server/callrailClient.ts` | Call tracking — calls by source, organic calls |
| CallTrackingMetrics (CTM) | `server/ctmClient.ts` | Fallback call tracker for clients not on CallRail |
| Nimbata | (some clients) | Another call tracker; partial wiring |
| Ahrefs | `server/ahrefsClient.ts` | Domain Rating, backlinks, referring domains, organic keywords |
| SEMrush | `server/semrushClient.ts` | Keyword distribution (rolling 30-day windows only) |
| Airtable | `server/airtable.ts` | Content pipeline, published content tracking, in-progress audits |
| Asana | `server/asanaClient.ts` | Task tracking, work logs |
| Google Sheets (NSM) | `server/sheetsClient.ts` | Quarterly goal sheet — exports `fetchNsmGoalsForSpecificQuarter` |
| Slack | `server/slackClient.ts` | Notifications, scheduled posts |
| Page HTML fetch | `server/pageContentClient.ts` | EEAT signal extraction (new Phase 3d Step 1) |

---

## Conventions

### Slide rendering pipeline (Monthly + Biweekly)

The slide preview and PDF output share the same React components. The pipeline:

1. **Generator** (`server/monthlyGenerator.ts`, `server/biweeklyGenerator.ts`) — fetches data in parallel via `Promise.allSettled`, emits a `Slide[]` array
2. **Print page** (`client/src/pages/monthly-print.tsx`) — renders all slides for puppeteer to capture as PDF
3. **Live preview** (`client/src/pages/monthly.tsx`) — shows the same slides in the AM's browser with edit-in-place
4. **Router** (`client/src/components/report-preview/pptx-preview.tsx`, the `SlideRenderer` function) — switches on `slide.type` to pick a component
5. **Components** (`client/src/components/report-preview/monthly-slides.tsx`) — the actual React rendering for each slide type
6. **Primitives** (`client/src/components/report-preview/report-primitives.tsx`) — design tokens and reusable components (MV2HeaderBand, MV2StatCard, etc — see "MV2 primitives" below)

### MV2 primitives (use these for any new slide)

Look in `report-primitives.tsx` for these exports — they enforce the brand:

- `MV2HeaderBand` — black 60px band with title + subtitle + page indicator
- `MV2StatCard` — white card with red accent stripe, big number, label, optional delta
- `MV2ContentCard` — white card with eyebrow label
- `MV2InsightCallout` — left-bordered callout for AI-generated commentary (accepts ReactNode for editable content)
- `MV2MoversList` — list of top movers with deltas
- `MV2Table` — auto-detects delta columns and colors them green/red
- `MV2Footer` — dark 22px footer with source label and date

Design tokens: `MV2_BG_PAGE` (`#FAFAF7`), `MV2_BG_CARD` (`#FFFFFF`), `MV2_BG_HEADER` (`#1A1A1A`), `MV2_ACCENT` (`#C0392B`), `MV2_FONT_HEADER` (`Archivo`), `MV2_FONT_BODY` (`Inter`).

### Edit-in-place

Every editable text element on a slide wraps in `EditableSection` (see `client/src/components/report-preview/editable-section.tsx`). The slide receives `edits` (a Record<string, string>) and `onEdit(key, value)`. Auto-save is wired via `useReportSave` — AMs don't need to click a Save button.

### Auto-save

`client/src/hooks/useReportSave.ts` — autosaves edits on each change with a debounce. There's no manual save button in Monthly (Phase 3c removed it). Don't add one.

### Empty states are mandatory

For Monthly reports specifically: every slide ALWAYS renders, even if its data source is missing. The empty state explains what's not connected: *"Ahrefs not yet connected — connect Ahrefs in client settings to populate authority signals."* This is for AM peace of mind — they need to see the system tried.

### Brand voice (for AI-generated commentary)

- Lead with business outcomes, not keywords. Keyword data is diagnostic, not the headline.
- Outcomes are calls, form fills, VOBs, admissions, qualified leads. Whatever the client tracks.
- Don't be cheery. Don't say "great" or "amazing." Treatment centers don't need cheerleading.
- 3-5 sentences for narrative blocks. 2-3 sentences for callouts. Concise.

### Webserv SEO framework (drives slide order in Monthly)

1. Conversions / business outcomes (TOP — calls, VOBs, admits)
2. Organic visibility & discoverability
3. Keyword rankings (UNDER visibility, not above outcomes)
4. Search intent alignment
5. Content quality, trust, E-E-A-T (YMYL-critical)
6. Technical SEO health
7. Page speed & Core Web Vitals
8. CRO & UX
9. Authority, internal linking, site structure
10. AI discoverability

---

## Current rebuild — Monthly Report V2

A multi-phase rebuild replacing the old keyword-heavy Monthly deck with a 14-slide outcomes-led deck per the Webserv framework above.

### Status as of May 25, 2026

| Phase | Status | Commit |
|---|---|---|
| 3a — MV2 design tokens + primitives | ✅ Shipped | (earlier commits) |
| 3b — 5 Monthly slides rewritten in MV2 style | ✅ Shipped | (earlier commits) |
| 3c — Button cleanup (PDF + Drive only) + puppeteer PDF route + ConversionSlide rewrite | ✅ Shipped | `a8ce251`, `2aeaeed` |
| 3d Step 1 — `server/pageContentClient.ts` (EEAT scanner via cheerio) | ✅ Shipped | `e5b6ed3` |
| 3d Step 2a — Ahrefs + EEAT scan wired into generator data fetch | ✅ Shipped | `cc6dedc` |
| **3d Step 2b — REWRITE slide emission in `monthlyGenerator.ts`** | **🟡 NEXT** | — |
| 3e — Build new slide components (7 needed) | ⏳ | — |
| 3f — AI commentary integration | ⏳ | — |
| 3g — Native Google Slides export + remove legacy PPTX route | ⏳ | — |
| 3h — Custom slide builder UI | ⏳ | — |

### The locked 14-slide spec

| # | `slide.id` | `slide.type` | Slide name | Data source | Renderer |
|---|---|---|---|---|---|
| 1 | `cover` | `title` | Cover | None | ✅ `MonthlyTitleSlide` exists |
| 2 | `exec` | `exec_summary` | Headline & executive summary | AI synthesis of all data | ❌ Need new |
| 3 | `outcomes` | `outcomes` | Business outcomes + QTD goal pacing | CallRail/CTM/Nimbata + GA4 + Airtable + `nsmResult` (goal sheet) | ❌ Need new |
| 4 | `visibility` | `visibility` | Organic visibility & discoverability | GSC + Ahrefs | ❌ Need new |
| 5 | `keywords` | `keyword_table` | Keyword & intent movement | gscTopicClusterData + intent tags | ❌ Need new |
| 6 | `intent` | `intent_alignment` | Search intent alignment | gscQueryPageMap + URL path classification | ❌ Need new |
| 7 | `eeat` | `stat_grid` | Content quality / trust / E-E-A-T | `eeatScanResult` (pageContentClient) + Ahrefs + GSC + GA4 | ❌ Need new (`stat_grid`) |
| 8 | `technical` | `stat_grid` | Technical SEO health | GSC Index Coverage + Airtable production | reuse `stat_grid` |
| 9 | `speed` | `stat_grid` | Page speed & CWV | PageSpeed Insights (empty state OK) | reuse `stat_grid` |
| 10 | `cro` | `stat_grid` | CRO & user experience | ga4Funnel + ga4Landing + ctResult | reuse `stat_grid` |
| 11 | `authority` | `stat_grid` | Authority, internal linking | `ahrefsOverview` | reuse `stat_grid` |
| 12 | `ai_discoverability` | `stat_grid` | AI discoverability | `eeatScanResult` (schema) + GBP | reuse `stat_grid` |
| 13 | `content_pipeline` | `content_pipeline` | Next month's content pipeline | `airtableProductionResult` | ❌ Need new |
| 14 | `initiatives_priorities` | `initiatives` | Strategic initiatives + priorities | `asanaResult` + AM input | ❌ Need new |

**All 14 slides ALWAYS render.** Empty states are mandatory.

### Phase 3d Step 2b — what to do next

**File:** `server/monthlyGenerator.ts` (currently 1133 lines)

**Keep (lines 1-244):**
- All imports (already include `queryAhrefs`, `scanSiteForEeat`, `SiteEeatSummary`)
- `MonthlyAmInputs` interface and helpers
- `MonthlyReportJson` interface
- The full `Promise.allSettled` fetch block — fetches 19 data sources

**Replace (lines 245-1107):**
- All current slide emission code
- Replace with ~600 lines emitting the 14 slides above, in spec order

**Keep the final return shape** (lines ~1099-1106): `{ report_title, client_name, month_label, generated_at, slides, sourceFacts }`

**Available variables (from Promise.allSettled destructure):**

```
gscQueries, gscPages, ga4Funnel, ga4Landing, ctResult, semResult,
airtableResult, asanaResult, ga4FunnelQtd, ctResultQtd, gscQueryPageMap,
gscTopicClusterData, gscDailyTrend, ga4DailyTrend, nsmResult,
ctSummaryResult, airtableProductionResult, ahrefsOverview, eeatScanResult
```

All are `PromiseSettledResult<...>`. Helper:
```ts
const val = (p: PromiseSettledResult<any>) => p.status === "fulfilled" ? p.value : null;
```

**NSM goal pacing math for Slide 3:**
- `quarter = Math.ceil(month / 3)`
- For each metric: pull `actual` from `ga4FunnelQtd` or `ctResultQtd` summary
- `goal = nsmResult.goals.find(g => g.metric === metricName).q{N}`
- `monthsIntoQuarter = ((month - 1) % 3) + 1`
- `expectedByNow = goal * (monthsIntoQuarter / 3)`
- `pacingPercent = ((actual - expectedByNow) / expectedByNow) * 100`
- `status = pacingPercent >= 10 ? "Ahead" : pacingPercent >= -10 ? "On Pace" : "At Risk"`

**Step 2b SHOULD:**
- Emit 14 slides in spec order
- Use existing fields on the Slide type where they fit (`metrics`, `table`, `bullets`, `commentary`)
- Add new fields to the Slide type only when truly needed (e.g. `headline`, `narrative`, `keyMoves`, `pacingBadges`)
- Set commentary fields to placeholder strings — Phase 3f wires AI

**Step 2b SHOULD NOT:**
- Touch `Promise.allSettled` (correct from Step 2a)
- Add new slide rendering components (that's Phase 3e — next phase)
- Add AI commentary (that's Phase 3f)
- Remove `sourceFacts` (narration system uses it)
- Change `MonthlyAmInputs`

### Verification after Step 2b

1. `wc -l server/monthlyGenerator.ts` should be in the 800-1000 line range
2. `npx tsc --noEmit --skipLibCheck` should report no NEW TypeScript errors (baseline = 205)
3. `grep -c "slides.push" server/monthlyGenerator.ts` returns at least 14
4. `grep "id: \"cover\"\|id: \"exec\"\|id: \"outcomes\"\|id: \"eeat\"\|id: \"content_pipeline\"" server/monthlyGenerator.ts` returns at least 5
5. Manually generate a Bliss April 2026 report through the UI — should produce 14 slides without throwing. Several slides may render as placeholders since their components don't exist yet (Phase 3e fixes that).

---

## Rules of engagement for Claude Code

1. **Read this file first.** Every session.
2. **Don't re-plan or re-scope.** The spec is locked.
3. **Commit frequently.** Each phase / step is a separate commit. Use clear commit messages like the existing ones (e.g. "Phase 3d Step 2b: rewrite slide emission for 14-slide spec").
4. **Run TypeScript checks before declaring work done.** `npx tsc --noEmit --skipLibCheck` — baseline is 205 pre-existing errors. Don't introduce new ones.
5. **Don't touch other phases' files when working on one phase.** If you're in Phase 3d, don't refactor Phase 3e files even if they look messy.
6. **Don't install new packages without asking Jay.** Cheerio is installed for Phase 3d. Anything else, surface it first.
7. **Stay vertical-agnostic.** The spec works for behavioral health clients today but the structure should generalize.
8. **No emojis in generated reports.** No exclamation marks. No cheery language.
9. **No blue or navy anywhere.** Brand is red + black + white. Always.
10. **Don't add a manual Save button.** Auto-save handles persistence.

---

## Reference docs

- **Spec:** `monthly_v2_spec_FINAL.md` (in repo root — gitignored from prod, but tracked)
- **Webserv SEO framework:** documented at top of this file
- **Test client for end-to-end runs:** Bliss Recovery (`blissrecoveryla.com`)
