import { Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { SaveStatus } from "@/hooks/useReportSave";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === "saved") {
    return (
      <span
        data-testid="save-status-indicator"
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium"
      >
        <CheckCircle2 className="w-3 h-3" />
        Saved
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span
        data-testid="save-status-indicator"
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving...
      </span>
    );
  }

  if (status === "unsaved") {
    return (
      <span
        data-testid="save-status-indicator"
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"
      >
        <Clock className="w-3 h-3" />
        Unsaved changes
      </span>
    );
  }

  return (
    <span
      data-testid="save-status-indicator"
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
    >
      <AlertCircle className="w-3 h-3" />
      Save failed
    </span>
  );
}
