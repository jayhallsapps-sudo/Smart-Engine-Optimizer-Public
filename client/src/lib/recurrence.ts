/**
 * recurrence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-period finding memory utilities for SmartEO.
 *
 * Provides lightweight normalization, hashing, and Jaccard-similarity matching
 * to surface prior context when a current finding appears to recur across
 * reporting cycles.
 *
 * Key design decisions:
 *  - All matching is client-side (history rows fetched from server, matched here)
 *  - Matching is heuristic and non-binding — AMs stay fully in control
 *  - "exact" = same djb2 hash of normalized body
 *  - "likely" = same area + Jaccard word similarity ≥ 0.50
 *  - "possible" = same area + Jaccard word similarity ≥ 0.30 (shown in panel only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Finding } from "./findingTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindingHistoryEntry {
  id: number;
  clientId: number;
  reportType: string;
  areaId: string;
  bodyHash: string;
  body: string;
  bucket: string | null;
  executionStatus: string | null;
  linkedRefTitle: string | null;
  periodLabel: string | null;
  seenAt: string;
}

export interface PriorFindingContext {
  recurrenceCount: number;
  lastSeenAt: string;
  periodLabel: string | undefined;
  priorBucket: string | undefined;
  priorExecutionStatus: string | undefined;
  priorLinkedRefTitle: string | undefined;
  matchConfidence: "exact" | "likely" | "possible";
}

export interface FindingHistorySaveEntry {
  areaId: string;
  body: string;
  bodyHash: string;
  bucket: string | null;
  executionStatus: string | null;
  linkedRefTitle: string | null;
}

// ─── Text utilities ───────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace */
export function normalizeFindingBody(body: string): string {
  return body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** djb2-style hash — same algorithm used in findingTypes.ts for content IDs */
export function hashFindingBody(normalized: string): string {
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) - h + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Jaccard similarity over word sets (words > 3 chars, to skip stop words) */
export function jaccardSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.split(" ").filter(w => w.length > 3));
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * Match each current finding against the fetched history.
 * Returns a Map<findingId, PriorFindingContext> for any matched findings.
 * Unmatched findings have no entry in the map.
 */
export function matchFindingsToPrior(
  findings: Finding[],
  history: FindingHistoryEntry[],
): Map<string, PriorFindingContext> {
  const result = new Map<string, PriorFindingContext>();
  if (history.length === 0) return result;

  for (const finding of findings) {
    const normalized = normalizeFindingBody(finding.body);
    const hash = hashFindingBody(normalized);

    const exactMatches = history.filter(h => h.bodyHash === hash);

    const fuzzyMatches = history.filter(
      h =>
        h.bodyHash !== hash &&
        h.areaId === finding.areaId &&
        jaccardSimilarity(normalized, normalizeFindingBody(h.body)) >= 0.5,
    );

    const possibleMatches = history.filter(
      h =>
        h.bodyHash !== hash &&
        !fuzzyMatches.some(f => f.id === h.id) &&
        h.areaId === finding.areaId &&
        jaccardSimilarity(normalized, normalizeFindingBody(h.body)) >= 0.3,
    );

    const allMatches = [...exactMatches, ...fuzzyMatches, ...possibleMatches];
    if (allMatches.length === 0) continue;

    const confidence: "exact" | "likely" | "possible" =
      exactMatches.length > 0 ? "exact" :
      fuzzyMatches.length > 0 ? "likely" : "possible";

    const best = allMatches[0];

    result.set(finding.id, {
      recurrenceCount: allMatches.length,
      lastSeenAt: best.seenAt,
      periodLabel: best.periodLabel ?? undefined,
      priorBucket: best.bucket ?? undefined,
      priorExecutionStatus: best.executionStatus ?? undefined,
      priorLinkedRefTitle: best.linkedRefTitle ?? undefined,
      matchConfidence: confidence,
    });
  }

  return result;
}

// ─── Save payload builder ─────────────────────────────────────────────────────

/** Build the array of save entries from an array of selected findings */
export function buildHistorySaveEntries(findings: Finding[]): FindingHistorySaveEntry[] {
  return findings.map(f => {
    const normalized = normalizeFindingBody(f.body);
    const hash = hashFindingBody(normalized);
    const bucket = f.priorityOverride?.bucket ?? f.priority?.bucket ?? null;
    const executionStatus = f.executionContext?.status ?? null;
    const linkedRefTitle =
      f.executionContext?.linkedRefData?.title ??
      f.executionContext?.linkedRef ??
      null;
    return {
      areaId: f.areaId,
      body: f.body,
      bodyHash: hash,
      bucket,
      executionStatus,
      linkedRefTitle,
    };
  });
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function formatPriorDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export const PRIOR_BUCKET_LABELS: Record<string, string> = {
  must_do_now: "Must do now",
  should_do_next: "Should do next",
  worth_doing_later: "Worth doing later",
  deprioritize: "Deprioritize",
};
