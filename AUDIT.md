# SmartEO Command Center — Evidence-Based Platform Audit
**Date:** 2026-03-18  
**Scope:** Source routing, validator rules, provider mapping, formula maps, field-level source maps

---

## 1. DISCOVERABILITY TOOL — FIELD-BY-FIELD ROUTING TABLE

### 1a. AI Generation Endpoint
**Route:** `POST /api/discoverability/workspaces/:id/generate`  
**File:** `server/routes.ts` lines 4207–~4500  
**AI input chain:** business profile summary + liveContext string  

### 1b. Live Data Fetch (liveContext construction)
```
Source       Command                            Condition                   Row limit
─────────────────────────────────────────────────────────────────────────────────────
GSC          gsc_top_queries                    client.gscSiteUrl present   30 rows
             → dimensions: ["query"]
             → fields returned: query, pos, clicks

Ahrefs       ahrefs_keyword_rankings            always attempted            30 rows
             → site-explorer/organic-keywords
             → select: keyword,volume,keyword_difficulty,position,url
             → order_by: volume:desc

SEMrush      semrush_keyword_distribution       always attempted            20 rows
             → type: domain_organic
             → export_columns: Ph,Po
             → position buckets grouped client-side
```

### 1c. Keyword Field Routing Table

| field_name | primary_source | fallback_source | current_impl_source | fixed_impl_source | provenance_in_ui | null_behavior |
|---|---|---|---|---|---|---|
| keyword | AI (generated) | — | AI | AI | none | never null |
| cluster | AI (grouped) | — | AI | AI | none | never null |
| intent | AI | — | AI | AI | none | never null |
| searchVolume | Ahrefs (`volume` field in organic-keywords) | SEMrush `Nq` column | AI-fabricated (pre-T002) → now null if no live data | Ahrefs volume or null | Shows "—" with tooltip when null | null → shows "—" |
| kd | Ahrefs (`keyword_difficulty`) | SEMrush `Pd` column | AI-fabricated (pre-T002) → now null if no live data | Ahrefs KD or null | Shows "—" with tooltip when null | null → shows "—" |
| clientCurrentPosition | GSC (top 30 queries, pos field) | Ahrefs (`position`) | Was AI-invented pre-T002 → now from live data only | GSC pos or Ahrefs pos or null | Source badge (GSC / Ahrefs) shown when confirmed | null → "—" no badge |
| positionSource | Derived ("GSC" / "Ahrefs" / null) | — | New field added T002 | same | badge chip | null → no badge |
| isLocked | User action | — | DB persisted | DB persisted | lock icon | false default |
| isManual | User flag | — | DB persisted | DB persisted | visual flag | false default |

### 1d. Fields in User Request (from attached spec) vs Tool Scope

The following fields listed in the audit spec belong to other tools, not Discoverability:

| field_name | actual_tool | source |
|---|---|---|
| clicks | Monthly Slide 3 (GSC queries) + Mid-Strategy Slide 8 | GSC gsc_qoq_queries → clicks column |
| impressions | Monthly Slide 3 | GSC gsc_qoq_queries → impressions column |
| CTR | Monthly Slide 3 | GSC gsc_qoq_queries → ctr field (r.ctr × 100) |
| avg_position | Monthly Slide 3 | GSC gsc_qoq_queries → position field |
| sessions | Monthly Slide 2 (GA4), Mid-Strategy Slide 9 | GA4 ga4_qoq_organic_funnel → sessions metric |
| page_category | Mid-Strategy Slide 8–9 | classifyUrl() from evalMetricRegistry.ts DEFAULT_CATEGORY_RULES |
| clicks_per_page | Mid-Strategy Slide 8 (clicks_dist) | buildClicksDistribution(): sumClicks / numPages per category |
| share_of_gsc_clicks | Mid-Strategy Slide 8 (clicks_dist) | buildClicksDistribution(): sumClicks / totalClicks per category |
| sessions_per_page | Mid-Strategy Slide 9 (traffic_dist) | buildTrafficDistribution(): sumSessions / numPages per category |
| share_of_sessions | Mid-Strategy Slide 9 (traffic_dist) | buildTrafficDistribution(): sumSessions / totalSessions per category |
| branded / non-branded | GSC client (isNonBrand()) + QBS generator | client.brandTerms array, isNonBrand() in gscClient.ts line 46 |
| top_gaining_pages | QBS generator | GSC page-level delta: gscPageRows vs gscPrevPageRows (current - prev sessions sorted desc) |
| top_declining_pages | QBS generator | GSC page-level delta: gscPageRows vs gscPrevPageRows (current - prev sessions sorted asc) |

---

## 2. READINESS VALIDATOR RULES

**File created:** `server/reportValidators.ts`  
Exports: `validateDiscoverability`, `validateBiweekly`, `validateMonthly`, `validateQbs`, `validateQbr`, `validateMidStrategy`, `validateDashboard`  
Return type: `ValidatorResult` with `canRender`, `blockingConditions[]`, `partialConditions[]`, `sourceChecks[]`

### 2a. Blocking Conditions by Report

| report | blocking_condition | missing_field | consequence | ui_behavior |
|---|---|---|---|---|
| Monthly | GSC not configured | gscSiteUrl | Slides 3, 3b, 5, 6, daily trend → "Manual entry needed" | Amber chip in banner; report still generates |
| Monthly | GA4 not configured | ga4PropertyId | Slide 2 sessions/conversions empty; Slide 4 QTD empty | Amber chip; report generates with placeholders |
| Monthly | CTM client uses ctmAccountId but no queryCtm import (BUG — now FIXED) | queryCtm import missing | All call slides empty despite CTM configured | Fixed: CTM routed as fallback when callrailCompanyId absent |
| QBS | GSC not configured | gscSiteUrl | Content opps, gaining/declining pages, query gaps all empty | AI generates from business profile only |
| QBS | GA4 not configured | ga4PropertyId | CRO opps, funnel summary, device breakdown unavailable | CRO/Tracking sections use AI fallback |
| Mid-Strategy | No eval batch selected | evalBatchId | Entire deck cannot render | Generate button disabled |
| Dashboard | Nimbata configured (badge only) | server/nimbataClient.ts (does not exist) | Badge shows but calls metric card has no data | Bug: nimbataClient.ts needs to be created |

### 2b. Partial Render Conditions by Report

| report | condition | slides_affected | fallback |
|---|---|---|---|
| Bi-Weekly | No Airtable | bw_progress Content + Optimization rows | "No content published this period." |
| Bi-Weekly | No Asana | bw_progress Technical SEO + Local SEO rows | SF priorities if uploaded; else estimated |
| Bi-Weekly | No SF crawl | bw_progress Technical SEO What's Next | Estimated: "Review Core Web Vitals..." |
| Monthly | No SEMrush | Slide 7 (Keyword Visibility Distribution) | "Manual entry needed" row |
| Monthly | No Airtable | Slide 8 (Work Completed) Content rows | "Manual entry needed — connect Airtable" |
| Monthly | No Asana | Slide 8b (Strategic Initiatives), Slide 9 priorities | Performance-signal fallback bullets |
| Monthly | No call tracker | Slide 2 calls metric, Slide 2b, Slide 4 QTD calls | "Manual entry needed" |
| QBS | No SF crawl | Technical category opportunities | Generic technical priorities from GSC data |
| QBS | No call tracker | Tracking opportunities category | callTrackingAvailable=false gates the category |

---

## 3. DASHBOARD CALL NORMALIZATION

### 3a. Provider Mapping Table (field-level)

| NormalizedCall field | CallRail API field | CTM API field | Nimbata |
|---|---|---|---|
| provider | "callrail" (const) | "ctm" (const) | "nimbata" (const) |
| callId | `id` | `id` | NOT MAPPED — no client |
| timestamp | `start_time` (ISO 8601) | `call_at` (ISO 8601) | NOT MAPPED |
| duration | `duration` (int, seconds) | `duration` (int, seconds) | NOT MAPPED |
| answered | `answered` (bool) | `answered` (string "true"/"false" — needs coercion) | NOT MAPPED |
| missed | derived: `!answered && !voicemail` | derived: `!answered` (no voicemail signal) | NOT MAPPED |
| qualified | NOT AVAILABLE (requires custom tag/disposition) | NOT AVAILABLE | NOT MAPPED |
| sourceName | `source_name` | `traffic_source ?? source` | NOT MAPPED |
| landingPage | `landing_page_url` (path-extracted) | `referrer_url ?? landing_page_url` (path-extracted) | NOT MAPPED |
| disposition | `call_type` | NOT AVAILABLE | NOT MAPPED |
| tags | `tags[].name` | NOT AVAILABLE | NOT MAPPED |
| isOrganic | sourceName ∈ callrailOrganicSourceTerms | sourceName ∈ ctmOrganicSourceTerms | NOT MAPPED |
| voicemailFlag | `voicemail` (bool) | NOT AVAILABLE | NOT MAPPED |

### 3b. Current Implementation Issues

| issue | file | line | status |
|---|---|---|---|
| callrail_qoq_organic_calls counts total_records (ALL calls, not organic) | server/callrailClient.ts | 98–99 | OPEN — total_records is returned by API for the full unfiltered call set; organic filtering only applies to the `bySource` grouping (lines 119–124) |
| CTM ctm_qoq_organic_calls used per_page=1 total_entries (ALL calls) | server/ctmClient.ts | 50–65 | FIXED — now fetches 250 records and filters by ctmOrganicSourceTerms client-side when terms are configured |
| CTM answered is string, compared as bool | server/ctmClient.ts | 105–110 | FIXED in callNormalizer.ts — coercion added |
| Nimbata badge shown but no data client | server/routes.ts dashboard handlers | multiple | OPEN — nimbataClient.ts does not exist |
| VOB/VVOB fields: not available from any provider's call API | all call clients | — | OPEN — CallRail custom tags (tags[].name) can be used to detect "VOB" tag; CTM/Nimbata do not expose this |

### 3c. Recommended VOB Detection (CallRail only)

CallRail call records include `tags[].name`. To detect VOB-tagged calls:
1. Fetch calls with `fields=id,start_time,duration,answered,source_name,landing_page_url,tags`
2. Filter `tags.some(t => t.name.toLowerCase() === "vob")`
3. This requires a new command `callrail_vob_calls` or extending `callrail_summary`

CTM and Nimbata: no VOB signal available via their APIs.

---

## 4. MONTHLY REPORT SOURCE AUDIT

```json
{
  "report": "Monthly",
  "file": "server/monthlyGenerator.ts",
  "intended_purpose": "Full monthly SEO performance review: traffic, calls, keyword trends, page performance, work log, QTD KPIs",
  "current_state": {
    "slides_count": 12,
    "data_sources": ["GSC", "GA4", "CallRail", "CTM (after fix)", "SEMrush", "Airtable", "Asana", "NSM Sheet"],
    "parallel_fetch_count": 16
  },
  "issues_found": [
    {
      "issue": "CTM not routed — imported missing",
      "severity": "HIGH",
      "status": "FIXED",
      "detail": "monthlyGenerator.ts imported queryCallRail but NOT queryCtm. CTM clients got empty call slides on Slides 2, 2b, and 4.",
      "fix": "Added queryCtm import and added CTM as fallback in all three call fetch slots"
    },
    {
      "issue": "Slide 2b subtitle hardcoded 'CallRail'",
      "severity": "LOW",
      "status": "FIXED",
      "detail": "Top Conversion Sources slide subtitle always said '(CallRail)' even when CTM data was shown",
      "fix": "Dynamic label: CallRail > CTM > 'Call Tracker'"
    },
    {
      "issue": "Slide 2 source label hardcoded 'CallRail'",
      "severity": "LOW",
      "status": "FIXED",
      "detail": "Performance metric card source badge always showed 'CallRail'",
      "fix": "Dynamic: client.callrailCompanyId ? 'CallRail' : ctmAccountId ? 'CTM' : 'Calls'"
    },
    {
      "issue": "SEMrush uses rolling 30-day window not calendar month",
      "severity": "MEDIUM",
      "status": "OPEN — documented",
      "detail": "SEMrush API does not support calendar month windows. Slide 7 uses last_30_vs_prev_30 rolling window. Subtitle notes this limitation.",
      "fix": "No fix available without SEMrush API change; documented in slide subtitle and code comment"
    },
    {
      "issue": "callrail_qoq_organic_calls counts ALL calls not organic",
      "severity": "MEDIUM",
      "status": "OPEN",
      "detail": "callrail_qoq_organic_calls fetches with per_page=250 and reads total_records which is the unfiltered count. The organicSources array is only used for the top landing pages command.",
      "fix": "Required: filter calls by source_name ∈ callrailOrganicSourceTerms before counting"
    }
  ],
  "slide_source_map": {
    "title": { "source": "none — static" },
    "performance": {
      "ga4_metrics": "GA4 ga4_qoq_organic_funnel → sessions, conversions, CVR",
      "gsc_metrics": "GSC gsc_qoq_queries → total clicks, total impressions",
      "call_metric": "CallRail callrail_qoq_organic_calls → total_records (BUG: all calls) OR CTM ctm_qoq_organic_calls (after fix)"
    },
    "conversion_sources": "CallRail callrail_summary → calls by source_name (or CTM ctm_qoq_sources after fix)",
    "gsc_queries": "GSC gsc_qoq_queries → top 25 queries: query, clicks, Δclicks, impressions, CTR, avg position",
    "query_groups": "GSC fetchGscQueryRowsForTopicClustering → 200 queries → clusterQueriesByTopic()",
    "qtd_kpi": {
      "sessions": "GA4 ga4_qoq_organic_funnel QTD window",
      "calls": "CallRail callrail_qoq_organic_calls QTD OR CTM (after fix)",
      "goals": "NSM Sheet fetchNsmGoalsForSpecificQuarter()"
    },
    "landing_pages": "GSC gsc_qoq_pages → top 20 pages: page, clicks, Δclicks, impressions, ΔImpressions, CTR, position (+ GA4 fallback if GSC unavailable)",
    "pages_chart": "GSC gsc_qoq_pages → top 10 pages bar chart (Clicks + Impressions)",
    "keywords": "SEMrush semrush_keyword_distribution → position buckets (~30-day rolling window)",
    "work_completed": "Airtable fetchAirtableWorkLog() + Asana groupAsanaTasks()",
    "strategic_initiatives": "Asana groupAsanaTasks() by category",
    "next_month": "Asana upcoming tasks + AM inputs + GSC/GA4 signal-based fallbacks",
    "gsc_daily_trend": "GSC fetchGscDailyTrend() → daily clicks+impressions 5000-row limit",
    "ga4_daily_trend": "GA4 fetchGa4DailyTrend() → daily sessions+engaged sessions"
  },
  "wrong_source_usage": [
    "GA4 organicFilter uses sessionDefaultChannelGrouping='Organic Search' — this excludes direct/referral but may miss Bing organic if not classified correctly by GA4",
    "QTD conversions row in Slide 4 has no goal column — goal is hardcoded 'Manual entry needed' (NSM MVP goal covers calls, not conversion events separately)"
  ],
  "missing_integrations": ["Nimbata query client", "GBP (no data shown in Monthly)", "SEMrush calendar month support"],
  "required_fields_present": ["sessions", "conversions", "CVR", "clicks", "impressions", "CTR", "position", "calls (after fix)", "work_log"],
  "calculations_required": [
    "CVR = conversions / sessions (GA4 ga4Client.ts line 80)",
    "QTD pctToGoal = actual / goal * 100 (monthlyGenerator.ts line 447)",
    "onTrackStatus: >=90% = On Track, >=70% = Monitor, else At Risk (line 454)",
    "query topic clusters: clusterQueriesByTopic() in qbrPrepHelpers.ts",
    "clicks_per_page join: queryCountByPageMonthly (query-to-page-map count per page)"
  ],
  "backend_changes_required": [
    "Fix callrail_qoq_organic_calls to filter by organicSourceTerms before counting (callrailClient.ts)",
    "Create nimbataClient.ts with ctm_qoq_organic_calls equivalent"
  ],
  "tests_required": [
    "CTM client routed when callrailCompanyId absent and ctmAccountId present",
    "callrail_qoq_organic_calls returns only organic calls when callrailOrganicSourceTerms configured",
    "CTM ctm_qoq_organic_calls filters by ctmOrganicSourceTerms when present"
  ],
  "acceptance_criteria": [
    "CTM client: Monthly Slide 2 shows calls metric when ctmAccountId present and callrailCompanyId absent",
    "CTM client: Monthly Slide 2b shows source breakdown from CTM",
    "CTM client: Monthly Slide 4 shows QTD calls from CTM",
    "CallRail organic filter: callrail_qoq_organic_calls count matches filtered call list",
    "Slide 2b subtitle dynamically shows provider name"
  ]
}
```

---

## 5. QBR (QBS) SOURCE AUDIT

```json
{
  "report": "QBS (QBR Prep)",
  "file": "server/qbrPrepGenerator.ts (2009 lines)",
  "intended_purpose": "Quarterly gap analysis: wins, opportunity backlog by category, evidence-based P0/P1/P2 priority ranking",
  "current_state": {
    "data_sources": ["GSC (inline gscFetch)", "GA4 (inline ga4Fetch)", "Screaming Frog (uploaded)", "CallRail / CTM (available flag only — not directly fetched)", "GapAnswers context"],
    "opportunity_categories": ["Content", "Technical", "Local SEO", "CRO", "Authority", "Tracking"],
    "evidence_fields": ["opportunity_title", "priority P0/P1/P2", "impact H/M/L", "effort S/M/L", "kpi_affected", "urls[]", "evidence", "problem", "opportunity", "why_it_matters", "recommended_next_step"]
  },
  "issues_found": [
    {
      "issue": "Inline fetch functions not shared with gscClient.ts / ga4Client.ts",
      "severity": "MEDIUM",
      "status": "OPEN",
      "detail": "QBS uses private gscFetch() and ga4Fetch() defined inline in qbrPrepGenerator.ts. brandTerms handling is separate from gscClient.ts isNonBrand(). Changes to GSC API handling must be made twice.",
      "fix": "Refactor to use shared queryGsc()/queryGa4() or extract shared helpers"
    },
    {
      "issue": "CTM service name lookup uses wrong key",
      "severity": "LOW",
      "status": "OPEN",
      "detail": "Line 326: storage.getApiCredentialsByService('ctm') — but CTM is stored as 'call_tracking_metrics' in ctmClient.ts line 7",
      "fix": "Change 'ctm' to 'call_tracking_metrics' in qbrPrepGenerator.ts line 326"
    },
    {
      "issue": "Call tracking only gates the Tracking category — no actual call data fetched",
      "severity": "HIGH",
      "status": "OPEN",
      "detail": "callTrackingAvailable boolean gates whether the Tracking opportunity category is generated. Actual call counts, VOB rates, answer rates are NOT fetched. Opportunities are generated by AI from the flag alone.",
      "fix": "Fetch call data via queryCallRail()/queryCtm() and pass to opportunity generator as evidence"
    }
  ],
  "source_routing_by_category": {
    "Content": {
      "primary": "GSC: gscPageRows (500 rows) + gscQueryRows (500 rows) vs prev quarter",
      "signals": "Top gaining pages (sessions delta), top declining pages, high-impression/low-CTR queries, query gaps",
      "ga4_join": "ga4LandingRows joined to GSC pages by normUrl() for sessions+conversions+bounceRate"
    },
    "Technical": {
      "primary": "Screaming Frog upload (sfData array)",
      "format_detection": "Internal All (row-level): has 'address'/'status code' headers; Crawl Overview (summary): key-value format",
      "fallback": "GSC page-level data if no SF crawl uploaded",
      "extracted_signals": "404 count, canonical conflicts, missing meta, large images, broken internal links"
    },
    "Local SEO": {
      "primary": "None fetched directly — AI-generated from business profile",
      "note": "GBP integration exists (server/gbpClient.ts) but is NOT called in QBS generator"
    },
    "CRO": {
      "primary": "GA4 ga4LandingRows: engagementRate, bounceRate, avgDuration, conversions",
      "device_signals": "ga4DeviceRows: mobile vs desktop sessions+engagementRate"
    },
    "Authority": {
      "primary": "None fetched — AI-generated (Ahrefs/SEMrush not called in QBS)",
      "note": "qbrPrepGenerator.ts does not import ahrefsClient or semrushClient"
    },
    "Tracking": {
      "primary": "callTrackingAvailable boolean flag only",
      "note": "No actual call data fetched — opportunities are generic without evidence"
    }
  },
  "wrong_source_usage": [
    "CTM service key 'ctm' vs actual stored key 'call_tracking_metrics' (callTrackingAvailable always false for CTM clients)",
    "Authority opportunities generated by AI with no Ahrefs/SEMrush evidence"
  ],
  "missing_integrations": ["GBP for Local SEO", "Ahrefs/SEMrush for Authority opportunities", "Call data for Tracking opportunities"],
  "acceptance_criteria": [
    "callTrackingAvailable true for CTM clients after fixing service key lookup",
    "Authority opportunities include Ahrefs DR and RD evidence when Ahrefs configured",
    "Local SEO opportunities include GBP insights when GBP configured"
  ]
}
```

---

## 6. MID-STRATEGY EVALUATION SHEET — FULL AUDIT

### 6a. Source Map — All Benchmark Fields

| field | primary_source | fallback_source | api_endpoint | file |
|---|---|---|---|---|
| whoisReg | WHOIS (web_retrieval) | none | GoDaddy / public WHOIS search | evalDataCollector.ts |
| firstArchive | Wayback Machine (web_retrieval) | none | https://archive.org/wayback/available | evalDataCollector.ts |
| dr | Ahrefs | none | /v3/site-explorer/overview?select=domain_rating | evalDataCollector.ts:153 |
| referringDomains | Ahrefs | none | /v3/site-explorer/overview?select=refdomains | evalDataCollector.ts:153 |
| backlinks | Ahrefs | none | /v3/site-explorer/overview?select=backlinks | evalDataCollector.ts:153 |
| organicTraffic | Ahrefs (if non-dash) | SEMrush domain_ranks Ot column | evalDataCollector.ts:218 priority logic |
| organicKeywords | Ahrefs (if non-dash) | SEMrush domain_ranks Or column | evalDataCollector.ts:219 priority logic |
| top10Keywords | Ahrefs site-explorer/organic-keywords where pos 4-10 | none | /v3/site-explorer/organic-keywords?where=pos>=4&pos<=10&select=keyword&limit=1 → meta.total | evalDataCollector.ts:173 |
| indexedPages | Screaming Frog upload (indexable URL count) | SEMrush domain_ranks Pc column | evalMetricRegistry.ts note | evalDataCollector.ts:97 |
| aiVisibilityScore | SEMrush AI tool | none | Not yet mapped to specific SEMrush endpoint in evalDataCollector | evalDataCollector.ts (not yet implemented in semrushDomainData) |
| aiMentions | SEMrush AI tool | none | Not yet mapped | evalDataCollector.ts (not yet implemented) |
| citedSources | SEMrush AI tool | none | Not yet mapped | evalDataCollector.ts (not yet implemented) |
| informationalKeywords | SEMrush domain_organic (intent=Informational filter) | none | `display_filter=%2B|In|Eq|Informational` | evalDataCollector.ts:121 |
| featuredSnippets | SEMrush domain_organic (Fk=1 Featured Snippet filter) | none | `display_filter=%2B|Fk|Co|1` | evalDataCollector.ts:101 |

**NOTE on AI visibility metrics:** `aiVisibilityScore`, `aiMentions`, `citedSources` appear in METRIC_REGISTRY as SEMrush fields but `semrushDomainData()` in evalDataCollector.ts does NOT fetch them. These three fields are always "—" unless manually entered. They are not connected to any SEMrush AI endpoint.

### 6b. Formula Map — All Score / Velocity / Density / Yield Fields

```
Derived metric       Formula                                    Null behavior
───────────────────────────────────────────────────────────────────────────────
age                  today - whoisReg (years, 1 decimal)        DASH if whoisReg missing
archiveAge           today - firstArchive (years, 1 decimal)    DASH if firstArchive missing
kwVelocity           organicKeywords / age                      DASH if age=0 or organicKeywords=DASH
snippetVelocity      featuredSnippets / age                     DASH if age=0 or featuredSnippets=DASH
rdVelocity           referringDomains / age                     DASH if age=0 or referringDomains=DASH
contentVelocity      indexedPages / age                         DASH if age=0 or indexedPages=DASH
kwYield              organicTraffic / organicKeywords           DASH if organicKeywords=0
snippetYield         organicTraffic / featuredSnippets          DASH if featuredSnippets=0
mentionRate          aiMentions / citedSources × 100 + "%"     DASH if citedSources=0
rdYield              organicTraffic / referringDomains          DASH if referringDomains=0
contentYield         organicTraffic / indexedPages              DASH if indexedPages=0
backlinkDensity      backlinks / referringDomains               DASH if referringDomains=0
informationalDensity informationalKeywords / organicKeywords    DASH if organicKeywords=0
averageRank          mean of all per-metric rank positions       DASH if no valid ranks
finalScore           same as averageRank                        DASH if no valid ranks
```

**Implementation:** `evalDataCollector.ts:computeDerivedMetrics()` lines 229–252  
**safeDiv rule:** `Math.round((a / b) × 100) / 100` — returns 0 if b=0 (never NaN, never Infinity)

### 6c. Rank Computation Logic

**File:** `evalDataCollector.ts:computeRanks()` lines 257–292  

```
descMetrics (higher = rank 1):
  dr, referringDomains, backlinks, organicTraffic, organicKeywords, top10Keywords,
  indexedPages, aiVisibilityScore, aiMentions, citedSources, informationalKeywords,
  featuredSnippets, age, archiveAge, kwVelocity, snippetVelocity, rdVelocity,
  contentVelocity, kwYield, snippetYield, rdYield, contentYield, backlinkDensity

ascMetrics (not in descMetrics list — lower = rank 1):
  informationalDensity (NOTE: informationalDensity is desc in registry but not in descMetrics
  list in computeRanks — this is a discrepancy)

Rows with value=0 or DASH are excluded from ranking (filtered before sort)
averageRank = mean of all per-row rank values / round to 1 decimal
finalScore = averageRank (identical)
```

**Discrepancy found:** `informationalDensity` is marked `rankDirection: "desc"` in evalMetricRegistry.ts but is NOT in the `descMetrics` array in `computeRanks()` — it would be ranked ascending (lower density = rank 1) which contradicts the registry intent.

### 6d. Crawl Join Logic (Clicks Distribution / Traffic Distribution)

**File:** `evalDataCollector.ts` lines 315–360  

```
Input: crawlRows[] — each row has:
  pageCategory: string (from classifyUrl())
  performanceFields: { gscClicks, ga4Sessions, ... }

buildClicksDistribution():
  group by pageCategory
  sumClicks += performanceFields.gscClicks per row
  shareOfClicks = sumClicks[cat] / totalClicks × 100
  clicksPerPage = sumClicks[cat] / numPages[cat]
  sort by sumClicks desc

buildTrafficDistribution():
  same but uses performanceFields.ga4Sessions
  shareOfSessions = sumSessions[cat] / totalSessions × 100
  sessionsPerPage = sumSessions[cat] / numPages[cat]
```

**Homepage concentration detection:**  
Category name is "Homepage" from DEFAULT_CATEGORY_RULES if the URL path is "/" or empty.  
If clicks_dist shows Homepage has disproportionately high shareOfClicks (e.g. >40%), this signals homepage concentration.

### 6e. Category Rollup Logic

**File:** `evalMetricRegistry.ts` — `classifyUrl()` + `DEFAULT_CATEGORY_RULES`  

```typescript
DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { pattern: /^\/($|\?)/,                   category: "Homepage" },
  { pattern: /\/programs?\//i,               category: "Programs" },
  { pattern: /\/what-we-treat\//i,           category: "Conditions" },
  { pattern: /\/admissions?\//i,             category: "Admissions" },
  { pattern: /\/(about|our-team|staff)\//i,  category: "About" },
  { pattern: /\/(blog|news|resources)\//i,   category: "Blog/Resources" },
  { pattern: /\/locations?\//i,              category: "Locations" },
  // default fallback: "Other"
]
```

Classify function: iterates rules, returns first match category, defaults to "Other".  
This is a behavioral health / addiction treatment template — other verticals need custom rules.

### 6f. Missing Middle-of-Funnel Detection

**Current state:** NOT IMPLEMENTED as a named function.  
**Where it would live:** QBS generator or a separate funnel gap analyzer.  
**Evidence available:**  
- GSC queries: informational queries (top of funnel) vs transactional queries (bottom)  
- GA4 conversion rate by landing page  
- SEMrush informationalKeywords / organicKeywords ratio (informationalDensity)  
**Current proxy:** informationalDensity metric in the eval sheet shows the ratio of informational vs all keywords, which surfaces imbalance but doesn't map to funnel stages.

### 6g. Export Mapping to Google Sheets

**File:** Partial — no dedicated export function exists for eval batch → Google Sheets.  
**What exists:** `server/sheetsClient.ts` handles NSM goal reads only (fetchNsmGoals).  
**What's missing:**  
- Export of evalBatch competitor rows to Google Sheets  
- Export of clicks_dist / traffic_dist tables to Sheets  
- No write path to Google Sheets from eval batch data  
**Required:** A new `exportEvalBatchToSheets(evalBatch, spreadsheetId)` function in sheetsClient.ts using the Google Sheets API write endpoint.

---

## 7. SETUP INTEGRATIONS DEEP AUDIT

### 7a. Auth Status Handling by Integration

| integration | stored_as | auth_mechanism | last_sync_tracked | scope_verified |
|---|---|---|---|---|
| GA4 | Replit OAuth connector "google_analytics_4" | OAuth access token via getGoogleAccessToken() | No | sessionDefaultChannelGrouping filter implies read access |
| GSC | Replit OAuth connector "google_search_console" | OAuth access token via getGoogleAccessToken() | No | gscSiteUrl must be sc-domain: or https:// format |
| CallRail | DB apiCredentials service="callrail" | Token in header: `Token token=...` | No | per_page=250 limit reached; no scope check |
| CTM | DB apiCredentials service="call_tracking_metrics" (2 creds: api_key + api_secret) | Basic auth (apiKey:apiSecret base64) | No | per_page=100 limit reached; no scope check |
| Nimbata | DB client.nimbataAccountId field only | NO CLIENT — no auth mechanism | No | N/A |
| Ahrefs | DB apiCredentials service="ahrefs" | Bearer token | No | v3 endpoints; site-explorer scope assumed |
| SEMrush | DB apiCredentials service="semrush" | API key in query param | No | domain_ranks, domain_organic, SERP features used |
| Airtable | Replit connector "airtable" | OAuth via ReplitConnectors SDK | No | base ID per client (airtableBaseId field) |
| Asana | Replit connector "asana" | OAuth via ReplitConnectors SDK | No | asanaProjectId per client |
| Notion | Replit connector "notion" | OAuth | No | Not used in any generator |
| Google Sheets | Replit connector "google_sheets" | OAuth | No | NSM goals only (read) |
| GBP | server/gbpClient.ts exists | Google OAuth | No | Not called in any generator |
| Google Drive | Replit connector "google_drive" | OAuth | No | Not used in generators |

### 7b. Client Field → Integration Mapping

| client_field | integration | used_in |
|---|---|---|
| gscSiteUrl | GSC | Monthly, QBS, QBR, Discoverability |
| ga4PropertyId | GA4 | Monthly, QBS, QBR |
| callrailCompanyId | CallRail | Monthly, Dashboard |
| callrailAccountId | CallRail (resolved or stored) | Monthly, Dashboard |
| callrailOrganicSourceTerms | CallRail (client-side filter) | Monthly callrail_qoq_top_landing_pages |
| ctmAccountId | CTM | Monthly (after fix), Dashboard |
| ctmOrganicSourceTerms | CTM (client-side filter) | ctm_qoq_organic_calls (after fix), ctm_qoq_top_landing_pages |
| nimbataAccountId | Nimbata | Dashboard badge only — no data |
| airtableBaseId | Airtable | Monthly, Biweekly |
| asanaProjectId | Asana | Monthly, Biweekly |
| semrushProjectId | SEMrush | Monthly (keyword distribution), evalDataCollector |
| ahrefsProjectUrl | Ahrefs | Discoverability liveContext, evalDataCollector |
| brandTerms | GSC (client-side filter) | gscClient.ts isNonBrand() |
| leadEvents | GA4 | ga4Client.ts (leadEvents for conversion event filtering — currently unused in funnel command) |

### 7c. Error Handling Patterns

| integration | on_error_behavior |
|---|---|
| GSC | catch → console.warn + null returned → slide falls to placeholder |
| GA4 | catch → null returned → slide falls to placeholder |
| CallRail | throw Error → Promise.allSettled catches → slide falls to placeholder |
| CTM | throw Error → Promise.allSettled catches → slide falls to placeholder |
| SEMrush | throws on "ERROR" prefix in text → Promise.allSettled catches |
| Ahrefs | resp.ok check → throws → Promise.allSettled catches in eval batch |
| Airtable | setupRequired flag returned → noAirtable=true → placeholder rows |
| Asana | null returned → empty categories → no rows |

---

## 8. FILES AND SERVICES TOUCHED

### New files created (this session)
```
server/reportValidators.ts     — Actual validator rules for all 7 report types
server/callNormalizer.ts       — Provider mapping tables + normalizeCallRailCall/normalizeCtmCall
```

### Files modified (this session)
```
server/monthlyGenerator.ts     — Added queryCtm import; CTM routing in 3 call fetch slots;
                                  dynamic provider labels on Slide 2 + Slide 2b
server/ctmClient.ts            — Fixed ctm_qoq_organic_calls: now applies organic source
                                  filter when ctmOrganicSourceTerms are configured
```

### Previous sessions (T001–T004)
```
client/src/pages/workflow.tsx
client/src/pages/sample-reports.tsx
server/routes.ts
client/src/pages/discoverability.tsx
client/src/components/reports/SourceReadinessBanner.tsx (new)
client/src/pages/monthly.tsx
client/src/pages/biweekly.tsx
client/src/pages/qbr-prep.tsx
client/src/pages/dashboard.tsx
```

---

## 9. REMAINING OPEN ITEMS

| priority | item | file | status |
|---|---|---|---|
| ~~P0~~ | callrail_qoq_organic_calls counts ALL calls — now filters by organicSourceTerms | server/callrailClient.ts | FIXED |
| ~~P0~~ | CTM service key in qbrPrepGenerator used 'ctm' not 'call_tracking_metrics' | server/qbrPrepGenerator.ts:329 | FIXED |
| P0 | aiVisibilityScore / aiMentions / citedSources not fetched from SEMrush (always "—") | server/evalDataCollector.ts | OPEN |
| P1 | Create server/nimbataClient.ts with organic_calls + source_breakdown commands | (new file) | OPEN |
| ~~P1~~ | informationalDensity rankDirection inconsistency (registry=desc, computeRanks=asc) | server/evalDataCollector.ts:262 | FIXED |
| P1 | QBS Authority category: add Ahrefs evidence (DR, RD, backlinks) | server/qbrPrepGenerator.ts | OPEN |
| P1 | QBS Tracking category: fetch actual call data not just available flag | server/qbrPrepGenerator.ts | OPEN |
| P1 | GBP data not surfaced in Local SEO category of QBS | server/qbrPrepGenerator.ts | OPEN |
| P2 | Export evalBatch → Google Sheets (write path missing) | server/sheetsClient.ts | OPEN |
| P2 | Missing middle-of-funnel detection as explicit function | new: funnelGapAnalyzer.ts | OPEN |
| P2 | QBS uses inline gscFetch/ga4Fetch instead of shared queryGsc/queryGa4 | server/qbrPrepGenerator.ts | OPEN |
| P2 | callrail_summary does not fetch tags[] — no VOB detection | server/callrailClient.ts | OPEN |
