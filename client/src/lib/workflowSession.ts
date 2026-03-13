/**
 * workflowSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight localStorage persistence for the in-progress AM workflow session.
 * Keeps findings, overrides, AM inputs, phase state, and committed areas alive
 * across page refreshes and brief absences.
 *
 * Key: `smarteo:wf_session`  (single slot — last write wins)
 * TTL: 24 hours  (a working day; stale sessions are silently discarded)
 * Version: 1
 *
 * Only fields that are safe to JSON-round-trip are stored.
 * `chatFinding` is transient UI state and is NOT persisted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Finding } from "./findingTypes";

export const SESSION_KEY = "smarteo:wf_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CURRENT_VERSION = 1;

// Mirrors SectionPhase from workflow.tsx without creating a circular import.
export type PersistedSectionPhase =
  | "idle"
  | "input"
  | "analyzing"
  | "questions"
  | "findings"
  | "committed";

export interface PersistedSectionState {
  phase: PersistedSectionPhase;
  amInput: string;
  questionAnswers: Record<number, string>;
  findings: Finding[];
  committed: boolean;
}

export interface PersistedSession {
  version: typeof CURRENT_VERSION;
  savedAt: number;
  /** Step 1–6. Step is preserved so AMs return exactly where they left off. */
  step: number;
  reportTypeId: string | null;
  clientId: number | null;
  activeSectionId: string;
  sections: Record<string, PersistedSectionState>;
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export function saveWorkflowSession(
  step: number,
  reportTypeId: string | null,
  clientId: number | null,
  activeSectionId: string,
  sections: Record<string, PersistedSectionState>,
): void {
  try {
    const session: PersistedSession = {
      version: CURRENT_VERSION,
      savedAt: Date.now(),
      step,
      reportTypeId,
      clientId,
      activeSectionId,
      sections,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable — fail silently
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Returns the most recent valid session, or null if none exists / is stale.
 * Does NOT filter by reportTypeId or clientId — any valid session is returned
 * and the caller decides how to use it.
 */
export function loadWorkflowSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedSession;
    if (s.version !== CURRENT_VERSION) return null;
    if (Date.now() - s.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearWorkflowSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Human-readable relative timestamp for the restore banner.
 * e.g. "just now", "3 min ago", "2 h ago", "yesterday"
 */
export function formatSessionAge(savedAt: number): string {
  const diff = Date.now() - savedAt;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  return "yesterday";
}
