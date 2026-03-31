import { db } from "./db";
import { eq, lte, and } from "drizzle-orm";
import { reportSchedules, clients, type ReportSchedule } from "@shared/schema";
import { generateBiweekly } from "./biweeklyGenerator";
import { createSavedReport } from "./savedReportService";
import { postSlackMessage } from "./slack";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Compute next bi-weekly run time from a given base date.
 * Finds the next occurrence of the specified day-of-week at the specified hour
 * in the target timezone, at least 14 days after the base date (bi-weekly cadence).
 */
function computeNextBiweeklyRun(
  recurrenceDay: number,
  recurrenceHour: number,
  timezone: string,
  after: Date
): Date {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const candidate = new Date(after);
  candidate.setMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 60 * 60 * 1000);

  const biweeklyMs = 14 * 24 * 60 * 60 * 1000;
  const minTarget = new Date(after.getTime() + biweeklyMs);

  for (let i = 0; i < 24 * 21; i++) {
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(candidate);

    const tzDay = tzParts.find(p => p.type === "weekday")?.value ?? "";
    const tzHourRaw = tzParts.find(p => p.type === "hour")?.value ?? "0";
    const tzHour = parseInt(tzHourRaw.replace(/\D/g, ""), 10);

    if (
      dayNames[recurrenceDay] === tzDay &&
      tzHour === recurrenceHour &&
      candidate.getTime() >= minTarget.getTime()
    ) {
      return candidate;
    }

    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
  }

  const fallback = new Date(minTarget);
  fallback.setHours(recurrenceHour, 0, 0, 0);
  return fallback;
}

/**
 * Compute the FIRST next run (from now) — used when creating a new schedule.
 * Searches for the next matching day/hour that is at least 1 hour in the future.
 */
export function computeFirstNextRun(
  recurrenceDay: number,
  recurrenceHour: number,
  timezone: string
): Date {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();

  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 60 * 60 * 1000);

  for (let i = 0; i < 24 * 14; i++) {
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(candidate);

    const tzDay = tzParts.find(p => p.type === "weekday")?.value ?? "";
    const tzHourRaw = tzParts.find(p => p.type === "hour")?.value ?? "0";
    const tzHour = parseInt(tzHourRaw.replace(/\D/g, ""), 10);

    if (dayNames[recurrenceDay] === tzDay && tzHour === recurrenceHour) {
      return candidate;
    }

    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(recurrenceHour, 0, 0, 0);
  return fallback;
}

async function runSchedule(schedule: ReportSchedule): Promise<void> {
  const [client] = await db.select().from(clients).where(eq(clients.id, schedule.clientId));
  if (!client) {
    console.error(`[Scheduler] Client ${schedule.clientId} not found for schedule ${schedule.id}`);
    return;
  }

  const today = new Date();
  const endDate = toDateString(today);
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 14);
  const startDate = toDateString(startDay);

  console.log(`[Scheduler] Generating bi-weekly report for client "${client.name}" (schedule ${schedule.id})`);

  let reportJson: any;
  try {
    reportJson = await generateBiweekly({
      clientId: client.id,
      startDate,
      endDate,
      preparedBy: "SmartEO Scheduler",
    });
  } catch (err: any) {
    console.error(`[Scheduler] Report generation failed for schedule ${schedule.id}:`, err.message);
    throw err;
  }

  const dateStr = toDateString(today);
  const reportName = `${client.name}-${dateStr}`;

  const saved = await createSavedReport({
    clientId: client.id,
    reportType: "biweekly",
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
    const reportLink = `${appUrl}/biweekly?client=${client.id}&load=${saved.id}`;
    const message = `📋 Bi-weekly report for ${client.name} is ready for review. ${reportLink}`;
    try {
      await postSlackMessage(client.slackChannelId, message);
      console.log(`[Scheduler] Slack notification sent to ${client.slackChannelId} for client "${client.name}"`);
    } catch (err: any) {
      console.error(`[Scheduler] Slack notification failed for schedule ${schedule.id}:`, err.message);
    }
  } else {
    console.log(`[Scheduler] No Slack channel configured for client "${client.name}" — skipping notification`);
  }

  const nextRun = computeNextBiweeklyRun(
    schedule.recurrenceDay,
    schedule.recurrenceHour,
    schedule.timezone,
    new Date()
  );

  await db
    .update(reportSchedules)
    .set({
      lastRunAt: new Date(),
      nextRunAt: nextRun,
      updatedAt: new Date(),
    })
    .where(eq(reportSchedules.id, schedule.id));

  console.log(`[Scheduler] Schedule ${schedule.id} next run: ${nextRun.toISOString()}`);
}

export function startReportScheduler(): void {
  console.log("[Scheduler] Report scheduler started — checking every minute");

  setInterval(async () => {
    try {
      const due = await db
        .select()
        .from(reportSchedules)
        .where(
          and(
            eq(reportSchedules.enabled, true),
            lte(reportSchedules.nextRunAt, new Date())
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
