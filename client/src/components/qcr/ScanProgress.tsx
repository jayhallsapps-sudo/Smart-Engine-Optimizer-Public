import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { QcrProgressEvent } from "@/hooks/useQcrJob";

interface ScanProgressProps {
  events: QcrProgressEvent[];
  status: "running" | "completed" | "failed";
  error?: string;
  onBack: () => void;
}

const STEP_ORDER = [
  "load_config",
  "crawl",
  "classify",
  "detect_universal",
  "detect_technical",
  "severity_adjust",
  "persist",
];

const STEP_LABELS: Record<string, string> = {
  load_config: "Loaded client config",
  crawl: "Crawled website",
  classify: "Classified URL page types",
  detect_universal: "Ran universal detectors",
  detect_technical: "Ran technical detectors",
  severity_adjust: "Adjusted severity",
  persist: "Saved report",
};

export function ScanProgress({ events, status, error, onBack }: ScanProgressProps) {
  const startedEvent = events.find((e) => e.type === "started");

  const stepStates = useMemo(() => {
    const states: Record<string, "pending" | "running" | "complete" | "error"> = {};
    for (const step of STEP_ORDER) states[step] = "pending";

    for (const ev of events) {
      if (ev.type === "step_start") states[ev.step] = "running";
      if (ev.type === "step_complete") states[ev.step] = "complete";
    }
    return states;
  }, [events]);

  const completedSteps = Object.values(stepStates).filter((s) => s === "complete").length;
  const totalSteps = STEP_ORDER.length;

  // Estimate progress for the running step
  const runningStep = STEP_ORDER.find((s) => stepStates[s] === "running");
  const progressEvent = runningStep
    ? events.findLast((e) => e.type === "step_progress" && e.step === runningStep)
    : undefined;

  const elapsedMs = useMemo(() => {
    if (!startedEvent) return 0;
    const last = events[events.length - 1];
    const t0 = new Date(startedEvent.jobId ? Date.now() - 0 : Date.now()).getTime();
    // We don't have timestamps in events, so approximate
    return 0;
  }, [events, startedEvent]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
      <div className="w-full max-w-md space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          {startedEvent ? `Scanning ${startedEvent.clientName}` : "Scanning…"}
        </h2>

        <div className="space-y-2">
          {STEP_ORDER.map((step) => {
            const state = stepStates[step];
            const isRunning = state === "running";
            const isComplete = state === "complete";
            const label = STEP_LABELS[step];
            const completeEvent = events.findLast((e) => e.type === "step_complete" && e.step === step) as any;

            return (
              <div key={step} className="flex items-center gap-2 text-xs">
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : isRunning ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className={isComplete ? "text-foreground" : isRunning ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {label}
                </span>
                {completeEvent && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {completeEvent.elapsedMs >= 1000
                      ? `${(completeEvent.elapsedMs / 1000).toFixed(1)}s`
                      : `${completeEvent.elapsedMs}ms`}
                    {completeEvent.findingsCount !== undefined ? ` — ${completeEvent.findingsCount} items` : ""}
                  </span>
                )}
                {isRunning && progressEvent && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {(progressEvent as any).current}/{(progressEvent as any).total}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C0392B] transition-all duration-300"
            style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
          />
        </div>

        {status === "failed" && error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {status === "failed" && (
          <Button variant="outline" className="w-full h-8 text-xs" onClick={onBack}>
            Back to picker
          </Button>
        )}
      </div>
    </div>
  );
}
