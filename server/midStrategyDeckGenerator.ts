/**
 * Mid-Strategy Deck Generator
 * Generates 14-slide presentation from linked Evaluation Batch data.
 * ISOLATED from the old midStrategyGenerator.ts — does not touch Monthly or QBR code.
 */

import { storage } from "./storage";
import { computeDerivedMetrics, computeRanks, buildClicksDistribution, buildTrafficDistribution, parseNum, fmtNum } from "./evalDataCollector";
import { METRIC_REGISTRY } from "./evalMetricRegistry";
import type { EvalBatch, EvalCompetitorRow, EvalSummaryRow, IAStructure, IANavItem, IAHubPage } from "@shared/schema";

const DASH = "—";

// ─── Slide Content Types ───────────────────────────────────────────────────────

export interface SlideContent {
  id: string;
  type: "title" | "agenda" | "checkpoint" | "comp_analysis" | "clicks_dist" | "traffic_dist" | "priorities" | "nav_ia" | "ia_blueprint" | "ia_credibility" | "whats_next";
  title: string;
  subtitle?: string;
  kicker?: string;
  narrativeBlocks: EditableBlock[];
  chartConfig?: ChartConfig;
  tableData?: TableData;
  navData?: NavData;
  iaBlueprintData?: IABlueprintData;
  citationTrace: CitationTrace;
  locked?: boolean; // true = auto-generated, edits preserved
}

export interface EditableBlock {
  key: string;
  label: string;
  value: string;
  type: "heading" | "paragraph" | "bullet_list" | "opportunity" | "kicker" | "whats_next_item" | "date" | "prepared_by";
}

export interface ChartConfig {
  type: "bar" | "scatter" | "scorecard";
  title: string;
  dataSource: "main_eval" | "clicks_dist" | "traffic_dist";
  series: ChartSeries[];
  xAxisKey?: string;
  yAxisKey?: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface TableData {
  headers: string[];
  rows: (string | number)[][];
  highlightClientRow?: boolean;
}

export interface NavData {
  current: IANavItem[];
  future: IANavItem[];
}

export interface IABlueprintData {
  hubs: IAHubPage[];
  additionalHubs?: IAHubPage[];
}

export interface CitationTrace {
  sourceSheet: string;
  sourceFields?: string[];
  generatedAt: string;
  metricKeys?: string[];
}

export interface MidStrategyDeckPayload {
  clientName: string;
  reportDate: string;
  preparedBy: string;
  slides: SlideContent[];
  competitorRows: any[];
  clicksDist: any[];
  trafficDist: any[];
  summaryStats: {
    clientRank: number;
    totalCompetitors: number;
    percentile: number;
    clientPercentileLabel: string;
  };
  evalBatchId: number;
  evalBatchName: string;
}

// ─── Default IA Structure (Bliss template) ───────────────────────────────────

export function defaultIAStructure(clientName: string): IAStructure {
  const currentNav: IANavItem[] = [
    { id: "home", label: "Home", slug: "/", order: 0, type: "normal", visible: true },
    { id: "about", label: "About Us", slug: "/about", order: 1, type: "dropdown", visible: true },
    { id: "programs", label: "Programs", slug: "/programs", order: 2, type: "dropdown", visible: true },
    { id: "blog", label: "Blog", slug: "/blog", order: 3, type: "normal", visible: true },
    { id: "contact", label: "Contact", slug: "/contact", order: 4, type: "cta", visible: true },
  ];

  const futureNav: IANavItem[] = [
    { id: "home", label: "Home", slug: "/", order: 0, type: "normal", visible: true },
    { id: "programs", label: "Programs", slug: "/programs", order: 1, type: "dropdown", visible: true },
    { id: "what-we-treat", label: "What We Treat", slug: "/what-we-treat", order: 2, type: "dropdown", visible: true },
    { id: "admissions", label: "Admissions", slug: "/admissions", order: 3, type: "dropdown", visible: true },
    { id: "about", label: "About", slug: "/about", order: 4, type: "dropdown", visible: true },
    { id: "resources", label: "Resources", slug: "/resources", order: 5, type: "dropdown", visible: true },
    { id: "verify", label: "Verify Insurance", slug: "/verify-insurance", order: 6, type: "cta", emphasis: "primary", visible: true },
  ];

  const contentHubs: IAHubPage[] = [
    {
      slug: "/programs/",
      label: "Programs",
      children: [
        { slug: "detox/", label: "Detox" },
        { slug: "residential/", label: "Residential" },
        { slug: "php/", label: "PHP" },
        { slug: "iop/", label: "IOP" },
        { slug: "aftercare-alumni/", label: "Aftercare & Alumni" },
        { slug: "family-support/", label: "Family Support" },
      ],
    },
    {
      slug: "/what-we-treat/",
      label: "What We Treat",
      children: [
        {
          slug: "substance-use/",
          label: "Substance Use",
          subChildren: [
            { slug: "alcohol/", label: "Alcohol" },
            { slug: "cocaine/", label: "Cocaine" },
            { slug: "benzodiazepines/", label: "Benzodiazepines" },
            { slug: "fentanyl/", label: "Fentanyl" },
            { slug: "heroin/", label: "Heroin" },
            { slug: "prescription-drugs/", label: "Prescription Drugs" },
            { slug: "marijuana/", label: "Marijuana" },
            { slug: "methamphetamine/", label: "Methamphetamine" },
          ],
        },
        {
          slug: "co-occurring-disorders/",
          label: "Co-Occurring Disorders",
          subChildren: [
            { slug: "depression/", label: "Depression" },
            { slug: "anxiety/", label: "Anxiety" },
            { slug: "ptsd/", label: "PTSD" },
            { slug: "bipolar-disorder/", label: "Bipolar Disorder" },
            { slug: "adhd/", label: "ADHD" },
            { slug: "obsessive-compulsive-disorder/", label: "OCD" },
            { slug: "schizophrenia/", label: "Schizophrenia" },
            { slug: "borderline-personality-disorder/", label: "BPD" },
          ],
        },
      ],
    },
    {
      slug: "/admissions/",
      label: "Admissions",
      children: [
        { slug: "start-here/", label: "Start Here" },
        { slug: "verify-insurance/", label: "Verify Insurance" },
        { slug: "insurance-cost/", label: "Insurance & Cost" },
        { slug: "what-to-bring/", label: "What to Bring" },
        { slug: "travel-planning/", label: "Travel Planning" },
        { slug: "frequently-asked-questions/", label: "FAQs" },
        { slug: "contact-admissions/", label: "Contact Admissions" },
      ],
    },
  ];

  const aboutSubpages = [
    { slug: "our-mission/", label: "Our Mission" },
    { slug: "our-staff/", label: "Our Staff" },
    { slug: "our-locations/", label: "Our Locations" },
    { slug: "luxury-experience/", label: "Luxury Experience" },
    { slug: "facility-tour/", label: "Facility Tour" },
  ];

  const resourcesSubpages = [
    { slug: "blog/", label: "Blog" },
    { slug: "frequently-asked-questions/", label: "FAQs" },
    { slug: "family-resources/", label: "Family Resources" },
    { slug: "recovery-resources/", label: "Recovery Resources" },
  ];

  return { currentNav, futureNav, contentHubs, aboutSubpages, resourcesSubpages };
}

// ─── Narrative generators ─────────────────────────────────────────────────────

function generateCompSlide4Narrative(clientRow: any, allRows: any[], clientName: string): EditableBlock[] {
  const clientDr = clientRow?.metrics?.dr ?? DASH;
  const clientBacklinks = clientRow?.metrics?.backlinks ?? DASH;
  const clientRd = clientRow?.metrics?.referringDomains ?? DASH;
  const clientPages = clientRow?.metrics?.indexedPages ?? DASH;
  const clientRank = clientRow?.ranks?.dr ?? DASH;
  const totalRows = allRows.length;

  return [
    { key: "slide4_kicker", label: "Kicker", value: `${clientName.toUpperCase()} COMPETITIVE ANALYSIS BASELINE`, type: "kicker" },
    { key: "slide4_heading", label: "Heading", value: "Where you stand vs. everybody else", type: "heading" },
    {
      key: "slide4_narrative",
      label: "Narrative",
      value: clientRank !== DASH
        ? `${clientName} carries strong backlink credibility (DR: ${clientDr}, ${clientRd} referring domains), ranking #${clientRank} for domain authority across the competitive set. However, the site has relatively few indexed pages compared to competitors, limiting entry points for Google to rank across treatment and admissions-related searches.`
        : `${clientName} has ${clientBacklinks !== DASH ? clientBacklinks + " backlinks" : "backlink data pending"} and ${clientRd !== DASH ? clientRd + " referring domains" : "referring domain data pending"}. The site currently has limited indexed pages relative to the competitive set.`,
      type: "paragraph",
    },
    {
      key: "slide4_opportunity",
      label: "Our Opportunity",
      value: "Expand targeted Programs, Conditions, and Demand Generation content to convert existing authority into significantly more search visibility.",
      type: "opportunity",
    },
  ];
}

function generateCompSlide5Narrative(clientRow: any, allRows: any[], clientName: string): EditableBlock[] {
  const clientKw = clientRow?.metrics?.organicKeywords ?? DASH;
  const clientTop10 = clientRow?.metrics?.top10Keywords ?? DASH;
  const clientPages = clientRow?.metrics?.indexedPages ?? DASH;
  const clientContentYield = clientRow?.computed?.contentYield ?? DASH;

  return [
    { key: "slide5_kicker", label: "Kicker", value: `${clientName.toUpperCase()} COMPETITIVE ANALYSIS BASELINE`, type: "kicker" },
    { key: "slide5_heading", label: "Heading", value: "Where you stand vs. everybody else", type: "heading" },
    {
      key: "slide5_narrative",
      label: "Narrative",
      value: `${clientName} is generating ${clientPages !== DASH ? clientPages + " indexed pages" : "pages"}, but they aren't yet translating into strong keyword ownership. With ${clientKw !== DASH ? clientKw + " organic keywords" : "organic keywords pending"} and ${clientTop10 !== DASH ? clientTop10 + " Top 10 rankings" : "Top 10 keyword data pending"}, the existing content isn't yet capturing the most competitive or high-intent searches.`,
      type: "paragraph",
    },
    {
      key: "slide5_opportunity",
      label: "Our Opportunity",
      value: "Focus new and existing pages around high-intent treatment, condition, and demand generation keywords so each page is built to capture engagement, not just add volume.",
      type: "opportunity",
    },
  ];
}

function generateCompSlide6Narrative(clientRow: any, allRows: any[], clientName: string): EditableBlock[] {
  const clientAI = clientRow?.metrics?.aiVisibilityScore ?? DASH;
  const clientMentions = clientRow?.metrics?.aiMentions ?? DASH;
  const clientCited = clientRow?.metrics?.citedSources ?? DASH;
  const clientMentionRate = clientRow?.computed?.mentionRate ?? DASH;

  return [
    { key: "slide6_kicker", label: "Kicker", value: `${clientName.toUpperCase()} COMPETITIVE ANALYSIS BASELINE`, type: "kicker" },
    { key: "slide6_heading", label: "Heading", value: "Where you stand vs. everybody else", type: "heading" },
    {
      key: "slide6_narrative",
      label: "Narrative",
      value: `${clientName} currently has ${clientAI !== DASH ? "an AI Visibility Score of " + clientAI : "limited AI visibility data"} and ${clientMentions !== DASH ? clientMentions + " AI mentions" : "low mention rates"}, reducing its exposure in both AI-driven results and traditional SERP features. Several competitors have strong AI visibility and citation rates, meaning their content is being referenced frequently in AI-generated answers.`,
      type: "paragraph",
    },
    {
      key: "slide6_opportunity",
      label: "Our Opportunity",
      value: "Structure key pages with clear answers, definitions, and treatment explanations to increase citations in AI results and win more featured snippets.",
      type: "opportunity",
    },
  ];
}

function generateCompSlide7Narrative(clientRow: any, allRows: any[], clientName: string): EditableBlock[] {
  const totalRows = allRows.length;
  const avgRankNum = parseNum(clientRow?.ranks?.averageRank ?? clientRow?.computed?.averageRank);
  const percentile = avgRankNum > 0 && totalRows > 0
    ? Math.round(((totalRows - avgRankNum) / totalRows) * 100)
    : null;

  return [
    { key: "slide7_kicker", label: "Kicker", value: `${clientName.toUpperCase()} COMPETITIVE ANALYSIS BASELINE`, type: "kicker" },
    { key: "slide7_heading", label: "Heading", value: "Where you stand vs. everybody else", type: "heading" },
    {
      key: "slide7_narrative",
      label: "Narrative",
      value: percentile !== null
        ? `Across all key metrics — authority, visibility, and AI readiness — ${clientName} currently ranks at the ${percentile}th percentile, giving us a clear benchmark for where to close the gap. The data shows our fastest growth levers are trust and content depth.`
        : `Across all key metrics — authority, visibility, and AI readiness — ${clientName} has a clear opportunity to close the gap with top competitors. The data shows our fastest growth levers are trust and content depth.`,
      type: "paragraph",
    },
    {
      key: "slide7_growth_levers",
      label: "Growth Levers",
      value: "Not just more pages, but smarter ones that earn visibility and trust across both traditional and AI search.",
      type: "paragraph",
    },
  ];
}

function generateClicksDistNarrative(distRows: any[], clientName: string): EditableBlock[] {
  const sorted = [...distRows].sort((a, b) => (b.shareOfClicks ?? 0) - (a.shareOfClicks ?? 0));
  const homeRow = distRows.find(r => r.category === "Home");
  const homeShare = homeRow?.shareOfClicks ?? 0;
  const totalClicks = distRows.reduce((s, r) => s + (r.sumClicks ?? 0), 0);
  const homeClicks = homeRow?.sumClicks ?? 0;

  const bullets: string[] = [];
  if (homeRow) {
    bullets.push(`Homepage drives ${homeClicks} of ${totalClicks} total clicks (${Math.round(homeShare)}%), indicating organic traffic is heavily driven by branded searches. Most site content is not currently capturing meaningful organic visibility.`);
  }
  const blogRow = distRows.find(r => r.category === "Blogs");
  if (blogRow) {
    bullets.push(`Blog posts contribute ${Math.round(blogRow.shareOfClicks ?? 0)}% of clicks across ${blogRow.numPages} pages, suggesting individual articles are not ranking or capturing search demand. Informational content represents a clear opportunity to grow non-brand traffic.`);
  }
  const otherTotal = distRows.filter(r => r.category !== "Home").reduce((s, r) => s + (r.shareOfClicks ?? 0), 0);
  if (homeRow) {
    bullets.push(`All other page types combined generate only ${Math.round(otherTotal)}% of clicks despite representing the majority of the site's pages.`);
  }

  return [
    {
      key: "clicks_dist_heading",
      label: "Heading",
      value: `Homepage Drives ${homeRow ? Math.round(homeShare) + "%" : "the majority"} of Organic Clicks`,
      type: "heading",
    },
    {
      key: "clicks_dist_bullets",
      label: "Insight Bullets",
      value: bullets.join("\n\n"),
      type: "bullet_list",
    },
  ];
}

function generateTrafficDistNarrative(distRows: any[], clientName: string): EditableBlock[] {
  const sorted = [...distRows].sort((a, b) => (b.sessionsPerPage ?? 0) - (a.sessionsPerPage ?? 0));
  const careRow = distRows.find(r => r.category === "Care access");
  const blogRow = distRows.find(r => r.category === "Blogs");
  const conditionsRow = distRows.find(r => r.category === "Conditions");
  const mhRow = distRows.find(r => r.category === "MH Conditions");
  const modalitiesRow = distRows.find(r => r.category === "Modalities");

  const bullets: string[] = [];
  if (careRow) {
    bullets.push(`Care access pages generate ${Math.round(careRow.shareOfSessions ?? 0)}% of sessions from only ${careRow.numPages} pages (${Math.round(careRow.sessionsPerPage ?? 0)} sessions/page). High-intent contact/verify insurance pages perform strongly and appear to capture users wanting to get in touch.`);
  }
  if (blogRow) {
    bullets.push(`Blog content accounts for ${Math.round(blogRow.shareOfSessions ?? 0)}% of sessions, but most traffic is concentrated on the /blog index page rather than individual posts. Individual blog articles currently capture very little organic visibility.`);
  }
  const condShare = Math.round(((conditionsRow?.shareOfSessions ?? 0) + (mhRow?.shareOfSessions ?? 0) + (modalitiesRow?.shareOfSessions ?? 0)));
  if (condShare > 0) {
    bullets.push(`Condition and modality pages contribute ${condShare}% of sessions combined. These pages represent important mid-funnel opportunities to capture condition and treatment-related searches and guide users toward care access pages.`);
  }

  return [
    {
      key: "traffic_dist_heading",
      label: "Heading",
      value: "A Small Set of Pages Drives a Large Share of All Sessions",
      type: "heading",
    },
    {
      key: "traffic_dist_bullets",
      label: "Insight Bullets",
      value: bullets.length > 0 ? bullets.join("\n\n") : "Session distribution data will populate once crawl and GA4 data are linked.",
      type: "bullet_list",
    },
  ];
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateMidStrategyDeck(
  deckId: number,
  existingEdits?: Record<string, string>,
): Promise<MidStrategyDeckPayload> {
  const deck = await storage.getMidStrategyDeck(deckId);
  if (!deck) throw new Error("Mid-strategy deck not found");

  const client = await storage.getClient(deck.clientId);
  if (!client) throw new Error("Client not found");

  const clientName = client.name;
  const generatedAt = new Date().toISOString();

  // Get eval batch data if linked
  let evalBatch: EvalBatch | undefined;
  let competitorRows: EvalCompetitorRow[] = [];
  let clicksDist: any[] = [];
  let trafficDist: any[] = [];

  if (deck.evalBatchId) {
    evalBatch = await storage.getEvalBatch(deck.evalBatchId);
    competitorRows = await storage.getEvalCompetitorRows(deck.evalBatchId);

    // Build competitor rows with computed metrics and ranks
    const rowsWithComputed = competitorRows.map(r => ({
      ...r,
      computed: computeDerivedMetrics({ ...((r.metrics as any) ?? {}), ...((r.computed as any) ?? {}) }),
    }));
    const ranks = computeRanks(rowsWithComputed.map(r => ({ metrics: r.metrics, computed: r.computed })));
    competitorRows = rowsWithComputed.map((r, i) => ({ ...r, ranks: ranks[i] })) as any;

    // Summary tables
    const clicksRows = await storage.getEvalSummaryRows(deck.evalBatchId, "clicks_dist");
    const trafficRows = await storage.getEvalSummaryRows(deck.evalBatchId, "traffic_dist");
    clicksDist = clicksRows.map(r => ({ category: r.category, ...(r.data as any) }));
    trafficDist = trafficRows.map(r => ({ category: r.category, ...(r.data as any) }));
  }

  // Find client row
  const clientRow = competitorRows.find(r => r.isClient);
  const allRowCount = competitorRows.length;
  const clientAvgRank = parseNum(clientRow?.ranks?.averageRank ?? DASH);
  const percentile = clientAvgRank > 0 && allRowCount > 0
    ? Math.round(((allRowCount - clientAvgRank) / allRowCount) * 100)
    : 10;

  const summaryStats = {
    clientRank: clientAvgRank || allRowCount,
    totalCompetitors: allRowCount,
    percentile,
    clientPercentileLabel: percentile <= 25 ? "bottom quartile" : percentile <= 50 ? "middle of the pack" : percentile <= 75 ? "above average" : "top quartile",
  };

  // ─── Build slides ────────────────────────────────────────────────────────────

  const slides: SlideContent[] = [];

  // Slide 1: Title
  slides.push({
    id: "slide_title",
    type: "title",
    title: "Content & SEO Mid-Strategy Check-in",
    subtitle: clientName,
    narrativeBlocks: [
      { key: "title_client_name", label: "Client Name", value: clientName, type: "heading" },
      { key: "title_tagline", label: "Tagline", value: "Building durable organic performance with purpose.", type: "paragraph" },
      { key: "title_date", label: "Date", value: deck.reportDate || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), type: "date" },
      { key: "title_prepared_by", label: "Prepared By", value: deck.preparedBy || "—", type: "prepared_by" },
    ],
    citationTrace: { sourceSheet: "deck_meta", generatedAt },
  });

  // Slide 2: Agenda
  slides.push({
    id: "slide_agenda",
    type: "agenda",
    title: "What's in this deck",
    narrativeBlocks: [
      { key: "agenda_items", label: "Agenda Items", value: "• Competitive Benchmarking\n• First Core Focus: Structural Cleanup for the navigation menu\n• What's next", type: "bullet_list" },
      { key: "agenda_next_checkpoint_title", label: "Next Checkpoint Title", value: "Our Next Checkpoint", type: "heading" },
      { key: "agenda_next_checkpoint_subtitle", label: "Next Checkpoint Date", value: "Launch Strategy & Roadmap Review - Date TBD (2 weeks from now)", type: "paragraph" },
    ],
    citationTrace: { sourceSheet: "deck_meta", generatedAt },
  });

  // Slide 3: Our Next Checkpoint
  slides.push({
    id: "slide_checkpoint",
    type: "checkpoint",
    title: "Our Next Checkpoint",
    narrativeBlocks: [
      { key: "checkpoint_event", label: "Event Name", value: "Launch Strategy & Roadmap Review - Date TBD (2 weeks from now)", type: "heading" },
      {
        key: "checkpoint_bullets",
        label: "Checkpoint Items",
        value: "• Finalizes goals, North Star Metrics, and success benchmarks\n• Aligns on the execution plan across content, SEO, and site improvements\n• Confirms launch-ready priorities for the next phase\n• Signals the transition from planning → active execution",
        type: "bullet_list",
      },
    ],
    citationTrace: { sourceSheet: "deck_meta", generatedAt },
  });

  // Slides 4–7: Competitive Analysis
  const compSlideThemes = [
    { id: "slide_comp_authority", key: "authority", title: "Where you stand vs. everybody else", theme: "Authority exists but is underdeployed.", chartKey: "authority" },
    { id: "slide_comp_keywords", key: "keywords", title: "Where you stand vs. everybody else", theme: "Pages exist, but keyword ownership is weak.", chartKey: "keywords" },
    { id: "slide_comp_ai", key: "ai", title: "Where you stand vs. everybody else", theme: "Low AI visibility and citation presence.", chartKey: "ai" },
    { id: "slide_comp_summary", key: "summary", title: "Where you stand vs. everybody else", theme: "Overall market position summary.", chartKey: "summary" },
  ];

  const compNarratives = [
    generateCompSlide4Narrative(clientRow, competitorRows, clientName),
    generateCompSlide5Narrative(clientRow, competitorRows, clientName),
    generateCompSlide6Narrative(clientRow, competitorRows, clientName),
    generateCompSlide7Narrative(clientRow, competitorRows, clientName),
  ];

  const compCharts: ChartConfig[] = [
    {
      type: "bar",
      title: "Authority & Traffic Comparison",
      dataSource: "main_eval",
      series: [
        { key: "dr", label: "DR", color: "#dc2626" },
        { key: "organicTraffic", label: "Organic Traffic", color: "#2563eb" },
        { key: "indexedPages", label: "Indexed Pages", color: "#16a34a" },
      ],
    },
    {
      type: "bar",
      title: "Content & Keyword Comparison",
      dataSource: "main_eval",
      series: [
        { key: "indexedPages", label: "Indexed Pages", color: "#dc2626" },
        { key: "top10Keywords", label: "Top 10 Keywords", color: "#2563eb" },
        { key: "organicKeywords", label: "Organic Keywords", color: "#16a34a" },
      ],
    },
    {
      type: "bar",
      title: "AI Visibility Comparison",
      dataSource: "main_eval",
      series: [
        { key: "aiVisibilityScore", label: "AI Visibility Score", color: "#dc2626" },
        { key: "aiMentions", label: "AI Mentions", color: "#2563eb" },
        { key: "featuredSnippets", label: "Featured Snippets", color: "#16a34a" },
      ],
    },
    {
      type: "scorecard",
      title: "Overall Competitive Position",
      dataSource: "main_eval",
      series: [{ key: "averageRank", label: "Average Rank" }],
    },
  ];

  compSlideThemes.forEach((theme, i) => {
    slides.push({
      id: theme.id,
      type: "comp_analysis",
      title: theme.title,
      kicker: theme.theme,
      narrativeBlocks: compNarratives[i],
      chartConfig: compCharts[i],
      citationTrace: { sourceSheet: "main_evaluation", metricKeys: compCharts[i].series.map(s => s.key), generatedAt },
    });
  });

  // Slide 8: Clicks Distribution
  slides.push({
    id: "slide_clicks_dist",
    type: "clicks_dist",
    title: "Organic Click Distribution by Page Category",
    narrativeBlocks: generateClicksDistNarrative(clicksDist, clientName),
    chartConfig: {
      type: "scatter",
      title: "Share of Google Clicks by Page Category",
      dataSource: "clicks_dist",
      series: [{ key: "shareOfClicks", label: "Share of GSC Clicks (%)" }],
      xAxisKey: "shareOfClicks",
      yAxisKey: "numPages",
    },
    tableData: {
      headers: ["Page Category", "# of Pages", "Sum of Clicks", "Clicks per Page", "Share of GSC Clicks"],
      rows: clicksDist.map(r => [r.category, r.numPages ?? 0, r.sumClicks ?? 0, r.clicksPerPage ?? 0, `${r.shareOfClicks ?? 0}%`]),
    },
    citationTrace: { sourceSheet: "clicks_distribution", sourceFields: ["category", "numPages", "sumClicks", "shareOfClicks"], generatedAt },
  });

  // Slide 9: Traffic Distribution
  slides.push({
    id: "slide_traffic_dist",
    type: "traffic_dist",
    title: "Session Distribution by Page Category",
    narrativeBlocks: generateTrafficDistNarrative(trafficDist, clientName),
    chartConfig: {
      type: "scatter",
      title: "Share of Sessions by Page Category",
      dataSource: "traffic_dist",
      series: [{ key: "shareOfSessions", label: "Share of Sessions (%)" }],
      xAxisKey: "shareOfSessions",
      yAxisKey: "numPages",
    },
    tableData: {
      headers: ["Page Category", "# of Pages", "Sum of Total Sessions", "Sessions per Page", "Share of Sessions"],
      rows: trafficDist.map(r => [r.category, r.numPages ?? 0, r.sumSessions ?? 0, r.sessionsPerPage ?? 0, `${r.shareOfSessions ?? 0}%`]),
    },
    citationTrace: { sourceSheet: "traffic_distribution", sourceFields: ["category", "numPages", "sumSessions", "shareOfSessions"], generatedAt },
  });

  // Slide 10: First Priorities
  slides.push({
    id: "slide_first_prios",
    type: "priorities",
    title: "First Priorities",
    narrativeBlocks: [
      { key: "prios_heading", label: "Section Heading", value: "Your SEO growth depends on building the missing middle of the funnel.", type: "heading" },
      {
        key: "prio_1_title",
        label: "Priority 1 Title",
        value: "1. Build the Middle of the Funnel (Conditions → Programs → Admissions)",
        type: "heading",
      },
      {
        key: "prio_1_body",
        label: "Priority 1 Body",
        value: `Right now the site jumps from brand search → homepage, with very little supporting content guiding users toward treatment. Expanding condition and program pages that lead into care access will create the funnel Google expects for treatment searches.`,
        type: "paragraph",
      },
      {
        key: "prio_2_title",
        label: "Priority 2 Title",
        value: "2. Turn the Blog Into a Discovery Engine",
        type: "heading",
      },
      {
        key: "prio_2_body",
        label: "Priority 2 Body",
        value: `${clientName} already has one of the strongest domain authorities in the competitive set, which means new content has a higher chance of ranking quickly. By rebuilding the blog around informational searches tied to conditions, symptoms, and treatment questions, ${clientName} can use that authority to capture non-brand discovery traffic and guide users into condition and admissions pages.`,
        type: "paragraph",
      },
      {
        key: "prio_3_title",
        label: "Priority 3 Title",
        value: "3. Structure Content to Win AI & SERP Visibility",
        type: "heading",
      },
      {
        key: "prio_3_body",
        label: "Priority 3 Body",
        value: "Competitors are appearing more in AI answers and search features. Key pages should be structured with clear definitions, FAQs, and direct answers so the site can earn citations, snippets, and AI visibility.",
        type: "paragraph",
      },
    ],
    citationTrace: { sourceSheet: "clicks_distribution,traffic_distribution,main_evaluation", generatedAt },
  });

  // Get or build IA structure
  const iaStructure: IAStructure = (deck.iaStructureJson as IAStructure) ?? defaultIAStructure(clientName);

  // Slide 11: Current vs Future Navigation
  slides.push({
    id: "slide_nav_ia",
    type: "nav_ia",
    title: "Current vs Future Navigation",
    narrativeBlocks: [
      {
        key: "nav_ia_intro",
        label: "Introduction",
        value: "Our goal: improve both usability and search performance. The new IA moves up the most important parts of the site to the top level (Programs / What We Treat / Admissions). These map to real searches and support stronger internal linking—helping key pages rank, earn snippets, and convert.",
        type: "paragraph",
      },
    ],
    navData: { current: iaStructure.currentNav, future: iaStructure.futureNav },
    citationTrace: { sourceSheet: "ia_structure_manual", generatedAt },
  });

  // Slide 12: IA Blueprint
  slides.push({
    id: "slide_ia_blueprint",
    type: "ia_blueprint",
    title: "A scalable blueprint for what we publish next.",
    narrativeBlocks: [
      {
        key: "ia_blueprint_intro",
        label: "Introduction",
        value: `We'll build out ${clientName}'s top-level hubs in the order that best supports rankings, internal linking, and admissions—starting with Programs, What We Treat, and Admissions, then expanding trust-supporting content in About and Resources.`,
        type: "paragraph",
      },
    ],
    iaBlueprintData: { hubs: iaStructure.contentHubs },
    citationTrace: { sourceSheet: "ia_structure_manual", generatedAt },
  });

  // Slide 13: About + Resources Credibility Layer
  slides.push({
    id: "slide_ia_credibility",
    type: "ia_credibility",
    title: "About + Resources are the credibility layer.",
    narrativeBlocks: [
      {
        key: "credibility_intro",
        label: "Introduction",
        value: "About consolidates core EEAT signals—team, standards, accreditation, and outcomes—so trust is easy to verify. Resources extends that authority through helpful, structured content (blog, FAQs, continuing education, media coverage) that answers real questions and supports search visibility over time.",
        type: "paragraph",
      },
      {
        key: "about_subpages",
        label: "About Subpages",
        value: iaStructure.aboutSubpages.map(p => `/${p.slug}`).join("\n"),
        type: "bullet_list",
      },
      {
        key: "resources_subpages",
        label: "Resources Subpages",
        value: iaStructure.resourcesSubpages.map(p => `/${p.slug}`).join("\n"),
        type: "bullet_list",
      },
    ],
    iaBlueprintData: {
      hubs: [
        { slug: "/about/", label: "About", children: iaStructure.aboutSubpages.map(p => ({ slug: p.slug, label: p.label })) },
        { slug: "/resources/", label: "Resources", children: iaStructure.resourcesSubpages.map(p => ({ slug: p.slug, label: p.label })) },
      ],
    },
    citationTrace: { sourceSheet: "ia_structure_manual", generatedAt },
  });

  // Slide 14: What's Next
  slides.push({
    id: "slide_whats_next",
    type: "whats_next",
    title: "What's Next",
    narrativeBlocks: [
      { key: "webserv_heading", label: "Webserv Section Heading", value: "Webserv:", type: "heading" },
      {
        key: "webserv_item_1",
        label: "Webserv Action 1",
        value: "Continued content and technical remediation planning: We're doing keyword research and evaluating your pages to figure out how to tackle our top priorities within your current scope.",
        type: "whats_next_item",
      },
      {
        key: "webserv_item_2",
        label: "Webserv Action 2",
        value: "Local SEO & visibility foundations: As we move beyond initial cleanup and core service work, we'll also begin laying the groundwork for local SEO initiatives, including location relevance, GBP optimization, and supporting infrastructure.",
        type: "whats_next_item",
      },
      { key: "client_heading", label: "Client Section Heading", value: `${clientName} Team:`, type: "heading" },
      {
        key: "client_item_1",
        label: "Client Action 1",
        value: "Confirm the proposed long-term site structure: Ensure this organization reflects how you want your services and offerings to be understood over time.",
        type: "whats_next_item",
      },
    ],
    citationTrace: { sourceSheet: "manual", generatedAt },
  });

  // Apply existing edits (do not overwrite manually edited blocks)
  if (existingEdits && Object.keys(existingEdits).length > 0) {
    for (const slide of slides) {
      for (const block of slide.narrativeBlocks) {
        if (existingEdits[block.key] !== undefined) {
          block.value = existingEdits[block.key];
        }
      }
      // Apply nav/IA edits
      if (existingEdits[`${slide.id}_nav_current`]) {
        try { slide.navData = { ...(slide.navData ?? { current: [], future: [] }), current: JSON.parse(existingEdits[`${slide.id}_nav_current`]) }; } catch {}
      }
      if (existingEdits[`${slide.id}_nav_future`]) {
        try { slide.navData = { ...(slide.navData ?? { current: [], future: [] }), future: JSON.parse(existingEdits[`${slide.id}_nav_future`]) }; } catch {}
      }
    }
  }

  return {
    clientName,
    reportDate: deck.reportDate,
    preparedBy: deck.preparedBy,
    slides,
    competitorRows: competitorRows.map(r => ({
      name: r.name,
      websiteUrl: r.websiteUrl,
      isClient: r.isClient,
      metrics: r.metrics,
      computed: r.computed,
      ranks: r.ranks,
    })),
    clicksDist,
    trafficDist,
    summaryStats,
    evalBatchId: deck.evalBatchId ?? 0,
    evalBatchName: evalBatch?.evaluationName ?? "",
  };
}
