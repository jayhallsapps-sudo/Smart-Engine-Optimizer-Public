import type { PageType } from "./types";

export const DEFAULT_URL_PATTERNS: Record<Exclude<PageType, "general" | "homepage_hub">, string[]> = {
  homepage: ["/"],
  informational: ["/blog/*", "/articles/*", "/news/*", "/resources/*"],
  cro: [
    "/contact/*", "/admissions/*", "/verify-insurance/*",
    "/get-help*", "/intake*", "/schedule*",
  ],
  service: [
    "/services/*", "/programs/*", "/levels-of-care/*",
    "/therapies/*", "/therapy-modalities/*", "/conditions/*",
    "/treatment/*", "/addiction-treatment/*",
  ],
  local_intent: ["/locations/*", "/areas-served/*"],
  commercial: [],
};

export interface UrlClassifierOptions {
  overrides?: Record<string, string[]>;
  allUrls?: string[];
}

export function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return path === pattern;
}

export function classifyUrl(url: string, options: UrlClassifierOptions): PageType {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";

    // 1. Homepage
    if (path === "/") return "homepage";

    // 2. Exact patterns (overrides first, then defaults)
    const patterns: Array<{ type: PageType; patterns: string[] }> = [];

    // Collect all pattern sources in priority order
    const addPatterns = (type: PageType, list: string[]) => {
      if (list.length) patterns.push({ type, patterns: list });
    };

    addPatterns("informational", options.overrides?.informational ?? DEFAULT_URL_PATTERNS.informational);
    addPatterns("service", options.overrides?.service ?? DEFAULT_URL_PATTERNS.service);
    addPatterns("cro", options.overrides?.cro ?? DEFAULT_URL_PATTERNS.cro);
    addPatterns("local_intent", options.overrides?.local_intent ?? DEFAULT_URL_PATTERNS.local_intent);
    addPatterns("commercial", options.overrides?.commercial ?? DEFAULT_URL_PATTERNS.commercial);

    for (const { type, patterns: list } of patterns) {
      for (const pat of list) {
        if (matchesPattern(path, pat)) return type;
      }
    }

    // 3. Homepage-hub detection
    if (options.allUrls) {
      for (const other of options.allUrls) {
        try {
          const otherPath = new URL(other).pathname;
          if (otherPath !== path && otherPath.startsWith(path + "/")) {
            return "homepage_hub";
          }
        } catch {
          // ignore
        }
      }
    }

    return "general";
  } catch {
    return "general";
  }
}
