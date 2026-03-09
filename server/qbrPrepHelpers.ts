import type { Client } from "@shared/schema";

export interface QuarterInfo {
  currentQ: number;
  currentYear: number;
  analysisStart: string;
  analysisEnd: string;
  planningQ: number;
  planningYear: number;
  analysisWindowLabel: string;
  planningQuarterLabel: string;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function quarterStart(q: number, year: number): Date {
  const months = [0, 3, 6, 9];
  return new Date(year, months[q - 1], 1);
}

export function inferQuarter(generationDate: Date): QuarterInfo {
  const month = generationDate.getMonth() + 1;
  const year = generationDate.getFullYear();
  const currentQ = Math.ceil(month / 3) as 1 | 2 | 3 | 4;

  const analysisStart = fmt(quarterStart(currentQ, year));
  const analysisEnd = fmt(generationDate);

  let planningQ = currentQ + 1;
  let planningYear = year;
  if (planningQ > 4) {
    planningQ = 1;
    planningYear = year + 1;
  }

  return {
    currentQ,
    currentYear: year,
    analysisStart,
    analysisEnd,
    planningQ,
    planningYear,
    analysisWindowLabel: `Q${currentQ} ${year} (through ${analysisEnd})`,
    planningQuarterLabel: `Q${planningQ} ${planningYear}`,
  };
}

export function formatReportName(
  clientName: string,
  planningQ: number,
  planningYear: number,
  generatedOn: string
): string {
  return `QBR Prep - ${clientName} - Q${planningQ} ${planningYear} - Generated ${generatedOn}`;
}

export function isBrandedQuery(query: string, client: Client): boolean {
  const q = query.toLowerCase().trim();
  const brandTerms = (client.brandTerms ?? []).map(t => t.toLowerCase());
  if (brandTerms.length === 0) {
    const nameParts = client.name.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    brandTerms.push(...nameParts);
    brandTerms.push(client.name.toLowerCase().replace(/\s+/g, ""));
  }
  return brandTerms.some(b => q.includes(b));
}

const PAGE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /verify.?insurance|vob|verification.?of.?benefits/i, type: "Verify Insurance" },
  { pattern: /contact|admissions|get.?help|reach.?out|intake/i, type: "Contact / Admissions" },
  { pattern: /detox|detoxification/i, type: "Detox" },
  { pattern: /residential|inpatient/i, type: "Residential / Inpatient" },
  { pattern: /php|iop|partial.?hospitalization|intensive.?outpatient/i, type: "PHP / IOP" },
  { pattern: /outpatient(?!.*intensive)/i, type: "Outpatient" },
  { pattern: /dual.?diagnosis|co.?occurring/i, type: "Dual Diagnosis" },
  { pattern: /sober.?living|aftercare|alumni/i, type: "Aftercare / Alumni" },
  { pattern: /about|our.?team|leadership|staff/i, type: "About / Team" },
  { pattern: /blog|article|resource|guide/i, type: "Blog / Resource" },
  { pattern: /therap|cbt|dbt|emdr|holistic/i, type: "Therapies" },
  { pattern: /depression|anxiety|ptsd|trauma|bipolar|mental.?health/i, type: "Conditions" },
  { pattern: /alcohol|drug|heroin|opioid|cocaine|meth|benzo|fentanyl/i, type: "Substance-Specific" },
  { pattern: /women|men|gender|lgbtq|veteran/i, type: "Population-Specific" },
  { pattern: /location|campus|facility|tour/i, type: "Location" },
];

export function classifyPageType(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, "").toLowerCase();
  for (const { pattern, type } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(path)) return type;
  }
  if (path === "/" || path === "") return "Homepage";
  return "Other";
}

export function classifyAdmitConnection(
  pageType: string,
  conversions: number,
  totalConversions: number
): string {
  const directTypes = ["Verify Insurance", "Contact / Admissions", "Detox", "Residential / Inpatient", "PHP / IOP"];
  const assistedTypes = ["Dual Diagnosis", "Therapies", "Conditions", "Substance-Specific", "Population-Specific", "Location"];

  if (directTypes.includes(pageType)) return "Direct";
  if (assistedTypes.includes(pageType) && conversions > 0) return "Assisted";
  if (pageType === "Blog / Resource") return "Weak";
  if (conversions > 0 && totalConversions > 0 && conversions / totalConversions > 0.05) return "Assisted";
  return "Unclear";
}

const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /detox|detoxification|withdrawal/i, topic: "Detox" },
  { pattern: /residential|inpatient|rehab\b(?!.*near)/i, topic: "Residential Treatment" },
  { pattern: /women|woman|female/i, topic: "Women's Rehab" },
  { pattern: /men(?:'s)?\s+rehab|male\s+rehab/i, topic: "Men's Rehab" },
  { pattern: /dual.?diagnosis|co.?occurring/i, topic: "Dual Diagnosis" },
  { pattern: /insurance|verify|vob|coverage/i, topic: "Insurance / Admissions" },
  { pattern: /php|iop|partial|intensive.?outpatient/i, topic: "PHP / IOP" },
  { pattern: /\bnear me\b|rehab\s+in\s+\w+|treatment\s+in\s+\w+|treatment\s+center\s+in\b/i, topic: "Local Intent" },
  { pattern: /review|testimonial|accreditation|rating|outcome/i, topic: "Trust / Evaluation" },
  { pattern: /about\s+us|our\s+team|meet\s+(the|our)|staff|leadership|who\s+we\s+are/i, topic: "Trust / Evaluation" },
  { pattern: /what is|how to|signs of|symptoms|effects|can you|does \w+ cause|is \w+ addictive/i, topic: "Informational / Education" },
  { pattern: /alcohol|drug|heroin|opioid|cocaine|meth|fentanyl|benzo|substance/i, topic: "Substance-Specific Education" },
  { pattern: /therap|cbt|dbt|emdr|holistic/i, topic: "Therapies" },
  { pattern: /depression|anxiety|ptsd|trauma|bipolar|mental.?health/i, topic: "Mental Health / Conditions" },
  { pattern: /sober.?living|aftercare|alumni|recovery\s+support/i, topic: "Aftercare / Continuum" },
  { pattern: /cost|pay|price|afford|financing/i, topic: "Insurance / Admissions" },
];

export function classifyQueryTopic(query: string, client: Client): string {
  if (isBrandedQuery(query, client)) return "Branded Navigation";
  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(query)) return topic;
  }
  return "Other";
}

export function clusterQueriesByTopic(
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  client: Client
): Map<string, Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  const clusters = new Map<string, typeof queries>();
  for (const q of queries) {
    const topic = classifyQueryTopic(q.query, client);
    if (!clusters.has(topic)) clusters.set(topic, []);
    clusters.get(topic)!.push(q);
  }
  return clusters;
}

export function topicAdmitConnection(topic: string): string {
  const directTopics = ["Detox", "Residential Treatment", "Insurance / Admissions", "PHP / IOP", "Local Intent"];
  const assistedTopics = ["Women's Rehab", "Men's Rehab", "Dual Diagnosis", "Substance-Specific Education", "Therapies", "Mental Health / Conditions", "Aftercare / Continuum"];
  const trustTopics = ["Trust / Evaluation"];
  const weakTopics = ["Informational / Education"];

  if (directTopics.includes(topic)) return "Direct";
  if (assistedTopics.includes(topic)) return "Assisted";
  if (trustTopics.includes(topic)) return "Trust / Evaluation";
  if (weakTopics.includes(topic)) return "Informational";
  if (topic === "Branded Navigation") return "Assisted";
  return "Informational";
}

export interface TierDiagnosisInput {
  sfData: Record<string, any>[];
  sfHeaders: string[];
  totalUrls: number;
  errors4xx5xx: number;
  redirects: number;
  nonIndexable: number;
  missingTitles: number;
  missingH1s: number;
  servicePageTypes: string[];
  hasVobPage: boolean;
  hasContactPage: boolean;
  hasDetoxPage: boolean;
  hasResidentialPage: boolean;
  hasConditionsHub: boolean;
  hasTherapiesHub: boolean;
  hasLocationPage: boolean;
  highIntentTrafficLandsOnClearUrls: boolean;
  duplicateServicePages: number;
  thinPages: number;
  overlapGeoPages: number;
  hasAboutPage: boolean;
  hasTeamPage: boolean;
  hasAlumniPage: boolean;
}

export interface TierDiagnosis {
  tier: number;
  tierName: string;
  diagnosis: string;
  evidence: string[];
}

const TIER_NAMES: Record<number, string> = {
  1: "Trust & Eligibility",
  2: "Structural Authority",
  3: "Consolidation & Cleanup",
  4: "Conversion & Differentiation",
  5: "Expansion & Demand Capture",
};

export function diagnoseTier(input: TierDiagnosisInput): TierDiagnosis {
  const evidence: string[] = [];

  const tier1Issues: string[] = [];
  if (!input.hasDetoxPage && !input.hasResidentialPage) {
    tier1Issues.push("Core service pages (detox, residential) appear missing or weak");
  }
  if (!input.hasVobPage) {
    tier1Issues.push("Verify Insurance / VOB page is missing — a dedicated VOB page is critical for admissions conversion");
  }
  if (!input.hasContactPage) {
    tier1Issues.push("Contact / admissions pathway is unclear or hard to reach");
  }
  if (!input.highIntentTrafficLandsOnClearUrls) {
    tier1Issues.push("High-intent service traffic does not land on clear primary URLs");
  }
  if (input.missingTitles > input.totalUrls * 0.1) {
    tier1Issues.push(`${input.missingTitles} pages missing titles — core pages may lack proper SEO fundamentals`);
  }

  if (tier1Issues.length > 0) {
    return {
      tier: 1,
      tierName: TIER_NAMES[1],
      diagnosis: `Site is currently blocked at Tier 1 — Trust & Eligibility. ${tier1Issues.join(". ")}. Until core service pages are strong, clear, and properly indexed, higher-tier work will not produce meaningful results.`,
      evidence: tier1Issues,
    };
  }

  const tier2Issues: string[] = [];
  if (!input.hasConditionsHub) {
    tier2Issues.push("No conditions hub structure to support authority flow into service pages");
  }
  if (!input.hasTherapiesHub) {
    tier2Issues.push("No therapies hub structure to organize treatment modalities");
  }
  if (input.missingH1s > 10) {
    tier2Issues.push(`${input.missingH1s} pages missing H1 tags — internal architecture lacks clear hierarchy`);
  }

  if (tier2Issues.length > 0) {
    return {
      tier: 2,
      tierName: TIER_NAMES[2],
      diagnosis: `Site is blocked at Tier 2 — Structural Authority. Core service pages exist, but ${tier2Issues.join(". ")}. Building hub structures and organizing internal architecture will unlock authority flow.`,
      evidence: tier2Issues,
    };
  }

  const tier3Issues: string[] = [];
  if (input.duplicateServicePages > 3) {
    tier3Issues.push(`${input.duplicateServicePages} duplicate or overlapping service pages creating cannibalization risk`);
  }
  if (input.thinPages > 15) {
    tier3Issues.push(`${input.thinPages} thin pages that may suppress crawl efficiency`);
  }
  if (input.overlapGeoPages > 5) {
    tier3Issues.push(`${input.overlapGeoPages} overlapping geo/location pages diluting authority`);
  }
  if (input.errors4xx5xx > 10) {
    tier3Issues.push(`${input.errors4xx5xx} error pages (4xx/5xx) creating structural drag`);
  }
  if (input.redirects > input.totalUrls * 0.15) {
    tier3Issues.push(`${input.redirects} redirects — legacy redirect chains may suppress growth`);
  }

  if (tier3Issues.length > 0) {
    return {
      tier: 3,
      tierName: TIER_NAMES[3],
      diagnosis: `Site is at Tier 3 — Consolidation & Cleanup. Core service pages and hub structure are mostly sound, but ${tier3Issues.join(". ")}. Cleanup and consolidation will remove drag on growth.`,
      evidence: tier3Issues,
    };
  }

  const tier4Issues: string[] = [];
  if (!input.hasAboutPage || !input.hasTeamPage) {
    tier4Issues.push("Comparison-stage pages (About, team, leadership) are weak or missing");
  }
  if (!input.hasAlumniPage) {
    tier4Issues.push("Aftercare and alumni credibility layers are not present");
  }

  if (tier4Issues.length > 0) {
    return {
      tier: 4,
      tierName: TIER_NAMES[4],
      diagnosis: `Site is at Tier 4 — Conversion & Differentiation. Technical foundation and authority structure are healthy. ${tier4Issues.join(". ")}. Strengthening these comparison-stage elements will improve conversion from consideration to admission.`,
      evidence: tier4Issues,
    };
  }

  return {
    tier: 5,
    tierName: TIER_NAMES[5],
    diagnosis: "Site is at Tier 5 — Expansion & Demand Capture. Core service pages, hub structure, cleanup, and differentiation layers are mostly healthy. Primary opportunity is informational expansion through blogs, FAQs, and demand capture content.",
    evidence: ["Tiers 1-4 are largely addressed", "Main growth lever is content expansion"],
  };
}

export function analyzeSfForTierInput(
  sfData: Record<string, any>[],
  sfHeaders: string[]
): Partial<TierDiagnosisInput> {
  const headersLower = sfHeaders.map(h => h.toLowerCase());
  const findCol = (...names: string[]) => {
    const lowerNames = names.map(n => n.toLowerCase());
    const idx = headersLower.findIndex(h => lowerNames.includes(h));
    return idx >= 0 ? sfHeaders[idx] : undefined;
  };

  const urlCol = findCol("address", "url") ?? sfHeaders[0] ?? "";
  const statusCol = findCol("status code", "status") ?? "";
  const indexCol = findCol("indexability") ?? "";
  const titleCol = findCol("title 1", "title", "page title") ?? "";
  const h1Col = findCol("h1-1", "h1") ?? "";
  const wordCountCol = findCol("word count") ?? "";

  const totalUrls = sfData.length;
  const errors4xx5xx = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 400).length : 0;
  const redirects = statusCol ? sfData.filter(r => { const s = Number(r[statusCol]); return s >= 300 && s < 400; }).length : 0;
  const nonIndexable = indexCol ? sfData.filter(r => r[indexCol] && String(r[indexCol]).toLowerCase() !== "indexable").length : 0;
  const missingTitles = titleCol ? sfData.filter(r => !r[titleCol] || String(r[titleCol]).trim() === "").length : 0;
  const missingH1s = h1Col ? sfData.filter(r => !r[h1Col] || String(r[h1Col]).trim() === "").length : 0;
  const thinPages = wordCountCol ? sfData.filter(r => {
    const wc = parseInt(String(r[wordCountCol] ?? "0").replace(/[^0-9]/g, ""), 10);
    return wc > 0 && wc < 200;
  }).length : 0;

  const urls = sfData.map(r => String(r[urlCol] ?? "").toLowerCase());

  const hasVobPage = urls.some(u => /verify.?insurance|vob|verification.?of.?benefits|insurance.?verif|check.?insur|\/insurance\b/i.test(u));
  const hasContactPage = urls.some(u => /contact|admissions|get.?help|intake/i.test(u));
  const hasDetoxPage = urls.some(u => /detox/i.test(u));
  const hasResidentialPage = urls.some(u => /residential|inpatient/i.test(u));
  const hasConditionsHub = urls.some(u => /conditions|mental.?health.?conditions|disorders/i.test(u));
  const hasTherapiesHub = urls.some(u => /therap(y|ies)|treatment.?modalities/i.test(u));
  const hasLocationPage = urls.some(u => /location|campus|facility/i.test(u));
  const hasAboutPage = urls.some(u => /about/i.test(u));
  const hasTeamPage = urls.some(u => /team|staff|leadership|providers/i.test(u));
  const hasAlumniPage = urls.some(u => /alumni|aftercare/i.test(u));

  const servicePatterns = [/detox/i, /residential/i, /php/i, /iop/i, /outpatient/i];
  const servicePageCounts = servicePatterns.map(p => urls.filter(u => p.test(u)).length);
  const duplicateServicePages = servicePageCounts.filter(c => c > 2).length;

  const geoPattern = /near.?me|in-[a-z]|\/[a-z]+-[a-z]+(?:-[a-z]+)*\/?$/i;
  const overlapGeoPages = urls.filter(u => geoPattern.test(u)).length;

  const serviceTypes: string[] = [];
  if (hasDetoxPage) serviceTypes.push("Detox");
  if (hasResidentialPage) serviceTypes.push("Residential / Inpatient");
  if (urls.some(u => /php|partial.?hospitalization/i.test(u))) serviceTypes.push("PHP");
  if (urls.some(u => /iop|intensive.?outpatient/i.test(u))) serviceTypes.push("IOP");

  return {
    totalUrls,
    errors4xx5xx,
    redirects,
    nonIndexable,
    missingTitles,
    missingH1s,
    thinPages,
    servicePageTypes: serviceTypes,
    hasVobPage,
    hasContactPage,
    hasDetoxPage,
    hasResidentialPage,
    hasConditionsHub,
    hasTherapiesHub,
    hasLocationPage,
    duplicateServicePages,
    overlapGeoPages,
    hasAboutPage,
    hasTeamPage,
    hasAlumniPage,
  };
}
