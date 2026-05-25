/**
 * client/src/components/ScheduleFormFields.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared schedule create/edit form, extracted from admin-schedules.tsx so that
 * both the global Admin Schedules page AND the per-client Scheduling tab can
 * reuse the same UI without drift.
 *
 * This file is the single source of truth for:
 *   - Schedule frequency / cadence options
 *   - The form state shape and its default values
 *   - The form JSX (ScheduleFormFields component)
 *   - The payload builder that converts form state → API request body
 *
 * The "ScheduleForm" component in admin-schedules.tsx used to live inline.
 * It has been moved here unchanged in behavior, then extended with one extra
 * prop: `availableReportTypes` (so callers can constrain which report types
 * the dropdown shows — the per-client tab uses this to limit the type to one
 * value while admin-schedules shows the full list).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Client } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEK_ORDINALS = [
  { value: "1", label: "1st" },
  { value: "2", label: "2nd" },
  { value: "3", label: "3rd" },
  { value: "4", label: "4th" },
  { value: "5", label: "Last" },
];

export const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];

/**
 * All report types that can be scheduled. The per-client Scheduling tab uses
 * this to render one row per report type. The admin-schedules page passes a
 * subset (just biweekly + monthly) since those are the only ones with full
 * end-to-end automation today, but all are supported by the API.
 */
export const ALL_REPORT_TYPES: { value: string; label: string }[] = [
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "qbr_prep", label: "QBR Prep" },
  { value: "qbr_full", label: "QBR Full" },
  { value: "mid_strategy", label: "Mid-Strategy Check-In" },
  { value: "qcr", label: "Quarterly Content Roadmap" },
  { value: "discoverability", label: "Discoverability" },
];

// ─── Form state ───────────────────────────────────────────────────────────────

export type ScheduleFormState = {
  clientId: string;
  reportType: string;
  frequency: string;
  recurrenceType: string;       // dayofweek | dayofmonth | nthweekday
  recurrenceDay: string;        // 0-6 weekday (Sun-Sat)
  recurrenceWeekOfMonth: string; // 1-5
  recurrenceDayOfMonth: string;  // 1-28
  recurrenceHour: string;
  timezone: string;
};

export const defaultScheduleForm: ScheduleFormState = {
  clientId: "",
  reportType: "biweekly",
  frequency: "biweekly",
  recurrenceType: "dayofweek",
  recurrenceDay: "1",
  recurrenceWeekOfMonth: "1",
  recurrenceDayOfMonth: "1",
  recurrenceHour: "8",
  timezone: "America/New_York",
};

// ─── Helpers (also exported so both pages can use them) ──────────────────────

export function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

export function ordinalLabel(n: number): string {
  return WEEK_ORDINALS.find(w => w.value === String(n))?.label ?? String(n);
}

export function freqBadgeLabel(freq: string): string {
  return FREQUENCIES.find(f => f.value === freq)?.label ?? freq;
}

export function reportTypeLabel(rt: string): string {
  return ALL_REPORT_TYPES.find(t => t.value === rt)?.label ?? rt;
}

export function formatDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/**
 * Human-readable description of a schedule's cadence. Used in list rows.
 * Accepts a partial schedule (only the cadence fields are required).
 */
export function describeSchedule(s: {
  frequency: string;
  recurrenceDay: number;
  recurrenceHour: number;
  recurrenceWeekOfMonth: number | null;
  recurrenceDayOfMonth: number | null;
  timezone: string;
}): string {
  const freq = s.frequency ?? "biweekly";
  const time = formatHour(s.recurrenceHour);
  const tz = s.timezone.replace("America/", "").replace("_", " ");

  if (freq === "weekly") {
    return `Every ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
  }
  if (freq === "biweekly") {
    return `Every other ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
  }
  if (freq === "monthly" || freq === "quarterly") {
    const period = freq === "monthly" ? "month" : "quarter";
    if (s.recurrenceWeekOfMonth != null) {
      return `${ordinalLabel(s.recurrenceWeekOfMonth)} ${DAY_NAMES[s.recurrenceDay]} of every ${period} at ${time} (${tz})`;
    }
    if (s.recurrenceDayOfMonth != null) {
      return `Day ${s.recurrenceDayOfMonth} of every ${period} at ${time} (${tz})`;
    }
  }
  return `Every ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
}

/**
 * Build the POST/PATCH payload from form state.
 * When `clientId` is passed explicitly (per-client tab usage), it overrides
 * whatever is in the form. When omitted, form.clientId is used.
 */
export function buildSchedulePayload(form: ScheduleFormState, clientIdOverride?: number) {
  const needsMonthly = form.frequency === "monthly" || form.frequency === "quarterly";
  return {
    clientId: clientIdOverride ?? Number(form.clientId),
    reportType: form.reportType,
    frequency: form.frequency,
    recurrenceDay: Number(form.recurrenceDay),
    recurrenceHour: Number(form.recurrenceHour),
    timezone: form.timezone,
    recurrenceWeekOfMonth: needsMonthly && form.recurrenceType === "nthweekday"
      ? Number(form.recurrenceWeekOfMonth)
      : null,
    recurrenceDayOfMonth: needsMonthly && form.recurrenceType === "dayofmonth"
      ? Number(form.recurrenceDayOfMonth)
      : null,
    enabled: true,
  };
}

// ─── ScheduleFormFields component ────────────────────────────────────────────

/**
 * Renders the cadence-and-timing form. Pure: takes form state + setter,
 * renders inputs. Pages decide where to put it (dialog, inline panel, etc.).
 *
 * Props:
 *   - form / setForm: standard controlled-form pattern
 *   - clients: needed if showClientSelect is true
 *   - showClientSelect: hides the client dropdown when caller already knows
 *     the client (e.g. the per-client Scheduling tab)
 *   - reportTypes: which report types the dropdown shows. Defaults to all.
 *     Pass a 1-item array to lock the form to a specific type.
 *   - lockReportType: if true, the report-type dropdown is disabled
 *     (used when editing an existing schedule, where the type shouldn't change)
 */
export function ScheduleFormFields({
  form,
  setForm,
  clients,
  showClientSelect = true,
  reportTypes = ALL_REPORT_TYPES,
  lockReportType = false,
}: {
  form: ScheduleFormState;
  setForm: React.Dispatch<React.SetStateAction<ScheduleFormState>>;
  clients: Client[];
  showClientSelect?: boolean;
  reportTypes?: { value: string; label: string }[];
  lockReportType?: boolean;
}) {
  const update = (key: keyof ScheduleFormState, val: string) => setForm(f => ({ ...f, [key]: val }));
  const needsMonthly = form.frequency === "monthly" || form.frequency === "quarterly";

  return (
    <div className="space-y-3">
      {showClientSelect && (
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <Select value={form.clientId} onValueChange={v => update("clientId", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-client">
              <SelectValue placeholder="Select a client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Report Type</Label>
        <Select value={form.reportType} onValueChange={v => update("reportType", v)} disabled={lockReportType}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-report-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reportTypes.map(rt => (
              <SelectItem key={rt.value} value={rt.value} className="text-xs">{rt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Frequency</Label>
        <Select value={form.frequency} onValueChange={v => update("frequency", v)}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map(f => (
              <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsMonthly && (
        <div className="space-y-1.5">
          <Label className="text-xs">Recurrence type</Label>
          <Select value={form.recurrenceType} onValueChange={v => update("recurrenceType", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nthweekday" className="text-xs">Nth weekday (e.g. 3rd Thursday)</SelectItem>
              <SelectItem value="dayofmonth" className="text-xs">Specific day of month (e.g. 15th)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {needsMonthly && form.recurrenceType === "nthweekday" && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Which week</Label>
            <Select value={form.recurrenceWeekOfMonth} onValueChange={v => update("recurrenceWeekOfMonth", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-week-of-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_ORDINALS.map(w => (
                  <SelectItem key={w.value} value={w.value} className="text-xs">{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Weekday</Label>
            <Select value={form.recurrenceDay} onValueChange={v => update("recurrenceDay", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {needsMonthly && form.recurrenceType === "dayofmonth" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Day of month (1–28)</Label>
          <Select value={form.recurrenceDayOfMonth} onValueChange={v => update("recurrenceDayOfMonth", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-day-of-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!needsMonthly && (
        <div className="space-y-1.5">
          <Label className="text-xs">Day of week</Label>
          <Select value={form.recurrenceDay} onValueChange={v => update("recurrenceDay", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-day">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((d, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Time</Label>
          <Select value={form.recurrenceHour} onValueChange={v => update("recurrenceHour", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">{formatHour(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Timezone</Label>
          <Select value={form.timezone} onValueChange={v => update("timezone", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz} value={tz} className="text-xs">{tz.replace("America/", "").replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
