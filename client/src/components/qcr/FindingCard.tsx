import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ExternalLink, Send } from "lucide-react";

interface FindingCardProps {
  finding: any;
  onPushAsana: (finding: any) => void;
}

export function FindingCard({ finding, onPushAsana }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAllUrls, setShowAllUrls] = useState(false);

  const severityColor =
    finding.severity === "critical"
      ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
      : finding.severity === "medium"
        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
        : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800";

  const urlsToShow = showAllUrls ? finding.affectedUrls : finding.affectedUrls.slice(0, 5);

  return (
    <div
      className={`rounded-lg border bg-card p-3 space-y-2 ${finding.suppressed ? "opacity-60" : ""}`}
      data-testid={`finding-card-${finding.id}`}
    >
      <div className="flex items-start gap-2">
        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${severityColor}`}>
          {finding.severity}
        </Badge>
        <span className="text-xs font-semibold leading-tight">{finding.title}</span>
      </div>

      {expanded && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">{finding.description}</p>
      )}

      <div className="text-[10px] text-muted-foreground">
        Affected: {finding.affectedUrls.length} URL{finding.affectedUrls.length !== 1 ? "s" : ""}
        {finding.affectedUrls.length > 0 && (
          <button
            className="ml-1 underline hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {expanded && urlsToShow.length > 0 && (
        <ul className="space-y-0.5 pl-1">
          {urlsToShow.map((url: string) => (
            <li key={url} className="text-[10px] text-muted-foreground truncate">
              • {url}
            </li>
          ))}
          {finding.affectedUrls.length > 5 && !showAllUrls && (
            <li>
              <button
                className="text-[10px] underline hover:text-foreground"
                onClick={() => setShowAllUrls(true)}
              >
                Show all {finding.affectedUrls.length} URLs
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="flex justify-end">
        {finding.asanaTaskId ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => window.open(finding.asanaTaskUrl, "_blank")}
            data-testid={`button-view-asana-${finding.id}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View in Asana
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => onPushAsana(finding)}
            data-testid={`button-push-asana-${finding.id}`}
          >
            <Send className="w-3 h-3 mr-1" />
            Send to Asana
          </Button>
        )}
      </div>
    </div>
  );
}
