/**
 * workflowFieldMapping.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines WHICH workflow content maps to WHICH report fields, per report type.
 *
 * Strategy area groups:
 *   content   — content_refresh, new_content, cro_content
 *   technical — technical_infra, technical_content, advanced_technical
 *   local     — local_gbp
 *   discovery — discoverability
 *
 * For each active report type we export a list of FieldMapEntry objects.
 * Each entry knows how to derive its content from the WorkflowHandoffContext
 * and carries metadata used by the WorkflowContextBanner UI.
 *
 * To add a new report type (Mid-Strategy, QBR, Kickoff…):
 *   1. Add its FieldMapEntry[] constant below
 *   2. Add it to FIELD_MAPS
 *   That's all.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { WorkflowHandoffContext, WorkflowCommittedArea } from "./workflowHandoff";

// ─── Area group IDs ────────────────────────────────────────────────────────────

const CONTENT_AREA_IDS = ["content_refresh", "new_content", "cro_content"] as const;
const TECHNICAL_AREA_IDS = ["technical_infra", "technical_content", "advanced_technical"] as const;
const LOCAL_AREA_IDS = ["local_gbp"] as const;
const DISCOVERY_AREA_IDS = ["discoverability"] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function filterAreas(
  ctx: WorkflowHandoffContext,
  ids: readonly string[],
): WorkflowCommittedArea[] {
  return ctx.committedAreas.filter(a => ids.includes(a.areaId));
}

function allAreas(ctx: WorkflowHandoffContext): WorkflowCommittedArea[] {
  return ctx.committedAreas;
}

function buildFindingBullets(areas: WorkflowCommittedArea[]): string {
  const lines: string[] = [];
  for (const area of areas) {
    const selected = area.findings.filter(
      f => f.selected && f.status !== "rejected",
    );
    for (const f of selected) {
      lines.push(`• [${area.areaLabel}] ${f.body}`);
    }
  }
  return lines.join("\n");
}

function buildAmInputs(areas: WorkflowCommittedArea[]): string {
  const parts: string[] = [];
  for (const area of areas) {
    if (area.amInput.trim()) {
      parts.push(`[${area.areaLabel}]\n${area.amInput.trim()}`);
    }
  }
  return parts.join("\n\n");
}

// ─── Field map entry type ──────────────────────────────────────────────────────

export interface FieldMapEntry {
  /** Matches the React state key in the report page (e.g. "amThoughts") */
  fieldId: string;
  /** Human-readable label shown in the import banner */
  fieldLabel: string;
  /** One-liner explaining what data will be pulled in */
  sourceHint: string;
  /** Derives the text content to place in this field */
  build: (ctx: WorkflowHandoffContext) => string;
}

// ─── Bi-Weekly field map ───────────────────────────────────────────────────────

const BIWEEKLY_FIELDS: FieldMapEntry[] = [
  {
    fieldId: "amThoughts",
    fieldLabel: "AM's Hypothesis",
    sourceHint: "AM notes from all committed areas",
    build: ctx => buildAmInputs(allAreas(ctx)),
  },
  {
    fieldId: "priorityChecks",
    fieldLabel: "Priority Checks",
    sourceHint: "Accepted findings from all committed areas",
    build: ctx => buildFindingBullets(allAreas(ctx)),
  },
];

// ─── Monthly field map ─────────────────────────────────────────────────────────

const MONTHLY_FIELDS: FieldMapEntry[] = [
  {
    fieldId: "amThoughts",
    fieldLabel: "AM's Hypothesis",
    sourceHint: "AM notes from all committed areas",
    build: ctx => buildAmInputs(allAreas(ctx)),
  },
  {
    fieldId: "priorityChecks",
    fieldLabel: "Priority Checks",
    sourceHint: "Accepted findings from all committed areas",
    build: ctx => buildFindingBullets(allAreas(ctx)),
  },
  {
    fieldId: "amContextAnomalies",
    fieldLabel: "Context Anomalies",
    sourceHint: "Findings from technical infrastructure & advanced technical areas",
    build: ctx => buildFindingBullets(filterAreas(ctx, TECHNICAL_AREA_IDS)),
  },
  {
    fieldId: "amFocusNextMonth",
    fieldLabel: "Focus Next Month",
    sourceHint: "AM notes from content areas (refresh, new content, CRO)",
    build: ctx => buildAmInputs(filterAreas(ctx, CONTENT_AREA_IDS)),
  },
];

// ─── QBS (qbr_prep) field map ─────────────────────────────────────────────────

const QBS_FIELDS: FieldMapEntry[] = [
  {
    fieldId: "amThoughts",
    fieldLabel: "AM's Hypothesis",
    sourceHint: "AM notes from all committed areas",
    build: ctx => buildAmInputs(allAreas(ctx)),
  },
  {
    fieldId: "priorityChecks",
    fieldLabel: "Priority Checks",
    sourceHint: "Accepted findings from all committed areas",
    build: ctx => buildFindingBullets(allAreas(ctx)),
  },
  {
    fieldId: "prevQtrAssessment",
    fieldLabel: "Prev Quarter Assessment",
    sourceHint: "Findings from content + local areas (basis for quarter review)",
    build: ctx =>
      buildFindingBullets(
        filterAreas(ctx, [...CONTENT_AREA_IDS, ...LOCAL_AREA_IDS]),
      ),
  },
];

// ─── Future stubs (not yet active) ────────────────────────────────────────────
// mid_strategy, qbr_full, kickoff, launch — add FieldMapEntry[] here when ready

// ─── Registry ─────────────────────────────────────────────────────────────────

const FIELD_MAPS: Record<string, FieldMapEntry[]> = {
  biweekly: BIWEEKLY_FIELDS,
  monthly: MONTHLY_FIELDS,
  qbr_prep: QBS_FIELDS,
};

/**
 * Returns the field map for a given report type.
 * Falls back to the biweekly map if the report type is not yet configured.
 */
export function getFieldMapping(reportTypeId: string): FieldMapEntry[] {
  return FIELD_MAPS[reportTypeId] ?? BIWEEKLY_FIELDS;
}

/**
 * Derive all field values at once for a given report type + context.
 * Returns only fields whose built content is non-empty.
 */
export function buildFieldValues(
  reportTypeId: string,
  ctx: WorkflowHandoffContext,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of getFieldMapping(reportTypeId)) {
    const value = entry.build(ctx);
    if (value.trim()) result[entry.fieldId] = value;
  }
  return result;
}
