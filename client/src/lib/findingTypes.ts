// ─── Finding model ────────────────────────────────────────────────────────────
// Findings are durable objects stored directly in section state.
// IDs are derived from a content hash of (areaId + originalBody), making them
// stable across reorder, regeneration with the same text, insertion, and removal.
// When real AI findings arrive with unique generated text, they will naturally
// get unique IDs at creation time.

import { scoreFinding, type PriorityMeta, type PriorityOverride } from "./priorityEngine";

export type { PriorityMeta, PriorityOverride };

export type FindingStatus = "draft" | "accepted" | "rejected" | "revised";

export interface Finding {
  /**
   * Stable ID: `${areaId}:${contentHash(originalBody)}`
   * Does not depend on array position.
   */
  id: string;
  areaId: string;
  areaLabel: string;
  /** Immutable source text — never mutated after creation */
  originalBody: string;
  /** Current display text — equals originalBody unless revised via chat */
  body: string;
  /** Workflow status set via chat commit or manual action */
  status: FindingStatus;
  /** Whether this finding is included in the committed output */
  selected: boolean;
  // Forward-looking fields for real AI findings — declared but not yet populated
  evidence?: string;
  sourceMetadata?: Record<string, unknown>;
  confidence?: "low" | "medium" | "high";
  notes?: string[];
  /**
   * First-pass priority metadata — computed at creation time by the Priority Engine.
   * Heuristic, transparent, and non-binding. AMs remain fully in control.
   */
  priority?: PriorityMeta;
  /**
   * Manual priority override set by the AM in the chat panel.
   * Takes precedence over `priority` for display and sorting.
   * The original `priority` is never mutated — reset clears this field only.
   */
  priorityOverride?: PriorityOverride;
}

export interface FindingChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestedRevision?: string;
  timestamp?: number;
}

/** djb2-style unsigned hash — produces an 8-char hex string */
function contentHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * Create a new Finding from a source body string.
 * All findings start as selected + draft.
 * ID is content-addressed: same area + same text → same ID.
 * Priority is auto-scored at creation time using the Priority Engine.
 * For real AI findings this is correct — different generated text → different ID.
 */
export function makeFinding(
  areaId: string,
  areaLabel: string,
  originalBody: string,
): Finding {
  return {
    id: `${areaId}:${contentHash(originalBody)}`,
    areaId,
    areaLabel,
    originalBody,
    body: originalBody,
    status: "draft",
    selected: true,
    priority: scoreFinding(areaId, originalBody),
  };
}

/** Shorten a finding body to a display label for space-constrained contexts */
export function findingShortLabel(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const cut = clean.split(/\s[—–-]\s/)[0].split(". ")[0].split(", ")[0];
  return cut.length > 62 ? cut.slice(0, 59) + "…" : cut;
}
