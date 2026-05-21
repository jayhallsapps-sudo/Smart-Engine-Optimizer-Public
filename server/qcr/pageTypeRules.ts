import { randomUUID } from "crypto";
import type { ParsedPage, QcrFinding, PageType } from "./types";

export interface ScanContext {
  clientCanonicalNap: {
    name: string;
    phone: string;
    phoneDisplay: string;
    address: string;
    email?: string;
  };
  allPages: ParsedPage[];
  urlStatusMap: Map<string, number>;
  redirectMap: Map<string, string>;
}

export interface Rule {
  id: string;
  description: string;
  appliesTo: PageType[] | "all";
  detector: (page: ParsedPage, ctx: ScanContext) => QcrFinding[];
  crossPageDetector?: (allPages: ParsedPage[], ctx: ScanContext) => QcrFinding[];
}

function createFinding(input: Omit<QcrFinding, "id" | "affectedUrlsSampleSize" | "category"> & { ruleId: string }): QcrFinding {
  const prefix = input.ruleId.split(".")[0];
  const category: import("./types").QcrCategory = prefix === "universal" || prefix === "technical" ? "technical_seo" : (prefix as import("./types").QcrCategory);
  return {
    id: randomUUID(),
    category,
    severity: input.severity,
    ruleId: input.ruleId,
    title: input.title,
    description: input.description,
    affectedUrls: input.affectedUrls,
    affectedUrlsSampleSize: input.affectedUrls.length,
    evidence: input.evidence ?? {},
  };
}

// ─── Per-page helper: applies to a single page, returns findings ─────────────
function perPageRule(
  id: string,
  description: string,
  appliesTo: PageType[] | "all",
  severity: import("./types").QcrSeverity,
  check: (page: ParsedPage) => { pass: boolean; title: string; description: string; evidence?: Record<string, unknown> } | null,
): Rule {
  return {
    id,
    description,
    appliesTo,
    detector: (page, _ctx) => {
      if (page.status !== 200) return [];
      if (appliesTo !== "all" && !appliesTo.includes(page.pageType)) return [];
      const result = check(page);
      if (!result || result.pass) return [];
      return [createFinding({
        ruleId: id,
        severity,
        title: result.title,
        description: result.description,
        affectedUrls: [page.url],
        evidence: result.evidence ?? {},
      })];
    },
  };
}

export const UNIVERSAL_RULES: Rule[] = [
  perPageRule(
    "universal.h1_present",
    "Page must have exactly one H1",
    "all",
    "medium",
    (page) => {
      if (page.h1s.length === 1) return null;
      if (page.h1s.length === 0) {
        return {
          pass: false,
          title: `Missing H1 on ${page.path}`,
          description: `The page at ${page.url} has no H1 element. Every page should have exactly one H1.`,
          evidence: { h1Count: 0 },
        };
      }
      return {
        pass: false,
        title: `Multiple H1 tags on ${page.path}`,
        description: `The page at ${page.url} has ${page.h1s.length} H1 tags. Each page should have exactly one.`,
        evidence: { h1Count: page.h1s.length, h1s: page.h1s },
      };
    },
  ),

  {
    id: "universal.heading_hierarchy",
    description: "Headings must not skip levels",
    appliesTo: "all",
    detector: (page, _ctx) => {
      if (page.headings.length < 2) return [];
      const findings: QcrFinding[] = [];
      let lastLevel = page.headings[0].level;
      for (let i = 1; i < page.headings.length; i++) {
        const h = page.headings[i];
        if (h.level > lastLevel + 1) {
          findings.push(createFinding({
            ruleId: "universal.heading_hierarchy",
            severity: "low",
            title: `Heading hierarchy skip on ${page.path}`,
            description: `The page at ${page.url} has a heading jump from H${lastLevel} to H${h.level} ("${h.text}"). Avoid skipping heading levels.`,
            affectedUrls: [page.url],
            evidence: { fromLevel: lastLevel, toLevel: h.level, headingText: h.text },
          }));
        }
        lastLevel = h.level;
      }
      return findings;
    },
  },

  perPageRule(
    "universal.meta_title_present",
    "Page must have a title element",
    "all",
    "medium",
    (page) => {
      if (page.title && page.title.trim().length > 0) return null;
      return {
        pass: false,
        title: `Missing title tag on ${page.path}`,
        description: `The page at ${page.url} has no <title> element or it is empty. Every page needs a descriptive title.`,
      };
    },
  ),

  perPageRule(
    "universal.meta_title_length",
    "Title between 30-65 chars",
    "all",
    "low",
    (page) => {
      if (!page.title) return null;
      const len = page.title.length;
      if (len >= 30 && len <= 65) return null;
      return {
        pass: false,
        title: `Title length issue on ${page.path} (${len} chars)`,
        description: `The page at ${page.url} has a title of ${len} characters. Aim for 30-65 characters for optimal display in search results.`,
        evidence: { titleLength: len },
      };
    },
  ),

  perPageRule(
    "universal.meta_description_present",
    "Page must have meta description",
    "all",
    "medium",
    (page) => {
      if (page.metaDescription && page.metaDescription.trim().length > 0) return null;
      return {
        pass: false,
        title: `Missing meta description on ${page.path}`,
        description: `The page at ${page.url} has no meta description. Add one to improve click-through rates from search results.`,
      };
    },
  ),

  perPageRule(
    "universal.meta_description_length",
    "Description between 70-160 chars",
    "all",
    "low",
    (page) => {
      if (!page.metaDescription) return null;
      const len = page.metaDescription.length;
      if (len >= 70 && len <= 160) return null;
      return {
        pass: false,
        title: `Meta description length issue on ${page.path} (${len} chars)`,
        description: `The page at ${page.url} has a meta description of ${len} characters. Aim for 70-160 characters.`,
        evidence: { descriptionLength: len },
      };
    },
  ),

  perPageRule(
    "universal.internal_link_present",
    "Page must contain at least one internal link",
    "all",
    "medium",
    (page) => {
      if (page.internalLinks.length > 0) return null;
      return {
        pass: false,
        title: `No internal links on ${page.path}`,
        description: `The page at ${page.url} contains no internal links. Internal linking helps distribute link equity and aids navigation.`,
      };
    },
  ),

  perPageRule(
    "universal.image_alt_coverage",
    "Less than 50% of images have alt text",
    "all",
    "low",
    (page) => {
      if (page.images.length === 0) return null;
      const withAlt = page.images.filter(img => img.alt && img.alt.trim().length > 0).length;
      const pct = withAlt / page.images.length;
      if (pct >= 0.5) return null;
      return {
        pass: false,
        title: `Poor image alt coverage on ${page.path}`,
        description: `Only ${withAlt} of ${page.images.length} images on ${page.url} have alt text (${Math.round(pct * 100)}%). Add descriptive alt text to all meaningful images.`,
        evidence: { totalImages: page.images.length, withAlt, withoutAlt: page.images.length - withAlt },
      };
    },
  ),

  perPageRule(
    "universal.canonical_present",
    "Page must have canonical link",
    "all",
    "medium",
    (page) => {
      if (page.canonical && page.canonical.trim().length > 0) return null;
      return {
        pass: false,
        title: `Missing canonical tag on ${page.path}`,
        description: `The page at ${page.url} has no <link rel="canonical"> tag. Add one to prevent duplicate content issues.`,
      };
    },
  ),

  perPageRule(
    "universal.faq_section_present",
    "FAQ section detected but no FAQPage schema",
    "all",
    "low",
    (page) => {
      if (!page.faqDetected) return null;
      const hasFaqSchema = page.jsonLdBlocks.some(b => b["@type"] === "FAQPage");
      if (hasFaqSchema) return null;
      return {
        pass: false,
        title: `FAQ section without schema on ${page.path}`,
        description: `The page at ${page.url} has an FAQ section but no FAQPage JSON-LD schema. Adding the schema improves rich result eligibility.`,
      };
    },
  ),

  {
    id: "universal.intro_internal_link",
    description: "First paragraph after H1 should contain an internal link",
    appliesTo: ["informational"],
    detector: (page, _ctx) => {
      if (page.pageType !== "informational") return [];
      if (page.introInternalLink) return [];
      return [createFinding({
        ruleId: "universal.intro_internal_link",
        severity: "low",
        title: `Missing intro internal link on ${page.path}`,
        description: `The first paragraph after the H1 on ${page.url} does not contain an internal link. Adding one improves page connectivity and time-on-site.`,
        affectedUrls: [page.url],
        evidence: { pageType: page.pageType },
      })];
    },
  },

  {
    id: "universal.tldr_present",
    description: "Informational page should have TL;DR block",
    appliesTo: ["informational"],
    detector: (page, _ctx) => {
      if (page.pageType !== "informational") return [];
      if (page.tldrDetected) return [];
      return [createFinding({
        ruleId: "universal.tldr_present",
        severity: "medium",
        title: `Blog missing TL;DR block`,
        description: `${page.url} is classified as an informational/blog page but does not have a TL;DR section. Add a TL;DR block to improve scannability and AEO/featured-snippet eligibility.`,
        affectedUrls: [page.url],
        evidence: { pageType: page.pageType },
      })];
    },
  },

  {
    id: "universal.key_takeaways_present",
    description: "Page should have Key Takeaways section",
    appliesTo: ["informational", "service", "homepage_hub"],
    detector: (page, _ctx) => {
      if (!["informational", "service", "homepage_hub"].includes(page.pageType)) return [];
      if (page.keyTakeawaysDetected) return [];
      return [createFinding({
        ruleId: "universal.key_takeaways_present",
        severity: "low",
        title: `Missing Key Takeaways on ${page.path}`,
        description: `${page.url} is classified as ${page.pageType} but lacks a Key Takeaways section. Adding one improves content digestibility and user engagement.`,
        affectedUrls: [page.url],
        evidence: { pageType: page.pageType },
      })];
    },
  },
];

export const TECHNICAL_RULES: Rule[] = [
  perPageRule(
    "technical.schema_present",
    "Page has at least one JSON-LD block",
    "all",
    "low",
    (page) => {
      if (page.jsonLdBlocks.length > 0) return null;
      return {
        pass: false,
        title: `No JSON-LD schema on ${page.path}`,
        description: `The page at ${page.url} has no JSON-LD structured data. Adding schema helps search engines understand the page content.`,
      };
    },
  ),

  {
    id: "technical.schema_type_appropriate",
    description: "Schema type matches page type",
    appliesTo: "all",
    detector: (page, _ctx) => {
      if (page.jsonLdBlocks.length === 0) return [];
      // Extract @type from top-level blocks AND from nested @graph items
      function extractTypes(block: any): string[] {
        if (!block || typeof block !== "object") return [];
        const types: string[] = [];
        // Handle @graph arrays (Rank Math, Yoast output format)
        if (Array.isArray(block["@graph"])) {
          for (const item of block["@graph"]) {
            types.push(...extractTypes(item));
          }
        }
        const t = block["@type"];
        if (t) {
          if (Array.isArray(t)) {
            types.push(...t.filter(Boolean));
          } else {
            types.push(t);
          }
        }
        return types;
      }
      const types = new Set(page.jsonLdBlocks.flatMap(extractTypes));

      const expected: string[] = [];
      switch (page.pageType) {
        case "homepage": expected.push("Organization", "LocalBusiness", "MedicalBusiness", "MedicalOrganization"); break;
        case "informational": expected.push("Article", "BlogPosting"); break;
        case "service": expected.push("Service", "MedicalBusiness", "MedicalWebPage", "MedicalTherapy"); break;
        case "cro": expected.push("ContactPage", "WebPage"); break;
        case "homepage_hub": expected.push("CollectionPage", "WebPage"); break;
      }
      if (expected.length === 0) return [];
      const hasMatch = expected.some(e => types.has(e));
      if (hasMatch) return [];
      return [createFinding({
        ruleId: "technical.schema_type_appropriate",
        severity: "low",
        title: `Schema type mismatch on ${page.path}`,
        description: `The page at ${page.url} is classified as ${page.pageType} but its JSON-LD schema types (${Array.from(types).join(", ")}) don't include expected types (${expected.join(", ")}).`,
        affectedUrls: [page.url],
        evidence: { pageType: page.pageType, foundTypes: Array.from(types), expectedTypes: expected },
      })];
    },
  },

  perPageRule(
    "technical.canonical_self_referential",
    "Canonical URL should match the page URL",
    "all",
    "medium",
    (page) => {
      if (!page.canonical) return null;
      const normalize = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "").split("?")[0].toLowerCase();
      if (normalize(page.canonical) === normalize(page.url)) return null;
      return {
        pass: false,
        title: `Non-self-referential canonical on ${page.path}`,
        description: `The page at ${page.url} has a canonical pointing to ${page.canonical}, which does not match the page URL. Unless intentional, canonicals should be self-referential.`,
        evidence: { canonical: page.canonical },
      };
    },
  ),

  perPageRule(
    "technical.noindex_unexpected",
    "Page is noindexed but likely shouldn't be",
    "all",
    "critical",
    (page) => {
      if (!page.noindex) return null;
      return {
        pass: false,
        title: `Unexpected noindex on ${page.path}`,
        description: `The page at ${page.url} has a noindex robots meta tag. If this page should be indexed, remove the noindex directive.`,
      };
    },
  ),

  // NAP rules are cross-page
  {
    id: "technical.nap_phone_consistency",
    description: "Phone numbers on pages match canonical phone",
    appliesTo: "all",
    detector: () => [], // handled by crossPageDetector
    crossPageDetector: (allPages, ctx) => {
      const canonicalPhoneDigits = ctx.clientCanonicalNap.phone.replace(/\D/g, "");
      if (!canonicalPhoneDigits) return [];
      const phoneRe = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
      const mismatched = new Map<string, Set<string>>(); // normalized -> Set<urls>
      for (const page of allPages) {
        if (!page.html) continue;
        const matches = page.html.match(phoneRe) ?? [];
        for (const match of matches) {
          const digits = match.replace(/\D/g, "");
          if (digits.length < 10) continue;
          if (digits !== canonicalPhoneDigits) {
            const set = mismatched.get(match) ?? new Set();
            set.add(page.url);
            mismatched.set(match, set);
          }
        }
      }
      const findings: QcrFinding[] = [];
      mismatched.forEach((urls, phone) => {
        const urlList = Array.from(urls);
        const isSitewide = urlList.length > 10;
        findings.push(createFinding({
          ruleId: "technical.nap_phone_consistency",
          severity: isSitewide ? "critical" : "medium",
          title: isSitewide
            ? `Wrong phone number "${phone}" on ${urlList.length} pages`
            : `Wrong phone number "${phone}" on ${urlList.length} page${urlList.length > 1 ? "s" : ""}`,
          description: `Phone number "${phone}" appears on ${urlList.length} page(s) but does not match the canonical phone (${ctx.clientCanonicalNap.phoneDisplay}). ${isSitewide ? "This is a sitewide issue." : ""} Update to the correct number to maintain NAP consistency.`,
          affectedUrls: urlList,
          evidence: { mismatchedPhone: phone, canonicalPhone: ctx.clientCanonicalNap.phoneDisplay },
        }));
      });
      return findings;
    },
  },

  {
    id: "technical.nap_address_consistency",
    description: "Addresses on pages match canonical address",
    appliesTo: "all",
    detector: () => [],
    crossPageDetector: (allPages, ctx) => {
      if (!ctx.clientCanonicalNap.address) return [];
      const canon = ctx.clientCanonicalNap.address.toLowerCase().replace(/[^a-z0-9]/g, "");
      const findings: QcrFinding[] = [];
      for (const page of allPages) {
        if (!page.html) continue;
        const bodyLower = page.html.toLowerCase();
        // Simple check: does the page contain words from the address?
        const addressParts = ctx.clientCanonicalNap.address.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const hasParts = addressParts.filter(p => bodyLower.includes(p));
        if (addressParts.length > 0 && hasParts.length === 0) {
          findings.push(createFinding({
            ruleId: "technical.nap_address_consistency",
            severity: "critical",
            title: `Missing canonical address on ${page.path}`,
            description: `The page at ${page.url} does not appear to contain the canonical address (${ctx.clientCanonicalNap.address}). Ensure NAP consistency across all pages.`,
            affectedUrls: [page.url],
            evidence: { canonicalAddress: ctx.clientCanonicalNap.address },
          }));
        }
      }
      return findings;
    },
  },

  {
    id: "technical.nap_email_consistency",
    description: "Mailto links match approved email pattern",
    appliesTo: "all",
    detector: (page, _ctx) => {
      const mailtoRe = /mailto:([^"'\s]+)/gi;
      const emails: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = mailtoRe.exec(page.html)) !== null) {
        emails.push(m[1]);
      }
      if (emails.length === 0) return [];
      const findings: QcrFinding[] = [];
      for (const email of emails) {
        if (!email.includes("@")) continue;
        const domain = email.split("@")[1]?.toLowerCase();
        // Accept any reasonable domain; flag suspicious ones
        const suspicious = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com"];
        if (suspicious.includes(domain ?? "")) {
          findings.push(createFinding({
            ruleId: "technical.nap_email_consistency",
            severity: "medium",
            title: `Consumer email address on ${page.path}`,
            description: `The page at ${page.url} contains a mailto link to ${email}, which uses a consumer email provider. Use a professional domain email for credibility and deliverability.`,
            affectedUrls: [page.url],
            evidence: { email },
          }));
        }
      }
      return findings;
    },
  },

  {
    id: "technical.internal_link_404",
    description: "Internal links that resolve to 404",
    appliesTo: "all",
    detector: (page, ctx) => {
      const dead: string[] = [];
      const seen = new Set<string>();
      for (const link of page.internalLinks) {
        if (seen.has(link)) continue;
        seen.add(link);
        const status = ctx.urlStatusMap.get(link);
        if (status === 404 || status === 0) {
          dead.push(link);
        }
      }
      if (dead.length === 0) return [];
      return [createFinding({
        ruleId: "technical.internal_link_404",
        severity: "critical",
        title: `${dead.length} dead internal link${dead.length > 1 ? "s" : ""} on ${page.path}`,
        description: `The page at ${page.url} links to ${dead.length} URL(s) that return 404 or are unreachable: ${dead.slice(0, 3).join(", ")}${dead.length > 3 ? "..." : ""}. Fix or remove these broken links.`,
        affectedUrls: [page.url],
        evidence: { deadLinks: dead },
      })];
    },
  },

  {
    id: "technical.internal_link_301",
    description: "Internal links that 301-redirect",
    appliesTo: "all",
    detector: (page, ctx) => {
      const redirected: string[] = [];
      const seen = new Set<string>();
      for (const link of page.internalLinks) {
        if (seen.has(link)) continue;
        seen.add(link);
        const final = ctx.redirectMap.get(link);
        if (final && final !== link) {
          redirected.push(link);
        }
      }
      if (redirected.length === 0) return [];
      return [createFinding({
        ruleId: "technical.internal_link_301",
        severity: "medium",
        title: `${redirected.length} redirected internal link${redirected.length > 1 ? "s" : ""} on ${page.path}`,
        description: `The page at ${page.url} links to ${redirected.length} URL(s) that redirect. Update the links to point to the final destination URLs to preserve link equity.`,
        affectedUrls: [page.url],
        evidence: { redirectedLinks: redirected },
      })];
    },
  },

  perPageRule(
    "technical.ai_paste_leak",
    "HTML contains Claude.ai chat UI class names",
    "all",
    "critical",
    (page) => {
      const leaks = ["font-claude-response-body", "text-text-100", "border-border-200", "decoration-current/40"];
      const found = leaks.filter(l => page.html.includes(l));
      if (found.length === 0) return null;
      return {
        pass: false,
        title: `AI paste leak detected on ${page.path}`,
        description: `The page at ${page.url} contains CSS class names associated with Claude.ai chat UI (${found.join(", ")}). This suggests AI-generated content was copy-pasted without cleaning. Remove these classes immediately.`,
        evidence: { leakedClasses: found },
      };
    },
  ),

  // Duplicate rules are cross-page
  {
    id: "technical.duplicate_title",
    description: "Two or more pages share an identical title",
    appliesTo: "all",
    detector: () => [],
    crossPageDetector: (allPages, _ctx) => {
      const byTitle = new Map<string, ParsedPage[]>();
      for (const p of allPages) {
        if (!p.title) continue;
        const arr = byTitle.get(p.title) ?? [];
        arr.push(p);
        byTitle.set(p.title, arr);
      }
      const findings: QcrFinding[] = [];
      byTitle.forEach((pages, title) => {
        if (pages.length < 2) return;
        findings.push(createFinding({
          ruleId: "technical.duplicate_title",
          severity: "medium",
          title: `${pages.length} pages share the title "${title.slice(0, 60)}"`,
          description: `Duplicate page titles confuse search engines about which page to rank. Affected: ${pages.map((p: ParsedPage) => p.url).slice(0, 5).join(", ")}${pages.length > 5 ? "..." : ""}`,
          affectedUrls: pages.map((p: ParsedPage) => p.url),
          evidence: { sharedTitle: title, pageCount: pages.length },
        }));
      });
      return findings;
    },
  },

  {
    id: "technical.duplicate_meta_description",
    description: "Two or more pages share an identical meta description",
    appliesTo: "all",
    detector: () => [],
    crossPageDetector: (allPages, _ctx) => {
      const byDesc = new Map<string, ParsedPage[]>();
      for (const p of allPages) {
        if (!p.metaDescription) continue;
        const arr = byDesc.get(p.metaDescription) ?? [];
        arr.push(p);
        byDesc.set(p.metaDescription, arr);
      }
      const findings: QcrFinding[] = [];
      byDesc.forEach((pages, desc) => {
        if (pages.length < 2) return;
        findings.push(createFinding({
          ruleId: "technical.duplicate_meta_description",
          severity: "low",
          title: `${pages.length} pages share a meta description`,
          description: `Duplicate meta descriptions reduce click-through rates. Affected: ${pages.map((p: ParsedPage) => p.url).slice(0, 5).join(", ")}${pages.length > 5 ? "..." : ""}`,
          affectedUrls: pages.map((p: ParsedPage) => p.url),
          evidence: { pageCount: pages.length },
        }));
      });
      return findings;
    },
  },

  {
    id: "technical.duplicate_h1",
    description: "Two or more pages share an identical H1",
    appliesTo: "all",
    detector: () => [],
    crossPageDetector: (allPages, _ctx) => {
      const byH1 = new Map<string, ParsedPage[]>();
      for (const p of allPages) {
        if (p.h1s.length === 0) continue;
        const h1 = p.h1s[0];
        const arr = byH1.get(h1) ?? [];
        arr.push(p);
        byH1.set(h1, arr);
      }
      const findings: QcrFinding[] = [];
      byH1.forEach((pages, h1) => {
        if (pages.length < 2) return;
        findings.push(createFinding({
          ruleId: "technical.duplicate_h1",
          severity: "medium",
          title: `${pages.length} pages share the H1 "${h1.slice(0, 60)}"`,
          description: `Duplicate H1s confuse search engines about page topics. Affected: ${pages.map((p: ParsedPage) => p.url).slice(0, 5).join(", ")}${pages.length > 5 ? "..." : ""}`,
          affectedUrls: pages.map((p: ParsedPage) => p.url),
          evidence: { sharedH1: h1, pageCount: pages.length },
        }));
      });
      return findings;
    },
  },
];

export function getApplicableRules(pageType: PageType, category: "universal" | "technical"): Rule[] {
  const rules = category === "universal" ? UNIVERSAL_RULES : TECHNICAL_RULES;
  return rules.filter(r => r.appliesTo === "all" || r.appliesTo.includes(pageType));
}
