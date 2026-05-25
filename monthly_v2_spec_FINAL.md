# Monthly Report V2 — Final Spec (v3, locked)

**Locked:** May 25, 2026, late morning. No more spec changes — moving to build.
**Total slides:** 14 fixed slides + custom slides insertable anywhere.

---

## Design principles

1. Outcomes lead, keywords don't
2. Monthly = data first, work-done second (biweekly handles work-done)
3. All 14 slides always render (with empty states when data missing)
4. AI writes commentary, AM edits everything
5. Vertical-agnostic structure
6. One screen, one idea

---

## The 14 slides

### Slide 1 — Cover

Dark theme, sentence-case client name, brand red stripe top, "PRODUCED BY [name]" bottom-left. Already built this morning.

---

### Slide 2 — Headline & executive summary

AI-written 6-12 word headline + 3-5 sentence executive narrative + 3 "key moves" bullets. Lead with business outcomes.

**Data:** Synthesis of all other slides' data.
**AI:** Heavy — generates headline, narrative, key moves.
**AM-edit:** All three.

---

### Slide 3 — Business outcomes + QTD goal pacing

**Purpose:** Show actual lead/revenue performance AND whether the client is on pace against quarterly goals. Combined slide because goal pacing IS the most important context for outcomes.

**Data sources:**
- CallRail / CTM / Nimbata (per client config) — calls
- Airtable — VOBs, admits, qualified leads
- GA4 — form submissions, conversion rate
- **NSM Goal Tracker sheet** — quarterly goals via existing `fetchNsmGoalsForSpecificQuarter`

**AI involvement:** Per-outcome notes + an overall pacing interpretation ("Sessions 25% ahead of pace driven by location pages; calls flat — CRO is the next lever").

**Visual structure:**
- Black header band: "Business outcomes"
- Top row: 3-4 MV2StatCards — each shows current month + goal-pace badge (e.g. "566 sessions QTD · 25% ahead of 900 goal · ON PACE")
- Middle: small MV2Table — outcomes by source (Organic, GBP, Direct, Paid if relevant)
- Bottom: MV2InsightCallout — AI's combined outcomes-and-pacing interpretation
- Dark footer

**Empty state:** "Conversion tracking + NSM goals not yet connected. Once linked, business outcomes and goal pacing will populate."

---

### Slide 4 — Organic visibility & discoverability

**Purpose:** Are we showing up for the right things, in the right places?

**Data:** GSC (impressions, impressions by cluster, ranking pages), GBP (profile views), Ahrefs (indexed pages, visibility score).

**AI:** Interpretation of visibility-vs-clicks gap.

**Visual:** 4 MV2StatCards + cluster-impression table + MV2InsightCallout.

**Empty state:** Per-source ("GSC not connected" / "GBP not connected" / etc).

---

### Slide 5 — Keyword & intent movement

**Purpose:** Are the right queries ranking, and are those rankings producing clicks?

**Data:** GSC (queries, positions, clicks, CTR), per-client cluster taxonomy, intent tags.

**AI:** Cluster-level notes (replaces current heuristic logic).

**Visual:** MV2Table — Cluster | Intent | # Queries | MoM Δ | Clicks | MoM Δ | Notes (AI).

**Empty state:** "GSC not connected."

---

### Slide 6 — Search intent alignment

**Purpose:** Is each page matched to the intent it should serve?

**Data:** GSC (query → landing page pairs), URL path patterns for intent classification, query mix analysis.

**AI:** Heavy — identifies misalignments and recommends fixes.

**Visual:** Black header band, 3-5 MV2ContentCards (each = one flagged misalignment with page URL, expected vs observed intent, AI recommendation).

**Empty state:** "No major intent misalignments detected" (positive empty state).

---

### Slide 7 — Content quality, trust & E-E-A-T

**Purpose:** Are pages on the site demonstrating expertise, experience, authoritativeness, and trust? Combines structural signals (what's on the page) with behavioral signals (how users and Google respond).

**Data sources: Page HTML fetch + Ahrefs + GSC + GA4. NO Screaming Frog.**

**Structural signals (server-side HTML fetch of key pages):**
- Schema presence per page: Person, Author, Reviewer, MedicalEntity, FAQPage, Article, MedicalWebPage
- Byline / author attribution text (looks for "By [name]", "Author:", "Written by")
- Credential mentions on author/reviewer bios (MD, LCSW, PhD, LPC, LMFT, MA, RN, etc. — extensible list)
- "Reviewed by" / "Medically reviewed by" / "Clinically reviewed by" patterns
- "Last reviewed" / "Last updated" / "Reviewed [date]" patterns
- FAQ count and depth (number of FAQ items, average answer word count)
- Source citations / external authority links count
- Photo presence in author bios

**Ahrefs signals:**
- Page-level URL Rating (UR) for Staff, About, Service pages
- Referring domains to YMYL pages
- Best-by-links pages — are trust pages earning links?
- Topical authority (links to topical clusters)
- Domain Rating trend (last 30 days)

**GSC signals:**
- Staff / About / Author / Reviewer pages — ranking + position trend
- Branded query share of clicks
- YMYL page CTR trend at the SERP

**GA4 signals:**
- Engagement time on YMYL pages MoM
- Engagement time on Staff/About/Reviewer pages MoM
- Bounce rate on credentialing pages

**Which pages to crawl:** Top 10 pages by GSC clicks + Staff/About/Reviewer pages if findable + top 5 service pages from Airtable. Cap at ~20 pages to keep it fast. Cache HTML for the month so re-runs are instant.

**AI involvement:** Heavy. AI synthesizes structural + behavioral + link signals into:
- Overall EEAT posture assessment per the 4 dimensions (Experience, Expertise, Authoritativeness, Trust)
- Specific page-level findings ("Staff page has bios but no schema; medical reviewer mentioned in prose but not marked up — easy schema win")
- Top 3-5 recommendations prioritized by effort × impact

**AM-editable:** All AI findings + recommendations.

**Visual structure:**
- Black header band: "Content quality & E-E-A-T"
- Top: 4 MV2StatCards — (Pages with author schema, Pages with reviewer markup, Pages with FAQs, Branded click share %)
- Middle: small MV2Table listing 4-6 pages with EEAT gaps and the top fix per page
- Bottom: MV2InsightCallout — AI's overall E-E-A-T posture + top 3 priorities

**Empty state:** "EEAT scan requires at least GSC + page HTML fetch. Connect GSC and ensure the client domain is reachable to populate."

**Implementation notes:**
- Page HTML fetch needs to handle: bot blocks (use realistic User-Agent), JS-rendered content (try plain fetch first; flag if homepage returns shell — Bliss's Wix problem applies here)
- Schema detection: parse `<script type="application/ld+json">` blocks, check `@type` field
- Caching: store fetched HTML in DB keyed by `(client_id, url, month)` so re-runs and incremental edits don't re-fetch

---

### Slide 8 — Technical SEO health

**Purpose:** Can Google crawl, index, understand the site?

**Data:** GSC (Index Coverage, Sitemaps), manual audit in Airtable.

**AI:** Severity ranking + top 3 issues.

**Visual:** 3-4 MV2StatCards + MV2InsightCallout.

**Empty state:** "Technical audit data not yet linked."

---

### Slide 9 — Page speed & Core Web Vitals

**Data:** PageSpeed Insights API OR manually logged Lighthouse.

**Visual:** 3 MV2StatCards (LCP/INP/CLS) + table of top 5 pages.

**Empty state:** "Page speed monitoring not connected."

---

### Slide 10 — CRO & user experience

**Data:** GA4 (engagement, conversion by landing page), CallRail/CTM (call quality).

**AI:** Identifies high-traffic-low-conversion pages.

**Visual:** 3 MV2StatCards + landing-page table.

**Empty state:** "GA4 conversion events not configured."

---

### Slide 11 — Authority, internal linking & site structure

**Data:** Ahrefs (referring domains, DR), GBP (citations).

**Visual:** 3 MV2StatCards + MV2InsightCallout.

**Empty state:** "Ahrefs not connected."

---

### Slide 12 — AI discoverability

**Data:** Schema presence inferred from page-level signals, GBP completeness, entity coverage analysis.

**AI:** Heavy assessment + improvements.

**Visual:** 3 MV2StatCards + MV2InsightCallout.

**Empty state:** "AI discoverability assessment pending."

---

### Slide 13 — Next month's content pipeline

**Purpose:** Show specific content scheduled for next month with rationale.

**Data:** Airtable Production view — rows with planned publish in next 30-31 days. Per row: target keyword, credit cost, URL (current or final), reasoning.

**AI:** Light — extends/polishes reasoning if AM left blank.

**Visual:** MV2Table — Target Keyword | Credit Cost | URL | Reasoning.

**Empty state:** "No content scheduled in Airtable Production view for next month."

---

### Slide 14 — Strategic initiatives & next month priorities (COMPACT)

**Purpose:** What we did + what's coming. Compact because monthly = data first.

**Data:** Asana (this month tasks by category), Airtable (this month content count), AM input (priorities).

**Visual:** Two-panel:
- Left: small "This month" table (Category | Status | Items completed)
- Right: MV2 bulleted list "Next month priorities" (AM input + AI rationale)

**Empty state per side:** Hint to connect Asana / add priorities.

---

## Custom slides

AMs insert via a form capturing:
1. **Slide title** — appears in MV2 header band
2. **Insert position** — slide number (1-14+); subsequent slides renumber
3. **Raw brief** — AM's content, any format

AI synthesizes the brief using MV2 primitives and picks layout based on shape:
- Numbers-heavy → stat cards + commentary
- Prose argument → MV2ContentCard with sections
- Comparison → table
- Story (like "Custom code is fighting the platform") → headline + narrative + supporting facts

AM edits any text block via EditableSection.
Slide ID: `custom_<uuid>`.

---

## Build plan (locked)

| Phase | Work | Estimate |
|---|---|---|
| 3c | Fix stray "Save" button + rewrite MonthlyConversionSlide for visual consistency | 30 min |
| 3d | Rewrite `monthlyGenerator.ts` to emit the 14 new slide types | 2 hr |
| 3e | Build 14 slide components (5 partially done, 9 new) | 2.5 hr |
| 3f | AI commentary integration (extend reportNarration.ts) — ~10 AI calls per report, parallelized | 1.5 hr |
| 3g | Native Google Slides generator | 2 hr |
| 3h | Custom slide builder UI | 2-3 hr |

**Total: 10.5-11.5 hours of focused work.** Started 11am, realistic ship: 10-11pm.

---

## START
