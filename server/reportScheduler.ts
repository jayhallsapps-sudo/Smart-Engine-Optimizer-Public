import { db } from "./db";
import { eq, lte, and, isNull, or, lt } from "drizzle-orm";
import { reportSchedules, clients, type ReportSchedule } from "@shared/schema";
import { generateBiweekly } from "./biweeklyGenerator";
import { generateMonthly } from "./monthlyGenerator";
import { createSavedReport } from "./savedReportService";
import { postSlackMessage } from "./slack";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Date math helpers ────────────────────────────────────────────────────────

/**
 * Return the calendar day (1-31) for the Nth weekday of a given month.
 * weekday: 0=Sun…6=Sat  |  n: 1=first…4=fourth, 5=last
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun…6=Sat
  const diff = (weekday - firstDay + 7) % 7;
  const firstOccurrence = 1 + diff;
  if (n === 5) {
    // "last" occurrence
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let day = firstOccurrence;
    while (day + 7 <= daysInMonth) day += 7;
    return day;
  }
  return firstOccurrence + (n - 1) * 7;
}

/**
 * Get the local hour in a given timezone for a UTC Date.
 */
function localHour(date: Date, timezone: string): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(raw.replace(/\D/g, ""), 10) % 24;
}

/**
 * Get the local day-of-week (0=Sun…6=Sat) in a given timezone for a UTC Date.
 */
function localDayOfWeek(date: Date, timezone: string): number {
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return SHORT.indexOf(raw);
}

/**
 * Get local {year, month (0-based), day} in a given timezone for a UTC Date.
 */
function localYMD(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/**
 * Build a UTC Date for year/month/day at recurrenceHour in the given timezone.
 * Uses binary-search approach: start at local noon, walk backward/forward by
 * hours until the local date/hour matches.
 */
function utcForLocalDateTime(
  year: number,
  month: number, // 0-based
  day: number,
  hour: number,
  timezone: string
): Date {
  // Approximate UTC offset (good enough for iterating ±2h)
  const approx = new Date(Date.UTC(year, month, day, hour));
  for (let delta = -14 * 60; delta <= 14 * 60; delta += 60) {
    const candidate = new Date(approx.getTime() + delta * 60 * 1000);
    const lh = localHour(candidate, timezone);
    const { year: ly, month: lm, day: ld } = localYMD(candidate, timezone);
    if (ly === year && lm === month && ld === day && lh === hour) {
      return candidate;
    }
  }
  // fallback
  return approx;
}

// ─── Compute next run ─────────────────────────────────────────────────────────

/**
 * Compute the next run timestamp for a schedule, after `after`.
 * Supports weekly, biweekly, monthly, quarterly with nth-weekday-of-month
 * or specific-day-of-month options.
 */
export function computeNextRun(schedule: ReportSchedule, after: Date): Date {
  const {
    frequency,
    recurrenceDay,
    recurrenceHour,
    timezone,
    recurrenceWeekOfMonth,
    recurrenceDayOfMonth,
  } = schedule;

  const freq = frequency ?? "biweekly";

  // ── Weekly / Bi-weekly ────────────────────────────────────────────────────
  if (freq === "weekly" || freq === "biweekly") {
    const intervalDays = freq === "weekly" ? 7 : 14;
    const minTarget = new Date(after.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    // Walk hourly from minTarget, find first matching day/hour in timezone
    const candidate = new Date(minTarget);
    candidate.setMinutes(0, 0, 0);
    for (let i = 0; i < 24 * (intervalDays + 7); i++) {
      if (localDayOfWeek(candidate, timezone) === recurrenceDay && localHour(candidate, timezone) === recurrenceHour) {
        return candidate;
      }
      candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
    }
    return minTarget;
  }

  // ── Monthly ───────────────────────────────────────────────────────────────
  if (freq === "monthly") {
    // Try current month first, then iterate up to 12 months forward
    const start = localYMD(after, timezone);
    for (let m = 0; m <= 12; m++) {
      const month = (start.month + m) % 12;
      const year = start.year + Math.floor((start.month + m) / 12);

      const targetDay = recurrenceWeekOfMonth != null
        ? nthWeekdayOfMonth(year, month, recurrenceDay, recurrenceWeekOfMonth)
        : (recurrenceDayOfMonth ?? 1);

      // Clamp to days in month
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInMonth);

      const candidate = utcForLocalDateTime(year, month, clampedDay, recurrenceHour, timezone);
      if (candidate.getTime() > after.getTime()) {
        return candidate;
      }
    }
  }

  // ── Quarterly ────────────────────────────────────────────────────────────
  if (freq === "quarterly") {
    // Quarter start months: 0 (Jan), 3 (Apr), 6 (Jul), 9 (Oct)
    const quarterStarts = [0, 3, 6, 9];
    const start = localYMD(after, timezone);

    // Check up to 5 upcoming quarters
    for (let q = 0; q < 5; q++) {
      const currentQuarterIdx = Math.floor(start.month / 3);
      const quarterIdx = (currentQuarterIdx + q) % 4;
      const yearOffset = Math.floor((currentQuarterIdx + q) / 4);
      const year = start.year + yearOffset;
      const month = quarterStarts[quarterIdx];

      const targetDay = recurrenceWeekOfMonth != null
        ? nthWeekdayOfMonth(year, month, recurrenceDay, recurrenceWeekOfMonth)
        : (recurrenceDayOfMonth ?? 1);

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInMonth);

      const candidate = utcForLocalDateTime(year, month, clampedDay, recurrenceHour, timezone);
      if (candidate.getTime() > after.getTime()) {
        return candidate;
      }
    }
  }

  // Fallback
  return new Date(after.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Compute the FIRST next run (from now) — used when creating a new schedule.
 * Searches for the next matching time at least 1 hour in the future.
 */
export function computeFirstNextRun(schedule: ReportSchedule): Date {
  const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
  return computeNextRun(schedule, oneHourLater);
}

// ─── Run a schedule ───────────────────────────────────────────────────────────

async function runSchedule(schedule: ReportSchedule): Promise<void> {
  // ── Fix 4: DB-level concurrency lock ──────────────────────────────────────
  // Claim the lock — skip if another process is already running this schedule.
  const result = await db
    .update(reportSchedules)
    .set({ runningStartedAt: new Date() })
    .where(
      and(
        eq(reportSchedules.id, schedule.id),
        or(
          isNull(reportSchedules.runningStartedAt),
          lt(reportSchedules.runningStartedAt, new Date(Date.now() - 10 * 60 * 1000))
        )
      )
    )
    .returning({ id: reportSchedules.id });

  if (result.length === 0) {
    console.log(`[Scheduler] Schedule ${schedule.id} is already running — skipping`);
    return;
  }

  try {
    const [client] = await db.select().from(clients).where(eq(clients.id, schedule.clientId));
    if (!client) {
      console.error(`[Scheduler] Client ${schedule.clientId} not found for schedule ${schedule.id}`);
      return;
    }

    const today = new Date();
    const reportType = schedule.reportType ?? "biweekly";
    console.log(`[Scheduler] Generating ${reportType} report for client "${client.name}" (schedule ${schedule.id})`);

    let reportJson: any;

    if (reportType === "biweekly") {
      const endDate = toDateString(today);
      const startDay = new Date(today);
      startDay.setDate(startDay.getDate() - 14);
      const startDate = toDateString(startDay);
      reportJson = await generateBiweekly({
        clientId: client.id,
        startDate,
        endDate,
        preparedBy: "SmartEO Scheduler",
      });
    } else if (reportType === "monthly") {
      reportJson = await generateMonthly({
        clientId: client.id,
        month: today.getMonth() + 1,
        year: today.getFullYear(),
        timezone: schedule.timezone,
      });
    } else {
      console.error(`[Scheduler] Unknown reportType "${reportType}" for schedule ${schedule.id} — skipping`);
      return;
    }

    const dateStr = toDateString(today);
    const reportName = `${client.name}-${dateStr}`;

    const endDate = toDateString(today);
    const startDay = new Date(today);
    startDay.setDate(startDay.getDate() - (reportType === "monthly" ? 30 : 14));
    const startDate = toDateString(startDay);

    const saved = await createSavedReport({
      clientId: client.id,
      reportType,
      reportName,
      analysisWindowStart: startDate,
      analysisWindowEnd: endDate,
      generatedOn: dateStr,
      generatedReportJson: reportJson,
      isScheduled: true,
      scheduleId: schedule.id,
    });

    console.log(`[Scheduler] Saved report ${saved.id} — "${reportName}"`);

    if (client.slackChannelId) {
      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.APP_URL ?? "";
      const pageMap: Record<string, string> = { biweekly: "biweekly", monthly: "monthly" };
      const page = pageMap[reportType] ?? "biweekly";
      const reportLink = `${appUrl}/${page}?client=${client.id}&load=${saved.id}`;
      const label = reportType.charAt(0).toUpperCase() + reportType.slice(1);
      const message = `📋 ${label} report for ${client.name} is ready for review. ${reportLink}`;
      try {
        await postSlackMessage(client.slackChannelId, message);
        console.log(`[Scheduler] Slack notification sent to ${client.slackChannelId} for client "${client.name}"`);
      } catch (err: any) {
        console.error(`[Scheduler] Slack notification failed for schedule ${schedule.id}:`, err.message);
      }
    } else {
      console.log(`[Scheduler] No Slack channel configured for client "${client.name}" — skipping notification`);
    }

    const nextRun = computeNextRun(schedule, new Date());

    await db
      .update(reportSchedules)
      .set({ lastRunAt: new Date(), nextRunAt: nextRun, updatedAt: new Date() })
      .where(eq(reportSchedules.id, schedule.id));

    console.log(`[Scheduler] Schedule ${schedule.id} next run: ${nextRun.toISOString()}`);
  } finally {
    // Release the lock regardless of success or failure.
    await db
      .update(reportSchedules)
      .set({ runningStartedAt: null })
      .where(eq(reportSchedules.id, schedule.id));
  }
}

export async function triggerScheduleNow(scheduleId: number): Promise<{ reportName: string }> {
  const [schedule] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, scheduleId));
  if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);
  await runSchedule(schedule);
  const dateStr = toDateString(new Date());
  const [client] = await db.select().from(clients).where(eq(clients.id, schedule.clientId));
  return { reportName: `${client?.name ?? "Unknown"}-${dateStr}` };
}

export function startReportScheduler(): void {
  console.log("[Scheduler] Report scheduler started — checking every minute");

  setInterval(async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const due = await db
        .select()
        .from(reportSchedules)
        .where(
          and(
            eq(reportSchedules.enabled, true),
            lte(reportSchedules.nextRunAt, new Date()),
            or(
              isNull(reportSchedules.runningStartedAt),
              lt(reportSchedules.runningStartedAt, tenMinutesAgo)
            )
          )
        );

      if (due.length === 0) return;

      console.log(`[Scheduler] ${due.length} schedule(s) due to run`);

      for (const schedule of due) {
        try {
          await runSchedule(schedule);
        } catch (err: any) {
          console.error(`[Scheduler] Error running schedule ${schedule.id}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[Scheduler] Interval error:", err.message);
    }
  }, 60_000);
}
