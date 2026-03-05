import type { SectionData } from "./reportGenerators";
import type { QbrPrepJson } from "./qbrPrepGenerator";

export const SAMPLE_CLIENT_NAME = "Acme Plumbing & HVAC";
export const SAMPLE_ATTENDEES = "Sarah Mitchell (Acme), James Carter (Webserv), Dana Reyes (Webserv)";

export function getSampleBiweeklySections(): SectionData[] {
  return [
    {
      sectionId: "bw_purpose",
      title: "Purpose",
      items: [],
    },
    {
      sectionId: "bw_pulse",
      title: "Performance Pulse & Key Insights",
      items: [
        {
          summary: [
            { label: "Organic Clicks", current: "3,412", previous: "2,987", deltaPercent: "+14.2%", isPositive: true },
            { label: "Impressions", current: "48,310", previous: "44,120", deltaPercent: "+9.5%", isPositive: true },
            { label: "Avg Position", current: "11.4", previous: "13.1", deltaPercent: "+1.7 pos", isPositive: true },
            { label: "CTR", current: "7.06%", previous: "6.77%", deltaPercent: "+0.29%", isPositive: true },
          ],
        },
        {
          summary: [
            { label: "Organic Sessions", current: "2,804", previous: "2,391", deltaPercent: "+17.3%", isPositive: true },
            { label: "Goal Completions", current: "112", previous: "94", deltaPercent: "+19.1%", isPositive: true },
            { label: "CVR", current: "3.99%", previous: "3.93%", deltaPercent: "+0.06%", isPositive: true },
          ],
        },
        {
          summary: [
            { label: "Organic Calls", current: "67", previous: "54", deltaPercent: "+24.1%", isPositive: true },
            { label: "Total Leads", current: "179", previous: "148", deltaPercent: "+20.9%", isPositive: true },
          ],
        },
        {
          tables: [
            {
              title: "Top Session Movers (Last 14 Days)",
              headers: ["Page", "Sessions", "Change", "Conversions"],
              rows: [
                ["/services/water-heater-repair", "341", "+28%", "18"],
                ["/emergency-plumbing", "298", "+41%", "22"],
                ["/ac-repair-irvine", "187", "+15%", "9"],
                ["/drain-cleaning", "164", "-6%", "6"],
                ["/sewer-line-replacement", "143", "+33%", "11"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "bw_progress",
      title: "Progress & Quick Wins",
      items: [
        {
          tableRows: [
            {
              area: "New Content",
              whatWeDid: "Published 'Signs Your Water Heater Needs Replacing' blog post — 1,200 words, targeting water-heater-replacement-cost cluster. Indexed within 48 hrs.",
              whatsNext: "Monitor impressions over 30 days; build 2 internal links from service pages.",
            },
            {
              area: "Content Optimization",
              whatWeDid: "Rewrote meta titles and H1s for 8 AC repair pages. Average position improved from 18.3 → 14.7 after update.",
              whatsNext: "Refresh body copy on top 3 pages with new FAQ schema once rankings stabilize.",
            },
            {
              area: "Technical SEO",
              whatWeDid: "Fixed 34 broken internal links flagged in last Screaming Frog crawl. Resolved 2 redirect chains > 3 hops.",
              whatsNext: "Run re-crawl next week to confirm fixes. Address remaining 12 slow pages (LCP > 4s).",
            },
            {
              area: "Local SEO",
              whatWeDid: "Optimized GBP posts for summer HVAC campaign. Added 14 new Q&A entries. Profile views up 22% vs prior period.",
              whatsNext: "Upload 10 new job-site photos. Request 5 new Google reviews from recent customers.",
            },
          ],
        },
      ],
    },
    {
      sectionId: "bw_partnership",
      title: "Partnerships & Alignment",
      items: [
        {
          manualText:
            "Client confirmed approval for the new drain-cleaning landing page design mockup — sending to dev this week.\nRequest to create 2 city-specific pages for Laguna Beach and Newport Beach — adding to sprint backlog for next period.\nWebserv to share updated keyword tracking spreadsheet by Friday.\nClient mentioned a new 'tankless water heater' promotion launching June 1 — will need dedicated landing page and blog support.\nNext meeting: March 19 at 10am PT.",
        },
      ],
    },
  ];
}

export function getSampleMonthlySections(): SectionData[] {
  return [
    {
      sectionId: "mo_qtd",
      title: "QTD Key Performance Indicators",
      items: [
        {
          summary: [
            { label: "QTD Organic Sessions", current: "14,821", previous: "11,340", deltaPercent: "+30.7%", isPositive: true },
            { label: "QTD Goal Completions", current: "592", previous: "441", deltaPercent: "+34.2%", isPositive: true },
            { label: "QTD CVR", current: "3.99%", previous: "3.89%", deltaPercent: "+0.10%", isPositive: true },
            { label: "QTD Calls (Organic)", current: "287", previous: "219", deltaPercent: "+31.1%", isPositive: true },
          ],
        },
      ],
    },
    {
      sectionId: "mo_conversion",
      title: "Top Conversion Locations",
      items: [
        {
          tables: [
            {
              title: "Top Landing Pages by Conversions (Last 30 Days)",
              headers: ["Page", "Sessions", "Conversions", "CVR"],
              rows: [
                ["/emergency-plumbing", "1,204", "88", "7.31%"],
                ["/water-heater-repair", "987", "71", "7.19%"],
                ["/ac-repair-irvine", "843", "52", "6.17%"],
                ["/drain-cleaning", "762", "39", "5.12%"],
                ["/sewer-line-replacement", "631", "34", "5.39%"],
                ["/tankless-water-heater", "487", "28", "5.75%"],
                ["/hvac-maintenance", "412", "21", "5.10%"],
                ["/pipe-repair", "344", "17", "4.94%"],
              ],
            },
            {
              title: "Top Pages by Call Volume (Last 30 Days)",
              headers: ["Page", "Calls", "vs Prior 30 Days"],
              rows: [
                ["/emergency-plumbing", "54", "+31%"],
                ["/water-heater-repair", "41", "+18%"],
                ["/ac-repair-irvine", "37", "+42%"],
                ["/drain-cleaning", "28", "-4%"],
                ["/sewer-line-replacement", "22", "+29%"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "mo_gsc",
      title: "Google Search Console Performance",
      items: [
        {
          summary: [
            { label: "Total Clicks", current: "7,241", previous: "6,118", deltaPercent: "+18.4%", isPositive: true },
            { label: "Total Impressions", current: "98,440", previous: "89,310", deltaPercent: "+10.2%", isPositive: true },
            { label: "Avg CTR", current: "7.35%", previous: "6.85%", deltaPercent: "+0.50%", isPositive: true },
            { label: "Avg Position", current: "11.2", previous: "13.4", deltaPercent: "+2.2 pos", isPositive: true },
          ],
        },
        {
          tables: [
            {
              title: "Top Queries by Clicks (Last 30 Days)",
              headers: ["Query", "Clicks", "Impressions", "CTR", "Position"],
              rows: [
                ["emergency plumber irvine", "412", "3,201", "12.87%", "3.2"],
                ["water heater repair near me", "387", "4,108", "9.42%", "4.8"],
                ["ac repair irvine ca", "341", "2,987", "11.41%", "4.1"],
                ["drain cleaning orange county", "298", "3,542", "8.41%", "5.6"],
                ["plumber irvine", "271", "5,104", "5.31%", "6.2"],
                ["hvac repair irvine", "234", "2,814", "8.32%", "5.9"],
                ["sewer line replacement cost", "198", "4,201", "4.71%", "8.4"],
                ["tankless water heater installation", "176", "3,108", "5.66%", "7.3"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "mo_keywords",
      title: "Keyword Tracking",
      items: [
        {
          summary: [
            { label: "Top 3 Rankings", current: "24", previous: "18", deltaPercent: "+33%", isPositive: true },
            { label: "Top 10 Rankings", current: "87", previous: "71", deltaPercent: "+22.5%", isPositive: true },
            { label: "Top 30 Rankings", current: "164", previous: "148", deltaPercent: "+10.8%", isPositive: true },
            { label: "Tracked Keywords", current: "210", previous: "210", deltaPercent: "—", isPositive: true },
          ],
        },
        {
          tables: [
            {
              title: "Keyword Ranking Distribution",
              headers: ["Tier", "Keywords", "vs Last Month"],
              rows: [
                ["Top 3", "24", "+6"],
                ["4–10", "63", "+10"],
                ["11–20", "54", "+8"],
                ["21–30", "77", "-2"],
                ["31–50", "42", "-4"],
                ["51+", "50", "-18"],
              ],
            },
            {
              title: "Notable Keyword Moves (March)",
              headers: ["Keyword", "Current Rank", "Prior Rank", "Change"],
              rows: [
                ["emergency plumber irvine", "3", "7", "+4"],
                ["water heater replacement cost orange county", "8", "14", "+6"],
                ["ac tune up irvine", "12", "21", "+9"],
                ["hvac companies near me irvine", "15", "9", "-6"],
                ["tankless water heater pros cons", "22", "34", "+12"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "mo_initiatives",
      title: "Supporting Strategic Initiatives",
      items: [
        {
          tables: [
            {
              title: "New Content (Scale)",
              headers: ["Task", "Status", "Due Date", "URL / Page"],
              rows: [
                ["Signs Your Water Heater Needs Replacing", "Published", "Mar 8", "/blog/water-heater-signs"],
                ["AC Repair vs Replacement Guide", "In Review", "Mar 22", "/blog/ac-repair-vs-replace"],
                ["Tankless Water Heater Cost Guide", "In Progress", "Mar 29", "/blog/tankless-cost-guide"],
              ],
            },
            {
              title: "Content Optimization",
              headers: ["Task", "Status", "Due Date", "URL / Page"],
              rows: [
                ["Meta title + H1 refresh — AC service pages (8 pages)", "Complete", "Mar 5", "/services/ac-*"],
                ["Internal linking audit — plumbing cluster", "Complete", "Mar 12", "Multiple"],
                ["FAQ schema — emergency plumbing page", "Scheduled", "Mar 26", "/emergency-plumbing"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "mo_audit",
      title: "AUDIT Content",
      items: [
        {
          manualText:
            "Crawl health: 1,204 pages crawled — 34 broken links resolved, 2 redirect chains fixed (> 3 hops).\nIndexation: 1,187 pages indexed in Google Search Console (+12 vs last month). No sudden drops detected.\nCore Web Vitals: 78% of pages pass CWV. 12 pages remain with LCP > 4s — targeted for image optimization in April sprint.\nTracking: GA4 and CallRail firing correctly across all key landing pages. No anomalies detected in March.",
        },
      ],
    },
    {
      sectionId: "mo_content",
      title: "Content Completion",
      items: [
        {
          manualText:
            "3 new blog posts published in March (target: 3 — on track).\n1 service page fully rewritten: /water-heater-repair — early GSC signals show +28% impressions in first 2 weeks.\n8 existing pages received meta title and H1 updates — position improvements averaging +2.1 ranks.\nContent pipeline for April: 2 city pages (Newport Beach, Laguna Beach), 1 blog post, 1 service page refresh.",
        },
      ],
    },
  ];
}

export function getSampleQbrSections(): SectionData[] {
  return [
    {
      sectionId: "qbr_performance",
      title: "Performance Review — Q1 2025",
      items: [
        {
          summary: [
            { label: "Organic Clicks (Q1)", current: "21,340", previous: "15,820", deltaPercent: "+34.9%", isPositive: true },
            { label: "Organic Sessions (Q1)", current: "17,804", previous: "13,220", deltaPercent: "+34.7%", isPositive: true },
            { label: "Goal Completions (Q1)", current: "712", previous: "519", deltaPercent: "+37.2%", isPositive: true },
            { label: "Organic Calls (Q1)", current: "328", previous: "241", deltaPercent: "+36.1%", isPositive: true },
          ],
        },
        {
          summary: [
            { label: "Impressions (Q1)", current: "298,440", previous: "244,100", deltaPercent: "+22.2%", isPositive: true },
            { label: "Avg CTR (Q1)", current: "7.15%", previous: "6.48%", deltaPercent: "+0.67%", isPositive: true },
            { label: "Avg Position (Q1)", current: "11.6", previous: "14.2", deltaPercent: "+2.6 pos", isPositive: true },
            { label: "CVR (Q1)", current: "4.00%", previous: "3.93%", deltaPercent: "+0.07%", isPositive: true },
          ],
        },
        {
          tables: [
            {
              title: "Monthly Organic Session Trend",
              headers: ["Month", "Organic Sessions", "Goal Completions", "Calls"],
              rows: [
                ["January 2025", "5,412", "218", "98"],
                ["February 2025", "6,188", "244", "112"],
                ["March 2025", "6,204", "250", "118"],
                ["January 2024", "4,104", "161", "82"],
                ["February 2024", "4,487", "178", "79"],
                ["March 2024", "4,629", "180", "80"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "qbr_strategy",
      title: "Strategy Overview",
      items: [
        {
          tables: [
            {
              title: "Top Landing Pages by Organic Sessions (Q1 2025 vs Q1 2024)",
              headers: ["Page", "Q1 2025 Sessions", "Q1 2024 Sessions", "Change"],
              rows: [
                ["/emergency-plumbing", "3,814", "2,201", "+73.3%"],
                ["/water-heater-repair", "3,102", "2,514", "+23.4%"],
                ["/ac-repair-irvine", "2,481", "1,602", "+54.9%"],
                ["/drain-cleaning", "2,104", "1,847", "+13.9%"],
                ["/sewer-line-replacement", "1,802", "1,241", "+45.2%"],
                ["/hvac-maintenance", "1,401", "1,104", "+26.9%"],
                ["/tankless-water-heater", "1,214", "812", "+49.5%"],
              ],
            },
            {
              title: "Keyword Distribution Comparison",
              headers: ["Tier", "Q1 2025", "Q1 2024", "Change"],
              rows: [
                ["Top 3", "24", "14", "+10"],
                ["4–10", "63", "48", "+15"],
                ["11–20", "54", "49", "+5"],
                ["21–30", "77", "81", "-4"],
                ["31–50", "42", "58", "-16"],
                ["51+", "50", "60", "-10"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "qbr_strategic_plan",
      title: "Strategic Plan — Q2 2025",
      items: [
        {
          manualText:
            "Priority 1 — Capture HVAC intent surge: Summer AC demand peaks in May–July in Orange County. We will create 4 city-specific AC repair pages (Newport Beach, Laguna Beach, Lake Forest, Mission Viejo) and 2 blog posts targeting 'AC tune-up' and 'AC not cooling' keywords before May 1.\nPriority 2 — Accelerate emergency plumbing growth: Emergency plumbing is our top conversion driver (+73% YoY). Invest in structured data (LocalBusiness + Service), add 3 more city variants, and build 5 supporting FAQ pages.\nPriority 3 — Core Web Vitals: 12 pages remain with LCP > 4s, dragging overall performance. Image optimization and lazy-loading sprint planned for April 14–25.\nPriority 4 — Review generation: Ramp Google review acquisition from ~4/month to 10+/month via post-job SMS flow. Target: 4.8+ rating with 200+ reviews by end of Q2.",
        },
      ],
    },
    {
      sectionId: "qbr_roadmap",
      title: "Roadmap & Alignment — Q2 2025",
      items: [
        {
          tables: [
            {
              title: "Q2 2025 Initiative Roadmap",
              headers: ["Priority", "Initiative", "Category", "Est. Impact", "Owner", "Target Date"],
              rows: [
                ["P0", "4 city AC repair pages", "Content", "High", "Webserv", "May 1"],
                ["P0", "Emergency plumbing structured data", "Technical", "High", "Webserv", "Apr 18"],
                ["P1", "Core Web Vitals sprint (12 pages)", "Technical", "Med", "Webserv + Client Dev", "Apr 25"],
                ["P1", "SMS review request flow", "CRO / Local", "High", "Client", "May 15"],
                ["P1", "'AC not cooling' blog post", "Content", "Med", "Webserv", "Apr 30"],
                ["P2", "Tankless WH landing page redesign", "CRO", "Med", "Webserv + Client", "Jun 1"],
                ["P2", "Competitor gap analysis refresh", "Strategy", "Low", "Webserv", "May 31"],
              ],
            },
          ],
        },
      ],
    },
    {
      sectionId: "qbr_partnership",
      title: "Partnership Items",
      items: [
        {
          manualText:
            "Dependency: City page creation requires client approval of service area map — due by March 28.\nRisk: Client dev team bandwidth is limited in April (1 developer on leave). Core Web Vitals sprint may shift to early May if resources unavailable.\nOpen item: Discuss Q2 budget allocation for Google Ads support alongside organic — referral to paid team.\nNext QBR: Scheduled for late June 2025. Webserv to send calendar invite by April 4.",
        },
      ],
    },
  ];
}

export function getSampleQbrPrepJson(): QbrPrepJson {
  return {
    report_title: "QBR Prep — Opportunity Backlog",
    client_name: SAMPLE_CLIENT_NAME,
    past_window_label: "Q1 2025",
    past_start: "2025-01-01",
    past_end: "2025-03-31",
    future_window_label: "Q2 2025",
    generated_at: new Date().toISOString(),
    executive_summary: {
      wins: [
        {
          title: "Emergency Plumbing — 73% YoY organic session growth",
          evidence: "GA4: /emergency-plumbing — 3,814 sessions in Q1 2025 vs 2,201 in Q1 2024",
          source: "GA4",
        },
        {
          title: "Top 3 keyword rankings grew from 14 → 24 (+71%)",
          evidence: "SEMrush keyword tracking: 24 keywords now ranking in positions 1–3 (was 14 in Q1 2024)",
          source: "SEMrush",
        },
        {
          title: "Overall leads up +37.2% QoQ — 712 vs 519",
          evidence: "GA4 goal completions + CallRail organic calls combined: 712 total organic leads in Q1 2025",
          source: "GA4 + CallRail",
        },
        {
          title: "AC repair pages drove 54.9% more sessions after H1 + meta refresh",
          evidence: "GSC: /ac-repair-irvine cluster impressions up 38%, clicks up 52% in the 6 weeks post-update",
          source: "GSC",
        },
      ],
      top_opportunities: [
        {
          title: "High Impression / Low CTR — Plumber near me cluster",
          category: "Content",
          priority: "P0",
          impact: "High",
          kpi: "Clicks / Leads",
        },
        {
          title: "12 pages failing Core Web Vitals (LCP > 4s)",
          category: "Technical",
          priority: "P0",
          impact: "High",
          kpi: "Rankings / Conversions",
        },
        {
          title: "High Traffic / Low CVR — Drain cleaning page",
          category: "CRO",
          priority: "P1",
          impact: "Med",
          kpi: "CVR / Leads",
        },
        {
          title: "No city-specific AC repair pages for Newport Beach, Laguna Beach",
          category: "Content",
          priority: "P1",
          impact: "High",
          kpi: "Organic Sessions / Leads",
        },
        {
          title: "Review velocity low (avg 4/month) — limiting local pack rankings",
          category: "Local",
          priority: "P1",
          impact: "Med",
          kpi: "Local Pack Visibility",
        },
      ],
    },
    opportunity_backlog: [
      {
        category_name: "Content",
        opportunities: [
          {
            opportunity_title: "High Impression / Low CTR — 'plumber near me' keyword cluster",
            priority: "P0",
            impact: "High",
            effort: "M",
            kpi_affected: "Clicks, Leads",
            urls: ["/services/plumbing", "/emergency-plumbing"],
            evidence:
              "GSC Q1 2025: 'plumber near me' and 6 variants generated 18,400 impressions but only 3.1% CTR (benchmark: 8–12% for position 3–5). Pages ranking 4–7 for these terms.",
            problem:
              "Title tags are generic ('Plumbing Services | Acme Plumbing') and meta descriptions don't include urgency signals or local modifiers that users scanning results respond to.",
            opportunity:
              "Rewrite title tags to include urgency + city ('Emergency Plumber in Irvine — Fast Response | Acme') and add a compelling meta description with a call to action. Test structured snippets for FAQ schema.",
            why_it_matters:
              "Moving CTR from 3.1% → 8% at 18,400 impressions would generate ~900 additional clicks/quarter — at our current 7.3% CVR, that's ~66 additional leads per quarter from no-cost content changes.",
            recommended_next_step:
              "Draft revised title tags and meta descriptions for top 8 pages in cluster. A/B test using Google Search Console performance tracking over 30 days.",
          },
          {
            opportunity_title: "No city-specific AC repair pages — Newport Beach, Laguna Beach, Mission Viejo",
            priority: "P1",
            impact: "High",
            effort: "M",
            kpi_affected: "Organic Sessions, Leads",
            urls: [],
            evidence:
              "GSC: 'ac repair newport beach', 'ac repair laguna beach' and 'ac repair mission viejo' collectively show 4,100 impressions in Q1 with 0 dedicated pages — all traffic landing on the generic /ac-repair-irvine page.",
            problem:
              "No geo-targeted pages exist for these high-value adjacent markets. Users in Newport Beach and Laguna Beach are 20%+ more likely to convert when landing on a locally-named page (based on comparable Webserv client data).",
            opportunity:
              "Create 3 new city-specific AC repair service pages with localized content, structured data, and unique CTAs. Interlink with existing /ac-repair-irvine page.",
            why_it_matters:
              "Each city page historically drives 150–300 organic sessions/month within 60 days of indexing for comparable service clients. At 6% CVR, that's 9–18 leads/month per page.",
            recommended_next_step:
              "Draft content briefs for Newport Beach and Laguna Beach AC repair pages. Prioritize Newport Beach first — highest volume signal. Target launch before May 1 (start of peak HVAC season).",
          },
        ],
      },
      {
        category_name: "Technical",
        opportunities: [
          {
            opportunity_title: "12 pages failing Core Web Vitals (LCP > 4.0s)",
            priority: "P0",
            impact: "High",
            effort: "M",
            kpi_affected: "Rankings, Bounce Rate, Conversions",
            urls: [
              "/water-heater-repair",
              "/drain-cleaning",
              "/hvac-maintenance",
              "/pipe-repair",
            ],
            evidence:
              "Google Search Console Core Web Vitals report: 12 URLs marked 'Poor' for LCP. Screaming Frog crawl shows hero images on these pages are uncompressed JPEGs averaging 1.2MB each, served without lazy loading.",
            problem:
              "Slow LCP hurts both Google rankings (page experience signal) and user drop-off: pages with LCP > 4s see 32% higher bounce rates in GA4 across comparable sites.",
            opportunity:
              "Compress and convert hero images to WebP, implement lazy loading for below-fold images, and defer non-critical JavaScript on 12 identified pages.",
            why_it_matters:
              "Resolving CWV failures on these 12 pages could improve rankings for 34 keywords currently sitting in positions 8–15, potentially driving 400–600 additional clicks/month.",
            recommended_next_step:
              "Provide client dev team with a prioritized list of 12 URLs + specific image file names to optimize. Webserv to handle lazy-load implementation on pages within Webserv's scope.",
          },
        ],
      },
      {
        category_name: "CRO",
        opportunities: [
          {
            opportunity_title: "High Traffic / Low CVR — Drain cleaning page",
            priority: "P1",
            impact: "Med",
            effort: "S",
            kpi_affected: "CVR, Leads",
            urls: ["/drain-cleaning"],
            evidence:
              "GA4 Q1 2025: /drain-cleaning received 2,104 organic sessions with a 1.86% CVR — vs site average of 4.00%. Form scroll depth in GA4 shows 64% of users never reach the contact form (it's placed below the fold after 3 content sections).",
            problem:
              "The primary CTA (contact form) is buried below three content sections and a competitor comparison table. Users with high intent are leaving before converting.",
            opportunity:
              "Add an above-fold CTA section ('Get a Free Drain Inspection — Same Day Service') with click-to-call button and inline form. Reorder page structure to lead with social proof + CTA before educational content.",
            why_it_matters:
              "Moving CVR from 1.86% → 4.00% (site average) on 2,104 monthly sessions would generate ~45 additional leads per month — approximately 135 per quarter.",
            recommended_next_step:
              "Design a revised above-fold section for /drain-cleaning. Implement as an A/B test using Google Optimize or a simple CTA swap. Measure CVR change over 30 days.",
          },
        ],
      },
      {
        category_name: "Local",
        opportunities: [
          {
            opportunity_title: "Low review velocity limiting Google Business Profile local pack rankings",
            priority: "P1",
            impact: "Med",
            effort: "S",
            kpi_affected: "Local Pack Visibility, GBP Calls",
            urls: [],
            evidence:
              "GBP Insights: Acme Plumbing averages 4 new Google reviews/month. Top 3 local pack competitors average 14–22 reviews/month. Current total: 142 reviews at 4.6 stars vs #1 competitor with 387 reviews at 4.8 stars.",
            problem:
              "Review recency and volume are key local pack ranking signals. At the current rate, Acme will take 18+ months to close the gap with the top local competitor.",
            opportunity:
              "Implement a post-job SMS review request workflow using the existing CRM. Automate a 24-hour follow-up text with a direct Google review link after job completion.",
            why_it_matters:
              "Increasing to 15+ reviews/month would likely move Acme from the #4 map pack position into the #2–3 position for key local terms within 90 days, based on Webserv benchmarks for similar clients.",
            recommended_next_step:
              "Identify CRM platform capabilities (client to confirm: ServiceTitan or Jobber). Webserv to draft SMS copy template. Target: pilot launch within 3 weeks.",
          },
        ],
      },
    ],
  };
}
