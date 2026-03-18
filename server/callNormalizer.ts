/**
 * Call Normalizer
 *
 * Normalizes raw call records from CallRail, CTM, and Nimbata into a single
 * canonical NormalizedCall shape. This is the authoritative provider mapping table.
 *
 * PROVIDER FIELD MAPPING TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * NormalizedCall field    CallRail API field         CTM API field              Nimbata API field
 * ─────────────────────  ─────────────────────────  ─────────────────────────  ─────────────────────────
 * provider               "callrail" (constant)      "ctm" (constant)           "nimbata" (constant)
 * callId                 id (string)                id (string)                id (string)
 * timestamp              start_time (ISO 8601)      call_at (ISO 8601)         NOT MAPPED (no client)
 * duration               duration (seconds, int)    duration (seconds, int)    NOT MAPPED
 * answered               answered (bool)            answered (bool string)     NOT MAPPED
 * missed                 !answered && !voicemail    NOT AVAILABLE              NOT MAPPED
 * qualified              qualified (bool, CallRail  NOT AVAILABLE              NOT MAPPED
 *                         custom field if set)
 * sourceName             source_name (string)       traffic_source ?? source   NOT MAPPED
 * landingPage            landing_page_url (string)  referrer_url ??            NOT MAPPED
 *                                                   landing_page_url
 * disposition            call_type (e.g. "first_   NOT AVAILABLE              NOT MAPPED
 *                         call", "lead")
 * tag                    tags[].name (array)        NOT AVAILABLE              NOT MAPPED
 * isOrganic              sourceName ∈              sourceName ∈               NOT MAPPED
 *                        callrailOrganicSourceTerms ctmOrganicSourceTerms
 * voicemailFlag          voicemail (bool)           NOT AVAILABLE              NOT MAPPED
 *
 * KNOWN GAPS BY PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 * CallRail:
 *   - The current callrail_qoq_organic_calls command fetches calls with
 *     fields=total_calls,answered,first_call,source_name but does NOT filter to
 *     organic sources before counting total_records. It counts ALL calls then
 *     groups by source. The "organic" label is misleading — it's all calls.
 *   - Fix: apply source_name filter using callrailOrganicSourceTerms in the
 *     API call params, OR filter client-side before summing.
 *   - qualified_count: CallRail does not expose a native "qualified" boolean
 *     unless a custom disposition or tag is used. No current mapping in the
 *     platform.
 *
 * CTM:
 *   - ctm_qoq_organic_calls fetches per_page=1 and reads total_entries — this
 *     is ALL calls with no organic filter at all. The term "organic" in the
 *     command name is aspirational, not functional.
 *   - Fix: fetch full call list, apply ctmOrganicSourceTerms filter on
 *     traffic_source field, then count filtered results.
 *   - answered_count: CTM `answered` field is a string ("true"/"false"), needs
 *     string comparison not boolean.
 *   - missed_count: not available via CTM API.
 *   - landing_page: CTM exposes `referrer_url` (preferred) with `landing_page_url`
 *     as fallback, but the full URL is used without path extraction in the
 *     current top_landing_pages command.
 *   - disposition/tag/VOB: NOT available in CTM API.
 *
 * Nimbata:
 *   - No query client exists (server/nimbataClient.ts does not exist).
 *   - nimbataAccountId field exists in client schema.
 *   - All NormalizedCall fields are UNMAPPED — marked NOT MAPPED above.
 *   - callProvider badge shows "Nimbata" but no data is fetched.
 *
 * VOB / VVOB fields:
 *   - None of the three providers expose a native VOB field via their call APIs.
 *   - CallRail can tag calls with custom tags (e.g. "VOB") — accessible via
 *     tags[].name in the call record. Not currently fetched in callrail_summary.
 *   - CTM has no disposition filtering in the current implementation.
 *   - Nimbata: unknown (no client exists).
 */

export type CallProvider = "callrail" | "ctm" | "nimbata";

export interface NormalizedCall {
  provider: CallProvider;
  callId: string;
  timestamp: string | null;
  duration: number | null;       // seconds
  answered: boolean | null;
  missed: boolean | null;        // null = not determinable from this provider
  qualified: boolean | null;     // null = not mapped for this provider
  sourceName: string | null;
  landingPage: string | null;
  disposition: string | null;    // call_type, custom field, or null
  tags: string[];
  isOrganic: boolean | null;     // null = filter terms not configured
  voicemailFlag: boolean | null;
}

// ─── CallRail normalizer ──────────────────────────────────────────────────────

/**
 * Normalizes a raw CallRail call record (from /v3/a/{acctId}/calls.json).
 * The raw record must be fetched with:
 *   fields=id,start_time,duration,answered,voicemail,source_name,landing_page_url,call_type,tags
 */
export function normalizeCallRailCall(
  raw: Record<string, any>,
  organicSourceTerms: string[]
): NormalizedCall {
  const sourceName: string | null = raw.source_name ?? null;
  const isOrganic =
    organicSourceTerms.length === 0
      ? null
      : organicSourceTerms.some(t =>
          (sourceName ?? "").toLowerCase().includes(t.toLowerCase())
        );

  const tags: string[] = (raw.tags ?? []).map((t: any) =>
    typeof t === "string" ? t : t?.name ?? ""
  ).filter(Boolean);

  return {
    provider: "callrail",
    callId: String(raw.id ?? ""),
    timestamp: raw.start_time ?? null,
    duration: raw.duration != null ? Number(raw.duration) : null,
    answered: raw.answered != null ? Boolean(raw.answered) : null,
    missed:
      raw.answered != null && raw.voicemail != null
        ? !raw.answered && !raw.voicemail
        : null,
    qualified: null, // CallRail has no native "qualified" — would require custom tag/disposition
    sourceName,
    landingPage: raw.landing_page_url
      ? (raw.landing_page_url as string).replace(/^https?:\/\/[^/]+/, "") || "/"
      : null,
    disposition: raw.call_type ?? null,
    tags,
    isOrganic,
    voicemailFlag: raw.voicemail != null ? Boolean(raw.voicemail) : null,
  };
}

/**
 * Aggregate counts from a batch of normalized CallRail calls.
 */
export function aggregateCallRailCalls(calls: NormalizedCall[]): {
  totalCalls: number;
  answeredCount: number;
  missedCount: number;
  voicemailCount: number;
  organicCount: number | null;
  bySource: Record<string, number>;
  byLandingPage: Record<string, number>;
} {
  const bySource: Record<string, number> = {};
  const byLandingPage: Record<string, number> = {};
  let answered = 0;
  let missed = 0;
  let voicemail = 0;
  let organic = 0;
  let organicKnown = false;

  for (const c of calls) {
    if (c.sourceName) bySource[c.sourceName] = (bySource[c.sourceName] ?? 0) + 1;
    if (c.landingPage) byLandingPage[c.landingPage] = (byLandingPage[c.landingPage] ?? 0) + 1;
    if (c.answered === true) answered++;
    if (c.missed === true) missed++;
    if (c.voicemailFlag === true) voicemail++;
    if (c.isOrganic !== null) {
      organicKnown = true;
      if (c.isOrganic) organic++;
    }
  }

  return {
    totalCalls: calls.length,
    answeredCount: answered,
    missedCount: missed,
    voicemailCount: voicemail,
    organicCount: organicKnown ? organic : null,
    bySource,
    byLandingPage,
  };
}

// ─── CTM normalizer ───────────────────────────────────────────────────────────

/**
 * Normalizes a raw CTM call record (from /api/v1/accounts/{id}/calls).
 * The raw record structure from CTM includes:
 *   id, call_at, duration, answered (string "true"/"false"),
 *   traffic_source, source, referrer_url, landing_page_url
 *
 * KNOWN ISSUES:
 *   - answered is a string, not boolean, in CTM API
 *   - missed: CTM has no explicit missed flag; derived as !answered && !voicemail
 *     but voicemail is not exposed in CTM call records
 *   - disposition, tags, VOB: NOT AVAILABLE
 */
export function normalizeCtmCall(
  raw: Record<string, any>,
  organicSourceTerms: string[]
): NormalizedCall {
  const sourceName: string | null = raw.traffic_source ?? raw.source ?? null;
  const isOrganic =
    organicSourceTerms.length === 0
      ? null
      : organicSourceTerms.some(t =>
          (sourceName ?? "").toLowerCase().includes(t.toLowerCase())
        );

  // CTM answered is a string "true" or "false"
  const answeredRaw = raw.answered;
  const answered =
    answeredRaw === true || answeredRaw === "true"
      ? true
      : answeredRaw === false || answeredRaw === "false"
      ? false
      : null;

  const landingRaw: string | null = raw.referrer_url ?? raw.landing_page_url ?? null;
  const landingPage = landingRaw
    ? landingRaw.replace(/^https?:\/\/[^/]+/, "") || "/"
    : null;

  return {
    provider: "ctm",
    callId: String(raw.id ?? ""),
    timestamp: raw.call_at ?? null,
    duration: raw.duration != null ? Number(raw.duration) : null,
    answered,
    missed: answered !== null ? !answered : null, // no voicemail info to be more precise
    qualified: null,
    sourceName,
    landingPage,
    disposition: null, // NOT AVAILABLE in CTM
    tags: [],          // NOT AVAILABLE in CTM
    isOrganic,
    voicemailFlag: null, // NOT AVAILABLE in CTM
  };
}

/**
 * Aggregate counts from normalized CTM calls.
 */
export function aggregateCtmCalls(calls: NormalizedCall[]): {
  totalCalls: number;
  answeredCount: number;
  organicCount: number | null;
  bySource: Record<string, number>;
  byLandingPage: Record<string, number>;
} {
  const bySource: Record<string, number> = {};
  const byLandingPage: Record<string, number> = {};
  let answered = 0;
  let organic = 0;
  let organicKnown = false;

  for (const c of calls) {
    if (c.sourceName) bySource[c.sourceName] = (bySource[c.sourceName] ?? 0) + 1;
    if (c.landingPage) byLandingPage[c.landingPage] = (byLandingPage[c.landingPage] ?? 0) + 1;
    if (c.answered === true) answered++;
    if (c.isOrganic !== null) {
      organicKnown = true;
      if (c.isOrganic) organic++;
    }
  }

  return {
    totalCalls: calls.length,
    answeredCount: answered,
    organicCount: organicKnown ? organic : null,
    bySource,
    byLandingPage,
  };
}

// ─── Provider field coverage matrix ──────────────────────────────────────────

export const CALL_PROVIDER_COVERAGE: Record<CallProvider, Record<keyof NormalizedCall, boolean>> = {
  callrail: {
    provider: true,
    callId: true,
    timestamp: true,
    duration: true,
    answered: true,
    missed: true,        // derived: !answered && !voicemail
    qualified: false,    // requires custom tag or disposition mapping
    sourceName: true,
    landingPage: true,
    disposition: true,   // call_type field
    tags: true,          // tags[].name array
    isOrganic: true,     // derived from sourceName vs callrailOrganicSourceTerms
    voicemailFlag: true,
  },
  ctm: {
    provider: true,
    callId: true,
    timestamp: true,
    duration: true,
    answered: true,      // string "true"/"false" — needs coercion
    missed: true,        // derived: !answered (imprecise, no voicemail signal)
    qualified: false,
    sourceName: true,    // traffic_source ?? source
    landingPage: true,   // referrer_url ?? landing_page_url
    disposition: false,
    tags: false,
    isOrganic: true,     // derived from sourceName vs ctmOrganicSourceTerms
    voicemailFlag: false,
  },
  nimbata: {
    provider: true,
    callId: false,       // NO CLIENT EXISTS
    timestamp: false,
    duration: false,
    answered: false,
    missed: false,
    qualified: false,
    sourceName: false,
    landingPage: false,
    disposition: false,
    tags: false,
    isOrganic: false,
    voicemailFlag: false,
  },
};
