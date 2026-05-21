import { useState, useEffect, useRef, useCallback } from "react";

export type QcrProgressEvent =
  | { type: "started"; jobId: string; clientId: number; clientName: string }
  | { type: "step_start"; step: string; label: string }
  | { type: "step_progress"; step: string; current: number; total: number }
  | { type: "step_complete"; step: string; elapsedMs: number; findingsCount?: number }
  | { type: "integration_skipped"; integration: string; reason: string }
  | { type: "completed"; jobId: string; reportSummary: { totalFindings: number; byCategory: Record<string, number> } }
  | { type: "error"; message: string };

export function useQcrJob(jobId: string | null) {
  const [events, setEvents] = useState<QcrProgressEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [error, setError] = useState<string>();
  const esRef = useRef<EventSource | null>(null);

  // Reset state whenever jobId changes
  useEffect(() => {
    if (!jobId) {
      setEvents([]);
      setStatus("idle");
      setError(undefined);
      return;
    }
    setEvents([]);
    setStatus("running");
    setError(undefined);
  }, [jobId]);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  const connect = useCallback(() => {
    if (!jobId) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/qcr/scan/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as QcrProgressEvent;
        setEvents((prev) => [...prev, event]);
        if (event.type === "started") setStatus("running");
        if (event.type === "completed") setStatus("completed");
        if (event.type === "error") {
          setStatus("failed");
          setError(event.message);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (status === "completed" || status === "failed") {
        es.close();
      }
    };
  }, [jobId, status]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { events, status, latestEvent, error };
}
