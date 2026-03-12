---
name: data-handling-rules
description: SmartEO data handling and report generation rules. Covers global data rules, source priority order, Treatment Center SEO Priority Framework (Tier 1–5), content credit rules, client monthly credit capacities, content topic selection framework, source-specific parsing priorities (GSC, GA4, Call tracking, GBP, Screaming Frog, Airtable, Asana, SEMrush, Ahrefs), and report-specific rules for Bi-Weekly, Monthly, QBR Prep, Full QBR, and Mid-Strategy reports. Load this skill before generating or modifying any report output, interpreting data, recommending content priorities, assigning credits, or deciding which SEO work matters most.
---

# SmartEO Data Handling Rules

Full rules are in `rules.md` in this directory. Always read that file before acting on any of the topics below.

## When to load rules.md

- Before generating or modifying any report (Bi-Weekly, Monthly, QBR Prep, Full QBR, Mid-Strategy)
- Before recommending content topics or priorities
- Before assigning content credits
- Before interpreting data from any source (GSC, GA4, SF crawl, SEMrush, etc.)
- Before deciding what SEO work is most important for a client
- Before writing slide content, workbook values, or action items
- Whenever the question is "what data should I use?" or "what matters here?"

## Quick reference — global rules

- Never invent data. Use `—` or `Manual entry needed` when a value cannot be pulled confidently.
- First-party data beats third-party estimates. GSC/GA4/Call tracking before SEMrush/Ahrefs.
- Source priority: GSC → GA4 → Call tracking → Google Sheets NSM → GBP → Screaming Frog → Airtable → Asana → SEMrush → Ahrefs.
- SEO priority: Tier 1 Trust & Eligibility → Tier 2 Structural Authority → Tier 3 Cleanup → Tier 4 Differentiation → Tier 5 Expansion.
- Technical updates are outside the content credit system.
- Report outputs prioritize: conversion relevance → service-page quality → trust and eligibility → structural clarity → cleanup → traffic growth (last).

## Client credit capacities (monthly)

| Client | Credits/month |
|---|---|
| Anchored Tides Recovery | 4 |
| Bliss Recovery | 8 |
| Heartland Healing Center | 5 |
| Sol Women's Treatment | 5 |
| Williamsburg House | 3 |
| Horseshoe Ridge | 4 |
| Iris Healing | 8 (Q2 2026) / 5 (other quarters) |

See `rules.md` for full credit assignment rules and all report-specific priorities.
