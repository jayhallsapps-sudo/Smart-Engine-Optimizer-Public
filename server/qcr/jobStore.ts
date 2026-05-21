import { randomUUID } from "crypto";
import type { JobState, QcrProgressEvent, QcrReport } from "./types";

const jobs = new Map<string, JobState>();

export function createJob(clientId: number): JobState {
  const jobId = randomUUID();
  const job: JobState = {
    jobId,
    clientId,
    status: "running",
    startedAt: new Date().toISOString(),
    events: [],
    subscribers: new Set(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): JobState | undefined {
  return jobs.get(jobId);
}

export function appendEvent(jobId: string, event: QcrProgressEvent): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
  job.subscribers.forEach((cb) => {
    try {
      cb(event);
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeToJob(
  jobId: string,
  onEvent: (e: QcrProgressEvent) => void,
): () => void {
  const job = jobs.get(jobId);
  if (!job) {
    // Return no-op if job not found
    return () => {};
  }
  // Replay buffered events synchronously
  for (const ev of job.events) {
    try {
      onEvent(ev);
    } catch {
      // ignore
    }
  }
  job.subscribers.add(onEvent);
  return () => {
    job.subscribers.delete(onEvent);
  };
}

export function markJobCompleted(jobId: string, result: QcrReport, savedReportId: number): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "completed";
  job.completedAt = new Date().toISOString();
  job.result = result;
  job.savedReportId = savedReportId;
}

export function markJobFailed(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.error = error;
}

export function startJobCleanup(intervalMs = 60 * 60 * 1000): void {
  setInterval(() => {
    const cutoff = Date.now() - intervalMs;
    jobs.forEach((job, id) => {
      const started = new Date(job.startedAt).getTime();
      if (started < cutoff) {
        jobs.delete(id);
      }
    });
  }, intervalMs);
}
