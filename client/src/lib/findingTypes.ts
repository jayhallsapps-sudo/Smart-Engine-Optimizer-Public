// ─── Finding model ────────────────────────────────────────────────────────────
// Stable structured objects for workflow findings.
// Each finding has a unique ID scoped to its strategy area so comments and
// revisions remain attached even if the list is reordered in the future.

export type FindingStatus = "draft" | "accepted" | "rejected" | "revised";

export interface Finding {
  id: string;
  areaId: string;
  areaLabel: string;
  body: string;
  status: FindingStatus;
  evidence?: string;
  sourceMetadata?: Record<string, unknown>;
  confidence?: "low" | "medium" | "high";
  notes?: string[];
}

export interface FindingChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestedRevision?: string;
  timestamp?: number;
}

export function buildFinding(
  areaId: string,
  areaLabel: string,
  index: number,
  body: string,
): Finding {
  return {
    id: `${areaId}:${index}`,
    areaId,
    areaLabel,
    body,
    status: "draft",
  };
}

export function findingShortLabel(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const cut = clean.split(/\s[—–-]\s/)[0].split(". ")[0].split(", ")[0];
  return cut.length > 62 ? cut.slice(0, 59) + "…" : cut;
}
